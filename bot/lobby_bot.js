const { OperationCode, EventCode, ParameterCode } = require('../protocol_reader/constants');
const { OperationRequest, OperationResponse, Event } = require('../protocol_reader/types/packets');
const { GameListItem } = require('../typed_wrappers/game_list_item');
const { ConnectionCredentials } = require('./connection_details');
const { GameSocket } = require('./gamesocket');
const { EventEmitter } = require('events');
const { SizedInt } = require('../protocol_reader/types/SizedInt');

class LobbyBot {
  constructor() {
    this.games = new Map();
    this._gamesEmitter = new EventEmitter();
    this._newGamesEmitter = new EventEmitter();
    this.gamesStream = this._gamesEmitter;
    this.newGamesStream = this._newGamesEmitter;
    this._lobbySocket = null;
  }

  async connectLobby() {
    console.log('joining lobby....');
    console.log('Created game socket!');
    const credentials = await this._getLobbyCredentials();
    console.log('Got lobby credentials:', credentials);
    await this._connectLobby(credentials);
  }

  async _getLobbyCredentials() {
    console.log('Getting lobby credentials...');
    const socket = new GameSocket(new ConnectionCredentials(`ws://${GameSocket.endpointHost}:${GameSocket.httpPort}`));
    await socket.connect();
    return new Promise((resolve) => {
      socket.packets.on('data', (p) => {
        console.log('data recieved (lobby_bot.js)', p);
        if (p instanceof OperationResponse && p.code === OperationCode.Authenticate) {
          console.log('got lobby credentials. connecting to lobby');
          const credentials = new ConnectionCredentials(p.params[ParameterCode.Address], p.params[ParameterCode.Secret]);
          socket.close();
          resolve(credentials);
        }
      });
    });
  }

  async _connectLobby(credentials) {
    console.log(`Connecting to ${credentials.host} ${credentials.port}`);
    this._lobbySocket = new GameSocket(credentials);
    await this._lobbySocket.connect();
    let joinedLobby = false;
    this._lobbySocket.packets.on('data', async (parsed) => {
      console.log('Lobby packet:', parsed);
      if (parsed instanceof OperationResponse && parsed.code === OperationCode.Authenticate && !joinedLobby) {
        console.log('Connected to lobby.');
        console.log('Sending JoinLobby request...');
        await this._lobbySocket.add(new OperationRequest(OperationCode.JoinLobby, {
          [ParameterCode.LobbyName]: "default",
          [ParameterCode.LobbyType]: new SizedInt(0, 1),
        }));
        joinedLobby = true;
      } else if (parsed instanceof Event && (parsed.code === EventCode.GameList || parsed.code === EventCode.GameListUpdate)) {
        console.log('Processing game list event...');
        const map = parsed.params[ParameterCode.GameList] || {};
        for (const [key, value] of Object.entries(map)) {
          if (value[new SizedInt(251, 1)]) {
            this.games.delete(key);
          } else {
            const item = GameListItem.fromMap(key, value);
            if (!this.games.has(key)) this._newGamesEmitter.emit('data', item);
            this._gamesEmitter.emit('data', item);
            this.games.set(key, item);
          }
        }
      }
    });
    this._lobbySocket.packets.on('disconnect', () => {
      console.log('Disconnected from lobby by server');
      this._lobbySocket = null; // Reset socket for potential reconnect because of random disconnects (not really needed since I added handlers for that)
    });
  }

  async disconnectLobby() {
    if (this._lobbySocket) {
      await this._lobbySocket.close();
      console.log('Lobby disconnected');
    }
  }

  async getRoomCredentials(roomId) {
    let joinGamePacket;
    await new Promise(async (resolve) => {
      console.log(`Sending JoinGame request for roomId: ${roomId}`);
      await this._lobbySocket.add(new OperationRequest(OperationCode.JoinGame, { [ParameterCode.RoomName]: roomId }));
      this._lobbySocket.packets.once('data', (packet) => {
        console.log('JoinGame response:', packet);
        if (packet instanceof OperationResponse && packet.code === OperationCode.JoinGame) {
          joinGamePacket = packet;
          resolve();
        }
      });
    });

    if (joinGamePacket.returnCode !== 0) {
      throw new Error(`Error during game join: ${joinGamePacket.debugMessage} (${joinGamePacket.returnCode})`);
    }
    return new ConnectionCredentials(
      joinGamePacket.params[ParameterCode.Address],
      joinGamePacket.params[ParameterCode.Secret],
      roomId
    );
  }

  async createMatch() {
    let joinGamePacket;
    await new Promise(async (resolve) => {
      console.log('Sending CreateGame request');
      await this._lobbySocket.add(new OperationRequest(OperationCode.CreateGame, {}));
      this._lobbySocket.packets.once('data', (packet) => {
        console.log('CreateGame response:', packet);
        if (packet instanceof OperationResponse && packet.code === OperationCode.CreateGame) {
          joinGamePacket = packet;
          resolve();
        }
      });
    });

    if (joinGamePacket.returnCode !== 0) {
      throw new Error(`Error during game join: ${joinGamePacket.debugMessage} (${joinGamePacket.returnCode})`);
    }
    return new ConnectionCredentials(
      joinGamePacket.params[ParameterCode.Address],
      joinGamePacket.params[ParameterCode.Secret],
      joinGamePacket.params[ParameterCode.RoomName]
    );
  }
}

module.exports = { LobbyBot };
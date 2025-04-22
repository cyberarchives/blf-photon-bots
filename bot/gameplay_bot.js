const { OperationCode, EventCode, ParameterCode } = require('../protocol_reader/constants');
const { OperationRequest, Event } = require('../protocol_reader/types/packets');
const { GameProperties } = require('../typed_wrappers/game_properties');
const { PlayerProperties } = require('../typed_wrappers/player_properties');
const { SizedInt } = require('../protocol_reader/types/SizedInt');
const { ConnectionCredentials } = require('./connection_details');
const { GameSocket } = require('./gamesocket');

class GameplayBot {
  constructor() {
    this._matchSocket = null;
    this._ourActorNr = null;
    this._ourPlayer = PlayerProperties.initial();
    this._otherPlayers = new Map();
    this._gameProps = null;
  }

  get ourActorId() {
    return this._ourActorNr * 1000 + 1;
  }

  async connectMatch(credentials, newGameProps = null) {
    if (!credentials.hasSecret || !credentials.hasRoomId) {
      throw new Error('Credentials must have secret and roomId');
    }

    this._matchSocket = new GameSocket(credentials);
    this._matchSocket.packets.on('data', async (parsed) => {
        console.log("recieved packet (gameplay_bot.js)", parsed)
      if (parsed instanceof OperationRequest && parsed.code === OperationCode.Authenticate) {
        console.log('auth');
        if (newGameProps) {
          await this._matchSocket.add(new OperationRequest(OperationCode.CreateGame, {
            [ParameterCode.RoomName]: credentials.roomId,
            [ParameterCode.PlayerProperties]: { [new SizedInt(255, 1)]: '' },
            [ParameterCode.Broadcast]: true,
            [ParameterCode.GameProperties]: newGameProps.toMap(),
            [ParameterCode.CleanupCacheOnLeave]: true,
          }));
        } else {
          await this._matchSocket.add(new OperationRequest(OperationCode.JoinGame, {
            [ParameterCode.RoomName]: credentials.roomId,
            [ParameterCode.Broadcast]: true,
            [ParameterCode.PlayerProperties]: this._ourPlayer.toMap(),
          }));
        }
      } else if (parsed instanceof OperationRequest && parsed.code === OperationCode.CreateGame) {
        this._ourActorNr = parsed.params[ParameterCode.ActorNr].value;
        this._gameProps = GameProperties.fromMap(parsed.params[ParameterCode.GameProperties]);
      } else if (parsed instanceof OperationRequest && parsed.code === OperationCode.JoinGame) {
        this._ourActorNr = parsed.params[ParameterCode.ActorNr].value;
        const playerPropsMap = parsed.params[ParameterCode.PlayerProperties];
        this._otherPlayers = new Map(
          Object.entries(playerPropsMap).map(([k, v]) => [parseInt(k.value), PlayerProperties.fromMap(v)])
        );
        this._gameProps = GameProperties.fromMap(parsed.params[ParameterCode.GameProperties]);
      } else if (parsed instanceof Event && parsed.code === EventCode.Join) {
        const myActorId = parsed.params[ParameterCode.ActorNr].value;
        await this._matchSocket.add(new OperationRequest(OperationCode.RaiseEvent, {
          [ParameterCode.Code]: new SizedInt(202, 1),
          [ParameterCode.Cache]: new SizedInt(4, 1),
          [ParameterCode.Data]: {
            [new SizedInt(0, 1)]: 'PlayerBody',
            [new SizedInt(6, 1)]: new SizedInt(-41875289, 4), // ???? THIS MIGHT CRASH OTHER CLIENTS :P
            [new SizedInt(7, 1)]: new SizedInt(myActorId * 1000 + 1, 4),
          },
        }));
        await this._matchSocket.add(new OperationRequest(OperationCode.SetProperties, {
          [ParameterCode.ActorNr]: new SizedInt(myActorId, 4),
          [ParameterCode.Broadcast]: true,
          [ParameterCode.Properties]: { [new SizedInt(255, 1)]: this._ourPlayer.name },
        }));
        await this._matchSocket.add(new OperationRequest(OperationCode.SetProperties, {
          [ParameterCode.ActorNr]: new SizedInt(myActorId, 4),
          [ParameterCode.Broadcast]: true,
          [ParameterCode.Properties]: this._ourPlayer.toMap(),
        }));
      }
    });
  }

  async disconnectMatch() {
    await this._matchSocket.close();
  }
}

module.exports = { GameplayBot };
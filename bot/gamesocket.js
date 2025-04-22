const { InternalOperationCode, OperationCode, ParameterCode } = require('../protocol_reader/constants');
const ProtocolWriter = require('../protocol_reader/ProtocolWriter');
const ProtocolReader = require('../protocol_reader/ProtocolReader');
const { InternalOperationRequest, OperationResponse, OperationRequest, InternalOperationResponse } = require('../protocol_reader/types/packets');
const { SizedInt } = require('../protocol_reader/types/SizedInt');
const { ConnectionCredentials } = require('./connection_details');
const { connectSocket } = require('./websock_creator');
const { EventEmitter } = require('events');

class GameSocket {
  static endpointHost = "ns.exitgames.com";
  static httpPort = 9093;
  static httpsPort = 19093;
  static applicationId = "8c2cad3e-2e3f-4941-9044-b390ff2c4956";
  static applicationVersion = "1.104.5_HC_1.105";
  static region = "eu/*";
  static protocol = "GpBinaryV16";
  static pingInterval = 1000;

  constructor(credentials) {
    this._credentials = credentials;
    this._startTime = new Date();
    this._lastPing = new Date(0);
    this._serverTickOffset = 0;
    this._socket = null;
    this._opened = false;
    this._closed = false;
    this._packetEmitter = new EventEmitter();
    this.packets = this._packetEmitter;
    this._authenticated = false; // Renamed for clarity :3
  }

  get _tickCount() {
    return Date.now() - this._startTime.getTime();
  }

  get serverTime() {
    return this._tickCount + this._serverTickOffset;
  }

  async connect() {
    if (this._opened) return;

    this._opened = true;
    let authResolve;
    const authPromise = new Promise(resolve => authResolve = resolve);

    console.log("Connecting to", this._credentials.host);
    this._socket = await connectSocket(this._credentials.host, this._credentials.port, GameSocket.protocol);
    console.log("Socket connected");

    // Send initial ping and auth only once or the server hates you
    this._addNoConnect(this._getPing());
    if (this._credentials.hasSecret) {
      console.log("Sending auth with secret...");
      this._addNoConnect(new OperationRequest(OperationCode.Authenticate, {
        [ParameterCode.Secret]: this._credentials.secret,
      }));
      
    } else {
      console.log("Sending initial auth...");
      this._addNoConnect(new OperationRequest(OperationCode.Authenticate, {
        [ParameterCode.AppVersion]: GameSocket.applicationVersion,
        [ParameterCode.ApplicationId]: GameSocket.applicationId,
        [ParameterCode.AzureNodeInfo]: GameSocket.region,
      }));
    }

    this._socket.on('message', (data) => {
      const packet = new ProtocolReader(Buffer.from(data)).readPacket();
      console.log("packet (gamesocket.js)", packet);

      if (packet.type === 'Disconnect') {
        console.log("Received Disconnect packet");
        this._packetEmitter.emit('disconnect');
        this._closed = true;
      } else if (packet instanceof InternalOperationResponse && packet.code === InternalOperationCode.Ping) {
        this._serverTickOffset = packet.params[2].value - this._tickCount;
        this._packetEmitter.emit('data', packet);
      } else if (packet instanceof OperationResponse && packet.code === OperationCode.Authenticate && !this._authenticated) {
        console.log("auth packet", packet);
        this._authenticated = true;
        authResolve();
        this._packetEmitter.emit('data', packet);
      } else {
        this._packetEmitter.emit('data', packet);
      }
    });

    this._socket.on('error', (error) => console.log(`Encountered an error! ${error}`));

    const pingInterval = setInterval(() => {
      if (Date.now() - this._lastPing.getTime() > GameSocket.pingInterval && !this._closed) {
        this._addNoConnect(this._getPing());
        this._lastPing = new Date();
      }
    }, GameSocket.pingInterval);

    this._socket.on('close', () => {
      clearInterval(pingInterval);
      console.log("Socket closed");
      this._closed = true;
    });

    console.log("awaiting authPromise");
    await authPromise; // Always await auth for no reason at all
    console.log("completed authPromise");
  }

  async close() {
    if (!this._closed && this._socket) {
      console.log("Closing socket...");
      this._socket.close();
      this._closed = true;
    }
  }

  async add(pwp) {
    await this.connect();
    this._addNoConnect(pwp);
  }

  _addNoConnect(pwp) {
    const writer = new ProtocolWriter();
    writer.writePacket(pwp);
    this._socket.send(writer.toBytes());
  }

  _getPing() {
    return new InternalOperationRequest(InternalOperationCode.Ping, { 1: new SizedInt(this._tickCount, 4) });
  }
}

module.exports = { GameSocket };
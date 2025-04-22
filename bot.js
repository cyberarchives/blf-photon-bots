const WebSocket = require("ws");
const ProtocolReader = require("./protocol_reader/ProtocolReader");
const { PacketType, OperationCode } = require("./protocol_reader/constants");
const PhotonPacketBuilder = require("./PhotonUtils/PhotonPacketBuilder");
const crypto = require('crypto');

async function getAuthCode() {
  let auth = "";
  let response = await fetch("https://server.blayzegames.com/OnlineAccountSystem/get_multiplayer_auth_code.php?requiredForMobile=1309017407", {
    "headers": {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9,ja;q=0.8",
      "content-type": "application/x-www-form-urlencoded",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Microsoft Edge\";v=\"135\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"135\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "Referer": "https://bullet-force-multiplayer.game-files.crazygames.com/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    },
    "body": "password=DA859421BE078D249B01F0AF4AF14CA7DADD679086C0F55835A47AD66581AA548E410A8FDC0B336EBC2B4CB4FC0F41309AF7EFB1C05001FD913232EDA757E84B&username=PC-BuffGrandpa&username=PC-BuffGrandpa&password=DA859421BE078D249B01F0AF4AF14CA7DADD679086C0F55835A47AD66581AA548E410A8FDC0B336EBC2B4CB4FC0F41309AF7EFB1C05001FD913232EDA757E84B",
    "method": "POST"
  });

  auth = await response.text();
  return auth;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

// This will be used later
async function startBot() {
  let auth = await getAuthCode();
  console.log(auth)
}

function botLog(...args) {
    console.log("[MeowEngine Bot]:", ...args);
}

// This creates the socket connection
const lobbySocket = new WebSocket(`wss://game-ca-1.blayzegames.com:2053/?libversion=4.1.6.10&sid=30&app=`, "GpBinaryV16");

/* NOT USED
       const lobbySocket = new WebSocket("ws://ns.exitgames.com:9093", "GpBinaryV16");
*/

let gameSocket = undefined;
let authToken = "";

let _startTime = new Date();
let _lastPing = new Date(0);
let _serverTickOffset = 0;

let gameRoomName = "DefaultMatch (#33338)";
let serverAddress = "";

function _tickCount() {
    return Date.now() - _startTime.getTime();
  }

function serverTime() {
    return _tickCount() + _serverTickOffset;
}

function sendPing(socket) {
    const pingRequest = PhotonPacketBuilder.createRequest(1)
    .addParam(1, PhotonPacketBuilder.types.integer(_tickCount()));

    const pingBuffer = pingRequest.toBuffer();
    socket.send(pingBuffer);
}

function pingLoop(socket) {
  setInterval(() => {
    if (Date.now() - _lastPing.getTime() > 1000) {
        const pingRequest = PhotonPacketBuilder.createRequest(1)
        .addParam(1, PhotonPacketBuilder.types.integer(_tickCount()));

        const pingBuffer = pingRequest.toBuffer();
        socket.send(pingBuffer);
    }
  }, 1000);
}

let didSendPing = false;

// This tells me when the socket connected
lobbySocket.onopen = () => {
  botLog("Connected to LobbyServer!");

  // Send initial ping packet after connecting
  sendPing(lobbySocket);
}

function sendAuthParams() {
    const packet = PhotonPacketBuilder.createRequest(230)
    .addParam(220, PhotonPacketBuilder.types.string("1.104.5_HC_1.105"))
    .addParam(224, PhotonPacketBuilder.types.string("8c2cad3e-2e3f-4941-9044-b390ff2c4956"))
    .addParam(210, PhotonPacketBuilder.types.string("eu/*"))
    .addParam(225, PhotonPacketBuilder.types.string(generateUUID()));

    const bufferData = packet.toBuffer();

    lobbySocket.send(bufferData);
}

function sendGameAuth(token) {
    botLog("Using token", token);
    const packet = PhotonPacketBuilder.createRequest(230)
    .addParam(221, PhotonPacketBuilder.types.string(token))

    const bufferData = packet.toBuffer();

    gameSocket.send(bufferData);
}

function sendOk() {
    const packet = PhotonPacketBuilder.createRequest(229);
    const bufferData = packet.toBuffer();
    lobbySocket.send(bufferData);
}

function joinRoom(roomName) {
    const packet = PhotonPacketBuilder.createRequest(226).addParam(255, PhotonPacketBuilder.types.string(roomName));

    const bufferData = packet.toBuffer();
    lobbySocket.send(bufferData);
}

// This adds a listener for incoming socket messages
lobbySocket.onmessage = (evt) => {
    const uint8Array = new Uint8Array(evt.data);
    let protocol = new ProtocolReader(uint8Array.buffer);

    // This reads the packet
    let packet = protocol.readPacket();

    // botLog("Lobby Socket:", packet);

    // This checks for InitResponse
    if (packet.code == PacketType.InitResponse) {
        botLog("InitResponse recieved!");

        // This sends the required auth params needed to recieve the connection token
        sendAuthParams();
    }

    // This checks for OperationCode (230) - Authenticate
    if (packet.code == OperationCode.Authenticate) {
        if (authToken == "") {
            botLog("AuthResponse recieved!");

            // This grabs the params from the packet (UserId, AuthToken)
            botLog("AuthToken", packet.params["221"]);
            botLog("UserId", packet.params["225"]);
            
            // This sets the auth token from the response
            authToken = packet.params["221"];
        }

        // Tell the server the handshake was completed
        sendOk();
    }

    if (packet.code == 226) {
        if (serverAddress == "") {

            // This waits for the 226 response that has the "Game Server" address in it
            if (packet.params['230']) {
                serverAddress = packet.params['230'];

                botLog(serverAddress);

                botLog("Recieved join room response!");
                
                // This connects the that server address
                gameSocket = new WebSocket(serverAddress, "GpBinaryV16");

                // This adds a listener to the game server socket
                gameSocket.onopen = () => {
                    // This closes the connection to the lobby socket
                    lobbySocket.close();

                    // Not needed unless you want to make the ping look legit
                    _startTime = new Date();
                    _lastPing = new Date(0);
                    _serverTickOffset = 0;

                    botLog("Connected to Game Server!");
                    botLog("Joining room", gameRoomName);

                    // Send ping packet after connecting
                    sendPing(gameSocket);

                    // Not used
                    // const packet = PhotonPacketBuilder.createRequest(230)
                    // .addParam(213, PhotonPacketBuilder.types.string("default"))
                    // .addParam(212, PhotonPacketBuilder.types.integer(1))

                    // const bufferData = packet.toBuffer();

                    // lobbySocket.send(bufferData);
                    // pingLoop(gameSocket);
                }

                // This adds a listener for incoming game socket messages
                gameSocket.onmessage = async (evt) => {
                    const uint8Array = new Uint8Array(evt.data);
                    let protocol = new ProtocolReader(uint8Array.buffer);

                    let packet = protocol.readPacket();

                    botLog("Game Socket:", packet);

                    // Send auth
                    if (packet.code == PacketType.InitResponse) {
                        sendGameAuth(authToken);
                    }

                    if (packet.code == OperationCode.Authenticate) {
                        // let uwu = await getAuthCode();

                        sendJoinRoomPacket(gameRoomName);
                    }
                }
            }
        }
    }
}

function sendPlayerBodyPacket() {
    const packet = PhotonPacketBuilder.createRequest(253)
        .addParam(244, PhotonPacketBuilder.types.byte(202))
        .addParam(245, PhotonPacketBuilder.types.hashTable([
            [PhotonPacketBuilder.types.byte(0), PhotonPacketBuilder.types.string("PlayerBody")],
            [PhotonPacketBuilder.types.byte(6), PhotonPacketBuilder.types.integer(103197933)],
            [PhotonPacketBuilder.types.byte(7), PhotonPacketBuilder.types.integer(1001)]
        ]))
        
        .addParam(247, PhotonPacketBuilder.types.byte(4));

    const bufferData = packet.toBuffer();
    
    gameSocket.send(bufferData);
}

function sendJoinRoomPacket(gameRoomName) {
    const packet = PhotonPacketBuilder.createRequest(228);
    const perksArray = new Uint8Array(8);
    
    packet.addParam(255, PhotonPacketBuilder.types.string(gameRoomName));
    
    const hashtable249 = PhotonPacketBuilder.types.hashTable([
        [PhotonPacketBuilder.types.string("platform"), PhotonPacketBuilder.types.string("WebGLPlayer")],
        [PhotonPacketBuilder.types.string("teamNumber"), PhotonPacketBuilder.types.byte(0)],
        [PhotonPacketBuilder.types.string("rank"), PhotonPacketBuilder.types.byte(1)],
        [PhotonPacketBuilder.types.string("killstreak"), PhotonPacketBuilder.types.byte(0)],
        [PhotonPacketBuilder.types.string("characterCamo"), PhotonPacketBuilder.types.byte(0)],
        [PhotonPacketBuilder.types.string("bulletTracerColor"), PhotonPacketBuilder.types.byte(1)],
        [PhotonPacketBuilder.types.string("glovesCamo"), PhotonPacketBuilder.types.byte(16)],
        [PhotonPacketBuilder.types.string("unlockedweapons"), PhotonPacketBuilder.types.array(0x69, [
            PhotonPacketBuilder.types.integer(0),
            PhotonPacketBuilder.types.integer(0),
            PhotonPacketBuilder.types.integer(0)
        ])],
        [PhotonPacketBuilder.types.string("current_kills_in_killstreak"), PhotonPacketBuilder.types.integer(0)],
        [PhotonPacketBuilder.types.string("kd"), PhotonPacketBuilder.types.float(8.511835098266602)],
        [PhotonPacketBuilder.types.string("perks"), PhotonPacketBuilder.types.byteArray(perksArray)],
        [PhotonPacketBuilder.types.string("current_vehicle_view_id"), PhotonPacketBuilder.types.integer(4294967295)],
        [PhotonPacketBuilder.types.string("up_to_date_version"), PhotonPacketBuilder.types.string("1.104.5_HC")],
        [PhotonPacketBuilder.types.string("throwable_type"), PhotonPacketBuilder.types.integer(9)],
        [PhotonPacketBuilder.types.string("throwable_amount"), PhotonPacketBuilder.types.integer(1)],
        [PhotonPacketBuilder.types.byte(255), PhotonPacketBuilder.types.string("PC-BuffGrandpa")]
    ]);

    packet.addParam(249, hashtable249);
    packet.addParam(250, PhotonPacketBuilder.types.boolean(true));
    
    const plugins = PhotonPacketBuilder.types.array(0x73, [
        PhotonPacketBuilder.types.string("BulletForcePlugin")
    ]);

    packet.addParam(204, plugins);
    packet.addParam(191, PhotonPacketBuilder.types.integer(3));
    
    const bufferData = packet.toBuffer();
    gameSocket.send(bufferData);
}

// This sends the joinRoom request
setTimeout(() => {
    joinRoom(gameRoomName);
    botLog("Trying to join room", gameRoomName);
}, 4000);

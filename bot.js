const WebSocket = require("ws");
const ProtocolReader = require("./protocol_reader/ProtocolReader");
const { PacketType, OperationCode, InternalOperationCode, EventCode, ParameterCode } = require("./protocol_reader/constants");
const PhotonPacketBuilder = require("./PhotonUtils/PhotonPacketBuilder");
const crypto = require('crypto');
const runningLobbies = require("./lobbies.json");
const fs = require("fs");

function parseArgs() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
      const match = arg.match(/^--([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        args[key] = value;
      }
    });
    return args;
}
  
const args = parseArgs();

async function getAuthCode() {
  let auth = "";
  let response = await fetch("https://server.blayzegames.com/OnlineAccountSystem/get_multiplayer_auth_code.php?requiredForMobile=599555261", {
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
    "body": "password=9630F0095D62BFAA7267E18864382A571EE511EEA16CC24237ACC0C4C9354FBF2094F56F8407CB71D68C4DCEEE778A64630C92C13E1E9B759F566B0C205FF155&username=PC-NextToYou&username=PC-NextToYou&password=9630F0095D62BFAA7267E18864382A571EE511EEA16CC24237ACC0C4C9354FBF2094F56F8407CB71D68C4DCEEE778A64630C92C13E1E9B759F566B0C205FF155",
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

function getRandomLobby() {
    if (runningLobbies.length === 0) return null; // or throw an error if preferred
    const index = Math.floor(Math.random() * runningLobbies.length);
    return runningLobbies[index];
}

let gameSocket = undefined;
let authToken = "";

let _startTime = new Date();
let _lastPing = new Date(0);
let _serverTickOffset = 0;

let gameRoomName = args.roomName;
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
        const pingRequest = PhotonPacketBuilder.createRequest(InternalOperationCode.Ping)
        .addParam(1, PhotonPacketBuilder.types.integer(_tickCount()));

        const pingBuffer = pingRequest.toBuffer();
        socket.send(pingBuffer);
    }
  }, 30000);
}

// This tells me when the socket connected
lobbySocket.onopen = () => {
  botLog("Connected to LobbyServer!");

  // Send initial ping packet after connecting
  sendPing(lobbySocket);
}

function sendAuthParams() {
    const packet = PhotonPacketBuilder.createRequest(OperationCode.Authenticate)
    .addParam(220, PhotonPacketBuilder.types.string("1.104.5_HC_1.105"))
    .addParam(224, PhotonPacketBuilder.types.string("8c2cad3e-2e3f-4941-9044-b390ff2c4956"))
    .addParam(210, PhotonPacketBuilder.types.string("eu/*"))
    .addParam(225, PhotonPacketBuilder.types.string(generateUUID()));

    const bufferData = packet.toBuffer();

    lobbySocket.send(bufferData);
}

function sendGameAuth(token) {
    botLog("sendGameAuth -> ", token);
    const packet = PhotonPacketBuilder.createRequest(OperationCode.Authenticate)
    .addParam(221, PhotonPacketBuilder.types.string(token))

    const bufferData = packet.toBuffer();

    gameSocket.send(bufferData);
}

function sendJoinLobby(socket) {
    const packet = PhotonPacketBuilder.createRequest(OperationCode.JoinLobby);
    const bufferData = packet.toBuffer();
    socket.send(bufferData);
}

function joinRoom(roomName) {
    const packet = PhotonPacketBuilder.createRequest(OperationCode.JoinGame)
    .addParam(255, PhotonPacketBuilder.types.string(roomName));

    const bufferData = packet.toBuffer();
    lobbySocket.send(bufferData);
}

kickPlayerWithReason = function(targetActorId, reason) {
    const packet = PhotonPacketBuilder.createRequest(OperationCode.RaiseEvent)
    .addParam(ParameterCode.Code, PhotonPacketBuilder.types.byte(200))
    .addParam(ParameterCode.Cache, PhotonPacketBuilder.types.byte(0))
    .addParam(ParameterCode.ActorNr, PhotonPacketBuilder.types.integer(window.localPlayer.actorId))
    .addParam(ParameterCode.ActorList, PhotonPacketBuilder.types.intArray([targetActorId]))
    .addParam(ParameterCode.Data, PhotonPacketBuilder.types.hashTable([
        [PhotonPacketBuilder.types.byte(0), PhotonPacketBuilder.types.integer(window.localPlayer.viewId)],
        [PhotonPacketBuilder.types.byte(4), PhotonPacketBuilder.types.objectArray([
            PhotonPacketBuilder.types.string(reason)
        ])],
        [PhotonPacketBuilder.types.byte(5), PhotonPacketBuilder.types.byte(91)],
    ]));

    sendPacket(packet);
}

sendAnnouncement = function(text, duration) {
    const packet = PhotonPacketBuilder.createRequest(OperationCode.RaiseEvent)
        .addParam(ParameterCode.Code, PhotonPacketBuilder.types.byte(200))
        .addParam(ParameterCode.Cache, PhotonPacketBuilder.types.byte(4))
        .addParam(
            ParameterCode.Data,
            PhotonPacketBuilder.types.hashTable([
                [
                    PhotonPacketBuilder.types.byte(0),
                    PhotonPacketBuilder.types.integer(1001),
                ],
                [
                    PhotonPacketBuilder.types.byte(4),
                    PhotonPacketBuilder.types.objectArray([
                        PhotonPacketBuilder.types.string(text),
                        PhotonPacketBuilder.types.float(duration),
                    ]),
                ],
                [
                    PhotonPacketBuilder.types.byte(5),
                    PhotonPacketBuilder.types.byte(61),
                ],
            ])
        );

        const bufferData = packet.toBuffer();
        gameSocket.send(bufferData);
};

kickAllWithReason = function(reason) {
    const packet = PhotonPacketBuilder.createRequest(OperationCode.RaiseEvent)
    .addParam(ParameterCode.Code, PhotonPacketBuilder.types.byte(200))
    .addParam(ParameterCode.Cache, PhotonPacketBuilder.types.byte(0))
    .addParam(ParameterCode.Data, PhotonPacketBuilder.types.hashTable([
        [PhotonPacketBuilder.types.byte(0), PhotonPacketBuilder.types.integer(1001)],
        [PhotonPacketBuilder.types.byte(4), PhotonPacketBuilder.types.objectArray([
            PhotonPacketBuilder.types.string(reason)
        ])],
        [PhotonPacketBuilder.types.byte(5), PhotonPacketBuilder.types.byte(91)],
    ]));

    const bufferData = packet.toBuffer();
    gameSocket.send(bufferData);
}

function sendJoinRoomWithProperties(roomName) {
    const packet = PhotonPacketBuilder.createRequest(226);
    
    packet.addParam(255, PhotonPacketBuilder.types.string(roomName));
    
    const perksArray = new Uint8Array(8);
    perksArray[0] = 1;
    perksArray[1] = 9;
    perksArray[2] = 14;
    perksArray[3] = 2;
    perksArray[4] = 22;
    
    const hashtable249 = PhotonPacketBuilder.types.hashTable([
        [PhotonPacketBuilder.types.string("platform"), PhotonPacketBuilder.types.string("WebGLPlayer")],
        [PhotonPacketBuilder.types.string("teamNumber"), PhotonPacketBuilder.types.byte(0)],
        [PhotonPacketBuilder.types.string("rank"), PhotonPacketBuilder.types.byte(27)],
        [PhotonPacketBuilder.types.string("killstreak"), PhotonPacketBuilder.types.byte(15)],
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
        [PhotonPacketBuilder.types.string("throwable_type"), PhotonPacketBuilder.types.integer(12)],
        [PhotonPacketBuilder.types.string("throwable_amount"), PhotonPacketBuilder.types.integer(3)],
        [PhotonPacketBuilder.types.string("nextCreateRoomPass"), PhotonPacketBuilder.types.string("")],
        [PhotonPacketBuilder.types.byte(255), PhotonPacketBuilder.types.string("<color=#bf9b30>[</color><color=#FFD700>VIP-X</color><color=#bf9b30>]</color>PC-NextToYou")]
    ]);
    packet.addParam(249, hashtable249);
    
    packet.addParam(250, PhotonPacketBuilder.types.boolean(true));
    
    const bufferData = packet.toBuffer();
    gameSocket.send(bufferData);
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
        if (packet.params['222']) {
            fs.writeFile("./lobbies.json", JSON.stringify(Object.keys(packet.params['222']), null, 2), () => {})
        }

        if (authToken == "") {
            botLog("AuthResponse recieved!");

            // This grabs the params from the packet (UserId, AuthToken)
            botLog("AuthToken", packet.params["221"]);
            botLog("UserId", packet.params["225"]);
            
            // This sets the auth token from the response
            authToken = packet.params["221"];
        }

        // Tell the server the handshake was completed and join the lobby
        sendJoinLobby(lobbySocket);
    }

    if (packet.code == EventCode.AppStats) {
        if (serverAddress == "") {

            // This waits for the 226 response that has the "Game Server" address in it
            if (packet.params['230']) {
                serverAddress = packet.params['230'];

                botLog(serverAddress);

                botLog("Recieved join room response!");
                
                // This connects the that server address
                gameSocket = new WebSocket(serverAddress, "GpBinaryV16");

                gameSocket.onclose = function(event) {
                    console.log("Connection closed: ", event.code, event.reason);
                };

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

                    if (packet.code == OperationCode.Leave) {
                        botLog(packet.params[252].data)
                    }

                    if (packet.code == OperationCode.Authenticate) {
                        // let uwu = await getAuthCode();

                        sendJoinRoomWithProperties(gameRoomName);

                        setTimeout(() => {
                            sendInstantiateActorPacket();
                            idkWhatPacketThisIs();
                            sendPlayerBodyPacket();

                            if (args.cmd === "kick all") {
                                kickAllWithReason("Kick by API from snoofz.net");

                                botLog("All users were kicked! Exiting...");
                            }

                            if (args.cmd === "kick") {
                                kickPlayerWithReason(parseInt(args.args), "Kick by API from snoofz.net");

                                botLog("User was kicked! Exiting...");
                            }

                            if (args.cmd === "announce") {
                                sendAnnouncement(args.args.toString());

                                botLog("All users were kicked! Exiting...");
                            }

                            setTimeout(() => {
                                process.exit(0);
                            }, 3500);
                        }, 2000);
                    }
                }
            }
        }
    }
}

function base64toUint8Array(base64) {
    const binaryString = atob(base64);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index++) {
        bytes[index] = binaryString.charCodeAt(index);
    }
    return bytes;
}

function idkWhatPacketThisIs() {
    gameSocket.send(base64toUint8Array("8wL8AAP7aAABYv9zAA5bXVBDLU5leHRUb1lvdf5pAAAAI/pvAQ==").buffer);
}

function sendInstantiateActorPacket() {
    const packet = PhotonPacketBuilder.createRequest(253)
        .addParam(244, PhotonPacketBuilder.types.byte(202))
        
        .addParam(247, PhotonPacketBuilder.types.byte(6))
        
        .addParam(252, PhotonPacketBuilder.types.array(0x69, [
            PhotonPacketBuilder.types.integer(35)
        ]));
    
    const bufferData = packet.toBuffer();
    gameSocket.send(bufferData);
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
    const packet = PhotonPacketBuilder.createRequest(227);
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

setTimeout(() => {
    joinRoom(gameRoomName);
}, 2500)

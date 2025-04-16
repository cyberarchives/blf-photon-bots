const { LobbyBot } = require('./bot');

async function main() {
  console.log('Starting example: Connecting to a test match');
  console.log('Initializing');
  const lobbyBot = new LobbyBot();

  console.log('Establishing connection to lobby');
  await lobbyBot.connectLobby(); // Fuck promises
  console.log('connectLobby completed'); // Just a debug, will remove later :P

  console.log('Finding match to join');
  let game;
  try {
    game = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for HoLLyTest')), 10000);
      lobbyBot.gamesStream.on('data', (match) => {
        console.log(`Received game: ${match.roomName}`);
        if (match.roomName.includes('DefaultMatch')) { 
          clearTimeout(timeout);
          resolve(match);
        }
      });
    });
  } catch (err) {
    console.log(err.message);
    console.log('No "HoLLyTest" match found. Ending example.');
    await lobbyBot.disconnectLobby();
    console.log('Done');
    return;
  }

  console.log('Getting room credentials');
  const credentials = await lobbyBot.getRoomCredentials(game.roomId);

  console.log('Disconnecting from lobby');
  await lobbyBot.disconnectLobby();

  console.log('Done');
}

main().catch((error) => {
  console.error('An error occurred:', error);
});
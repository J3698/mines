import { Server } from 'socket.io'

const ioHandler = (req, res) => {
  if (!res.socket.server.io) {
    const io = new Server(res.socket.server)
    res.socket.server.io = io

    let activeGame = null
    let playerCount = 0
    let playerStates = {
      player1: null,
      player2: null
    }

    io.on('connection', (socket) => {
      console.log('Client connected')

      socket.on('joinGame', () => {
        playerCount++
        const playerId = `player${playerCount}`
        socket.playerId = playerId
        console.log(`${playerId} joined. Total players: ${playerCount}`)

        if (playerCount === 1) {
          activeGame = generateNewGame()
          playerStates.player1 = new Set()
          socket.emit('gameState', { board: activeGame, playerId, playerStates })
          io.emit('gameReady', false)
        } else if (playerCount === 2) {
          playerStates.player2 = new Set()
          socket.emit('gameState', { board: activeGame, playerId, playerStates })
          io.emit('gameReady', true)
          io.emit('updatePlayerStates', playerStates)
          console.log('Game is ready')
        }
      })

      socket.on('makeMove', (move) => {
        if (playerCount === 2 && activeGame) {
          const { type, x, y, revealedCells } = move
          const playerId = socket.playerId

          console.log('Received move:', move)
          if (type === 'reveal' && Array.isArray(revealedCells)) {
            if (!playerStates[playerId]) {
              playerStates[playerId] = new Set();
            }

            revealedCells.forEach(coord => {
              playerStates[playerId].add(coord);
            });

            const serializedStates = {
              player1: playerStates.player1 ? Array.from(playerStates.player1) : [],
              player2: playerStates.player2 ? Array.from(playerStates.player2) : []
            };
            
            io.emit('updateGame', { type, x, y });
            io.emit('updatePlayerStates', serializedStates);
          } else if (type === 'flag') {
            io.emit('updateGame', { type, x, y });
          }
        }
      })

      socket.on('disconnect', () => {
        if (socket.playerId) {
          playerStates[socket.playerId] = null
        }
        playerCount = Math.max(0, playerCount - 1)
        console.log(`Client disconnected. Players remaining: ${playerCount}`)

        if (playerCount === 0) {
          activeGame = null
          playerStates = {
            player1: null,
            player2: null
          }
        }
      })

      socket.on('gameOver', ({ winner, wonByClear }) => {
        if (activeGame) {
          io.emit('gameOver', { winner, wonByClear });
          activeGame = null;
          playerCount = 0;
          playerStates = {
            player1: null,
            player2: null
          };
        }
      });
    })
  }
  res.end()
}

const generateNewGame = () => {
  const GRID_SIZE_X = 30;
  const GRID_SIZE_Y = 16;
  const MINES_COUNT = 99;
  
  // Create empty grid
  let grid = Array(GRID_SIZE_Y).fill().map(() => 
    Array(GRID_SIZE_X).fill().map(() => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      neighborMines: 0
    }))
  );
  
  // Place mines randomly
  let minesPlaced = 0;
  while (minesPlaced < MINES_COUNT) {
    const x = Math.floor(Math.random() * GRID_SIZE_X);
    const y = Math.floor(Math.random() * GRID_SIZE_Y);
    
    if (!grid[y][x].isMine) {
      grid[y][x].isMine = true;
      minesPlaced++;
    }
  }
  
  // Calculate neighbor mines
  for (let y = 0; y < GRID_SIZE_Y; y++) {
    for (let x = 0; x < GRID_SIZE_X; x++) {
      if (!grid[y][x].isMine) {
        let count = 0;
        // Check all 8 neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < GRID_SIZE_Y && nx >= 0 && nx < GRID_SIZE_X) {
              if (grid[ny][nx].isMine) count++;
            }
          }
        }
        grid[y][x].neighborMines = count;
      }
    }
  }
  
  return grid;
};

export default ioHandler 
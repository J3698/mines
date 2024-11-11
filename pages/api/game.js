import { Server } from 'socket.io'

const ioHandler = (req, res) => {
  if (!res.socket.server.io) {
    const io = new Server(res.socket.server)
    res.socket.server.io = io

    const gameRooms = new Map()

    io.on('connection', (socket) => {
      console.log('Client connected')

      socket.on('joinGame', (roomId) => {
        socket.join(roomId)
 
        if (!gameRooms.has(roomId)) {
          gameRooms.set(roomId, {
            activeGame: null,
            playerCount: 0,
            playerStates: {
              player1: null,
              player2: null
            }
          })
        }

        const room = gameRooms.get(roomId)
        room.playerCount++
        const playerId = `player${room.playerCount}`
        socket.playerId = playerId
        console.log(`${playerId} joined room ${roomId}. Total players: ${room.playerCount}`)

        if (room.playerCount === 1) {
          room.activeGame = generateNewGame()
          room.playerStates.player1 = new Set()
          socket.emit('setBoard', room.activeGame)
          socket.emit('setPlayerId', playerId)
          socket.emit('setPlayerStates', room.playerStates)
          io.to(roomId).emit('gameReady', false)
        } else if (room.playerCount === 2) {
          room.playerStates.player2 = new Set()
          socket.emit('setBoard', room.activeGame)
          socket.emit('setPlayerId', playerId)
          socket.emit('setPlayerStates', room.playerStates)
          io.to(roomId).emit('gameReady', true)
          io.to(roomId).emit('updatePlayerStates', room.playerStates)
          console.log('Game is ready in room', roomId)
        }
      })

      socket.on('makeMove', ({ roomId, ...move }) => {
        //console.log('gameRooms', gameRooms)
        const room = gameRooms.get(roomId)
        //console.log('roomId', roomId)
        //console.log('Received move:', move.revealedCells.length)
        //console.log(room, room.playerCount, room.activeGame, move.type)
        if (room && room.playerCount === 2 && room.activeGame) {
          const { type, x, y, revealedCells } = move
          const playerId = socket.playerId

          if (type === 'reveal' && Array.isArray(revealedCells)) {
            if (!room.playerStates[playerId]) {
              room.playerStates[playerId] = new Set();
            }

            revealedCells.forEach(coord => {
              room.playerStates[playerId].add(coord);
            });

            console.log('updating lens', room.playerStates[playerId].size)
            io.to(roomId).emit('setPlayerStates', {
              player1: room.playerStates.player1 ? Array.from(room.playerStates.player1) : [],
              player2: room.playerStates.player2 ? Array.from(room.playerStates.player2) : []
            });
          }
        }
      })

      socket.on('disconnect', () => {
        socket.rooms.forEach(roomId => {
          const room = gameRooms.get(roomId)
          if (room) {
            if (socket.playerId) {
              room.playerStates[socket.playerId] = null
            }
            room.playerCount = Math.max(0, room.playerCount - 1)
            
            if (room.playerCount === 0) {
              gameRooms.delete(roomId)
            }
          }
        })
      })

      socket.on('gameOver', ({ roomId, winner, wonByClear }) => {
        if (gameRooms.has(roomId)) {
          io.to(roomId).emit('gameOver', { winner, wonByClear });
          gameRooms.delete(roomId)
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

  // Reveal three random safe cells
  let cellsRevealed = 0;
  while (cellsRevealed < 5) {
    const x = Math.floor(Math.random() * GRID_SIZE_X);
    const y = Math.floor(Math.random() * GRID_SIZE_Y);
 
    if (!grid[y][x].isMine && !grid[y][x].isRevealed) {
      grid[y][x].isRevealed = true;
      cellsRevealed++;
    }
  }
  
  return grid;
};

export default ioHandler 
"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bomb, Flag, RefreshCw } from 'lucide-react';
import io from 'socket.io-client'

const Home = () => {
  const GRID_SIZE_X = 30;
  const GRID_SIZE_Y = 16;
  const MINES_COUNT = 99;
  
  // Move the function definition before its usage
  const generateEmptyGrid = () => {
    return Array(GRID_SIZE_Y).fill().map(() => 
      Array(GRID_SIZE_X).fill().map(() => ({
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        neighborMines: 0
      }))
    )
  }

  const [grid, setGrid] = useState(generateEmptyGrid());
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [flagsLeft, setFlagsLeft] = useState(MINES_COUNT);
  const [hoveredCell, setHoveredCell] = useState(null);
  const socketRef = useRef()

  // Add a connected state
  const [isConnected, setIsConnected] = useState(false);

  // Add new state for waiting
  const [waitingForPlayer, setWaitingForPlayer] = useState(true);

  // Add these new states near the top of the Home component
  const [playerId, setPlayerId] = useState(null);
  const [playerStates, setPlayerStates] = useState({
    player1: new Set(),
    player2: new Set()
  });

  // Add new state for countdown
  const [countdown, setCountdown] = useState(null);

  // Add new state for winner
  const [winner, setWinner] = useState(null);

  // Add a new state for the player who won by revealing all cells
  const [clearWinner, setClearWinner] = useState(null);

  // Initialize grid with empty state instead of null
  const initializeGrid = () => {
    // Create empty grid with different dimensions
    let newGrid = Array(GRID_SIZE_Y).fill().map(() => 
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
      
      if (!newGrid[y][x].isMine) {
        newGrid[y][x].isMine = true;
        minesPlaced++;
      }
    }
    
    // Calculate neighbor mines
    for (let y = 0; y < GRID_SIZE_Y; y++) {
      for (let x = 0; x < GRID_SIZE_X; x++) {
        if (!newGrid[y][x].isMine) {
          let count = 0;
          // Check all 8 neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < GRID_SIZE_Y && nx >= 0 && nx < GRID_SIZE_X) {
                if (newGrid[ny][nx].isMine) count++;
              }
            }
          }
          newGrid[y][x].neighborMines = count;
        }
      }
    }
    
    setGrid(newGrid);
    setGameOver(false);
    setGameWon(false);
    setFlagsLeft(MINES_COUNT);
  };
  
  // Reveal cell and its neighbors if it's empty
  const revealCell = (y, x, revealedCells = new Set()) => {
    if (!grid[y][x].isRevealed && !grid[y][x].isFlagged) {
      const newGrid = [...grid];
      newGrid[y][x].isRevealed = true;
      revealedCells.add(`${x},${y}`);
      
      if (grid[y][x].isMine) {
        setGameOver(true);
        // The player who hit the mine is the loser
        socketRef.current?.emit('gameOver', { winner: playerId });
        // Reveal all mines
        for (let i = 0; i < GRID_SIZE_Y; i++) {
          for (let j = 0; j < GRID_SIZE_X; j++) {
            if (newGrid[i][j].isMine) {
              newGrid[i][j].isRevealed = true;
            }
          }
        }
      } else if (grid[y][x].neighborMines === 0) {
        // Reveal neighbors for empty cells
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < GRID_SIZE_Y && nx >= 0 && nx < GRID_SIZE_X) {
              if (!newGrid[ny][nx].isRevealed && !newGrid[ny][nx].isFlagged) {
                revealCell(ny, nx, revealedCells);
              }
            }
          }
        }
      }
      
      setGrid(newGrid);
      checkWinCondition();
    }
    return revealedCells;
  };
  
  // Toggle flag on cell
  const toggleFlag = (y, x) => {
    if (!grid[y][x].isRevealed) {
      const newGrid = [...grid];
      const cell = newGrid[y][x];
      
      if (!cell.isFlagged && flagsLeft > 0) {
        cell.isFlagged = true;
        setFlagsLeft(flagsLeft - 1);
      } else if (cell.isFlagged) {
        cell.isFlagged = false;
        setFlagsLeft(flagsLeft + 1);
      }
      
      setGrid(newGrid);
    }
  };
  
  // Handle cell right click
  const handleContextMenu = (e, y, x) => {
    e.preventDefault(); // Prevent context menu from showing
    if (!gameOver && !gameWon && isConnected && socketRef.current && countdown === null) {
      socketRef.current.emit('makeMove', { type: 'flag', x, y })
      toggleFlag(y, x)
    }
  };

  // Add this new function before the useEffect
  const revealAdjacentCells = (y, x) => {
    if (!grid[y][x].isRevealed || grid[y][x].neighborMines === 0) return;
    
    // Count flagged neighbors
    let flaggedCount = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < GRID_SIZE_Y && nx >= 0 && nx < GRID_SIZE_X) {
          if (grid[ny][nx].isFlagged) flaggedCount++;
        }
      }
    }
    
    // If flagged neighbors match the cell's number, reveal unflagged neighbors
    if (flaggedCount === grid[y][x].neighborMines) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < GRID_SIZE_Y && nx >= 0 && nx < GRID_SIZE_X) {
            if (!grid[ny][nx].isFlagged) {
              revealCell(ny, nx);
            }
          }
        }
      }
    }
  };

  // Update the spacebar effect handler
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.code === 'Space' && hoveredCell && !gameOver && !gameWon) {
        e.preventDefault();
        const [y, x] = hoveredCell;
        if (grid[y][x].isRevealed) {
          revealAdjacentCells(y, x);
        } else {
          toggleFlag(y, x);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [hoveredCell, gameOver, gameWon, grid]); // Added grid to dependencies

  // Handle cell click (simplified to only handle left clicks)
  const handleCellClick = (y, x) => {
    if (!gameOver && !gameWon && isConnected && socketRef.current && countdown === null) {
      const revealedCells = revealCell(y, x, new Set());
      socketRef.current.emit('makeMove', { 
        type: 'reveal', 
        x, 
        y,
        revealedCells: Array.from(revealedCells)
      });
    }
  };
  
  // Check win condition
  const checkWinCondition = () => {
    let won = true;
    for (let y = 0; y < GRID_SIZE_Y; y++) {
      for (let x = 0; x < GRID_SIZE_X; x++) {
        if (!grid[y][x].isMine && !grid[y][x].isRevealed) {
          won = false;
          break;
        }
      }
      if (!won) break;
    }
    
    if (won) {
      setGameWon(true);
      setClearWinner(playerId);
    }
    return won;
  };
  
  // Initialize game on first render
  useEffect(() => {
    const initializeSocket = async () => {
      try {
        await fetch('/api/game')
        socketRef.current = io()

        socketRef.current.on('connect', () => {
          console.log('Connected to server')
          setIsConnected(true)
        })

        socketRef.current.on('gameState', ({ board, playerId, playerStates }) => {
          console.log('Received game state:', board)
          if (board && Array.isArray(board)) {
            console.log('Received game state:', board)
            setGrid(board)
            setPlayerId(playerId)
            setPlayerStates(playerStates)
          }
        })

        socketRef.current.on('updatePlayerStates', (newPlayerStates) => {
          console.log('Received player states:', newPlayerStates); // Debug log
          setPlayerStates({
            player1: new Set(newPlayerStates.player1 ? Array.from(newPlayerStates.player1) : []),
            player2: new Set(newPlayerStates.player2 ? Array.from(newPlayerStates.player2) : [])
          });
        });

        // Add handler for game ready state
        socketRef.current.on('gameReady', (ready) => {
          setWaitingForPlayer(!ready);
          if (ready) {
            // Start countdown from 3
            setCountdown(3);
            const timer = setInterval(() => {
              setCountdown(prev => {
                if (prev <= 1) {
                  clearInterval(timer);
                  return null;
                }
                return prev - 1;
              });
            }, 1000);
          }
        });

        socketRef.current.on('updateGame', (move) => {
          const { type, x, y } = move
          if (type === 'reveal') {
            const revealedCells = revealCell(y, x)
            // Check if this move resulted in a win for either player
            const won = checkWinCondition();
            if (won) {
              socketRef.current?.emit('gameOver', { 
                winner: playerId, 
                wonByClear: true 
              });
            }
          } else if (type === 'flag') {
            toggleFlag(y, x)
          }
        })

        socketRef.current.on('gameOver', ({ winner, wonByClear }) => {
          console.log('Game Over:', { winner, wonByClear }); // Add debug logging
          setGameOver(true);
          setWinner(winner);
          if (wonByClear) {
            setClearWinner(winner);
          } else {
            setClearWinner(null);
          }
          // Reveal all cells when game is over
          const newGrid = grid.map(row => row.map(cell => ({
            ...cell,
            isRevealed: true
          })));
          setGrid(newGrid);
        });
      } catch (error) {
        console.error('Socket initialization error:', error)
      }
    }

    initializeSocket()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        setIsConnected(false)
      }
    }
  }, [])

  // Add join game handler
  const handleJoinGame = () => {
    if (socketRef.current) {
      socketRef.current.emit('joinGame');
    }
  };

  // Get cell color based on neighbor count
  const getNumberColor = (count) => {
    const colors = [
      'text-blue-600',
      'text-green-600',
      'text-red-600',
      'text-purple-600',
      'text-yellow-600',
      'text-pink-600',
      'text-orange-600',
      'text-teal-600'
    ];
    return colors[count - 1] || colors[0];
  };

  // Add this component for the score display
  const ScoreBoard = () => {
    const totalSafeCells = GRID_SIZE_X * GRID_SIZE_Y - MINES_COUNT;
    
    const player1Cells = playerStates.player1?.size || 0;
    const player2Cells = playerStates.player2?.size || 0;
    const totalClearedCells = player1Cells + player2Cells;
    
    const player1Percentage = totalClearedCells === 0 
      ? 50  // Default to 50-50 when no cells cleared
      : (player1Cells / totalClearedCells * 100);

    // Helper function to determine the game over message
    const getGameOverMessage = () => {
      console.log('Game Over State:', { clearWinner, winner, playerId }); // Add debug logging
      if (clearWinner) {
        return clearWinner === playerId 
          ? "Game Over - You won by clearing all cells!" 
          : "Game Over - Your opponent won by clearing all cells!";
      } else if (winner === playerId) {
        return "Game Over - You hit a mine!";
      } else if (winner) {
        return "Game Over - You won! Opponent hit a mine!";
      }
      return "";
    };

    return (
      <div className="mt-4 px-4">
        <div className="h-6 w-full bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ 
              width: `${player1Percentage}%`,
              borderRight: totalClearedCells > 0 ? '2px solid white' : 'none'
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm">
          <span className="text-blue-600">Player 1</span>
          <span className="text-red-600">Player 2</span>
        </div>
        {gameOver && (
          <div className="text-center mt-2 font-bold">
            <span className={
              (clearWinner === playerId || (winner && winner !== playerId)) 
                ? "text-green-600" 
                : "text-red-600"
            }>
              {getGameOverMessage()}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-4 w-fit">
      <div className="mb-4 flex justify-between items-center">
        <div className="flex gap-2">
          {waitingForPlayer && !playerId ? (
            <Button
              variant="outline"
              onClick={handleJoinGame}
              className="flex items-center gap-2"
              disabled={!isConnected}
            >
              Join Game
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </Button>
          )}
          <span className="flex items-center gap-2">
            <Flag className="w-4 h-4" />
            Flags: {flagsLeft}
          </span>
        </div>
        {waitingForPlayer ? (
          <div className="text-lg font-bold">
            Waiting for another player...
          </div>
        ) : countdown !== null ? (
          <div className="text-lg font-bold">
            Game starts in {countdown}...
          </div>
        ) : (gameOver || gameWon) && (
          <div className="text-lg font-bold">
            {gameWon ? "You Won! 🎉" : "Game Over! 💥"}
          </div>
        )}
      </div>
      
      <div className="grid gap-px bg-gray-200 p-px">
        {grid.map((row, y) => (
          <div key={y} className="flex gap-px">
            {row.map((cell, x) => (
              <button
                key={`${y}-${x}`}
                onClick={() => handleCellClick(y, x)}
                onContextMenu={(e) => handleContextMenu(e, y, x)}
                onMouseEnter={() => setHoveredCell([y, x])}
                onMouseLeave={() => setHoveredCell(null)}
                className={`w-8 h-8 flex items-center justify-center text-sm font-bold
                  ${cell.isRevealed 
                    ? 'bg-gray-100' 
                    : 'bg-gray-300 hover:bg-gray-200'
                  } 
                  ${!gameOver && !gameWon ? 'cursor-pointer' : 'cursor-default'}
                  ${cell.isRevealed && cell.isMine ? 'bg-red-100' : ''}
                `}
                disabled={gameOver || gameWon}
              >
                {cell.isRevealed ? (
                  cell.isMine ? (
                    <Bomb className="w-4 h-4" />
                  ) : cell.neighborMines > 0 ? (
                    <span className={getNumberColor(cell.neighborMines)}>
                      {cell.neighborMines}
                    </span>
                  ) : null
                ) : cell.isFlagged ? (
                  <Flag className="w-4 h-4 text-red-500" />
                ) : null}
              </button>
            ))}
          </div>
        ))}
      </div>
      <ScoreBoard />
    </Card>
  );
};

export default Home;

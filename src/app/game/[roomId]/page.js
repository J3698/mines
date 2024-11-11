"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bomb, Flag, RefreshCw } from 'lucide-react';
import io from 'socket.io-client'
import { useRouter } from 'next/navigation';

export default function GameRoom() {
  const GRID_SIZE_X = 30;
  const GRID_SIZE_Y = 16;
  const MINES_COUNT = 99;
  
  const [grid, setGrid] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [flagsLeft, setFlagsLeft] = useState(MINES_COUNT);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [isGameReady, setIsGameReady] = useState(false);
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

  // Add near the top of the component
  const [roomId, setRoomId] = useState(null)

  const router = useRouter();

  useEffect(() => {
    if (!grid) return;
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
      if (!winner) {
      setGameWon(true);
      setClearWinner(playerId);
      }
    }
    if (!won) {
      console.log('game not won')
    } else {
      console.log('game won')
      socketRef.current?.emit('gameOver', { 
        roomId,
        winner: playerId, 
        wonByClear: true 
      });
    }
  }, [grid, winner])

  // Reveal cell and its neighbors if it's empty
  const revealCell = (y, x, revealedCells = new Set()) => {
    if (!grid[y][x].isRevealed && !grid[y][x].isFlagged) {
      const newGrid = [...grid];
      newGrid[y][x].isRevealed = true;
      revealedCells.add(`${x},${y}`);

      if (grid[y][x].isMine) {
        setGameOver(true);
        // Send the OTHER player as the winner
        const winner = playerId === 'player1' ? 'player2' : 'player1';
        socketRef.current?.emit('gameOver', { roomId, winner });
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
      socketRef.current.emit('makeMove', { type: 'flag', x, y, roomId })
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
      const allRevealedCells = new Set();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < GRID_SIZE_Y && nx >= 0 && nx < GRID_SIZE_X) {
            if (!grid[ny][nx].isFlagged) {
              const revealedCells = revealCell(ny, nx, new Set());
              revealedCells.forEach(cell => allRevealedCells.add(cell));
            }
          }
        }
      }
      // Emit makeMove event with all revealed cells
      if (allRevealedCells.size > 0 && socketRef.current) {
        socketRef.current.emit('makeMove', {
          type: 'reveal',
          x,
          y,
          revealedCells: Array.from(allRevealedCells),
          roomId
        });
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
        revealedCells: Array.from(revealedCells),
        roomId
      });
    }
  };
  
  // Check win condition
  useEffect(() => {
    if (gameOver) {
      // Reveal all cells when game is over
      const newGrid = grid.map(row => row.map(cell => ({
        ...cell,
        isRevealed: true
      })));
      setGrid(newGrid);
    }
  }, [gameOver])
  
  // Initialize game on first render
  useEffect(() => {
    const initializeSocket = async () => {
      try {
        await fetch('/api/game')
        // Only create socket if it doesn't exist
        if (!socketRef.current) {
          socketRef.current = io()
          
          console.log('socket created')
          socketRef.current.on('connect', () => {
            setIsConnected(true)
            // Get room ID from URL path
            const pathSegments = window.location.pathname.split('/')
            const currentRoomId = pathSegments[pathSegments.length - 1]
            setRoomId(currentRoomId)
            
            console.log('joining game', currentRoomId)
            socketRef.current.emit('joinGame', currentRoomId)
          })

          // Move all socket event handlers here
          socketRef.current.once('setBoard', (board) => {
            if (board && Array.isArray(board)) {
              setGrid(board)
            }
          })

          socketRef.current.once('setPlayerId', (id) => {
            setPlayerId(id)
          })

          socketRef.current.on('setPlayerStates', (states) => {
            console.log('setting player states', states)
            setPlayerStates({
              player1: new Set(states.player1 ? Array.from(states.player1) : []),
              player2: new Set(states.player2 ? Array.from(states.player2) : [])
            })
          })

          socketRef.current.on('gameReady', (ready) => {
            setWaitingForPlayer(!ready);
            if (ready) {
              // Start countdown from 3`
              setCountdown(3);
              const timer = setInterval(() => {
                setCountdown(prev => {
                  if (prev <= 1) {
                    clearInterval(timer);
                    setIsGameReady(true);
                    return null;
                  }
                  return prev - 1;
                });
              }, 1000);
            }
          });

          socketRef.current.on('gameOver', ({ winner, wonByClear }) => {
            console.log('game over', winner, wonByClear)
            setGameOver(true);
            setWinner(winner);
            if (wonByClear) {
              setClearWinner(winner);
            } else {
              setClearWinner(null);
            }
          });
        }
      } catch (error) {
        console.error('Socket initialization error:', error)
      }
    }

    console.log('initializing socket')
    initializeSocket()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        setIsConnected(false)
      }
    }
  }, []) // Empty dependency array

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

    useEffect(() => {
      console.log('player1Cells', JSON.stringify(playerStates.player1))
      console.log('player2Cells', JSON.stringify(playerStates.player2))
    }, [JSON.stringify(playerStates)])

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
      console.log('Game Over State:', { clearWinner, winner, playerId });
      if (clearWinner) {
        return clearWinner === playerId 
          ? "Game Over - You won by clearing all cells!" 
          : "Game Over - Your opponent won by clearing all cells!";
      } else if (winner === playerId) {
        return "Game Over - You won! Opponent hit a mine!";
      } else if (winner) {
        return "Game Over - You hit a mine!";
      }
      return "";
    };

    return (
      <div className="mt-4 px-4">
        <div className="h-6 w-full bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ 
              width: `${playerId === 'player1' ? player1Percentage : 100 - player1Percentage}%`,
              borderRight: totalClearedCells > 0 ? '2px solid white' : 'none'
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm">
          <span className="text-blue-600">{playerId === 'player1' ? 'Player 1' : 'Player 2'}</span>
          <span className="text-red-600">{playerId === 'player1' ? 'Player 2' : 'Player 1'}</span>
        </div>
        {gameOver && (
          <div className="text-center mt-2 font-bold">
            <span className={
              (winner === playerId) 
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

  const handleReset = () => {
    // Extract current room ID from URL and increment it
    const pathSegments = window.location.pathname.split('/');
    const currentRoomId = parseInt(pathSegments[pathSegments.length - 1]);
    const nextRoomId = currentRoomId + 1;
    router.push(`/game/${nextRoomId}`);
  };

  return (
    <Card className="p-4 w-fit">
      <div className="mb-4 flex justify-between items-center">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </Button>
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
      
      {(grid && isGameReady) ? (
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
      ) : <div className="w-[500px]">No Game In Progress...</div>}
      <ScoreBoard />
    </Card>
  );
};
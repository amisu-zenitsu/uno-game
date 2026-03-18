"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { AnimatePresence, motion } from "framer-motion";

type ToastMessage = { id: number; text: string; type?: 'info' | 'error' | 'success' };
import { Lobby } from "@/components/Lobby";
import { GameRoom } from "@/components/GameRoom";
import { Card } from "@/lib/gameLogic";

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const roomIdRef = useRef(roomId);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const isHost = players.length > 0 && socket ? players[0].id === socket.id : false;
  
  const [gameStatus, setGameStatus] = useState<"lobby" | "playing" | "finished">("lobby");
  const gameStatusRef = useRef(gameStatus);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);
  
  // Game State
  const [hand, setHand] = useState<Card[]>([]);
  const [topCard, setTopCard] = useState<Card | null>(null);
  const [currentTurn, setCurrentTurn] = useState<string>("");
  const [gamePlayers, setGamePlayers] = useState<{ id: string; name: string; cardCount: number }[]>([]);
  
  // Advanced Game State
  const [currentColor, setCurrentColor] = useState<string | null>(null);
  const [activePenalty, setActivePenalty] = useState<number>(0);
  const [hasDrawnThisTurn, setHasDrawnThisTurn] = useState<boolean>(false);
  const [unCalledUno, setUnCalledUno] = useState<string | null>(null);
  const [turnStartTime, setTurnStartTime] = useState<number | null>(null);
  const [winners, setWinners] = useState<{ id: string, name: string, rank: number }[]>([]);

  // Toast System
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    let newSocket: Socket | null = null;
    
    // In React 18 Strict Mode, useEffect runs twice. We need to ensure we don't 
    // create multiple orphaned socket connections that break the host state.
    const initSocket = () => {
      // Dynamically connect to the socket server
      // The custom server now handles both Next.js and Socket.IO on the exact same port natively.
      newSocket = io(window.location.origin);
      setSocket(newSocket);

      newSocket.on("connect", () => {
        console.log("Connected to server:", newSocket?.id);
      });

      newSocket.on("playerJoined", (data: { playerId?: string; playerName?: string; players: { id: string; name: string }[] }) => {
        setPlayers(data.players);
        if (data.playerName && data.playerId !== newSocket?.id) {
            addToast(`${data.playerName} joined the room!`, 'success');
        }
      });

      newSocket.on("playerLeft", (data: { playerId: string; playerName?: string; wasHost?: boolean; players: { id: string; name: string }[] }) => {
        setPlayers(data.players);
        
        if (data.wasHost && gameStatusRef.current === "lobby") {
           addToast(`${data.playerName || 'The Host'} left the lobby! The next player is now Host.`, 'info');
        } else if (data.playerName) {
           addToast(`${data.playerName} left the room.`, 'info');
        }
      });

      newSocket.on("dealtCards", (cards: Card[]) => {
        setHand(cards);
      });

      newSocket.on("gameStarted", (data: { 
        topCard: Card; 
        currentTurn: string;
        currentColor?: string;
        activePenalty?: number;
        hasDrawnThisTurn?: boolean;
        unCalledUno?: string | null;
        turnStartTime?: number | null;
        players: { id: string; name: string; cardCount: number }[] 
      } | null) => {
        if (!data) return;
        setTopCard(data.topCard);
        setCurrentTurn(data.currentTurn);
        setGamePlayers(data.players);
        
        if (data.currentColor) setCurrentColor(data.currentColor);
        if (typeof data.activePenalty === 'number') setActivePenalty(data.activePenalty);
        if (typeof data.hasDrawnThisTurn === 'boolean') setHasDrawnThisTurn(data.hasDrawnThisTurn);
        if (data.unCalledUno !== undefined) setUnCalledUno(data.unCalledUno);
        if (data.turnStartTime !== undefined) setTurnStartTime(data.turnStartTime);
        setGameStatus("playing");
      });

      newSocket.on("gameFinished", (data: { winners: { id: string; name: string, rank: number }[] }) => {
        setWinners(data.winners);
        setGameStatus("finished");
      });

      newSocket.on("gameEnded", (data: { winners: { id: string; name: string, rank: number }[] }) => {
        setWinners(data.winners);
        setGameStatus("finished");
      });

      newSocket.on("returnedToLobby", (data: { players: { id: string; name: string }[] }) => {
        setWinners([]);
        setGameStatus("lobby");
        setPlayers(data.players);
      });
    };
    
    initSocket();

    // Cleanup
    return () => {
      if (newSocket) {
         newSocket.disconnect();
      }
    };
  }, []);

  const handleCreateRoom = (playerName: string) => {
    if (!socket) return;
    socket.emit("createRoom", playerName, (response: { roomId: string; players: { id: string; name: string }[] }) => {
      setRoomId(response.roomId);
      setPlayers(response.players);
    });
  };

  const handleJoinRoom = (id: string, playerName: string) => {
    if (!socket) return;
    socket.emit("joinRoom", { roomId: id, playerName }, (response: { success: boolean; roomId?: string; message?: string }) => {
      if (response.success) {
        setRoomId(response.roomId!);
      } else {
        addToast(response.message || "Failed to join room", 'error');
      }
    });
  };

  const handleStartGame = () => {
    if (!socket || !roomId) return;
    socket.emit("startGame", roomId, (response: { success: boolean; message?: string }) => {
      if (!response.success) {
        addToast(response.message || "Failed to start game", 'error');
      }
    });
  };

  // The advanced play logic is now implemented on the server
  const handlePlayCards = (cards: Card[], declaredColor?: string) => {
    if (!socket || !roomId) return;
    socket.emit("playCard", { roomId, cards, declaredColor }, (res: any) => {
      if (!res?.success) addToast(res?.message || "Invalid move", 'error');
    });
  };

  const handleDrawCard = () => {
    if (!socket || !roomId) return;
    socket.emit("drawCard", roomId, (res: any) => {
      if (!res?.success) addToast(res?.message || "Failed to draw", 'error');
    });
  };

  const handleDrawPenalty = () => {
    if (!socket || !roomId) return;
    socket.emit("drawPenalty", roomId, (res: any) => {
      if (!res?.success) addToast(res?.message || "Failed to draw penalty", 'error');
    });
  };

  const handlePassTurn = () => {
    if (!socket || !roomId) return;
    socket.emit("passTurn", roomId, (res: any) => {
      if (!res?.success) addToast(res?.message || "Failed to pass", 'error');
    });
  };

  const handleCallUno = () => {
    if (!socket || !roomId) return;
    socket.emit("callUno", roomId, (res: any) => {
      if (!res?.success) addToast(res?.message || "Couldn't call UNO!", 'error');
      else if (res.safe) addToast("UNO! You are safe!", 'success');
      else if (res.caught) addToast("You caught them! They drew 2 cards!", 'success');
    });
  };

  const handleReturnToLobby = () => {
    if (!socket || !roomId) return;
    socket.emit("returnToLobby", roomId);
  };

  const handleLeaveRoom = () => {
    if (!socket || !roomId) return;
    socket.emit("leaveRoom", roomId, (res: any) => {
      if (res?.success) {
        setRoomId(null);
        setGameStatus("lobby"); // Technically redundant since roomId clears, but safe
        setPlayers([]);
        setWinners([]);
      }
    });
  };

  if (!socket) return null; // Wait for hydration / connection

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Toast Notifications container */}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`px-4 py-3 rounded-xl shadow-2xl border text-sm font-bold text-center ${
                toast.type === 'error' ? 'bg-red-900/90 border-red-500/50 text-red-100' :
                toast.type === 'success' ? 'bg-green-900/90 border-green-500/50 text-green-100' :
                'bg-zinc-800/90 border-zinc-500/50 text-zinc-100'
              } backdrop-blur-md`}
            >
              {toast.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {gameStatus === "lobby" ? (
        <Lobby
          roomId={roomId}
          isHost={isHost}
          players={players}
          currentPlayerId={socket.id!}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onStartGame={handleStartGame}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
          <GameRoom
            roomId={roomId!}
            myId={socket.id!}
            players={gamePlayers}
            hand={hand}
            topCard={topCard}
            currentTurn={currentTurn}
            currentColor={currentColor}
            activePenalty={activePenalty}
            hasDrawnThisTurn={hasDrawnThisTurn}
            unCalledUno={unCalledUno}
            turnStartTime={turnStartTime}
            onPlayCards={handlePlayCards}
            onDrawCard={handleDrawCard}
            onDrawPenalty={handleDrawPenalty}
            onPassTurn={handlePassTurn}
            onCallUno={handleCallUno}
            onLeaveRoom={handleLeaveRoom}
          />
      )}

      {/* End Game Overlay */}
      {gameStatus === "finished" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border border-white/20 bg-zinc-900/80 p-8 md:p-12 text-center shadow-2xl">
            <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white">
              GAME OVER
            </h2>
            
            <div className="w-full flex-col gap-3 flex mt-4 mb-4">
              <h3 className="text-xl font-bold text-zinc-300 mb-2 uppercase tracking-widest border-b border-white/10 pb-2">Leaderboard</h3>
              {winners.length > 0 ? (
                winners.map((win) => (
                  <div key={win.id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${win.id === socket?.id ? 'bg-yellow-500/20 border border-yellow-500/50' : 'bg-white/5 border border-white/10'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full font-black ${win.rank === 1 ? 'bg-yellow-400 text-yellow-900' : win.rank === 2 ? 'bg-zinc-300 text-zinc-800' : win.rank === 3 ? 'bg-amber-600 text-amber-950' : 'bg-zinc-800 text-zinc-400'}`}>
                        {win.rank}
                      </span>
                      <span className={`font-bold ${win.id === socket?.id ? 'text-yellow-400' : 'text-white'}`}>
                        {win.name} {win.id === socket?.id && "(You)"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xl text-zinc-400 italic">Game ended without winners.</p>
              )}
            </div>

            <button
              onClick={handleReturnToLobby}
              className="mt-4 w-full rounded-full bg-gradient-to-r from-red-500 to-red-700 px-8 py-4 font-bold text-white shadow-lg shadow-red-500/30 transition-transform hover:scale-105 active:scale-95 text-lg"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

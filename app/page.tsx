"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Lobby } from "@/components/Lobby";
import { GameRoom } from "@/components/GameRoom";
import { Card } from "@/lib/gameLogic";

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [gameStatus, setGameStatus] = useState<"lobby" | "playing" | "finished">("lobby");
  
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

      newSocket.on("playerJoined", (data: { players: { id: string; name: string }[] }) => {
        setPlayers(data.players);
      });

      newSocket.on("playerLeft", (data: { playerId: string; players: { id: string; name: string }[] }) => {
        setPlayers(data.players);
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
      }) => {
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
      setIsHost(true);
      setPlayers(response.players);
    });
  };

  const handleJoinRoom = (id: string, playerName: string) => {
    if (!socket) return;
    socket.emit("joinRoom", { roomId: id, playerName }, (response: { success: boolean; roomId?: string; message?: string }) => {
      if (response.success) {
        setRoomId(response.roomId!);
        setIsHost(false);
      } else {
        alert(response.message);
      }
    });
  };

  const handleStartGame = () => {
    if (!socket || !roomId) return;
    socket.emit("startGame", roomId, (response: { success: boolean; message?: string }) => {
      if (!response.success) {
        alert(response.message);
      }
    });
  };

  // The advanced play logic is now implemented on the server
  const handlePlayCards = (cards: Card[], declaredColor?: string) => {
    if (!socket || !roomId) return;
    socket.emit("playCard", { roomId, cards, declaredColor }, (res: any) => {
      if (!res?.success) alert(res?.message || "Invalid move");
    });
  };

  const handleDrawCard = () => {
    if (!socket || !roomId) return;
    socket.emit("drawCard", roomId, (res: any) => {
      if (!res?.success) alert(res?.message || "Failed to draw");
    });
  };

  const handleDrawPenalty = () => {
    if (!socket || !roomId) return;
    socket.emit("drawPenalty", roomId, (res: any) => {
      if (!res?.success) alert(res?.message || "Failed to draw penalty");
    });
  };

  const handlePassTurn = () => {
    if (!socket || !roomId) return;
    socket.emit("passTurn", roomId, (res: any) => {
      if (!res?.success) alert(res?.message || "Failed to pass");
    });
  };

  const handleCallUno = () => {
    if (!socket || !roomId) return;
    socket.emit("callUno", roomId, (res: any) => {
      if (!res?.success) alert(res?.message || "Couldn't call UNO!");
      else if (res.safe) alert("You are safe!");
      else if (res.caught) alert("You caught them! They drew 2 cards!");
    });
  };

  const handleReturnToLobby = () => {
    if (!socket || !roomId) return;
    socket.emit("returnToLobby", roomId);
  };

  if (!socket) return null; // Wait for hydration / connection

  return (
    <main className="min-h-screen relative">
      {gameStatus === "lobby" ? (
        <Lobby
          roomId={roomId}
          isHost={isHost}
          players={players}
          currentPlayerId={socket.id!}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onStartGame={handleStartGame}
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

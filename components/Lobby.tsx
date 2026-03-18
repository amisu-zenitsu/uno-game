"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Loader2 } from "lucide-react";

export interface LobbyPlayer {
  id: string;
  name: string;
}

interface LobbyProps {
  onJoinRoom: (roomId: string, playerName: string) => void;
  onCreateRoom: (playerName: string) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  players: LobbyPlayer[];
  roomId: string | null;
  isHost: boolean;
  currentPlayerId: string;
}

export function Lobby({
  onJoinRoom,
  onCreateRoom,
  onStartGame,
  onLeaveRoom,
  players,
  roomId,
  isHost,
  currentPlayerId,
}: LobbyProps) {
  const [joinInput, setJoinInput] = useState("");
  const [playerName, setPlayerName] = useState("");

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinInput.trim() && playerName.trim()) {
      onJoinRoom(joinInput.trim().toUpperCase(), playerName.trim());
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-8 text-center">
          <motion.div
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            className="mb-4 inline-flex h-24 w-40 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/20"
          >
            <span className="text-3xl font-black italic tracking-tighter text-white drop-shadow-md text-center leading-tight">
              UNO<br/>STARS
            </span>
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Au Chemical 25-29
          </h1>
          <p className="mt-2 text-zinc-400 font-medium">
            {roomId
              ? `Waiting Room: ${roomId}`
              : "Join or Create a Match"}
          </p>
        </div>

        {!roomId ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter Your Name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                maxLength={12}
              />
            </div>

            <button
              onClick={() => {
                if (playerName.trim()) onCreateRoom(playerName.trim());
              }}
              disabled={!playerName.trim()}
              className="w-full rounded-xl bg-white px-4 py-4 font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              Create New Game
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#09090b] px-2 text-zinc-500">Or</span>
              </div>
            </div>

            <form onSubmit={handleJoinSubmit} className="flex gap-2">
              <input
                type="text"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Enter Room Code"
                className="flex-1 uppercase rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                maxLength={6}
              />
              <button
                type="submit"
                disabled={!joinInput.trim() || !playerName.trim()}
                className="rounded-xl bg-zinc-800 px-6 font-bold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                Join
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/5 bg-white/5 p-4">
              <div className="mb-4 flex items-center gap-2 text-zinc-400">
                <Users size={18} />
                <span className="text-sm font-medium">Players ({players.length})</span>
              </div>
              <ul className="space-y-2 text-sm text-zinc-300">
                {players.map((p, index) => (
                  <motion.li
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 rounded-lg bg-black/40 p-3"
                    key={p.id}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-xs font-bold text-white shadow-inner">
                      P{index + 1}
                    </div>
                    <span>
                      {p.id === currentPlayerId ? `${p.name} (You)` : p.name}
                    </span>
                    {index === 0 && (
                      <span className="ml-auto rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70 uppercase">
                        Host
                      </span>
                    )}
                  </motion.li>
                ))}
              </ul>
            </div>

            {isHost ? (
              <button
                onClick={onStartGame}
                disabled={players.length < 2}
                className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 px-4 py-4 font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
              >
                {players.length < 2 ? "Waiting for players..." : "Start Game"}
              </button>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-4 text-zinc-400">
                <Loader2 className="animate-spin" size={24} />
                <p className="text-sm">Waiting for host to start...</p>
              </div>
            )}
            <button
              onClick={onLeaveRoom}
              className="w-full mt-2 rounded-xl bg-red-900/40 hover:bg-red-900/60 border border-red-500/30 px-4 py-3 font-bold text-red-200 transition-colors"
            >
              Leave Lobby
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

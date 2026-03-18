"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UnoCard } from "./UnoCard";
import { type Card, type Color } from "@/lib/gameLogic";

interface GamePlayer {
  id: string;
  name: string;
  cardCount: number;
}

interface GameRoomProps {
  roomId: string;
  myId: string;
  players: GamePlayer[];
  hand: Card[];
  topCard: Card | null;
  playedHistory?: Card[];
  currentTurn: string;
  currentColor: string | null;
  activePenalty: number;
  hasDrawnThisTurn: boolean;
  unCalledUno: string | null;
  turnStartTime: number | null;
  onPlayCards: (cards: Card[], declaredColor?: string) => void;
  onDrawCard: () => void;
  onDrawPenalty: () => void;
  onPassTurn: () => void;
  onCallUno: () => void;
  onLeaveRoom: () => void;
}

export function GameRoom({
  roomId,
  myId,
  players,
  hand,
  topCard,
  playedHistory = [],
  currentTurn,
  currentColor,
  activePenalty,
  hasDrawnThisTurn,
  unCalledUno,
  turnStartTime,
  onPlayCards,
  onDrawCard,
  onDrawPenalty,
  onPassTurn,
  onCallUno,
  onLeaveRoom,
}: GameRoomProps) {
  const isMyTurn = currentTurn === myId;
  const opponents = players.filter((p) => p.id !== myId);

  // Multi-select state
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  // Color Picker State
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Determine if a single card can be selected initially based on game rules
  const canSelectCard = (card: Card) => {
    if (!isMyTurn || !topCard) return false;

    // If there's an active penalty, MUST play +2 or +4 (or draw)
    if (activePenalty > 0) {
      if (card.value !== 'DrawTwo' && card.value !== 'WildDrawFour') return false;
      // If top is +4, usually can only play another +4 on it
      if (topCard.value === 'WildDrawFour' && card.value !== 'WildDrawFour') return false;
      return true;
    }

    // Normal play
    if (card.color === "Wild" || card.value === "WildDrawFour") return true;
    const effectivePileColor = currentColor || topCard.color;
    return card.color === effectivePileColor || card.value === topCard.value;
  };

  const handleCardClick = (card: Card) => {
    if (!isMyTurn) return;

    // If card is already selected, unselect it
    if (selectedCards.find((c) => c.id === card.id)) {
      setSelectedCards(selectedCards.filter((c) => c.id !== card.id));
      return;
    }

    // If no cards are selected, check if this card is legally playable on the pile at all
    if (selectedCards.length === 0) {
      if (!canSelectCard(card)) return;
      setSelectedCards([card]);
    } else {
      // We are trying to add a card to a multi-play
      const firstSelected = selectedCards[0];
      
      // Multi-play rules: Must match value. Cannot multi-play Wilds.
      if (card.value !== firstSelected.value) return;
      if (firstSelected.color === 'Wild') return;
      
      setSelectedCards([...selectedCards, card]);
    }
  };

  const handleSubmitPlay = () => {
    if (selectedCards.length === 0) return;
    
    // Check if the played combo includes a wild. Since you can only multi-play colors of the SAME number,
    // and wilds cannot be multi-played, we only have to check the first card.
    const hasWild = selectedCards[0].color === 'Wild';
    if (hasWild) {
      setShowColorPicker(true);
    } else {
      onPlayCards(selectedCards);
      setSelectedCards([]);
    }
  };

  const handleColorSelection = (color: Color) => {
    onPlayCards(selectedCards, color);
    setShowColorPicker(false);
    setSelectedCards([]);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden overflow-y-auto bg-black/20 p-4 md:p-8">
      {/* Top Bar / Room Info */}
      <header className="absolute left-0 top-0 flex w-full items-center justify-between p-4 md:p-6 z-10">
        <div className="rounded-full bg-black/40 px-4 py-2 backdrop-blur-md border border-white/10 shadow-lg">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Room Code:
          </span>{" "}
          <span className="ml-2 font-mono text-sm text-white">{roomId}</span>
        </div>
        
        <button
          onClick={onLeaveRoom}
          className="rounded-full bg-red-900/50 hover:bg-red-900/80 border border-red-500/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-200 transition-colors backdrop-blur-md shadow-lg"
        >
          Leave Match
        </button>
      </header>

      {/* Opponents Area (Top of screen) */}
      <div className="flex w-full items-center justify-center gap-6 md:gap-12 mt-12 md:mt-4 mb-4 min-h-[120px]">
        {opponents.map((opponent, idx) => {
          const isOpponentTurn = currentTurn === opponent.id;
          return (
            <div key={opponent.id} className="flex flex-col items-center gap-3">
              <motion.div
                animate={{
                  scale: isOpponentTurn ? 1.1 : 1,
                  borderColor: isOpponentTurn
                    ? "rgba(255,255,255,0.8)"
                    : "rgba(255,255,255,0.1)",
                }}
                className="relative flex h-16 w-16 items-center justify-center rounded-2xl border bg-black/40 shadow-xl backdrop-blur-sm"
              >
                {/* 20s Timer Ring */}
                {isOpponentTurn && turnStartTime && (
                  <svg className="absolute -inset-2 h-20 w-20 -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="3"
                      fill="transparent"
                      className="rounded-2xl"
                    />
                    <motion.circle
                      cx="40"
                      cy="40"
                      r="36"
                      stroke="#ef4444"
                      strokeWidth="3"
                      fill="transparent"
                      strokeDasharray="226" // 2 * pi * 36
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 226 }}
                      transition={{
                        duration: 20,
                        ease: "linear",
                        repeat: 0,
                      }}
                    />
                  </svg>
                )}
                
                <div className="absolute -top-2 -right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm ring-2 ring-black">
                  {opponent.cardCount}
                </div>
                <span className="relative z-10 text-xl font-bold text-white/50">
                  {opponent.name ? opponent.name.substring(0, 2).toUpperCase() : `P${idx+1}`}
                </span>
                {isOpponentTurn && (
                  <span className="absolute -bottom-8 rounded-full bg-white px-3 py-1 text-[10px] font-bold text-black shadow-lg whitespace-nowrap">
                    THINKING...
                  </span>
                )}
              </motion.div>
              <span className="text-xs font-bold text-white/70 max-w-[80px] truncate text-center">
                {opponent.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Center Table Area (Draw deck & Discard pile) */}
      <div className="relative z-40 flex flex-1 w-full flex-col md:flex-row items-center justify-center gap-16 md:gap-16 py-12 min-h-[300px]">
        {/* Draw Pile & Pass/Penalty Actions */}
        <div className="relative flex flex-col items-center">
          {/* Contextual Action Buttons ABOVE the deck */}
          <AnimatePresence>
            {isMyTurn && activePenalty > 0 && (
               <motion.button
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: 10 }}
                 onClick={onDrawPenalty}
                 className="absolute -top-16 z-50 rounded-full bg-red-600 px-6 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(255,0,0,0.5)] transition-colors hover:bg-red-500 active:scale-95 whitespace-nowrap border-2 border-red-400"
               >
                 Draw Penalty ({activePenalty})
               </motion.button>
            )}

            {isMyTurn && hasDrawnThisTurn && (
               <motion.button
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: 10 }}
                 onClick={onPassTurn}
                 className="absolute -top-16 z-50 rounded-full border-2 border-blue-400 bg-blue-600 px-6 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(37,99,235,0.5)] transition-colors hover:bg-blue-500 active:scale-95 whitespace-nowrap"
               >
                 Keep & Pass Turn
               </motion.button>
            )}
          </AnimatePresence>

          <div className="relative mt-2 cursor-pointer transition-transform hover:scale-105 active:scale-95">
            <UnoCard
              card={{ id: "deck", color: "Red", value: "0" }}
              isHidden={true}
              isPlayable={isMyTurn && !hasDrawnThisTurn && activePenalty === 0}
              onClick={isMyTurn && !hasDrawnThisTurn && activePenalty === 0 ? onDrawCard : undefined}
              className={isMyTurn && !hasDrawnThisTurn && activePenalty === 0 ? "ring-4 ring-white/50 ring-offset-4 ring-offset-transparent shadow-[0_0_30px_rgba(255,255,255,0.3)]" : ""}
            />
            {/* Deck stack visual effect */}
            <div className="absolute inset-0 -bottom-2 -left-2 -z-10 rounded-xl border border-white/10 bg-zinc-900" />
            <div className="absolute inset-0 -bottom-4 -left-4 -z-20 rounded-xl border border-white/10 bg-black" />
          </div>
        </div>

        {/* Discard Pile */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative transition-transform min-w-[128px]">
            <AnimatePresence mode="popLayout">
              {playedHistory && playedHistory.length > 0 ? (
                playedHistory.map((historyCard, idx) => {
                  const isTop = idx === playedHistory.length - 1;
                  const rotateOff = (idx - playedHistory.length + 1) * 8 + (Math.random() * 4 - 2);
                  const xOff = (idx - playedHistory.length + 1) * 6;
                  const yOff = (idx - playedHistory.length + 1) * 2;

                  return (
                    <motion.div
                      key={historyCard.id + "-" + idx}
                      initial={{ scale: 0.5, opacity: 0, rotate: Math.random() * 40 - 20, y: -50 }}
                      animate={{ scale: 1, opacity: 1, rotate: rotateOff, x: xOff, y: yOff }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="absolute inset-0"
                      style={{ zIndex: idx }}
                    >
                      <UnoCard card={historyCard} />
                      
                      {/* Show active color indicator if last card played was a Wild */}
                      {isTop && historyCard.color === 'Wild' && currentColor && (
                        <div className="absolute -bottom-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-black shadow-xl">
                          <div 
                            className="h-4 w-4 rounded-full" 
                            style={{ backgroundColor: currentColor === 'Yellow' ? '#ffaa00' : currentColor === 'Red' ? '#ff5555' : currentColor === 'Blue' ? '#5555ff' : '#55aa55' }}
                          />
                        </div>
                      )}
                    </motion.div>
                  )
                })
              ) : (
                <div className="h-48 w-32 rounded-xl border-2 border-dashed border-white/20 bg-black/20" />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Active Penalty Display */}
      {activePenalty > 0 && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[120%] z-0 pointer-events-none">
           <motion.div 
             initial={{ scale: 0, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="text-4xl font-black text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]"
           >
             +{activePenalty} STACK
           </motion.div>
        </div>
      )}

      {/* UNO! Buzzer Button */}
      <AnimatePresence>
        {unCalledUno && (
          <motion.div
            initial={{ scale: 0, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute left-1/2 top-[60%] z-[100] -translate-x-1/2 -translate-y-1/2"
          >
            <button
              onClick={onCallUno}
              className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-red-400 bg-red-600 shadow-[0_0_50px_rgba(220,38,38,0.8)] transition-transform hover:scale-110 active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-red-900/40 to-transparent" />
              <div className="absolute inset-x-0 top-0 h-1/2 bg-white/20" />
              <span className="relative z-10 text-4xl font-black italic tracking-tighter text-white drop-shadow-md">
                UNO!
              </span>
              <div className="absolute inset-0 animate-ping rounded-full border-4 border-red-400 opacity-20" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Hand Area */}
      <div className="relative z-50 mt-auto flex w-full flex-col items-center pt-8 pb-4">
        
        {/* Play Selected Action Row */}
        <div className="mb-6 flex h-16 items-center justify-center relative z-50">
          <AnimatePresence>
            {isMyTurn && selectedCards.length > 0 && !showColorPicker && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                onClick={handleSubmitPlay}
                className="rounded-full bg-green-500 px-8 py-3 font-black text-black shadow-[0_0_30px_rgba(85,170,85,0.6)] transition-transform hover:scale-105 active:scale-95"
              >
                PLAY SELECTED ({selectedCards.length})
              </motion.button>
            )}

            {isMyTurn && showColorPicker && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-3 rounded-full bg-black/80 px-4 py-2 backdrop-blur-md"
              >
                <span className="pr-2 text-sm font-bold text-white">Choose Color:</span>
                <button onClick={() => handleColorSelection('Red')} className="h-8 w-8 rounded-full border-2 border-white/20 bg-[#ff5555] shadow-[0_0_15px_rgba(255,85,85,0.5)] transition-transform hover:scale-125" />
                <button onClick={() => handleColorSelection('Blue')} className="h-8 w-8 rounded-full border-2 border-white/20 bg-[#5555ff] shadow-[0_0_15px_rgba(85,85,255,0.5)] transition-transform hover:scale-125" />
                <button onClick={() => handleColorSelection('Green')} className="h-8 w-8 rounded-full border-2 border-white/20 bg-[#55aa55] shadow-[0_0_15px_rgba(85,170,85,0.5)] transition-transform hover:scale-125" />
                <button onClick={() => handleColorSelection('Yellow')} className="h-8 w-8 rounded-full border-2 border-white/20 bg-[#ffaa00] shadow-[0_0_15px_rgba(255,170,0,0.5)] transition-transform hover:scale-125" />
                
                <button onClick={() => setShowColorPicker(false)} className="ml-2 text-xs font-bold text-zinc-400 hover:text-white">CANCEL</button>
              </motion.div>
            )}

          </AnimatePresence>

          {isMyTurn && (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-4 rounded-full bg-white/10 px-6 py-2 backdrop-blur-md border border-white/20 ml-4"
            >
              <span className="font-bold text-white tracking-widest text-sm">YOUR TURN</span>
              
              {turnStartTime && (
                <div className="relative flex h-6 w-6 items-center justify-center">
                  <svg className="absolute inset-0 h-6 w-6 -rotate-90">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="2"
                      fill="transparent"
                    />
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="#ef4444"
                      strokeWidth="2"
                      fill="transparent"
                      strokeDasharray="63" // 2 * pi * 10
                      initial={{ strokeDashoffset: 0 }}
                      animate={{ strokeDashoffset: 63 }}
                      transition={{
                        duration: 20,
                        ease: "linear",
                        repeat: 0,
                      }}
                    />
                  </svg>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <div className="relative flex w-full max-w-[100vw] justify-start md:justify-center overflow-x-auto overflow-y-hidden px-10 pb-[60px] pt-16 mask-edges">
          <div className="flex flex-nowrap justify-center transition-all hover:gap-2 mx-auto min-w-max">
            {hand.map((card, idx) => {
              // Calculate a slight rotation "fan" effect based on card position
              const rotationIndex = idx - Math.floor(hand.length / 2);
              const rotation = rotationIndex * 4;
              
              const isSelected = selectedCards.some(c => c.id === card.id);
              // For purely visual feedback, determine if it roughly COULD be clicked currently
              const looksPlayable = selectedCards.length === 0 ? canSelectCard(card) : (card.value === selectedCards[0].value && card.color !== 'Wild');

              return (
                <motion.div
                  key={card.id}
                  style={{
                    zIndex: isSelected ? 100 : idx,
                  }}
                  animate={{
                    rotate: isSelected ? 0 : rotation,
                    y: isSelected ? -40 : 0,
                    scale: isSelected ? 1.05 : 1,
                  }}
                  whileHover={{ 
                    y: isSelected ? -40 : -30, 
                    rotate: 0, 
                    scale: 1.1, 
                    zIndex: 100,
                    transition: { duration: 0.2 } 
                  }}
                  className="-ml-[3rem] md:-ml-[2rem] transition-all will-change-transform first:ml-0 last:mr-0 cursor-pointer"
                  onClick={() => handleCardClick(card)}
                >
                  <UnoCard
                    card={card}
                    isPlayable={isMyTurn && looksPlayable}
                    className={
                      isSelected 
                        ? "shadow-[0_0_30px_rgba(255,255,255,0.6)] border-white ring-2 ring-white" 
                        : (looksPlayable && isMyTurn ? "shadow-[0_0_10px_rgba(255,255,255,0.2)] hover:border-white/50" : "")
                    }
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

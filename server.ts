import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { generateDeck, shuffleDeck } from './lib/gameLogic';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const rooms = new Map();

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

// Helper to handle auto-play when AFK timer expires
function handleAutoPlay(roomId: string, playerId: string) {
  const room = rooms.get(roomId);
  if (!room || room.status !== 'playing' || room.currentTurn !== playerId) return;

  console.log(`Player ${playerId} AFK for 20s. Auto-playing...`);
  const player = room.players.find((p: any) => p.id === playerId);
  if (!player) return;

  const topCard = room.playedCards[room.playedCards.length - 1];
  
  // 1. If there's an active penalty, try to stack +2/+4, else draw penalty
  if (room.activePenalty > 0) {
    const validStackCard = player.hand.find((c: any) => 
       c.value === 'DrawTwo' || 
       (c.value === 'WildDrawFour' && topCard.value !== 'WildDrawFour')
    );
    if (validStackCard) {
      // Auto-play the stack card
      io.emit('fakeAutoPlay', { roomId, playerId, card: validStackCard }); // handled below
      return; 
    } else {
      // Auto-draw penalty
      for (let i = 0; i < room.activePenalty; i++) {
        if (room.deck.length === 0) {
            const top = room.playedCards.pop();
            room.deck = shuffleDeck(room.playedCards);
            room.playedCards = top ? [top] : [];
        }
        const c = room.deck.pop();
        if (c) player.hand.push(c);
      }
      io.to(player.id).emit('dealtCards', player.hand);
      room.activePenalty = 0;
      room.hasDrawnThisTurn = false;
      
      const currentIndex = room.players.findIndex((p: any) => p.id === player.id);
      let nextIndex = (currentIndex + (room.direction || 1)) % room.players.length;
      if (nextIndex < 0) nextIndex += room.players.length;
      setNextTurn(roomId, room.players[nextIndex].id, false);
      return;
    }
  }

  // 2. No penalty, find first valid card
  const validCard = player.hand.find((c: any) => 
     c.color === 'Wild' || c.color === 'WildDrawFour' || 
     c.color === room.currentColor || c.value === topCard.value
  );

  if (validCard) {
     // We will let the normal playCard logic handle it via a mock socket emit, or duplicate logic. 
     // Duplicating a slimmed down logic is safer here because we don't have the socket context.
     const idx = player.hand.findIndex((c: any) => c.id === validCard.id);
     player.hand.splice(idx, 1);
     room.playedCards.push(validCard);
     io.to(player.id).emit('dealtCards', player.hand);
     
     if (validCard.value === 'DrawTwo') room.activePenalty += 2;
     if (validCard.value === 'WildDrawFour') room.activePenalty += 4;
     room.currentColor = (validCard.color === 'Wild' || validCard.color === 'WildDrawFour') ? 'Red' : validCard.color;

     let skipCount = 1;
     if (validCard.value === 'Skip') skipCount = 2;
     if (validCard.value === 'Reverse') {
        room.direction = (room.direction || 1) * -1;
        if (room.players.length === 2) skipCount = 2;
     }

     if (player.hand.length === 0) {
        room.winners.push({ id: player.id, name: player.name, rank: room.winners.length + 1 });
        room.players = room.players.filter((p: any) => p.id !== player.id);
        io.to(player.id).emit('gameStarted', null); // Move winner to spectator state

        const winnersNeeded = Math.floor(room.initialPlayerCount / 2);
        if (room.winners.length >= winnersNeeded || room.players.length <= 1) {
          if (room.players.length === 1) {
            const lastPlayer = room.players[0];
            room.winners.push({ id: lastPlayer.id, name: lastPlayer.name, rank: room.winners.length + 1 });
            room.players = []; // CLEAR THE ARRAY so they don't get double appended on returnToLobby
          }
          room.status = 'finished';
          io.to(roomId).emit('gameEnded', { winners: room.winners });
          return;
        }
        
        // If not finished, pass turn to what is now the next person
        const currentIndex = room.players.findIndex((p: any) => p.id === room.currentTurn);
        let nextIdx = (currentIndex + (room.direction || 1) * skipCount) % room.players.length;
        if (nextIdx < 0) nextIdx += room.players.length;
        setNextTurn(roomId, room.players[nextIdx].id, false);
        return;
     }
     
     if (player.hand.length === 1) room.unCalledUno = player.id;
     else if (room.unCalledUno === player.id) room.unCalledUno = null;

     const currentIndex = room.players.findIndex((p: any) => p.id === player.id);
     let nextIndex = (currentIndex + (room.direction || 1) * skipCount) % room.players.length;
     if (nextIndex < 0) nextIndex += room.players.length;
     setNextTurn(roomId, room.players[nextIndex].id, false);

  } else {
     // 3. No valid cards, auto-draw 1 (if not drawn) and pass
     if (!room.hasDrawnThisTurn) {
       if (room.deck.length === 0) {
          const top = room.playedCards.pop();
          room.deck = shuffleDeck(room.playedCards);
          room.playedCards = top ? [top] : [];
       }
       const drawnCard = room.deck.pop();
       if (drawnCard) player.hand.push(drawnCard);
       io.to(player.id).emit('dealtCards', player.hand);
     }

     const currentIndex = room.players.findIndex((p: any) => p.id === player.id);
     let nextIndex = (currentIndex + (room.direction || 1)) % room.players.length;
     if (nextIndex < 0) nextIndex += room.players.length;
     setNextTurn(roomId, room.players[nextIndex].id, false);
  }
}

// Helper to transition turn and start the AFK timer
function setNextTurn(roomId: string, nextPlayerId: string, hasDrawn: boolean = false) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.currentTurn = nextPlayerId;
  room.hasDrawnThisTurn = hasDrawn;
  room.turnStartTime = Date.now();

  if (room.timerId) clearTimeout(room.timerId);
  room.timerId = setTimeout(() => {
     handleAutoPlay(roomId, nextPlayerId);
  }, 20000); // 20 seconds AFK timer

  // Broadcast the new state broadly
  io.to(roomId).emit('gameStarted', {
    topCard: room.playedCards[room.playedCards.length - 1],
    currentTurn: room.currentTurn,
    currentColor: room.currentColor,
    activePenalty: room.activePenalty,
    hasDrawnThisTurn: room.hasDrawnThisTurn,
    turnStartTime: room.turnStartTime,
    unCalledUno: room.unCalledUno,
    players: room.players.map((p: any) => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
  });
}


io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create a new room
  socket.on('createRoom', (playerName: string, callback) => {
    // Generate a simple alphanumeric room code
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    rooms.set(roomId, {
      id: roomId,
      players: [{ id: socket.id, name: playerName || 'Host', hand: [] }],
      deck: [],
      playedCards: [],
      currentTurn: null,
      status: 'waiting',
      direction: 1,
      activePenalty: 0,
      hasDrawnThisTurn: false,
      currentColor: null, // For wild card declarations
      unCalledUno: null, // Stores the ID of a player whose hand just became 1
      turnStartTime: null, // Epoch timestamp of when a turn started
      timerId: null // NodeJS timer reference
    });
    
    socket.join(roomId);
    console.log(`Room created: ${roomId} by ${socket.id} (${playerName})`);
    
    // Return the room ID and initial player list to the creator
    if (typeof callback === 'function') {
      const room = rooms.get(roomId);
      callback({ roomId, players: room.players.map((p: any) => ({ id: p.id, name: p.name })) });
    }
  });

  // Join an existing room
  socket.on('joinRoom', ({ roomId, playerName }, callback) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: 'Room not found' });
      return;
    }
    
    if (room.status !== 'waiting') {
      if (typeof callback === 'function') callback({ success: false, message: 'Game has already started' });
      return;
    }

    const requestedName = playerName || `Player ${room.players.length + 1}`;
    const nameTaken = room.players.some((p: any) => p.name.toLowerCase() === requestedName.toLowerCase());
    
    if (nameTaken) {
      if (typeof callback === 'function') callback({ success: false, message: 'Name is already taken in this room' });
      return;
    }

    room.players.push({ id: socket.id, name: requestedName, hand: [] });
    socket.join(roomId);
    console.log(`Player ${socket.id} (${playerName}) joined room ${roomId}`);
    
    // Notify everyone in the room that a new player joined
    io.to(roomId).emit('playerJoined', {
      playerId: socket.id,
      playerName: requestedName,
      players: room.players.map((p: any) => ({ id: p.id, name: p.name }))
    });

    if (typeof callback === 'function') {
      callback({ success: true, roomId });
    }
  });

  // Explicitly Leave a Room
  socket.on('leaveRoom', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
       if (typeof callback === 'function') callback({ success: false });
       return;
    }

    const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
    if (playerIndex !== -1) {
      const playerThatLeft = room.players[playerIndex];
      room.players.splice(playerIndex, 1);
      socket.leave(roomId);
      console.log(`Player ${socket.id} explicitly left room ${roomId}`);

      if (room.players.length === 0) {
        if (room.timerId) clearTimeout(room.timerId);
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('playerLeft', {
          playerId: socket.id,
          playerName: playerThatLeft.name,
          wasHost: playerIndex === 0,
          players: room.players.map((p: any) => ({ id: p.id, name: p.name }))
        });

        if (room.status === 'playing') {
          if (room.players.length < 2) {
            if (room.timerId) clearTimeout(room.timerId);
            room.status = 'finished';
            io.to(roomId).emit('gameEnded', { reason: 'Not enough players' });
          } else {
            // If the person who left was the active player, we MUST pass the turn so the game continues!
            if (room.currentTurn === socket.id) {
               // Player was removed, so `playerIndex` now points to the player AFTER them
               let nextIndex = playerIndex % room.players.length;
               if (room.direction === -1) {
                  nextIndex = (playerIndex - 1 + room.players.length) % room.players.length;
               }
               setNextTurn(roomId, room.players[nextIndex].id, false);
            } else {
               // Even if it wasn't their turn, we need to re-emit gameStarted so remaining players' UI updates!
               io.to(roomId).emit('gameStarted', {
                  topCard: room.playedCards[room.playedCards.length - 1],
                  currentTurn: room.currentTurn,
                  currentColor: room.currentColor,
                  activePenalty: room.activePenalty,
                  hasDrawnThisTurn: room.hasDrawnThisTurn,
                  unCalledUno: room.unCalledUno,
                  players: room.players.map((p: any) => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
               });
            }
          }
        }
      }
    }
    if (typeof callback === 'function') callback({ success: true });
  });

  // Start the game and deal cards
  socket.on('startGame', (roomId, callback) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: 'Room not found' });
      return;
    }

    if (room.players.length < 2) {
      if (typeof callback === 'function') callback({ success: false, message: 'Need at least 2 players to start' });
      return;
    }

    console.log(`Starting game in room ${roomId}`);
    room.status = 'playing';
    
    // Generate and shuffle the deck using gameLogic.ts
    let deck = shuffleDeck(generateDeck());
    
    // Set up basic game variables before hands are dealt
    room.winners = [];
    room.initialPlayerCount = room.players.length;
    
    // Deal 7 cards to each player
    room.players.forEach((player: any) => {
      player.hand = deck.splice(0, 7);
      // Emit the dealt cards privately to each player
      io.to(player.id).emit('dealtCards', player.hand);
    });

    // Determine the top card of the discard pile
    let topCard = deck.pop();
    if (!topCard) return; // Should never happen unless deck is empty initially

    // Rule in Uno: If the first card is Wild Draw Four, put it back and draw another.
    // For simplicity, we just pop a card.
    room.playedCards.push(topCard);
    room.deck = deck;
    room.activePenalty = 0;
    room.hasDrawnThisTurn = false;
    room.currentColor = topCard.color === 'Wild' ? 'Red' : topCard.color; // default to red if first card is wild

    // Start the game by kicking off the turn timer for player 0
    setNextTurn(roomId, room.players[0].id, false);

    if (typeof callback === 'function') callback({ success: true });
  });

  // Return players to lobby after game ends
  socket.on('returnToLobby', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
       if (typeof callback === 'function') callback({ success: false });
       return;
    }

    if (room.timerId) clearTimeout(room.timerId);

    // Reset game-specific state
    room.status = 'waiting';
    room.deck = [];
    room.playedCards = [];
    room.currentTurn = null;
    room.direction = 1;
    room.activePenalty = 0;
    room.hasDrawnThisTurn = false;
    room.currentColor = null;
    room.unCalledUno = null;
    room.turnStartTime = null;
    room.timerId = null;

    room.players.forEach((p: any) => p.hand = []);
    
    // Add winners back to the main room players array so they aren't kicked
    if (room.winners && room.winners.length > 0) {
      room.winners.forEach((w: any) => {
        room.players.push({ id: w.id, name: w.name, hand: [] });
      });
      room.winners = [];
    }

    // Broadcast state to all
    io.to(roomId).emit('returnedToLobby', {
      players: room.players.map((p: any) => ({ id: p.id, name: p.name }))
    });

    if (typeof callback === 'function') callback({ success: true });
  });

  // Handle drawing a card
  socket.on('drawCard', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    if (room.currentTurn !== socket.id) {
      if (typeof callback === 'function') callback({ success: false, message: "Not your turn!" });
      return;
    }
    
    // Cannot draw a regular card if there is an active penalty!
    if (room.activePenalty > 0) {
      if (typeof callback === 'function') callback({ success: false, message: `You must draw the penalty of ${room.activePenalty} cards!` });
      return;
    }

    const player = room.players.find((p: any) => p.id === socket.id);
    if (!player) return;

    // Reshuffle discard pile if deck is empty
    if (room.deck.length === 0) {
      const top = room.playedCards.pop();
      room.deck = shuffleDeck(room.playedCards);
      room.playedCards = top ? [top] : [];
    }

    const drawnCard = room.deck.pop();
    if (drawnCard) {
      player.hand.push(drawnCard);

      if (player.hand.length > 15) {
        console.log(`Player ${player.name} eliminated for having > 15 cards.`);
        room.playedCards.push(...player.hand);
        room.players = room.players.filter((p: any) => p.id !== player.id);
        io.to(player.id).emit('gameStarted', null); // Force them out 

        if (room.players.length === 1) {
          if (room.timerId) clearTimeout(room.timerId);
          const lastPlayer = room.players[0];
          room.winners.push({ id: lastPlayer.id, name: lastPlayer.name, rank: room.winners.length + 1 });
          room.status = 'finished';
          io.to(roomId).emit('gameFinished', { winners: room.winners });
          if (typeof callback === 'function') callback({ success: true });
          return;
        }

        // Pass turn
        const currentIndex = room.players.findIndex((p: any) => p.id === room.currentTurn);
        let nextIndex = (currentIndex + (room.direction || 1)) % room.players.length;
        if (nextIndex < 0) nextIndex += room.players.length;
        setNextTurn(roomId, room.players[nextIndex].id, false);
      } else {
        io.to(player.id).emit('dealtCards', player.hand);
        
        const topCard = room.playedCards[room.playedCards.length - 1];
        const effectiveColor = room.currentColor || topCard.color;
        
        // Scan hand to see if they possess any playable cards now
        const hasPlayableCards = player.hand.some((c: any) => 
           c.color === 'Wild' || c.color === 'WildDrawFour' ||
           c.color === effectiveColor || c.value === topCard.value
        );

        if (!hasPlayableCards) {
          console.log(`Player ${player.name} drew but still has no valid moves. Auto-passing turn.`);
          const currentIndex = room.players.findIndex((p: any) => p.id === player.id);
          let nextIndex = (currentIndex + (room.direction || 1)) % room.players.length;
          if (nextIndex < 0) nextIndex += room.players.length;
          
          setNextTurn(roomId, room.players[nextIndex].id, false);
          if (typeof callback === 'function') callback({ success: true });
          return;
        }

        // They drew and have a viable move, so we let them choose
        room.hasDrawnThisTurn = true; 
  
        io.to(roomId).emit('gameStarted', {
          topCard: room.playedCards[room.playedCards.length - 1],
          currentTurn: room.currentTurn,
          currentColor: room.currentColor,
          activePenalty: room.activePenalty,
          hasDrawnThisTurn: room.hasDrawnThisTurn,
          turnStartTime: room.turnStartTime,
          unCalledUno: room.unCalledUno,
          players: room.players.map((p: any) => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
        });
      }
      if (typeof callback === 'function') callback({ success: true });
    }
  });

  // Handle ending turn (if you drew and don't want to play)
  socket.on('passTurn', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    if (room.currentTurn !== socket.id || !room.hasDrawnThisTurn) {
       if (typeof callback === 'function') callback({ success: false, message: "Can't pass right now." });
       return;
    }

    const currentIndex = room.players.findIndex((p: any) => p.id === socket.id);
    let nextIndex = (currentIndex + (room.direction || 1)) % room.players.length;
    if (nextIndex < 0) nextIndex += room.players.length;
    
    setNextTurn(roomId, room.players[nextIndex].id, false);

    if (typeof callback === 'function') callback({ success: true });
  });

  // Handle paying penalty (+2/+4 stack)
  socket.on('drawPenalty', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    if (room.currentTurn !== socket.id || room.activePenalty <= 0) {
      if (typeof callback === 'function') callback({ success: false, message: "No active penalty!" });
      return;
    }
    
    const player = room.players.find((p: any) => p.id === socket.id);
    if (!player) return;

    for (let i = 0; i < room.activePenalty; i++) {
      if (room.deck.length === 0) {
          const top = room.playedCards.pop();
          room.deck = shuffleDeck(room.playedCards);
          room.playedCards = top ? [top] : [];
      }
      const c = room.deck.pop();
      if (c) player.hand.push(c);
    }
    
    room.activePenalty = 0;
    room.hasDrawnThisTurn = false;
    
    // Check elimination
    if (player.hand.length > 15) {
      console.log(`Player ${player.name} eliminated for having > 15 cards.`);
      room.playedCards.push(...player.hand);
      room.players = room.players.filter((p: any) => p.id !== player.id);
      io.to(player.id).emit('gameStarted', null); // Force them out 
    } else {
      io.to(player.id).emit('dealtCards', player.hand);
    }
    
    if (room.players.length === 1) {
      if (room.timerId) clearTimeout(room.timerId);
      room.status = 'finished';
      io.to(roomId).emit('gameFinished', { winner: room.players[0] });
      if (typeof callback === 'function') callback({ success: true });
      return;
    }

    // Skip turn after taking penalty
    const currentIndex = room.players.findIndex((p: any) => p.id === room.currentTurn);
    let nextIndex = (currentIndex + (room.direction || 1)) % room.players.length;
    if (nextIndex < 0) nextIndex += room.players.length;
    
    setNextTurn(roomId, room.players[nextIndex].id, false);

    if (typeof callback === 'function') callback({ success: true });
  });

  // Multi-play card route
  socket.on('playCard', ({ roomId, cards, declaredColor }, callback) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    if (room.currentTurn !== socket.id) {
      if (typeof callback === 'function') callback({ success: false, message: "Not your turn!" });
      return;
    }

    const player = room.players.find((p: any) => p.id === socket.id);
    if (!player || !Array.isArray(cards) || cards.length === 0) return;

    // Verify player actually has all these cards
    const playerHandIds = player.hand.map((c: any) => c.id);
    for (const card of cards) {
      if (!playerHandIds.includes(card.id)) {
        if (typeof callback === 'function') callback({ success: false, message: "Card not in hand" });
        return;
      }
    }

    // Verify internal coherence of the multi-play combo
    const firstCard = cards[0];
    const isMultiPlay = cards.length > 1;

    if (isMultiPlay) {
       const allSameValue = cards.every(c => c.value === firstCard.value);
       if (!allSameValue) {
          if (typeof callback === 'function') callback({ success: false, message: "Must be same value to multi-play." });
          return;
       }
       if (firstCard.color === 'Wild') {
          if (typeof callback === 'function') callback({ success: false, message: "Cannot multi-play wilds." });
          return;
       }
    }

    const topCard = room.playedCards[room.playedCards.length - 1];
    const isWild = firstCard.color === 'Wild' || firstCard.color === 'WildDrawFour';
    
    // Enforcement of active penalty +2/+4 rules
    if (room.activePenalty > 0) {
       if (firstCard.value !== 'DrawTwo' && firstCard.value !== 'WildDrawFour') {
           if (typeof callback === 'function') callback({ success: false, message: `Must play a +2 or +4, or Draw Penalty (${room.activePenalty})!` });
           return;
       }
       // If top is +4, you can only play +4 on it (implied by typical house rules, but if +2 allowed on +4, remove this)
       if (topCard.value === 'WildDrawFour' && firstCard.value !== 'WildDrawFour') {
           if (typeof callback === 'function') callback({ success: false, message: `Cannot put +2 on a +4!` });
           return;
       }
    }

    // Basic validity vs the top pile (or active color if last was wild)
    if (!isWild && room.activePenalty === 0) {
       // Since the user can now multiplay different colors as long as numbers match, the FIRST card evaluated determines validity
       // Check if ANY of the selected cards matches the pile. If so, valid.
       const hasMatch = cards.some(c => c.color === room.currentColor || c.value === topCard.value);
       if (!hasMatch) {
         if (typeof callback === 'function') callback({ success: false, message: "Invalid move against the pile!" });
         return;
       }
    }

    // Play all cards
    for (const card of cards) {
      const idx = player.hand.findIndex((c: any) => c.id === card.id);
      player.hand.splice(idx, 1);
      room.playedCards.push(card);
    }
    
    io.to(player.id).emit('dealtCards', player.hand);

    // Apply effects of the stack
    let skipCount = 1;
    let addedPenalty = 0;
    
    // The LAST card played establishes the new top of the pile features
    const actualTopPlayed = cards[cards.length - 1];
    
    room.currentColor = isWild ? (declaredColor || 'Red') : actualTopPlayed.color;

    if (actualTopPlayed.value === 'Skip') skipCount = 2;
    if (actualTopPlayed.value === 'Reverse') {
      const effectCount = cards.length;
      // Reverses: if odd, flip direction. If even, orientation is identical.
      if (effectCount % 2 !== 0) {
         room.direction = (room.direction || 1) * -1;
      }
      if (room.players.length === 2) skipCount = 1 + effectCount; // In 2-p, each acts as a skip
    }
    
    // Penalties stack linearly based on number of cards dropped
    if (actualTopPlayed.value === 'DrawTwo') {
      addedPenalty = 2 * cards.length;
    }
    if (actualTopPlayed.value === 'WildDrawFour') {
       addedPenalty = 4;
    }

    if (addedPenalty > 0) {
       room.activePenalty += addedPenalty;
       // We DON'T deal cards here anymore. The next player must manual draw penalty or stack.
    }

    // Move to next turn
    const currentIndex = room.players.findIndex((p: any) => p.id === socket.id);
    let nextIndex = (currentIndex + (room.direction || 1) * skipCount) % room.players.length;
    if (nextIndex < 0) nextIndex += room.players.length;
    
    // Check win before setting turn
    if (player.hand.length === 0) {
      if (room.timerId) clearTimeout(room.timerId);
      
      room.winners.push({ id: player.id, name: player.name, rank: room.winners.length + 1 });
      room.players = room.players.filter((p: any) => p.id !== player.id);
      io.to(player.id).emit('gameStarted', null);

      const winnersNeeded = Math.floor(room.initialPlayerCount / 2);
      if (room.winners.length >= winnersNeeded || room.players.length <= 1) {
        if (room.players.length === 1) {
           const lastPlayer = room.players[0];
           room.winners.push({ id: lastPlayer.id, name: lastPlayer.name, rank: room.winners.length + 1 });
        }
        room.status = 'finished';
        io.to(roomId).emit('gameEnded', { winners: room.winners });
        return;
      }

      // Re-calculate next turn with reduced player pool
      let nextIdx = (currentIndex + (room.direction || 1) * skipCount) % room.players.length;
      if (nextIdx < 0) nextIdx += room.players.length;
      setNextTurn(roomId, room.players[nextIdx].id, false);
      if (typeof callback === 'function') callback({ success: true });
      return;
    }

    // UNO! Buzzer logic: if hand becomes 1, mark them as vulnerable
    if (player.hand.length === 1) {
      room.unCalledUno = player.id;
    } else {
      // Cleared if they somehow got more cards
      if (room.unCalledUno === player.id) {
        room.unCalledUno = null; 
      }
    }

    setNextTurn(roomId, room.players[nextIndex].id, false);
    
    if (typeof callback === 'function') callback({ success: true });
  });

  // Call UNO Buzzer Handler
  socket.on('callUno', (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    if (!room.unCalledUno) {
      if (typeof callback === 'function') callback({ success: false, message: "No one has 1 card right now!" });
      return;
    }

    const targetPlayerId = room.unCalledUno;
    room.unCalledUno = null; // It's been called, clear the vulnerable state

    if (socket.id === targetPlayerId) {
      // The player clicked it themselves! They are safe.
      console.log(`Player ${socket.id} called UNO safely.`);
      
      io.to(roomId).emit('gameStarted', {
        topCard: room.playedCards[room.playedCards.length - 1],
        currentTurn: room.currentTurn,
        currentColor: room.currentColor,
        activePenalty: room.activePenalty,
        hasDrawnThisTurn: room.hasDrawnThisTurn,
        unCalledUno: null,
        players: room.players.map((p: any) => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
      });
      if (typeof callback === 'function') callback({ success: true, safe: true });
    } else {
      // Someone else caught them!
      console.log(`Player ${targetPlayerId} was caught without calling UNO by ${socket.id}! Penalty 2 cards.`);
      const targetPlayer = room.players.find((p: any) => p.id === targetPlayerId);
      if (targetPlayer) {
        for(let i=0; i<2; i++) {
           if (room.deck.length === 0) {
              const top = room.playedCards.pop();
              room.deck = shuffleDeck(room.playedCards);
              room.playedCards = top ? [top] : [];
          }
          const c = room.deck.pop();
          if (c) targetPlayer.hand.push(c);
        }
        
        io.to(targetPlayer.id).emit('dealtCards', targetPlayer.hand);
        
        // Elimination check on penalty
        if (targetPlayer.hand.length > 15) {
          room.playedCards.push(...targetPlayer.hand);
          room.players = room.players.filter((p: any) => p.id !== targetPlayer.id);
          io.to(targetPlayer.id).emit('gameStarted', null);
          if (room.players.length === 1) {
            room.winners.push({ id: room.players[0].id, name: room.players[0].name, rank: room.winners.length + 1 });
            room.status = 'finished';
            io.to(roomId).emit('gameFinished', { winners: room.winners });
            return;
          }
        }

        io.to(roomId).emit('gameStarted', {
            topCard: room.playedCards[room.playedCards.length - 1],
            currentTurn: room.currentTurn,
            currentColor: room.currentColor,
            activePenalty: room.activePenalty,
            hasDrawnThisTurn: room.hasDrawnThisTurn,
            unCalledUno: null,
            players: room.players.map((p: any) => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
        });
        if (typeof callback === 'function') callback({ success: true, caught: true });
      }
    }
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove player from any rooms they were in
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const playerThatLeft = room.players[playerIndex];
        room.players.splice(playerIndex, 1);
        console.log(`Removed player ${socket.id} from room ${roomId}`);
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`Deleted empty room ${roomId}`);
        } else {
          // Notify remaining players
          io.to(roomId).emit('playerLeft', {
            playerId: socket.id,
            playerName: playerThatLeft.name,
            wasHost: playerIndex === 0,
            players: room.players.map((p: any) => ({ id: p.id, name: p.name }))
          });
          
        // If the game was playing and only one player is left, end the game
        if (room.status === 'playing') {
          if (room.players.length < 2) {
            if (room.timerId) clearTimeout(room.timerId);
            room.status = 'finished';
            io.to(roomId).emit('gameEnded', { winners: room.winners, reason: 'Not enough players' });
          } else {
            // If the person who disconnected was the active player, we MUST pass the turn so the game continues!
            if (room.currentTurn === socket.id) {
               let nextIndex = playerIndex % room.players.length;
               if (room.direction === -1) {
                  nextIndex = (playerIndex - 1 + room.players.length) % room.players.length;
               }
               setNextTurn(roomId, room.players[nextIndex].id, false);
            } else {
               io.to(roomId).emit('gameStarted', {
                  topCard: room.playedCards[room.playedCards.length - 1],
                  currentTurn: room.currentTurn,
                  currentColor: room.currentColor,
                  activePenalty: room.activePenalty,
                  hasDrawnThisTurn: room.hasDrawnThisTurn,
                  unCalledUno: room.unCalledUno,
                  players: room.players.map((p: any) => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
               });
            }
          }
        }
        }
      }
    }
  });
  }); // End io.on('connection')

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Custom Socket.io Next.js server running in ${dev ? 'development' : 'production'} mode`);
  });
}); // End app.prepare()

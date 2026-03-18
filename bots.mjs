import { io } from "socket.io-client";

// Get Room ID from command line arguments
const args = process.argv.slice(2);
const ROOM_ID = args[0];

if (!ROOM_ID) {
  console.error("❌ Please provide a Room Code to join!");
  console.error("Usage: node bots.mjs <ROOM_CODE>");
  process.exit(1);
}

const SERVER_URL = "http://localhost:3000";
const NUM_BOTS = 3;

// Helper to simulate thinking time
const delay = (ms) => new Promise(res => setTimeout(res, ms));

function createBot(botIndex) {
  const socket = io(SERVER_URL);
  const botName = `AI_${["Nova", "Echo", "Atlas"][botIndex]}`;
  
  let myHand = [];
  let currentGameState = null;

  socket.on("connect", () => {
    console.log(`🤖 [${botName}] Connected to server!`);
    
    // Attempt to join the room
    socket.emit("joinRoom", { roomId: ROOM_ID, playerName: botName }, (res) => {
      if (res.success) {
        console.log(`✅ [${botName}] Successfully joined room ${ROOM_ID}`);
      } else {
        console.error(`❌ [${botName}] Failed to join room: ${res.message}`);
        socket.disconnect();
      }
    });
  });

  socket.on("dealtCards", (cards) => {
    myHand = cards;
  });

  socket.on("gameStarted", async (data) => {
    if (!data) return;
    currentGameState = data;

    // Is it our turn?
    if (data.currentTurn === socket.id) {
       console.log(`💭 [${botName}] Thinking...`);
       
       // Random thinking delay (1.5 to 3 seconds)
       await delay(1500 + Math.random() * 1500); 
       playTurn();
    }
    
    // Check if anyone forgot to call UNO just to be ruthless
    if (data.unCalledUno && data.unCalledUno !== socket.id) {
       if (Math.random() > 0.5) { // 50% chance to catch them
           await delay(1000);
           socket.emit("callUno", ROOM_ID, (res) => {
              if (res?.caught) console.log(`🚨 [${botName}] Caught someone missing UNO!`);
           });
       }
    }
  });

  socket.on("gameFinished", () => {
     console.log(`🏆 [${botName}] Game Finished! GG.`);
  });
  
  socket.on("gameEnded", () => {
     console.log(`🛑 [${botName}] Game Ended abruptly.`);
  });

  function playTurn() {
    if (!currentGameState) return;

    const { topCard, currentColor, activePenalty, hasDrawnThisTurn } = currentGameState;
    const effectiveColor = currentColor || topCard.color;

    // 1. If there's an active penalty, we MUST respond with +2/+4 or take the hit
    if (activePenalty > 0) {
       const stackCard = myHand.find(c => 
          c.value === 'DrawTwo' || 
          (c.value === 'WildDrawFour' && topCard.value !== 'WildDrawFour')
       );
       
       if (stackCard) {
          console.log(`🔥 [${botName}] Playing stack card ${stackCard.color} ${stackCard.value}`);
          socket.emit("playCard", { roomId: ROOM_ID, cards: [stackCard], declaredColor: 'Red' }, (res) => {
             if (res && !res.success) console.log(`[${botName}] Error playing stack: ${res.message}`);
          });
       } else {
          console.log(`😭 [${botName}] Drawing penalty (${activePenalty} cards)`);
          socket.emit("drawPenalty", ROOM_ID, () => {});
       }
       return;
    }

    // 2. We have no penalty, normal turn logic
    const validCards = myHand.filter(c => 
       c.color === 'Wild' || c.color === 'WildDrawFour' ||
       c.color === effectiveColor || c.value === topCard.value
    );

    if (validCards.length > 0) {
       // Pick a random valid card
       const cardToPlay = validCards[Math.floor(Math.random() * validCards.length)];
       
       let declaredColor = undefined;
       if (cardToPlay.color === 'Wild' || cardToPlay.color === 'WildDrawFour') {
          // Count our colors to pick the best one
          const counts = { Red: 0, Blue: 0, Green: 0, Yellow: 0 };
          myHand.forEach(c => { if(counts[c.color]!==undefined) counts[c.color]++; });
          declaredColor = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
       }

       // Prepare to call UNO securely if we're going down to 1 card
       if (myHand.length === 2) {
          setTimeout(() => {
             socket.emit("callUno", ROOM_ID, (res) => {
                if (res?.safe) console.log(`📢 [${botName}] UNO!`);
             });
          }, 300); // Trigger safely slightly after play goes through
       }

       console.log(`🃏 [${botName}] Plays ${cardToPlay.color} ${cardToPlay.value} ${declaredColor ? '(Sets ' + declaredColor + ')' : ''}`);
       socket.emit("playCard", { roomId: ROOM_ID, cards: [cardToPlay], declaredColor }, (res) => {
          if (res && !res.success) console.log(`[${botName}] Error playing card: ${res.message}`);
       });
       
    } else {
       // We have no valid cards to play
       if (!hasDrawnThisTurn) {
           console.log(`🔄 [${botName}] No plays available. Drawing a card...`);
           socket.emit("drawCard", ROOM_ID, (res) => {
              if (res && !res.success) console.log(`[${botName}] Error drawing: ${res.message}`);
           });
       } else {
           console.log(`⏭️ [${botName}] Still no plays. Passing turn.`);
           socket.emit("passTurn", ROOM_ID, (res) => {
              if (res && !res.success) console.log(`[${botName}] Error passing: ${res.message}`);
           });
       }
    }
  }

  return socket;
}

// Stagger bot connections to simulate real players
for (let i = 0; i < NUM_BOTS; i++) {
  setTimeout(() => {
    createBot(i);
  }, i * 800);
}

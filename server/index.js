const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: 'https://poker-client-dkvn.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
}));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://poker-client-dkvn.onrender.com',
    methods: ['GET', 'POST']
  }
});

// אחסון זמני במקום MySQL - פתרון מהיר
const tables = new Map();
const players = new Map();

// פונקציות עזר
function getTableData(tableId) {
  if (!tables.has(tableId)) {
    tables.set(tableId, {
      id: tableId,
      pot: 0,
      currentTurn: 0,
      communityCards: [],
      log: [],
      players: [],
      gameStarted: false,
      currentRound: 'preflop' // preflop, flop, turn, river
    });
  }
  return tables.get(tableId);
}

function getPlayersInTable(tableId) {
  return Array.from(players.values()).filter(p => p.tableId === tableId);
}

function getNextActivePlayer(tableId, currentPlayerIndex) {
  const tablePlayers = getPlayersInTable(tableId);
  let nextIndex = (currentPlayerIndex + 1) % tablePlayers.length;
  let attempts = 0;
  
  // חיפוש השחקן הפעיל הבא (שלא עשה fold)
  while (attempts < tablePlayers.length) {
    const nextPlayer = tablePlayers[nextIndex];
    if (nextPlayer && !nextPlayer.folded) {
      return nextIndex;
    }
    nextIndex = (nextIndex + 1) % tablePlayers.length;
    attempts++;
  }
  
  return currentPlayerIndex; // אם לא נמצא שחקן פעיל, נשאר על הנוכחי
}

function checkIfRoundEnded(tableId) {
  const tablePlayers = getPlayersInTable(tableId);
  const activePlayers = tablePlayers.filter(p => !p.folded);
  
  if (activePlayers.length <= 1) {
    return true; // סיום המשחק - רק שחקן אחד נותר
  }
  
  // בדיקה אם כל השחקנים הפעילים הגיעו לאותו סכום הימור
  const activeBets = activePlayers.map(p => p.currentBet);
  const allBetsEqual = activeBets.every(bet => bet === activeBets[0]);
  
  return allBetsEqual;
}

function updateGameState(tableId) {
  const tableData = getTableData(tableId);
  const tablePlayers = getPlayersInTable(tableId);
  
  // עדכון השחקנים בטבלה
  tableData.players = tablePlayers;
  
  io.to(tableId).emit('state-update', {
    players: tablePlayers,
    pot: tableData.pot,
    currentTurn: tableData.currentTurn,
    communityCards: tableData.communityCards,
    log: tableData.log,
    gameStarted: tableData.gameStarted,
    currentRound: tableData.currentRound
  });
}

io.on('connection', (socket) => {
  console.log('🟢 שחקן התחבר:', socket.id);

  socket.on('join-table', (tableId) => {
    socket.join(tableId);
    console.log(`📥 ${socket.id} הצטרף לשולחן ${tableId}`);

    // יצירת שולחן אם לא קיים
    const tableData = getTableData(tableId);

    // בדיקה אם השחקן כבר קיים
    if (!players.has(socket.id)) {
      const existingPlayers = getPlayersInTable(tableId);
      const playerNumber = existingPlayers.length + 1;
      
      console.log(`➕ מוסיף שחקן חדש עם id ${socket.id} לשולחן ${tableId}`);
      
      players.set(socket.id, {
        id: socket.id,
        tableId: tableId,
        name: `שחקן ${playerNumber}`,
        chips: 1000,
        hand: [],
        currentBet: 0,
        folded: false,
        hasActed: false // האם השחקן פעל בסיבוב הנוכחי
      });
    }

    updateGameState(tableId);
  });

  socket.on('player-action', ({ tableId, action, playerId, amount }) => {
    const player = players.get(playerId);
    if (!player) {
      console.log(`❌ שחקן ${playerId} לא נמצא`);
      return;
    }

    const tableData = getTableData(tableId);
    const tablePlayers = getPlayersInTable(tableId);
    
    // בדיקה שזה התור של השחקן
    const currentPlayerIndex = tablePlayers.findIndex(p => p.id === playerId);
    if (currentPlayerIndex !== tableData.currentTurn) {
      console.log(`❌ לא התור של שחקן ${player.name}`);
      return;
    }

    // טיפול בפעולות השונות
    switch (action) {
      case 'fold':
        player.folded = true;
        tableData.log.unshift(`🚪 ${player.name} עשה fold`);
        break;
        
      case 'call':
        // חישוב כמה צריך להוסיף להגעה לסכום הגבוה ביותר
        const maxBet = Math.max(...tablePlayers.map(p => p.currentBet));
        const callAmount = maxBet - player.currentBet;
        if (player.chips >= callAmount) {
          player.chips -= callAmount;
          player.currentBet += callAmount;
          tableData.pot += callAmount;
          tableData.log.unshift(`📞 ${player.name} עשה call (${callAmount})`);
        }
        break;
        
      case 'raise':
        const raiseAmount = amount || 50; // סכום ברירת מחדל
        const currentMaxBet = Math.max(...tablePlayers.map(p => p.currentBet));
        const totalBetAmount = currentMaxBet + raiseAmount;
        const playerNeedsToPay = totalBetAmount - player.currentBet;
        
        if (player.chips >= playerNeedsToPay) {
          player.chips -= playerNeedsToPay;
          tableData.pot += playerNeedsToPay;
          player.currentBet = totalBetAmount;
          tableData.log.unshift(`📈 ${player.name} עשה raise ל-${totalBetAmount}`);
          
          // איפוס hasActed לכל השחקנים כי יש הימור חדש
          tablePlayers.forEach(p => {
            if (p.id !== playerId) {
              p.hasActed = false;
            }
          });
        }
        break;
        
      case 'check':
        tableData.log.unshift(`✅ ${player.name} עשה check`);
        break;
    }

    // סימון שהשחקן פעל
    player.hasActed = true;
    players.set(playerId, player);
    
    console.log(`🎯 שחקן ${player.name} עשה ${action}`);

    // מעבר לשחקן הבא
    if (!checkIfRoundEnded(tableId)) {
      tableData.currentTurn = getNextActivePlayer(tableId, tableData.currentTurn);
    } else {
      // סיום הסיבוב - עבור לשלב הבא או סיים את המשחק
      const activePlayers = tablePlayers.filter(p => !p.folded);
      if (activePlayers.length === 1) {
        // שחקן אחד נותר - הוא זוכה
        const winner = activePlayers[0];
        winner.chips += tableData.pot;
        tableData.log.unshift(`🏆 ${winner.name} זכה בסיבוב! (+${tableData.pot})`);
        tableData.pot = 0;
        tableData.gameStarted = false;
        // איפוס למצב התחלתי
        tablePlayers.forEach(p => {
          p.currentBet = 0;
          p.folded = false;
          p.hasActed = false;
          p.hand = [];
        });
        tableData.communityCards = [];
        tableData.currentRound = 'preflop';
      } else {
        // איפוס hasActed לסיבוב הבא
        tablePlayers.forEach(p => {
          p.hasActed = false;
        });
        tableData.currentTurn = 0;
      }
    }

    updateGameState(tableId);
  });

  socket.on('start-game', (tableId) => {
    const tablePlayers = getPlayersInTable(tableId);
    
    if (tablePlayers.length < 2) {
      console.log(`❌ לא ניתן להתחיל משחק עם פחות מ-2 שחקנים`);
      return;
    }

    console.log(`🎬 מתחיל משחק בשולחן ${tableId} עם ${tablePlayers.length} שחקנים`);

    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (let suit of suits) {
      for (let rank of ranks) {
        deck.push(`${rank}${suit}`);
      }
    }
    deck.sort(() => Math.random() - 0.5);

    // חלוקת קלפים לכל שחקן
    tablePlayers.forEach(player => {
      const hand = [deck.pop(), deck.pop()];
      player.hand = hand;
      player.currentBet = 0;
      player.folded = false;
      player.hasActed = false;
      players.set(player.id, player); // עדכון במפה
    });

    const communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    const tableData = getTableData(tableId);
    tableData.communityCards = communityCards;
    tableData.pot = 0;
    tableData.currentTurn = 0;
    tableData.gameStarted = true;
    tableData.currentRound = 'preflop';
    tableData.log = [`🎬 התחלת משחק!`];

    updateGameState(tableId);
  });

  socket.on('disconnect', () => {
    console.log('🔴 שחקן התנתק:', socket.id);
    
    // מחיקת השחקן
    const player = players.get(socket.id);
    if (player) {
      console.log(`🗑️ מוחק שחקן ${player.name} מהשולחן ${player.tableId}`);
      players.delete(socket.id);
      
      // עדכון לשחקנים הנותרים בשולחן
      const tableData = getTableData(player.tableId);
      tableData.log.unshift(`🚪 ${player.name} עזב את השולחן`);
      
      // אם השחקן שעזב היה בתור שלו, עבור לשחקן הבא
      const remainingPlayers = getPlayersInTable(player.tableId);
      if (remainingPlayers.length > 0 && tableData.gameStarted) {
        if (tableData.currentTurn >= remainingPlayers.length) {
          tableData.currentTurn = 0;
        }
      }
      
      updateGameState(player.tableId);
    }
  });
});

app.get('/', (req, res) => {
  res.send('🎉 Poker server is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ השרת מאזין על פורט ${PORT}`);
});
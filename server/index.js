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

// אחסון זמני במקום MySQL
const tables = new Map();
const players = new Map();

// קבועים
const SMALL_BLIND = 5;
const BIG_BLIND = 10;

// פונקציות עזר
function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getTableData(tableId) {
  if (!tables.has(tableId)) {
    tables.set(tableId, {
      id: tableId,
      pot: 0,
      currentTurn: 0,
      communityCards: [],
      visibleCommunityCards: [], // קלפים שנראים בכל שלב
      deck: [],
      log: [],
      players: [],
      gameStarted: false,
      currentRound: 'preflop', // preflop, flop, turn, river
      dealerIndex: 0,
      smallBlindIndex: 0,
      bigBlindIndex: 0,
      currentBet: 0,
      bettingRounds: 0,
      playersActedInRound: new Set() // שחקנים שפעלו בסיבוב הנוכחי
    });
  }
  return tables.get(tableId);
}

function getPlayersInTable(tableId) {
  return Array.from(players.values()).filter(p => p.tableId === tableId);
}

function getNextActivePlayer(tableId, currentPlayerIndex) {
  const tablePlayers = getPlayersInTable(tableId);
  if (tablePlayers.length === 0) return 0;
  
  let nextIndex = (currentPlayerIndex + 1) % tablePlayers.length;
  let attempts = 0;
  
  while (attempts < tablePlayers.length) {
    const nextPlayer = tablePlayers[nextIndex];
    if (nextPlayer && !nextPlayer.folded && nextPlayer.chips > 0) {
      return nextIndex;
    }
    nextIndex = (nextIndex + 1) % tablePlayers.length;
    attempts++;
  }
  
  return currentPlayerIndex;
}

function checkIfBettingRoundEnded(tableId) {
  const tableData = getTableData(tableId);
  const tablePlayers = getPlayersInTable(tableId);
  const activePlayers = tablePlayers.filter(p => !p.folded && p.chips > 0);
  
  if (activePlayers.length <= 1) {
    return true; // רק שחקן אחד פעיל נותר
  }
  
  // בדיקה אם כל השחקנים הפעילים פעלו במהלך הסיבוב
  const allPlayersActed = activePlayers.every(p => 
    tableData.playersActedInRound.has(p.id)
  );
  
  // בדיקה אם כל השחקנים הפעילים הגיעו לאותו סכום הימור
  const allBetsEqual = activePlayers.every(p => p.currentBet === tableData.currentBet);
  
  return allPlayersActed && allBetsEqual;
}

function advanceGameStage(tableId) {
  const tableData = getTableData(tableId);
  const tablePlayers = getPlayersInTable(tableId);
  
  // איפוס הימורים ושחקנים שפעלו
  tablePlayers.forEach(p => {
    p.currentBet = 0;
    players.set(p.id, p);
  });
  tableData.currentBet = 0;
  tableData.playersActedInRound.clear();
  
  // מעבר לשלב הבא
  switch (tableData.currentRound) {
    case 'preflop':
      tableData.currentRound = 'flop';
      tableData.visibleCommunityCards = tableData.communityCards.slice(0, 3);
      tableData.log.unshift('🃏 פלופ - שלושה קלפים ראשונים');
      break;
    case 'flop':
      tableData.currentRound = 'turn';
      tableData.visibleCommunityCards = tableData.communityCards.slice(0, 4);
      tableData.log.unshift('🃏 טרן - קלף רביעי');
      break;
    case 'turn':
      tableData.currentRound = 'river';
      tableData.visibleCommunityCards = tableData.communityCards.slice(0, 5);
      tableData.log.unshift('🃏 ריבר - קלף חמישי');
      break;
    case 'river':
      // סיום המשחק - צריך לקבוע מנצח
      endHand(tableId);
      return;
  }
  
  // התור עובר לשחקן הראשון אחרי הדילר
  tableData.currentTurn = getNextActivePlayer(tableId, tableData.dealerIndex);
}

function endHand(tableId) {
  const tableData = getTableData(tableId);
  const tablePlayers = getPlayersInTable(tableId);
  const activePlayers = tablePlayers.filter(p => !p.folded);
  
  if (activePlayers.length === 1) {
    // שחקן אחד נותר - הוא המנצח
    const winner = activePlayers[0];
    winner.chips += tableData.pot;
    players.set(winner.id, winner);
    tableData.log.unshift(`🏆 ${winner.name} זכה בקופה! (+${tableData.pot})`);
  } else {
    // כאן צריך להוסיף לוגיקה של הערכת קלפים
    // לעת עתה נניח שהשחקן הראשון זוכה
    const winner = activePlayers[0];
    winner.chips += tableData.pot;
    players.set(winner.id, winner);
    tableData.log.unshift(`🏆 ${winner.name} זכה בשואדאון! (+${tableData.pot})`);
  }
  
  // איפוס המשחק למתחיל מחדש
  resetForNewHand(tableId);
}

function resetForNewHand(tableId) {
  const tableData = getTableData(tableId);
  const tablePlayers = getPlayersInTable(tableId);
  
  // איפוס שחקנים
  tablePlayers.forEach(p => {
    p.currentBet = 0;
    p.folded = false;
    p.hand = [];
    players.set(p.id, p);
  });
  
  // איפוס שולחן
  tableData.pot = 0;
  tableData.currentBet = 0;
  tableData.communityCards = [];
  tableData.visibleCommunityCards = [];
  tableData.currentRound = 'preflop';
  tableData.gameStarted = false;
  tableData.playersActedInRound.clear();
  
  // הזזת הדילר
  tableData.dealerIndex = (tableData.dealerIndex + 1) % tablePlayers.length;
}

function updateGameState(tableId) {
  const tableData = getTableData(tableId);
  const tablePlayers = getPlayersInTable(tableId);
  
  tableData.players = tablePlayers;
  
  io.to(tableId).emit('state-update', {
    players: tablePlayers,
    pot: tableData.pot,
    currentTurn: tableData.currentTurn,
    communityCards: tableData.visibleCommunityCards, // שליחת הקלפים הנראים בלבד
    log: tableData.log,
    gameStarted: tableData.gameStarted,
    currentRound: tableData.currentRound,
    dealerIndex: tableData.dealerIndex,
    currentBet: tableData.currentBet
  });
}

io.on('connection', (socket) => {
  console.log('🟢 שחקן התחבר:', socket.id);

  socket.on('join-table', (tableId) => {
    socket.join(tableId);
    console.log(`📥 ${socket.id} הצטרף לשולחן ${tableId}`);

    const tableData = getTableData(tableId);

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
        folded: false
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

    // סימון שהשחקן פעל בסיבוב הזה
    tableData.playersActedInRound.add(playerId);

    // טיפול בפעולות השונות
    switch (action) {
      case 'fold':
        player.folded = true;
        tableData.log.unshift(`🚪 ${player.name} עשה fold`);
        break;
        
      case 'call':
        const callAmount = tableData.currentBet - player.currentBet;
        if (player.chips >= callAmount) {
          player.chips -= callAmount;
          player.currentBet += callAmount;
          tableData.pot += callAmount;
          tableData.log.unshift(`📞 ${player.name} עשה call (${callAmount})`);
        }
        break;
        
      case 'raise':
        const raiseAmount = amount || 50;
        const totalBetAmount = tableData.currentBet + raiseAmount;
        const playerNeedsToPay = totalBetAmount - player.currentBet;
        
        if (player.chips >= playerNeedsToPay) {
          player.chips -= playerNeedsToPay;
          tableData.pot += playerNeedsToPay;
          player.currentBet = totalBetAmount;
          tableData.currentBet = totalBetAmount;
          tableData.log.unshift(`📈 ${player.name} עשה raise ל-${totalBetAmount}`);
          
          // איפוס השחקנים שפעלו כי יש הימור חדש
          tableData.playersActedInRound.clear();
          tableData.playersActedInRound.add(playerId);
        }
        break;
        
      case 'check':
        if (player.currentBet === tableData.currentBet) {
          tableData.log.unshift(`✅ ${player.name} עשה check`);
        } else {
          tableData.log.unshift(`❌ ${player.name} לא יכול לעשות check`);
          return;
        }
        break;
    }

    players.set(playerId, player);
    console.log(`🎯 שחקן ${player.name} עשה ${action}`);

    // בדיקה אם סיבוב ההימורים הסתיים
    if (checkIfBettingRoundEnded(tableId)) {
      const activePlayers = tablePlayers.filter(p => !p.folded);
      if (activePlayers.length === 1) {
        // שחקן אחד נותר - סיום המשחק
        endHand(tableId);
      } else {
        // מעבר לשלב הבא
        advanceGameStage(tableId);
      }
    } else {
      // מעבר לשחקן הבא
      tableData.currentTurn = getNextActivePlayer(tableId, tableData.currentTurn);
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

    const tableData = getTableData(tableId);
    const deck = createDeck();
    
    // חלוקת קלפים לכל שחקן
    tablePlayers.forEach(player => {
      const hand = [deck.pop(), deck.pop()];
      player.hand = hand;
      player.currentBet = 0;
      player.folded = false;
      players.set(player.id, player);
    });

    // הכנת קלפי הקהילה (5 קלפים) אבל לא מציגים אותם עדיין
    const communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    
    // קביעת מיקומי עיוור קטן ועיוור גדול
    tableData.dealerIndex = 0;
    tableData.smallBlindIndex = (tableData.dealerIndex + 1) % tablePlayers.length;
    tableData.bigBlindIndex = (tableData.dealerIndex + 2) % tablePlayers.length;
    
    // גביית עיוורים
    const smallBlindPlayer = tablePlayers[tableData.smallBlindIndex];
    const bigBlindPlayer = tablePlayers[tableData.bigBlindIndex];
    
    smallBlindPlayer.chips -= SMALL_BLIND;
    smallBlindPlayer.currentBet = SMALL_BLIND;
    bigBlindPlayer.chips -= BIG_BLIND;
    bigBlindPlayer.currentBet = BIG_BLIND;
    
    players.set(smallBlindPlayer.id, smallBlindPlayer);
    players.set(bigBlindPlayer.id, bigBlindPlayer);
    
    // עדכון פרטי השולחן
    tableData.communityCards = communityCards;
    tableData.visibleCommunityCards = []; // בפרפלופ לא רואים קלפים
    tableData.pot = SMALL_BLIND + BIG_BLIND;
    tableData.currentBet = BIG_BLIND;
    tableData.gameStarted = true;
    tableData.currentRound = 'preflop';
    tableData.log = [
      `🎬 התחלת משחק!`,
      `💰 ${smallBlindPlayer.name} שילם עיוור קטן (${SMALL_BLIND})`,
      `💰 ${bigBlindPlayer.name} שילם עיוור גדול (${BIG_BLIND})`
    ];
    tableData.playersActedInRound.clear();
    
    // התור של השחקן הראשון אחרי העיוור הגדול
    tableData.currentTurn = (tableData.bigBlindIndex + 1) % tablePlayers.length;

    updateGameState(tableId);
  });

  socket.on('disconnect', () => {
    console.log('🔴 שחקן התנתק:', socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      console.log(`🗑️ מוחק שחקן ${player.name} מהשולחן ${player.tableId}`);
      players.delete(socket.id);
      
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
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
      players: []
    });
  }
  return tables.get(tableId);
}

function getPlayersInTable(tableId) {
  return Array.from(players.values()).filter(p => p.tableId === tableId);
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
        folded: false
      });
    }

    const tablePlayers = getPlayersInTable(tableId);
    
    // עדכון הטבלה עם השחקנים
    tableData.players = tablePlayers;
    
    console.log(`📊 שולחן ${tableId} עכשיו יש ${tablePlayers.length} שחקנים`);

    io.to(tableId).emit('state-update', {
      players: tablePlayers,
      pot: tableData.pot,
      currentTurn: tableData.currentTurn,
      communityCards: tableData.communityCards,
      log: tableData.log
    });
  });

  socket.on('player-action', ({ tableId, action, playerId }) => {
    const player = players.get(playerId);
    if (!player) {
      console.log(`❌ שחקן ${playerId} לא נמצא`);
      return;
    }

    const tableData = getTableData(tableId);
    
    // הוספת פעולה ללוג
    tableData.log.unshift(`🎮 ${player.name} עשה ${action}`);
    
    console.log(`🎯 שחקן ${player.name} עשה ${action}`);

    const tablePlayers = getPlayersInTable(tableId);

    io.to(tableId).emit('state-update', {
      players: tablePlayers,
      pot: tableData.pot,
      currentTurn: tableData.currentTurn,
      communityCards: tableData.communityCards,
      log: tableData.log
    });
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
      players.set(player.id, player); // עדכון במפה
    });

    const communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    const tableData = getTableData(tableId);
    tableData.communityCards = communityCards;
    tableData.pot = 0;
    tableData.currentTurn = 0;
    tableData.log = [`🎬 התחלת משחק!`];

    io.to(tableId).emit('state-update', {
      players: tablePlayers,
      pot: 0,
      currentTurn: 0,
      communityCards: communityCards,
      log: [`🎬 התחלת משחק!`]
    });
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
      const remainingPlayers = getPlayersInTable(player.tableId);
      
      io.to(player.tableId).emit('state-update', {
        players: remainingPlayers,
        pot: tableData.pot,
        currentTurn: tableData.currentTurn,
        communityCards: tableData.communityCards,
        log: [...tableData.log, `🚪 ${player.name} עזב את השולחן`]
      });
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
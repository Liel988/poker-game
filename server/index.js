const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// זיכרון לכל השולחנות
const tables = {}; // tableId -> { players, pot, communityCards, currentTurn, log }

io.on('connection', (socket) => {
  console.log('🟢 שחקן התחבר:', socket.id);

  socket.on('join-table', (tableId) => {
    socket.join(tableId);
    console.log(`📥 ${socket.id} הצטרף לשולחן ${tableId}`);

    // צור שולחן אם לא קיים
    if (!tables[tableId]) {
      tables[tableId] = {
        players: [],
        pot: 0,
        currentTurn: 0,
        log: [],
        communityCards: []
      };
    }

    const table = tables[tableId];

    // הוסף שחקן אם לא קיים
    const alreadyExists = table.players.find(p => p.id === socket.id);
    if (!alreadyExists) {
      const playerNumber = table.players.length + 1;
      table.players.push({
        id: socket.id,
        name: `שחקן ${playerNumber}`,
        chips: 1000,
        hand: [],
        currentBet: 0,
        folded: false,
      });
    }

    io.to(tableId).emit('state-update', table);
  });

  socket.on('player-action', ({ tableId, action, playerId }) => {
    const table = tables[tableId];
    if (!table) return;

    const player = table.players.find(p => p.id === playerId);
    if (!player) return;

    // הוספת הפעולה ללוג
    table.log.unshift(`🎮 ${player.name} עשה ${action}`);

    // שידור מצב עדכני לכולם
    io.to(tableId).emit('state-update', {
      ...table,
      action,
      playerName: player.name
    });
  });

  socket.on('disconnect', () => {
    console.log('🔴 שחקן התנתק:', socket.id);

    // הסרה מכל השולחנות
    for (const tableId in tables) {
      const table = tables[tableId];
      table.players = table.players.filter(p => p.id !== socket.id);

      // עדכון שידור
      io.to(tableId).emit('state-update', table);
    }
  });
});

server.listen(3001, () => {
  console.log('✅ השרת מאזין על פורט 3001');
});
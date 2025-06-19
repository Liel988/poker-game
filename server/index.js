const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');

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

// חיבור למסד נתונים MySQL
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'admin123', // החלף בסיסמה שלך
  database: 'poker'
};

io.on('connection', (socket) => {
  console.log('🟢 שחקן התחבר:', socket.id);

  socket.on('join-table', async (tableId) => {
    socket.join(tableId);
    console.log(`📥 ${socket.id} הצטרף לשולחן ${tableId}`);

    const conn = await mysql.createConnection(dbConfig);

    // צור שולחן אם לא קיים
    await conn.execute(
      `INSERT IGNORE INTO tables (id, pot, currentTurn, communityCards, log) VALUES (?, 0, 0, ?, ?)`,
      [tableId, JSON.stringify([]), JSON.stringify([])]
    );

    // בדוק אם השחקן כבר קיים
    const [existing] = await conn.execute(
      `SELECT * FROM players WHERE id = ? AND tableId = ?`,
      [socket.id, tableId]
    );

    if (existing.length === 0) {
      console.log(`➕ מוסיף שחקן חדש עם id ${socket.id} לשולחן ${tableId}`);
      const [count] = await conn.execute(
        `SELECT COUNT(*) AS count FROM players WHERE tableId = ?`,
        [tableId]
      );
      const playerNumber = count[0].count + 1;

      await conn.execute(
        `INSERT INTO players (id, tableId, name, chips, hand, currentBet, folded)
         VALUES (?, ?, ?, 1000, ?, 0, false)`,
        [socket.id, tableId, `שחקן ${playerNumber}`, JSON.stringify([])]
      );
    }

    const [players] = await conn.execute(
      `SELECT * FROM players WHERE tableId = ?`,
      [tableId]
    );

    const [tableData] = await conn.execute(
      `SELECT * FROM tables WHERE id = ?`,
      [tableId]
    );

    conn.end();

    io.to(tableId).emit('state-update', {
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        hand: JSON.parse(p.hand),
        currentBet: p.currentBet,
        folded: p.folded
      })),
      pot: tableData[0].pot,
      currentTurn: tableData[0].currentTurn,
      communityCards: JSON.parse(tableData[0].communityCards),
      log: JSON.parse(tableData[0].log)
    });
  });

  socket.on('player-action', async ({ tableId, action, playerId }) => {
    const conn = await mysql.createConnection(dbConfig);

    const [playerRows] = await conn.execute(
      `SELECT * FROM players WHERE id = ? AND tableId = ?`,
      [playerId, tableId]
    );

    const player = playerRows[0];
    if (!player) return;

    // שלוף את הלוג הנוכחי, הוסף את הפעולה, עדכן
    const [tableRows] = await conn.execute(
      `SELECT * FROM tables WHERE id = ?`,
      [tableId]
    );
    let log = JSON.parse(tableRows[0].log || '[]');
    log.unshift(`🎮 ${player.name} עשה ${action}`);

    await conn.execute(
      `UPDATE tables SET log = ? WHERE id = ?`,
      [JSON.stringify(log), tableId]
    );

    const [players] = await conn.execute(
      `SELECT * FROM players WHERE tableId = ?`,
      [tableId]
    );

    const [table] = await conn.execute(
      `SELECT * FROM tables WHERE id = ?`,
      [tableId]
    );

    conn.end();

    io.to(tableId).emit('state-update', {
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        hand: JSON.parse(p.hand),
        currentBet: p.currentBet,
        folded: p.folded
      })),
      pot: table[0].pot,
      currentTurn: table[0].currentTurn,
      communityCards: JSON.parse(table[0].communityCards),
      log
    });
  });
  socket.on('start-game', async (tableId) => {
    const conn = await mysql.createConnection(dbConfig);

    const [players] = await conn.execute(
      `SELECT * FROM players WHERE tableId = ?`,
      [tableId]
    );

    if (players.length < 2) {
      console.log(`❌ לא ניתן להתחיל משחק עם פחות מ-2 שחקנים`);
      conn.end();
      return;
    }

    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (let suit of suits) {
      for (let rank of ranks) {
        deck.push(`${rank}${suit}`);
      }
    }
    deck.sort(() => Math.random() - 0.5);

    for (const p of players) {
      const hand = [deck.pop(), deck.pop()];
      await conn.execute(
        `UPDATE players SET hand = ?, currentBet = 0, folded = false WHERE id = ?`,
        [JSON.stringify(hand), p.id]
      );
    }

    const communityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    await conn.execute(
      `UPDATE tables SET communityCards = ?, pot = 0, currentTurn = 0 WHERE id = ?`,
      [JSON.stringify(communityCards), tableId]
    );

    const [updatedPlayers] = await conn.execute(
      `SELECT * FROM players WHERE tableId = ?`,
      [tableId]
    );

    conn.end();

    io.to(tableId).emit('state-update', {
      players: updatedPlayers.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        hand: JSON.parse(p.hand),
        currentBet: p.currentBet,
        folded: p.folded
      })),
      pot: 0,
      currentTurn: 0,
      communityCards,
      log: [`🎬 התחלת משחק`]
    });
  });
  socket.on('disconnect', async () => {
    console.log('🔴 שחקן התנתק:', socket.id);

    const conn = await mysql.createConnection(dbConfig);

    // מחיקה מהטבלה
    await conn.execute(`DELETE FROM players WHERE id = ?`, [socket.id]);

    conn.end();
  });
});

app.get('/', (req, res) => {
  res.send('🎉 Poker server is running!');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ השרת מאזין על פורט ${PORT}`);
});
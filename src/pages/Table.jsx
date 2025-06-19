import React, { useState, useEffect, useRef } from 'react';

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValue = Object.fromEntries(ranks.map((r, i) => [r, i + 2]));

// קומפוננטת קלף משופרת
const Card = ({ card, hidden = false, size = 'normal' }) => {
  if (!card || hidden) {
    return (
      <div className={`card card-back ${size}`}>
        <div className="card-pattern">🂠</div>
      </div>
    );
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const isRed = suit === '♥' || suit === '♦';

  return (
    <div className={`card card-front ${size} ${isRed ? 'red' : 'black'}`}>
      <div className="card-content">
        <div className="rank-top">{rank}</div>
        <div className="suit-center">{suit}</div>
        <div className="rank-bottom">{rank}</div>
      </div>
    </div>
  );
};

// סגנונות CSS
const styles = `
  .poker-table-container {
    font-family: 'Arial', sans-serif;
    background: linear-gradient(135deg, #0f4c3a, #1a6b4a);
    min-height: 100vh;
    padding: 20px;
    direction: rtl;
  }

  .table-title {
    text-align: center;
    color: white;
    margin-bottom: 20px;
    font-size: 2em;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  }

  .connection-status {
    text-align: center;
    margin-bottom: 15px;
    font-size: 1.1em;
  }

  .connected {
    color: #4CAF50;
    font-weight: bold;
  }

  .disconnected {
    color: #f44336;
    font-weight: bold;
  }

  .poker-table {
    width: 800px;
    height: 600px;
    background: radial-gradient(ellipse at center, #2d5a3d, #1a4029);
    border: 8px solid #8B4513;
    border-radius: 50%;
    margin: 0 auto;
    position: relative;
    box-shadow: 0 0 30px rgba(0,0,0,0.8);
  }

  .player-seat {
    position: absolute;
    width: 120px;
    background: rgba(255,255,255,0.1);
    border: 2px solid rgba(255,255,255,0.3);
    border-radius: 15px;
    padding: 10px;
    text-align: center;
    color: white;
    transition: all 0.3s ease;
  }

  .player-seat.active-seat {
    border-color: #FFD700;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
    background: rgba(255, 215, 0, 0.2);
  }

  .player-seat.folded-seat {
    opacity: 0.5;
    filter: grayscale(100%);
  }

  .seat-0 { top: 20px; left: 50%; transform: translateX(-50%); }
  .seat-1 { top: 100px; right: 50px; }
  .seat-2 { bottom: 100px; right: 50px; }
  .seat-3 { bottom: 20px; left: 50%; transform: translateX(-50%); }
  .seat-4 { bottom: 100px; left: 50px; }
  .seat-5 { top: 100px; left: 50px; }

  .avatar {
    font-size: 2em;
    margin-bottom: 5px;
  }

  .player-name {
    font-weight: bold;
    margin-bottom: 5px;
    font-size: 0.9em;
  }

  .player-hand {
    display: flex;
    justify-content: center;
    gap: 3px;
    margin: 8px 0;
    flex-wrap: wrap;
  }

  .card {
    background: white;
    border: 1px solid #333;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    box-shadow: 2px 2px 6px rgba(0,0,0,0.3);
    transition: transform 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .card:hover {
    transform: translateY(-2px);
  }

  .card.normal {
    width: 35px;
    height: 50px;
    font-size: 0.7em;
  }

  .card.small {
    width: 28px;
    height: 40px;
    font-size: 0.6em;
  }

  .card.large {
    width: 50px;
    height: 70px;
    font-size: 0.9em;
  }

  .card-front.red {
    color: #d32f2f;
  }

  .card-front.black {
    color: #333;
  }

  .card-back {
    background: linear-gradient(45deg, #1976d2, #42a5f5);
    color: white;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    position: relative;
    padding: 2px;
  }

  .rank-top {
    position: absolute;
    top: 2px;
    left: 3px;
    font-size: 0.8em;
    line-height: 1;
  }

  .suit-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 1.2em;
  }

  .rank-bottom {
    position: absolute;
    bottom: 2px;
    right: 3px;
    font-size: 0.8em;
    line-height: 1;
    transform: rotate(180deg);
  }

  .card-pattern {
    font-size: 1.5em;
  }

  .player-chips, .player-bet {
    font-size: 0.8em;
    margin: 2px 0;
  }

  .turn-indicator {
    position: absolute;
    top: -10px;
    right: -10px;
    font-size: 1.5em;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  .timer {
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 0, 0, 0.8);
    color: white;
    padding: 3px 8px;
    border-radius: 15px;
    font-size: 0.8em;
    font-weight: bold;
  }

  .dealer-button {
    position: absolute;
    top: -8px;
    left: -8px;
    background: #FFD700;
    color: #333;
    width: 25px;
    height: 25px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 0.8em;
    border: 2px solid white;
  }

  .community-cards {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    background: rgba(0,0,0,0.3);
    padding: 15px;
    border-radius: 15px;
    color: white;
  }

  .community-cards h4 {
    margin: 0 0 10px 0;
    color: #FFD700;
  }

  .cards-container {
    display: flex;
    gap: 5px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .no-community-cards {
    color: #ccc;
    font-style: italic;
  }

  .game-info {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 20px;
    color: white;
    font-weight: bold;
  }

  .pot-display, .current-bet, .stage-display {
    background: rgba(0,0,0,0.5);
    padding: 8px 15px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.3);
  }

  .actions-section {
    margin: 20px auto;
    text-align: center;
    max-width: 600px;
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  .actions button {
    padding: 12px 20px;
    border: none;
    border-radius: 25px;
    font-weight: bold;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  }

  .actions button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(0,0,0,0.3);
  }

  .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .start-game-button {
    text-align: center;
    margin: 20px 0;
  }

  .start-game-button button {
    background: linear-gradient(45deg, #4CAF50, #45a049);
    color: white;
    border: none;
    padding: 15px 30px;
    font-size: 18px;
    font-weight: bold;
    border-radius: 30px;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
    transition: all 0.3s ease;
  }

  .start-game-button button:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 20px rgba(76, 175, 80, 0.6);
  }

  .action-log {
    max-width: 600px;
    margin: 20px auto;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 15px;
    border-radius: 10px;
    max-height: 200px;
    overflow-y: auto;
  }

  .action-log h4 {
    margin-top: 0;
    color: #FFD700;
  }

  .action-log ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .action-log li {
    padding: 5px 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }

  .debug-info {
    background: rgba(240, 240, 240, 0.9);
    padding: 10px;
    margin: 10px auto;
    border-radius: 8px;
    font-size: 12px;
    max-width: 800px;
    direction: ltr;
  }

  .debug-info div {
    margin: 5px 0;
  }

  .raise-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border: 2px solid #333;
    border-radius: 15px;
    z-index: 1000;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    min-width: 300px;
  }

  .raise-modal h4 {
    margin-top: 0;
    text-align: center;
    color: #333;
  }

  .raise-modal input {
    width: 100%;
    padding: 10px;
    margin: 10px 0;
    border: 2px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
    box-sizing: border-box;
  }

  .raise-modal .modal-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 15px;
  }

  .raise-modal button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .no-players {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: white;
    font-size: 1.2em;
  }
`;

const PokerTable = () => {
  // Mock data for demonstration
  const [players, setPlayers] = useState([
    { id: 'player1', name: 'שחקן 1', chips: 1000, currentBet: 0, hand: ['A♠', 'K♠'], folded: false },
    { id: 'player2', name: 'שחקן 2', chips: 850, currentBet: 50, hand: ['Q♥', 'Q♦'], folded: false },
    { id: 'player3', name: 'שחקן 3', chips: 1200, currentBet: 0, hand: ['J♣', '10♣'], folded: true },
  ]);
  
  const [dealerIndex, setDealerIndex] = useState(0);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [currentBet, setCurrentBet] = useState(50);
  const [pot, setPot] = useState(150);
  const [stage, setStage] = useState('flop');
  const [communityCards, setCommunityCards] = useState(['A♦', 'K♣', 'Q♠', 'J♥', '10♦']);
  const [gameStarted, setGameStarted] = useState(true);
  const [mySocketId] = useState('player1');
  const [showAllCards, setShowAllCards] = useState(false);
  const [isRaising, setIsRaising] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState(45);
  const [log, setLog] = useState([
    '🎮 Call (50) (שחקן 2)',
    '🎮 Check (שחקן 1)',
    '🃏 Flop: A♦ K♣ Q♠',
    '🎬 משחק התחיל'
  ]);

  const getVisibleCommunityCards = () => {
    if (stage === 'pre-flop') return [];
    if (stage === 'flop') return communityCards.slice(0, 3);
    if (stage === 'turn') return communityCards.slice(0, 4);
    if (stage === 'river') return communityCards.slice(0, 5);
    return communityCards;
  };

  const isMyTurn = () => {
    return gameStarted && 
           players.length > 0 && 
           currentTurn < players.length &&
           players[currentTurn] && 
           players[currentTurn].id === mySocketId;
  };

  const getCurrentPlayer = () => {
    if (players.length === 0 || currentTurn >= players.length) return null;
    return players[currentTurn];
  };

  const getMyPlayer = () => {
    return players.find(p => p.id === mySocketId);
  };

  const canCheck = () => {
    const myPlayer = getMyPlayer();
    return myPlayer && myPlayer.currentBet === currentBet;
  };

  const canCall = () => {
    const myPlayer = getMyPlayer();
    return myPlayer && myPlayer.currentBet < currentBet && myPlayer.chips > 0;
  };

  const getCallAmount = () => {
    const myPlayer = getMyPlayer();
    if (!myPlayer) return 0;
    return Math.min(currentBet - myPlayer.currentBet, myPlayer.chips);
  };

  const canRaise = () => {
    const myPlayer = getMyPlayer();
    return myPlayer && myPlayer.chips > 0 && (currentBet === 0 || myPlayer.chips + myPlayer.currentBet > currentBet);
  };

  const handleAction = (action, amount = null) => {
    console.log(`Action: ${action}`, amount);
    // כאן תהיה הלוגיקה לשליחה לשרת
    setLog(prev => [`🎮 ${action}${amount ? ` (${amount})` : ''} (${getMyPlayer()?.name})`, ...prev]);
  };

  const handleRaise = () => {
    if (!isRaising) {
      setIsRaising(true);
      setRaiseAmount(String(currentBet + 1));
    } else {
      confirmRaise();
    }
  };

  const confirmRaise = () => {
    const amount = parseInt(raiseAmount);
    if (isNaN(amount) || amount <= currentBet) {
      alert('סכום רייז לא תקין');
      return;
    }
    handleAction('Raise', amount);
    setIsRaising(false);
    setRaiseAmount('');
  };

  return (
    <div className="poker-table-container">
      <style>{styles}</style>
      
      <h2 className="table-title">שולחן פוקר דמו</h2>
      
      <div className="connection-status">
        <span className="connected">🟢 מחובר</span>
      </div>

      <div className="poker-table">
        {players.map((player, index) => {
          const isMyPlayer = player.id === mySocketId;
          const shouldShowCards = isMyPlayer || showAllCards;
          
          return (
            <div 
              key={player.id} 
              className={`player-seat seat-${index} ${index === currentTurn ? 'active-seat' : ''} ${player.folded ? 'folded-seat' : ''}`}
            >
              <div className="avatar">🎭</div>
              <div className="player-name">{player.name} {isMyPlayer ? '(אני)' : ''}</div>
              <div className="player-hand">
                {player.hand && player.hand.length > 0 ? (
                  player.hand.map((card, i) => (
                    <Card 
                      key={i} 
                      card={card} 
                      hidden={!shouldShowCards}
                      size="small"
                    />
                  ))
                ) : (
                  gameStarted && <span className="no-cards">אין קלפים</span>
                )}
              </div>
              <div className="player-chips">💵 {player.chips}</div>
              <div className="player-bet">💸 {player.currentBet}</div>
              {index === currentTurn && !player.folded && gameStarted && (
                <>
                  <div className="turn-indicator">🎯</div>
                  {isMyTurn() && (
                    <div className="timer">⏱️ {timeLeft}s</div>
                  )}
                </>
              )}
              {index === dealerIndex && (
                <div className="dealer-button">D</div>
              )}
            </div>
          );
        })}
        
        <div className="community-cards">
          <h4>קלפי השולחן ({stage}):</h4>
          <div className="cards-container">
            {getVisibleCommunityCards().length > 0 ? (
              getVisibleCommunityCards().map((card, i) => (
                <Card key={i} card={card} size="normal" />
              ))
            ) : (
              <div className="no-community-cards">
                {stage === 'pre-flop' ? 'ממתין לפלופ...' : 'אין קלפי קהילה'}
              </div>
            )}
          </div>
        </div>
        
        <div className="game-info">
          <div className="pot-display">🏆 קופה: {pot}</div>
          <div className="current-bet">💸 הימור נוכחי: {currentBet}</div>
          <div className="stage-display">שלב: {stage}</div>
        </div>
      </div>

      <div className="actions-section">
        {isMyTurn() && (
          <div className="actions">
            <button 
              onClick={() => handleAction('Check')}
              disabled={!canCheck()}
              style={{backgroundColor: canCheck() ? '#4CAF50' : '#ccc'}}
            >
              Check
            </button>
            <button 
              onClick={() => handleAction('Call')}
              disabled={!canCall()}
              style={{backgroundColor: canCall() ? '#2196F3' : '#ccc'}}
            >
              Call ({getCallAmount()})
            </button>
            <button 
              onClick={handleRaise}
              style={{backgroundColor: canRaise() ? '#FF9800' : '#ccc'}}
              disabled={!canRaise()}
            >
              {isRaising ? 'בצע Raise' : 'Raise'}
            </button>
            <button 
              onClick={() => handleAction('Fold')}
              style={{backgroundColor: '#f44336'}}
            >
              Fold
            </button>
          </div>
        )}
      </div>

      <div className="start-game-button">
        <button onClick={() => setShowAllCards(prev => !prev)}>
          {showAllCards ? '🙈 הסתר קלפים של כולם' : '👀 הצג קלפים של כולם'}
        </button>
      </div>

      {isRaising && (
        <div className="raise-modal">
          <h4>בחר סכום לרייז:</h4>
          <input
            type="number"
            min={currentBet + 1}
            max={getMyPlayer() ? getMyPlayer().chips + getMyPlayer().currentBet : 0}
            placeholder={`מינימום: ${currentBet + 1}`}
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(e.target.value)}
          />
          <div className="modal-actions">
            <button 
              onClick={confirmRaise}
              style={{backgroundColor: '#4CAF50', color: 'white'}}
            >
              בצע רייז
            </button>
            <button 
              onClick={() => {
                setIsRaising(false);
                setRaiseAmount('');
              }}
              style={{backgroundColor: '#f44336', color: 'white'}}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div className="action-log">
        <h4>יומן פעולות:</h4>
        <ul>
          {log.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default PokerTable;
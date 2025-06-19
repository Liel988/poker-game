import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import './Table.css';
import { io } from 'socket.io-client';

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValue = Object.fromEntries(ranks.map((r, i) => [r, i + 2]));

function evaluateHand(cards) {
    const values = cards.map(c => c.slice(0, -1));
    const numbers = cards.map(c => ({ rank: rankValue[c.slice(0, -1)], suit: c.slice(-1) }));
    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const groupedRanks = Object.entries(counts).sort((a, b) => b[1] - a[1] || rankValue[b[0]] - rankValue[a[0]]);
    const suitGroups = {};
    for (let card of numbers) {
        suitGroups[card.suit] = suitGroups[card.suit] || [];
        suitGroups[card.suit].push(card);
    }
    const flushSuit = Object.values(suitGroups).find(g => g.length >= 5);
    const uniqueVals = [...new Set(numbers.map(n => n.rank))].sort((a, b) => a - b);
    let straightHigh = 0;
    for (let i = 0; i <= uniqueVals.length - 5; i++) {
        if (uniqueVals[i + 4] - uniqueVals[i] === 4) straightHigh = uniqueVals[i + 4];
    }
    let straightFlushHigh = 0;
    if (flushSuit) {
        const flushSorted = flushSuit.map(c => c.rank).sort((a, b) => a - b);
        for (let i = 0; i <= flushSorted.length - 5; i++) {
            if (flushSorted[i + 4] - flushSorted[i] === 4) straightFlushHigh = flushSorted[i + 4];
        }
    }

    let handName = 'High Card';
    let score = 0;
    let best = Math.max(...numbers.map(n => n.rank));

    if (straightFlushHigh) { score = 8; best = straightFlushHigh; handName = 'Straight Flush'; }
    else if (groupedRanks[0][1] === 4) { score = 7; best = rankValue[groupedRanks[0][0]]; handName = 'Four of a Kind'; }
    else if (groupedRanks[0][1] === 3 && groupedRanks[1]?.[1] >= 2) { score = 6; best = rankValue[groupedRanks[0][0]]; handName = 'Full House'; }
    else if (flushSuit) { score = 5; best = Math.max(...flushSuit.map(c => c.rank)); handName = 'Flush'; }
    else if (straightHigh) { score = 4; best = straightHigh; handName = 'Straight'; }
    else if (groupedRanks[0][1] === 3) { score = 3; best = rankValue[groupedRanks[0][0]]; handName = 'Three of a Kind'; }
    else if (groupedRanks[0][1] === 2 && groupedRanks[1]?.[1] === 2) { score = 2; best = Math.max(rankValue[groupedRanks[0][0]], rankValue[groupedRanks[1][0]]); handName = 'Two Pair'; }
    else if (groupedRanks[0][1] === 2) { score = 1; best = rankValue[groupedRanks[0][0]]; handName = 'One Pair'; }

    return { score, best, handName };
}

function Table() {
    const mySocketId = useRef(null);
    const { tableId } = useParams();
    
    // States שמתעדכנים רק מהשרת
    const [players, setPlayers] = useState([]);
    const [dealerIndex, setDealerIndex] = useState(0);
    const [currentTurn, setCurrentTurn] = useState(0);
    const [currentBet, setCurrentBet] = useState(0);
    const [pot, setPot] = useState(0);
    const [log, setLog] = useState([]);
    const [stage, setStage] = useState('pre-flop');
    const [communityCards, setCommunityCards] = useState([]);
    const [gameStarted, setGameStarted] = useState(false);
    
    // States מקומיים לUI בלבד
    const [isRaising, setIsRaising] = useState(false);
    const [raiseAmount, setRaiseAmount] = useState('');
    const [timeLeft, setTimeLeft] = useState(180);
    const [showAllCards, setShowAllCards] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    // הוספת state עבור ה-socket ID כדי לגרום לרינדור מחדש
    const [myId, setMyId] = useState(null);
    
    const socket = useRef(null);

    const startGame = () => {
        if (socket.current && socket.current.connected) {
            console.log('Starting game...');
            socket.current.emit('start-game', tableId);
        } else {
            console.error('Socket not connected');
        }
    };

    useEffect(() => {
        // יצירת חיבור socket
        socket.current = io('https://poker-game-1.onrender.com', {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        socket.current.on('connect', () => {
            console.log('Connected to server, socket ID:', socket.current.id);
            setIsConnected(true);
            mySocketId.current = socket.current.id;
            setMyId(socket.current.id); // עדכון ה-state כדי לגרום לרינדור מחדש
            console.log('mySocketId set to:', mySocketId.current);
            socket.current.emit('join-table', tableId);
        });

        socket.current.on('disconnect', () => {
            console.log('Disconnected from server');
            setIsConnected(false);
            setMyId(null);
        });

        socket.current.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setIsConnected(false);
        });

        // עדכון מצב מלא מהשרת
        socket.current.on('state-update', (tableData) => {
            console.log('State update received:', tableData);
            if (tableData) {
                setPlayers(tableData.players || []);
                setPot(tableData.pot || 0);
                setLog(tableData.log || []);
                setCurrentTurn(tableData.currentTurn !== undefined ? tableData.currentTurn : 0);
                setCommunityCards(tableData.communityCards || []);
                setCurrentBet(tableData.currentBet || 0);
                setStage(tableData.stage || 'pre-flop');
                setDealerIndex(tableData.dealerIndex || 0);
                setGameStarted(tableData.gameStarted || false);
                
                // איפוס הטיימר כשיש עדכון תור
                if (tableData.currentTurn !== undefined) {
                    setTimeLeft(180);
                }
            }
        });

        // עדכון פעולה ספציפי
        socket.current.on('action-update', (data) => {
            console.log('Action update received:', data);
            if (data) {
                // עדכון הלוג עם הפעולה החדשה
                if (data.action && data.playerName) {
                    setLog(prev => [`🎮 ${data.action} (${data.playerName})`, ...prev]);
                }
            }
        });

        // עדכון לוג
        socket.current.on('log-update', (logEntry) => {
            console.log('Log update received:', logEntry);
            if (logEntry) {
                setLog(prev => [logEntry, ...prev]);
            }
        });

        // הודעת שגיאה
        socket.current.on('error', (error) => {
            console.error('Server error:', error);
            setLog(prev => [`❌ שגיאה: ${error}`, ...prev]);
        });

        // ניקוי בעת unmount
        return () => {
            if (socket.current) {
                socket.current.disconnect();
            }
        };
    }, [tableId]);

    // Timer effect - רק עבור התור שלי
    useEffect(() => {
        if (!gameStarted || !isMyTurn()) {
            return;
        }
        
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    handleAction('Fold');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [currentTurn, gameStarted, players]);

    // פונקציה לשליחת פעולה לשרת בלבד
    const handleAction = (action, amount = null) => {
        console.log(`Attempting action: ${action}, isMyTurn: ${isMyTurn()}`);
        
        if (!isMyTurn()) {
            console.log('Not my turn, ignoring action');
            return;
        }

        if (!socket.current || !socket.current.connected) {
            console.error('Socket not connected');
            return;
        }

        // שליחת הפעולה לשרת
        const actionData = {
            tableId,
            action,
            playerId: mySocketId.current
        };

        if (action === 'Raise' && amount) {
            actionData.amount = parseInt(amount);
        }

        console.log('Sending action to server:', actionData);
        socket.current.emit('player-action', actionData);

        // איפוס UI של raise
        if (isRaising) {
            setIsRaising(false);
            setRaiseAmount('');
        }
    };

    // תיקון פונקציית handleRaise
    const handleRaise = () => {
        if (!isRaising) {
            setIsRaising(true);
            setRaiseAmount(String(currentBet + 1)); // הגדרת סכום ברירת מחדל
        } else {
            confirmRaise();
        }
    };

    const confirmRaise = () => {
        const amount = parseInt(raiseAmount);
        const currentPlayer = getCurrentPlayer();
        
        if (!currentPlayer || isNaN(amount) || amount <= currentBet) {
            setLog(prev => ['❌ סכום רייז לא תקין - חייב להיות גדול מההימור הנוכחי', ...prev]);
            return;
        }

        const maxRaise = currentPlayer.chips + currentPlayer.currentBet;
        if (amount > maxRaise) {
            setLog(prev => ['❌ אין לך מספיק כסף לרייז כזה', ...prev]);
            return;
        }

        handleAction('Raise', amount);
    };

    // פונקציות עזר שרק קוראות מה-state
    const getVisibleCommunityCards = () => {
        console.log('Stage:', stage, 'Community cards:', communityCards);
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
               players[currentTurn].id === mySocketId.current;
    };

    const getCurrentPlayer = () => {
        if (players.length === 0 || currentTurn >= players.length) return null;
        return players[currentTurn];
    };

    const isFirstPlayer = () => {
        return players.length > 0 && players[0] && players[0].id === mySocketId.current;
    };

    const getMyPlayer = () => {
        return players.find(p => p.id === mySocketId.current);
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

    return (
        <div className="table-wrapper">
            <h2 className="table-title">שולחן #{tableId.slice(0, 6)}</h2>
            
            {/* הצגת סטטוס החיבור */}
            <div className="connection-status">
                <span className={isConnected ? 'connected' : 'disconnected'}>
                    {isConnected ? '🟢 מחובר' : '🔴 לא מחובר'}
                </span>
            </div>

            {/* Debug info */}
            <div className="debug-info" style={{fontSize: '12px', marginBottom: '10px', backgroundColor: '#f0f0f0', padding: '10px'}}>
                <div>מספר שחקנים: {players.length}</div>
                <div>My Socket ID: {mySocketId.current || 'לא מוגדר'}</div>
                <div>My ID State: {myId || 'לא מוגדר'}</div>
                <div>Players IDs: {players.map(p => `${p.name}:${p.id.slice(0,8)}`).join(', ')}</div>
                <div>האם אני השחקן הראשון? {isFirstPlayer() ? 'כן' : 'לא'}</div>
                <div>משחק התחיל? {gameStarted ? 'כן' : 'לא'}</div>
                <div>תור נוכחי: {currentTurn} {getCurrentPlayer() ? `(${getCurrentPlayer().name})` : '(לא מוגדר)'}</div>
                <div>זה התור שלי? {isMyTurn() ? 'כן' : 'לא'}</div>
                <div>שלב: {stage}</div>
                <div>הימור נוכחי: {currentBet}</div>
                <div>יכול Check? {canCheck() ? 'כן' : 'לא'}</div>
                <div>יכול Call? {canCall() ? 'כן' : 'לא'}</div>
                <div>יכול Raise? {canRaise() ? 'כן' : 'לא'}</div>
                <div>סכום Call: {getCallAmount()}</div>
                <div>קלפי קהילה נראים: {getVisibleCommunityCards().length}</div>
                <div>השחקן שלי: {JSON.stringify(getMyPlayer()?.hand || 'אין')}</div>
            </div>

            <div className="poker-table">
                {players.length === 0 ? (
                    <div className="no-players">
                        <p>ממתין לשחקנים...</p>
                    </div>
                ) : (
                    players.map((player, index) => {
                        // חישוב האם להציג את הקלפים
                        const isMyPlayer = player.id === mySocketId.current;
                        const shouldShowCards = isMyPlayer || showAllCards;
                        
                        console.log(`Player ${player.name}: isMyPlayer=${isMyPlayer}, shouldShow=${shouldShowCards}, myId=${mySocketId.current}, playerId=${player.id}`);
                        
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
                                            <span key={i} className="card">
                                                {shouldShowCards ? card : '🂠'}
                                            </span>
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
                    })
                )}
                
                <div className="community-cards">
                    <h4>קלפי השולחן ({stage}):</h4>
                    <div className="cards-container">
                        {getVisibleCommunityCards().length > 0 ? (
                            getVisibleCommunityCards().map((card, i) => (
                                <div className="card" key={i}>{card || '🂠'}</div>
                            ))
                        ) : (
                            <div className="no-community-cards">
                                {stage === 'pre-flop' ? 'ממתין לפלופ...' : 'אין קלפי קהילה'}
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="pot-display">🏆 קופה: {pot}</div>
                <div className="current-bet">💸 הימור נוכחי: {currentBet}</div>
                <div className="stage-display">שלב: {stage}</div>
            </div>

            {/* כפתורי פעולה - רק למי שהתור שלו */}
            <div className="actions-section">
                <div style={{fontSize: '12px', marginBottom: '5px'}}>
                    כפתורי פעולה: {isMyTurn() ? 'מוצגים (התור שלך)' : 'מוסתרים (לא התור שלך)'}
                </div>
                {isMyTurn() && (
                    <div className="actions">
                        <button 
                            onClick={() => handleAction('Check')}
                            disabled={!canCheck()}
                            style={{backgroundColor: canCheck() ? 'lightgreen' : 'lightgray'}}
                        >
                            Check
                        </button>
                        <button 
                            onClick={() => handleAction('Call')}
                            disabled={!canCall()}
                            style={{backgroundColor: canCall() ? 'lightblue' : 'lightgray'}}
                        >
                            Call ({getCallAmount()})
                        </button>
                        <button 
                            onClick={handleRaise}
                            style={{backgroundColor: canRaise() ? 'orange' : 'lightgray'}}
                            disabled={!canRaise()}
                        >
                            {isRaising ? 'בצע Raise' : 'Raise'}
                        </button>
                        <button 
                            onClick={() => handleAction('Fold')}
                            style={{backgroundColor: 'lightcoral'}}
                        >
                            Fold
                        </button>
                    </div>
                )}
            </div>

            {/* כפתור התחלת משחק - רק לשחקן הראשון וכשלא התחיל עדיין */}
            {players.length >= 2 && isFirstPlayer() && !gameStarted && (
                <div className="start-game-button">
                    <button onClick={startGame} disabled={!isConnected}>
                        🎬 התחל משחק
                    </button>
                </div>
            )}

            {/* כפתור הצגת כל הקלפים - רק לשחקן הראשון */}
            {isFirstPlayer() && (
                <div className="show-cards-toggle">
                    <button onClick={() => setShowAllCards(prev => !prev)}>
                        {showAllCards ? '🙈 הסתר קלפים של כולם' : '👀 הצג קלפים של כולם'}
                    </button>
                </div>
            )}

            {/* Raise input */}
            {isRaising && (
                <div className="raise-input" style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'white',
                    padding: '20px',
                    border: '2px solid #333',
                    borderRadius: '10px',
                    zIndex: 1000
                }}>
                    <h4>בחר סכום לרייז:</h4>
                    <input
                        type="number"
                        min={currentBet + 1}
                        max={getMyPlayer() ? getMyPlayer().chips + getMyPlayer().currentBet : 0}
                        placeholder={`מינימום: ${currentBet + 1}`}
                        value={raiseAmount}
                        onChange={(e) => setRaiseAmount(e.target.value)}
                        style={{margin: '10px 0', padding: '5px', width: '200px'}}
                    />
                    <div>
                        <button 
                            onClick={confirmRaise}
                            style={{backgroundColor: 'lightgreen', margin: '5px', padding: '10px'}}
                        >
                            בצע רייז
                        </button>
                        <button 
                            onClick={() => {
                                setIsRaising(false);
                                setRaiseAmount('');
                            }}
                            style={{backgroundColor: 'lightcoral', margin: '5px', padding: '10px'}}
                        >
                            ביטול
                        </button>
                    </div>
                </div>
            )}

            {/* יומן פעולות */}
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
}

export default Table;
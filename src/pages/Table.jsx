import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import './Table.css';
import { io } from 'socket.io-client';

const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValue = Object.fromEntries(ranks.map((r, i) => [r, i + 2]));
const smallBlind = 5;
const bigBlind = 10;

const generateDeck = () => {
    const deck = [];
    for (let suit of suits) {
        for (let rank of ranks) {
            deck.push(`${rank}${suit}`);
        }
    }
    return deck.sort(() => Math.random() - 0.5);
};

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
    const [players, setPlayers] = useState([]);
    const [dealerIndex, setDealerIndex] = useState(0);
    const [currentTurn, setCurrentTurn] = useState(0);
    const [currentBet, setCurrentBet] = useState(0);
    const [pot, setPot] = useState(0);
    const [log, setLog] = useState([]);
    const [isRaising, setIsRaising] = useState(false);
    const [raiseAmount, setRaiseAmount] = useState('');
    const [stage, setStage] = useState('pre-flop');
    const [communityCards, setCommunityCards] = useState([]);
    const [deck, setDeck] = useState([]);
    const [bettingStartIndex, setBettingStartIndex] = useState(0);
    const [timeLeft, setTimeLeft] = useState(180);
    const [showAllCards, setShowAllCards] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const socket = useRef(null);

    const startGame = () => {
        if (socket.current && socket.current.connected) {
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
            console.log('Connected to server');
            setIsConnected(true);
            mySocketId.current = socket.current.id;
            // הצטרפות לשולחן מיד אחרי החיבור
            socket.current.emit('join-table', tableId);
        });

        socket.current.on('disconnect', () => {
            console.log('Disconnected from server');
            setIsConnected(false);
        });

        socket.current.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setIsConnected(false);
        });

        socket.current.on('state-update', (tableData) => {
            console.log('State update received:', tableData);
            if (tableData) {
                setPlayers(tableData.players || []);
                setPot(tableData.pot || 0);
                setLog(tableData.log || []);
                setCurrentTurn(tableData.currentTurn || 0);
                setCommunityCards(tableData.communityCards || []);
                setCurrentBet(tableData.currentBet || 0);
                setStage(tableData.stage || 'pre-flop');
                setDealerIndex(tableData.dealerIndex || 0);
            }
        });

        socket.current.on('action-update', (data) => {
            console.log('Action update received:', data);
            if (data && data.type === 'update-state') {
                setPlayers(data.players || []);
                setPot(data.pot || 0);
                setCurrentTurn(data.currentTurn || 0);
                setCommunityCards(data.communityCards || []);
                setCurrentBet(data.currentBet || 0);
                if (data.action && data.playerName) {
                    setLog(prev => [`🎮 פעולה: ${data.action} (${data.playerName})`, ...prev]);
                }
            }
        });

        // ניקוי בעת unmount
        return () => {
            if (socket.current) {
                socket.current.disconnect();
            }
        };
    }, [tableId]);

    useEffect(() => {
        if (players.length === 0) return;
        
        setTimeLeft(180);
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
    }, [currentTurn, players.length]);

    const checkForSingleRemaining = () => {
        const remaining = players.filter(p => !p.folded);
        if (remaining.length === 1) {
            const winner = remaining[0];
            const updated = players.map(p => ({
                ...p,
                chips: p.id === winner.id ? p.chips + pot : p.chips,
                currentBet: 0
            }));
            setPlayers(updated);
            setLog(prev => [`🏆 ${winner.name} זכה כי כולם פרשו`, ...prev]);
            setPot(0);
            setTimeout(() => startNewHand(updated), 4000);
            return true;
        }
        return false;
    };

    const startNewHand = (prevPlayers) => {
        const newDeck = generateDeck();
        const updatedPlayers = prevPlayers.map(p => ({
            ...p,
            currentBet: 0,
            folded: false,
            hand: [newDeck.pop(), newDeck.pop()]
        }));

        const sbIndex = (dealerIndex + 1) % updatedPlayers.length;
        const bbIndex = (dealerIndex + 2) % updatedPlayers.length;
        updatedPlayers[sbIndex].chips -= smallBlind;
        updatedPlayers[sbIndex].currentBet = smallBlind;
        updatedPlayers[bbIndex].chips -= bigBlind;
        updatedPlayers[bbIndex].currentBet = bigBlind;

        const flop = [newDeck.pop(), newDeck.pop(), newDeck.pop()];
        const turn = [newDeck.pop()];
        const river = [newDeck.pop()];

        setPlayers(updatedPlayers);
        setCommunityCards([...flop, ...turn, ...river]);
        setDeck(newDeck);
        setCurrentBet(bigBlind);
        setPot(smallBlind + bigBlind);
        setLog(['✨ התחלה חדשה']);
        setStage('pre-flop');
        const first = (dealerIndex + 3) % updatedPlayers.length;
        setCurrentTurn(first);
        setBettingStartIndex(first);
        setDealerIndex((dealerIndex + 1) % updatedPlayers.length);
    };

    const getNextActivePlayer = (fromIndex = currentTurn) => {
        if (players.length === 0) return 0;
        let index = fromIndex, attempts = 0;
        do {
            index = (index + 1) % players.length;
            attempts++;
        } while (players[index]?.folded && attempts < players.length);
        return index;
    };

    const isBettingRoundOver = (nextIndex) => {
        const active = players.filter(p => !p.folded && p.chips > 0);
        const allCalled = active.every(p => p.currentBet === currentBet);
        return allCalled && nextIndex === bettingStartIndex;
    };

    const advanceStage = () => {
        if (stage === 'pre-flop') setStage('flop');
        else if (stage === 'flop') setStage('turn');
        else if (stage === 'turn') setStage('river');
        else determineWinner();
    };

    const determineWinner = () => {
        const active = players.filter(p => !p.folded);
        const scores = active.map(p => {
            const result = evaluateHand([...p.hand, ...communityCards]);
            return { player: p, ...result };
        });
        const maxScore = Math.max(...scores.map(s => s.score));
        const top = scores.filter(s => s.score === maxScore);
        const maxBest = Math.max(...top.map(s => s.best));
        const winners = top.filter(s => s.best === maxBest);
        const share = Math.floor(pot / winners.length);

        const updated = players.map(p => {
            const win = winners.find(w => w.player.id === p.id);
            return {
                ...p,
                chips: win ? p.chips + share : p.chips - p.currentBet,
                currentBet: 0
            };
        });

        setPlayers(updated);
        const names = winners.map(w => `${w.player.name} (${w.handName})`).join(', ');
        setLog(prev => [
            winners.length === 1
                ? `🏆 ${names} זכה בקופה`
                : `🤝 תיקו! ${names} חלקו את הקופה`,
            ...prev
        ]);
        setPot(0);
        setTimeout(() => startNewHand(updated), 5000);
    };

    const resetBetsForNextRound = () => {
        const reset = players.map(p => ({ ...p, currentBet: 0 }));
        setPlayers(reset);
        setCurrentBet(0);
        setLog(prev => [`⭐ עוברים לשלב הבא`, ...prev]);
        const next = getNextActivePlayer(currentTurn);
        setCurrentTurn(next);
        setBettingStartIndex(next);
        advanceStage();
    };

    const nextTurn = () => {
        const next = getNextActivePlayer(currentTurn);
        isBettingRoundOver(next) ? resetBetsForNextRound() : setCurrentTurn(next);
    };

    const handleAction = (action) => {
        console.log(`Attempting action: ${action}, isMyTurn: ${isMyTurn()}, currentPlayer:`, getCurrentPlayer());
        
        if (!isMyTurn()) {
            console.log('Not my turn, ignoring action');
            return;
        }

        const updated = [...players];
        const player = updated[currentTurn];

        if (!player || player.folded) {
            console.log('Player not found or folded');
            return nextTurn();
        }

        if (action === 'Fold') {
            player.folded = true;
            setLog(prev => [`${player.name} פרש ❌`, ...prev]);
        } else if (action === 'Call') {
            const toCall = currentBet - player.currentBet;
            const callAmount = Math.min(toCall, player.chips);
            player.chips -= callAmount;
            player.currentBet += callAmount;
            setPot(prev => prev + callAmount);
            setLog(prev => [`${player.name} השווה ${callAmount} ₪`, ...prev]);
        } else if (action === 'Raise') {
            setIsRaising(true);
            return;
        } else if (action === 'Check') {
            if (player.currentBet === currentBet) {
                setLog(prev => [`${player.name} עשה Check`, ...prev]);
            } else {
                setLog(prev => [`${player.name} לא יכול Check ❌`, ...prev]);
                return;
            }
        }
        
        setPlayers(updated);
        
        if (socket.current && socket.current.connected) {
            socket.current.emit('player-action', {
                tableId,
                action,
                playerId: player.id,
                playerName: player.name
            });
        }
        
        if (checkForSingleRemaining()) return;
        nextTurn();
    };

    const confirmRaise = () => {
        const amount = parseInt(raiseAmount);
        const updated = [...players];
        const player = updated[currentTurn];

        if (!player || isNaN(amount) || amount <= currentBet || amount > player.chips + player.currentBet) {
            setLog(prev => [`סכום רייז לא תקין ❌`, ...prev]);
            return;
        }

        const toCall = Math.min(amount - player.currentBet, player.chips);
        player.currentBet += toCall;
        player.chips -= toCall;
        setCurrentBet(amount);
        setPot(prev => prev + toCall);
        setPlayers(updated);
        setIsRaising(false);
        setRaiseAmount('');
        setLog(prev => [`${player.name} העלה ל-${amount} ₪`, ...prev]);
        const next = getNextActivePlayer(currentTurn);
        setCurrentTurn(next);
        setBettingStartIndex(next);
    };

    const getVisibleCommunityCards = () => {
        if (stage === 'pre-flop') return [];
        if (stage === 'flop') return communityCards.slice(0, 3);
        if (stage === 'turn') return communityCards.slice(0, 4);
        return communityCards;
    };

    const isMyTurn = () => {
        return players.length > 0 && 
               currentTurn < players.length &&
               players[currentTurn] && 
               players[currentTurn].id === mySocketId.current;
    };

    const getCurrentPlayer = () => {
        if (players.length === 0 || currentTurn >= players.length) return null;
        return players[currentTurn];
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
                <div>Socket ID: {mySocketId.current}</div>
                <div>תור נוכחי: {currentTurn} {getCurrentPlayer() ? `(${getCurrentPlayer().name})` : '(לא מוגדר)'}</div>
                <div>זה התור שלי? {isMyTurn() ? 'כן' : 'לא'}</div>
                <div>שלב: {stage}</div>
                <div>הימור נוכחי: {currentBet}</div>
            </div>

            <div className="poker-table">
                {players.length === 0 ? (
                    <div className="no-players">
                        <p>ממתין לשחקנים...</p>
                    </div>
                ) : (
                    players.map((player, index) => (
                        <div 
                            key={player.id} 
                            className={`player-seat seat-${index} ${index === currentTurn ? 'active-seat' : ''} ${player.folded ? 'folded-seat' : ''}`}
                        >
                            <div className="avatar">🎭</div>
                            <div className="player-name">{player.name}</div>
                            <div className="player-hand">
                                {player.hand && player.hand.map((card, i) => (
                                    <span key={i} className="card">
                                        {(player.id === mySocketId.current || showAllCards) ? card : '🂠'}
                                    </span>
                                ))}
                            </div>
                            <div className="player-chips">💵 {player.chips}</div>
                            <div className="player-bet">💸 {player.currentBet}</div>
                            {index === currentTurn && !player.folded && (
                                <>
                                    <div className="turn-indicator">🎯</div>
                                    <div className="timer">⏱️ {timeLeft}s</div>
                                </>
                            )}
                            {index === dealerIndex && (
                                <div className="dealer-button">D</div>
                            )}
                        </div>
                    ))
                )}
                
                <div className="community-cards">
                    <h4>קלפי השולחן:</h4>
                    <div className="cards-container">
                        {getVisibleCommunityCards().map((card, i) => (
                            <div className="card" key={i}>{card}</div>
                        ))}
                    </div>
                </div>
                
                <div className="pot-display">🏆 קופה: {pot}</div>
                <div className="current-bet">💸 הימור נוכחי: {currentBet}</div>
                <div className="stage-display">שלב: {stage}</div>
            </div>

            {/* כפתורי פעולה - עם debug */}
            <div className="actions-section">
                <div style={{fontSize: '12px', marginBottom: '5px'}}>
                    כפתורי פעולה: {isMyTurn() ? 'מוצגים (התור שלך)' : 'מוסתרים (לא התור שלך)'}
                </div>
                {isMyTurn() && (
                    <div className="actions">
                        <button 
                            onClick={() => handleAction('Check')}
                            disabled={getCurrentPlayer()?.currentBet !== currentBet}
                            style={{backgroundColor: getCurrentPlayer()?.currentBet === currentBet ? 'lightgreen' : 'lightgray'}}
                        >
                            Check
                        </button>
                        <button 
                            onClick={() => handleAction('Call')}
                            disabled={getCurrentPlayer()?.currentBet === currentBet}
                            style={{backgroundColor: getCurrentPlayer()?.currentBet !== currentBet ? 'lightblue' : 'lightgray'}}
                        >
                            Call ({currentBet - (getCurrentPlayer()?.currentBet || 0)})
                        </button>
                        <button 
                            onClick={() => handleAction('Raise')}
                            style={{backgroundColor: 'orange'}}
                        >
                            Raise
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

            {/* כפתור התחלת משחק */}
            {players.length >= 2 && (
                <div className="start-game-button">
                    <button onClick={startGame} disabled={!isConnected}>
                        🎬 התחל משחק
                    </button>
                </div>
            )}

            {/* כפתור הצגת כל הקלפים - תמיד מוצג */}
            <div className="show-cards-toggle">
                <button onClick={() => setShowAllCards(prev => !prev)}>
                    {showAllCards ? '🙈 הסתר קלפים של כולם' : '👀 הצג קלפים של כולם'}
                </button>
            </div>

            {/* Raise input */}
            {isRaising && (
                <div className="raise-input">
                    <input
                        type="number"
                        min={currentBet + 1}
                        max={players[currentTurn]?.chips + players[currentTurn]?.currentBet}
                        placeholder="סכום רייז"
                        value={raiseAmount}
                        onChange={(e) => setRaiseAmount(e.target.value)}
                    />
                    <button onClick={confirmRaise}>בצע</button>
                    <button onClick={() => setIsRaising(false)}>ביטול</button>
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
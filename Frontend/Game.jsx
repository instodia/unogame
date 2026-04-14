import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socket from './socket';
import Card from './Card';
import ColorPicker from './ColorPicker';
import './Game.css';

const COLOR_BG = { red: '#E8192C', blue: '#0057B8', green: '#00A651', yellow: '#FFD700', wild: '#1a1a2e' };

export default function Game() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingCard, setPendingCard] = useState(null);
  const [error, setError] = useState('');
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [animatingCard, setAnimatingCard] = useState(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const chatEndRef = useRef(null);
  const discardRef = useRef(null);
  const cardRefs = useRef({});

  const myId = localStorage.getItem('uno_player_id');
  const me = gameState?.players.find(p => p.id === myId);
  const isMyTurn = gameState?.players[gameState.currentPlayerIndex]?.id === myId;

  useEffect(() => {
    const handleConnect = () => {
      const pid = localStorage.getItem('uno_player_id');
      if (pid) socket.emit('rejoin_room', { code, playerId: pid }, () => {});
    };

    socket.on('connect', handleConnect);
    socket.on('game_state', (state) => {
      setGameState(state);
      if (state.status === 'finished') setError('');
    });
    socket.on('lobby_state', () => navigate(`/lobby/${code}`));
    socket.on('chat_message', (msg) => setChat(prev => [...prev.slice(-49), msg]));
    socket.on('player_disconnected', ({ playerName }) => {
      setChat(prev => [...prev, { playerName: '🔌 System', message: `${playerName} disconnected`, ts: Date.now() }]);
    });
    socket.on('player_left', ({ playerName }) => {
      setChat(prev => [...prev, { playerName: '🔌 System', message: `${playerName} left the game`, ts: Date.now() }]);
    });

    const pid = localStorage.getItem('uno_player_id');
    if (pid) {
      socket.emit('rejoin_room', { code, playerId: pid }, (res) => {
        if (res?.error) navigate('/');
      });
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('game_state');
      socket.off('lobby_state');
      socket.off('chat_message');
      socket.off('player_disconnected');
      socket.off('player_left');
    };
  }, [code, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const handlePlayCard = (card) => {
    if (!isMyTurn) return;
    
    if (card.color === 'wild') {
      setPendingCard(card);
      setShowColorPicker(true);
      return;
    }
    
    const cardEl = cardRefs.current[card.id];
    const discardEl = discardRef.current;
    
    if (cardEl && discardEl) {
      const cardRect = cardEl.getBoundingClientRect();
      const discardRect = discardEl.getBoundingClientRect();
      
      setAnimatingCard({
        card,
        id: `anim-${Date.now()}`,
        style: {
          position: 'fixed',
          top: cardRect.top,
          left: cardRect.left,
          width: cardRect.width,
          height: cardRect.height,
          zIndex: 1000,
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }
      });
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimatingCard(prev => prev ? {
            ...prev,
            style: {
              ...prev.style,
              top: discardRect.top,
              left: discardRect.left,
              transform: 'scale(0.8) rotate(15deg)',
              opacity: 0.8,
            }
          } : null);
        });
      });
      
      setTimeout(() => {
        socket.emit('play_card', { cardId: card.id }, (res) => {
          if (res?.error) {
            setError(res.error);
          }
        });
        setAnimatingCard(null);
      }, 380);
    } else {
      socket.emit('play_card', { cardId: card.id }, (res) => {
        if (res?.error) setError(res.error);
      });
    }
  };

  const handleColorChosen = (color) => {
    setShowColorPicker(false);
    if (!pendingCard) return;
    socket.emit('play_card', { cardId: pendingCard.id, chosenColor: color }, (res) => {
      if (res?.error) setError(res.error);
    });
    setPendingCard(null);
  };

  const handleDraw = () => {
    socket.emit('draw_card', {}, (res) => {
      if (res?.error) setError(res.error);
    });
  };

  const handleExit = () => {
    socket.emit('leave_game', {}, () => {
      localStorage.removeItem('uno_room_code');
      localStorage.removeItem('uno_player_name');
      navigate('/');
    });
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit('send_chat', { message: chatInput.trim() });
    setChatInput('');
  };

  if (!gameState) {
    return (
      <div className="game-loading">
        <div className="loader" />
        <p>Connecting to game...</p>
      </div>
    );
  }

  if (gameState.status === 'finished') {
    const allLeft = gameState.gameEndReason === 'all_left';
    
    return (
      <div className="game-over">
        <div className="game-over-card">
          {allLeft ? (
            <>
              <div className="game-ended-icon">👋</div>
              <h1>Game Ended</h1>
              <p>All other players left the game.</p>
              <button className="btn-primary" onClick={() => navigate('/')}>Exit to Home</button>
            </>
          ) : (
            <>
              <div className="trophy">🏆</div>
              <h1>{gameState.winner?.name} Wins!</h1>
              <p>Congratulations!</p>
              <button className="btn-primary" onClick={() => navigate('/')}>Play Again</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const opponents = gameState.players.filter(p => p.id !== myId);
  const topCard = gameState.topCard;
  const currentPlayerName = gameState.players[gameState.currentPlayerIndex]?.name;
  const currentColor = gameState.currentColor;

  return (
    <div className="game">
      {showColorPicker && <ColorPicker onSelect={handleColorChosen} />}

      {showExitConfirm && (
        <div className="exit-confirm-overlay">
          <div className="exit-confirm">
            <h3>Leave Game?</h3>
            <p>Are you sure you want to leave? Your progress will be lost.</p>
            <div className="exit-confirm-buttons">
              <button className="btn-cancel" onClick={() => setShowExitConfirm(false)}>Cancel</button>
              <button className="btn-exit-confirm" onClick={handleExit}>Leave</button>
            </div>
          </div>
        </div>
      )}

      <button className="exit-btn" onClick={() => setShowExitConfirm(true)} title="Exit Game">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>

      <button className="chat-btn" onClick={() => setShowChat(s => !s)} title="Chat">
        💬
        {chat.length > 0 && !showChat && <span className="chat-badge">{chat.length}</span>}
      </button>

      <div className="opponents-area">
        {opponents.map(opp => (
          <div key={opp.id} className={`opponent ${opp.isCurrent ? 'active-player' : ''}`}>
            <div className="opp-info">
              <span className="opp-name">{opp.name}</span>
              {opp.isCurrent && <span className="turn-badge">THEIR TURN</span>}
              {opp.cardCount === 1 && <span className="uno-badge">UNO!</span>}
              {!opp.connected && <span className="dc-badge">OFFLINE</span>}
            </div>
            <div className="opp-cards-count">
              <span className="card-count">{opp.cardCount}</span>
              <span className="card-label">cards</span>
            </div>
          </div>
        ))}
      </div>

      <div className="board">
        <div className="color-indicator" style={{ background: COLOR_BG[currentColor] }}>
          <span>{currentColor?.toUpperCase()}</span>
        </div>

        <div className="action-log">{gameState.lastAction}</div>

        <div className="piles">
          <div className="pile-area">
            <div
              className={`card face-down draw-pile ${isMyTurn ? 'valid' : ''}`}
              onClick={isMyTurn ? handleDraw : undefined}
              title="Draw a card"
            >
              <span className="pile-count">{gameState.deckSize}</span>
            </div>
            <span className="pile-label">Draw</span>
          </div>

          <div className="pile-area" ref={discardRef}>
            <Card card={topCard} size="large" />
            <span className="pile-label">Discard</span>
          </div>
        </div>

        <div className={`turn-indicator ${isMyTurn ? 'your-turn' : ''}`}>
          {isMyTurn ? '⚡ YOUR TURN' : `${currentPlayerName}'s turn`}
        </div>
      </div>

      <div className="my-hand-area">
        {me?.cardCount === 1 && <div className="uno-shout">UNO! 🎉</div>}
        {error && <div className="hand-error" onClick={() => setError('')}>{error} ✕</div>}
        <div className="my-hand">
          {me?.hand?.map((card, index) => (
            <div 
              key={card.id} 
              className="card-wrapper"
              style={{ animationDelay: `${index * 30}ms` }}
              ref={el => cardRefs.current[card.id] = el}
            >
              <Card
                card={card}
                isValid={isMyTurn && me.validCards?.includes(card.id)}
                onClick={() => {
                  if (isMyTurn && me.validCards?.includes(card.id)) {
                    handlePlayCard(card);
                  }
                }}
              />
            </div>
          ))}
        </div>
        <div className="hand-info">
          <span>{me?.hand?.length ?? 0} cards</span>
        </div>
      </div>

      {animatingCard && (
        <div style={animatingCard.style} className="animating-card-wrapper">
          <Card card={animatingCard.card} />
        </div>
      )}

      {showChat && (
        <div className="chat-panel">
          <div className="chat-header">
            <span>Chat</span>
            <button className="chat-close" onClick={() => setShowChat(false)}>×</button>
          </div>
          <div className="chat-msgs">
            {chat.map((m, i) => (
              <div key={i} className="chat-msg">
                <span className="chat-name">{m.playerName}:</span>
                <span>{m.message}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-row">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Say something..."
              maxLength={200}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
            />
            <button onClick={sendChat}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

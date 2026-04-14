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

  const myId = sessionStorage.getItem('uno_player_id');
  const me = gameState?.players.find(p => p.id === myId);
  const isMyTurn = gameState?.players[gameState.currentPlayerIndex]?.id === myId;

  useEffect(() => {
    const handleConnect = () => {
      const pid = sessionStorage.getItem('uno_player_id');
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

    const pid = sessionStorage.getItem('uno_player_id');
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

  const handlePlayCard = (card, cardElement) => {
    if (!isMyTurn) return;
    
    if (card.color === 'wild') {
      setPendingCard(card);
      setShowColorPicker(true);
      return;
    }
    
    const rect = cardElement.getBoundingClientRect();
    const discardRect = discardRef.current?.getBoundingClientRect();
    
    if (rect && discardRect) {
      const deltaX = discardRect.left + discardRect.width / 2 - rect.left - rect.width / 2;
      const deltaY = discardRect.top + discardRect.height / 2 - rect.top - rect.height / 2;
      
      setAnimatingCard({
        card,
        startX: rect.left,
        startY: rect.top,
        deltaX,
        deltaY,
        rotation: Math.random() * 20 - 10,
      });
      
      setTimeout(() => {
        socket.emit('play_card', { cardId: card.id }, (res) => {
          if (res?.error) {
            setError(res.error);
            setAnimatingCard(null);
          }
        });
        setAnimatingCard(null);
      }, 400);
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
      sessionStorage.removeItem('uno_player_id');
      sessionStorage.removeItem('uno_room_code');
      sessionStorage.removeItem('uno_player_name');
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
    return (
      <div className="game-over">
        <div className="game-over-card">
          <div className="trophy">🏆</div>
          <h1>{gameState.winner?.name} Wins!</h1>
          <p>Congratulations!</p>
          <button className="btn-primary" onClick={() => navigate('/')}>Play Again</button>
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
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <Card
                card={card}
                isValid={isMyTurn && me.validCards?.includes(card.id)}
                onClick={(e) => {
                  if (isMyTurn && me.validCards?.includes(card.id)) {
                    handlePlayCard(card, e.currentTarget.querySelector('.card'));
                  }
                }}
              />
            </div>
          ))}
        </div>
        <div className="hand-info">
          <span>{me?.hand?.length ?? 0} cards</span>
          <button className="chat-toggle" onClick={() => setShowChat(s => !s)}>
            💬 Chat {chat.length > 0 && !showChat && <span className="chat-dot" />}
          </button>
        </div>
      </div>

      {animatingCard && (
        <div 
          className="animating-card"
          style={{
            '--start-x': `${animatingCard.startX}px`,
            '--start-y': `${animatingCard.startY}px`,
            '--delta-x': `${animatingCard.deltaX}px`,
            '--delta-y': `${animatingCard.deltaY}px`,
            '--rotation': `${animatingCard.rotation}deg`,
          }}
        >
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

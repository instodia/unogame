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
  const chatEndRef = useRef(null);

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

    // Rejoin
    const pid = sessionStorage.getItem('uno_player_id');
    if (pid) socket.emit('rejoin_room', { code, playerId: pid }, (res) => {
      if (res?.error) navigate('/');
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('game_state');
      socket.off('lobby_state');
      socket.off('chat_message');
      socket.off('player_disconnected');
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
    socket.emit('play_card', { cardId: card.id }, (res) => {
      if (res?.error) setError(res.error);
    });
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

      {/* Opponents */}
      <div className="opponents-area">
        {opponents.map(opp => (
          <div key={opp.id} className={`opponent ${opp.isCurrent ? 'active-player' : ''}`}>
            <div className="opp-info">
              <span className="opp-name">{opp.name}</span>
              {opp.isCurrent && <span className="turn-badge">THEIR TURN</span>}
              {opp.cardCount === 1 && <span className="uno-badge">UNO!</span>}
              {!opp.connected && <span className="dc-badge">OFFLINE</span>}
            </div>
            <div className="opp-cards">
              {Array.from({ length: Math.min(opp.cardCount, 12) }).map((_, i) => (
                <div key={i} className="card face-down opp-card" />
              ))}
              {opp.cardCount > 12 && <span className="card-overflow">+{opp.cardCount - 12}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Center Board */}
      <div className="board">
        {/* Color indicator */}
        <div className="color-indicator" style={{ background: COLOR_BG[currentColor] }}>
          <span>{currentColor?.toUpperCase()}</span>
        </div>

        {/* Action log */}
        <div className="action-log">{gameState.lastAction}</div>

        {/* Piles */}
        <div className="piles">
          {/* Draw pile */}
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

          {/* Discard pile */}
          <div className="pile-area">
            <Card card={topCard} size="large" />
            <span className="pile-label">Discard</span>
          </div>
        </div>

        {/* Turn indicator */}
        <div className={`turn-indicator ${isMyTurn ? 'your-turn' : ''}`}>
          {isMyTurn ? '⚡ YOUR TURN' : `${currentPlayerName}'s turn`}
        </div>
      </div>

      {/* My Hand */}
      <div className="my-hand-area">
        {me?.cardCount === 1 && <div className="uno-shout">UNO! 🎉</div>}
        {error && <div className="hand-error" onClick={() => setError('')}>{error} ✕</div>}
        <div className="my-hand">
          {me?.hand?.map(card => (
            <Card
              key={card.id}
              card={card}
              isValid={isMyTurn && me.validCards?.includes(card.id)}
              onClick={() => handlePlayCard(card)}
            />
          ))}
        </div>
        <div className="hand-info">
          <span>{me?.hand?.length ?? 0} cards</span>
          <button className="chat-toggle" onClick={() => setShowChat(s => !s)}>
            💬 Chat {chat.length > 0 && !showChat && <span className="chat-dot" />}
          </button>
        </div>
      </div>

      {/* Chat panel */}
      {showChat && (
        <div className="chat-panel">
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

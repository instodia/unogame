import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socket from '../socket';
import './Lobby.css';

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const myId = sessionStorage.getItem('uno_player_id');

  useEffect(() => {
    // Rejoin on reconnect
    const handleConnect = () => {
      const pid = sessionStorage.getItem('uno_player_id');
      if (pid) socket.emit('rejoin_room', { code, playerId: pid }, () => {});
    };

    socket.on('connect', handleConnect);
    socket.on('lobby_state', setLobby);
    socket.on('game_state', (state) => {
      if (state.status === 'playing') navigate(`/game/${code}`);
    });

    // Try rejoin if already have session
    if (!socket.connected) {
      socket.connect();
    } else {
      const pid = sessionStorage.getItem('uno_player_id');
      if (pid) socket.emit('rejoin_room', { code, playerId: pid }, (res) => {
        if (res?.error) setError(res.error);
      });
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('lobby_state', setLobby);
      socket.off('game_state');
    };
  }, [code, navigate]);

  const handleStart = () => {
    socket.emit('start_game', {}, (res) => {
      if (res?.error) setError(res.error);
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHost = lobby?.hostId === myId;

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h2>Waiting Room</h2>

        <div className="room-code-box">
          <span className="room-label">Room Code</span>
          <div className="room-code-row">
            <span className="room-code">{code}</span>
            <button className="copy-btn" onClick={copyCode}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <span className="room-hint">Share this code with friends</span>
        </div>

        <div className="players-section">
          <h3>Players {lobby ? `(${lobby.players.length}/4)` : ''}</h3>
          <div className="players-list">
            {lobby?.players.map(p => (
              <div key={p.id} className="player-row">
                <div className="player-avatar">{p.name[0].toUpperCase()}</div>
                <span className="player-name">{p.name} {p.id === myId ? '(You)' : ''}</span>
                <div className="badges">
                  {p.isHost && <span className="badge host">HOST</span>}
                  {!p.connected && <span className="badge dc">OFFLINE</span>}
                </div>
              </div>
            ))}
            {lobby && lobby.players.length < 4 && (
              Array.from({ length: 4 - lobby.players.length }).map((_, i) => (
                <div key={`empty-${i}`} className="player-row empty">
                  <div className="player-avatar empty-av">?</div>
                  <span>Waiting for player...</span>
                </div>
              ))
            )}
          </div>
        </div>

        {error && <p className="err">{error}</p>}

        {isHost ? (
          <button
            className="btn-start"
            onClick={handleStart}
            disabled={!lobby || lobby.players.length < 2}
          >
            {!lobby || lobby.players.length < 2
              ? 'Need at least 2 players'
              : '🎲 Start Game'}
          </button>
        ) : (
          <div className="waiting-msg">
            <span className="spin">⏳</span> Waiting for host to start...
          </div>
        )}

        <button className="btn-leave" onClick={() => navigate('/')}>← Leave Room</button>
      </div>
    </div>
  );
}

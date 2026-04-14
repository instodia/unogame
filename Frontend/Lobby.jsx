import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socket from './socket';
import './Lobby.css';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [rejoining, setRejoining] = useState(true);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const hasValidated = useRef(false);
  const hasRejoined = useRef(false);

  const myId = localStorage.getItem('uno_player_id');

  useEffect(() => {
    if (hasValidated.current) return;
    hasValidated.current = true;

    const validateRoom = async () => {
      try {
        const res = await fetch(`${API_URL}/api/room/${code}`);
        const data = await res.json();

        if (!data.exists) {
          setRoomNotFound(true);
          setRejoining(false);
          setTimeout(() => {
            navigate('/');
          }, 3000);
          return;
        }

        if (data.status === 'playing' || data.status === 'finished') {
          navigate(`/?roomcode=${code}`);
          return;
        }

        attemptRejoin();
      } catch (e) {
        console.error('Room validation error:', e);
        attemptRejoin();
      }
    };

    const attemptRejoin = () => {
      const rejoinRoom = () => {
        const pid = localStorage.getItem('uno_player_id');
        if (!pid) {
          setRejoining(false);
          return;
        }

        socket.emit('rejoin_room', { code, playerId: pid }, (res) => {
          setRejoining(false);
          if (res?.error) {
            navigate(`/?roomcode=${code}`);
          }
        });
      };

      const handleConnect = () => {
        rejoinRoom();
      };

      socket.on('connect', handleConnect);
      socket.on('lobby_state', (state) => {
        setLobby(state);
        setRejoining(false);
      });
      socket.on('game_state', (state) => {
        if (state.status === 'playing') navigate(`/game/${code}`);
      });

      if (!socket.connected) {
        socket.connect();
      } else {
        if (!hasRejoined.current) {
          hasRejoined.current = true;
          rejoinRoom();
        }
      }

      return () => {
        socket.off('connect', handleConnect);
        socket.off('lobby_state');
        socket.off('game_state');
      };
    };

    validateRoom();
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

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/?roomcode=${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const isHost = lobby?.hostId === myId;

  if (roomNotFound) {
    return (
      <div className="lobby-error">
        <div className="lobby-card">
          <div className="error-icon">❌</div>
          <h2>Room Not Found</h2>
          <p>This room doesn't exist or has expired.</p>
          <p className="redirect-text">Redirecting to home in 3 seconds...</p>
        </div>
      </div>
    );
  }

  if (rejoining) {
    return (
      <div className="lobby-loading">
        <div className="loader" />
        <p>Checking room...</p>
      </div>
    );
  }

  if (error && !lobby) {
    return (
      <div className="lobby-error">
        <div className="lobby-card">
          <h2>Unable to Join</h2>
          <p>{error}</p>
          <button className="btn-primary" onClick={() => navigate('/')}>Go to Home</button>
        </div>
      </div>
    );
  }

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

        {isHost && (
          <button className="btn-invite" onClick={copyInviteLink}>
            {inviteCopied ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Link Copied!
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3"/>
                  <circle cx="6" cy="12" r="3"/>
                  <circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                Invite Friends
              </>
            )}
          </button>
        )}

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

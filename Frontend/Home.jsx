import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import socket from './socket';
import './Home.css';

function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function getOrCreateUserId() {
  let userId = localStorage.getItem('uno_user_id');
  if (!userId) {
    userId = generateUserId();
    localStorage.setItem('uno_user_id', userId);
  }
  return userId;
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(socket.connected);
  const [codeFromUrl, setCodeFromUrl] = useState('');
  const [userId] = useState(getOrCreateUserId);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const roomCode = params.get('roomcode');
    if (roomCode) {
      const validCode = roomCode.trim().toUpperCase();
      if (validCode.length === 6) {
        setTab('join');
        setCode(validCode);
        setCodeFromUrl(validCode);
      }
    }
  }, [location.search]);

  const handleClearCode = () => {
    setCode('');
    setCodeFromUrl('');
    const params = new URLSearchParams(location.search);
    params.delete('roomcode');
    const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, '', newUrl);
  };

  const handleCreate = () => {
    if (!name.trim()) return setError('Enter your name');
    setLoading(true); setError('');
    socket.emit('create_room', { playerName: name.trim(), userId }, (res) => {
      setLoading(false);
      if (res.error) return setError(res.error);
      localStorage.setItem('uno_player_id', res.playerId);
      localStorage.setItem('uno_room_code', res.code);
      localStorage.setItem('uno_player_name', name.trim());
      navigate(`/lobby/${res.code}`);
    });
  };

  const handleJoin = () => {
    if (!name.trim()) return setError('Enter your name');
    if (!code.trim()) return setError('Enter room code');
    setLoading(true); setError('');
    socket.emit('join_room', { playerName: name.trim(), code: code.trim().toUpperCase(), userId }, (res) => {
      setLoading(false);
      if (res.error) return setError(res.error);
      localStorage.setItem('uno_player_id', res.playerId);
      localStorage.setItem('uno_room_code', res.code);
      localStorage.setItem('uno_player_name', name.trim());
      navigate(`/lobby/${res.code}`);
    });
  };

  const isCodeReadOnly = !!codeFromUrl;

  return (
    <div className="home">
      <div className="home-bg" />
      <div className="home-content">
        <div className="logo-area">
          <h1 className="logo">UNO</h1>
          <p className="tagline">Multiplayer • Real-time • Online</p>
        </div>

        <div className="home-card">
          <div className="conn-badge" data-ok={connected}>
            <span className="dot" /> {connected ? 'Connected' : 'Connecting...'}
          </div>

          <div className="tabs">
            <button className={tab === 'create' ? 'active' : ''} onClick={() => { setTab('create'); setError(''); }}>
              Create Room
            </button>
            <button className={tab === 'join' ? 'active' : ''} onClick={() => { setTab('join'); setError(''); }}>
              Join Room
            </button>
          </div>

          <div className="form-body">
            <div className="field">
              <label>Your Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                onKeyDown={e => e.key === 'Enter' && (tab === 'create' ? handleCreate() : handleJoin())}
              />
            </div>

            {tab === 'join' && (
              <div className="field">
                <label>Room Code</label>
                <div className={`code-input-wrapper ${isCodeReadOnly ? 'read-only' : ''}`}>
                  <input
                    value={code}
                    onChange={e => !isCodeReadOnly && setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC123"
                    maxLength={6}
                    readOnly={isCodeReadOnly}
                    className="code-input"
                    onKeyDown={e => e.key === 'Enter' && !isCodeReadOnly && handleJoin()}
                  />
                  {isCodeReadOnly && (
                    <button className="code-clear-btn" onClick={handleClearCode} title="Remove room code">
                      ✕
                    </button>
                  )}
                </div>
                {isCodeReadOnly && (
                  <p className="code-hint">You were invited to join this room</p>
                )}
              </div>
            )}

            {error && <p className="err">{error}</p>}

            <button
              className="btn-primary"
              onClick={tab === 'create' ? handleCreate : handleJoin}
              disabled={loading || !connected || (isCodeReadOnly && !code.trim())}
            >
              {loading ? 'Loading...' : tab === 'create' ? '🎲 Create Room' : '🚪 Join Room'}
            </button>
          </div>
        </div>

        <p className="hint">Share the 6-character room code with friends to play together</p>
      </div>
    </div>
  );
}

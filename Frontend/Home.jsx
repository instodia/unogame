import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from './socket';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return setError('Enter your name');
    setLoading(true); setError('');
    socket.emit('create_room', { playerName: name.trim() }, (res) => {
      setLoading(false);
      if (res.error) return setError(res.error);
      // Save session
      sessionStorage.setItem('uno_player_id', res.playerId);
      sessionStorage.setItem('uno_room_code', res.code);
      sessionStorage.setItem('uno_player_name', name.trim());
      navigate(`/lobby/${res.code}`);
    });
  };

  const handleJoin = () => {
    if (!name.trim()) return setError('Enter your name');
    if (!code.trim()) return setError('Enter room code');
    setLoading(true); setError('');
    socket.emit('join_room', { playerName: name.trim(), code: code.trim().toUpperCase() }, (res) => {
      setLoading(false);
      if (res.error) return setError(res.error);
      sessionStorage.setItem('uno_player_id', res.playerId);
      sessionStorage.setItem('uno_room_code', res.code);
      sessionStorage.setItem('uno_player_name', name.trim());
      navigate(`/lobby/${res.code}`);
    });
  };

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
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  maxLength={6}
                  style={{ letterSpacing: '4px', fontWeight: 800, fontSize: '1.2rem' }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
              </div>
            )}

            {error && <p className="err">{error}</p>}

            <button
              className="btn-primary"
              onClick={tab === 'create' ? handleCreate : handleJoin}
              disabled={loading || !connected}
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

import React from 'react';

const VALUE_DISPLAY = {
  skip: '🚫',
  reverse: '🔄',
  draw2: '+2',
  wild: '★',
  wild4: '+4',
};

export default function Card({ card, onClick, isValid, showFaceDown = false, size = 'normal' }) {
  if (showFaceDown) {
    return <div className="card face-down" style={size === 'small' ? { '--card-w': '48px', '--card-h': '72px' } : {}} />;
  }

  if (!card) return null;

  const display = VALUE_DISPLAY[card.value] ?? card.value;
  const isClickable = isValid !== undefined;
  const validClass = isClickable ? (isValid ? 'valid' : 'invalid') : '';

  const sizeStyle = size === 'small'
    ? { width: 48, height: 72, fontSize: '0.5rem' }
    : size === 'large'
    ? { width: 96, height: 144 }
    : {};

  return (
    <div
      className={`card ${validClass}`}
      data-color={card.color}
      onClick={isClickable ? onClick : undefined}
      style={sizeStyle}
      title={`${card.color} ${card.value}`}
    >
      <span className="corner tl">{display}</span>
      <span className="card-value">{display}</span>
      <span className="corner br">{display}</span>
    </div>
  );
}

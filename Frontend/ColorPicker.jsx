import React from 'react';

export default function ColorPicker({ onSelect }) {
  return (
    <div className="color-picker-overlay">
      <div className="color-picker">
        <h3>Choose a Color</h3>
        <div className="colors">
          {['red', 'blue', 'green', 'yellow'].map(color => (
            <button
              key={color}
              className={`color-btn ${color}`}
              onClick={() => onSelect(color)}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

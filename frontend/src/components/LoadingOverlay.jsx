import React from 'react';
import Spinner from './Spinner';

export default function LoadingOverlay({ loading, message, subMessage, fullscreen = false }) {
  if (!loading) return null;

  return (
    <div className={`loading-overlay ${fullscreen ? 'fullscreen' : ''}`}>
      <Spinner />
      {message && <h3 className="loading-overlay-msg">{message}</h3>}
      {subMessage && <p className="loading-overlay-sub">{subMessage}</p>}
    </div>
  );
}

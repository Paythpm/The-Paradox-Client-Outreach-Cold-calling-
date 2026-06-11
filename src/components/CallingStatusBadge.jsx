import React, { useState, useEffect } from 'react';
import { getCallingScore } from '../utils/callingHours';
import LiveClock from './LiveClock';

// ── Module-level shared ticker ────────────────────────────────────────────────
// Single 60-second interval shared across ALL badge instances.
// Avoids creating 200 separate timers when 200 rows are visible.
let _tickListeners = new Set();
let _tickInterval = null;

function subscribeTick(fn) {
  _tickListeners.add(fn);
  if (!_tickInterval) {
    _tickInterval = setInterval(() => _tickListeners.forEach(f => f()), 60000);
  }
}
function unsubscribeTick(fn) {
  _tickListeners.delete(fn);
  if (_tickListeners.size === 0 && _tickInterval) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
}

/**
 * CallingStatusBadge — Uses a single shared 60-second interval across all instances.
 * Safe to render in lists with hundreds of rows.
 */
export default function CallingStatusBadge({ city, countryCode, size = 'sm', showTime = false, showNext = false }) {
  const [data, setData] = useState(() =>
    countryCode ? getCallingScore(city || '', countryCode) : null
  );

  useEffect(() => {
    if (!countryCode) return;
    setData(getCallingScore(city || '', countryCode));
    const onTick = () => setData(getCallingScore(city || '', countryCode));
    subscribeTick(onTick);
    return () => unsubscribeTick(onTick);
  }, [city, countryCode]);

  if (!data) return null;

  const isPrime   = data.status === 'prime';
  const isBlocked = !data.isLegal || data.status === 'blocked';
  const labelText = data.label.replace(/[🟢🟡🟠🔵🔴⛔]/g, '').trim();

  if (size === 'sm') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: data.color, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: data.color, display: 'inline-block', flexShrink: 0, animation: isPrime ? 'callerPulse 2s ease-in-out infinite' : 'none' }} />
        {isBlocked ? '⛔ Illegal hrs' : labelText}
        <style>{`@keyframes callerPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
      </span>
    );
  }

  if (size === 'md') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: data.color, fontWeight: 500 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: data.color, display: 'inline-block', animation: isPrime ? 'callerPulse 2s ease-in-out infinite' : 'none' }} />
          {data.label}
        </span>
        {showTime && <LiveClock city={city} countryCode={countryCode} format="full" style={{ fontSize: 11, color: 'var(--text3)' }} />}
        <style>{`@keyframes callerPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 24, background: data.color + '18', border: `1px solid ${data.color}44`, alignSelf: 'flex-start' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: data.color, flexShrink: 0, animation: isPrime ? 'callerPulse 2s ease-in-out infinite' : 'none' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: data.color }}>{data.label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <LiveClock city={city} countryCode={countryCode} format="full" style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'DM Mono, monospace' }} />
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Legal window: {data.legalWindow}</span>
      </div>
      {showNext && !isPrime && data.nextPrimeWindow && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          <span style={{ color: 'var(--text3)' }}>Next prime: </span>
          <span style={{ color: '#22c55e', fontWeight: 500 }}>{data.nextPrimeWindow.label}</span>
          <span style={{ color: 'var(--text3)' }}> ({data.nextPrimeWindow.hoursFromNow}h)</span>
        </div>
      )}
      <style>{`@keyframes callerPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  );
}

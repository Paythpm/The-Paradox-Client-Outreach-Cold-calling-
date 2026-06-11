import React from 'react';
import { useWorldClock } from '../hooks/useWorldClock';

const FLAGS = { AU: '🇦🇺', CA: '🇨🇦', UK: '🇬🇧', US: '🇺🇸' };
const COUNTRIES = ['AU', 'CA', 'UK', 'US'];

/**
 * WorldClockBar — Persistent top-bar world clock widget.
 * Shows live times for AU, CA, UK plus caller's local time.
 * onCountryClick: optional callback(countryCode) to filter business list.
 */
export default function WorldClockBar({ onCountryClick }) {
  const clock = useWorldClock();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '4px 6px',
    }}>
      {/* Local time */}
      <div style={{ padding: '4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
        <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>You</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>
          {clock.local?.time || '--:--'}
        </span>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 2px' }} />

      {/* Country blocks */}
      {COUNTRIES.map(cc => {
        const c = clock[cc];
        if (!c) return null;
        const dot = c.status?.color || '#5a5a75';
        const isPrime = c.status?.status === 'prime';
        const isBlocked = !c.status?.isLegal;

        return (
          <button
            key={cc}
            onClick={() => onCountryClick && onCountryClick(cc)}
            title={`${cc}: ${c.fullDisplay} · ${c.status?.label || ''} (${c.status?.legalWindow || ''})`}
            style={{
              padding: '4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, background: 'transparent', border: 'none', cursor: onCountryClick ? 'pointer' : 'default',
              borderRadius: 7, minWidth: 72,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {/* Flag + country */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 11 }}>{FLAGS[cc]}</span>
              <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cc}</span>
            </div>
            {/* Day + time */}
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {c.day} {c.time}
            </span>
            {/* Status dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: isBlocked ? '#ef4444' : dot,
                display: 'inline-block', flexShrink: 0,
                animation: isPrime ? 'wcPulse 2s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize: 9, color: isBlocked ? '#ef4444' : dot, whiteSpace: 'nowrap' }}>
                {isBlocked ? 'Closed' : c.status?.label?.replace(/[🟢🟡🟠🔵🔴⛔]/g, '').trim() || c.abbr}
              </span>
            </div>
          </button>
        );
      })}

      <style>{`@keyframes wcPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  );
}

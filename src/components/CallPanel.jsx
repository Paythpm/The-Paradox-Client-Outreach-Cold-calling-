import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { initializeDevice, makeCall, endCall, muteCall, saveCallOutcome } from '../services/twilioCallService';
import { getCallingScore } from '../utils/callingHours';

const OUTCOMES = [
  { key: 'answered_interested', label: '✓ Interested', color: 'var(--green)', bg: 'var(--green-bg)' },
  { key: 'meeting_booked', label: '📅 Book Meeting', color: 'var(--blue)', bg: 'var(--blue-bg)' },
  { key: 'answered_callback', label: '↩ Call Back', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  { key: 'answered_not_interested', label: '✗ Not Interested', color: 'var(--red)', bg: 'var(--red-bg)' },
  { key: 'no_answer', label: '🔵 No Answer', color: 'var(--text3)', bg: 'var(--surface2)' },
  { key: 'voicemail_left', label: '📨 Voicemail', color: 'var(--text3)', bg: 'var(--surface2)' },
  { key: 'wrong_number', label: '? Wrong #', color: 'var(--text3)', bg: 'var(--surface2)' },
];

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CallPanel({ business, onCallEnded, onClose, onScheduleMeeting }) {
  const { caller } = useAuth();
  const [callPhase, setCallPhase] = useState('idle'); // idle | connecting | ringing | connected | ended
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [isDeviceInitializing, setIsDeviceInitializing] = useState(false);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [callLogId, setCallLogId] = useState(null);

  const timerRef = useRef(null);

  // Start timer when connected
  useEffect(() => {
    if (callPhase === 'connected') {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callPhase]);

  const handleCallNow = async () => {
    if (!caller?.id) { setError('Not authenticated'); return; }
    setError(null);
    setIsDeviceInitializing(true);
    setCallPhase('connecting');

    try {
      await initializeDevice(caller.id);
      setIsDeviceInitializing(false);

      await makeCall(business, caller.id, (status, data) => {
        if (status === 'ringing') setCallPhase('ringing');
        if (status === 'connected') setCallPhase('connected');
        if (status === 'ended') {
          setCallPhase('ended');
          setCallLogId(data.callLogId);
        }
        if (status === 'rejected') {
          setCallPhase('ended');
          setOutcome('no_answer');
        }
        if (status === 'error') {
          setError(data.message);
          setCallPhase('idle');
        }
      });
    } catch (err) {
      setError(err.message);
      setCallPhase('idle');
      setIsDeviceInitializing(false);
    }
  };

  const handleEndCall = () => {
    endCall();
    setCallPhase('ended');
  };

  const handleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    muteCall(newMuted);
  };

  const handleSave = async () => {
    if (!outcome) return;
    setIsSaving(true);
    try {
      await saveCallOutcome(callLogId, outcome, notes, caller?.id);
      onCallEnded(outcome, notes, callLogId);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const countryFlag = { AU: '🇦🇺', CA: '🇨🇦', UK: '🇬🇧', US: '🇺🇸' }[business?.country_code] || '🌐';

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: 'var(--surface)', borderTop: `2px solid ${callPhase === 'connected' ? 'var(--green)' : 'var(--border)'}`, boxShadow: '0 -8px 32px rgba(0,0,0,0.4)', padding: '20px 24px', maxHeight: '85vh', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {callPhase === 'connected' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />}
          <span style={{ fontSize: 14, fontWeight: 600, color: callPhase === 'connected' ? 'var(--green)' : 'var(--text)' }}>
            {callPhase === 'idle' && 'Ready to Call'}
            {callPhase === 'connecting' && 'Connecting...'}
            {callPhase === 'ringing' && 'Ringing...'}
            {callPhase === 'connected' && `Live Call — ${formatDuration(callDuration)}`}
            {callPhase === 'ended' && `Call Ended — ${formatDuration(callDuration)}s`}
          </span>
        </div>
        {callPhase === 'idle' && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>×</button>
        )}
      </div>

      {/* Business info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8 }}>
        <span style={{ fontSize: 20 }}>{countryFlag}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14, marginBottom: 2 }}>{business?.business_name}</p>
          <p style={{ color: 'var(--text3)', fontSize: 12 }}>{business?.phone} · {business?.city}</p>
        </div>
        {business?.top_pain_point && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-glow)', color: 'var(--accent2)' }}>{business.top_pain_point}</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,92,108,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>
          <button onClick={() => { setError(null); setCallPhase('idle'); }} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>Try Again</button>
        </div>
      )}

      {/* IDLE phase */}
      {callPhase === 'idle' && (() => {
        const callingData = getCallingScore(business?.city || '', business?.country_code || '');
        const isIllegal = !callingData.isLegal;
        const isOffPeak = callingData.status === 'poor' || callingData.status === 'fair';

        return (
          <div>
            {isIllegal && (
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 12,
              }}>
                <p style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  ⛔ Outside legal calling hours — {callingData.localTime?.timeString} in {business?.city || business?.country_code}
                </p>
                <p style={{ color: 'var(--text3)', fontSize: 11 }}>
                  Legal window: {callingData.legalWindow}
                  {callingData.nextPrimeWindow && ` · Next prime: ${callingData.nextPrimeWindow.label}`}
                </p>
              </div>
            )}
            {!isIllegal && isOffPeak && (
              <div style={{
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 12,
              }}>
                <p style={{ color: 'var(--amber)', fontSize: 11 }}>
                  ⚠️ Off-peak in {business?.city || business?.country_code} ({callingData.localTime?.timeString}).
                  {callingData.nextPrimeWindow && ` Better at: ${callingData.nextPrimeWindow.label}`}
                </p>
              </div>
            )}
            <button
              onClick={handleCallNow}
              disabled={!business?.phone || isDeviceInitializing || isIllegal}
              style={{
                width: '100%', padding: '14px',
                background: isIllegal ? 'var(--surface2)' : 'var(--green)',
                color: isIllegal ? 'var(--text3)' : 'white',
                border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700,
                cursor: isIllegal ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {isIllegal ? '⛔ Cannot Call Now' : '📞 Call Now'}
            </button>
          </div>
        );
      })()}

      {/* CONNECTING / RINGING phase */}
      {(callPhase === 'connecting' || callPhase === 'ringing') && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(46,204,125,0.15)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'ringPulse 1.5s ease-in-out infinite' }}>
            <span style={{ fontSize: 24 }}>📞</span>
          </div>
          <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>{callPhase === 'connecting' ? 'Connecting...' : 'Ringing...'}</p>
          <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 16 }}>{business?.business_name}</p>
          <button onClick={() => { endCall(); setCallPhase('idle'); }} style={{ padding: '8px 20px', background: 'var(--red-bg)', border: '1px solid rgba(255,92,108,0.3)', color: 'var(--red)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <style>{`@keyframes ringPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.1);opacity:0.8}}`}</style>
        </div>
      )}

      {/* CONNECTED phase */}
      {callPhase === 'connected' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button
              onClick={handleMute}
              style={{ flex: 1, padding: '10px', background: isMuted ? 'var(--red-bg)' : 'var(--surface2)', border: `1px solid ${isMuted ? 'rgba(255,92,108,0.3)' : 'var(--border)'}`, color: isMuted ? 'var(--red)' : 'var(--text2)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
            >
              {isMuted ? '🔇 Muted' : '🎙️ Mute'}
            </button>
            <button
              onClick={handleEndCall}
              style={{ flex: 2, padding: '10px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
            >
              📵 End Call
            </button>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add call notes while you talk..."
            style={{ width: '100%', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 80, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>
      )}

      {/* ENDED phase */}
      {callPhase === 'ended' && (
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>Select an outcome to save this call:</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {OUTCOMES.map(o => (
              <button
                key={o.key}
                onClick={() => setOutcome(o.key)}
                style={{
                  padding: '8px 10px', borderRadius: 8, border: `1px solid ${outcome === o.key ? o.color : 'var(--border)'}`,
                  background: outcome === o.key ? o.bg : 'var(--surface2)', color: outcome === o.key ? o.color : 'var(--text3)',
                  cursor: 'pointer', fontSize: 12, fontWeight: outcome === o.key ? 600 : 400,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes (optional)..."
            style={{ width: '100%', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 70, boxSizing: 'border-box', outline: 'none', marginBottom: 12 }}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={!outcome || isSaving}
              style={{ flex: 2, padding: '12px', background: outcome ? 'var(--accent)' : 'var(--surface2)', color: outcome ? 'white' : 'var(--text3)', border: 'none', borderRadius: 8, cursor: outcome ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600 }}
            >
              {isSaving ? 'Saving...' : 'Save & Continue'}
            </button>
            {(outcome === 'answered_interested' || outcome === 'meeting_booked') && (
              <button
                onClick={() => onScheduleMeeting && onScheduleMeeting(business, callLogId)}
                style={{ flex: 1, padding: '12px', background: 'var(--blue-bg)', border: '1px solid rgba(59,158,255,0.3)', color: 'var(--blue)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
              >
                📅 Schedule →
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}

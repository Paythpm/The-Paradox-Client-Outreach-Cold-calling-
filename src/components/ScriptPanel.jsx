import React, { useState, useEffect, useCallback } from 'react';
import { getScript, rateScript } from '../services/scriptService';
import { getCallingScore } from '../utils/callingHours';

const TABS = [
  { id: 'script', label: 'Opening & Points' },
  { id: 'objections', label: 'Objections' },
  { id: 'facts', label: 'QA Facts' },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, color: copied ? 'var(--green)' : 'var(--text3)', fontSize: 11, flexShrink: 0 }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function SkeletonLoader() {
  return (
    <div style={{ padding: '16px 0' }}>
      {[80, 100, 60, 90, 70].map((w, i) => (
        <div key={i} style={{ height: 14, background: 'var(--surface2)', borderRadius: 4, marginBottom: 12, width: w + '%', animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
    </div>
  );
}

export default function ScriptPanel({ business, onCallInitiated }) {
  const [script, setScript] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('script');
  const [rating, setRating] = useState(null);
  const [hasRated, setHasRated] = useState(false);

  const loadScript = useCallback(async (force = false) => {
    if (!business?.id) return;
    try {
      if (force) setIsRegenerating(true);
      else setIsLoading(true);
      setError(null);

      const { script: s } = await getScript(business.id, force);
      setScript(s);
    } catch (err) {
      setError(err.message || 'Failed to load script');
    } finally {
      setIsLoading(false);
      setIsRegenerating(false);
    }
  }, [business?.id]);

  // Reset and reload when business changes
  useEffect(() => {
    setScript(null);
    setError(null);
    setRating(null);
    setHasRated(false);
    setActiveTab('script');
    loadScript(false);
  }, [business?.id, loadScript]);

  const handleRate = async (stars) => {
    if (!script?.id || hasRated) return;
    setRating(stars);
    setHasRated(true);
    try {
      await rateScript(script.id, stars);
    } catch { /* silent */ }
  };

  const isCached = script && script.created_at && (Date.now() - new Date(script.created_at).getTime()) > 5000;

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>AI Call Script</span>
          {script && (
            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: isCached ? 'var(--surface2)' : 'var(--green-bg)', color: isCached ? 'var(--text3)' : 'var(--green)' }}>
              {isCached ? 'Cached' : 'Fresh'}
            </span>
          )}
        </div>
        <button
          onClick={() => loadScript(true)}
          disabled={isRegenerating || isLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}
        >
          {isRegenerating ? (
            <>
              <span style={{ width: 12, height: 12, border: '1.5px solid var(--border)', borderTop: '1.5px solid var(--accent)', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />
              Regenerating...
            </>
          ) : '↻ Regenerate'}
        </button>
      </div>

      {/* Loading state */}
      {isLoading && <SkeletonLoader />}

      {/* Error state */}
      {!isLoading && error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,92,108,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</p>
          <button onClick={() => loadScript(false)} style={{ padding: '6px 12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      )}

      {/* Script content */}
      {!isLoading && script && (
        <>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '7px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12,
                color: activeTab === tab.id ? 'var(--accent2)' : 'var(--text3)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                fontWeight: activeTab === tab.id ? 500 : 400,
              }}>{tab.label}</button>
            ))}
          </div>

          {/* Tab: Opening & Points */}
          {activeTab === 'script' && (
            <div>
              {/* Opening line */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Opening Line</p>
                <div style={{ background: 'var(--surface)', borderLeft: '3px solid var(--blue)', borderRadius: '0 8px 8px 0', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <p style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.6, flex: 1 }}>"{script.opening_line}"</p>
                  <CopyButton text={script.opening_line} />
                </div>
              </div>

              {/* Talking points */}
              <div>
                <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Talking Points</p>
                {(script.talking_points || []).map((point, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                    <span style={{ width: 22, height: 22, background: 'var(--accent-glow)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent2)', flexShrink: 0 }}>{i + 1}</span>
                    <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, flex: 1 }}>{point}</p>
                    <CopyButton text={point} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Objections */}
          {activeTab === 'objections' && (
            <div>
              {Object.entries(script.objection_handlers || {}).map(([objection, response]) => (
                <div key={objection} style={{ marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>"{objection}"</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, flex: 1 }}>{response}</p>
                    <CopyButton text={response} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab: QA Facts */}
          {activeTab === 'facts' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Confidence facts — know these before you call</p>
              {(script.qa_facts || []).map((fact, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <span style={{ color: 'var(--green)', fontSize: 14, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>{fact}</p>
                </div>
              ))}
            </div>
          )}

          {/* Suggested close — always visible */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Suggested Close</p>
            <div style={{ background: 'var(--accent-glow)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <p style={{ color: 'var(--accent2)', fontSize: 13, lineHeight: 1.6, flex: 1 }}>{script.suggested_close}</p>
              <CopyButton text={script.suggested_close} />
            </div>
          </div>

          {/* Rating */}
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Rate this script:</span>
            {hasRated ? (
              <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Thanks! This helps improve future scripts</span>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => handleRate(star)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: rating >= star ? 'var(--amber)' : 'var(--border2)', padding: '0 2px' }}>
                    ★
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Start Call button with calling hours guard */}
          <div style={{ marginTop: 20 }}>
            {(() => {
              const callingData = getCallingScore(business?.city || '', business?.country_code || '');
              const canCall = !!business?.phone;

              if (!callingData.isLegal) {
                return (
                  <>
                    <div style={{
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 8, padding: '10px 14px', marginBottom: 10,
                    }}>
                      <p style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                        ⛔ Cannot call — it is {callingData.localTime?.timeString} in {business?.city || business?.country_code}
                      </p>
                      <p style={{ color: 'var(--text3)', fontSize: 11 }}>
                        Legal hours: {callingData.legalWindow}
                        {callingData.nextPrimeWindow && ` · Next prime: ${callingData.nextPrimeWindow.label}`}
                      </p>
                    </div>
                    <button disabled style={{
                      width: '100%', padding: '13px', background: 'var(--surface2)',
                      color: 'var(--text3)', border: 'none', borderRadius: 8,
                      fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
                    }}>
                      Cannot Call Now
                    </button>
                  </>
                );
              }

              return (
                <>
                  {(callingData.status === 'poor' || callingData.status === 'fair') && (
                    <div style={{
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 8, padding: '8px 12px', marginBottom: 10,
                    }}>
                      <p style={{ color: 'var(--amber)', fontSize: 11 }}>
                        ⚠️ Off-peak time in {business?.city || business?.country_code} ({callingData.localTime?.timeString}).
                        {callingData.nextPrimeWindow && ` Better at: ${callingData.nextPrimeWindow.label}`}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => onCallInitiated && onCallInitiated(business)}
                    disabled={!canCall}
                    style={{
                      width: '100%', padding: '13px',
                      background: canCall ? (callingData.status === 'prime' || callingData.status === 'good' ? 'var(--green)' : 'var(--green)') : 'var(--surface2)',
                      color: canCall ? 'white' : 'var(--text3)',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                      cursor: canCall ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {callingData.status === 'prime' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', display: 'inline-block' }} />}
                    <span>📞</span>
                    {canCall ? `Call ${business.phone}` : 'No phone number available'}
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

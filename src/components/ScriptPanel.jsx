import React, { useState, useEffect, useCallback } from 'react';
import { getScript, rateScript } from '../services/scriptService';
import PreCallResearch from './PreCallResearch';
import { getCallingScore } from '../utils/callingHours';

const TABS = [
  { id: 'script',      label: 'Opening & Points' },
  { id: 'objections',  label: 'Objections' },
  { id: 'facts',       label: 'QA Facts' },
];

// Tier badge colors
const TIER_STYLES = {
  elite:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: '⭐ Elite' },
  grow:    { color: '#2ecc7d', bg: 'rgba(46,204,125,0.12)',  label: '📈 Strong' },
  improve: { color: '#6c63ff', bg: 'rgba(108,99,255,0.12)',  label: '🔧 Mid-tier' },
  rescue:  { color: '#ff5c6c', bg: 'rgba(255,92,108,0.12)',  label: '🆘 Struggling' },
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  return (
    <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4, color: copied ? 'var(--green)' : 'var(--text3)', fontSize: 11, flexShrink: 0 }}>
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
  const [script, setScript]             = useState(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [isRegenerating, setIsRegen]    = useState(false);
  const [isGenAlt, setIsGenAlt]         = useState(false);
  const [altScript, setAltScript]       = useState(null);
  const [error, setError]               = useState(null);
  const [activeTab, setActiveTab]       = useState('script');
  const [activeVariant, setVariant]     = useState('primary'); // 'primary' | 'alternative'
  const [rating, setRating]             = useState(null);
  const [hasRated, setHasRated]         = useState(false);
  const [tier, setTier]                 = useState(null);

  const loadScript = useCallback(async (force = false, variant = 'primary') => {
    if (!business?.id) return;
    try {
      if (variant === 'primary') { if (force) setIsRegen(true); else setIsLoading(true); }
      else setIsGenAlt(true);
      setError(null);

      const res = await getScript(business.id, force, variant);
      if (variant === 'primary') {
        setScript(res.script);
        setTier(res.tier || null);
      } else {
        setAltScript(res.script);
      }
    } catch (err) {
      setError(err.message || 'Failed to load script');
    } finally {
      setIsLoading(false);
      setIsRegen(false);
      setIsGenAlt(false);
    }
  }, [business?.id]);

  useEffect(() => {
    setScript(null); setAltScript(null);
    setError(null); setRating(null);
    setHasRated(false); setActiveTab('script');
    setVariant('primary'); setTier(null);
    loadScript(false, 'primary');
  }, [business?.id, loadScript]);

  const handleRate = async (stars) => {
    const s = activeVariant === 'primary' ? script : altScript;
    if (!s?.id || hasRated) return;
    setRating(stars); setHasRated(true);
    try { await rateScript(s.id, stars); } catch {}
  };

  const currentScript = activeVariant === 'primary' ? script : altScript;
  const isCached = currentScript?.created_at && (Date.now() - new Date(currentScript.created_at).getTime()) > 5000;
  const tierStyle = tier ? TIER_STYLES[tier] : null;

  // Calling hours guard
  const callingData = getCallingScore(business?.city || '', business?.country_code || '');
  const canCall = !!business?.phone;
  const callButtonLabel = business?.contact_name
    ? `Call ${business.contact_name} · ${business.phone}`
    : business?.phone ? `Call ${business.phone}` : 'No phone number';

  return (
    <div style={{ padding: '4px 0' }}>

      {/* Pre-call research panel */}
      <PreCallResearch business={business} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>AI Call Script</span>
          {tierStyle && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: tierStyle.bg, color: tierStyle.color, fontWeight: 600 }}>
              {tierStyle.label}
            </span>
          )}
          {currentScript && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: isCached ? 'var(--surface2)' : 'var(--green-bg)', color: isCached ? 'var(--text3)' : 'var(--green)' }}>
              {isCached ? 'Cached' : 'Fresh'}
            </span>
          )}
        </div>
        <button
          onClick={() => loadScript(true, activeVariant)}
          disabled={isRegenerating || isLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}
        >
          {isRegenerating ? '⟳ Regenerating...' : '↻ Regenerate'}
        </button>
      </div>

      {/* Variant selector */}
      {(script || isLoading) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {['primary', 'alternative'].map(v => (
            <button
              key={v}
              onClick={() => { setVariant(v); setHasRated(false); setRating(null); if (v === 'alternative' && !altScript && !isGenAlt) loadScript(false, 'alternative'); }}
              style={{
                padding: '5px 14px', borderRadius: 6, border: `1px solid ${activeVariant === v ? 'var(--accent)' : 'var(--border)'}`,
                background: activeVariant === v ? 'var(--accent-glow)' : 'transparent',
                color: activeVariant === v ? 'var(--accent2)' : 'var(--text3)',
                fontSize: 12, cursor: 'pointer', fontWeight: activeVariant === v ? 600 : 400,
              }}
            >
              {v === 'primary' ? 'Primary approach' : 'Alternative angle'}
            </button>
          ))}
          {currentScript?.variant_angle && (
            <span style={{ fontSize: 10, padding: '5px 8px', color: 'var(--text3)', alignSelf: 'center' }}>
              · {currentScript.variant_angle}
            </span>
          )}
        </div>
      )}

      {isLoading && <SkeletonLoader />}

      {/* Alt loading */}
      {activeVariant === 'alternative' && isGenAlt && (
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>Generating a different approach...</p>
          <style>{`.spinner{width:28px;height:28px;border:2px solid var(--border);border-top:2px solid var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Alt not yet generated */}
      {activeVariant === 'alternative' && !altScript && !isGenAlt && !isLoading && (
        <div style={{ padding: '16px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 12 }}>No alternative script yet for this business.</p>
          <button onClick={() => loadScript(true, 'alternative')} style={{ padding: '8px 18px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            Generate alternative angle →
          </button>
        </div>
      )}

      {!isLoading && error && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,92,108,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</p>
          <button onClick={() => loadScript(false, activeVariant)} style={{ padding: '6px 12px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Try Again</button>
        </div>
      )}

      {/* Script content */}
      {!isLoading && currentScript && !(activeVariant === 'alternative' && isGenAlt) && (
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

          {/* Opening & Points */}
          {activeTab === 'script' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Opening Line</p>
                <div style={{ background: 'var(--surface)', borderLeft: '3px solid var(--blue)', borderRadius: '0 8px 8px 0', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <p style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.6, flex: 1 }}>"{currentScript.opening_line}"</p>
                  <CopyButton text={currentScript.opening_line} />
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Talking Points</p>
                {(currentScript.talking_points || []).map((point, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                    <span style={{ width: 22, height: 22, background: 'var(--accent-glow)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent2)', flexShrink: 0 }}>{i + 1}</span>
                    <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, flex: 1 }}>{point}</p>
                    <CopyButton text={point} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Objections */}
          {activeTab === 'objections' && (
            <div>
              {Object.entries(currentScript.objection_handlers || {}).map(([objection, response]) => (
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

          {/* QA Facts */}
          {activeTab === 'facts' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Confidence facts — know these before you call</p>
              {(currentScript.qa_facts || []).map((fact, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <span style={{ color: 'var(--green)', fontSize: 14, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>{fact}</p>
                </div>
              ))}
            </div>
          )}

          {/* Suggested close */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Suggested Close</p>
            <div style={{ background: 'var(--accent-glow)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <p style={{ color: 'var(--accent2)', fontSize: 13, lineHeight: 1.6, flex: 1 }}>{currentScript.suggested_close}</p>
              <CopyButton text={currentScript.suggested_close} />
            </div>
          </div>

          {/* Script performance */}
          {currentScript.times_used >= 3 ? (
            <div style={{ marginTop: 12, fontSize: 12, color: currentScript.conversion_rate > 30 ? 'var(--green)' : currentScript.conversion_rate > 10 ? 'var(--amber)' : 'var(--red)' }}>
              Used on {currentScript.times_used} calls · {currentScript.conversion_rate ?? 0}% converted to meeting
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)' }}>
              Not enough call data yet — be the first to use this script
            </div>
          )}

          {/* Rating */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Rate this script:</span>
            {hasRated ? (
              <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Thanks! This helps improve future scripts</span>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button key={star} onClick={() => handleRate(star)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: rating >= star ? 'var(--amber)' : 'var(--border2)', padding: '0 2px' }}>★</button>
                ))}
              </div>
            )}
          </div>

          {/* Call button */}
          <div style={{ marginTop: 20 }}>
            {!callingData.isLegal ? (
              <>
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                  <p style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                    ⛔ Cannot call — it is {callingData.localTime?.timeString} in {business?.city || business?.country_code}
                  </p>
                  <p style={{ color: 'var(--text3)', fontSize: 11 }}>Legal hours: {callingData.legalWindow}{callingData.nextPrimeWindow && ` · Next prime: ${callingData.nextPrimeWindow.label}`}</p>
                </div>
                <button disabled style={{ width: '100%', padding: '13px', background: 'var(--surface2)', color: 'var(--text3)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'not-allowed' }}>Cannot Call Now</button>
              </>
            ) : (
              <>
                {(callingData.status === 'poor' || callingData.status === 'fair') && (
                  <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                    <p style={{ color: 'var(--amber)', fontSize: 11 }}>⚠️ Off-peak in {business?.city || business?.country_code} ({callingData.localTime?.timeString}){callingData.nextPrimeWindow && `. Better at: ${callingData.nextPrimeWindow.label}`}</p>
                  </div>
                )}
                <button
                  onClick={() => onCallInitiated && onCallInitiated(business)}
                  disabled={!canCall}
                  style={{
                    width: '100%', padding: '13px', background: canCall ? 'var(--green)' : 'var(--surface2)',
                    color: canCall ? 'white' : 'var(--text3)', border: 'none', borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: canCall ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  📞 {callButtonLabel}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

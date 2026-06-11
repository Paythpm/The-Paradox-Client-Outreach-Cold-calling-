import React, { useState } from 'react';
import { BIZ_TYPE_LABELS } from '../analyzeData';
import supabase from '../lib/supabase';

const STAR_COLORS = { 5: '#2ecc7d', 4: '#84cc16', 3: '#f59e0b', 2: '#f97316', 1: '#ff5c6c' };

export default function ClinicDetail({ biz, globalData, extraTab, extraTabs }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedCat, setExpandedCat] = useState(null);
  const [contactName, setContactName] = useState(biz.contact_name || '');
  const [editingContact, setEditingContact] = useState(false);
  const [savedContact, setSavedContact] = useState(false);

  const saveContactName = async (val) => {
    if (!biz.id) return;
    const { error } = await supabase.from('businesses').update({ contact_name: val || null }).eq('id', biz.id);
    if (!error) { setSavedContact(true); setTimeout(() => setSavedContact(false), 2000); }
    setEditingContact(false);
  };

  // Support both single extraTab and multiple extraTabs
  const additionalTabs = extraTabs || (extraTab ? [extraTab] : []);

  // Use per-business detected pain categories and trust advice
  const PAIN_CATEGORIES = biz.painCategories || {};
  const TRUST_ADVICE = biz.trustAdvice || {};

  const totalNeg = biz.negCount || 1;

  const painChartData = Object.entries(PAIN_CATEGORIES).map(([key, cat]) => {
    const count = biz.painCats[key] || 0;
    const pct = totalNeg > 0 ? Math.round((count / totalNeg) * 100) : 0;
    const globalPct = Math.round(globalData.globalPainPcts[key] || 0);
    return { key, label: cat.label, count, pct, globalPct, color: cat.color, bg: cat.bg };
  }).filter(d => d.count > 0).sort((a, b) => b.count - a.count);

  const starData = [5, 4, 3, 2, 1].map(s => ({
    star: s + '★',
    count: biz.dist[s] || 0,
    pct: Math.round(((biz.dist[s] || 0) / biz.total) * 100),
    color: STAR_COLORS[s],
  }));

  const healthScore = Math.round(((biz.avg / 5) * 0.5 + ((100 - biz.negPct) / 100) * 0.5) * 100);
  const industryScore = Math.round(((globalData.globalAvgRating / 5) * 0.5 + ((100 - globalData.globalAvgNegPct) / 100) * 0.5) * 100);
  const scoreColor = healthScore >= 80 ? '#2ecc7d' : healthScore >= 60 ? '#f59e0b' : '#ff5c6c';

  const bizTypeLabel = BIZ_TYPE_LABELS[biz.bizType] || 'General Business';
  const baseTabs = ['overview', 'pain points', 'quotes', 'vs industry', 'trust plan'];
  const tabs = [...baseTabs, ...additionalTabs.map(t => t.key)];
  const tabLabels = {
    'overview': 'Overview', 'pain points': 'Pain Points', 'quotes': 'Quotes',
    'vs industry': 'Vs Industry', 'trust plan': 'Trust Plan',
    ...Object.fromEntries(additionalTabs.map(t => [t.key, t.label])),
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 6 }}>{biz.name}</h2>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent2)', display: 'inline-block', marginBottom: 4 }}>
              {bizTypeLabel}
            </span>
            {biz.url && (
              <a href={biz.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text3)', fontSize: 12, textDecoration: 'none', display: 'block', marginTop: 2 }}>
                View on Google Maps ↗
              </a>
            )}

            {/* Contact name — inline editable */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {editingContact ? (
                <input
                  autoFocus
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  onBlur={() => saveContactName(contactName)}
                  onKeyDown={e => { if (e.key === 'Enter') saveContactName(contactName); if (e.key === 'Escape') { setContactName(biz.contact_name || ''); setEditingContact(false); } }}
                  placeholder="Contact name (e.g. Sarah — used in call script)"
                  style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none', width: 260 }}
                />
              ) : (
                <button
                  onClick={() => setEditingContact(true)}
                  style={{ background: 'none', border: '1px dashed var(--border2)', borderRadius: 6, padding: '3px 10px', color: contactName ? 'var(--text2)' : 'var(--text3)', fontSize: 12, cursor: 'pointer' }}
                >
                  👤 {contactName || 'Add contact name (personalises script)'}
                </button>
              )}
              {savedContact && <span style={{ fontSize: 11, color: 'var(--green)' }}>Saved ✓</span>}
              {contactName && !editingContact && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--green-bg)', color: 'var(--green)' }}>Personalised script</span>
              )}
            </div>
          </div>
          <ScoreRing score={healthScore} color={scoreColor} label="Health Score" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginTop: 16 }}>
          <KpiCard label="Avg Rating" value={biz.avg + '★'} sub={`industry: ${globalData.globalAvgRating}★`} color={biz.avg >= globalData.globalAvgRating ? 'var(--green)' : 'var(--red)'} />
          <KpiCard label="Total Reviews" value={biz.total.toLocaleString()} />
          <KpiCard label="Positive" value={biz.posPct + '%'} color="var(--green)" sub="4-5 stars" />
          <KpiCard label="Negative" value={biz.negPct + '%'} color={biz.negPct > globalData.globalAvgNegPct ? 'var(--red)' : 'var(--green)'} sub={`industry: ${globalData.globalAvgNegPct}%`} />
          <KpiCard label="Neg Reviews" value={biz.negCount} sub="with text analyzed" />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13,
            color: activeTab === tab ? 'var(--accent2)' : 'var(--text3)',
            borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: activeTab === tab ? 500 : 400,
            textTransform: 'capitalize', transition: 'color 0.15s',
          }}>{tabLabels[tab] || tab}</button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rating distribution</p>
              {starData.map(d => (
                <div key={d.star} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{d.star}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{d.count.toLocaleString()} ({d.pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3 }}>
                    <div style={{ height: 6, width: d.pct + '%', background: d.color, borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top 5 pain points</p>
              {biz.topPains.slice(0, 5).map(({ key, count, pct }) => {
                const cat = PAIN_CATEGORIES[key];
                if (!cat) return null;
                return (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: cat.color }}>{cat.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{count} ({Math.round(pct)}%)</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3 }}>
                      <div style={{ height: 5, width: pct + '%', background: cat.color, borderRadius: 3, opacity: 0.8 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sentiment summary</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <SentimentBar label="Positive (4-5★)" pct={biz.posPct} color="var(--green)" />
              <SentimentBar label="Neutral (3★)" pct={biz.neuPct} color="var(--amber)" />
              <SentimentBar label="Negative (1-2★)" pct={biz.negPct} color="var(--red)" />
            </div>
          </div>
        </div>
      )}

      {/* Pain Points */}
      {activeTab === 'pain points' && (
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
            Analyzed <strong style={{ color: 'var(--text)' }}>{biz.negCount}</strong> negative reviews. Click a category to see sub-themes.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {painChartData.map(d => {
              const cat = PAIN_CATEGORIES[d.key];
              const subs = biz.painSubs[d.key] || {};
              const isExpanded = expandedCat === d.key;
              return (
                <div key={d.key} onClick={() => setExpandedCat(isExpanded ? null : d.key)}
                  style={{ background: 'var(--surface)', border: `1px solid ${isExpanded ? d.color + '44' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '16px 18px', cursor: 'pointer', transition: 'border 0.2s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: d.color }}>{cat.label}</span>
                    <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>{d.pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, marginBottom: 10 }}>
                    <div style={{ height: 6, width: d.pct + '%', background: d.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{d.count} mentions</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>industry avg: {d.globalPct}%</span>
                  </div>
                  {isExpanded && Object.keys(subs).length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sub-themes</p>
                      {Object.entries(subs).sort((a, b) => b[1] - a[1]).map(([sub, cnt]) => (
                        <div key={sub} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{sub}</span>
                          <span style={{ fontSize: 12, color: d.color, fontWeight: 500 }}>{cnt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && Object.keys(subs).length === 0 && (
                    <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)' }}>No sub-theme breakdown available</p>
                  )}
                </div>
              );
            })}
          </div>
          {painChartData.length === 0 && (
            <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 40 }}>No negative review text to analyze for this business.</div>
          )}
        </div>
      )}

      {/* Quotes */}
      {activeTab === 'quotes' && (
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>Real customer language, categorized by pain point. Use this to build empathy during calls.</p>
          {painChartData.slice(0, 6).map(d => {
            const quotes = biz.painQuotes[d.key] || [];
            if (quotes.length === 0) return null;
            const cat = PAIN_CATEGORIES[d.key];
            return (
              <div key={d.key} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: d.color }}>{cat.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{d.count} mentions</span>
                </div>
                {quotes.map((q, i) => (
                  <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${d.color}`, borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', padding: '10px 14px', marginBottom: 8 }}>
                    <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>"{q.text}{q.text.length >= 220 ? '…' : ''}"</p>
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block' }}>{q.rating}★</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Vs Industry */}
      {activeTab === 'vs industry' && (
        <div>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
            Comparing <strong style={{ color: 'var(--text)' }}>{biz.name}</strong> against the industry average across {globalData.totalBusinesses} businesses.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            <CompareCard label="Avg Rating" clinic={biz.avg + '★'} industry={globalData.globalAvgRating + '★'} better={biz.avg >= globalData.globalAvgRating} />
            <CompareCard label="Negative Rate" clinic={biz.negPct + '%'} industry={globalData.globalAvgNegPct + '%'} better={biz.negPct <= globalData.globalAvgNegPct} lowerIsBetter />
            <CompareCard label="Health Score" clinic={healthScore} industry={industryScore} better={healthScore >= industryScore} />
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pain point rate vs industry</p>
            {painChartData.map(d => {
              const diff = d.pct - d.globalPct;
              const worse = diff > 5;
              const better = diff < -5;
              const cat = PAIN_CATEGORIES[d.key];
              return (
                <div key={d.key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{cat.label}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: worse ? 'var(--red)' : better ? 'var(--green)' : 'var(--text3)' }}>
                        {diff > 0 ? '+' : ''}{Math.round(diff)}% vs avg
                      </span>
                      <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 4, background: worse ? 'var(--red-bg)' : better ? 'var(--green-bg)' : 'var(--surface2)', color: worse ? 'var(--red)' : better ? 'var(--green)' : 'var(--text3)' }}>
                        {worse ? '↑ worse' : better ? '↓ better' : '≈ avg'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3 }}>
                      <div style={{ height: 6, width: Math.min(d.pct, 100) + '%', background: d.color, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)', width: 36, textAlign: 'right' }}>{d.pct}%</span>
                    <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3 }}>
                      <div style={{ height: 6, width: Math.min(d.globalPct, 100) + '%', background: 'var(--border2)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)', width: 36 }}>{d.globalPct}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: d.color }}>■ this business</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>■ industry</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trust Plan */}
      {activeTab === 'trust plan' && (
        <div>
          <div style={{ background: 'var(--accent-glow)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 24 }}>
            <p style={{ color: 'var(--accent2)', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>🎯 Tailored trust plan for {biz.name}</p>
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>
              Detected as <strong style={{ color: 'var(--accent2)' }}>{bizTypeLabel}</strong> · Based on top {biz.topPains.length} pain points — use live on calls to show you've done the homework.
            </p>
          </div>

          {biz.topPains.slice(0, 5).map(({ key }, i) => {
            const cat = PAIN_CATEGORIES[key];
            const advice = TRUST_ADVICE[key];
            if (!advice || !cat) return null;
            return (
              <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, background: cat.bg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 13, color: cat.color }}>
                    #{i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: cat.color }}>{advice.headline}</p>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: cat.bg, color: cat.color }}>{cat.label}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {advice.actions.map((action, j) => (
                        <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: cat.color, fontSize: 14, flexShrink: 0, marginTop: 1 }}>→</span>
                          <span style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.5 }}>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {biz.topPains.length === 0 && (
            <p style={{ color: 'var(--text3)', textAlign: 'center', padding: 40 }}>Not enough negative review data to generate trust plan.</p>
          )}
        </div>
      )}

      {/* Extra tabs (e.g. Calling Hours, AI Script) */}
      {additionalTabs.map(tab => (
        activeTab === tab.key && (
          <div key={tab.key}>{tab.content}</div>
        )
      ))}
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 600, color: color || 'var(--text)', letterSpacing: '-0.02em' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

function SentimentBar({ label, pct, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4 }}>
        <div style={{ height: 8, width: pct + '%', background: color, borderRadius: 4, opacity: 0.85 }} />
      </div>
    </div>
  );
}

function CompareCard({ label, clinic, industry, better }) {
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${better ? 'rgba(46,204,125,0.2)' : 'rgba(255,92,108,0.2)'}`, borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
      <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>{label}</p>
      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>This business</p>
          <p style={{ fontSize: 22, fontWeight: 600, color: better ? 'var(--green)' : 'var(--red)' }}>{clinic}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Industry avg</p>
          <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text2)' }}>{industry}</p>
        </div>
      </div>
      <p style={{ fontSize: 12, marginTop: 10, color: better ? 'var(--green)' : 'var(--red)' }}>
        {better ? '✓ Above average' : '✗ Below average'}
      </p>
    </div>
  );
}

function ScoreRing({ score, color, label }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div style={{ textAlign: 'center', flexShrink: 0 }}>
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface2)" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round" transform="rotate(-90 40 40)" />
        <text x="40" y="44" textAnchor="middle" fill={color} fontSize="16" fontWeight="600" fontFamily="DM Sans">{score}</text>
      </svg>
      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: -4 }}>{label}</p>
    </div>
  );
}

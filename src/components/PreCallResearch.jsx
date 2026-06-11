import React, { useState, useEffect } from 'react';
import CallingStatusBadge from './CallingStatusBadge';

/**
 * PreCallResearch — 30-second pre-call prep panel
 * Shows quick links, contextual hints, and timing reminder
 * Collapsible, state persisted in localStorage
 */
export default function PreCallResearch({ business }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('dentiq_precall_expanded') === 'true'; }
    catch { return false; }
  });

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem('dentiq_precall_expanded', String(next)); } catch {}
  };

  if (!business) return null;

  const { business_name, city, country_code, google_maps_url, website, rating, reviews } = business;
  const nameEnc = encodeURIComponent(business_name);
  const cityEnc = encodeURIComponent((business_name || '') + ' ' + (city || ''));

  // Quick links
  const links = [
    {
      label: '📍 Google Maps listing',
      url: google_maps_url || `https://www.google.com/maps/search/${cityEnc}`,
    },
    {
      label: '💼 LinkedIn — find owner',
      url: `https://www.linkedin.com/search/results/all/?keywords=${nameEnc}`,
    },
    website ? { label: '🌐 Visit their website', url: website } : null,
    {
      label: '📰 Recent news',
      url: `https://news.google.com/search?q=${cityEnc}`,
    },
  ].filter(Boolean);

  // Know before you call hints
  const r = parseFloat(rating) || 0;
  const rv = parseInt(reviews) || 0;
  const cc = country_code || 'US';

  const ratingHint =
    r >= 4.5 ? '✓ Top-rated — lead with acknowledgement, not problem-solving'
    : r >= 3.5 ? '✓ Above-average — there\'s a specific gap to close, use it as your hook'
    : r >= 2.5 ? '✓ Below average — they know it. Be empathetic and solution-focused'
    : '✓ Struggling — open with empathy, one specific fix, clear urgency';

  const reviewHint =
    rv >= 100 ? `✓ High review volume (${rv}) — established business, expect confidence`
    : rv >= 20 ? `✓ Moderate reviews (${rv}) — receptive to growth conversation`
    : rv >= 5  ? `✓ Few reviews (${rv}) — may not be monitoring their online presence yet`
    : `✓ Almost no reviews (${rv}) — their Google presence is basically invisible. Major opportunity`;

  const countryTip = {
    AU: '✓ AU businesses: be direct and informal. Aussies dislike polished sales talk. Start conversationally.',
    CA: '✓ CA businesses: be polite but get to the point within 30 seconds. Canadians appreciate brevity.',
    UK: '✓ UK businesses: be professional but not stiff. Brits respond to self-deprecating humour. Don\'t oversell.',
    US: '✓ US businesses: confidence is expected. Lead with value, get to the ask quickly. Time is money.',
  }[cc] || '✓ Be professional, specific, and respectful of their time.';

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, marginBottom: 16, overflow: 'hidden',
    }}>
      {/* Header — always visible */}
      <button
        onClick={toggle}
        style={{
          width: '100%', padding: '10px 14px', background: 'transparent', border: 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', color: 'var(--text)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent2)' }}>
          📋 30-second pre-call research
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{expanded ? '▲ hide' : '▼ expand'}</span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>

          {/* Quick links */}
          <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 12, marginBottom: 8 }}>Quick lookups</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--accent2)', textDecoration: 'none',
                display: 'inline-block',
              }}>
                {l.label}
              </a>
            ))}
          </div>

          {/* Know before you call */}
          <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Know before you call</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
            {[ratingHint, reviewHint, countryTip].map((hint, i) => (
              <p key={i} style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{hint}</p>
            ))}
          </div>

          {/* Timing */}
          <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Timing</p>
          <CallingStatusBadge city={city} countryCode={country_code} size="md" showTime showNext />
        </div>
      )}
    </div>
  );
}

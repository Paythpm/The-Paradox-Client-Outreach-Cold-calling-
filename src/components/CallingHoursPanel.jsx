import React, { useState, useEffect, useRef } from 'react';
import {
  getCallingScore, getNextPrimeWindow, getWeekForecast,
  getBusinessTimezone, getTimezoneAbbreviation, getCurrentTimeInTimezone,
} from '../utils/callingHours';
import CallingStatusBadge from './CallingStatusBadge';
import LiveClock from './LiveClock';

const COMPLIANCE = {
  AU: {
    law: 'ACMA Do Not Call Register Act 2006',
    link: 'https://www.acma.gov.au/do-not-call-register',
    linkLabel: 'acma.gov.au',
    rules: [
      { ok: true,  text: 'Weekdays: 9:00 AM – 8:00 PM local time' },
      { ok: true,  text: 'Saturdays: 9:00 AM – 5:00 PM local time' },
      { ok: false, text: 'Sundays: NO calls permitted' },
      { ok: false, text: 'Public holidays: NO calls permitted' },
      { warn: true, text: 'Must check ACMA Do Not Call Register' },
      { warn: true, text: 'Identify yourself, company & purpose at call start' },
      { warn: true, text: '10-day cooling-off if prospect agrees to anything' },
      { fine: true, text: 'Penalty: up to AUD $250,000 per violation' },
    ],
  },
  CA: {
    law: 'CRTC National DNC + CASL',
    link: 'https://lnnte-dncl.gc.ca',
    linkLabel: 'lnnte-dncl.gc.ca',
    rules: [
      { ok: true,  text: 'Weekdays: 8:00 AM – 9:00 PM local time' },
      { ok: true,  text: 'Saturdays: 8:00 AM – 6:00 PM local time' },
      { warn: true, text: 'Sundays: 1:00 PM – 9:00 PM (best to avoid)' },
      { warn: true, text: 'Screen against CRTC National DNC list' },
      { warn: true, text: 'CASL: need implied or express consent' },
      { warn: true, text: 'Must provide opt-out mechanism on every call' },
      { fine: true, text: 'Penalty: up to CAD $1,500 per CRTC violation' },
    ],
  },
  UK: {
    law: 'PECR 2003 + ICO — B2B calls permitted',
    link: 'https://www.tpsonline.org.uk/ctps',
    linkLabel: 'tpsonline.org.uk/ctps',
    rules: [
      { ok: true,  text: 'Mon–Sat: 8:00 AM – 8:00 PM local time' },
      { warn: true, text: 'Sundays: 9:00 AM – 6:00 PM (strongly recommend avoiding)' },
      { warn: true, text: 'Screen against CTPS (Corporate Telephone Preference Service)' },
      { ok: true,  text: 'B2B calls: Legal without prior consent if not on CTPS' },
      { warn: true, text: 'Identify caller, company & purpose immediately' },
      { warn: true, text: "Record opt-outs, don't call again within 28 days" },
      { fine: true, text: 'PECR fines up to £500,000' },
    ],
  },
  US: {
    law: 'FTC Telemarketing Sales Rule (TSR) + State DNC Laws',
    link: 'https://www.donotcall.gov',
    linkLabel: 'donotcall.gov',
    rules: [
      { ok: true,  text: 'Any day: 8:00 AM – 9:00 PM local time of recipient (FTC)' },
      { warn: true, text: 'Must scrub National Do Not Call Registry before calling' },
      { warn: true, text: 'B2B calls: Less regulated, but state laws vary' },
      { warn: true, text: 'TCPA: Do not use auto-dialers without prior written consent' },
      { warn: true, text: 'Identify yourself, company & purpose at start of call' },
      { warn: true, text: 'Honor opt-outs within 30 days' },
      { fine: true, text: 'FTC fines up to $51,744 per violation' },
      { fine: true, text: 'TCPA: $500–$1,500 per call (class action risk)' },
    ],
  },
};

// ── Timeline bar hours ──────────────────────────────────────────────────────
const TIMELINE_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const TIMELINE_COLORS = {
  7:  { color: '#5a5a75', label: '' },
  8:  { color: '#eab308', label: '' },
  9:  { color: '#84cc16', label: '' },
  10: { color: '#22c55e', label: '🏆 PRIME' },
  11: { color: '#22c55e', label: '' },
  12: { color: '#ef4444', label: 'Avoid' },
  13: { color: '#ef4444', label: '' },
  14: { color: '#f97316', label: '' },
  15: { color: '#84cc16', label: '' },
  16: { color: '#22c55e', label: '🏆 PRIME' },
  17: { color: '#eab308', label: '' },
  18: { color: '#f97316', label: '' },
  19: { color: '#ef4444', label: '' },
  20: { color: '#5a5a75', label: '' },
};

export default function CallingHoursPanel({ business }) {
  const [callingData, setCallingData] = useState(null);
  const [nextPrime, setNextPrime]     = useState(null);
  const [forecast, setForecast]       = useState([]);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const timerRef = useRef(null);

  const city        = business?.city        || '';
  const countryCode = business?.country_code || '';

  const update = () => {
    setCallingData(getCallingScore(city, countryCode));
    setNextPrime(getNextPrimeWindow(city, countryCode));
    setForecast(getWeekForecast(city, countryCode));
  };

  useEffect(() => {
    update();
    timerRef.current = setInterval(update, 60000);
    return () => clearInterval(timerRef.current);
  }, [city, countryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!callingData) return null;

  const timezone = getBusinessTimezone(city, countryCode);
  const abbr     = getTimezoneAbbreviation(timezone);
  const localNow = getCurrentTimeInTimezone(timezone);
  const bestDay  = forecast.reduce((best, d) => (!best || d.peakScore > best.peakScore) ? d : best, null);
  const compliance = COMPLIANCE[countryCode];

  // Current time indicator position on timeline bar (7am–9pm = 14h span)
  const timelinePct = Math.min(Math.max(((localNow.hour - 7) + localNow.minute / 60) / 14, 0), 1) * 100;

  return (
    <div style={{ padding: '4px 0' }}>

      {/* ── SECTION 1: Current Status Card ────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: `1px solid ${callingData.color}33`,
        borderRadius: 'var(--radius-lg)', padding: '18px 20px', marginBottom: 16,
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center',
      }}>
        <CallingStatusBadge city={city} countryCode={countryCode} size="lg" showTime showNext />

        <div style={{ display: 'flex', gap: 16 }}>
          {/* Score */}
          <div style={{ textAlign: 'center', padding: '10px 16px', background: 'var(--surface2)', borderRadius: 10 }}>
            <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Calling Score</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: callingData.color, letterSpacing: '-0.02em' }}>{callingData.score}</p>
            <p style={{ fontSize: 10, color: 'var(--text3)' }}>/ 100</p>
          </div>
          {/* Next prime */}
          <div style={{ textAlign: 'center', padding: '10px 16px', background: 'var(--surface2)', borderRadius: 10, minWidth: 120 }}>
            <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Next Prime</p>
            {nextPrime ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>{nextPrime.label}</p>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>in {nextPrime.hoursFromNow}h</p>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>None in 7 days</p>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Location & Timezone Info ───────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16,
      }}>
        <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Location & Timezone</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 13 }}>
          {[
            ['Business Location', `${city}${city && countryCode ? ', ' : ''}${countryCode}`],
            ['Local Timezone', `${timezone} (${abbr})`],
            ['Current Local Time', null],
            ['Your Time', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
            ['Legal Calling Hours', callingData.legalWindow],
            ['Legal Basis', compliance?.law || '—'],
          ].map(([label, value]) => (
            <React.Fragment key={label}>
              <span style={{ color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap', paddingTop: 1 }}>{label}</span>
              {value === null
                ? <LiveClock city={city} countryCode={countryCode} format="full" style={{ fontSize: 13 }} />
                : <span style={{ color: 'var(--text)' }}>{value}</span>
              }
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── SECTION 3: 7-Day Forecast ─────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16,
      }}>
        <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Best Days to Call This Week
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {forecast.map((day, i) => {
            const isBest = bestDay && day.dayName === bestDay.dayName && day.date === bestDay.date;
            const barHeight = Math.max(4, Math.round((day.peakScore / 100) * 40));

            return (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '8px 4px', borderRadius: 8,
                background: day.isToday ? 'rgba(108,99,255,0.08)' : 'transparent',
                border: `1px solid ${day.isToday ? 'rgba(108,99,255,0.25)' : 'var(--border)'}`,
                position: 'relative',
              }}>
                {isBest && (
                  <span style={{
                    position: 'absolute', top: -10, fontSize: 8, color: '#22c55e',
                    fontWeight: 700, letterSpacing: '0.04em',
                  }}>✓ BEST</span>
                )}
                <span style={{ fontSize: 10, fontWeight: 600, color: day.isToday ? 'var(--accent2)' : 'var(--text3)' }}>
                  {day.dayName}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{day.date.split(' ')[0]}</span>

                {/* Bar or blocked icon */}
                <div style={{ height: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {day.status === 'blocked' || day.isHoliday ? (
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 14 }}>{day.isHoliday ? '🎉' : '⛔'}</span>
                      <p style={{ fontSize: 8, color: 'var(--text3)', marginTop: 2 }}>{day.isHoliday ? 'Holiday' : 'No calls'}</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: day.color }}>{day.peakScore}</span>
                      <div style={{
                        width: 18, height: barHeight, background: day.color,
                        borderRadius: '3px 3px 0 0', opacity: 0.85,
                        transition: 'height 0.3s',
                      }} />
                    </div>
                  )}
                </div>

                <span style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.3 }}>
                  {day.peakTime !== '-' ? `Best: ${day.peakTime}` : '-'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 4: Timeline Cheat Sheet ───────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 16,
      }}>
        <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          When to Call — Research Data
        </p>

        {/* Timeline bar */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          {/* Prime labels above */}
          <div style={{ display: 'flex', marginBottom: 4, position: 'relative', height: 14 }}>
            {TIMELINE_HOURS.map((h, i) => {
              const info = TIMELINE_COLORS[h];
              if (!info.label) return <div key={h} style={{ flex: 1 }} />;
              return (
                <div key={h} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <span style={{ fontSize: 8, color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap' }}>{info.label}</span>
                </div>
              );
            })}
          </div>

          {/* Colored segments */}
          <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            {TIMELINE_HOURS.map(h => (
              <div key={h} style={{ flex: 1, background: TIMELINE_COLORS[h].color, opacity: 0.75 }} />
            ))}
            {/* Current time indicator */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${timelinePct}%`,
              width: 2, background: 'white', borderRadius: 1,
              boxShadow: '0 0 4px rgba(255,255,255,0.8)',
              transform: 'translateX(-50%)',
            }} />
          </div>

          {/* Hour labels */}
          <div style={{ display: 'flex', marginTop: 4 }}>
            {TIMELINE_HOURS.filter((_, i) => i % 2 === 0).map(h => (
              <div key={h} style={{ flex: 1, textAlign: 'left' }}>
                <span style={{ fontSize: 9, color: 'var(--text3)' }}>
                  {h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
          White line = current {city ? city.split(',')[0] : countryCode} time.
          Based on analysis of 1.4M+ calls (ZoomInfo) and 52,000 attempts (CallHippo).
        </p>
      </div>

      {/* ── SECTION 5: Compliance Card (collapsible) ──────────────────────── */}
      {compliance && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        }}>
          <button
            onClick={() => setComplianceOpen(o => !o)}
            style={{
              width: '100%', padding: '14px 20px', background: 'transparent', border: 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', color: 'var(--text)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>⚖️ Legal Compliance — {countryCode}</span>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>{complianceOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {complianceOpen && (
            <div style={{ padding: '0 20px 16px', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, marginBottom: 10 }}>{compliance.law}</p>
              {compliance.rules.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>
                    {r.ok ? '✓' : r.warn ? '⚠' : r.fine ? '💰' : '✗'}
                  </span>
                  <span style={{
                    fontSize: 12, color: r.ok ? 'var(--green)' : r.warn ? 'var(--amber)' : r.fine ? 'var(--red)' : 'var(--text3)',
                    lineHeight: 1.5,
                  }}>{r.text}</span>
                </div>
              ))}
              <a href={compliance.link} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: 'var(--accent2)', textDecoration: 'none', marginTop: 8, display: 'block' }}>
                🔗 {compliance.linkLabel} ↗
              </a>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

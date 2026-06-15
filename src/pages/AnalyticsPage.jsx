import React, { useState, lazy, Suspense, useMemo } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../contexts/AuthContext';
import Papa from 'papaparse';

const LineChart = lazy(() => import('recharts').then(m => ({ default: m.LineChart })));
const Line = lazy(() => import('recharts').then(m => ({ default: m.Line })));
const XAxis = lazy(() => import('recharts').then(m => ({ default: m.XAxis })));
const YAxis = lazy(() => import('recharts').then(m => ({ default: m.YAxis })));
const Tooltip = lazy(() => import('recharts').then(m => ({ default: m.Tooltip })));
const Legend = lazy(() => import('recharts').then(m => ({ default: m.Legend })));
const ResponsiveContainer = lazy(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })));
const PieChart = lazy(() => import('recharts').then(m => ({ default: m.PieChart })));
const Pie = lazy(() => import('recharts').then(m => ({ default: m.Pie })));
const Cell = lazy(() => import('recharts').then(m => ({ default: m.Cell })));
const BarChart = lazy(() => import('recharts').then(m => ({ default: m.BarChart })));
const Bar = lazy(() => import('recharts').then(m => ({ default: m.Bar })));

const ADMIN_EMAILS = ['ramakantsharma2103@gmail.com'];

const OUTCOME_COLORS = {
  no_answer:               '#5a5a75',
  answered_not_interested: '#ff5c6c',
  answered_callback:       '#f59e0b',
  answered_interested:     '#2ecc7d',
  meeting_booked:          '#3b9eff',
  voicemail_left:          '#9999b0',
  wrong_number:            '#3a3a50',
  busy:                    '#6c63ff',
};

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
      <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text)', letterSpacing: '-0.03em' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user, caller, isLoading: authLoading } = useAuth();
  const [range, setRange] = useState('week');
  const [scriptPerf, setScriptPerf] = useState([]);
  const [filterCaller, setFilterCaller] = useState(null);
  const [allCallers, setAllCallers] = useState([]);

  // Determine role — admin sees everything, employees see only their own data
  const isAdmin = ADMIN_EMAILS.includes(user?.email);

  // FIX: Don't pass callerId until auth is fully settled (caller loaded).
  // Passing undefined then a UUID causes the hook to fire twice and crash.
  // We hold off until caller is resolved for non-admins.
  const authReady = isAdmin ? !!user : !!caller;
  const effectiveCallerId = !authReady
    ? '__PENDING__'  // sentinel — hook skips fetch when this value is seen
    : isAdmin
      ? (filterCaller || undefined)
      : caller.id;

  // Admin: load all callers for the filter dropdown
  React.useEffect(() => {
    if (!isAdmin) return;
    import('../lib/supabase').then(({ default: supabase }) => {
      supabase.from('callers').select('id,full_name').eq('is_active', true).order('full_name')
        .then(({ data }) => setAllCallers(data || []));
    });
  }, [isAdmin]);

  // Script performance — admin sees all, employee sees scripts they used
  React.useEffect(() => {
    import('../lib/supabase').then(({ default: supabase }) => {
      let q = supabase.from('ai_scripts')
        .select('id, opening_line, variant_angle, variant, times_used, times_converted, conversion_rate, avg_rating, businesses(business_name, category, rating, country_code)')
        .eq('is_active', true)
        .gte('times_used', 1)
        .order('times_used', { ascending: false })
        .limit(20);
      q.then(({ data }) => setScriptPerf(data || []));
    });
  }, []);

  // Stable ISO strings — prevents infinite re-fetch loop
  const { startISO, endISO } = useMemo(() => {
    const e = new Date();
    const s = new Date();
    if (range === 'today') s.setHours(0, 0, 0, 0);
    else if (range === 'week') s.setDate(s.getDate() - 7);
    else if (range === 'month') s.setDate(s.getDate() - 30);
    return { startISO: s.toISOString(), endISO: e.toISOString() };
  }, [range]);

  const { data, isLoading, error } = useAnalytics({ startISO, endISO, callerId: effectiveCallerId });

  const handleExportCSV = () => {
    if (!data?.allLogs) return;
    const rows = data.allLogs.map(l => ({
      business_name:    l.businesses?.business_name || '',
      category:         l.businesses?.category || '',
      country:          l.businesses?.country_code || '',
      city:             l.businesses?.city || '',
      caller:           l.callers?.full_name || '',
      outcome:          l.outcome || '',
      duration_seconds: l.duration_seconds || 0,
      notes:            l.notes || '',
      meeting_booked:   data.allMeetings.some(m => m.call_log_id === l.id) ? 'Yes' : 'No',
      started_at:       l.started_at || '',
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dentiq-calls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || !authReady) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
      <style>{`.spinner{width:36px;height:36px;border:2px solid var(--border);border-top:2px solid var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (isLoading && !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
      <style>{`.spinner{width:36px;height:36px;border:2px solid var(--border);border-top:2px solid var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, color: 'var(--red)' }}>Error loading analytics: {error}</div>
  );

  const { overview, dailyTrend, perCaller, outcomeBreakdown, topCategories, hourlyPattern } = data || {};

  // For employee view — extract just their own row from perCaller
  const myStats = !isAdmin ? (perCaller || []).find(c => c.id === caller?.id) : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
              {isAdmin ? 'Team Analytics' : 'My Performance'}
            </h1>
            {!isAdmin && (
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>
                {caller?.full_name || user?.email}
              </p>
            )}
          </div>
          {isLoading && <span style={{ fontSize: 11, color: 'var(--text3)', padding: '3px 8px', background: 'var(--surface2)', borderRadius: 6 }}>Updating...</span>}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Admin-only: caller filter dropdown */}
          {isAdmin && (
            <select
              value={filterCaller || ''}
              onChange={e => setFilterCaller(e.target.value || null)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: filterCaller ? 'var(--accent2)' : 'var(--text3)', cursor: 'pointer', fontSize: 13 }}
            >
              <option value="">👥 All Team</option>
              {allCallers.map(c => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          )}

          {['today', 'week', 'month'].map(r => (
            <button key={r} onClick={() => setRange(r)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: range === r ? 'var(--accent)' : 'var(--surface)', color: range === r ? 'white' : 'var(--text3)', cursor: 'pointer', fontSize: 13 }}>
              {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}

          {/* Export CSV — admin always, employee only for their own data */}
          <button onClick={handleExportCSV} disabled={!data?.allLogs?.length}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Admin: active filter banner */}
      {isAdmin && filterCaller && (
        <div style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--accent2)' }}>
            📊 Viewing: <strong>{allCallers.find(c => c.id === filterCaller)?.full_name}</strong>
          </span>
          <button onClick={() => setFilterCaller(null)} style={{ fontSize: 12, color: 'var(--accent2)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Show all team</button>
        </div>
      )}

      {/* Employee: personal banner */}
      {!isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>
            {caller?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{caller?.full_name}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>Your personal performance dashboard</p>
          </div>
        </div>
      )}

      {/* Row 1: Stat cards — same for both roles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Calls"  value={overview?.total_calls    || 0} />
        <StatCard label="Connected"    value={overview?.total_connected || 0} />
        <StatCard label="Interested"   value={overview?.total_interested || 0} color="var(--green)" />
        <StatCard label="Meetings"     value={overview?.total_meetings   || 0} color="var(--blue)" />
        <StatCard label="Answer Rate"  value={(overview?.answer_rate  || 0) + '%'} sub="calls answered" />
        <StatCard label="Conversion"   value={(overview?.interest_rate || 0) + '%'} sub="interested / answered" color="var(--accent2)" />
      </div>

      {/* Row 2: Charts — same for both roles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Daily Activity</p>
          <Suspense fallback={<div style={{ height: 200, background: 'var(--surface2)', borderRadius: 8 }} />}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyTrend || []}>
                <XAxis dataKey="date" tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text3)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="total_calls" stroke="#6c63ff" strokeWidth={2} dot={false} name="Calls" />
                <Line type="monotone" dataKey="interested"  stroke="#2ecc7d" strokeWidth={2} dot={false} name="Interested" />
                <Line type="monotone" dataKey="meetings"    stroke="#3b9eff" strokeWidth={2} dot={false} name="Meetings" />
              </LineChart>
            </ResponsiveContainer>
          </Suspense>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outcome Breakdown</p>
          <Suspense fallback={<div style={{ height: 200, background: 'var(--surface2)', borderRadius: 8 }} />}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={outcomeBreakdown || []} dataKey="count" nameKey="outcome" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                  {(outcomeBreakdown || []).map((entry, i) => (
                    <Cell key={i} fill={OUTCOME_COLORS[entry.outcome] || '#6c63ff'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </Suspense>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {(outcomeBreakdown || []).slice(0, 6).map(o => (
              <span key={o.outcome} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: (OUTCOME_COLORS[o.outcome] || '#6c63ff') + '22', color: OUTCOME_COLORS[o.outcome] || '#6c63ff' }}>
                {o.outcome?.replace(/_/g, ' ')} {o.percentage}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── ADMIN VIEW: full team leaderboard ── */}
      {isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {filterCaller ? '👤 Individual Performance' : '🏆 Team Leaderboard'}
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['', 'Caller', 'Calls', 'Connected', 'Interested', 'Meetings', 'Rate', 'Avg Duration'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text3)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(perCaller || []).length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '24px 12px', color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
                    No call data yet. Stats appear here once team members start calling.
                  </td>
                </tr>
              )}
              {(perCaller || []).map((c, idx) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)', background: c.id === caller?.id ? 'var(--accent-glow)' : 'transparent' }}>
                  <td style={{ padding: '10px 12px', width: 28 }}>
                    <span style={{ fontSize: 14 }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {c.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <span style={{ color: c.id === caller?.id ? 'var(--accent2)' : 'var(--text)', fontWeight: c.id === caller?.id ? 600 : 400 }}>
                        {c.name} {c.id === caller?.id ? '(you)' : ''}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{c.total}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{c.connected}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--green)', fontWeight: 600 }}>{c.interested}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--blue)' }}>{c.meetings}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: c.conversion_rate > 30 ? 'var(--green)' : c.conversion_rate > 10 ? 'var(--amber)' : 'var(--text3)', fontWeight: c.conversion_rate > 20 ? 700 : 400 }}>
                      {c.conversion_rate}%
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text3)', fontFamily: 'monospace' }}>{c.avg_duration}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EMPLOYEE VIEW: personal stats card ── */}
      {!isAdmin && myStats && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📊 Your Stats This Period</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { label: 'Calls Made',     value: myStats.total,          color: 'var(--text)' },
              { label: 'Connected',      value: myStats.connected,      color: 'var(--text2)' },
              { label: 'Interested',     value: myStats.interested,     color: 'var(--green)' },
              { label: 'Meetings',       value: myStats.meetings,       color: 'var(--blue)' },
              { label: 'Conversion %',   value: myStats.conversion_rate + '%', color: myStats.conversion_rate > 20 ? 'var(--green)' : 'var(--text)' },
              { label: 'Avg Call Time',  value: myStats.avg_duration + 's', color: 'var(--text3)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: 'var(--text3)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: s.color, margin: 0, letterSpacing: '-0.02em' }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isAdmin && !myStats && !isLoading && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px', marginBottom: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 24, margin: '0 0 8px' }}>📞</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>No calls yet this period</p>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>Your stats will appear here once you start making calls.</p>
        </div>
      )}

      {/* Row 4: Top categories + best hours — same for both */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isAdmin ? 'Top Categories' : 'Your Top Categories'}
          </p>
          <Suspense fallback={<div style={{ height: 200, background: 'var(--surface2)', borderRadius: 8 }} />}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={(topCategories || []).slice(0, 8)} layout="vertical">
                <XAxis type="number" tick={{ fill: 'var(--text3)', fontSize: 10 }} />
                <YAxis type="category" dataKey="category" tick={{ fill: 'var(--text2)', fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="calls" fill="var(--surface3)" name="Calls" radius={[0, 4, 4, 0]} />
                <Bar dataKey="interested" fill="#2ecc7d" name="Interested" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Suspense>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px' }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Best Hours to Call</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
            {(hourlyPattern || []).filter(h => h.hour >= 8 && h.hour <= 19).map(h => {
              const intensity = h.calls > 0 ? Math.min(h.interest_rate / 50, 1) : 0;
              const bg = h.calls === 0 ? 'var(--surface2)' : `rgba(46,204,125,${0.1 + intensity * 0.8})`;
              return (
                <div key={h.hour} title={`${h.hour}:00 — ${h.calls} calls, ${h.interest_rate}% interest`}
                  style={{ height: 40, background: bg, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: h.calls > 0 ? 'rgba(255,255,255,0.8)' : 'var(--text3)' }}>
                  {h.hour}h
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12 }}>Darker green = higher interest rate at that hour</p>
        </div>
      </div>

      {/* Script Performance — admin sees all, employee sees their scripts */}
      {scriptPerf.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px 22px', marginTop: 24 }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Script Performance</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Business', 'Country', 'Angle', 'Variant', 'Used', 'Converted', 'Rate', 'Rating'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text3)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scriptPerf.map(s => {
                const rate = parseFloat(s.conversion_rate) || 0;
                const rateColor = rate > 30 ? 'var(--green)' : rate > 10 ? 'var(--amber)' : rate > 0 ? 'var(--red)' : 'var(--text3)';
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.businesses?.business_name || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text3)' }}>{s.businesses?.country_code || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)', fontSize: 11 }}>{s.variant_angle || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: s.variant === 'alternative' ? 'var(--amber-bg)' : 'var(--accent-glow)', color: s.variant === 'alternative' ? 'var(--amber)' : 'var(--accent2)' }}>
                        {s.variant}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>{s.times_used}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--green)' }}>{s.times_converted}</td>
                    <td style={{ padding: '8px 10px', color: rateColor, fontWeight: 600 }}>{rate > 0 ? rate + '%' : '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--amber)' }}>{s.avg_rating ? '★' + parseFloat(s.avg_rating).toFixed(1) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

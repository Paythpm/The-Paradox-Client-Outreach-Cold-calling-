import React, { useState, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import Papa from 'papaparse';
import { analyzeCSV } from './analyzeData';
import UploadScreen from './components/UploadScreen';
import Dashboard from './components/Dashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TwilioProvider } from './contexts/TwilioContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import MigrationPanel from './components/MigrationPanel';
import WorldClockBar from './components/WorldClockBar';
import CallingStatusBadge from './components/CallingStatusBadge';
import LiveClock from './components/LiveClock';
import { useBusinessReviews } from './hooks/useBusinessReviews';
import supabase from './lib/supabase';

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));

// ── Supabase is configured when env vars are present
const SUPABASE_ENABLED = !!(
  process.env.REACT_APP_SUPABASE_URL &&
  process.env.REACT_APP_SUPABASE_URL !== 'https://your-project-id.supabase.co' &&
  process.env.REACT_APP_SUPABASE_ANON_KEY &&
  process.env.REACT_APP_SUPABASE_ANON_KEY !== 'your-anon-key-here'
);

// ── CSV-only mode (existing functionality, no auth required)
function CSVApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback((file) => {
    if (!file) return;
    setLoading(true);
    setError('');
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            setError('CSV appears to be empty.');
            setLoading(false);
            return;
          }
          const analyzed = analyzeCSV(results.data);
          if (analyzed.totalBusinesses === 0) {
            setError('Could not find valid data. Make sure your CSV has: business_name, rating, review_text columns.');
            setLoading(false);
            return;
          }
          setData(analyzed);
          setLoading(false);
        } catch (e) {
          setError('Analysis failed: ' + e.message);
          setLoading(false);
        }
      },
      error: (err) => {
        setError('Could not parse CSV: ' + err.message);
        setLoading(false);
      }
    });
  }, []);

  const reset = () => { setData(null); setError(''); setFileName(''); };

  if (loading) return <LoadingScreen fileName={fileName} />;
  if (data) return <Dashboard data={data} onReset={reset} fileName={fileName} />;
  return <UploadScreen onFile={handleFile} error={error} />;
}

// ── Convert Supabase business pain_points JSONB → ClinicDetail's expected shape ──
// DB stores: [{category: "Booking & Appointments", count: 5, pct: 33}]
// ClinicDetail expects: painCats: {key: count}, topPains: [{key,count,pct}],
//   painCategories: {key: {label, color, bg}}, painQuotes: {text,rating}[], painSubs: {}

const PAIN_CATEGORY_DISPLAY = {
  'Booking & Appointments': { color: '#6c63ff', bg: 'rgba(108,99,255,0.1)' },
  'Customer Service':       { color: '#ff5c6c', bg: 'rgba(255,92,108,0.1)' },
  'Pricing & Billing':      { color: '#3b9eff', bg: 'rgba(59,158,255,0.1)' },
  'Quality of Work':        { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  'Communication':          { color: '#2ecc7d', bg: 'rgba(46,204,125,0.1)' },
  'Waiting Times':          { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  'Trust & Transparency':   { color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  'Facilities':             { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)'  },
};
// Used when real review text isn't available in the DB
const PAIN_QUOTE_TEMPLATES = {
  'Booking & Appointments': [
    { text: 'Tried to book an appointment online but the system kept giving errors. Called 4 times before anyone answered.', rating: '1★' },
    { text: 'They cancelled my appointment the day before with no explanation. Very inconvenient.', rating: '2★' },
    { text: 'Waiting 6 weeks for a routine cleaning — they need more availability.', rating: '2★' },
  ],
  'Customer Service': [
    { text: 'The front desk staff were dismissive and unhelpful when I asked questions about my treatment.', rating: '1★' },
    { text: 'Felt rushed through my appointment. Staff seemed more interested in getting to the next patient.', rating: '2★' },
    { text: 'Nobody greeted me when I walked in. Had to wait 10 minutes before anyone acknowledged I was there.', rating: '2★' },
  ],
  'Pricing & Billing': [
    { text: 'Was quoted one price over the phone, then charged nearly double at the end. No explanation given.', rating: '1★' },
    { text: 'Hidden fees not mentioned during the consultation. Very disappointed.', rating: '2★' },
    { text: 'They filed my insurance incorrectly and I ended up paying out of pocket for something that should have been covered.', rating: '2★' },
  ],
  'Quality of Work': [
    { text: 'My filling fell out after two weeks. Had to go to another dentist to get it properly done.', rating: '1★' },
    { text: 'The crown they fitted is uncomfortable and doesn\'t sit right. Still waiting for them to fix it.', rating: '2★' },
    { text: 'Needed a redo of the work done here within months. Not acceptable quality.', rating: '1★' },
  ],
  'Communication': [
    { text: 'Left three voicemails and two emails over a week — never heard back.', rating: '1★' },
    { text: 'They never explained what they were doing during the procedure. I had no idea what to expect.', rating: '2★' },
    { text: 'No follow-up after my root canal. Had to call them to find out if everything was okay.', rating: '2★' },
  ],
  'Waiting Times': [
    { text: 'Waited over an hour past my scheduled appointment time with no explanation or apology.', rating: '2★' },
    { text: 'They seem to overbook consistently. Every visit I\'m waiting 45+ minutes.', rating: '2★' },
    { text: 'Being made to wait this long shows a complete disregard for patients\' time.', rating: '1★' },
  ],
  'Trust & Transparency': [
    { text: 'I felt they were recommending unnecessary treatments just to charge more. Sought a second opinion.', rating: '1★' },
    { text: 'They didn\'t fully explain the risks before the procedure. I felt misled.', rating: '2★' },
    { text: 'The treatment plan kept changing without any explanation of why.', rating: '2★' },
  ],
  'Facilities': [
    { text: 'The waiting room equipment looked very outdated. Made me question the quality of care.', rating: '2★' },
    { text: 'Hygiene standards seemed below what you\'d expect from a medical practice.', rating: '1★' },
    { text: 'Parking is a nightmare and the reception area is too small for the number of patients they see.', rating: '2★' },
  ],
};

function convertPainPoints(biz) {
  const rawPains = biz.pain_points;
  if (!rawPains || !Array.isArray(rawPains) || rawPains.length === 0) {
    return { painCats: {}, topPains: [], painCategories: {}, painQuotes: {}, painSubs: {} };
  }

  const painCats = {};
  const painCategories = {};
  const painQuotes = {};
  const topPains = [];

  for (const p of rawPains) {
    const key = p.category;
    const display = PAIN_CATEGORY_DISPLAY[key] || { color: '#9999b0', bg: 'rgba(153,153,176,0.1)' };
    painCats[key] = p.count;
    painCategories[key] = { label: key, color: display.color, bg: display.bg };
    topPains.push({ key, count: p.count, pct: p.pct });

    // Populate quotes — use templates scaled by count
    // Show 1 quote per mention (up to 3)
    const templates = PAIN_QUOTE_TEMPLATES[key] || [];
    if (templates.length > 0) {
      const numQuotes = Math.min(p.count, 3);
      painQuotes[key] = templates.slice(0, numQuotes);
    }
  }

  return { painCats, topPains, painCategories, painQuotes, painSubs: {} };
}

function normalizeBizForDetail(biz) {
  const { painCats, topPains, painCategories, painQuotes, painSubs } = convertPainPoints(biz);
  const negPct = parseFloat(biz.negative_pct) || 0;
  const posPct = Math.max(0, 100 - negPct);

  return {
    ...biz,
    name:           biz.business_name || '',
    url:            biz.google_maps_url || '',
    avg:            parseFloat(biz.rating) || 0,
    total:          parseInt(biz.reviews) || 0,
    negCount:       Math.round((parseInt(biz.reviews) || 0) * negPct / 100),
    negPct,
    posPct,
    neuPct:         0,
    dist:           { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    painCats,
    topPains,
    painCategories,
    painQuotes,
    painSubs,
    trustAdvice:    {},
    bizType:        biz.category?.includes('dental') || biz.category?.includes('dentist')
                      ? 'dental' : 'generic',
  };
}
function PlatformApp() {
  const { user, caller, signOut } = useAuth();

  return (
    <TwilioProvider>
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/analytics" element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingScreen fileName="Analytics" />}>
                <AnalyticsPage />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/migration" element={
            <ProtectedRoute adminOnly>
              <MigrationPanel />
            </ProtectedRoute>
          } />
          <Route path="/*" element={
            <ProtectedRoute>
              <PlatformDashboard user={user} caller={caller} signOut={signOut} />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </TwilioProvider>
  );
}

function PlatformDashboard({ user, caller, signOut }) {
  const [showCSV, setShowCSV] = useState(false);
  const [forcedCountry, setForcedCountry] = useState(null);

  // Admin-only features: CSV mode and Import Data
  // Only the account owner (admin) should access these — employees should not
  const isAdmin = user?.email === 'ramakantsharma2103@gmail.com';

  if (showCSV) return <CSVApp />;

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Platform nav bar */}
      <nav style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, background: 'var(--accent)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', letterSpacing: '-0.02em' }}>DentIQ</span>
          <span style={{ fontSize: 11, color: 'var(--accent2)', background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: 4 }}>Platform</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* World clock — always visible */}
        <WorldClockBar onCountryClick={cc => setForcedCountry(cc)} />

        <Link to="/analytics" style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none', padding: '4px 8px', borderRadius: 6 }}>Analytics</Link>

        {/* Admin-only controls — hidden from regular employees */}
        {isAdmin && (
          <>
            <Link to="/migration" style={{ fontSize: 13, color: 'var(--text3)', textDecoration: 'none', padding: '4px 8px', borderRadius: 6 }}>Import Data</Link>
            <button onClick={() => setShowCSV(true)} style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>CSV Mode</button>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white' }}>
            {caller?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{caller?.full_name || user?.email}</span>
          <button onClick={signOut} style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>Sign out</button>
        </div>
      </nav>

      {/* Main area */}
      <SupabaseLeadView caller={caller} forcedCountry={forcedCountry} onCountryChange={() => setForcedCountry(null)} />
    </div>
  );
}

function SupabaseLeadView({ caller, forcedCountry, onCountryChange }) {
  const [selectedBiz, setSelectedBiz] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('AU');
  const [statusFilter, setStatusFilter] = useState(null);
  const [sortBy, setSortBy] = useState('health_score');
  const [smartQueue, setSmartQueue] = useState(false);
  const [showCallPanel, setShowCallPanel] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [callLogId, setCallLogId] = useState(null);

  const PAGE_SIZE = 200; // load 200 at a time — virtualization handles rendering

  // If WorldClock bar clicks a country, switch to it
  React.useEffect(() => {
    if (forcedCountry && forcedCountry !== country) {
      setCountry(forcedCountry);
      setSelectedBiz(null);
      onCountryChange && onCountryChange();
    }
  }, [forcedCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Virtual scrolling ref and virtualizer
  const listParentRef = React.useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: businesses.length + (hasMore ? 1 : 0), // +1 for load-more sentinel
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  const buildQuery = useCallback((fromRow, toRow) => {
    let query = supabase
      .from('businesses')
      .select('*')
      .eq('country_code', country)
      .eq('do_not_call', false);

    if (statusFilter) query = query.eq('call_status', statusFilter);
    if (search)       query = query.ilike('business_name', `%${search}%`);
    if (smartQueue)   query = query.in('call_status', ['not_called', 'no_answer', 'callback_requested', 'interested']);

    if (sortBy === 'smart' || sortBy === 'random') {
      // For smart sort we fetch a large block client-side
      query = query.order('rating', { ascending: false, nullsFirst: false });
    } else {
      // Primary: chosen field DESC, nulls at bottom
      // Secondary: rating DESC so non-enriched rows are still sorted usefully
      query = query
        .order(sortBy, { ascending: false, nullsFirst: false })
        .order('rating', { ascending: false, nullsFirst: false });
    }

    return query.range(fromRow, toRow);
  }, [country, statusFilter, search, sortBy, smartQueue]);

  // Initial load — resets list when filters change
  const loadBusinesses = useCallback(async () => {
    setIsLoading(true);
    setPage(0);
    setHasMore(true);

    // Also get total count for the progress indicator
    let countQuery = supabase.from('businesses').select('*', { count: 'exact', head: true })
      .eq('country_code', country).eq('do_not_call', false);
    if (statusFilter) countQuery = countQuery.eq('call_status', statusFilter);
    if (search)       countQuery = countQuery.ilike('business_name', `%${search}%`);
    if (smartQueue)   countQuery = countQuery.in('call_status', ['not_called', 'no_answer', 'callback_requested', 'interested']);
    const { count } = await countQuery;
    setTotalCount(count || 0);

    const toRow = sortBy === 'smart' ? 999 : PAGE_SIZE - 1;
    const { data, error } = await buildQuery(0, toRow);
    if (error) { setIsLoading(false); return; }

    let result = data || [];

    if (sortBy === 'smart') {
      const { getCallingScoreCached } = await import('./utils/callingHours');
      const STATUS_PRIORITY = { callback_requested: 1.0, not_called: 0.7, no_answer: 0.4, interested: 0.2 };
      result = result.sort((a, b) => {
        const aC = getCallingScoreCached(a.city || '', a.country_code || '').score / 100;
        const bC = getCallingScoreCached(b.city || '', b.country_code || '').score / 100;
        if (aC === 0 && bC > 0) return 1;
        if (bC === 0 && aC > 0) return -1;
        const aP = aC * 0.40 + ((100 - (a.health_score || 50)) / 100) * 0.35 + (STATUS_PRIORITY[a.call_status] ?? 0.1) * 0.25;
        const bP = bC * 0.40 + ((100 - (b.health_score || 50)) / 100) * 0.35 + (STATUS_PRIORITY[b.call_status] ?? 0.1) * 0.25;
        return bP - aP;
      });
      if (smartQueue) {
        const { getCallingScoreCached: gcs } = await import('./utils/callingHours');
        result = result.filter(b => gcs(b.city || '', b.country_code || '').score >= 60);
      }
    }

    setBusinesses(result);
    setHasMore(result.length >= PAGE_SIZE && sortBy !== 'smart');
    setIsLoading(false);
  }, [country, statusFilter, search, sortBy, smartQueue, buildQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load next page — appends to existing list
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || sortBy === 'smart') return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    const from = nextPage * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);
    if (!error && data?.length > 0) {
      setBusinesses(prev => [...prev, ...data]);
      setPage(nextPage);
      setHasMore(data.length >= PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setIsLoadingMore(false);
  }, [page, isLoadingMore, hasMore, sortBy, buildQuery]);

  React.useEffect(() => { loadBusinesses(); }, [loadBusinesses]);

  // Trigger load more when virtualizer sentinel row becomes visible
  // Placed AFTER loadMore declaration to avoid temporal dead zone
  React.useEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    if (!items.length) return;
    const lastItem = items[items.length - 1];
    if (lastItem.index >= businesses.length - 1 && hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [rowVirtualizer.getVirtualItems(), hasMore, isLoadingMore, loadMore, businesses.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time updates
  React.useEffect(() => {
    const channel = supabase
      .channel('biz-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'businesses' }, (payload) => {
        setBusinesses(prev => prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const CALL_STATUS_BADGES = {
    not_called: null,
    calling: { label: 'Calling', color: 'var(--green)', bg: 'var(--green-bg)' },
    no_answer: { label: 'No answer', color: 'var(--text3)', bg: 'var(--surface2)' },
    callback_requested: { label: 'Callback', color: 'var(--amber)', bg: 'var(--amber-bg)' },
    interested: { label: 'Interested', color: 'var(--green)', bg: 'var(--green-bg)' },
    meeting_booked: { label: 'Meeting set', color: 'var(--blue)', bg: 'var(--blue-bg)' },
    not_interested: { label: 'Not interested', color: 'var(--red)', bg: 'var(--red-bg)' },
    wrong_number: { label: 'Wrong #', color: 'var(--text3)', bg: 'var(--surface2)' },
    do_not_call: { label: 'DNC', color: 'var(--red)', bg: 'var(--red-bg)' },
  };

  // Import the components dynamically to avoid circular deps
  const [ClinicDetail, setClinicDetail] = React.useState(null);
  const [ScriptPanel, setScriptPanel] = React.useState(null);
  const [CallPanel, setCallPanel] = React.useState(null);
  const [MeetingScheduler, setMeetingScheduler] = React.useState(null);
  const [CallingHoursPanel, setCallingHoursPanel] = React.useState(null);

  React.useEffect(() => {
    import('./components/ClinicDetail').then(m => setClinicDetail(() => m.default));
    import('./components/ScriptPanel').then(m => setScriptPanel(() => m.default));
    import('./components/CallPanel').then(m => setCallPanel(() => m.default));
    import('./components/MeetingScheduler').then(m => setMeetingScheduler(() => m.default));
    import('./components/CallingHoursPanel').then(m => setCallingHoursPanel(() => m.default));
  }, []);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 52px)' }}>
      {/* Sidebar */}
      <aside style={{ width: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', flexShrink: 0 }}>
        {/* Country toggle */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
          {['AU', 'CA', 'UK', 'US'].map(c => (
            <button key={c} onClick={() => { setCountry(c); setSelectedBiz(null); }}
              style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', background: country === c ? 'var(--accent)' : 'var(--surface2)', color: country === c ? 'white' : 'var(--text3)', cursor: 'pointer', fontSize: 13, fontWeight: country === c ? 600 : 400 }}>
              {c}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search business..."
            style={{ width: '100%', padding: '8px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Status filter */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap' }}>
          {[null, 'not_called', 'callback_requested', 'interested', 'meeting_booked'].map(s => (
            <button key={s || 'all'} onClick={() => setStatusFilter(s)}
              style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: statusFilter === s ? 'var(--accent-glow)' : 'transparent', color: statusFilter === s ? 'var(--accent2)' : 'var(--text3)', fontSize: 11, cursor: 'pointer' }}>
              {s ? s.replace(/_/g, ' ') : 'All'}
            </button>
          ))}
        </div>

        {/* Sort + Smart Queue */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {[
            { key: 'health_score', label: 'Health' },
            { key: 'rating', label: 'Rating' },
            { key: 'smart', label: '🎯 Smart' },
          ].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)}
              style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: sortBy === s.key ? 'var(--accent-glow)' : 'transparent', color: sortBy === s.key ? 'var(--accent2)' : 'var(--text3)', fontSize: 11, cursor: 'pointer' }}>
              {s.label}
            </button>
          ))}
          <button onClick={() => setSmartQueue(q => !q)}
            style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${smartQueue ? 'var(--green)' : 'var(--border)'}`, background: smartQueue ? 'var(--green-bg)' : 'transparent', color: smartQueue ? 'var(--green)' : 'var(--text3)', fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}>
            {smartQueue ? '● Queue ON' : 'Queue'}
          </button>
        </div>

        {/* Business list count */}
        <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {isLoading ? 'Loading...' : `${businesses.length.toLocaleString()} of ${totalCount.toLocaleString()} businesses`}
          </span>
          {isLoadingMore && <span style={{ fontSize: 11, color: 'var(--accent2)' }}>Loading more...</span>}
        </div>

        {/* Business list — virtualised for performance with 10k+ rows */}
        <div ref={listParentRef} style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && <div style={{ padding: 24, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>Loading...</div>}
          {!isLoading && businesses.length === 0 && (
            <div style={{ padding: 24, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>
              No businesses found.
            </div>
          )}
          {!isLoading && businesses.length > 0 && (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                // Sentinel row — triggers loadMore
                if (virtualRow.index >= businesses.length) {
                  return (
                    <div key="sentinel" style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, padding: '12px 16px', textAlign: 'center' }}>
                      {isLoadingMore
                        ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>Loading more...</span>
                        : <span style={{ fontSize: 12, color: 'var(--text3)' }}>All {businesses.length.toLocaleString()} loaded</span>
                      }
                    </div>
                  );
                }

                const biz = businesses[virtualRow.index];
                const badge = CALL_STATUS_BADGES[biz.call_status];
                const isSelected = selectedBiz?.id === biz.id;
                return (
                  <div key={biz.id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    onClick={() => setSelectedBiz(biz)}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSelected ? 'var(--accent-glow)' : 'transparent', borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: isSelected ? 'var(--accent2)' : 'var(--text)', flex: 1, marginRight: 6, lineHeight: 1.3 }}>{biz.business_name}</p>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
                        {badge && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: badge.bg, color: badge.color }}>{badge.label}</span>}
                        {biz.negative_pct > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: biz.negative_pct > 30 ? 'var(--red-bg)' : 'var(--green-bg)', color: biz.negative_pct > 30 ? 'var(--red)' : 'var(--green)' }}>{biz.negative_pct}% neg</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text3)', fontSize: 11 }}>{biz.rating}★</span>
                      {biz.city && <span style={{ color: 'var(--text3)', fontSize: 11 }}>{biz.city}</span>}
                      {/* Calling status badge — time-based */}
                      <CallingStatusBadge city={biz.city} countryCode={biz.country_code} size="sm" />
                    </div>
                    {/* Live clock when selected */}
                    {isSelected && (
                      <div style={{ marginTop: 4 }}>
                        <LiveClock city={biz.city} countryCode={biz.country_code} format="full"
                          style={{ fontSize: 10, color: 'var(--accent2)' }} />
                      </div>
                    )}
                    {biz.top_pain_point && <span style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'block' }}>{biz.top_pain_point}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main panel */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', position: 'relative' }}>
        {selectedBiz ? (
          <SelectedBizDetail
            selectedBiz={selectedBiz}
            businesses={businesses}
            ClinicDetail={ClinicDetail}
            ScriptPanel={ScriptPanel}
            CallPanel={CallPanel}
            MeetingScheduler={MeetingScheduler}
            CallingHoursPanel={CallingHoursPanel}
            onCallPanelOpen={() => setShowCallPanel(true)}
            showCallPanel={showCallPanel}
            showScheduler={showScheduler}
            callLogId={callLogId}
            onCallPanelClose={() => setShowCallPanel(false)}
            onCallEnded={(outcome, notes, logId) => {
              setShowCallPanel(false);
              setCallLogId(logId);
              if (outcome === 'answered_interested' || outcome === 'meeting_booked') setShowScheduler(true);
              loadBusinesses();
            }}
            onScheduleMeeting={(biz, logId) => { setCallLogId(logId); setShowScheduler(true); }}
            onMeetingScheduled={() => { setShowScheduler(false); loadBusinesses(); }}
            onSchedulerClose={() => setShowScheduler(false)}
          />
        ) : (
          <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
            <div style={{ width: 56, height: 56, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>Select a business to analyze</p>
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>{businesses.length.toLocaleString()} of {totalCount.toLocaleString()} businesses loaded · click any to see full breakdown</p>
            {businesses.length === 0 && (
              <Link to="/migration" style={{ padding: '8px 18px', background: 'var(--accent)', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                Import Lead Data →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── SelectedBizDetail — uses real reviews hook ────────────────────────────────
function SelectedBizDetail({
  selectedBiz, businesses, ClinicDetail, ScriptPanel, CallPanel, MeetingScheduler, CallingHoursPanel,
  onCallPanelOpen, showCallPanel, showScheduler, callLogId,
  onCallPanelClose, onCallEnded, onScheduleMeeting, onMeetingScheduled, onSchedulerClose,
}) {
  const { painQuotes } = useBusinessReviews(selectedBiz?.id);

  const bizForDetail = React.useMemo(() => {
    const base = normalizeBizForDetail(selectedBiz);
    // Merge real quotes from DB over the template quotes
    return { ...base, painQuotes: Object.keys(painQuotes).length > 0 ? painQuotes : base.painQuotes };
  }, [selectedBiz, painQuotes]);

  return (
    <div>
      {ClinicDetail && (
        <ClinicDetail
          biz={bizForDetail}
          globalData={{ globalAvgRating: 4.2, globalAvgNegPct: 15, totalBusinesses: businesses.length, globalPainPcts: {} }}
          extraTab={null}
          extraTabs={[
            CallingHoursPanel ? { key: 'calling-hours', label: '🕐 Calling Hours', content: <CallingHoursPanel business={selectedBiz} /> } : null,
            ScriptPanel ? { key: 'ai-script', label: 'AI Script', content: <ScriptPanel business={selectedBiz} onCallInitiated={onCallPanelOpen} /> } : null,
          ].filter(Boolean)}
        />
      )}
      {showCallPanel && CallPanel && (
        <CallPanel business={selectedBiz} onClose={onCallPanelClose} onCallEnded={onCallEnded} onScheduleMeeting={onScheduleMeeting} />
      )}
      {showScheduler && MeetingScheduler && (
        <MeetingScheduler business={selectedBiz} callLogId={callLogId} onMeetingScheduled={onMeetingScheduled} onClose={onSchedulerClose} />
      )}
    </div>
  );
}

function LoadingScreen({ fileName }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: 'var(--bg)' }}>
      <div className="spinner" />
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 6 }}>Analyzing {fileName}</p>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Categorizing reviews · Detecting pain points · Building insights</p>
      </div>
      <style>{`.spinner{width:44px;height:44px;border:2px solid var(--border);border-top:2px solid var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// Root: choose mode based on whether Supabase is configured
export default function App() {
  if (SUPABASE_ENABLED) {
    return (
      <BrowserRouter>
        <AuthProvider>
          <PlatformApp />
        </AuthProvider>
      </BrowserRouter>
    );
  }

  // CSV-only mode (no auth, existing behaviour preserved)
  return <CSVApp />;
}

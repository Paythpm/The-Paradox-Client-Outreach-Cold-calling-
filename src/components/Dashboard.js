import React, { useState, useMemo } from 'react';
import ClinicDetail from './ClinicDetail';
import { BIZ_TYPE_LABELS } from '../analyzeData';

export default function Dashboard({ data, onReset, fileName }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy] = useState('negPct');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return data.businessNames
      .filter(name => name.toLowerCase().includes(q))
      .map(name => data.businesses[name])
      .sort((a, b) => {
        if (sortBy === 'negPct') return b.negPct - a.negPct;
        if (sortBy === 'avg') return b.avg - a.avg;
        if (sortBy === 'total') return b.total - a.total;
        return 0;
      });
  }, [data, search, sortBy]);

  const selectedBiz = selected ? data.businesses[selected] : null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top nav */}
      <header style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.02em' }}>DentIQ</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text3)', fontSize: 13 }}>·</span>
          <span style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatPill label="Businesses" value={data.totalBusinesses} />
          <StatPill label="Reviews" value={data.totalReviews.toLocaleString()} />
          <StatPill label="Avg rating" value={data.globalAvgRating + '★'} color="var(--amber)" />
          <StatPill label="Neg avg" value={data.globalAvgNegPct + '%'} color="var(--red)" />
        </div>
        <button onClick={onReset} style={{ marginLeft: 8, padding: '6px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
          New CSV
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{ width: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', flexShrink: 0 }}>
          {/* Search */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
                placeholder="Search business..."
                style={{ width: '100%', padding: '8px 12px 8px 30px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>
          </div>
          {/* Sort */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
            {[['negPct','Worst first'],['avg','Best rated'],['total','Most reviews']].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: sortBy === key ? 'var(--accent-glow)' : 'transparent', color: sortBy === key ? 'var(--accent2)' : 'var(--text3)', fontSize: 12, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
          {/* Scrollable list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, color: 'var(--text3)', fontSize: 13, textAlign: 'center' }}>No businesses found</div>
            )}
            {filtered.map(biz => (
              <BusinessRow
                key={biz.name}
                biz={biz}
                selected={selected === biz.name}
                globalAvg={data.globalAvgNegPct}
                onClick={() => setSelected(biz.name)}
              />
            ))}
          </div>
        </aside>

        {/* Main panel */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          {selectedBiz ? (
            <ClinicDetail biz={selectedBiz} globalData={data} />
          ) : (
            <EmptyState count={filtered.length} onPick={() => setSelected(filtered[0]?.name)} />
          )}
        </main>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color: 'var(--text3)', fontSize: 11 }}>{label}</span>
      <span style={{ color: color || 'var(--text)', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function BusinessRow({ biz, selected, globalAvg, onClick }) {
  const worse = biz.negPct > globalAvg;
  const topPain = biz.topPains?.[0];
  const topCat = topPain && biz.painCategories ? biz.painCategories[topPain.key] : null;
  const bizTypeLabel = BIZ_TYPE_LABELS[biz.bizType] || '';

  return (
    <div onClick={onClick} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected ? 'var(--accent-glow)' : 'transparent', borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent', transition: 'background 0.15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <p style={{ color: selected ? 'var(--accent2)' : 'var(--text)', fontSize: 13, fontWeight: 500, lineHeight: 1.3, flex: 1, marginRight: 8 }}>{biz.name}</p>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: worse ? 'var(--red-bg)' : 'var(--green-bg)', color: worse ? 'var(--red)' : 'var(--green)', flexShrink: 0 }}>
          {biz.negPct}% neg
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>{biz.avg}★</span>
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>{biz.total.toLocaleString()} reviews</span>
        </div>
        {topCat && (
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: topCat.bg, color: topCat.color }}>
            {topCat.label.split(' ')[0]}
          </span>
        )}
      </div>
      {bizTypeLabel && (
        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>{bizTypeLabel}</p>
      )}
    </div>
  );
}

function EmptyState({ count, onPick }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
      <div style={{ width: 60, height: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 6 }}>Select a business to analyze</p>
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>{count} businesses loaded · click any to see full breakdown</p>
      </div>
      {count > 0 && (
        <button onClick={onPick} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          Show worst first
        </button>
      )}
    </div>
  );
}

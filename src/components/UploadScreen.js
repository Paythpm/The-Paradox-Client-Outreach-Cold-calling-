import React, { useRef, useState } from 'react';

export default function UploadScreen({ onFile, error }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative', overflow: 'hidden' }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(108,99,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 560 }}>
        {/* Logo mark */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{ width: 36, height: 36, background: 'var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>DentIQ</span>
        </div>

        <h1 style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1.15, marginBottom: 14 }}>
          Clinic Review<br />
          <span style={{ color: 'var(--accent2)' }}>Intelligence</span>
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 16, lineHeight: 1.7, marginBottom: 40 }}>
          Upload your Google Maps review CSV. Get instant pain point analysis,<br />
          trust signals, and per-clinic breakdowns â€” live on call.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current.click()}
          style={{
            border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--border2)'}`,
            borderRadius: 'var(--radius-lg)',
            padding: '48px 32px',
            cursor: 'pointer',
            background: dragging ? 'var(--accent-glow)' : 'var(--surface)',
            transition: 'all 0.2s',
            marginBottom: 24,
          }}
        >
          <div style={{ width: 48, height: 48, background: 'var(--surface2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 6 }}>Drop your CSV here</p>
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>or click to browse Â· business_name, rating, review_text</p>
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files[0])} />
        </div>

        {error && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,92,108,0.2)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Expected columns */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['business_name', 'rating', 'review_text', 'business_url', 'date'].map(col => (
            <span key={col} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--text2)', fontFamily: 'DM Mono, monospace' }}>{col}</span>
          ))}
        </div>
      </div>
    </div>
  );
}


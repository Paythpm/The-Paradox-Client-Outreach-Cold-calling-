import React, { useState } from 'react';
import { runMigration } from '../utils/migrationRunner';

const COUNTRIES = ['AU', 'CA', 'UK', 'US'];

const MODE_OPTIONS = [
  {
    value: 'upsert',
    label: 'Upsert (recommended)',
    desc: 'Insert new rows + update existing ones. Never overwrites with blank.',
  },
  {
    value: 'insert_only',
    label: 'Insert only',
    desc: 'Only adds brand new rows. Skips any phone number already in the database.',
  },
  {
    value: 'update_only',
    label: 'Update only',
    desc: 'Only fills in columns for rows that already exist. Perfect for enrichment files.',
  },
];

// One file slot — can be for any country or a mixed file
function FileSlot({ label, file, onChange, description }) {
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${file ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: 16, transition: 'border-color 0.2s'
    }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{label}</p>
      {description && <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>{description}</p>}
      <label style={{
        display: 'block', padding: '10px 14px', background: 'var(--surface2)',
        border: '1px dashed var(--border2)', borderRadius: 8, cursor: 'pointer',
        fontSize: 12, color: file ? 'var(--green)' : 'var(--text3)', textAlign: 'center'
      }}>
        {file ? `✓ ${file.name}` : 'Click to select .xlsx'}
        <input type="file" accept=".xlsx" onChange={onChange} style={{ display: 'none' }} />
      </label>
    </div>
  );
}

export default function MigrationPanel() {
  const [files, setFiles] = useState({ AU: null, CA: null, UK: null, US: null });
  const [mode, setMode] = useState('upsert');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: '', processed: 0, batch: 0 });
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);

  const handleFileChange = (country, e) => {
    setFiles(prev => ({ ...prev, [country]: e.target.files[0] || null }));
  };

  const handleMigrate = async () => {
    setIsRunning(true);
    setResults([]);
    setErrors([]);

    const newResults = [];

    for (const country of COUNTRIES) {
      if (!files[country]) continue;

      try {
        const result = await runMigration(
          files[country],
          country,
          (prog) => setProgress(prog),
          { mode }
        );
        newResults.push({ country, ...result });

        if (result.errorDetails.length > 0) {
          setErrors(prev => [...prev, ...result.errorDetails.map(e => `[${country}] ${e}`)]);
        }
      } catch (err) {
        newResults.push({
          country, success: false, totalRows: 0, inserted: 0, updated: 0,
          skippedNoPhone: 0, duplicates: 0, errors: 1, errorDetails: [err.message],
          columnsDetected: []
        });
        setErrors(prev => [...prev, `[${country}] ${err.message}`]);
      }

      setResults([...newResults]);
    }

    setIsRunning(false);
    setProgress({ current: 'Done', processed: 0, batch: 0 });
  };

  const hasFiles = COUNTRIES.some(c => files[c]);

  return (
    <div style={{ padding: '32px', maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
        Import Lead Data
      </h2>
      <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 28 }}>
        Upload Excel (.xlsx) files for each country. You can run multiple files — columns are merged by phone number, existing data is never overwritten with blank.
      </p>

      {/* How it works explainer */}
      <div style={{
        background: 'rgba(99,179,237,0.08)', border: '1px solid rgba(99,179,237,0.2)',
        borderRadius: 8, padding: '14px 18px', marginBottom: 28, fontSize: 13
      }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>How multi-file merging works</p>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6 }}>
          Every file is matched to existing rows using <strong>phone number</strong>. If a row already exists,
          only the columns present in the new file are updated — blank values are ignored. So you can safely
          run a "contact details" file first, then an "analysis data" file second, and both sets of
          columns will fill in the same row correctly.
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Import mode</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {MODE_OPTIONS.map(opt => (
            <div
              key={opt.value}
              onClick={() => !isRunning && setMode(opt.value)}
              style={{
                padding: '12px 14px', borderRadius: 8, cursor: isRunning ? 'not-allowed' : 'pointer',
                border: `1px solid ${mode === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                background: mode === opt.value ? 'rgba(99,179,237,0.08)' : 'var(--surface)',
                transition: 'all 0.15s'
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: mode === opt.value ? 'var(--accent)' : 'var(--text)', marginBottom: 4 }}>
                {mode === opt.value ? '● ' : '○ '}{opt.label}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{opt.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* File inputs — 4 columns for 4 countries */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <FileSlot label="🇦🇺 AU Leads" file={files.AU} onChange={e => handleFileChange('AU', e)} description="Australian dental clinics" />
        <FileSlot label="🇨🇦 CA Leads" file={files.CA} onChange={e => handleFileChange('CA', e)} description="Canadian dental clinics" />
        <FileSlot label="🇬🇧 UK Leads" file={files.UK} onChange={e => handleFileChange('UK', e)} description="UK dental clinics" />
        <FileSlot label="🇺🇸 US Leads" file={files.US} onChange={e => handleFileChange('US', e)} description="US dental clinics" />
      </div>

      {/* Run button */}
      <button
        onClick={handleMigrate}
        disabled={!hasFiles || isRunning}
        style={{
          padding: '12px 32px',
          background: !hasFiles || isRunning ? 'var(--surface2)' : 'var(--accent)',
          color: !hasFiles || isRunning ? 'var(--text3)' : 'white',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
          cursor: !hasFiles || isRunning ? 'not-allowed' : 'pointer', marginBottom: 24
        }}
      >
        {isRunning ? '⏳ Running...' : `Run Migration (${mode})`}
      </button>

      {/* Progress */}
      {isRunning && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 16, marginBottom: 16
        }}>
          <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>{progress.current}</p>
          <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>
            {progress.processed.toLocaleString()} rows processed · Batch {progress.batch}
          </p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {results.map(r => (
            <div key={r.country} style={{
              background: 'var(--surface)', border: `1px solid ${r.success ? 'var(--border)' : 'rgba(255,92,108,0.3)'}`,
              borderRadius: 8, padding: 18, marginBottom: 12
            }}>
              {/* Result header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{r.country}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11,
                    background: r.success ? 'rgba(72,187,120,0.15)' : 'rgba(255,92,108,0.15)',
                    color: r.success ? 'var(--green)' : 'var(--red)'
                  }}>
                    {r.success ? '✓ Done' : '✗ Failed'}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {r.totalRows.toLocaleString()} total rows
                </span>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Inserted', value: r.inserted, color: 'var(--green)' },
                  { label: 'Updated', value: r.updated || 0, color: 'var(--accent)' },
                  { label: 'No Phone', value: r.skippedNoPhone, color: 'var(--text3)' },
                  { label: 'Duplicates', value: r.duplicates, color: 'var(--amber)' },
                  { label: 'Errors', value: r.errors, color: r.errors > 0 ? 'var(--red)' : 'var(--text3)' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center'
                  }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{(s.value || 0).toLocaleString()}</p>
                    <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Columns detected */}
              {r.columnsDetected?.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                    Columns detected in this file:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.columnsDetected.map(col => (
                      <span key={col} style={{
                        padding: '2px 8px', background: 'var(--surface2)',
                        border: '1px solid var(--border)', borderRadius: 4,
                        fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace'
                      }}>
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{
          background: 'rgba(255,92,108,0.08)', border: '1px solid rgba(255,92,108,0.2)',
          borderRadius: 8, padding: 16
        }}>
          <p style={{ color: 'var(--red)', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Errors encountered:
          </p>
          {errors.map((e, i) => (
            <p key={i} style={{ color: 'var(--red)', fontSize: 12, marginBottom: 4 }}>• {e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

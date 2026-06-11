/**
 * phoneNormalizer.js
 * Converts raw phone strings from any country into E.164 format (+CCDDDDDDDDD)
 * Returns null for garbage/invalid numbers so they are safely skipped.
 */

// ─── Validity thresholds ──────────────────────────────────────────────────────
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

// Digits that indicate clearly garbage data
const GARBAGE_PATTERNS = [
  /^0+$/,            // all zeros
  /^(\d)\1{6,}$/,   // repeated single digit
  /^\d{1,3}$/,       // too short (area code fragment)
  /^\d{14,}$/,       // too long (probably a date/timestamp)
];

function digitsOnly(s) {
  return (s || '').replace(/\D/g, '');
}

function isGarbage(raw, digits) {
  if (!raw || raw.trim().length < 4) return true;
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return true;
  for (const pat of GARBAGE_PATTERNS) {
    if (pat.test(digits)) return true;
  }
  // Contains date-like patterns (+2022-01-27, etc.)
  if (/\+20[12]\d[-\/]/.test(raw)) return true;
  if (/\+0{3,}/.test(raw)) return true;
  return false;
}

// ─── Country-specific normalizers ────────────────────────────────────────────

function normalizeUS(raw) {
  // Formats: (DDD) DDD-DDDD | +1DDDDDDDDDD | 1DDDDDDDDDD
  const d = digitsOnly(raw);
  if (isGarbage(raw, d)) return null;

  let core = d;
  if (core.startsWith('1') && core.length === 11) core = core.slice(1);
  if (core.length !== 10) return null;

  // Validate area code — must start with 2-9, exchange must start with 2-9
  if (!/^[2-9]\d{9}$/.test(core)) return null;
  // Known fake area codes
  if (['000','111','555'].includes(core.slice(0,3))) return null;

  return `+1${core}`;
}

function normalizeAU(raw) {
  // Formats:
  // (0X) XXXX XXXX  — landline
  // 1800/1300/1800 XXXXXX — national service numbers
  // 04XX XXX XXX   — mobile
  // +61 X XXXX XXXX — already E.164
  const d = digitsOnly(raw);
  if (isGarbage(raw, d)) return null;

  // Already E.164
  if (raw.trim().startsWith('+61')) {
    const core = d.slice(2); // remove 61
    if (core.length >= 8 && core.length <= 10) return `+61${core}`;
  }

  // Starts with 0 — local format
  if (d.startsWith('0')) {
    // Reject space-separated garbage like "0 0 100 105"
    if (/^0\s+0\s/.test(raw)) return null;

    const core = d.slice(1);
    if (core.length < 7 || core.length > 10) return null;

    // Mobile: 04XX
    if (core.startsWith('4') && core.length === 9) return `+61${core}`;
    // 13XX short numbers
    if (d.startsWith('13') && (d.length === 6 || d.length === 8)) return `+61${d}`;
    // 1800 / 1300
    if (d.startsWith('1800') || d.startsWith('1300') || d.startsWith('1900')) {
      if (d.length === 10) return `+61${d}`;
    }
    // Landline (02, 03, 07, 08)
    if (['2','3','7','8'].includes(core[0]) && core.length === 9) return `+61${core}`;
    if (core.length >= 7) return `+61${core}`;
  }

  // 1800 / 1300 without leading 0
  if ((d.startsWith('1800') || d.startsWith('1300') || d.startsWith('13')) && d.length >= 6) {
    return `+61${d}`;
  }

  // Already has 61 prefix without +
  if (d.startsWith('61') && d.length >= 10) return `+${d}`;

  if (d.length >= 8 && d.length <= 10) return `+61${d}`;
  return null;
}

function normalizeCA(raw) {
  // Same NANP as US but Canadian area codes
  // Formats: (DDD) DDD-DDDD | +1 DDD-DDD-DDDD
  const d = digitsOnly(raw);
  if (isGarbage(raw, d)) return null;

  let core = d;
  if (core.startsWith('1') && core.length === 11) core = core.slice(1);
  if (core.length !== 10) return null;
  if (!/^[2-9]\d{9}$/.test(core)) return null;

  // Canadian area codes (verified list from our data)
  const CA_AREA_CODES = new Set([
    '204','226','236','249','250','289','306','343','365','403',
    '416','418','431','437','438','450','506','514','519','548',
    '579','581','587','604','613','639','647','672','705','709',
    '742','778','780','782','807','819','825','867','873','902','905'
  ]);

  const area = core.slice(0, 3);
  if (!CA_AREA_CODES.has(area)) {
    // Might still be CA if it looks valid — keep it but flag as CA
    // Some numbers in CA data may be US numbers for national chains
    if (/^[2-9]\d{9}$/.test(core)) return `+1${core}`;
    return null;
  }

  return `+1${core}`;
}

function normalizeUK(raw) {
  // Formats:
  // 01XXX XXXXXX  — geographic (5+6)
  // 0XXXX XXXXXX  — geographic variants
  // 020 XXXX XXXX — London
  // 0800/0845/0333 XXX XXXX — non-geographic
  // 07XXX XXXXXX  — mobile
  // +44 XXXX XXXXXX — E.164
  const d = digitsOnly(raw);
  if (isGarbage(raw, d)) return null;

  // Already E.164
  if (raw.trim().startsWith('+44')) {
    const core = d.slice(2);
    if (core.length >= 9 && core.length <= 11) return `+44${core}`;
  }

  // Has 44 prefix without +
  if (d.startsWith('44') && d.length >= 11) return `+${d}`;

  // Standard UK format starting with 0
  if (d.startsWith('0')) {
    const core = d.slice(1);
    if (core.length < 9 || core.length > 11) return null;

    // Mobile: 07XXX
    if (core.startsWith('7') && core.length === 10) return `+44${core}`;
    // London: 020 XXXX XXXX → core starts with 20
    if (core.startsWith('20') && core.length === 10) return `+44${core}`;
    // 03XX non-geographic
    if (core.startsWith('3') && core.length === 10) return `+44${core}`;
    // 08XX
    if (core.startsWith('8') && core.length === 10) return `+44${core}`;
    // Geographic: 01XXX or 01XX
    if (core.startsWith('1') && core.length >= 9) return `+44${core}`;
    // Catch-all for valid length
    if (core.length >= 9 && core.length <= 10) return `+44${core}`;
  }

  return null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

function normalizePhone(raw, countryCode) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  switch (countryCode) {
    case 'US': return normalizeUS(trimmed);
    case 'AU': return normalizeAU(trimmed);
    case 'CA': return normalizeCA(trimmed);
    case 'UK': return normalizeUK(trimmed);
    default: {
      // Generic: try to extract digits and add country code
      const d = digitsOnly(trimmed);
      if (d.length >= 7 && d.length <= 15) return `+${d}`;
      return null;
    }
  }
}

module.exports = { normalizePhone };

/**
 * callingHours.js — Timezone & Calling Hours Intelligence Engine
 * Pure utility — no React, no Supabase, fully deterministic and testable.
 *
 * Research basis: ZoomInfo 1.4M+ calls, CallHippo 52K, InsideSales 100K
 * Legal basis: ACMA (AU), CRTC/CASL (CA), PECR/ICO (UK), FTC/TSR (US)
 */

import { toZonedTime } from 'date-fns-tz';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — TIMEZONE MAPS
// ─────────────────────────────────────────────────────────────────────────────

export const CITY_TIMEZONE_MAP = {
  // ── Australia ──────────────────────────────────────────────────────────────
  'sydney':          'Australia/Sydney',
  'melbourne':       'Australia/Melbourne',
  'brisbane':        'Australia/Brisbane',
  'gold coast':      'Australia/Brisbane',
  'sunshine coast':  'Australia/Brisbane',
  'cairns':          'Australia/Brisbane',
  'townsville':      'Australia/Brisbane',
  'toowoomba':       'Australia/Brisbane',
  'canberra':        'Australia/Sydney',
  'newcastle nsw':   'Australia/Sydney',
  'wollongong':      'Australia/Sydney',
  'hobart':          'Australia/Hobart',
  'launceston':      'Australia/Hobart',
  'adelaide':        'Australia/Adelaide',
  'port augusta':    'Australia/Adelaide',
  'perth':           'Australia/Perth',
  'fremantle':       'Australia/Perth',
  'bunbury':         'Australia/Perth',
  'darwin':          'Australia/Darwin',
  'alice springs':   'Australia/Darwin',

  // ── Canada ────────────────────────────────────────────────────────────────
  'toronto':         'America/Toronto',
  'ottawa':          'America/Toronto',
  'hamilton ontario':'America/Toronto',
  'london ontario':  'America/Toronto',
  'kingston ontario':'America/Toronto',
  'montreal':        'America/Montreal',
  'quebec city':     'America/Montreal',
  'laval':           'America/Montreal',
  'gatineau':        'America/Montreal',
  'sherbrooke':      'America/Montreal',
  'vancouver':       'America/Vancouver',
  'victoria bc':     'America/Vancouver',
  'kelowna':         'America/Vancouver',
  'surrey':          'America/Vancouver',
  'burnaby':         'America/Vancouver',
  'richmond bc':     'America/Vancouver',
  'calgary':         'America/Edmonton',
  'edmonton':        'America/Edmonton',
  'lethbridge':      'America/Edmonton',
  'red deer':        'America/Edmonton',
  'winnipeg':        'America/Winnipeg',
  'brandon':         'America/Winnipeg',
  'regina':          'America/Regina',
  'saskatoon':       'America/Regina',
  'halifax':         'America/Halifax',
  'moncton':         'America/Halifax',
  'fredericton':     'America/Halifax',
  'saint john nb':   'America/Halifax',
  "st. john's":      'America/St_Johns',
  'corner brook':    'America/St_Johns',

  // ── United Kingdom ────────────────────────────────────────────────────────
  'london':          'Europe/London',
  'manchester':      'Europe/London',
  'birmingham':      'Europe/London',
  'leeds':           'Europe/London',
  'sheffield':       'Europe/London',
  'liverpool':       'Europe/London',
  'bristol':         'Europe/London',
  'edinburgh':       'Europe/London',
  'glasgow':         'Europe/London',
  'cardiff':         'Europe/London',
  'belfast':         'Europe/London',
  'newcastle upon tyne': 'Europe/London',
  'nottingham':      'Europe/London',
  'leicester':       'Europe/London',
  'coventry':        'Europe/London',
  'brighton':        'Europe/London',
  'plymouth':        'Europe/London',
  'reading':         'Europe/London',
  'derby':           'Europe/London',
  'wolverhampton':   'Europe/London',
  'southampton':     'Europe/London',
  'portsmouth':      'Europe/London',
  'oxford':          'Europe/London',
  'cambridge':       'Europe/London',
  'stoke':           'Europe/London',
  'sunderland':      'Europe/London',

  // ── United States ─────────────────────────────────────────────────────────
  // Eastern — UTC-5/UTC-4 DST
  'new york':        'America/New_York',
  'brooklyn':        'America/New_York',
  'queens':          'America/New_York',
  'bronx':           'America/New_York',
  'staten island':   'America/New_York',
  'buffalo':         'America/New_York',
  'rochester':       'America/New_York',
  'syracuse':        'America/New_York',
  'albany':          'America/New_York',
  'boston':          'America/New_York',
  'cambridge ma':    'America/New_York',
  'worcester':       'America/New_York',
  'providence':      'America/New_York',
  'philadelphia':    'America/New_York',
  'pittsburgh':      'America/New_York',
  'newark':          'America/New_York',
  'jersey city':     'America/New_York',
  'washington dc':   'America/New_York',
  'baltimore':       'America/New_York',
  'miami':           'America/New_York',
  'orlando':         'America/New_York',
  'tampa':           'America/New_York',
  'jacksonville':    'America/New_York',
  'charlotte':       'America/New_York',
  'raleigh':         'America/New_York',
  'durham':          'America/New_York',
  'atlanta':         'America/New_York',
  'columbus ohio':   'America/New_York',
  'cleveland':       'America/New_York',
  'cincinnati':      'America/New_York',
  'detroit':         'America/Detroit',
  'grand rapids':    'America/Detroit',
  'nashville':       'America/Chicago',
  // Central — UTC-6/UTC-5 DST
  'chicago':         'America/Chicago',
  'houston':         'America/Chicago',
  'dallas':          'America/Chicago',
  'san antonio':     'America/Chicago',
  'austin':          'America/Chicago',
  'fort worth':      'America/Chicago',
  'el paso':         'America/Chicago',
  'memphis':         'America/Chicago',
  'louisville':      'America/Chicago',
  'indianapolis':    'America/Indiana/Indianapolis',
  'minneapolis':     'America/Chicago',
  'milwaukee':       'America/Chicago',
  'kansas city':     'America/Chicago',
  'omaha':           'America/Chicago',
  'tulsa':           'America/Chicago',
  'oklahoma city':   'America/Chicago',
  'new orleans':     'America/Chicago',
  'st. louis':       'America/Chicago',
  'saint louis':     'America/Chicago',
  'wichita':         'America/Chicago',
  // Mountain — UTC-7/UTC-6 DST (Arizona = no DST)
  'denver':          'America/Denver',
  'colorado springs':'America/Denver',
  'aurora co':       'America/Denver',
  'fort collins':    'America/Denver',
  'albuquerque':     'America/Denver',
  'salt lake city':  'America/Denver',
  'boise':           'America/Boise',
  'phoenix':         'America/Phoenix',   // Arizona — no DST
  'tucson':          'America/Phoenix',
  'mesa':            'America/Phoenix',
  'chandler':        'America/Phoenix',
  'scottsdale':      'America/Phoenix',
  // Pacific — UTC-8/UTC-7 DST
  'los angeles':     'America/Los_Angeles',
  'san diego':       'America/Los_Angeles',
  'san jose':        'America/Los_Angeles',
  'san francisco':   'America/Los_Angeles',
  'fresno':          'America/Los_Angeles',
  'sacramento':      'America/Los_Angeles',
  'long beach':      'America/Los_Angeles',
  'oakland':         'America/Los_Angeles',
  'bakersfield':     'America/Los_Angeles',
  'anaheim':         'America/Los_Angeles',
  'santa ana':       'America/Los_Angeles',
  'riverside':       'America/Los_Angeles',
  'stockton':        'America/Los_Angeles',
  'irvine':          'America/Los_Angeles',
  'portland':        'America/Los_Angeles',
  'seattle':         'America/Los_Angeles',
  'spokane':         'America/Los_Angeles',
  'tacoma':          'America/Los_Angeles',
  'henderson':       'America/Los_Angeles',
  'las vegas':       'America/Los_Angeles',
  'reno':            'America/Los_Angeles',
  // Alaska & Hawaii
  'anchorage':       'America/Anchorage',
  'fairbanks':       'America/Anchorage',
  'juneau':          'America/Anchorage',
  'honolulu':        'Pacific/Honolulu',
};

export const COUNTRY_DEFAULT_TIMEZONE = {
  AU: 'Australia/Sydney',
  CA: 'America/Toronto',
  UK: 'Europe/London',
  US: 'America/New_York',
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — LEGAL HOURS CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const LEGAL_CALLING_HOURS = {
  AU: {
    weekday:  { start: 9,  end: 20, allowed: true  }, // 9am–8pm ACMA
    saturday: { start: 9,  end: 17, allowed: true  }, // 9am–5pm ACMA
    sunday:   { start: 0,  end: 0,  allowed: false }, // PROHIBITED
    holiday:  { start: 0,  end: 0,  allowed: false }, // PROHIBITED
  },
  CA: {
    weekday:  { start: 8,  end: 21, allowed: true  }, // 8am–9pm CRTC
    saturday: { start: 8,  end: 18, allowed: true  }, // 8am–6pm CRTC
    sunday:   { start: 13, end: 21, allowed: true  }, // 1pm–9pm (best avoid)
    holiday:  { start: 8,  end: 21, allowed: true  }, // technically allowed
  },
  UK: {
    weekday:  { start: 8,  end: 20, allowed: true  }, // 8am–8pm PECR
    saturday: { start: 8,  end: 20, allowed: true  }, // 8am–8pm PECR
    sunday:   { start: 9,  end: 18, allowed: true  }, // 9am–6pm (strongly avoid)
    holiday:  { start: 8,  end: 20, allowed: true  }, // same as weekday
  },
  US: {
    weekday:  { start: 8,  end: 21, allowed: true  }, // 8am–9pm FTC/TSR
    saturday: { start: 8,  end: 21, allowed: true  }, // 8am–9pm FTC/TSR
    sunday:   { start: 8,  end: 21, allowed: true  }, // 8am–9pm FTC/TSR (legal but avoid)
    holiday:  { start: 8,  end: 21, allowed: true  }, // technically allowed
  },
};

// MM-DD format public holidays (approximate common holidays)
export const PUBLIC_HOLIDAYS = {
  AU: ['01-01', '01-26', '03-29', '04-01', '04-25', '12-25', '12-26'],
  CA: ['01-01', '02-17', '05-19', '07-01', '09-01', '10-13', '11-11', '12-25', '12-26'],
  UK: ['01-01', '04-18', '04-21', '05-05', '05-26', '08-25', '12-25', '12-26'],
  US: ['01-01', '07-04', '11-11', '11-27', '12-25'],
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — CORE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the IANA timezone for a business given city + country.
 * Uses country code to avoid cross-country collisions (e.g. Birmingham AL vs Birmingham England).
 * Does a substring match only within the correct country's key space.
 */
export function getBusinessTimezone(city, countryCode) {
  if (!city) return COUNTRY_DEFAULT_TIMEZONE[countryCode] || 'UTC';
  const cityLower = city.toLowerCase().trim();

  // Build country-scoped lookup to avoid cross-country false matches
  // e.g. "birmingham" in UK map must not match "Birmingham, AL" (US)
  const COUNTRY_KEY_PREFIXES = {
    AU: ['australia/', 'hobart', 'darwin', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
         'gold coast', 'sunshine coast', 'cairns', 'townsville', 'toowoomba', 'canberra', 'newcastle nsw',
         'wollongong', 'launceston', 'port augusta', 'fremantle', 'bunbury', 'alice springs'],
    CA: ['america/toronto', 'america/vancouver', 'america/edmonton', 'america/winnipeg',
         'america/regina', 'america/halifax', 'america/st_johns', 'america/montreal', 'america/whitehorse',
         'toronto', 'vancouver', 'calgary', 'edmonton', 'montreal', 'ottawa', 'winnipeg', 'halifax',
         "st. john's", 'victoria bc', 'kelowna', 'burnaby', 'surrey', 'richmond bc', 'red deer',
         'lethbridge', 'saskatoon', 'regina', 'fredericton', 'moncton', 'saint john nb',
         'gatineau', 'laval', 'sherbrooke', 'london ontario', 'hamilton ontario', 'kingston ontario'],
    UK: ['europe/london', 'london', 'manchester', 'birmingham', 'leeds', 'sheffield',
         'liverpool', 'bristol', 'edinburgh', 'glasgow', 'cardiff', 'belfast',
         'newcastle upon tyne', 'nottingham', 'leicester', 'coventry', 'brighton', 'plymouth',
         'derby', 'wolverhampton', 'southampton', 'portsmouth', 'oxford', 'cambridge',
         'stoke', 'sunderland', 'reading', 'scotland', 'england', 'wales', 'northern ireland'],
    US: ['america/new_york', 'america/chicago', 'america/denver', 'america/los_angeles',
         'america/phoenix', 'america/anchorage', 'pacific/honolulu', 'america/detroit',
         'america/indiana', 'america/boise',
         // US city names that could collide with other countries
         'birmingham, al', 'newcastle', 'richmond, va', 'portland', 'cambridge, ma',
         'victoria, tx', 'london, on', 'hamilton, oh'],
  };

  // For known-ambiguous cities, use country-scoped exact/prefix matching first
  const ambiguous = ['birmingham', 'newcastle', 'richmond', 'victoria', 'london', 'cambridge',
                     'hamilton', 'portland', 'stirling', 'perth', 'reading', 'derby'];
  const isAmbiguous = ambiguous.some(a => cityLower.includes(a));

  if (isAmbiguous) {
    // For ambiguous cities, match with state/province/country suffix
    const exactKey = cityLower; // e.g. "birmingham, al"
    if (CITY_TIMEZONE_MAP[exactKey]) return CITY_TIMEZONE_MAP[exactKey];

    // Try country-specific lookup based on state codes
    if (countryCode === 'US') {
      // Use state suffix to determine timezone
      const stateMatch = city.match(/,\s*([A-Za-z]{2})$/);
      if (stateMatch) {
        const st = stateMatch[1].toUpperCase();
        const stateTimezones = {
          AL:'America/Chicago', TN:'America/Chicago', MS:'America/Chicago', AR:'America/Chicago',
          LA:'America/Chicago', MO:'America/Chicago', IL:'America/Chicago', WI:'America/Chicago',
          MN:'America/Chicago', IA:'America/Chicago', ND:'America/Chicago', SD:'America/Chicago',
          NE:'America/Chicago', KS:'America/Chicago', OK:'America/Chicago', TX:'America/Chicago',
          AZ:'America/Phoenix', MT:'America/Denver', ID:'America/Boise', WY:'America/Denver',
          CO:'America/Denver', NM:'America/Denver', UT:'America/Denver', NV:'America/Los_Angeles',
          CA:'America/Los_Angeles', OR:'America/Los_Angeles', WA:'America/Los_Angeles',
          AK:'America/Anchorage', HI:'Pacific/Honolulu',
          MI:'America/Detroit', IN:'America/Indiana/Indianapolis',
          KY:'America/New_York', VA:'America/New_York', NC:'America/New_York',
          SC:'America/New_York', GA:'America/New_York', FL:'America/New_York',
          OH:'America/New_York', PA:'America/New_York', NY:'America/New_York',
          NJ:'America/New_York', CT:'America/New_York', RI:'America/New_York',
          MA:'America/New_York', NH:'America/New_York', VT:'America/New_York',
          ME:'America/New_York', MD:'America/New_York', DE:'America/New_York',
          DC:'America/New_York', WV:'America/New_York',
        };
        if (stateTimezones[st]) return stateTimezones[st];
      }
      return COUNTRY_DEFAULT_TIMEZONE.US;
    }

    if (countryCode === 'UK') return 'Europe/London';
    if (countryCode === 'AU') {
      if (cityLower.includes('perth')) return 'Australia/Perth';
      return COUNTRY_DEFAULT_TIMEZONE.AU;
    }
    if (countryCode === 'CA') return COUNTRY_DEFAULT_TIMEZONE.CA;
  }

  // Non-ambiguous: try substring match sorted by length (longer = more specific)
  const keys = Object.keys(CITY_TIMEZONE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (cityLower.includes(key)) {
      return CITY_TIMEZONE_MAP[key];
    }
  }

  // Final fallback: state code from "City, ST" format
  if (countryCode === 'US') {
    const stateMatch = city.match(/,\s*([A-Za-z]{2})$/);
    if (stateMatch) {
      const st = stateMatch[1].toUpperCase();
      const stateTimezones = {
        AL:'America/Chicago', TN:'America/Chicago', MS:'America/Chicago', AR:'America/Chicago',
        LA:'America/Chicago', MO:'America/Chicago', IL:'America/Chicago', WI:'America/Chicago',
        MN:'America/Chicago', IA:'America/Chicago', ND:'America/Chicago', SD:'America/Chicago',
        NE:'America/Chicago', KS:'America/Chicago', OK:'America/Chicago', TX:'America/Chicago',
        AZ:'America/Phoenix', MT:'America/Denver', ID:'America/Boise', WY:'America/Denver',
        CO:'America/Denver', NM:'America/Denver', UT:'America/Denver', NV:'America/Los_Angeles',
        CA:'America/Los_Angeles', OR:'America/Los_Angeles', WA:'America/Los_Angeles',
        AK:'America/Anchorage', HI:'Pacific/Honolulu',
        MI:'America/Detroit', IN:'America/Indiana/Indianapolis',
        KY:'America/New_York', VA:'America/New_York', NC:'America/New_York',
        SC:'America/New_York', GA:'America/New_York', FL:'America/New_York',
        OH:'America/New_York', PA:'America/New_York', NY:'America/New_York',
        NJ:'America/New_York', CT:'America/New_York', RI:'America/New_York',
        MA:'America/New_York', NH:'America/New_York', VT:'America/New_York',
        ME:'America/New_York', MD:'America/New_York', DE:'America/New_York',
        DC:'America/New_York', WV:'America/New_York',
      };
      if (stateTimezones[st]) return stateTimezones[st];
    }
  }

  return COUNTRY_DEFAULT_TIMEZONE[countryCode] || 'UTC';
}

/**
 * Get rich current time info for a given IANA timezone.
 */
export function getCurrentTimeInTimezone(timezone, atTime = new Date()) {
  let zoned;
  try {
    zoned = toZonedTime(atTime, timezone);
  } catch {
    zoned = atTime;
  }

  const hour = zoned.getHours();
  const minute = zoned.getMinutes();
  const dayOfWeek = zoned.getDay(); // 0=Sun, 6=Sat

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayAbbr  = ['Sun',    'Mon',    'Tue',     'Wed',       'Thu',      'Fri',    'Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = String(minute).padStart(2, '0');
  const timeString = `${h12}:${mm} ${ampm}`;
  const dateString = `${dayAbbr[dayOfWeek]} ${zoned.getDate()} ${monthNames[zoned.getMonth()]}`;
  const fullDisplay = `${dateString} · ${timeString}`;

  return {
    date: zoned,
    hour,
    minute,
    dayOfWeek,
    dayName: dayNames[dayOfWeek],
    dayAbbr: dayAbbr[dayOfWeek],
    timeString,
    dateString,
    fullDisplay,
  };
}

/**
 * Check if a given date is a public holiday for a country.
 */
export function isPublicHoliday(date, countryCode) {
  const holidays = PUBLIC_HOLIDAYS[countryCode] || [];
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return holidays.includes(`${m}-${d}`);
}

/**
 * Determine if it is currently legal to call a business.
 */
export function isLegalToCall(city, countryCode, atTime = new Date()) {
  const timezone = getBusinessTimezone(city, countryCode);
  let zoned;
  try {
    zoned = toZonedTime(atTime, timezone);
  } catch {
    zoned = atTime;
  }
  // Pass atTime through so forward-looking checks (getNextPrimeWindow,
  // getWeekForecast) evaluate the candidate time, not the present moment.
  const timeInfo = getCurrentTimeInTimezone(timezone, atTime);

  const hours = LEGAL_CALLING_HOURS[countryCode];
  if (!hours) {
    return { isLegal: true, reason: 'No rules defined', legalWindow: 'Unknown', timezone, localTime: timeInfo };
  }

  // Determine day type
  let dayType;
  if (isPublicHoliday(zoned, countryCode)) {
    dayType = 'holiday';
  } else if (timeInfo.dayOfWeek === 0) {
    dayType = 'sunday';
  } else if (timeInfo.dayOfWeek === 6) {
    dayType = 'saturday';
  } else {
    dayType = 'weekday';
  }

  const rule = hours[dayType];

  const fmt = (h) => {
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    return `${h12}:00 ${ampm}`;
  };

  const legalWindow = rule.allowed
    ? `${fmt(rule.start)} – ${fmt(rule.end)}`
    : 'Not permitted';

  if (!rule.allowed) {
    const reasonMap = {
      sunday: 'Sunday — no calls permitted',
      holiday: 'Public holiday — no calls permitted',
    };
    return {
      isLegal: false,
      reason: reasonMap[dayType] || 'Not permitted',
      legalWindow,
      timezone,
      localTime: timeInfo,
    };
  }

  if (timeInfo.hour < rule.start) {
    return { isLegal: false, reason: `Too early (before ${fmt(rule.start)})`, legalWindow, timezone, localTime: timeInfo };
  }
  if (timeInfo.hour >= rule.end) {
    return { isLegal: false, reason: `Too late (after ${fmt(rule.end)})`, legalWindow, timezone, localTime: timeInfo };
  }

  return { isLegal: true, reason: 'Legal calling hours', legalWindow, timezone, localTime: timeInfo };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — CALLING SCORE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export const DAY_SCORES = {
  0: 0.00,  // Sunday
  1: 0.72,  // Monday
  2: 0.98,  // Tuesday
  3: 1.00,  // Wednesday ← best
  4: 0.88,  // Thursday
  5: 0.65,  // Friday
  6: 0.40,  // Saturday
};

/**
 * Return a 0–1 score for a given hour of day.
 */
export function getTimeScore(hour) {
  if (hour === 10 || hour === 11) return 1.00; // PRIME morning
  if (hour === 16)                return 1.00; // PRIME afternoon
  if (hour === 8 || hour === 15)  return 0.80; // GOOD
  if (hour === 9)                 return 0.75; // GOOD
  if (hour === 14 || hour === 17) return 0.70; // FAIR
  if (hour === 7 || hour === 13 || hour === 18) return 0.55; // FAIR
  if (hour === 12)                return 0.30; // AVOID lunch
  if (hour === 19)                return 0.40; // evening
  if (hour === 6 || hour === 20)  return 0.20; // POOR
  return 0.05; // outside hours
}

/**
 * Compute a 0–100 calling quality score for a business right now.
 */
export function getCallingScore(city, countryCode, atTime = new Date()) {
  const legalCheck = isLegalToCall(city, countryCode, atTime);
  const timezone = legalCheck.timezone;
  const timeInfo = legalCheck.localTime;

  if (!legalCheck.isLegal) {
    return {
      score: 0,
      status: 'blocked',
      label: legalCheck.reason.includes('holiday') || legalCheck.reason.includes('Sunday')
        ? '⛔ Illegal to call'
        : '🔴 Outside hours',
      color: '#ef4444',
      localTime: timeInfo,
      timezone,
      isLegal: false,
      legalWindow: legalCheck.legalWindow,
      nextPrimeWindow: getNextPrimeWindow(city, countryCode, atTime),
    };
  }

  const dayScore  = DAY_SCORES[timeInfo.dayOfWeek] ?? 0;
  const timeScore = getTimeScore(timeInfo.hour);
  const rawScore  = Math.round(dayScore * timeScore * 100);

  let status, label, color;
  if (rawScore >= 80) {
    status = 'prime';   label = '🟢 Prime time'; color = '#22c55e';
  } else if (rawScore >= 60) {
    status = 'good';    label = '🟡 Good time';  color = '#eab308';
  } else if (rawScore >= 40) {
    status = 'fair';    label = '🟠 Off-peak';   color = '#f97316';
  } else if (rawScore >= 10) {
    status = 'poor';    label = '🔵 Low chance'; color = '#3b82f6';
  } else {
    status = 'blocked'; label = '🔴 Do not call';color = '#ef4444';
  }

  return {
    score: rawScore,
    status,
    label,
    color,
    localTime: timeInfo,
    timezone,
    isLegal: true,
    legalWindow: legalCheck.legalWindow,
    nextPrimeWindow: status !== 'prime' ? getNextPrimeWindow(city, countryCode, atTime) : null,
  };
}

/**
 * Find the next prime calling window (score >= 80) within 7 days.
 * Steps in 30-minute increments.
 */
export function getNextPrimeWindow(city, countryCode, fromTime = new Date()) {
  const timezone = getBusinessTimezone(city, countryCode);
  const MAX_HOURS = 7 * 24;

  for (let minutes = 30; minutes <= MAX_HOURS * 60; minutes += 30) {
    const testTime = new Date(fromTime.getTime() + minutes * 60 * 1000);
    const legalCheck = isLegalToCall(city, countryCode, testTime);
    if (!legalCheck.isLegal) continue;

    const timeInfo = legalCheck.localTime;
    const dayScore  = DAY_SCORES[timeInfo.dayOfWeek] ?? 0;
    const timeScore = getTimeScore(timeInfo.hour);
    const score     = dayScore * timeScore * 100;

    if (score >= 80) {
      const hoursFromNow = minutes / 60;
      const isToday    = hoursFromNow < 24 && new Date(fromTime).toDateString() === new Date(testTime).toDateString();
      const isTomorrow = !isToday && hoursFromNow < 36;

      const h12  = timeInfo.hour % 12 || 12;
      const ampm = timeInfo.hour < 12 ? 'AM' : 'PM';
      const timeStr = `${h12}:00 ${ampm}`;

      let label;
      if (isToday)    label = `Today at ${timeStr}`;
      else if (isTomorrow) label = `Tomorrow at ${timeStr}`;
      else            label = `${timeInfo.dayAbbr} at ${timeStr}`;

      return {
        startsAt: testTime,
        timezone,
        label,
        isToday,
        isTomorrow,
        hoursFromNow: Math.round(hoursFromNow * 10) / 10,
      };
    }
  }

  return null;
}

/**
 * Get timezone abbreviation (e.g. "AEST", "EDT", "BST").
 */
export function getTimezoneAbbreviation(timezone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

/**
 * Convenience: "10:24 AM · Sydney, AEST"
 */
export function formatLocalTime(city, countryCode) {
  const timezone = getBusinessTimezone(city, countryCode);
  const timeInfo = getCurrentTimeInTimezone(timezone);
  const abbr = getTimezoneAbbreviation(timezone);
  const cityDisplay = city ? city.split(',')[0].trim() : countryCode;
  return `${timeInfo.timeString} · ${cityDisplay}${abbr ? ', ' + abbr : ''}`;
}

/**
 * Generate a 7-day calling quality forecast for a business.
 * Returns array of 7 day objects.
 */
export function getWeekForecast(city, countryCode, fromDate = new Date()) {
  const timezone = getBusinessTimezone(city, countryCode);
  const forecast = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const dayStart = new Date(fromDate);
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(0, 0, 0, 0);

    let bestScore = 0;
    let bestHour = null;

    // Scan each hour of the day for the peak score
    for (let h = 6; h <= 21; h++) {
      // Build a candidate date: use the day + hour in local terms
      const candidate = new Date(dayStart);
      candidate.setHours(h, 0, 0, 0);

      const legalCheck = isLegalToCall(city, countryCode, candidate);
      if (!legalCheck.isLegal) continue;

      const timeInfo = legalCheck.localTime;
      const score = DAY_SCORES[timeInfo.dayOfWeek] * getTimeScore(timeInfo.hour) * 100;

      if (score > bestScore) {
        bestScore = score;
        bestHour = h;
      }
    }

    // Get day info from the timezone perspective
    let zonedDay;
    try {
      zonedDay = toZonedTime(dayStart, timezone);
    } catch {
      zonedDay = dayStart;
    }
    const dow = zonedDay.getDay();
    const dayAbbr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = `${zonedDay.getDate()} ${monthNames[zonedDay.getMonth()]}`;

    const holiday = isPublicHoliday(zonedDay, countryCode);
    const legalRule = LEGAL_CALLING_HOURS[countryCode];
    const dayType = holiday ? 'holiday' : dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday';
    const rule = legalRule[dayType];

    const fmt = (h) => {
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 || 12;
      return `${h12} ${ampm}`;
    };
    const legalWindow = rule.allowed ? `${fmt(rule.start)} – ${fmt(rule.end)}` : 'Not permitted';

    let status, color;
    if (!rule.allowed || bestScore < 10) { status = 'blocked'; color = '#ef4444'; }
    else if (bestScore >= 80) { status = 'prime'; color = '#22c55e'; }
    else if (bestScore >= 60) { status = 'good';  color = '#eab308'; }
    else if (bestScore >= 40) { status = 'fair';  color = '#f97316'; }
    else { status = 'poor'; color = '#3b82f6'; }

    let peakTimeLabel = '-';
    if (bestHour !== null && rule.allowed) {
      const h12 = bestHour % 12 || 12;
      const ampm = bestHour < 12 ? 'AM' : 'PM';
      peakTimeLabel = `${h12}:00 ${ampm}`;
    }

    forecast.push({
      dayName: dayAbbr,
      date: dateStr,
      isToday: dayOffset === 0,
      peakScore: Math.round(bestScore),
      peakTime: peakTimeLabel,
      status,
      color,
      legalWindow,
      isWeekend: dow === 0 || dow === 6,
      isHoliday: holiday,
    });
  }

  return forecast;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE CACHE (5-minute TTL, invalidated on minute boundary)
// ─────────────────────────────────────────────────────────────────────────────

const _scoreCache = new Map(); // key → { score, cachedAt, minuteBoundary }

export function getCallingScoreCached(city, countryCode) {
  const key = `${city}::${countryCode}`;
  const now = new Date();
  const currentMinute = Math.floor(now.getTime() / 60000);
  const cached = _scoreCache.get(key);

  if (cached && cached.minuteBoundary === currentMinute) {
    return cached.score;
  }

  const score = getCallingScore(city, countryCode);
  _scoreCache.set(key, { score, cachedAt: now, minuteBoundary: currentMinute });
  return score;
}

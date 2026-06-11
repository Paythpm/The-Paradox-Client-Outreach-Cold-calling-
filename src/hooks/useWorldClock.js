/**
 * useWorldClock — Efficient shared world clock hook.
 * Uses a single module-level interval shared across all consumers.
 * Multiple components can subscribe without creating redundant timers.
 */
import { useState, useEffect } from 'react';
import { getCurrentTimeInTimezone, getCallingScore, getTimezoneAbbreviation } from '../utils/callingHours';

// ── Module-level shared state ─────────────────────────────────────────────────
const COUNTRY_TIMEZONES = {
  AU: 'Australia/Sydney',
  CA: 'America/Toronto',
  UK: 'Europe/London',
  US: 'America/New_York',
};

const COUNTRY_CITIES = {
  AU: { city: 'Sydney',  countryCode: 'AU' },
  CA: { city: 'Toronto', countryCode: 'CA' },
  UK: { city: 'London',  countryCode: 'UK' },
  US: { city: 'New York', countryCode: 'US' },
};

let _intervalId = null;
let _refCount = 0;
let _listeners = new Set();
let _clockData = null;

function buildClockData() {
  const now = new Date();
  const result = {
    local: {
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  };

  for (const [cc, tz] of Object.entries(COUNTRY_TIMEZONES)) {
    const timeInfo = getCurrentTimeInTimezone(tz);
    const abbr = getTimezoneAbbreviation(tz, now);
    const { city, countryCode } = COUNTRY_CITIES[cc];
    const status = getCallingScore(city, countryCode, now);

    result[cc] = {
      time: timeInfo.timeString,
      day: timeInfo.dayAbbr,
      dateString: timeInfo.dateString,
      fullDisplay: `${timeInfo.dayAbbr} · ${timeInfo.timeString} ${abbr}`,
      timezone: tz,
      abbr,
      status,
    };
  }

  return result;
}

function tick() {
  _clockData = buildClockData();
  _listeners.forEach(fn => fn(_clockData));
}

function subscribe(fn) {
  _listeners.add(fn);
  _refCount++;
  if (!_intervalId) {
    _clockData = buildClockData();
    _intervalId = setInterval(tick, 1000);
  }
  // Send current data immediately
  if (_clockData) fn(_clockData);
}

function unsubscribe(fn) {
  _listeners.delete(fn);
  _refCount--;
  if (_refCount <= 0 && _intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    _refCount = 0;
  }
}

// ── React hook ────────────────────────────────────────────────────────────────
export function useWorldClock() {
  const [clockData, setClockData] = useState(() => _clockData || buildClockData());

  useEffect(() => {
    subscribe(setClockData);
    return () => unsubscribe(setClockData);
  }, []);

  return clockData;
}

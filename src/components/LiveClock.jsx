import React, { useState, useEffect } from 'react';
import { getCurrentTimeInTimezone, getBusinessTimezone, getTimezoneAbbreviation } from '../utils/callingHours';

/**
 * LiveClock — Live-updating clock for a business's local timezone.
 * Updates every second. Clean up interval on unmount.
 */
export default function LiveClock({ city, countryCode, format = 'time-only', style = {} }) {
  const [timeInfo, setTimeInfo] = useState(null);

  useEffect(() => {
    if (!city && !countryCode) return;

    const update = () => {
      const tz = getBusinessTimezone(city, countryCode);
      setTimeInfo({ ...getCurrentTimeInTimezone(tz), tz, abbr: getTimezoneAbbreviation(tz) });
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [city, countryCode]);

  if (!timeInfo) return null;

  if (format === 'time-only') {
    return (
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--text2)', ...style }}>
        {timeInfo.timeString}
      </span>
    );
  }

  // format === 'full'
  return (
    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text3)', ...style }}>
      {timeInfo.dayAbbr} · {timeInfo.timeString}{timeInfo.abbr ? ' ' + timeInfo.abbr : ''}
    </span>
  );
}

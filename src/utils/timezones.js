export const COUNTRY_TIMEZONES = {
  AU: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart'],
  CA: ['America/Toronto', 'America/Vancouver', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Edmonton', 'America/Regina', 'America/Montreal'],
  UK: ['Europe/London'],
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu'],
};

export function getCityTimezone(city, countryCode) {
  const c = (city || '').toLowerCase();
  if (countryCode === 'AU') {
    if (['brisbane','gold coast','sunshine coast','cairns','townsville','toowoomba'].some(x => c.includes(x))) return 'Australia/Brisbane';
    if (['perth','fremantle','bunbury','geraldton','mandurah'].some(x => c.includes(x))) return 'Australia/Perth';
    if (['adelaide','norwood','unley','victor harbor','port augusta'].some(x => c.includes(x))) return 'Australia/Adelaide';
    if (['darwin','alice springs'].some(x => c.includes(x))) return 'Australia/Darwin';
    if (['hobart','launceston'].some(x => c.includes(x))) return 'Australia/Hobart';
    return 'Australia/Sydney';
  }
  if (countryCode === 'CA') {
    if (['vancouver','victoria','kelowna','burnaby','surrey','richmond'].some(x => c.includes(x))) return 'America/Vancouver';
    if (['calgary','edmonton','lethbridge','red deer'].some(x => c.includes(x))) return 'America/Edmonton';
    if (['winnipeg','brandon'].some(x => c.includes(x))) return 'America/Winnipeg';
    if (['regina','saskatoon'].some(x => c.includes(x))) return 'America/Regina';
    if (['halifax','dartmouth','moncton','fredericton'].some(x => c.includes(x))) return 'America/Halifax';
    if (["st. john's",'corner brook'].some(x => c.includes(x))) return 'America/St_Johns';
    if (['montreal','quebec','laval','gatineau','sherbrooke'].some(x => c.includes(x))) return 'America/Montreal';
    return 'America/Toronto';
  }
  if (countryCode === 'UK') return 'Europe/London';
  if (countryCode === 'US') {
    // Pacific
    if (['los angeles','san diego','san francisco','san jose','seattle','portland','las vegas','sacramento','fresno','oakland','long beach','anaheim','riverside','irvine','santa ana','bakersfield','stockton','tacoma','spokane','henderson','reno'].some(x => c.includes(x))) return 'America/Los_Angeles';
    // Mountain (no DST)
    if (['phoenix','tucson','mesa','chandler','scottsdale','tempe'].some(x => c.includes(x))) return 'America/Phoenix';
    // Mountain
    if (['denver','colorado springs','aurora','fort collins','albuquerque','salt lake city','boise'].some(x => c.includes(x))) return 'America/Denver';
    // Central
    if (['chicago','houston','dallas','san antonio','austin','fort worth','memphis','louisville','minneapolis','milwaukee','kansas city','omaha','tulsa','oklahoma city','new orleans','st. louis','saint louis','wichita','nashville','el paso'].some(x => c.includes(x))) return 'America/Chicago';
    if (['indianapolis'].some(x => c.includes(x))) return 'America/Indiana/Indianapolis';
    // Alaska & Hawaii
    if (['anchorage','fairbanks','juneau'].some(x => c.includes(x))) return 'America/Anchorage';
    if (['honolulu'].some(x => c.includes(x))) return 'Pacific/Honolulu';
    // Eastern (default for US)
    return 'America/New_York';
  }
  return 'Europe/London';
}

export function formatMeetingTime(isoString, timezone) {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-AU', {
      timeZone: timezone,
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return isoString;
  }
}

export function getNextBusinessSlots(countryCode, timezone) {
  const slots = [];
  const now = new Date();

  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);

    // Skip weekends
    const dayOfWeek = day.toLocaleDateString('en-AU', { timeZone: timezone, weekday: 'short' });
    if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') continue;

    for (const hour of [9, 10, 11, 14, 15, 16]) {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);

      const label = slot.toLocaleString('en-AU', {
        timeZone: timezone,
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      slots.push({ label, value: slot.toISOString() });
    }

    if (slots.length >= 10) break;
  }

  return slots;
}

/**
 * cityTimezoneMap.js
 * Comprehensive city → IANA timezone mapping for all 377 cities
 * across US (102), AU (82), CA (90), UK (103).
 * 
 * Also exports: getCityTimezone(city, countryCode) — safe lookup with fallback
 */

// ─── FULL CITY → TIMEZONE MAP ─────────────────────────────────────────────────
// Keys are lowercase city name substrings for flexible matching

const CITY_TZ = {
  // ══════════════════════════════════════════════════════
  // UNITED STATES
  // ══════════════════════════════════════════════════════

  // Eastern (UTC-5/UTC-4 DST)
  'albany, ny':         'America/New_York',
  'baltimore, md':      'America/New_York',
  'bethesda, md':       'America/New_York',
  'boca raton, fl':     'America/New_York',
  'boston, ma':         'America/New_York',
  'brooklyn, ny':       'America/New_York',
  'buffalo, ny':        'America/New_York',
  'charleston, sc':     'America/New_York',
  'charlotte, nc':      'America/New_York',
  'cincinnati, oh':     'America/New_York',
  'cleveland, oh':      'America/New_York',
  'columbus, oh':       'America/New_York',
  'coral gables, fl':   'America/New_York',
  'detroit, mi':        'America/Detroit',
  'durham, nc':         'America/New_York',
  'evanston, il':       'America/Chicago',
  'fort lauderdale, fl':'America/New_York',
  'grand rapids, mi':   'America/Detroit',
  'greensboro, nc':     'America/New_York',
  'greenwich, ct':      'America/New_York',
  'hartford, ct':       'America/New_York',
  'jacksonville, fl':   'America/New_York',
  'jersey city, nj':    'America/New_York',
  'mclean, va':         'America/New_York',
  'miami, fl':          'America/New_York',
  'new york, ny':       'America/New_York',
  'newark, nj':         'America/New_York',
  'norfolk, va':        'America/New_York',
  'orlando, fl':        'America/New_York',
  'philadelphia, pa':   'America/New_York',
  'pittsburgh, pa':     'America/New_York',
  'providence, ri':     'America/New_York',
  'queens, ny':         'America/New_York',
  'raleigh, nc':        'America/New_York',
  'richmond, va':       'America/New_York',
  'savannah, ga':       'America/New_York',
  'stamford, ct':       'America/New_York',
  'staten island, ny':  'America/New_York',
  'st. petersburg, fl': 'America/New_York',
  'syracuse, ny':       'America/New_York',
  'tampa, fl':          'America/New_York',
  'the bronx, ny':      'America/New_York',
  'virginia beach, va': 'America/New_York',
  'washington, dc':     'America/New_York',
  'westchester, ny':    'America/New_York',
  'atlanta, ga':        'America/New_York',
  'sandy springs, ga':  'America/New_York',
  'tysons, va':         'America/New_York',
  'naperville, il':     'America/Chicago',

  // Central (UTC-6/UTC-5 DST)
  'austin, tx':         'America/Chicago',
  'chicago, il':        'America/Chicago',
  'dallas, tx':         'America/Chicago',
  'des moines, ia':     'America/Chicago',
  'el paso, tx':        'America/Chicago',
  'fort worth, tx':     'America/Chicago',
  'frisco, tx':         'America/Chicago',
  'houston, tx':        'America/Chicago',
  'kansas city, mo':    'America/Chicago',
  'louisville, ky':     'America/Chicago', // Note: KY is Eastern, Louisville is Eastern
  'madison, wi':        'America/Chicago',
  'memphis, tn':        'America/Chicago',
  'milwaukee, wi':      'America/Chicago',
  'minneapolis, mn':    'America/Chicago',
  'nashville, tn':      'America/Chicago',
  'new orleans, la':    'America/Chicago',
  'oklahoma city, ok':  'America/Chicago',
  'omaha, ne':          'America/Chicago',
  'san antonio, tx':    'America/Chicago',
  'st. louis, mo':      'America/Chicago',
  'tulsa, ok':          'America/Chicago',
  'wichita, ks':        'America/Chicago',
  'indianapolis, in':   'America/Indiana/Indianapolis',

  // Mountain (UTC-7/UTC-6 DST)
  'albuquerque, nm':    'America/Denver',
  'boise, id':          'America/Boise',
  'boulder, co':        'America/Denver',
  'colorado springs, co':'America/Denver',
  'denver, co':         'America/Denver',
  'fort collins, co':   'America/Denver',
  'provo, ut':          'America/Denver',
  'salt lake city, ut': 'America/Denver',

  // Arizona — NO DST
  'mesa, az':           'America/Phoenix',
  'phoenix, az':        'America/Phoenix',
  'scottsdale, az':     'America/Phoenix',
  'tempe, az':          'America/Phoenix',
  'tucson, az':         'America/Phoenix',

  // Pacific (UTC-8/UTC-7 DST)
  'anaheim, ca':        'America/Los_Angeles',
  'bellevue, wa':       'America/Los_Angeles',
  'beverly hills, ca':  'America/Los_Angeles',
  'long beach, ca':     'America/Los_Angeles',
  'los angeles, ca':    'America/Los_Angeles',
  'missoula, mt':       'America/Denver',
  'oakland, ca':        'America/Los_Angeles',
  'pasadena, ca':       'America/Los_Angeles',
  'portland, or':       'America/Los_Angeles',
  'riverside, ca':      'America/Los_Angeles',
  'sacramento, ca':     'America/Los_Angeles',
  'san diego, ca':      'America/Los_Angeles',
  'san francisco, ca':  'America/Los_Angeles',
  'san jose, ca':       'America/Los_Angeles',
  'santa monica, ca':   'America/Los_Angeles',
  'seattle, wa':        'America/Los_Angeles',
  'spokane, wa':        'America/Los_Angeles',

  // Louisville is actually Eastern
  // (override the central assignment above)
  // Louisville KY is Eastern Time
  //  → handled by substring match below

  // ══════════════════════════════════════════════════════
  // AUSTRALIA
  // ══════════════════════════════════════════════════════

  // NSW/ACT — Sydney time (UTC+10/+11)
  'albury, nsw':        'Australia/Sydney',
  'blacktown, nsw':     'Australia/Sydney',
  'bondi, nsw':         'Australia/Sydney',
  'campbelltown, nsw':  'Australia/Sydney',
  'castle hill, nsw':   'Australia/Sydney',
  'central coast, nsw': 'Australia/Sydney',
  'chatswood, nsw':     'Australia/Sydney',
  'coffs harbour, nsw': 'Australia/Sydney',
  'dee why, nsw':       'Australia/Sydney',
  'dubbo, nsw':         'Australia/Sydney',
  'hornsby, nsw':       'Australia/Sydney',
  'hurstville, nsw':    'Australia/Sydney',
  'liverpool, nsw':     'Australia/Sydney',
  'macquarie park, nsw':'Australia/Sydney',
  'maitland, nsw':      'Australia/Sydney',
  'manly, nsw':         'Australia/Sydney',
  'newcastle, nsw':     'Australia/Sydney',
  'orange, nsw':        'Australia/Sydney',
  'parramatta, nsw':    'Australia/Sydney',
  'penrith, nsw':       'Australia/Sydney',
  'sutherland, nsw':    'Australia/Sydney',
  'sydney, nsw':        'Australia/Sydney',
  'tamworth, nsw':      'Australia/Sydney',
  'wagga wagga, nsw':   'Australia/Sydney',
  'wollongong, nsw':    'Australia/Sydney',
  'canberra, act':      'Australia/Sydney',
  'belconnen, act':     'Australia/Sydney',
  'tuggeranong, act':   'Australia/Sydney',
  'woden, act':         'Australia/Sydney',

  // VIC — Melbourne time (UTC+10/+11, same zone as Sydney)
  'ballarat, vic':      'Australia/Melbourne',
  'bendigo, vic':       'Australia/Melbourne',
  'box hill, vic':      'Australia/Melbourne',
  'brighton, vic':      'Australia/Melbourne',
  'clayton, vic':       'Australia/Melbourne',
  'dandenong, vic':     'Australia/Melbourne',
  'doncaster, vic':     'Australia/Melbourne',
  'fitzroy, vic':       'Australia/Melbourne',
  'frankston, vic':     'Australia/Melbourne',
  'geelong, vic':       'Australia/Melbourne',
  'melbourne, vic':     'Australia/Melbourne',
  'mildura, vic':       'Australia/Melbourne',
  'richmond, vic':      'Australia/Melbourne',
  'ringwood, vic':      'Australia/Melbourne',
  'shepparton, vic':    'Australia/Melbourne',
  'south yarra, vic':   'Australia/Melbourne',
  'st kilda, vic':      'Australia/Melbourne',
  'toorak, vic':        'Australia/Melbourne',
  'werribee, vic':      'Australia/Melbourne',

  // QLD — Brisbane time (UTC+10, NO DST)
  'brisbane, qld':      'Australia/Brisbane',
  'bundaberg, qld':     'Australia/Brisbane',
  'cairns, qld':        'Australia/Brisbane',
  'gold coast, qld':    'Australia/Brisbane',
  'ipswich, qld':       'Australia/Brisbane',
  'logan, qld':         'Australia/Brisbane',
  'mackay, qld':        'Australia/Brisbane',
  'moreton bay, qld':   'Australia/Brisbane',
  'redlands, qld':      'Australia/Brisbane',
  'rockhampton, qld':   'Australia/Brisbane',
  'sunshine coast, qld':'Australia/Brisbane',
  'toowoomba, qld':     'Australia/Brisbane',
  'townsville, qld':    'Australia/Brisbane',

  // SA — Adelaide time (UTC+9:30/+10:30)
  'adelaide, sa':       'Australia/Adelaide',
  'mount barker, sa':   'Australia/Adelaide',
  'norwood, sa':        'Australia/Adelaide',
  'prospect, sa':       'Australia/Adelaide',
  'unley, sa':          'Australia/Adelaide',
  'victor harbor, sa':  'Australia/Adelaide',

  // WA — Perth time (UTC+8, NO DST)
  'armadale, wa':       'Australia/Perth',
  'bunbury, wa':        'Australia/Perth',
  'fremantle, wa':      'Australia/Perth',
  'geraldton, wa':      'Australia/Perth',
  'joondalup, wa':      'Australia/Perth',
  'mandurah, wa':       'Australia/Perth',
  'perth, wa':          'Australia/Perth',
  'rockingham, wa':     'Australia/Perth',
  'stirling, wa':       'Australia/Perth',
  'wanneroo, wa':       'Australia/Perth',

  // TAS — Hobart time (UTC+10/+11)
  'devonport, tas':     'Australia/Hobart',
  'hobart, tas':        'Australia/Hobart',
  'launceston, tas':    'Australia/Hobart',

  // NT — Darwin time (UTC+9:30, NO DST)
  'alice springs, nt':  'Australia/Darwin',
  'darwin, nt':         'Australia/Darwin',

  // ══════════════════════════════════════════════════════
  // CANADA
  // ══════════════════════════════════════════════════════

  // Eastern (UTC-5/UTC-4 DST)
  'ajax, on':           'America/Toronto',
  'aurora, on':         'America/Toronto',
  'barrie, on':         'America/Toronto',
  'brampton, on':       'America/Toronto',
  'brantford, on':      'America/Toronto',
  'burlington, on':     'America/Toronto',
  'cambridge, on':      'America/Toronto',
  'east york, on':      'America/Toronto',
  'etobicoke, on':      'America/Toronto',
  'guelph, on':         'America/Toronto',
  'hamilton, on':       'America/Toronto',
  'kingston, on':       'America/Toronto',
  'kitchener, on':      'America/Toronto',
  'london, on':         'America/Toronto',
  'markham, on':        'America/Toronto',
  'mississauga, on':    'America/Toronto',
  'newmarket, on':      'America/Toronto',
  'niagara falls, on':  'America/Toronto',
  'north york, on':     'America/Toronto',
  'oakville, on':       'America/Toronto',
  'oshawa, on':         'America/Toronto',
  'ottawa, on':         'America/Toronto',
  'peterborough, on':   'America/Toronto',
  'pickering, on':      'America/Toronto',
  'richmond hill, on':  'America/Toronto',
  'scarborough, on':    'America/Toronto',
  'st. catharines, on': 'America/Toronto',
  'sudbury, on':        'America/Toronto',
  'thunder bay, on':    'America/Toronto',
  'toronto, on':        'America/Toronto',
  'vaughan, on':        'America/Toronto',
  'waterloo, on':       'America/Toronto',
  'windsor, on':        'America/Toronto',
  'brossard, qc':       'America/Toronto',
  'gatineau, qc':       'America/Toronto',
  'laval, qc':          'America/Toronto',
  'levis, qc':          'America/Toronto',
  'longueuil, qc':      'America/Toronto',
  'montreal, qc':       'America/Montreal',
  'quebec city, qc':    'America/Toronto',
  'repentigny, qc':     'America/Toronto',
  'saguenay, qc':       'America/Toronto',
  'saint-jean-sur-richelieu, qc': 'America/Toronto',
  'sherbrooke, qc':     'America/Toronto',
  'terrebonne, qc':     'America/Toronto',
  'trois-rivieres, qc': 'America/Toronto',
  // Atlantic
  'charlottetown, pe':  'America/Halifax',
  'dartmouth, ns':      'America/Halifax',
  'fredericton, nb':    'America/Halifax',
  'halifax, ns':        'America/Halifax',
  'moncton, nb':        'America/Halifax',
  'saint john, nb':     'America/Halifax',
  'sydney, ns':         'America/Halifax',
  // Newfoundland
  "st. john's, nl":     'America/St_Johns',
  // Central
  'brandon, mb':        'America/Winnipeg',
  'winnipeg, mb':       'America/Winnipeg',
  'moose jaw, sk':      'America/Regina',
  'prince albert, sk':  'America/Regina',
  'regina, sk':         'America/Regina',
  'saskatoon, sk':      'America/Regina',
  // Mountain
  'airdrie, ab':        'America/Edmonton',
  'calgary, ab':        'America/Edmonton',
  'edmonton, ab':       'America/Edmonton',
  'grande prairie, ab': 'America/Edmonton',
  'leduc, ab':          'America/Edmonton',
  'lethbridge, ab':     'America/Edmonton',
  'medicine hat, ab':   'America/Edmonton',
  'red deer, ab':       'America/Edmonton',
  'spruce grove, ab':   'America/Edmonton',
  'st. albert, ab':     'America/Edmonton',
  // Pacific
  'abbotsford, bc':     'America/Vancouver',
  'burnaby, bc':        'America/Vancouver',
  'chilliwack, bc':     'America/Vancouver',
  'coquitlam, bc':      'America/Vancouver',
  'delta, bc':          'America/Vancouver',
  'kamloops, bc':       'America/Vancouver',
  'kelowna, bc':        'America/Vancouver',
  'langley, bc':        'America/Vancouver',
  'maple ridge, bc':    'America/Vancouver',
  'nanaimo, bc':        'America/Vancouver',
  'new westminster, bc':'America/Vancouver',
  'north vancouver, bc':'America/Vancouver',
  'port moody, bc':     'America/Vancouver',
  'richmond, bc':       'America/Vancouver',
  'surrey, bc':         'America/Vancouver',
  'vancouver, bc':      'America/Vancouver',
  'victoria, bc':       'America/Vancouver',
  'west vancouver, bc': 'America/Vancouver',
  // Territories
  'whitehorse, yt':     'America/Whitehorse',
  'yellowknife, nt':    'America/Yellowknife',

  // ══════════════════════════════════════════════════════
  // UNITED KINGDOM — all Europe/London
  // ══════════════════════════════════════════════════════
  'aberdeen, scotland':   'Europe/London',
  'basingstoke, england': 'Europe/London',
  'bath, england':        'Europe/London',
  'belfast, northern ireland': 'Europe/London',
  'birkenhead, england':  'Europe/London',
  'birmingham, england':  'Europe/London',
  'blackpool, england':   'Europe/London',
  'bolton, england':      'Europe/London',
  'bournemouth, england': 'Europe/London',
  'bradford, england':    'Europe/London',
  'brighton, england':    'Europe/London',
  'bristol, england':     'Europe/London',
  'brixton, london':      'Europe/London',
  'cambridge, england':   'Europe/London',
  'camden, london':       'Europe/London',
  'canary wharf, london': 'Europe/London',
  'canterbury, england':  'Europe/London',
  'cardiff, wales':       'Europe/London',
  'chelmsford, england':  'Europe/London',
  'chelsea, london':      'Europe/London',
  'cheltenham, england':  'Europe/London',
  'chester, england':     'Europe/London',
  'colchester, england':  'Europe/London',
  'coventry, england':    'Europe/London',
  'crawley, england':     'Europe/London',
  'croydon, london':      'Europe/London',
  'derby, england':       'Europe/London',
  'derry, northern ireland': 'Europe/London',
  'doncaster, england':   'Europe/London',
  'dudley, england':      'Europe/London',
  'dundee, scotland':     'Europe/London',
  'durham, england':      'Europe/London',
  'ealing, london':       'Europe/London',
  'edinburgh, scotland':  'Europe/London',
  'exeter, england':      'Europe/London',
  'gateshead, england':   'Europe/London',
  'glasgow, scotland':    'Europe/London',
  'gloucester, england':  'Europe/London',
  'guildford, england':   'Europe/London',
  'hackney, london':      'Europe/London',
  'hammersmith, london':  'Europe/London',
  'harrogate, england':   'Europe/London',
  'hove, england':        'Europe/London',
  'huddersfield, england':'Europe/London',
  'hull, england':        'Europe/London',
  'inverness, scotland':  'Europe/London',
  'ipswich, england':     'Europe/London',
  'islington, london':    'Europe/London',
  'kensington, london':   'Europe/London',
  'lancaster, england':   'Europe/London',
  'leeds, england':       'Europe/London',
  'leicester, england':   'Europe/London',
  'lincoln, england':     'Europe/London',
  'lisburn, northern ireland': 'Europe/London',
  'liverpool, england':   'Europe/London',
  'london, england':      'Europe/London',
  'luton, england':       'Europe/London',
  'maidstone, england':   'Europe/London',
  'manchester, england':  'Europe/London',
  'middlesbrough, england':'Europe/London',
  'newcastle upon tyne, england': 'Europe/London',
  'newport, wales':       'Europe/London',
  'newry, northern ireland': 'Europe/London',
  'northampton, england': 'Europe/London',
  'norwich, england':     'Europe/London',
  'nottingham, england':  'Europe/London',
  'oldham, england':      'Europe/London',
  'oxford, england':      'Europe/London',
  'perth, scotland':      'Europe/London',
  'peterborough, england':'Europe/London',
  'plymouth, england':    'Europe/London',
  'portsmouth, england':  'Europe/London',
  'preston, england':     'Europe/London',
  'reading, england':     'Europe/London',
  'richmond, london':     'Europe/London',
  'rotherham, england':   'Europe/London',
  'salford, england':     'Europe/London',
  'sheffield, england':   'Europe/London',
  'shoreditch, london':   'Europe/London',
  'solihull, england':    'Europe/London',
  'southampton, england': 'Europe/London',
  'st albans, england':   'Europe/London',
  'stirling, scotland':   'Europe/London',
  'stockport, england':   'Europe/London',
  'stoke-on-trent, england': 'Europe/London',
  'sunderland, england':  'Europe/London',
  'sutton coldfield, england': 'Europe/London',
  'swansea, wales':       'Europe/London',
  'swindon, england':     'Europe/London',
  'taunton, england':     'Europe/London',
  'tunbridge wells, england': 'Europe/London',
  'wakefield, england':   'Europe/London',
  'walsall, england':     'Europe/London',
  'warrington, england':  'Europe/London',
  'westminster, london':  'Europe/London',
  'wigan, england':       'Europe/London',
  'wimbledon, london':    'Europe/London',
  'woking, england':      'Europe/London',
  'wolverhampton, england':'Europe/London',
  'worcester, england':   'Europe/London',
  'worthing, england':    'Europe/London',
  'wrexham, wales':       'Europe/London',
  'york, england':        'Europe/London',
};

// Louisville KY override — it's Eastern not Central
CITY_TZ['louisville, ky'] = 'America/New_York';

// ─── Country defaults ─────────────────────────────────────────────────────────
const COUNTRY_DEFAULT_TZ = {
  US: 'America/New_York',
  AU: 'Australia/Sydney',
  CA: 'America/Toronto',
  UK: 'Europe/London',
};

// ─── Lookup function ──────────────────────────────────────────────────────────
/**
 * Get IANA timezone for a city/country combination.
 * Tries exact match first, then substring match, then country default.
 * 
 * @param {string} city  — raw city string from data (e.g. "Bondi, NSW" or "Sydney")
 * @param {string} country — 'US'|'AU'|'CA'|'UK'
 * @returns {string} IANA timezone string
 */
function getCityTimezone(city, country) {
  if (!city) return COUNTRY_DEFAULT_TZ[country] || 'UTC';

  const cityLower = city.toLowerCase().trim();

  // 1. Exact match
  if (CITY_TZ[cityLower]) return CITY_TZ[cityLower];

  // 2. Substring match — longer keys first to avoid false positives
  const keys = Object.keys(CITY_TZ).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (cityLower.includes(key) || key.includes(cityLower)) {
      return CITY_TZ[key];
    }
  }

  // 3. State/province code fallback for AU and CA
  if (country === 'AU') {
    if (/\bnsw\b|\bact\b/i.test(city)) return 'Australia/Sydney';
    if (/\bvic\b/i.test(city)) return 'Australia/Melbourne';
    if (/\bqld\b/i.test(city)) return 'Australia/Brisbane';
    if (/\bsa\b/i.test(city)) return 'Australia/Adelaide';
    if (/\bwa\b/i.test(city)) return 'Australia/Perth';
    if (/\btas\b/i.test(city)) return 'Australia/Hobart';
    if (/\bnt\b/i.test(city)) return 'Australia/Darwin';
  }

  if (country === 'CA') {
    if (/\bon\b|\bqc\b/i.test(city)) return 'America/Toronto';
    if (/\bbc\b/i.test(city)) return 'America/Vancouver';
    if (/\bab\b/i.test(city)) return 'America/Edmonton';
    if (/\bmb\b/i.test(city)) return 'America/Winnipeg';
    if (/\bsk\b/i.test(city)) return 'America/Regina';
    if (/\bns\b|\bnb\b|\bpe\b/i.test(city)) return 'America/Halifax';
    if (/\bnl\b/i.test(city)) return 'America/St_Johns';
  }

  if (country === 'US') {
    // State code fallback
    const stateMap = {
      'ny': 'America/New_York', 'nj': 'America/New_York', 'pa': 'America/New_York',
      'ma': 'America/New_York', 'ct': 'America/New_York', 'ri': 'America/New_York',
      'me': 'America/New_York', 'nh': 'America/New_York', 'vt': 'America/New_York',
      'dc': 'America/New_York', 'md': 'America/New_York', 'de': 'America/New_York',
      'va': 'America/New_York', 'wv': 'America/New_York', 'nc': 'America/New_York',
      'sc': 'America/New_York', 'ga': 'America/New_York', 'fl': 'America/New_York',
      'oh': 'America/New_York', 'mi': 'America/Detroit', 'in': 'America/Indiana/Indianapolis',
      'ky': 'America/New_York', 'tn': 'America/Chicago',
      'il': 'America/Chicago', 'wi': 'America/Chicago', 'mn': 'America/Chicago',
      'ia': 'America/Chicago', 'mo': 'America/Chicago', 'nd': 'America/Chicago',
      'sd': 'America/Chicago', 'ne': 'America/Chicago', 'ks': 'America/Chicago',
      'ok': 'America/Chicago', 'tx': 'America/Chicago', 'ar': 'America/Chicago',
      'la': 'America/Chicago', 'ms': 'America/Chicago', 'al': 'America/Chicago',
      'mt': 'America/Denver', 'id': 'America/Boise', 'wy': 'America/Denver',
      'co': 'America/Denver', 'nm': 'America/Denver', 'ut': 'America/Denver',
      'az': 'America/Phoenix', 'nv': 'America/Los_Angeles',
      'ca': 'America/Los_Angeles', 'or': 'America/Los_Angeles', 'wa': 'America/Los_Angeles',
      'ak': 'America/Anchorage', 'hi': 'Pacific/Honolulu',
    };
    const stateMatch = city.match(/,\s*([A-Z]{2})$/);
    if (stateMatch) {
      const st = stateMatch[1].toLowerCase();
      if (stateMap[st]) return stateMap[st];
    }
  }

  // 4. Country default
  return COUNTRY_DEFAULT_TZ[country] || 'UTC';
}

module.exports = { getCityTimezone, CITY_TZ, COUNTRY_DEFAULT_TZ };

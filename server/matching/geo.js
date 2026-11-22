// US geography: states, abbreviations, a few cities, and regions.
// parseGeo(text) finds places named in a query or profile; locationState(location) maps a
// LinkedIn-style location string ("Concord, New Hampshire, United States") to a state code.

export const STATES = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut',
  DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan',
  MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire',
  NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio',
  OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina', SD: 'south dakota',
  TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia',
  WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
};
const NAME_TO_CODE = Object.fromEntries(Object.entries(STATES).map(([c, n]) => [n, c]));

export const REGIONS = {
  'new england': ['ME', 'NH', 'VT', 'MA', 'RI', 'CT'],
  'northern new england': ['ME', 'NH', 'VT'],
  'northeast': ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA'],
  'mid atlantic': ['NY', 'NJ', 'PA', 'DE', 'MD', 'DC', 'VA'],
  'midwest': ['OH', 'IN', 'IL', 'MI', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'],
  'upper midwest': ['MN', 'WI', 'MI', 'IA', 'ND', 'SD'],
  'great lakes': ['MI', 'OH', 'IN', 'IL', 'WI', 'MN', 'NY', 'PA'],
  'great plains': ['ND', 'SD', 'NE', 'KS', 'OK', 'MT', 'WY', 'CO'],
  'plains': ['ND', 'SD', 'NE', 'KS', 'OK'],
  'corn belt': ['IA', 'IL', 'IN', 'NE', 'MN', 'OH'],
  'south': ['TX', 'OK', 'AR', 'LA', 'MS', 'AL', 'TN', 'KY', 'GA', 'FL', 'SC', 'NC', 'VA', 'WV'],
  'southeast': ['GA', 'FL', 'SC', 'NC', 'AL', 'MS', 'TN', 'VA'],
  'deep south': ['AL', 'MS', 'LA', 'GA', 'SC'],
  'delta': ['MS', 'AR', 'LA', 'TN', 'MO'],
  'appalachia': ['WV', 'KY', 'TN', 'VA', 'NC', 'OH', 'PA', 'AL', 'GA'],
  'central appalachia': ['WV', 'KY', 'VA', 'TN'],
  'southwest': ['AZ', 'NM', 'TX', 'OK', 'NV'],
  'mountain west': ['MT', 'ID', 'WY', 'CO', 'UT', 'NV', 'AZ', 'NM'],
  'rocky mountains': ['MT', 'ID', 'WY', 'CO', 'UT'],
  'pacific northwest': ['WA', 'OR', 'ID'],
  'west coast': ['CA', 'OR', 'WA'],
  'west': ['CA', 'OR', 'WA', 'NV', 'ID', 'MT', 'WY', 'UT', 'CO', 'AZ', 'NM'],
  'ozarks': ['MO', 'AR', 'OK'],
};

// A handful of cities and metro names that appear in LinkedIn locations without a state.
const CITIES = {
  boston: 'MA', 'greater boston': 'MA', worcester: 'MA', springfield: 'MA', 'new york city': 'NY', manchester: 'NH',
  concord: 'NH', nashua: 'NH', portsmouth: 'NH', keene: 'NH', burlington: 'VT', montpelier: 'VT', rutland: 'VT',
  portland: 'ME', bangor: 'ME', augusta: 'ME', providence: 'RI', hartford: 'CT', 'new haven': 'CT',
  'des moines': 'IA', 'cedar rapids': 'IA', 'sioux falls': 'SD', fargo: 'ND', madison: 'WI', milwaukee: 'WI',
  minneapolis: 'MN', 'st paul': 'MN', duluth: 'MN', omaha: 'NE', lincoln: 'NE', wichita: 'KS', columbus: 'OH',
  cleveland: 'OH', cincinnati: 'OH', athens: 'OH', indianapolis: 'IN', chicago: 'IL', detroit: 'MI',
  'grand rapids': 'MI', louisville: 'KY', lexington: 'KY', charleston: 'WV', morgantown: 'WV', huntington: 'WV',
  knoxville: 'TN', nashville: 'TN', chattanooga: 'TN', asheville: 'NC', raleigh: 'NC', charlotte: 'NC',
  roanoke: 'VA', richmond: 'VA', atlanta: 'GA', birmingham: 'AL', jackson: 'MS', 'little rock': 'AR',
  'new orleans': 'LA', denver: 'CO', boise: 'ID', missoula: 'MT', bozeman: 'MT', 'salt lake city': 'UT',
  albuquerque: 'NM', phoenix: 'AZ', seattle: 'WA', spokane: 'WA', 'san francisco': 'CA', 'bay area': 'CA',
  'los angeles': 'CA', pittsburgh: 'PA', philadelphia: 'PA', harrisburg: 'PA', albany: 'NY', buffalo: 'NY', syracuse: 'NY',
};

function norm(s) {
  return ` ${String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

const STATE_NAMES_SORTED = Object.keys(NAME_TO_CODE).sort((a, b) => b.length - a.length);
const REGION_NAMES_SORTED = Object.keys(REGIONS).sort((a, b) => b.length - a.length);
const CITY_NAMES_SORTED = Object.keys(CITIES).sort((a, b) => b.length - a.length);

/**
 * Find places named in free text. Returns { states: Set<code>, labels: string[], consumed: string[] }.
 * Two-letter abbreviations count only when written in capitals (so "in", "me", "or" are ignored).
 */
export function parseGeo(text) {
  const raw = String(text || '');
  let t = norm(raw);
  const states = new Set();
  const labels = [];
  const consumed = [];
  for (const r of REGION_NAMES_SORTED) {
    const key = ` ${r} `;
    if (t.includes(key)) {
      // "west" inside "west virginia" is not a region
      if (r === 'west' && / west virginia /.test(t)) continue;
      if (r === 'south' && / south (carolina|dakota) /.test(t)) continue;
      REGIONS[r].forEach((s) => states.add(s));
      labels.push(titleCase(r));
      consumed.push(r);
      t = t.split(key).join(' ');
    }
  }
  for (const n of STATE_NAMES_SORTED) {
    const key = ` ${n} `;
    if (t.includes(key)) {
      // "New York" could be the city too; either way it is NY.
      states.add(NAME_TO_CODE[n]);
      labels.push(titleCase(n));
      consumed.push(n);
      t = t.split(key).join(' ');
    }
  }
  for (const m of raw.matchAll(/\b([A-Z]{2})\b/g)) {
    const code = m[1];
    if (STATES[code] && !['IT', 'HR', 'PR', 'AI', 'OR', 'IN', 'ME', 'OK', 'HI', 'ID'].includes(code)) {
      states.add(code);
      labels.push(code);
      consumed.push(code.toLowerCase());
    } else if (['OR', 'IN', 'ME', 'OK', 'HI', 'ID'].includes(code) && /,\s*[A-Z]{2}\b|\bin [A-Z]{2}\b/.test(raw)) {
      // Accept ambiguous codes only in clearly geographic positions ("Bangor, ME").
      const ctx = new RegExp(`(,\\s*${code}\\b)|(\\bin ${code}\\b)`);
      if (ctx.test(raw)) { states.add(code); labels.push(code); consumed.push(code.toLowerCase()); }
    }
  }
  return { states, labels: [...new Set(labels)], consumed };
}

function titleCase(s) { return s.replace(/\b[a-z]/g, (c) => c.toUpperCase()); }

const locCache = new Map();
/** Map a location string to a two-letter state code, or null. */
export function locationState(location) {
  if (!location) return null;
  if (locCache.has(location)) return locCache.get(location);
  let code = null;
  const raw = String(location);
  const t = norm(raw);
  for (const n of STATE_NAMES_SORTED) {
    if (t.includes(` ${n} `)) { code = NAME_TO_CODE[n]; break; }
  }
  if (!code) {
    const m = raw.match(/,\s*([A-Z]{2})\b/) || raw.match(/\b([A-Z]{2})$/);
    if (m && STATES[m[1]]) code = m[1];
  }
  if (!code) {
    for (const c of CITY_NAMES_SORTED) {
      if (t.includes(` ${c} `)) { code = CITIES[c]; break; }
    }
  }
  if (locCache.size > 20000) locCache.clear();
  locCache.set(location, code);
  return code;
}

export function stateName(code) {
  return code && STATES[code] ? titleCase(STATES[code]) : code;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichPerson, analyzeOrg } from '../../server/matching/index.js';
import { cleanTitle } from '../../server/matching/enrich.js';
import { parseGeo, locationState } from '../../server/matching/geo.js';
import { parseQuery } from '../../server/matching/query.js';

const e = (title, company, full_name = 'Test Person') => enrichPerson({ full_name, title, company });

test('dental association director is a dental association', () => {
  const r = e('Director of Member Services', 'New Hampshire Dental Society');
  assert.deepEqual(r.industries, ['dental']);
  assert.equal(r.org_type, 'association');
  assert.equal(r.seniority, 'director');
  assert.equal(analyzeOrg({ title: 'Director', company: 'New Hampshire Dental Society', org_type: r.org_type }).kind, 'association');
});

test('dental practices are dental healthcare providers', () => {
  for (const [t, c] of [['Owner', 'Lakeside Family Dentistry'], ['Office Manager', 'Main Street Smiles'], ['Orthodontist', 'Valley Orthodontics'], ['Oral Surgeon', 'Granite Oral Surgery']]) {
    const r = e(t, c);
    assert.ok(r.industries.includes('dental'), `${t} @ ${c}`);
    assert.equal(r.org_type, 'healthcare_provider', `${t} @ ${c}`);
  }
  assert.equal(e('Owner', 'Lakeside Family Dentistry').seniority, 'owner');
  assert.equal(e('Practice Manager', 'Lakeside Dental Group').job_function, 'operations');
});

test('hard distractors are not classified into the look-alike industry', () => {
  assert.deepEqual(e('Software Engineer', 'Lumen Freight', 'Chris Dental').industries.includes('dental'), false);
  assert.equal(e('Software Engineer (former dentist)', 'Cobalt Analytics').industries.includes('dental'), false);
  assert.equal(e('Software Engineer, formerly a practicing dentist', 'Cobalt Analytics').industries.includes('dental'), false);
  const sf = e('Agent', 'State Farm Insurance');
  assert.ok(sf.industries.includes('insurance'));
  assert.ok(!sf.industries.includes('agriculture'));
  assert.ok(!e('Owner', 'Smile Photography Studio').industries.includes('dental'));
  assert.ok(!e('Hospitality Manager', 'Grand Lake Hotel').industries.includes('healthcare_providers'));
  assert.ok(!e('Fiber Artist', 'Wool and Fiber Studio').industries.includes('broadband_telecom'));
  assert.ok(!e('Equity Analyst', 'Capital Markets Group').industries.includes('grocery_retail'));
  assert.equal(e('Equity Analyst', 'Capital Markets Group').org_type, 'company');
});

test('a dental marketing agency is a vendor, a dental supply company is a distributor', () => {
  const v = { title: 'Account Executive', company: 'Bright Dental Marketing Agency' };
  const an = analyzeOrg({ ...v, org_type: enrichPerson(v).org_type });
  assert.equal(an.kind, 'vendor');
  assert.ok(an.serves.includes('dental'));
  const d = { title: 'Territory Manager', company: 'Northeast Dental Supply Co.' };
  assert.equal(analyzeOrg({ ...d, org_type: enrichPerson(d).org_type }).kind, 'distributor');
});

test('connector kinds: regulator, extension, cooperative, lender, chamber, economic development', () => {
  const k = (title, company) => analyzeOrg({ title, company, org_type: e(title, company).org_type }).kind;
  assert.equal(k('Executive Director', 'Vermont Board of Dental Examiners'), 'regulator');
  assert.equal(k('Extension Educator', 'University of Wisconsin Cooperative Extension'), 'extension');
  assert.equal(k('CEO', 'Washington Electric Cooperative'), 'cooperative');
  assert.equal(k('Loan Officer', 'Heartland Farm Credit'), 'lender');
  assert.equal(k('President', 'Littleton Chamber of Commerce'), 'chamber');
  assert.equal(k('Director', 'North Country Economic Development Corporation'), 'economic_development');
  assert.equal(k('Grocery Buyer', 'Hanover Food Co-op'), 'provider');
});

test('org types and seniority', () => {
  assert.equal(e('Town Manager', 'Town of Littleton').org_type, 'government');
  assert.equal(e('Town Manager', 'Town of Littleton').seniority, 'c_level');
  assert.equal(e('Partner', 'Granite Peak Ventures').org_type, 'investor');
  assert.equal(e('Dean of Workforce Development', 'Blue Ridge Community College').org_type, 'education');
  assert.equal(e('CEO', 'North Fork Regional Hospital').org_type, 'healthcare_provider');
  assert.equal(e('Vice President of Sales', 'Acme Corp').seniority, 'vp');
  assert.equal(e('Vice President of Sales', 'Acme Corp').job_function, 'sales');
  assert.equal(e('Fractional CFO', '').job_function, 'finance');
  assert.equal(e('Fractional CFO', '').seniority, 'c_level');
  assert.equal(e('', '').org_type, 'other');
  assert.equal(e('', '').seniority, 'unknown');
});

test('enrichPerson is fast', () => {
  const t0 = performance.now();
  for (let i = 0; i < 2000; i++) e(`Director ${i}`, `Company ${i} Dental Group`);
  const per = (performance.now() - t0) / 2000;
  assert.ok(per < 0.5, `${per.toFixed(3)} ms per call`);
});

test('cleanTitle drops former roles', () => {
  assert.equal(cleanTitle('Software Engineer (former dentist)'), 'Software Engineer');
  assert.equal(cleanTitle('Teacher; retired nurse'), 'Teacher;');
});

test('geography: states, abbreviations, regions', () => {
  const g = parseGeo('dental association leaders in New England');
  assert.ok(g.states.has('NH') && g.states.has('VT') && g.states.has('CT'));
  assert.ok(!g.states.has('NY'));
  assert.ok(parseGeo('clinics in West Virginia').states.has('WV'));
  assert.ok(!parseGeo('clinics in West Virginia').states.has('CA'));
  assert.ok(parseGeo('farms in IA and WI').states.has('IA'));
  assert.equal(parseGeo('people in my network').states.size, 0); // lowercase "in", "me" are not states
  assert.equal(locationState('Concord, New Hampshire, United States'), 'NH');
  assert.equal(locationState('Burlington, VT'), 'VT');
  assert.equal(locationState('Greater Boston'), 'MA');
  assert.equal(locationState('Remote'), null);
});

test('query parsing: industries, org intent, geo, talent', () => {
  const q = parseQuery('dental association leaders in New England');
  assert.deepEqual(q.industries.map((x) => x.id), ['dental']);
  assert.ok(q.orgIntent.includes('association'));
  assert.ok(q.connectorIntent && q.seniorIntent);
  assert.ok(q.geo.states.has('ME'));
  const d = parseQuery('dentists');
  assert.equal(d.industries[0].id, 'dental');
  const t = parseQuery('fractional CFO', 'talent');
  assert.ok(t.functions.includes('finance') && t.fractional);
  assert.ok(t.roleTerms.includes('controller'));
  const s = parseQuery('dental practice software');
  assert.equal(s.industries.find((x) => x.id === 'dental').weight, 1);
  assert.ok(s.industries.find((x) => x.id === 'software_it').weight < 1);
});

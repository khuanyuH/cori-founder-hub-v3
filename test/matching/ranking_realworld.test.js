// Ranking behaviour on real-world-style failures (invented person names; organisation names and titles only).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, addMember, addPerson, connect, setBusiness } from './helpers.js';
import { search, suggestLeads } from '../../server/matching/index.js';

process.env.HUB_LLM = 'off';

let db; let founder; let board; let staff; const P = {};

before(() => {
  process.env.HUB_LLM = 'off';
  db = createTestDb();
  founder = addMember(db, { name: 'Fran Founder', role: 'founder' });
  board = addMember(db, { name: 'Bea Board', role: 'board' });
  staff = addMember(db, { name: 'Sam Staff', role: 'staff' });
  setBusiness(db, founder, {
    name: 'BrightChair', industry: 'Dental practice software',
    description: 'Scheduling and billing software for dental offices.',
    target_customers: 'Dental offices and small DSOs', geography: 'New England', needs: '',
  });
  const add = (key, rec, knowers) => {
    P[key] = addPerson(db, rec);
    for (const [m, strength] of knowers) connect(db, m, P[key], { strength });
  };
  add('owner', { full_name: 'Avery Oakes', title: 'Owner', company: 'Lakeside Family Dentistry', location: 'Burlington, Vermont' }, [[staff, 'weak']]);
  add('nhds', { full_name: 'Robin Ashgrove', title: 'Director of Member Services', company: 'New Hampshire Dental Society', location: 'Concord, New Hampshire' }, [[board, 'weak']]);
  add('dmd', { full_name: 'Casey Riverton', title: 'DMD Candidate', company: 'Harvard School of Dental Medicine', location: 'Boston, Massachusetts' }, [[board, 'strong']]);
  add('intern', { full_name: 'Jamie Fenwick', title: 'Dental Assistant Intern', company: 'Granite Family Dentistry', location: 'Nashua, New Hampshire' }, [[board, 'strong']]);
  add('caregiver', { full_name: 'Morgan Tilly', title: 'Home Caregiver', company: 'Boston Nursing Care & Consulting', location: 'Boston, Massachusetts' }, [[board, 'strong']]);
  add('consultant', { full_name: 'Drew Halvorsen', title: 'Founder', company: 'Northeast Dental Practice Consulting', location: 'Portland, Maine' }, [[staff, 'weak']]);
  add('student_soc', { full_name: 'Quinn Marsh', title: 'President', company: 'Yale Undergraduate Dental Society', location: 'New Haven, Connecticut' }, [[board, 'strong']]);
  add('hist', { full_name: 'Sage Whitlow', title: 'Volunteer', company: 'Norwich Historical Society', location: 'Norwich, Vermont' }, [[board, 'strong']]);
  add('athletic', { full_name: 'Rowan Pike', title: "Men's Basketball Graduate Assistant", company: 'University Athletic Association Inc' }, [[board, 'strong']]);
  add('ccc', { full_name: 'Lane Mercer', title: 'Executive Director', company: 'Vermont Association of Community Colleges' }, [[staff, 'weak']]);
});

test('students and interns rank far below real buyers and connectors, with an honest reason', async () => {
  const res = await search(db, { query: 'dental offices in New England', memberId: founder, limit: 50 });
  const idx = (k) => res.findIndex((r) => r.person.id === P[k]);
  assert.ok(idx('owner') >= 0);
  for (const k of ['dmd', 'intern']) {
    if (idx(k) < 0) continue; // dropped entirely is fine
    assert.ok(idx(k) > idx('owner'), `${k} must rank below the owner`);
    assert.match(res[idx(k)].reasons[0], /^(Student|Intern)/);
  }
  const dmd = res.find((r) => r.person.id === P.dmd);
  if (dmd) assert.ok(!dmd.reasons.some((r) => /dental office/.test(r) && /Clinician/.test(r)), 'a dental school is not a dental office');
});

test('when early-career people do appear, the first reason says so', async () => {
  const any = await search(db, { query: 'dental', mode: 'any', memberId: founder, limit: 50 });
  const dmd = any.find((r) => r.person.id === P.dmd);
  assert.ok(dmd, 'shown in "any" mode');
  assert.equal(dmd.reasons[0], 'Student: not a buyer, but may know people in the field');
  const intern = any.find((r) => r.person.id === P.intern);
  assert.ok(intern && intern.reasons[0].startsWith('Intern:'));
  const talent = await search(db, { query: 'dental assistant', mode: 'talent', memberId: founder, limit: 50 });
  const ti = talent.find((r) => r.person.id === P.intern);
  assert.ok(ti, 'talent mode may still show interns');
  assert.ok(ti.reasons.includes('Early career (intern)'));
});

test('a student "dental society" and a historical society are not connectors; a real dental society is', async () => {
  const res = await search(db, { query: 'dental association leaders', memberId: founder, limit: 50 });
  assert.equal(res[0].person.id, P.nhds);
  const soc = res.find((r) => r.person.id === P.student_soc);
  if (soc) {
    assert.ok(soc.score < res[0].score / 2);
    assert.ok(!soc.reasons.some((r) => /association: reaches many/.test(r)));
  }
  const { leads } = await suggestLeads(db, { memberId: founder, limit: 50 });
  for (const k of ['student_soc', 'hist', 'athletic']) {
    const l = leads.find((x) => x.person.id === P[k]);
    assert.ok(!l || l.lead_type !== 'connector' || l.reasons[0].startsWith('Student') || l.reasons[0].startsWith('Volunteer'), `${k} suggested as a connector`);
  }
});

test('front-line staff at a company with "Consulting" in its name are not suggested as partners', async () => {
  const { leads } = await suggestLeads(db, { memberId: founder, limit: 60 });
  const cg = leads.find((l) => l.person.id === P.caregiver);
  assert.ok(!cg || cg.lead_type !== 'partner', 'caregiver as partner');
  const res = await search(db, { query: 'dental practice consultant', memberId: founder, limit: 20 });
  const ci = res.findIndex((r) => r.person.id === P.consultant);
  const gi = res.findIndex((r) => r.person.id === P.caregiver);
  assert.ok(ci >= 0);
  assert.ok(gi < 0 || gi > ci);
});

test('a basketball graduate assistant at a university athletic association is not a connector to colleges', async () => {
  const res = await search(db, { query: 'community college associations', memberId: founder, limit: 20 });
  assert.equal(res[0].person.id, P.ccc);
  const a = res.find((r) => r.person.id === P.athletic);
  assert.ok(!a || !a.reasons.some((r) => /association: reaches many/.test(r)));
});

test('ties nudge: equal profiles break on strength; a clearly relevant weak tie beats a loosely relevant strong tie', async () => {
  const d = createTestDb();
  const f = addMember(d, { name: 'F' }); const b = addMember(d, { name: 'B', role: 'board' }); const s = addMember(d, { name: 'S', role: 'staff' });
  const strong = addPerson(d, { full_name: 'Twin Strong', title: 'Partner', company: 'Cedar Creek Ventures' }); connect(d, b, strong, { strength: 'strong' });
  const weak = addPerson(d, { full_name: 'Twin Weak', title: 'Partner', company: 'Cedar Creek Ventures' }); connect(d, s, weak, { strength: 'weak' });
  const vc = addPerson(d, { full_name: 'Weak Vc', title: 'Investor', company: '8VC' }); connect(d, s, vc, { strength: 'weak' });
  const banker = addPerson(d, { full_name: 'Strong Banker', title: 'Analyst', company: 'Capital One' }); connect(d, b, banker, { strength: 'strong', source: 'manual' });
  const wealth = addPerson(d, { full_name: 'Strong Advisor', title: 'Financial Advisor', company: 'Riverbend Wealth Management' }); connect(d, b, wealth, { strength: 'strong', source: 'manual' });
  const res = await search(d, { query: 'venture investors in rural startups', memberId: f, limit: 20 });
  const at = (id) => res.findIndex((r) => r.person.id === id);
  assert.ok(at(strong) >= 0 && at(strong) < at(weak), 'strong tie wins between equal profiles');
  assert.ok(at(vc) >= 0);
  for (const id of [banker, wealth]) assert.ok(at(id) < 0 || at(id) > at(vc), 'loosely relevant strong tie must not beat a VC');
});

test('search spreads results across organisations instead of listing one firm many times', async () => {
  const d = createTestDb();
  const f = addMember(d, { name: 'F' }); const b = addMember(d, { name: 'B', role: 'board' });
  for (let i = 0; i < 8; i++) { const id = addPerson(d, { full_name: `Same Firm ${i}`, title: 'General Partner', company: 'Ridgeline Ventures' }); connect(d, b, id, { strength: 'strong' }); }
  const other = addPerson(d, { full_name: 'Other Firm', title: 'Principal', company: 'Maple Seed Fund' }); connect(d, b, other, { strength: 'weak' });
  const res = await search(d, { query: 'venture investors', memberId: f, limit: 10 });
  const i = res.findIndex((r) => r.person.id === other);
  assert.ok(i >= 0 && i < 4, `other firm at ${i + 1}`);
  for (let k = 1; k < res.length; k++) assert.ok(res[k - 1].score >= res[k].score, 'scores stay in display order');
});

test('a broad "federal government" tag does not make every Army officer a USDA contact', async () => {
  const d = createTestDb();
  const f = addMember(d, { name: 'F' }); const b = addMember(d, { name: 'B', role: 'board' });
  const army = addPerson(d, { full_name: 'Army Example', title: 'Officer', company: 'US Army' }); connect(d, b, army, { strength: 'strong' });
  const usda = addPerson(d, { full_name: 'Usda Example', title: 'State Director', company: 'USDA Rural Development Vermont' }); connect(d, b, usda, { strength: 'weak' });
  const res = await search(d, { query: 'usda rural development', memberId: f, limit: 10 });
  assert.equal(res[0].person.id, usda);
  const a = res.find((r) => r.person.id === army);
  assert.ok(!a || a.score < res[0].score * 0.7);
});

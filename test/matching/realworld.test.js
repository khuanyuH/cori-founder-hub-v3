// Real-world classification cases: organisation names and generic titles seen in a real LinkedIn export
// (no person names; the classifier never sees names anyway). Each row: [title, company, expectation].
// Expectations: ind = industries must include these (in any order); notInd = must not include;
// org = org_type; fn = job_function; early = early-career stage (or null); kind = analyzeOrg kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichPerson, analyzeOrg, classifyPerson, lookupCompany } from '../../server/matching/index.js';

function check(title, company, x) {
  const r = classifyPerson({ company, title });
  const label = `${title} @ ${company} -> ${JSON.stringify({ ind: r.industries, org: r.org_type, fn: r.job_function, sen: r.seniority, early: r.stage })}`;
  for (const id of x.ind || []) assert.ok(r.industries.includes(id), `${label}: expected industry ${id}`);
  for (const id of x.notInd || []) assert.ok(!r.industries.includes(id), `${label}: unexpected industry ${id}`);
  if (x.noInd) assert.deepEqual(r.industries, [], label);
  if (x.org) assert.equal(r.org_type, x.org, label);
  if (x.notOrg) assert.notEqual(r.org_type, x.notOrg, label);
  if (x.fn) assert.equal(r.job_function, x.fn, label);
  if ('early' in x) assert.equal(r.stage, x.early, label);
  if (x.sen) assert.equal(r.seniority, x.sen, label);
  if (x.kind || x.notKind) {
    const k = analyzeOrg({ company, title, org_type: r.org_type }).kind;
    if (x.kind) assert.equal(k, x.kind, `${label}: kind ${k}`);
    if (x.notKind) assert.notEqual(k, x.notKind, `${label}: kind ${k}`);
  }
  // The public enrichPerson agrees with the full classification and stays in the contract's value sets.
  const e = enrichPerson({ full_name: 'Invented Person', company, title });
  assert.deepEqual(e.industries, r.industries);
  assert.ok(['owner', 'c_level', 'vp', 'director', 'manager', 'ic', 'unknown'].includes(e.seniority), label);
  assert.ok(['sales', 'marketing', 'finance', 'engineering', 'operations', 'legal', 'hr', 'product', 'executive', 'clinical', 'other'].includes(e.job_function), label);
  assert.ok(['company', 'association', 'government', 'nonprofit', 'education', 'healthcare_provider', 'investor', 'other'].includes(e.org_type), label);
}

const rows = (list) => () => { for (const [t, c, x] of list) check(t, c, x); };

test('failure 1a: well-known firms with no industry word (company table)', rows([
  ['Business Analyst', 'McKinsey & Company', { ind: ['consulting'], org: 'company', fn: 'operations' }],
  ['Associate Consultant', 'Bain & Company', { ind: ['consulting'], fn: 'operations' }],
  ['Consultant', 'Deloitte', { ind: ['consulting'], fn: 'operations' }],
  ['Analyst', 'AlphaSights', { ind: ['consulting'] }],
  ['Consultant', 'Boston Consulting Group (BCG)', { ind: ['consulting'] }],
  ['Investment Banking Analyst', 'Goldman Sachs', { ind: ['banking', 'investment'], org: 'company', fn: 'finance' }],
  ['Associate', 'Morgan Stanley', { ind: ['banking', 'investment'], fn: 'finance' }],
  ['Analyst', 'J.P. Morgan', { ind: ['banking', 'investment'], fn: 'finance' }],
  ['Analyst', 'JPMorgan Chase', { ind: ['banking'] }],
  ['Analyst', 'JPMorganChase', { ind: ['banking'] }],
  ['Private Equity Associate', 'Blackstone', { ind: ['investment'], org: 'investor', fn: 'finance' }],
  ['Analyst', 'GCM Grosvenor', { ind: ['investment'], org: 'investor', fn: 'finance' }],
  ['Analyst', 'Wellington Management', { ind: ['investment'], org: 'investor' }],
  ['Quantitative Researcher', 'Citadel', { ind: ['investment'], org: 'investor' }],
  ['Trader', 'Jane Street', { ind: ['investment'], org: 'company', fn: 'finance' }],
  ['Assistant Trader', 'Susquehanna International Group', { ind: ['investment'], org: 'company' }],
  ['Staff Assistant', 'U.S. House of Representatives', { ind: ['federal_government'], org: 'government' }],
  ['Legislative Correspondent', 'United States Senate', { ind: ['federal_government'], org: 'government' }],
  ['Officer', 'US Army', { ind: ['federal_government'], org: 'government' }],
  ['Research Assistant', 'Yale School of Medicine', { ind: ['higher_education'], org: 'education' }],
  ['Associate Director', 'Yale School of Management', { ind: ['higher_education'], org: 'education', early: null }],
  ['Program Coordinator', 'Yale Jackson School of Global Affairs', { ind: ['higher_education'], org: 'education' }],
  ['Reporter', 'New Haven Independent', { ind: ['media_publishing'], org: 'company' }],
  ['Software Engineer', 'Amazon Web Services (AWS)', { ind: ['software_it'], fn: 'engineering' }],
  ['Associate', 'Sullivan & Cromwell LLP', { ind: ['legal'], fn: 'legal' }],
  ['Analyst', 'Capital One', { ind: ['banking'], org: 'company', notInd: ['investment'] }],
]));

test('failure 1b/1c: generic cues and titles when the company is unknown', rows([
  ['Program Manager', 'Riverbend School of Public Policy', { ind: ['higher_education'], org: 'education' }],
  ['Lecturer', 'Granite State College', { ind: ['higher_education'], org: 'education' }],
  ['Teaching Assistant', 'University of Chicago Department of Mathematics', { ind: ['higher_education'], notInd: ['state_government'], org: 'education', early: 'student' }],
  ['Policy Director', 'Vermont Department of Health', { org: 'government' }],
  ['Research Scientist', 'Lakeside Institute for Water Studies', { ind: ['higher_education'], org: 'education' }],
  ['English Language Arts Instructor, 6th & 8th Grade', 'Riverbend Collegiate Institute', { ind: ['k12_education'], notInd: ['higher_education'], org: 'education' }],
  ['Partner', 'Granite Peak Ventures', { ind: ['investment'], org: 'investor' }],
  ['Principal', 'Kettle Pond Capital', { ind: ['investment'], org: 'investor' }],
  ['Analyst', 'Birch Hill Asset Management', { ind: ['investment'], org: 'investor' }],
  ['Associate', 'Siena Ridge Partners', { ind: ['investment'] }],
  ['Owner', 'Granite Dental Partners', { ind: ['dental'], notInd: ['investment'], notOrg: 'investor' }],
  ['Executive Assistant', 'Riverbend Holdings', { noInd: true }],
  ['Private Equity Associate', 'Stealth Startup', { ind: ['investment'], fn: 'finance' }],
  ['Reporter', '', { ind: ['media_publishing'] }],
  ['Staff Writer', 'Self-employed', { ind: ['media_publishing'] }],
  ['Consultant', '', { ind: ['consulting'], fn: 'operations' }],
  ['Investor', '', { ind: ['investment'], fn: 'finance' }],
  ['Research Assistant', 'Carbon Capture Lab', { fn: 'other' }],
  ['Analyst', 'Unknown Widgets', { fn: 'other' }],
]));

test('failure 2: student, campus, alumni, sports, union, cause groups are not trade associations', rows([
  ['Professional Development Chair', 'Yale Society Of Women Engineers', { org: 'education', early: 'student' }],
  ['Software Engineer', 'Yale Computer Society', { org: 'education', early: 'student' }],
  ['Co-President', 'Yale Undergraduate Aerospace Association (YUAA)', { org: 'education', early: 'student', sen: 'ic' }],
  ['Co-Founder', 'Salix Apicis Student Association', { org: 'education', early: 'student' }],
  ['Co-Founder and Executive Board Member', 'SCU Finance and Technology Student Association', { org: 'education', notInd: ['banking', 'software_it'] }],
  ['Project Leader', 'LSE SU Polish Business Society', { org: 'education' }],
  ['President Emeritus', 'Alexander Hamilton Society at GW', { org: 'education' }],
  ['Representative', "Commonwealth Students' Association", { org: 'education' }],
  ['Reunion Clerk', 'Yale Alumni Association', { org: 'education', kind: 'provider' }],
  ['Fellow', 'Yale-China Association', { notOrg: 'association' }],
  ['Production Assistant', 'National Basketball Association (NBA)', { org: 'company', notKind: 'association' }],
  ["Men's Basketball Graduate Assistant", 'University Athletic Association Inc', { org: 'education', early: 'student', notKind: 'association' }],
  ['Volunteer', 'Norwich Historical Society', { org: 'nonprofit', early: 'volunteer' }],
  ['Project Manager', 'Providence Preservation Society', { org: 'nonprofit' }],
  ['Investigative Intern', 'The Legal Aid Society', { org: 'nonprofit', early: 'intern' }],
  ['Teaching Fellow', 'Schwartz Reisman Institute for Technology and Society', { org: 'education' }],
  ['Cluster Tech Coordinator', 'Student Technology Collaborative', { org: 'education' }],
  ['Founder', 'The Ionian League', { notOrg: 'association', kind: null }],
  ['Treasurer', 'Yale Renewable Future Alliance (RFA)', { org: 'education', notInd: ['energy'] }],
  ['Post-Baccalaureate Fellow', 'Quantum Collaborative Research Corps (QCoR)', { notOrg: 'association', early: 'trainee' }],
  ['Assistant Director, Research and Negotiations', 'District Council 37', { org: 'other', notKind: 'association' }],
  ['Development Coordinator', 'Connecticut League of Conservation Voters (CTLCV)', { org: 'nonprofit', notKind: 'association' }],
  ['Member', 'Delta Sigma Pi, Miami University', { org: 'education', early: 'student' }],
  ['Co-President', 'Yale Democracy Project', { org: 'education', early: 'student' }],
  ['Founder and President of Yale College Republicans', 'Yale University', { early: 'student' }],
  ['Operations Coordinator', 'Riverbend County Food Bank', { org: 'nonprofit', ind: ['nonprofit'] }],
  ['Program Manager', 'Yale Center for Teaching and Learning', { org: 'education', early: null }],
  ['Writing Partner', 'Yale Center for Teaching and Learning', { notInd: ['investment'] }],
  ['Analyst', 'Yale Student Investment Group', { org: 'education', notOrg: 'investor' }],
  ['Analyst', 'Fund for the City of New York', { org: 'nonprofit', notInd: ['investment'] }],
]));

test('failure 2: real trade and professional associations still are', rows([
  ['Director of Member Services', 'New Hampshire Dental Society', { ind: ['dental'], org: 'association', kind: 'association' }],
  ['President', 'American Bankers Association', { ind: ['banking'], org: 'association', kind: 'association' }],
  ['CEO', 'Vermont Association of Hospitals', { org: 'association', kind: 'association' }],
  ['Vice President', 'National Rural Electric Cooperative Association', { ind: ['utilities'], org: 'association' }],
  ['Executive Director', 'Iowa Farm Bureau', { ind: ['agriculture'], org: 'association' }],
  ['President', 'Littleton Chamber of Commerce', { org: 'association', kind: 'chamber' }],
  ['Executive Director', 'Vermont Association of Realtors', { ind: ['real_estate'], org: 'association' }],
  ['Executive Director', 'Maine Bar Association', { org: 'association', ind: ['legal'] }],
  ['President', 'American Academy of Pediatrics', { org: 'association', notInd: ['k12_education'] }],
]));

test('failure 3: students, candidates, interns, incoming hires, fellows, volunteers', rows([
  ['DMD Candidate', 'Harvard School of Dental Medicine', { ind: ['higher_education'], org: 'education', early: 'student', sen: 'ic' }],
  ['Incoming Analyst', 'Goldman Sachs', { early: 'incoming', sen: 'ic' }],
  ['Incoming Summer 2026 Analyst', 'ClearView Healthcare Partners', { early: 'incoming' }],
  ['Summer Intern', 'Pfizer', { early: 'intern', ind: ['life_sciences'] }],
  ['Investment Banking Summer Analyst', 'Morgan Stanley', { early: 'intern' }],
  ['Undergraduate Research Assistant', 'Yale University', { early: 'student' }],
  ['Medical Student', 'NYU Grossman School of Medicine', { early: 'student', org: 'education' }],
  ['PhD Student', 'Stanford University', { early: 'student' }],
  ['Volunteer', 'Mass General Hospital', { early: 'volunteer', org: 'healthcare_provider' }],
  ['Postdoctoral Fellow', 'Broad Institute', { early: 'trainee' }],
  ['Woodbridge Fellow', 'Yale University', { early: 'trainee' }],
  ['Teach For America Corps Member', 'Teach For America', { early: null }],
  ['Senior Fellow', 'Brookings Institution', { early: null }],
  ['Director of Student Affairs', 'Granite State College', { early: null }],
  ['Student Loan Officer', 'EduFinance Corp', { early: null }],
  ['Volunteer Coordinator', 'Riverbend Food Bank', { early: null }],
  ['Retired Dentist, Volunteer', 'Pine Hollow Historical Society', { early: 'volunteer', notInd: ['dental'] }],
  ['Owner', 'Lakeside Family Dentistry', { early: null, org: 'healthcare_provider', sen: 'owner' }],
]));

test('failure 4: consultancies and manufacturers are not healthcare providers; real providers are', rows([
  ['Analyst', 'ClearView Healthcare Partners', { org: 'company', ind: ['consulting'], notInd: ['healthcare_providers'] }],
  ['Commercial Leadership Program Associate', 'GE HealthCare', { org: 'company', ind: ['life_sciences'], notInd: ['healthcare_providers'] }],
  ['Account Manager', 'Northfield Healthcare Solutions', { notOrg: 'healthcare_provider' }],
  ['Nurse', 'Mayo Clinic', { org: 'healthcare_provider', ind: ['healthcare_providers'] }],
  ['CBO Analyst', 'Mount Sinai Health System', { org: 'healthcare_provider' }],
  ['Unit Coordinator', 'Massachusetts General Hospital', { org: 'healthcare_provider' }],
  ['Physician', 'NYU Langone Health', { org: 'healthcare_provider' }],
  ['Research Coordinator', 'Columbia University Irving Medical Center', { org: 'healthcare_provider' }],
  ['CEO', 'North Fork Regional Hospital', { org: 'healthcare_provider' }],
]));

test('seniority: "Writing Partner" or "HR Business Partner" is not an owner; a managing partner is', () => {
  assert.notEqual(classifyPerson({ company: 'Yale University', title: 'Writing Partner' }).seniority, 'owner');
  assert.notEqual(classifyPerson({ company: 'Acme Corp', title: 'HR Business Partner' }).seniority, 'owner');
  assert.equal(classifyPerson({ company: 'Granite Peak Ventures', title: 'Partner' }).seniority, 'owner');
  assert.equal(classifyPerson({ company: 'Lakeside Endodontics', title: 'Managing Partner' }).seniority, 'owner');
});

test('company table: normalisation, aliases, safe prefixes', () => {
  assert.equal(lookupCompany('McKinsey & Company').name, 'McKinsey & Company');
  assert.equal(lookupCompany('mckinsey and company, inc.').name, 'McKinsey & Company');
  assert.equal(lookupCompany('J.P. Morgan').name, lookupCompany('JPMorgan Chase & Co.').name);
  assert.equal(lookupCompany('Goldman Sachs Asset Management').industries.includes('investment'), true);
  assert.equal(lookupCompany('The Carlyle Group').name, 'Carlyle Group');
  assert.equal(lookupCompany('Bain & Company').industries[0], 'consulting');
  assert.equal(lookupCompany('Bain Capital').industries[0], 'investment');
  assert.equal(lookupCompany('Silver Lake Ski Area', () => false), null, 'ordinary names extend only with corporate words');
  // A prefix whose extra words name another sector is rejected by the classifier.
  assert.ok(!classifyPerson({ company: 'Susquehanna Valley Dental Group', title: 'Owner' }).industries.includes('investment'));
  assert.equal(classifyPerson({ company: 'Silver Lake Family Dentistry', title: 'Owner' }).org_type, 'healthcare_provider');
  assert.equal(lookupCompany('Acme Widgets'), null);
});

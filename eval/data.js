// Synthetic labelled benchmark for the matching engine. Every name and organisation is invented.
//
// Labelling rule: a person is a TRUE LEAD for a profile if they work at a target-customer
// organisation ('customer') or at an organisation that reaches many such customers
// ('connector'). Vendors who sell to the same customers, look-alike keywords, and everyone
// else are not leads. Some true leads are deliberately hard to detect (no industry words in
// the title or company) so recall cannot reach 100% by construction.

const FIRST = ['Avery', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Quinn', 'Drew', 'Reese', 'Hayden',
  'Parker', 'Rowan', 'Emerson', 'Sawyer', 'Blake', 'Cameron', 'Dakota', 'Ellis', 'Finley', 'Harper', 'Jesse', 'Kendall',
  'Logan', 'Marlow', 'Noel', 'Oakley', 'Peyton', 'Remy', 'Sage', 'Tatum', 'Wren', 'Alexis', 'Bailey', 'Corey', 'Devon',
  'Frankie', 'Gray', 'Indie', 'Jules', 'Kai', 'Lane', 'Micah', 'Nico', 'Ola', 'Pat', 'Robin', 'Shay', 'Toby', 'Val'];
const LAST = ['Abernethy', 'Birchwood', 'Calloway', 'Dunmore', 'Ellsworth', 'Fairbanks', 'Galloway', 'Hollister',
  'Ingram', 'Jessup', 'Kincaid', 'Lockhart', 'Merriweather', 'Northrup', 'Oakes', 'Pendleton', 'Quimby', 'Radcliffe',
  'Stanhope', 'Thornbury', 'Underhill', 'Vance', 'Whitcombe', 'Yardley', 'Ashgrove', 'Bramwell', 'Corliss', 'Delacroix',
  'Easterbrook', 'Fenwick', 'Greaves', 'Hartwell', 'Islington', 'Jardine', 'Kettering', 'Lindqvist', 'Marchetti',
  'Nakamura-Reyes', 'Okonkwo-Hale', 'Prescott', 'Rutherford', 'Sinclair', 'Tremblay', 'Upton', 'Voss', 'Wexford',
  'Ackerly', 'Blevins', 'Crandall', 'Dorsey', 'Eberly', 'Fitzgerald-Moore', 'Gillespie', 'Haddock', 'Iverson'];
const PLACES = ['Lakeside', 'Riverbend', 'Granite Falls', 'Maple Ridge', 'Pine Hollow', 'Cedar Creek', 'North Fork',
  'Stony Brook', 'Elm Valley', 'Birch Hill', 'Clearwater', 'Silver Lake', 'Willow Bend', 'Fox Run', 'High Meadow',
  'Bear Creek', 'Mill River', 'Oak Grove', 'Hidden Valley', 'Copper Ridge', 'Sunrise', 'Harbor View', 'Green Valley',
  'Twin Pines', 'Blue Ridge', 'Kettle Pond', 'Red Barn', 'Hawthorne', 'Juniper', 'Aspen Hollow'];
const STATE_NAMES = { NH: 'New Hampshire', VT: 'Vermont', ME: 'Maine', MA: 'Massachusetts', CT: 'Connecticut', RI: 'Rhode Island',
  NY: 'New York', IA: 'Iowa', WI: 'Wisconsin', MN: 'Minnesota', IL: 'Illinois', KY: 'Kentucky', WV: 'West Virginia',
  TN: 'Tennessee', VA: 'Virginia', NC: 'North Carolina', SC: 'South Carolina', GA: 'Georgia', OH: 'Ohio', TX: 'Texas',
  CA: 'California', CO: 'Colorado', WA: 'Washington', FL: 'Florida', PA: 'Pennsylvania', MI: 'Michigan', AZ: 'Arizona' };
const ALL_STATES = Object.keys(STATE_NAMES);

// A template is [title, company] or { name, title, company }. Placeholders: {Place} {State} {Last} {Region}.
export const PROFILES = [
  {
    key: 'dental',
    business: {
      name: 'ChairTime', industry: 'Dental practice software',
      description: 'Scheduling, patient reminders and insurance billing software for independent dental offices.',
      target_customers: 'Dental offices, orthodontists, oral surgeons and small dental groups (DSOs)',
      geography: 'New England', needs: 'fractional CFO',
    },
    region: ['NH', 'VT', 'ME', 'MA', 'CT', 'RI'], regionName: 'New England',
    customers: [
      ['Owner', '{Place} Family Dentistry'], ['Dentist and Owner', '{Place} Dental Care'], ['Practice Manager', '{Place} Dental Group'],
      ['Office Manager', '{Place} Smiles'], ['Practice Administrator', '{Place} Orthodontics'], ['DDS', '{Place} Pediatric Dentistry'],
      ['Orthodontist', '{Place} Orthodontic Specialists'], ['Oral Surgeon', '{Place} Oral and Maxillofacial Surgery'],
      ['Periodontist', '{Place} Periodontics'], ['Front Office Lead', '{Place} Dental Associates'], ['Billing Coordinator', '{Place} Family Dental'],
      ['VP of Operations', 'Granite Dental Partners'], ['Regional Manager', 'North Country Dental Service Organization'],
      ['Office Manager', 'Dr. {Last} and Associates'], ['Managing Partner', '{Place} Endodontics'], ['Dentist', 'Self-employed'],
      ['Owner', '{Last} DMD PC'], ['Lead Dental Hygienist', '{Place} Dental Arts'], ['Practice Owner', '{Place} Smile Center'],
    ],
    connectors: [
      ['Executive Director', '{State} Dental Society'], { name: 'Robin Ashgrove', title: 'Director of Member Services', company: 'New Hampshire Dental Society', state: 'NH', motivating: true },
      ['Government Affairs Manager', '{State} Dental Association'], ['President', '{State} Dental Hygienists Association'],
      ['Territory Manager', 'Northeast Dental Supply Co.'], ['Account Manager', 'Yankee Dental Distributors'],
      ['Executive Director', '{State} Board of Dental Examiners'], ['Director', '{State} Oral Health Coalition'],
      ['Program Manager', '{State} Department of Health Oral Health Program'], ['Membership Coordinator', 'New England Dental Study Club'],
      ['Purchasing Director', 'New England Dental Buying Group'],
    ],
    distractors: [
      { name: 'Chris Dental', title: 'Software Engineer', company: 'Lumen Freight' },
      ['Software Engineer (former dentist)', 'Cobalt Analytics'], ['Account Executive', 'Bright Dental Marketing Agency'],
      ['Claims Manager', 'Northeast Dental Insurance Co.'], ['Sales Director', 'ToothSoft Practice Software'],
      ['Lab Technician', 'Precision Dental Lab'], ['Owner', 'Smile Photography Studio'], ['Owner', 'Plaque and Trophy Shop'],
      ['Bridge Engineer', '{State} Department of Transportation'], ['Customer Success Manager', 'DentalFlow SaaS'],
      { name: 'Jamie Smiles', title: 'Senior Accountant', company: 'Hill and Brook CPAs' },
      ['Hospital Pharmacist', '{Place} Medical Center'], ['Retired Dentist, Volunteer', '{Place} Historical Society'],
      ['SEO Specialist', 'Dental Growth Marketing'],
    ],
  },
  {
    key: 'agtech',
    business: {
      name: 'FieldNote', industry: 'Agtech: soil sensors and farm management app',
      description: 'Low-cost soil moisture sensors and a simple farm management app that helps growers save water and fertilizer.',
      target_customers: 'Small and mid-size farms: dairy farms, orchards, vegetable growers and grain farmers',
      geography: 'Upper Midwest', needs: 'raising a seed round; need a sales lead',
    },
    region: ['IA', 'WI', 'MN', 'MI'], regionName: 'Upper Midwest',
    customers: [
      ['Owner', '{Last} Family Farm'], ['Owner/Operator', '{Place} Dairy'], ['Farm Manager', '{Place} Farms LLC'],
      ['Co-owner', '{Place} Orchard'], ['Grower', '{Place} Vegetable Farm'], ['Herd Manager', '{Place} Dairy Farm'],
      ['Owner', '{Place} Acres'], ['Operations Manager', '{Place} Grain and Cattle'], ['Owner', '{Place} Ranch'],
      ['Farmer', 'Self-employed'], ['Partner', '{Last} Brothers Farms'], ['Owner', '{Place} Homestead'],
      ['Owner', '{Last} and Sons'], ['Greenhouse Manager', '{Place} Greenhouses'], ['Owner', '{Place} Creamery'],
    ],
    connectors: [
      ['Extension Educator, Agriculture', 'University of {State} Extension'], ['County Extension Agent', '{State} State University Cooperative Extension'],
      ['Executive Director', '{State} Farm Bureau Federation'], ['Field Representative', '{State} Farm Bureau'],
      ['Loan Officer', 'Heartland Farm Credit'], ['Executive Director', '{State} Dairy Producers Association'],
      ['President', '{State} Corn Growers Association'], ['General Manager', '{Place} Farmers Cooperative'],
      ['Sales Manager', '{Place} Ag Equipment Dealer'], ['Program Director', '{State} Department of Agriculture'],
      ['District Conservationist', '{Place} County Conservation District'], { title: 'State Director', company: 'USDA Rural Development {State}', generic: true },
    ],
    distractors: [
      ['Agent', 'State Farm Insurance'], { name: 'Jordan Farmer', title: 'CFO', company: 'Brightline Software' },
      ['Data Center Operations Manager', 'Northstar Server Farm'], ['Chef', 'Farm to Table Bistro'],
      ['Account Executive', 'AgriSoft Analytics'], ['Agent', 'Farm Bureau Insurance'], ['Creative Director', 'Ant Farm Media'],
      ['Branch Manager', 'Farmington Savings Bank'], ['Marketing Manager', 'Harvest Moon Brewing'],
      ['Software Engineer', 'Tractorline Robotics'], ['Grain Trader', 'Global Commodities Inc.'],
      { name: 'Sage Fields', title: 'HR Manager', company: 'Midwest Plastics' },
    ],
  },
  {
    key: 'telehealth',
    business: {
      name: 'PrairieCare Connect', industry: 'Telehealth platform',
      description: 'Telehealth and remote patient monitoring platform built for low-bandwidth rural settings.',
      target_customers: 'Rural health clinics, critical access hospitals and federally qualified health centers (FQHCs)',
      geography: 'Central Appalachia', needs: '',
    },
    region: ['WV', 'KY', 'VA', 'TN'], regionName: 'Central Appalachia',
    customers: [
      ['CEO', '{Place} Regional Hospital'], ['Chief Nursing Officer', '{Place} Memorial Hospital'], ['Administrator', '{Place} Rural Health Clinic'],
      ['Executive Director', '{Place} Community Health Center'], ['Practice Manager', '{Place} Family Medicine'], ['CFO', '{Place} Critical Access Hospital'],
      ['Medical Director', '{Place} Primary Care'], ['Director of Nursing', '{Place} Health System'], ['Clinic Manager', '{Place} Medical Clinic'],
      ['Chief Medical Officer', '{Place} Medical Center'], ['Behavioral Health Director', '{Place} Counseling Center'],
      ['Administrator', '{Place} Valley Health'], ['Physician', 'Self-employed'], ['Nurse Practitioner', '{Place} Clinic'],
    ],
    connectors: [
      ['President', '{State} Hospital Association'], ['Executive Director', '{State} Rural Health Association'],
      ['Director of Member Services', '{State} Primary Care Association'], ['Director', '{State} Office of Rural Health'],
      ['Program Manager', 'Appalachian Area Health Education Center'], ['Director', '{State} Telehealth Resource Center'],
      ['Policy Director', '{State} Department of Health'], ['Network Director', '{State} Rural Hospital Network'],
      ['Purchasing Director', 'Appalachian Hospital Group Purchasing Alliance'],
    ],
    distractors: [
      ['Hospitality Manager', 'Grand Lake Hotel'], ['VP Sales', 'RuralCare Telehealth'], ['Practice Manager', '{Place} Veterinary Clinic'],
      ['Clinical Research Associate', 'Bluegrass Pharma Labs'], ['Health Insurance Broker', '{Place} Insurance Group'],
      ['Software Engineer', 'MedChart EHR Systems'], ['Owner', 'Clinic Street Bakery'], ['Hotel General Manager', '{Place} Inn and Hospitality'],
      ['Dentist', '{Place} Family Dentistry'], ['Account Executive', 'Healthwise Marketing Agency'],
    ],
  },
  {
    key: 'college',
    business: {
      name: 'SkillPath', industry: 'Workforce training SaaS',
      description: 'Software that helps colleges launch short-term workforce credentials with local employers and track outcomes.',
      target_customers: 'Community colleges, technical colleges and workforce boards',
      geography: 'Southeast', needs: 'marketing lead',
    },
    region: ['NC', 'SC', 'GA', 'TN', 'VA'], regionName: 'Southeast',
    customers: [
      ['Dean of Workforce Development', '{Place} Community College'], ['Vice President of Workforce and Continuing Education', '{Place} Technical College'],
      ['Director of Continuing Education', '{Place} Community College'], ['President', '{Place} Community College'],
      ['Executive Director', '{Place} Workforce Development Board'], ['Apprenticeship Coordinator', '{Place} Technical College'],
      ['Provost', '{Place} State Community College'], ['Director of Career and Technical Education', '{Place} Community and Technical College'],
      ['Program Manager', '{Place} Workforce Board'], ['Executive Director', '{Place} Workforce Solutions'],
      ['Director of Corporate Training', '{Place} Tech'], ['CIO', '{Place} Community College'],
    ],
    connectors: [
      ['Executive Director', '{State} Association of Community Colleges'], ['Vice President of Academic Affairs', '{State} Community College System Office'],
      ['President', '{State} Manufacturers Association'], ['Director of Workforce Policy', '{State} Department of Labor'],
      ['Executive Director', '{State} Association of Workforce Boards'], { title: 'Director', company: '{State} Chamber of Commerce', generic: true },
      ['Program Officer', '{State} Higher Education Commission'], { title: 'Regional Director', company: '{Place} Economic Development Partnership', generic: true },
    ],
    distractors: [
      ['Owner', 'College Street Movers'], { name: 'Dean Walsh', title: 'Plant Manager', company: 'Riverside Plastics' },
      ['Workforce Management Analyst', 'Summit Call Center Services'], ['Campus Recruiter', 'First Southern Bank'],
      ['Account Executive', 'LearnWise EdTech'], ['Professor of History', '{Place} University'], ['Teacher', '{Place} High School'],
      ['Student Loan Officer', 'EduFinance Corp'], ['Sales Director', 'CampusCloud Software'],
    ],
  },
  {
    key: 'broadband',
    business: {
      name: 'Ridgeline Fiber', industry: 'Fiber broadband provider',
      description: 'We design, build and operate open-access fiber networks in partnership with towns and utilities.',
      target_customers: 'Towns, counties, school districts and libraries that want municipal fiber',
      geography: 'Northern New England', needs: '',
    },
    region: ['VT', 'NH', 'ME'], regionName: 'Northern New England',
    customers: [
      ['Town Manager', 'Town of {Place}'], ['Selectboard Chair', 'Town of {Place}'], ['County Administrator', '{Place} County'],
      ['IT Director', 'City of {Place}'], ['Library Director', '{Place} Public Library'], ['Superintendent', '{Place} School District'],
      ['Technology Director', '{Place} Supervisory Union'], ['Town Administrator', 'Town of {Place}'], ['Mayor', 'City of {Place}'],
      ['Public Works Director', 'Town of {Place}'], ['Clerk', '{Place} Village'], ['Chair', '{Place} Communications Union District'],
    ],
    connectors: [
      ['Director', '{State} Broadband Office'], ['Program Manager', '{State} Department of Public Service'],
      ['CEO', '{Place} Electric Cooperative'], ['Member Services Director', '{State} Electric Cooperative'],
      { title: 'Executive Director', company: '{Place} Regional Planning Commission', generic: true },
      { title: 'President', company: '{Place} Economic Development Corporation', generic: true },
      ['Coordinator', '{State} Broadband Coalition'], ['General Manager', '{Place} Telephone Cooperative'],
      { title: 'State Director', company: 'USDA Rural Development {State}', generic: true },
      ['Executive Director', '{State} League of Cities and Towns'],
    ],
    distractors: [
      ['Fiber Artist', 'Wool and Fiber Studio'], ['Nutritionist', 'High Fiber Foods'], ['Network Engineer', 'First Granite Bank'],
      ['Owner', 'Town Car Service of {Place}'], ['Owner', '{Place} Electric Guitars'], ['Internet Marketing Consultant', 'Clickwise Digital'],
      ['Cable Knit Designer', 'North Wool Co.'], ['Sales Rep', 'Wireless World Retail'], ['Owner', 'Township Tavern'],
    ],
  },
  {
    key: 'food',
    business: {
      name: 'Hilltop Provisions', industry: 'Food manufacturing: small-batch granola and snacks',
      description: 'Small-batch granola, trail mix and snack bars made with regional oats and maple.',
      target_customers: 'Grocery stores, natural food co-ops, specialty food retailers and regional food distributors',
      geography: 'New England and New York', needs: '',
    },
    region: ['VT', 'NH', 'ME', 'MA', 'CT', 'RI', 'NY'], regionName: 'New England and New York',
    customers: [
      ['Grocery Buyer', '{Place} Food Co-op'], ['General Manager', '{Place} Natural Foods Co-op'], ['Category Manager', '{Place} Market'],
      ['Owner', '{Place} General Store'], ['Store Manager', '{Place} Grocery'], ['Owner', '{Place} Country Store'],
      ['Buyer', '{Place} Supermarkets'], ['Owner', '{Place} Specialty Foods'], ['Merchandising Manager', '{Place} Grocers'],
      ['Purchasing Manager', '{Place} Mercantile'], ['Owner', '{Last}s'],
    ],
    connectors: [
      ['Account Manager', 'Northeast Food Distributors'], ['Category Buyer', 'Pioneer Valley Wholesale'], ['Director', '{Place} Food Hub'],
      ['Executive Director', '{State} Grocers Association'], ['Program Manager', '{State} Agency of Agriculture Buy Local Program'],
      ['Broker', 'New England Food Brokers'], ['Executive Director', '{State} Specialty Food Association'],
      ['Membership Director', 'Neighboring Food Co-op Association'],
    ],
    distractors: [
      ['Executive Director', '{Place} Food Bank'], ['Equity Analyst', 'Capital Markets Group'], ['Market Research Analyst', 'Insight Partners Research'],
      ['Software Engineer', 'GrocerEase Delivery App'], ['Buyer', '{Place} Pet Food Co.'], ['Food Safety Inspector', '{State} Department of Health'],
      ['Sales Rep', 'Restaurant POS Systems'], ['Stock Market Trader', 'Summit Securities'], ['Marketing Manager', 'Granola Marketing Collective'],
    ],
  },
];

// ---------------------------------------------------------------------------
// Real-world-style hard cases, taken from failures seen on a real LinkedIn export (organisation names
// and generic titles only; every person name is invented by buildPool). Added only when
// buildPool(..., { realworld: true }) so the original benchmark above stays comparable.
//   leads:       true leads whose organisation name carries no industry word (needs the company table)
//   distractors: people who looked like leads to the old classifier but are not (students, interns,
//                incoming hires, volunteers, campus groups, sports leagues, unions, consultancies...)
export const REALWORLD = {
  dental: {
    leads: [
      { title: 'Territory Manager', company: 'Henry Schein', label: 'connector' },
      { title: 'Account Manager', company: 'Patterson Dental', label: 'connector' },
      { title: 'Director of Member Services', company: 'New Hampshire Dental Society', label: 'connector' },
    ],
    distractors: [
      ['DMD Candidate', 'Harvard School of Dental Medicine'], ['Home Caregiver', 'Boston Nursing Care & Consulting'],
      ['Dental Assistant Intern', '{Place} Family Dentistry'], ['Volunteer', 'Norwich Historical Society'],
      ['Incoming Analyst', 'Goldman Sachs'], ['Business Analyst', 'McKinsey & Company'], ['Medical Student', 'Yale School of Medicine'],
      ['Undergraduate Research Assistant', 'Harvard School of Dental Medicine'], ['Professional Development Chair', 'Yale Society Of Women Engineers'],
    ],
  },
  agtech: {
    leads: [
      { title: 'Loan Officer', company: 'Farm Credit East', label: 'connector' },
      { title: 'Executive Director', company: 'Iowa Farm Bureau', label: 'connector' },
    ],
    distractors: [
      ['Summer Intern', '{Place} Dairy Farm'], ['Volunteer', '{Place} Farmers Market'], ['Development Coordinator', 'Connecticut League of Conservation Voters (CTLCV)'],
      ['Treasurer', 'Yale Renewable Future Alliance (RFA)'], ['Incoming Summer 2026 Analyst', 'Cargill'], ['PhD Student', 'University of Wisconsin'],
      ['Private Equity Associate', 'Blackstone'],
    ],
  },
  telehealth: {
    leads: [
      { title: 'Chief Nursing Officer', company: 'Marshall Health', label: 'customer' },
      { title: 'VP of Operations', company: 'Appalachian Regional Healthcare', label: 'customer' },
      { title: 'Director of Virtual Care', company: 'WVU Medicine', label: 'customer' },
    ],
    distractors: [
      ['Analyst', 'ClearView Healthcare Partners'], ['Incoming Summer 2026 Analyst', 'ClearView Healthcare Partners'],
      ['Incoming Commercial Leadership Program Intern', 'GE HealthCare'], ['Volunteer', 'Mass General Hospital'],
      ['Medical Student', 'NYU Grossman School of Medicine'], ['Clinical Research Assistant', '{Place} Medical Center'],
      ['Home Caregiver', 'Boston Nursing Care & Consulting'], ['Research Technologist', 'Mayo Clinic'],
    ],
  },
  college: {
    leads: [
      { title: 'Executive Director', company: 'Tennessee Association of Community Colleges', label: 'connector' },
    ],
    distractors: [
      ["Men's Basketball Graduate Assistant", 'University Athletic Association Inc'], ['Co-President', 'Yale Undergraduate Aerospace Association (YUAA)'],
      ['Reunion Clerk', 'Yale Alumni Association'], ['Assistant Director, Research and Negotiations', 'District Council 37'],
      ['Co-Founder', 'Salix Apicis Student Association'], ['Co-Founder and Executive Board Member', 'SCU Finance and Technology Student Association'],
      ['Project Leader', 'LSE SU Polish Business Society'], ['President Emeritus', 'Alexander Hamilton Society at GW'],
      ['CSA Representative to Global Students Forum', "Commonwealth Students' Association"], ['Cluster Tech Coordinator', 'Student Technology Collaborative'],
      ['Undergraduate Learning Assistant', '{Place} Community College'], ['Incoming Associate Consultant', 'Bain & Company'],
      ['E3I Teaching Fellow', 'Schwartz Reisman Institute for Technology and Society'], ['Production Assistant', 'National Basketball Association (NBA)'],
    ],
  },
  broadband: {
    leads: [
      { title: 'Director of Broadband', company: 'Vermont Department of Public Service', label: 'connector' },
    ],
    distractors: [
      ['Software Engineer', 'Yale Computer Society'], ['Project Manager, Community & Policy Reporter', 'Providence Preservation Society'],
      ['Founder', 'The Ionian League'], ['Post-Baccalaureate Fellow', 'Quantum Collaborative Research Corps (QCoR)'],
      ['Investigative Intern', 'The Legal Aid Society'], ['Congressional Intern', 'U.S. House of Representatives'], ['Fellow', 'Yale-China Association'],
    ],
  },
  food: {
    leads: [
      { title: 'Category Manager', company: 'Hannaford', label: 'customer' },
      { title: 'Grocery Buyer', company: 'Whole Foods Market', label: 'customer' },
      { title: 'Category Manager', company: 'KeHE Distributors', label: 'connector' },
      { title: 'Account Manager', company: 'UNFI', label: 'connector' },
    ],
    distractors: [
      ['Summer Intern', 'PepsiCo'], ['Incoming Analyst', '{Place} Specialty Foods'], ['Volunteer', '{Place} Food Co-op'],
      ['Staff Writer', 'New Haven Independent'], ['Reporter', 'Yale Daily News'], ['Store Attendant', '{Place} General Store'],
    ],
  },
};

// Generic noise: ordinary roles across the economy (never leads for any profile).
const NOISE = [
  ['Senior Accountant', '{Last} and Partners CPAs'], ['Tax Manager', '{Place} Accounting Group'], ['Attorney', '{Last} Law Offices'],
  ['Paralegal', '{Last} and {Last} LLP'], ['Branch Manager', '{Place} Savings Bank'], ['Loan Officer', 'First {Place} Bank'],
  ['Plant Manager', '{Place} Precision Machining'], ['Production Supervisor', '{Place} Plastics'], ['Quality Engineer', '{Place} Composites'],
  ['Dispatcher', '{Place} Trucking'], ['Warehouse Manager', '{Place} Logistics'], ['Realtor', '{Place} Realty'],
  ['Property Manager', '{Place} Property Management'], ['Project Manager', '{Place} Construction'], ['Estimator', '{Place} Builders'],
  ['Software Engineer', '{Place} Labs'], ['Senior Developer', 'Northwind Cloud'], ['Data Analyst', 'Brightpath Analytics'],
  ['Product Manager', 'Tidewater Software'], ['Account Executive', '{Place} Creative Agency'], ['Graphic Designer', '{Place} Design Studio'],
  ['Insurance Agent', '{Place} Insurance Agency'], ['Underwriter', 'Granite Mutual Insurance'], ['Teacher', '{Place} Elementary School'],
  ['Store Manager', '{Place} Hardware'], ['Owner', '{Place} Outfitters'], ['Program Coordinator', '{Place} Community Foundation'],
  ['HR Manager', '{Place} Manufacturing'], ['Recruiter', '{Place} Staffing'], ['Management Consultant', '{Last} Consulting'],
  ['Reporter', '{Place} Gazette'], ['Lineman', '{Place} Power and Light'], ['Sales Manager', '{Place} Motors'], ['Installer', '{Place} Solar'],
  ['Marketing Director', '{Place} Ski Area'], ['General Manager', '{Place} Resort'], ['Chef', '{Place} Tavern'],
  ['Operations Analyst', 'Summit Freight'], ['Electrician', '{Place} Electrical Contractors'], ['Financial Advisor', '{Place} Wealth Management'],
  ['Customer Service Rep', 'Northeast Utilities Billing'], ['Forester', '{Place} Timber'], ['Sawmill Supervisor', '{Place} Lumber'],
  ['Executive Assistant', '{Last} Holdings'], ['Controller', '{Place} Industries'], ['IT Manager', '{Place} Paper Company'],
  ['Pastor', '{Place} Community Church'], ['Librarian', '{Place} University Library'], ['Veterinarian', '{Place} Animal Hospital'],
  ['Pharmacist', '{Place} Pharmacy'], ['Mechanic', '{Place} Auto Repair'], ['Barista', '{Place} Coffee'], ['Photographer', 'Self-employed'],
  ['Partner', '{Place} Ventures'], ['Principal', '{Last} Capital Partners'], ['Brand Strategist', 'Clearline Media'],
  ['Retail Associate', '{Place} Boutique'], ['Nurse', '{Place} Hospital'], ['Registered Nurse', '{Place} Medical Center'],
];

// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function norm(tpl) {
  return Array.isArray(tpl) ? { title: tpl[0], company: tpl[1] } : { ...tpl };
}

/**
 * Build one labelled pool. Returns { profile, people: [{full_name, company, title, location, label, group, motivating}] }.
 */
export function buildPool(profile, { seed = 7, size = 400, realworld = false } = {}) {
  const rand = mulberry32(seed * 1000 + profile.key.length * 31 + profile.key.charCodeAt(0));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const usedNames = new Set();
  const personName = () => {
    for (;;) { const n = `${pick(FIRST)} ${pick(LAST)}`; if (!usedNames.has(n)) { usedNames.add(n); return n; } }
  };
  const fill = (s, state) => s
    .replace(/\{Place\}/g, () => pick(PLACES))
    .replace(/\{Last\}/g, () => pick(LAST))
    .replace(/\{State\}/g, () => STATE_NAMES[state]);
  const people = [];
  const make = (tpl, label, group, inRegionProb) => {
    const t = norm(tpl);
    const state = t.state || (rand() < inRegionProb ? pick(profile.region) : pick(ALL_STATES));
    const loc = rand() < 0.08 ? null : `${pick(PLACES)}, ${STATE_NAMES[state]}, United States`;
    const name = t.name && !usedNames.has(t.name) ? t.name : personName();
    usedNames.add(name);
    people.push({
      full_name: name, title: fill(t.title, state), company: fill(t.company, state), location: loc,
      label, group, motivating: Boolean(t.motivating), rw: Boolean(t.rw),
    });
  };
  const cycle = (tpls, n, label, group, p) => {
    for (let i = 0; i < n; i++) make(tpls[i % tpls.length], label, group, p);
  };
  cycle(profile.customers, 20, 'customer', 'customer', 0.75);
  cycle(profile.connectors, 10 + (profile.connectors.length > 10 ? 2 : 0), 'connector', 'connector', 0.8);
  cycle(profile.distractors, profile.distractors.length + 4, null, 'distractor', 0.6);
  // Cross-profile people (customers/connectors of other businesses), never "generic" connectors.
  const others = PROFILES.filter((p) => p.key !== profile.key)
    .flatMap((p) => [...p.customers, ...p.connectors].filter((t) => !(t && t.generic) && !(t && t.motivating)));
  cycle(others.sort(() => rand() - 0.5), 110, null, 'other-profile', 0.4);
  while (people.length < size) make(pick(NOISE), null, 'noise', 0.45);
  // Appended last, so the base pool above is identical with or without them.
  const rw = realworld ? REALWORLD[profile.key] : null;
  if (rw) {
    for (const l of rw.leads) make({ ...l, rw: true }, l.label, l.label, 0.8);
    for (const d of rw.distractors) make({ ...norm(d), rw: true }, null, 'rw-distractor', 0.6);
  }
  return { profile, people };
}

export { STATE_NAMES };

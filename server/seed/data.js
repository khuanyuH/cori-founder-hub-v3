// Synthetic seed data. Every person name here is invented. Organisation names are invented
// except a few public institutions/associations used as employers (no real people attached).

export const MEMBERS = [
  { key: 'dana', name: 'Dana Whitcomb', email: 'dana@brightchair.example', org: 'BrightChair', role: 'founder' },
  { key: 'luis', name: 'Luis Arandela', email: 'luis@fieldloop.example', org: 'FieldLoop', role: 'founder' },
  { key: 'priya', name: 'Priya Ramaswell', email: 'priya@ridgecare.example', org: 'RidgeCare Telehealth', role: 'founder' },
  { key: 'marcus', name: 'Marcus Tillbrook', email: 'marcus@skillpath.example', org: 'SkillPath Works', role: 'founder' },
  { key: 'eleanor', name: 'Eleanor Hastwell', email: 'eleanor@board.example', org: 'CORI Board (former regional health system COO)', role: 'board' },
  { key: 'thomas', name: 'Thomas Reyburn', email: 'thomas@board.example', org: 'CORI Board (community banking, angel investor)', role: 'board' },
  { key: 'grace', name: 'Grace Lindqvale', email: 'grace@cori-staff.example', org: 'CORI', role: 'staff' },
  { key: 'sam', name: 'Sam Okonjo', email: 'sam@mentor.example', org: 'Go-to-market mentor', role: 'mentor' },
];

export const BUSINESSES = {
  dana: {
    name: 'BrightChair',
    description: 'Scheduling, insurance billing and patient reminders for independent dental offices. Replaces paper day sheets and clunky practice-management add-ons.',
    industry: 'dental practice software',
    target_customers: 'independent dental offices, small group dental practices, dental service organizations (DSOs)',
    geography: 'New England',
    needs: 'fractional CFO; sales lead with dental industry experience',
    customer_industries: ['dental'],
    lead_types: ['customer', 'connector', 'partner'],
  },
  luis: {
    name: 'FieldLoop',
    description: 'Low-cost soil moisture sensors and a simple farm management app for small and mid-size farms.',
    industry: 'agricultural technology',
    target_customers: 'small farms, dairy farms, farm cooperatives, agricultural extension services',
    geography: 'Upper Midwest and Northeast',
    needs: 'hardware engineer; channel partners such as equipment dealers',
    customer_industries: ['agriculture', 'livestock'],
    lead_types: ['customer', 'connector', 'partner'],
  },
  priya: {
    name: 'RidgeCare Telehealth',
    description: 'Telehealth visits and remote patient monitoring built for rural clinics and critical access hospitals with thin IT staff.',
    industry: 'telehealth',
    target_customers: 'rural health clinics, critical access hospitals, community health centers',
    geography: 'Appalachia',
    needs: 'marketing lead',
    customer_industries: ['healthcare_providers'],
    lead_types: ['customer', 'connector', 'partner'],
  },
  marcus: {
    name: 'SkillPath Works',
    description: 'Workforce-training SaaS that helps community colleges launch short-term credential programs with local employers.',
    industry: 'workforce development software for education',
    target_customers: 'community colleges, technical colleges, workforce development boards, regional employers',
    geography: 'Rural Midwest and South',
    needs: 'head of sales',
    customer_industries: ['higher_education', 'workforce_development'],
    lead_types: ['customer', 'connector', 'partner'],
  },
};

// Primary-contact targets per member (overlap adds more on top).
export const TARGETS = { dana: 170, luis: 180, priya: 175, marcus: 160, eleanor: 205, thomas: 200, grace: 225, sam: 185 };

// Cluster weights per member.
export const AFFINITY = {
  dana: { dental_practice: 6, dental_vendor: 3, corporate: 3, finance: 1, talent: 1 },
  luis: { agriculture: 7, government: 2, finance: 2, corporate: 2, education: 1 },
  priya: { rural_health: 7, government: 1, corporate: 2, finance: 1, talent: 1 },
  marcus: { education: 7, government: 3, corporate: 2, finance: 1 },
  eleanor: { rural_health: 4, dental_practice: 1, finance: 2, corporate: 2, government: 1, talent: 1 },
  thomas: { finance: 6, talent: 3, corporate: 3, agriculture: 1 },
  grace: { government: 4, education: 2, finance: 2, agriculture: 2, rural_health: 1, talent: 2, corporate: 1 },
  sam: { corporate: 5, talent: 3, finance: 2, dental_vendor: 1, education: 1 },
};

export const CITIES = {
  NH: ['Concord', 'Keene', 'Manchester', 'Laconia', 'Littleton', 'Lebanon', 'Portsmouth', 'Plymouth'],
  VT: ['Burlington', 'Montpelier', 'Rutland', 'St. Johnsbury', 'Brattleboro', 'Middlebury'],
  ME: ['Bangor', 'Augusta', 'Presque Isle', 'Lewiston', 'Portland', 'Farmington'],
  MA: ['Pittsfield', 'Greenfield', 'Worcester', 'Springfield', 'Northampton'],
  CT: ['Torrington', 'Hartford', 'New London', 'Willimantic'],
  WV: ['Elkins', 'Beckley', 'Charleston', 'Morgantown', 'Lewisburg'],
  KY: ['Hazard', 'Pikeville', 'London', 'Morehead', 'Somerset'],
  TN: ['Cookeville', 'Johnson City', 'Crossville', 'Kingsport'],
  VA: ['Abingdon', 'Wise', 'Marion', 'Blacksburg'],
  IA: ['Decorah', 'Ames', 'Mason City', 'Spencer', 'Ottumwa'],
  MN: ['Willmar', 'Mankato', 'Bemidji', 'Fergus Falls', 'Marshall'],
  WI: ['Eau Claire', 'Viroqua', 'Wausau', 'Platteville', 'Rice Lake'],
  NE: ['Kearney', 'Norfolk', 'Scottsbluff', 'Grand Island'],
  MO: ['Kirksville', 'Rolla', 'West Plains', 'Sedalia'],
  AR: ['Batesville', 'Harrison', 'Russellville', 'Mountain Home'],
  NY: ['Plattsburgh', 'Watertown', 'Oneonta', 'Saranac Lake'],
  CO: ['Durango', 'Alamosa', 'Salida', 'Montrose'],
  OTHER: ['Boston, MA', 'New York, NY', 'Chicago, IL', 'Denver, CO', 'Atlanta, GA', 'Minneapolis, MN', 'Austin, TX'],
};
const NE = ['NH', 'VT', 'ME', 'MA', 'CT'];
const APP = ['WV', 'KY', 'TN', 'VA'];
const MW = ['IA', 'MN', 'WI', 'NE', 'MO'];

// Organisations by cluster: [name, states[], titles[]]
export const ORGS = {
  dental_practice: [
    ['Riverbend Family Dentistry', ['NH'], null], ['Granite Peaks Dental', ['NH'], null], ['Lakes Region Smiles', ['NH'], null],
    ['Monadnock Dental Care', ['NH'], null], ['Seacoast Pediatric Dentistry', ['NH'], null], ['Green Mountain Dental Group', ['VT'], null],
    ['Champlain Valley Dentistry', ['VT'], null], ['Northeast Kingdom Dental', ['VT'], null], ['Pine Tree Family Dental', ['ME'], null],
    ['Downeast Dental Associates', ['ME'], null], ['Kennebec Smile Studio', ['ME'], null], ['Berkshire Hills Dental', ['MA'], null],
    ['Pioneer Valley Orthodontics', ['MA'], null], ['Litchfield County Dental', ['CT'], null], ['Quiet Corner Dental', ['CT'], null],
    ['White River Dental Arts', ['VT'], null], ['Merrimack Family Dentistry', ['NH'], null], ['Aroostook Dental Center', ['ME'], null],
    ['Harbor Smiles Dental Group', NE, null], ['Seacoast Dental Partners', NE, null],
  ],
  dental_vendor: [
    ['Northeast Dental Supply Co.', NE, ['VP Sales', 'Territory Manager', 'Account Executive', 'Regional Sales Director', 'Customer Success Manager']],
    ['Granite Dental Lab', ['NH'], ['Owner', 'Lab Manager', 'Account Manager']],
    ['ClearClaim Dental Billing', NE, ['Founder', 'Billing Specialist', 'Operations Manager']],
    ['Molar Analytics', ['OTHER'], ['Product Manager', 'Software Engineer', 'Head of Partnerships']],
    ['Coastal Dental Equipment Services', NE, ['Service Technician', 'General Manager', 'Sales Representative']],
  ],
  rural_health: [
    ['Highland Valley Hospital', ['WV'], null], ['Cumberland Plateau Community Clinic', ['TN'], null],
    ['Allegheny Highlands Health Center', ['VA'], null], ['Big Sandy Rural Health Clinic', ['KY'], null],
    ['Tug Fork Medical Center', ['WV'], null], ['Clinch River Family Health', ['VA'], null],
    ['Laurel County Critical Access Hospital', ['KY'], null], ['North Country Regional Hospital', ['NH'], null],
    ['Prairie Ridge Health', ['IA'], null], ['Driftless Area Clinic', ['WI'], null], ['Ozark Mountain Health Partners', ['AR'], null],
    ['Upper Peninsula Rural Health', ['OTHER'], null], ['Appalachian Rural Health Network', APP, ['Executive Director', 'Program Manager', 'Policy Director', 'Membership Coordinator']],
    ['Kentucky Rural Hospital Coalition', ['KY'], ['Executive Director', 'Director of Member Relations', 'Policy Analyst']],
  ],
  agriculture: [
    ['Maple Hollow Farm', ['VT'], ['Owner', 'Farm Manager']], ['Twin Creek Dairy', ['WI'], ['Owner', 'Herd Manager']],
    ['Prairie Sky Organics', ['IA'], ['Owner', 'Operations Manager']], ['Upper Midwest Grain Cooperative', MW, ['General Manager', 'Agronomist', 'Member Services Director', 'CFO']],
    ['Driftless Growers Co-op', ['WI'], ['General Manager', 'Field Coordinator']], ['Cedar River Seed Co.', ['IA'], ['Sales Agronomist', 'Regional Sales Manager']],
    ['Prairie Implement Co.', MW, ['Dealer Principal', 'Precision Ag Specialist', 'Parts Manager', 'Sales Manager']],
    ['Heartland Farmers Alliance', MW, ['Executive Director', 'Membership Director', 'Policy Director']],
    ['Northeast Organic Growers Association', NE, ['Executive Director', 'Program Coordinator']],
    ['County Cooperative Extension', MW.concat(['VT', 'NY']), ['Extension Educator', 'County Extension Director', 'Dairy Specialist', 'Ag Business Specialist']],
    ['Green Mountain Grazing Association', ['VT'], ['Executive Director', 'Board Chair']],
    ['Riverside Orchards', ['NY'], ['Owner', 'Orchard Manager']], ['Sandhill Cattle Company', ['NE'], ['Owner', 'Ranch Manager']],
  ],
  education: [
    ['Cedar Valley Community College', ['IA'], null], ['Red Clay Community College', ['AR'], null],
    ['Big Timber Technical College', ['MN'], null], ['Lakeshore Plains Community College', ['WI'], null],
    ['Ozark Highlands Technical College', ['MO'], null], ['Blue Ridge Valley Community College', ['VA'], null],
    ['Prairie Wind Community College', ['NE'], null], ['Tri-County Workforce Development Board', MW, ['Executive Director', 'Business Services Manager', 'Career Navigator']],
    ['Rural Community College Alliance', MW.concat(APP), ['Executive Director', 'Director of Programs']],
    ['Northern Lakes School District', ['MN'], ['Superintendent', 'Career and Technical Education Coordinator', 'Teacher']],
  ],
  government: [
    ['State Department of Agriculture', MW.concat(NE), ['Deputy Commissioner', 'Program Director', 'Grants Manager', 'Policy Advisor']],
    ['State Office of Rural Health', APP.concat(MW), ['Director', 'Rural Health Program Manager', 'Telehealth Coordinator']],
    ['County Economic Development Office', MW.concat(APP, NE), ['Economic Development Director', 'Business Retention Specialist']],
    ['Regional Planning Commission', NE.concat(MW), ['Executive Director', 'Senior Planner']],
    ['State Department of Labor and Workforce', MW.concat(APP), ['Workforce Programs Director', 'Apprenticeship Coordinator']],
    ['Town of Littleton', ['NH'], ['Town Manager', 'Selectboard Member']],
    ['Small Business Development Center', NE.concat(MW, APP), ['Business Advisor', 'State Director']],
  ],
  finance: [
    ['Granite Hills Community Bank', ['NH'], ['President', 'Commercial Lender', 'VP Commercial Lending', 'Branch Manager']],
    ['Prairie State Credit Union', ['IA'], ['CEO', 'Member Business Lender', 'VP Lending']],
    ['Riverbend CDFI', APP, ['Executive Director', 'Loan Officer', 'Director of Lending']],
    ['Heartland Ag Credit', MW, ['Relationship Manager', 'Senior Loan Officer', 'Regional President']],
    ['Ridgeline Ventures', ['OTHER'], ['General Partner', 'Principal', 'Associate', 'Venture Partner']],
    ['Heartland Seed Fund', MW, ['Managing Partner', 'Investment Associate']],
    ['Northwoods Angels', ['MN', 'WI'], ['Angel Investor', 'Network Director']],
    ['Blue Mesa Capital', ['CO'], ['Partner', 'Analyst']],
    ['Appalachian Growth Fund', APP, ['Managing Director', 'Investment Manager']],
    ['New England Impact Partners', NE, ['Partner', 'Senior Associate']],
  ],
  talent: [
    ['Ledgerline Advisors', ['OTHER', 'NH', 'VT'], ['Fractional CFO', 'Fractional Controller', 'Senior Accountant']],
    ['Northstar Growth Partners', ['OTHER', 'MA'], ['Fractional CMO', 'Marketing Lead', 'Growth Marketing Consultant']],
    ['Independent Consultant', ['OTHER', 'IA', 'VT', 'WV'], ['Fractional CFO', 'Fractional Head of Sales', 'Marketing Consultant', 'Fractional COO', 'Hardware Engineering Consultant']],
    ['Summit Talent Group', ['OTHER'], ['Executive Recruiter', 'Talent Partner']],
    ['Keel Interim Executives', ['OTHER'], ['Interim CFO', 'Interim VP Sales']],
  ],
  corporate: [
    ['Summit Logistics', ['OTHER'], null], ['Brightwave Software', ['OTHER'], null], ['Keystone Insurance Group', ['OTHER', 'CT'], null],
    ['Pioneer Precision Manufacturing', MW, null], ['Clearwater Outfitters', ['ME', 'OTHER'], null], ['Atlas Strategy Consulting', ['OTHER'], null],
    ['Evergreen Hollis LLP', ['OTHER', 'MA'], null], ['Lumen Retail Systems', ['OTHER'], null], ['Copperline Telecom', APP.concat(['OTHER']), null],
    ['Northfield Mutual', ['OTHER', 'VT'], null], ['Harvest Table Foods', MW, null], ['Ironwood Energy', ['OTHER', 'CO'], null],
  ],
};

export const DEFAULT_TITLES = {
  dental_practice: ['Practice Owner, DDS', 'Dentist', 'Office Manager', 'Practice Administrator', 'Billing Coordinator',
    'Dental Hygienist', 'Front Desk Lead', 'Associate Dentist, DMD', 'Insurance Coordinator'],
  rural_health: ['Chief Executive Officer', 'Chief Medical Officer', 'Chief Nursing Officer', 'Director of Telehealth',
    'Practice Manager', 'Family Physician', 'Nurse Practitioner', 'Chief Information Officer', 'Director of Quality', 'Clinic Manager'],
  education: ['President', 'Dean of Workforce Development', 'Director of Continuing Education', 'Vice President of Academic Affairs',
    'Instructor', 'Director of Corporate Training', 'Grants Director', 'Registrar'],
  corporate: ['Software Engineer', 'Product Manager', 'Account Executive', 'Marketing Manager', 'Operations Manager',
    'HR Business Partner', 'Financial Analyst', 'VP Marketing', 'Director of Sales', 'Customer Success Manager',
    'Associate Attorney', 'Data Analyst', 'Chief Financial Officer', 'Head of People', 'Project Manager'],
};

export const FIRST_NAMES = [
  'Avery', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Taylor', 'Jamie', 'Quinn', 'Reese', 'Rowan', 'Emerson', 'Harper',
  'Elena', 'Marisol', 'Nadia', 'Ingrid', 'Beatrix', 'Clara', 'Delia', 'Fiona', 'Greta', 'Hollis', 'Imogen', 'June',
  'Keira', 'Lena', 'Maren', 'Noor', 'Opal', 'Petra', 'Rosalind', 'Sabine', 'Tessa', 'Una', 'Vera', 'Willa', 'Yara', 'Zora',
  'Abel', 'Bram', 'Cyrus', 'Dmitri', 'Elias', 'Felix', 'Gideon', 'Henrik', 'Isaac', 'Jonah', 'Kofi', 'Leon', 'Malik',
  'Nolan', 'Otto', 'Pavel', 'Rafael', 'Silas', 'Tobias', 'Uriel', 'Victor', 'Wesley', 'Xavier', 'Yusuf', 'Zane',
  'Amara', 'Bianca', 'Celeste', 'Dalia', 'Esme', 'Farah', 'Gemma', 'Hana', 'Iris', 'Jada', 'Kaia', 'Lucia', 'Mina',
  'Ansel', 'Booker', 'Caleb', 'Dorian', 'Ezra', 'Fletcher', 'Grant', 'Hugo', 'Ivan', 'Jasper', 'Kenji', 'Lars', 'Mateo',
  'Priyanka', 'Ravi', 'Sanjay', 'Mei', 'Wen', 'Hiroshi', 'Aiko', 'Tariq', 'Leila', 'Omar', 'Chidi', 'Ngozi', 'Tomasz',
];

export const LAST_NAMES = [
  'Abernathy', 'Bellweather', 'Calder', 'Dunmore', 'Ellsworth', 'Farrington', 'Galloway', 'Hartwell', 'Ingersoll',
  'Jessup', 'Kettering', 'Lockridge', 'Marchetti', 'Northcott', 'Oakhurst', 'Pemberton', 'Quarles', 'Radcliffe',
  'Stanhope', 'Thornbury', 'Underhill', 'Vandermeer', 'Whitlock', 'Yardley', 'Zellweger', 'Ashcombe', 'Brightwater',
  'Copeland', 'Delacroix', 'Eastwick', 'Fairbanks', 'Greenhalgh', 'Holloway', 'Iverson', 'Jaramillo', 'Kowalski',
  'Lindqvist', 'Mbeki', 'Nakamura', 'Okafor', 'Petrakis', 'Quintero', 'Rasmussen', 'Szabo', 'Takahashi', 'Ulrich',
  'Varga', 'Wojcik', 'Yamamoto', 'Zielinski', 'Ambrose', 'Blackwood', 'Castellano', 'Dimitrov', 'Escobedo', 'Fenwick',
  'Gutierrez', 'Haddad', 'Ishikawa', 'Jovanovic', 'Kaminski', 'Lachance', 'Moreau', 'Nwosu', 'Ostrowski', 'Pellegrino',
  'Rousseau', 'Sorensen', 'Trudeau', 'Upton', 'Valente', 'Wexford', 'Albright', 'Birchfield', 'Crestwood', 'Danforth',
  'Everly', 'Foxworth', 'Gladstone', 'Hawthorne', 'Kingsley', 'Langford', 'Merriweather', 'Norwood', 'Ashby', 'Prescott',
  'Rockwell', 'Sutherland', 'Tremblay', 'Vasquez', 'Winslow', 'Achebe', 'Bergstrom', 'Chandrasekar', 'Duarte', 'Eklund',
  'Fitzgerald', 'Gallardo', 'Hennessey', 'Iqbal', 'Juarez', 'Kerrigan', 'Lindgren', 'Mahoney', 'Nikolaidis', 'Oyelaran',
];

// Hand-placed people: the BrightChair / New Hampshire Dental Society scenario and a few others.
// edges: [memberKey, source, extra]
export const SCENARIO_PEOPLE = [
  {
    full_name: 'Ruth Calloway', title: 'Director of Member Services', company: 'New Hampshire Dental Society', location: 'Concord, NH',
    edges: [
      ['eleanor', 'manual', { note: 'Served together on the state oral-health task force. Ruth runs member programs for every dental office in NH. Happy to introduce.' }],
      ['eleanor', 'calendar', { interactions: 7 }],
    ],
  },
  { full_name: 'Martin Ashcroft', title: 'Executive Director', company: 'Vermont State Dental Society', location: 'Montpelier, VT',
    edges: [['eleanor', 'linkedin', {}], ['eleanor', 'email_headers', { interactions: 4 }]] },
  { full_name: 'Colleen Mercerau', title: 'Director of Practice Support', company: 'Maine Dental Association', location: 'Augusta, ME',
    edges: [['eleanor', 'google_contacts', {}]] },
  { full_name: 'Derek Oyelaran', title: 'Membership Manager', company: 'Massachusetts Dental Society', location: 'Southborough, MA',
    edges: [['eleanor', 'linkedin', {}], ['sam', 'linkedin', {}]] },
  { full_name: 'Janet Pruettman', title: 'Executive Director', company: 'New England Rural Health Association', location: 'Concord, NH',
    edges: [['eleanor', 'manual', { note: 'Longtime colleague from the hospital-association world.' }], ['grace', 'linkedin', {}]] },
  { full_name: 'Hector Villanova', title: 'Program Director', company: 'Granite State Oral Health Coalition', location: 'Manchester, NH',
    edges: [['eleanor', 'calendar', { interactions: 3 }]] },
  { full_name: 'Brian Kowalcek', title: 'VP Sales', company: 'Northeast Dental Supply Co.', location: 'Portsmouth, NH',
    edges: [['eleanor', 'linkedin', {}], ['sam', 'outlook_contacts', {}]] },
  { full_name: 'Alicia Moreland', title: 'President', company: 'Connecticut State Dental Association', location: 'Hartford, CT',
    edges: [['eleanor', 'roster', {}]] },
  // BrightChair's own customers (already in Dana's network).
  { full_name: 'Paula Grenier', title: 'Office Manager', company: 'Riverbend Family Dentistry', location: 'Keene, NH',
    edges: [['dana', 'manual', { note: 'Pilot customer since 2025.' }], ['dana', 'email_headers', { interactions: 23 }]] },
  { full_name: 'Owen Thibodeaux', title: 'Practice Owner, DDS', company: 'Monadnock Dental Care', location: 'Peterborough, NH',
    edges: [['dana', 'linkedin', {}], ['dana', 'calendar', { interactions: 5 }]] },
  // Talent for BrightChair's "fractional CFO" need.
  { full_name: 'Nadia Brennaman', title: 'Fractional CFO', company: 'Ledgerline Advisors', location: 'Burlington, VT',
    edges: [['thomas', 'manual', { note: 'Ran finance for two seed-stage health software companies. Excellent.' }], ['grace', 'linkedin', {}]] },
  { full_name: 'Victor Albrecht', title: 'Fractional CFO', company: 'Independent Consultant', location: 'Concord, NH',
    edges: [['sam', 'linkedin', {}]] },
  // Other founders' scenarios.
  { full_name: 'Marguerite Okonkwo-Hale', title: 'Director of Telehealth', company: 'Highland Valley Hospital', location: 'Elkins, WV',
    edges: [['eleanor', 'calendar', { interactions: 9 }], ['grace', 'linkedin', {}]] },
  { full_name: 'Gunnar Thorsby', title: 'County Extension Director', company: 'County Cooperative Extension', location: 'Decorah, IA',
    edges: [['grace', 'manual', { note: 'Runs the regional farm-tech field days.' }], ['thomas', 'linkedin', {}]] },
  { full_name: 'Delphine Arceneaux', title: 'Dean of Workforce Development', company: 'Cedar Valley Community College', location: 'Ames, IA',
    edges: [['grace', 'email_headers', { interactions: 12 }]] },
];

export const NOTE_TEMPLATES = [
  'Former colleague; happy to make an introduction.',
  'Served together on a regional nonprofit board.',
  'Met through a CORI convening; responsive and well connected.',
  'Neighbour and friend. Knows everyone in the local business community.',
  'Worked on a grant together last year.',
  'Customer of my previous company.',
];

// ---------------------------------------------------------------------------
// Addendum 3: demo accounts, forum threads and job posts. All invented.
// ---------------------------------------------------------------------------

/** Every seeded demo member signs in with their seed email and this password. Synthetic data only. */
export const DEMO_PASSWORD = 'rural-demo-2026';

export const MEMBER_PROFILES = {
  dana: { headline: 'Founder at BrightChair. Software for independent dental offices.', location: 'Keene, NH', bio: 'Former dental office manager. Started BrightChair after ten years of paper day sheets. Glad to talk about selling to small practices.' },
  luis: { headline: 'Founder at FieldLoop. Soil sensors for small farms.', location: 'Viroqua, WI', bio: 'Grew up on a dairy farm. Hardware and field sales are my days. Ask me about pilots with co-ops.' },
  priya: { headline: 'Founder at RidgeCare Telehealth.', location: 'Pikeville, KY', bio: 'Nurse practitioner turned founder. I know rural clinic operations and reimbursement.' },
  marcus: { headline: 'Founder at SkillPath Works. Workforce training software.', location: 'Wilson, NC', bio: 'Built training programs at two community colleges before SkillPath.' },
  eleanor: { headline: 'CORI board. Former regional health system COO.', location: 'Concord, NH', bio: 'Thirty years in health system operations in New England. Happy to make introductions when I can vouch for the fit.' },
  thomas: { headline: 'CORI board. Community banker and angel investor.', location: 'Red Wing, MN', bio: 'I back rural founders at the first-check stage. Send me your questions about bank debt and early rounds.' },
  grace: { headline: 'CORI staff. Portfolio support.', location: 'Hartland, VT', bio: 'I run founder programs at CORI. If you do not know who to ask, ask me.' },
  sam: { headline: 'Go-to-market mentor. Four B2B launches.', location: 'Springfield, MO', bio: 'I help founders find their first twenty customers and their first sales hire.' },
};

// [author, category, title, body, hoursAgo, voters[], comments[]]; comment = [key, author, parentKey|null, body]
export const FORUM_THREADS = [
  ['dana', 'sales', 'How do you get a first meeting with a state trade association?',
    'BrightChair sells to dental offices. One association endorsement would reach hundreds of them. I have a warm intro to one director through the hub. What do you bring to that first call? A pilot offer? A member discount? I do not want to waste the one shot.',
    5, ['luis', 'priya', 'eleanor', 'sam', 'grace'], [
      ['a', 'eleanor', null, 'Bring one member of theirs who already uses you. Associations move when a member asks, not when a vendor asks.'],
      ['b', 'sam', null, 'Ask about their non-dues revenue goals before you pitch. Most associations have an affinity program with a set revenue share. Fit your offer into that program.'],
      ['c', 'dana', 'b', 'That is useful. Is a revenue share normal even for a small pilot?'],
      ['d', 'sam', 'c', 'Yes. Keep it simple: a flat member discount plus a small share back to the association. Put an end date on the pilot.'],
      ['e', 'luis', 'a', 'Same with farm bureaus. A member champion got us on the agenda in two weeks after months of cold email.'],
    ]],
  ['priya', 'fundraising', 'Bank debt or a priced round for a hardware purchase?',
    'We need about 180 remote monitoring kits for a hospital contract. The contract is signed. Has anyone financed inventory with a community bank instead of selling equity? What did the bank ask for?',
    20, ['thomas', 'dana', 'marcus'], [
      ['a', 'thomas', null, 'A signed contract with a creditworthy hospital is good collateral. Ask for an equipment line, not a term loan. Expect a personal guarantee at your stage. Many rural banks also know the USDA guarantee programs well.'],
      ['b', 'priya', 'a', 'Thank you. I will ask about the guarantee programs. Is three years of financials a hard requirement?'],
      ['c', 'thomas', 'b', 'Not always. The contract and your cash forecast carry more weight for a young company.'],
    ]],
  ['marcus', 'hiring', 'First sales hire: commission-only or base plus commission?',
    'We close community colleges on a nine-month cycle. I can not afford a senior salary. Has commission-only worked for anyone with a long sales cycle?',
    30, ['sam', 'dana'], [
      ['a', 'sam', null, 'Commission-only fails on long cycles. The rep runs out of money before the first deal closes. Pay a modest base and a larger payout on signed contracts.'],
      ['b', 'grace', null, 'Two portfolio companies used a fractional head of sales for the first six months. I can connect you with both founders.'],
    ]],
  ['luis', 'help', 'Need a contract manufacturer for 500 sensor units',
    'Our current shop will not go below 2,000 units. Does anyone know a small-run electronics manufacturer in the Midwest? Enclosures are injection moulded and need an IP67 rating.',
    52, ['grace', 'thomas', 'marcus', 'priya'], [
      ['a', 'grace', null, 'Search the hub for "contract manufacturing". Thomas and I both know people at two shops in Minnesota and Wisconsin.'],
      ['b', 'luis', 'a', 'Found them. Sent two intro requests. Thank you.'],
    ]],
  ['grace', 'general', 'Welcome to the forum: how to use it',
    'This board is for members only. Ask for help, share what worked, and answer when you can. Three habits keep it useful. Put the ask in the title. Say what you already tried. Close the loop when you get an answer.',
    96, ['dana', 'luis', 'priya', 'marcus', 'eleanor', 'thomas', 'sam'], [
      ['a', 'eleanor', null, 'Glad this exists. Board members read it too, so do ask.'],
    ]],
  ['dana', 'wins', 'Signed our first multi-site dental group',
    'Seven locations in Connecticut. The introduction came through the hub. Eleanor knew the operations lead from a state task force. The whole cycle took five weeks.',
    120, ['eleanor', 'grace', 'sam', 'luis', 'thomas', 'priya'], [
      ['a', 'sam', null, 'Congratulations. Write down every step of that cycle while you remember it. It becomes your sales playbook.'],
    ]],
  ['thomas', 'advice', 'What a community banker looks for in a first meeting',
    'Founders ask me this often, so here it is in one place. One: twelve months of cash flow, even if it is a forecast. Two: who your customers are and how they pay. Three: what the money buys and how the loan gets repaid. Bring those three and the meeting goes well.',
    150, ['priya', 'dana', 'marcus', 'luis', 'grace'], []],
  ['sam', 'product', 'Pricing page or "contact us" for a small-business product?',
    'My view: publish a price when the deal is under five thousand dollars a year. Buyers at that size will not book a call to learn a number. What have others seen?',
    200, ['dana', 'marcus'], [
      ['a', 'dana', null, 'We published prices in March. Demo requests went down and closed deals went up. Fewer people booked a call only to learn the price.'],
    ]],
];

// [poster, title, company, location, workplace, employment_type, job_function, salary_min, salary_max, equity, description, apply_url, daysAgo]
export const JOB_POSTS = [
  ['dana', 'Account Executive, Dental Practices', 'BrightChair', 'Keene, NH', 'hybrid', 'full_time', 'sales', 70000, 95000, '0.25% - 0.5%',
    'Own the full sales cycle with independent dental offices in New England.\n\nWhat you will do\n- Run discovery calls and product demos with practice owners and office managers\n- Work association and study-club events\n- Build the playbook our next sales hires will use\n\nWhat we look for\n- Two or more years selling software to small businesses\n- Comfort with a 30 to 60 day sales cycle\n- Experience in dental or healthcare offices is a plus, not a requirement',
    'https://careers.brightchair.example/jobs/account-executive', 2],
  ['dana', 'Fractional CFO', 'BrightChair', 'Remote (New England preferred)', 'remote', 'fractional', 'finance', null, null, null,
    'About ten hours a month. Own the monthly close, the cash forecast and board reporting. Help us prepare for a seed round next year.\n\nYou have done this before for a subscription software company under two million dollars in revenue.',
    'https://careers.brightchair.example/jobs/fractional-cfo', 9],
  ['luis', 'Embedded Hardware Engineer', 'FieldLoop', 'Viroqua, WI', 'onsite', 'full_time', 'engineering', 95000, 125000, '0.5% - 1.0%',
    'Design the next generation of our soil moisture sensor.\n\nWhat you will do\n- Own the board design, firmware and test fixtures\n- Cut the bill of materials cost by a third\n- Spend real days in the field with farmers\n\nWhat we look for\n- Shipped at least one low-power wireless device\n- LoRa or cellular IoT experience\n- You like mud',
    'https://fieldloop.example/careers/embedded-hardware-engineer', 4],
  ['luis', 'Field Sales Representative, Upper Midwest', 'FieldLoop', 'Wisconsin and Minnesota', 'onsite', 'full_time', 'sales', 55000, 70000, null,
    'Sell FieldLoop to small and mid-size farms and to the co-ops and equipment dealers that serve them. You will drive a lot. A farm background matters more than a sales background.',
    'https://fieldloop.example/careers/field-sales', 15],
  ['priya', 'Clinical Implementation Lead', 'RidgeCare Telehealth', 'Pikeville, KY', 'hybrid', 'full_time', 'customer', 68000, 85000, '0.1% - 0.3%',
    'Take rural clinics and critical access hospitals from signed contract to first telehealth visit.\n\nYou will train nurses and front-desk staff, set up remote monitoring kits, and be the person clinics call. A nursing or clinic operations background is ideal.',
    'https://ridgecare.example/jobs/4012345678', 1],
  ['priya', 'Senior Full-Stack Engineer', 'RidgeCare Telehealth', 'Remote (US)', 'remote', 'full_time', 'engineering', 130000, 160000, '0.3% - 0.6%',
    'Build video visits and remote monitoring for clinics with slow internet and no IT staff. TypeScript, React and Postgres. You will own features end to end and talk to clinicians every week. HIPAA experience helps.',
    'https://ridgecare.example/jobs/4012345679', 6],
  ['marcus', 'Customer Success Manager, Community Colleges', 'SkillPath Works', 'Wilson, NC', 'hybrid', 'full_time', 'customer', 60000, 78000, null,
    'Own onboarding and renewals for our community college customers. You will work with workforce deans and program directors. Higher-education experience is a strong plus.',
    'https://skillpath.example/careers/customer-success-manager', 11],
  ['marcus', 'Product Design Intern (Summer)', 'SkillPath Works', 'Remote', 'remote', 'internship', 'design', null, null, null,
    'A paid twelve-week internship. Redesign the learner dashboard with our product lead. Students at community colleges and rural universities are encouraged to apply. Send a portfolio with one project you are proud of.',
    'https://skillpath.example/careers/design-intern', 20],
  ['grace', 'Entrepreneur in Residence', 'Center on Rural Innovation', 'Hartland, VT', 'hybrid', 'contract', 'operations', null, null, null,
    'A six-month contract. Coach founders in the CORI portfolio on go-to-market and fundraising. You have built and sold or scaled a company outside a major metro.',
    'https://cori-staff.example/careers/entrepreneur-in-residence', 7],
];

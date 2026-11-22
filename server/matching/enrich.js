// Heuristic person classifier. Pure, synchronous, no I/O.
// enrichPerson({ full_name, company, title, location }) -> { industries, org_type, job_function, seniority }
// analyzeOrg(...) gives the richer, search-time view (connector kind, vendor-of, early career, etc.).
//
// Order of evidence for the organisation:
//   1. pseudo-employers ("Self-employed", "Stealth Startup") carry no industry;
//   2. student / campus groups ("Yale Computer Society") are education, never associations;
//   3. the built-in company table (companies.js: McKinsey, Goldman Sachs, US Army...);
//   4. sports leagues, unions, advocacy / historical / legal-aid societies (never trade associations);
//   5. generic cues: "School of X", "University", "Institute", "Capital", "Ventures", "Partners"...;
//   6. taxonomy words in the company name, then in the title (title words count less).
// A trade/professional association needs a positive signal: an industry or profession term the
// taxonomy knows, or a chamber / business-league form. Without it there is no "connector".

import { INDUSTRIES, BY_ID, SERVICE_IDS, GOVERNMENT_IDS, normalize, matchIndustry, WEAK_QUERY_TERMS } from './taxonomy.js';
import { lookupCompany } from './companies.js';
import { parseGeo, locationState } from './geo.js';

// ---------------------------------------------------------------------------
// Title cleaning: "Software Engineer (former dentist)" must not look like a dentist.

export function cleanTitle(title) {
  let t = String(title || '');
  t = t.replace(/\((?:[^)]*\b(?:former|formerly|ex|retired|previously|past)\b[^)]*)\)/gi, ' ');
  t = t.replace(/\b(?:former(?:ly)?|ex|retired|previously|past)\b[\s-]*[^,;|/]*/gi, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Patterns (all applied to normalize()d text: lowercase words padded with single spaces)

const RE = (s) => new RegExp(s);
const P = {
  pseudo: RE('^ (self employed|selfemployed|freelance|freelancer|freelancing|independent|independent consultant|stealth|stealth startup|stealth mode|startup in stealth mode|stealth mode startup|confidential|various|n a|na|none|retired|unemployed|open to work|between jobs|career break|sabbatical|personal|private|homemaker|student) $'),
  investor: RE(' (venture capital|ventures?|venture partners|angels?|angel network|angel group|investors?|investments?|private equity|growth equity|seed fund|impact fund|growth fund|capital partners|capital management|asset management|investment management|investment partners|equity partners|family office|fund|capital) '),
  investorBlock: RE(' (capital (region|area|city|district|markets?|projects|campaign|improvement)|capital one|human capital|bank|credit union|hospital|health|memorial fund|scholarship fund|relief fund|defense fund|education fund|emergency fund|fund for|philanthropic|philanthropy|foundation|charitable|student|students|collegiate|undergraduate|investment challenge|insurance) '),
  partnersSuffix: RE(' (partners|advisors|advisers|holdings) $'),
  financeTitle: RE(' (analyst|associate|investment|investments|investor|investing|equity|capital|portfolio|principal|private equity|venture|deal|deals|fund|underwriting|valuation|trader|trading|m and a) '),
  equitySuffix: RE(' (equity|equity partners|venture partners|impact partners|capital advisors|capital advisers) $'),
  wealth: RE(' (wealth management|private wealth|wealth advisors|wealth partners|financial advisors|financial group|securities|brokerage) '),
  trading: RE(' (trading|traders) '),
  govStrong: RE(' (department of|dept of|division of|office of|bureau of|ministry of|agency of(?! record)|(?:community )?broadband (?:board|authority|commission|office)|board of (?!directors|trustees|advisors|governors)[a-z ]*?(examiners|registration|licensure|licensing|medicine|dentistry|pharmacy|nursing|education|health)|public (utilities|service) commission|state broadband office|broadband office|usda|small business administration|rural development|state of|commonwealth of|legislature|general assembly|house of delegates|state senate|state house|house of representatives|attorney general|district attorney|economic development administration|appalachian regional commission|delta regional authority|regional planning commission|planning commission|planning district|system office|conservation district|area agency on aging|national institutes? of|national laboratory|city council|county council|marine corps|armed forces|ministry) '),
  townCouncil: RE(' (city|town|village|county) (council|commission|board) '),
  assocForm: RE(' (association|associations|assn|society|societies|federation|alliance|league|guild|coalition|council|chamber of commerce|chamber|cooperative|co op|coop|farm bureau|consortium|network of|collaborative|resource center|ahec|area health education center|(american|national) (academy|college) of|[a-z]+ academy of|board of trade|business roundtable|institute of [a-z ]*?(accountants|architects|engineers|planners|bankers)) '),
  businessLeague: RE(' (chamber of commerce|chamber|board of trade|business association|business council|business league|business alliance|business roundtable|merchants association|retail merchants|downtown association|main street|farm bureau|ahec|area health education center|economic club|manufacturers association|industry association|trade association|bar association|medical society|dental society) '),
  profession: RE(' (bankers|accountants|cpas|lawyers|attorneys|architects|engineers|planners|realtors|nurses|physicians|surgeons|dentists|hygienists|pharmacists|veterinarians|librarians|superintendents|school boards|principals|counties|municipalities|towns|cities|mayors|manufacturers|retailers|grocers|insurers|agents|builders|contractors|farmers|growers|producers|foresters|loggers|truckers|restaurants|hotels|innkeepers|hospitals|clinics|health centers|credit unions|cooperatives|utilities|homebuilders|physician assistants|pas|optometrists|chiropractors|dealers|distributors|wholesalers|employers|nonprofits|economic developers|treasurers|clerks|assessors|educators|colleges|universities|community colleges|schools|providers) '),
  conceptSociety: RE(' (and|in|for) (society|societies) '),
  extension: RE(' (cooperative extension|extension service|extension office|extension educator|extension agent|extension specialist) '),
  higherEd: RE(' (university|universities|college|school of|college of|graduate school|law school|medical school|business school|dental school|nursing school|institute of technology|polytechnic|community college|technical college|universidad|universite|universitat|seminary) '),
  higherEdBlock: RE(' (college street|college hunks|electoral college|american college of|college of (surgeons|physicians|cardiology|emergency physicians|obstetricians|radiology|nurse midwives)|college savings|college board) '),
  k12: RE(' (high school|middle school|elementary school|primary school|public schools|school district|unified school|regional school|supervisory union|academy|prep school|preparatory|montessori|charter school|day school|country day|schools|school) '),
  institute: RE(' (institute|institutes|institution for|research center|research centre|laboratory|lab) '),
  businessSuffix: RE(' (inc|llc|ltd|corp|corporation|gmbh|plc|co) $'),
  provider: RE(' (hospital|hospitals|medical center|medical centre|health center|health system|healthcare system|health network|clinic|clinics|clinica|medical group|medical practice|family medicine|family practice|primary care|urgent care|physicians group|physician group|physicians|dentistry|dental care|dental group|dental associates|dental arts|dental studio|dental center|dental office|dental practice|family dental|pediatric dental|smiles|smile center|orthodontics|orthodontic specialists|endodontics|periodontics|oral surgery|oral and maxillofacial|pharmacy|nursing home|nursing and rehabilitation|rehabilitation center|home health|home care|hospice|assisted living|senior living|behavioral health|counseling center|recovery center|veterinary|animal hospital|dds|dmd|pc dental|dermatology|ambulance|cancer center) '),
  providerFirst: RE(' (hospital|hospitals|medical center|medical centre|health system|healthcare system|health network) '),
  medSchool: RE(' (school of medicine|medical school|college of medicine|school of dental|dental school|school of nursing|school of public health) '),
  govWeak: RE(' (town of|city of|village of|county of|county|municipal|township|borough|selectboard|select board|public works|water district|state agency|commission|authority|communications union district) '),
  govWeakBlock: RE(' (county (hospital|bank|savings|line|fair)|country) '),
  nonprofit: RE(' (foundation|nonprofit|non profit|food bank|food pantry|united way|community action|land trust|charity|ministries|habitat|fellowship|trust for|museum|library|endowment for|church|synagogue|temple|mosque|parish|diocese|memorial fund|scholarship fund|relief fund|philanthropic|fund for) '),
  // Never trade associations
  union: RE(' (labor union|labour union|trade union|workers union|district council|local [0-9]+|afscme|afl cio|seiu|teamsters|brotherhood|united auto workers|uaw|ibew|unite here|united steelworkers|federation of teachers|nurses union|union local|workers united|education association of) '),
  sports: RE(' (basketball|football|soccer|baseball|softball|hockey|lacrosse|rugby|volleyball|athletic|athletics|sports|sailing|skating|rowing|crew team|swimming|tennis|squash|track and field|cycling|fc|esports|nba|nfl|mlb|nhl|mls) '),
  causeSociety: RE(' (historical|historic|history|preservation|heritage|antiquarian|genealogical|arts|art|museum|symphony|orchestra|opera|ballet|dance|theater|theatre|choral|chorale|music|film|poetry|literary|humane|audubon|garden club|voters|legal aid|aid society|benevolent|charitable|mutual aid|relief|civil liberties|rights|advocacy|action fund|action network|conservancy|land trust|conservation voters|democracy|democratic|republican|progressive|peace|justice|immigrant|refugee) '),
  // Student / campus groups
  campusPrefix: RE('^ (the )?(yale|yales|harvard|stanford|mit|dartmouth|cornell|georgetown|lse|ucl|caltech|upenn|uchicago|wharton|dwight hall|princeton university|columbia university|brown university|duke university|nyu|tufts university) '),
  campusAt: RE(' at (yale|harvard|princeton|stanford|mit|dartmouth|cornell|georgetown|gw|gwu|columbia|brown|duke|penn|upenn|berkeley|ucla|usc|nyu|virginia|uva|michigan|unc|tufts|northwestern|uchicago|lse|oxford|cambridge|dwight hall|[a-z]+ (university|college)) '),
  studentWord: RE(' (student|students|undergraduate|undergraduates|undergrad|collegiate|su|student union|students union|alumni|alumnae|fraternity|sorority|class of|freshman|sophomore|first year|graduate students) '),
  studentForm: RE(' (association|society|club|council|collaborative|alliance|team|league|union|journal|review|magazine|daily news|daily|herald|record|orchestra|symphony|glee club|chorus|choir|ensemble|dancers|a cappella|whiffenpoofs|singers|players|fund|investors|investment group|consulting group|real estate group|chapter|caucus|corps|moot court|government|senate|agencies|program board|debate|debating|oratory union|summit|ball|dialogue) '),
  greek: RE('^ (the )?(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)( (alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)){1,2} '),
  campusMedia: RE(' (daily news|news|journal|magazine|review|herald|record|politic|press|radio|tv|television|scientific) '),
  // Words that mark a university UNIT (staffed); a campus-named org without one is a student group.
  campusUnit: RE(' (school|schools|department|dept|office|center|centre|institute|institution|lab|labs|laboratory|library|libraries|press|program|programs|college|museum|gallery|hospital|health|investments|university|initiative|admissions|athletics|police|dining|hospitality|facilities|sustainability|medicine|law|management|divinity|nursing|engineering|graduate|alumni|its|research|studies|study|fellowship|fellowships|observatory|garden|gardens|collection|collections|archives|clinic|press|service|services|council of masters|dean|deans|provost|president|presidents|chaplain|chaplains|cancer) '),
  alumni: RE(' (alumni|alumnae) '),
  campusDept: RE(' (yale|harvard|stanford|mit|princeton|columbia|cornell|dartmouth|brown|penn|upenn|duke|nyu|tufts|georgetown|berkeley|ucla|uchicago|northwestern|rutgers) (department|dept|school|division|program|center|centre|lab|laboratory|institute) of '),
};

// Industries that, when named in a campus-prefixed org ("Georgetown Family Dentistry"), mean it is not a campus unit.
// Government words also do not count: "Yale Department of Economics" is a university department, not a state agency.
const CAMPUS_OK = new Set(['higher_education', 'k12_education', 'media_publishing', 'nonprofit', 'libraries', ...SERVICE_IDS, ...GOVERNMENT_IDS]);

function strongIndustries(c) {
  const out = [];
  for (const ind of INDUSTRIES) {
    const hits = matchIndustry(ind, c).filter((h) => !WEAK_QUERY_TERMS.has(h));
    if (hits.length) out.push(ind.id);
  }
  return out;
}

// A prefix match in the company table is vetoed when the extra words name another industry.
const OTHER_SECTOR = RE(' (health|hospital|medical|dental|clinic|school|university|college|church|county|city|town|farm|farms|dentistry|insurance|realty|restaurant|foods?|motors|construction) ');
function tableConflict(rest, entry) {
  const r = normalize(rest);
  const own = new Set(entry.industries);
  if (strongIndustries(r).some((id) => !own.has(id) && !SERVICE_IDS.has(id) && !(id === 'banking' && own.has('investment')) && !(id === 'investment' && own.has('banking')))) return true;
  if (OTHER_SECTOR.test(r) && !entry.industries.some((id) => ['healthcare_providers', 'higher_education', 'life_sciences', 'health_it', 'insurance', 'grocery_retail', 'food_manufacturing', 'nonprofit'].includes(id))) return true;
  return false;
}

/** True when an association-form name carries a positive trade/professional signal. */
export function associationSignal(c) {
  if (P.businessLeague.test(c)) return true;
  if (P.profession.test(c)) return true;
  if (P.conceptSociety.test(c) && !/ (association|federation|league|guild|chamber) /.test(c)) return false;
  return strongIndustries(c).some((id) => id !== 'nonprofit');
}

const companyCache = new Map();

/**
 * Classify an organisation from its name (and, for weak cues only, the title).
 * @returns {{ industries: string[], org_type: string, known: boolean, student: boolean, sports: boolean,
 *            style: string|null, source: string, campus: boolean } | null}
 */
export function classifyCompany(company, title = '') {
  const c = normalize(company);
  if (!c.trim()) return null;
  const t = normalize(title);
  void t;
  const ck = c;
  const hit = companyCache.get(ck);
  if (hit) return hit;
  const res = classifyUncached(company, c, t);
  if (companyCache.size > 20000) companyCache.clear();
  companyCache.set(ck, res);
  return res;
}

function out(industries, org_type, source, extra = {}) {
  return { industries, org_type, source, known: true, student: false, sports: false, style: null, campus: false, ...extra };
}

function classifyUncached(raw, c, t) {
  if (P.pseudo.test(c)) return out([], 'other', 'pseudo');
  const table = lookupCompany(raw, tableConflict);
  const campus = P.campusPrefix.test(c) || P.campusAt.test(c);
  const studentGroup = !(table && table.match === 'exact') && (
    P.greek.test(c) ||
    (P.studentWord.test(c) && (P.studentForm.test(c) || campus || P.higherEd.test(c)) && !P.alumni.test(c)) ||
    (campus && P.studentForm.test(c) && !P.alumni.test(c) && !P.providerFirst.test(c)));
  if (studentGroup) {
    const media = P.campusMedia.test(c) && !/ (association|society|club) /.test(c);
    return out(media ? ['media_publishing', 'higher_education'] : ['higher_education'], 'education', 'student_group', { student: true, campus: true });
  }
  if (table) {
    return out([...table.industries], table.org_type, `table:${table.match}`, { style: table.style, sports: table.sports, name: table.name });
  }
  if (P.sports.test(c) && !P.provider.test(c)) {
    const edu = campus || P.higherEd.test(c);
    return out(edu ? ['higher_education'] : [], edu ? 'education' : 'company', 'sports', { sports: true, campus: edu });
  }
  if (P.union.test(c)) return out([], 'other', 'union');
  if (campus && !P.providerFirst.test(c)) {
    const strong = strongIndustries(c).filter((id) => !CAMPUS_OK.has(id));
    if (!strong.length && !P.campusUnit.test(c) && !P.alumni.test(c)) {
      // "Yale Democracy Project", "Asian Crossroads at Yale": campus-named, no university unit -> student group.
      return out(['higher_education'], 'education', 'student_group', { student: true, campus: true });
    }
    if (!strong.length || P.medSchool.test(c)) {
      const subj = strongIndustries(c).filter((id) => !SERVICE_IDS.has(id) && !GOVERNMENT_IDS.has(id) && id !== 'higher_education' && id !== 'nonprofit');
      return out(['higher_education', ...subj].slice(0, 3), 'education', P.alumni.test(c) ? 'alumni' : 'campus', { campus: true });
    }
  }
  if (P.assocForm.test(c) && P.causeSociety.test(c) && !P.businessLeague.test(c)) {
    return out(['nonprofit'], 'nonprofit', 'cause_society');
  }
  return null; // fall through to the generic rules in enrichPerson
}

// ---------------------------------------------------------------------------
// Organisation type from generic rules (company not known by the steps above)

function genericOrgType(c, t, industries) {
  if (!c.trim() && !t.trim()) return 'other';
  if (c.trim()) {
    if (P.investor.test(c) && !P.investorBlock.test(c)) return 'investor';
    if (P.townCouncil.test(c)) return 'government';
    // "University of Chicago Department of Mathematics" is a university, not a government department.
    if (/ (university|universities|college) /.test(c) && !P.higherEdBlock.test(c) && !/ (system office|board of regents|higher education commission) /.test(c) &&
      !P.providerFirst.test(c)) return 'education';
    // "Soft Matter Group, Yale Department of Chemical Engineering" is a university department, not a state agency.
    if (P.campusDept.test(c)) return 'education';
    if (P.govStrong.test(c)) return 'government';
    if (P.extension.test(c) || P.extension.test(t)) return 'education';
    // Research institutes ("Institute for Technology and Society") are academic, not associations.
    if (/ (institute|institutes) /.test(c) && !P.businessSuffix.test(c) && !associationSignal(c)) return 'education';
    if (P.assocForm.test(c)) {
      if (associationSignal(c)) return 'association';
      // An association-form name with no trade/profession signal is not a trade association.
      if (P.higherEd.test(c) && !P.higherEdBlock.test(c)) return 'education';
      if (P.nonprofit.test(c)) return 'nonprofit';
      return 'other';
    }
    if (P.providerFirst.test(c) && !P.medSchool.test(c)) return 'healthcare_provider';
    if (P.higherEd.test(c) && !P.higherEdBlock.test(c)) return 'education';
    if (P.k12.test(c)) return 'education';
    if (P.provider.test(c)) return 'healthcare_provider';
    if (P.institute.test(c) && !P.businessSuffix.test(c) && / (institute|institutes|institution for) /.test(c)) return 'education';
    if (/ (food bank|food pantry|united way|community action|habitat for humanity|foundation|charity|charities|ministries|church|diocese) /.test(c)) return 'nonprofit';
    if (P.govWeak.test(c) && !P.govWeakBlock.test(c)) return 'government';
    if (P.nonprofit.test(c)) return 'nonprofit';
    return 'company';
  }
  // No company: lean on the title.
  if (/ (dentist|dds|dmd|physician|orthodontist|veterinarian|pharmacist|nurse practitioner) /.test(t)) return 'healthcare_provider';
  if (/ (venture capitalist|angel investor|venture partner) /.test(t)) return 'investor';
  if (/ (professor|dean|teacher|superintendent) /.test(t)) return 'education';
  if (industries.includes('local_government') || industries.includes('state_government')) return 'government';
  return 'other';
}

/** Weak company cues that add an industry when nothing stronger is known. */
function genericCueIndustries(c, t, orgType, known = []) {
  const add = [];
  const HEALTH_FAMILY = ['healthcare_providers', 'dental', 'veterinary', 'pharmacy', 'behavioral_health', 'long_term_care', 'public_health'];
  if (orgType === 'education') {
    if (P.higherEd.test(c) && !P.higherEdBlock.test(c)) add.push('higher_education');
    else if (/ collegiate institute /.test(c)) add.push('k12_education'); // Canadian secondary schools
    else if (/ (institute|institutes|institution for) /.test(c)) add.push('higher_education');
    else if (P.k12.test(c)) add.push('k12_education');
  }
  if (orgType === 'healthcare_provider' && !known.some((id) => HEALTH_FAMILY.includes(id))) add.push('healthcare_providers');
  if (orgType === 'investor') add.push('investment');
  if (orgType === 'nonprofit') add.push('nonprofit');
  // Weak suffix cues apply only when the company name itself named no industry.
  if ((orgType === 'company' || orgType === 'other') && !known.some((id) => matchIndustry(BY_ID[id], c).length)) {
    if (P.wealth.test(c)) add.push(/ securities /.test(c) ? 'banking' : 'investment');
    if (P.equitySuffix.test(c)) add.push('investment');
    // "Partners" / "Advisors" / "Holdings": investment only with a finance-looking title (moderate confidence).
    if (P.partnersSuffix.test(c) && P.financeTitle.test(t)) add.push('investment');
  }
  return add;
}

// ---------------------------------------------------------------------------
// Early career: students, interns, incoming hires, fellows/trainees, volunteers.

const EARLY = {
  incoming: RE(' (incoming|starting (in )?20[0-9][0-9]|pending start|(future|rising) (analyst|associate|intern|hire|consultant|engineer|senior|junior|sophomore|first year|second year|summer)) '),
  intern: RE(' (intern|interns|internship|externship|extern|summer analyst|summer associate|summer intern|summer student|summer fellow|summer camp counselor|summer research|co op student|coop student|trainee|apprentice|work study) '),
  studentStaff: RE(' ((of|for) (the )?students?|students? (affairs|services|success|life|loan|loans|engagement|activities|accounts|records|financial services|development|conduct|accessibility|wellness)) '),
  student: RE(' (student|undergraduate|undergrad|phd candidate|doctoral candidate|phd student|doctoral student|graduate student|grad student|masters student|medical student|law student|mba candidate|jd candidate|md candidate|dmd candidate|dds candidate|mph candidate|msn candidate|bsn candidate|md phd candidate|(ba|bs|ms|ma|mba|jd|md|dmd|dds|phd|mph|mfa|llm) (candidate|student)|class of 20[0-9][0-9]|teaching assistant|learning assistant|course assistant|graduate assistant|resident advisor|first year counselor|freshman counselor|froco|peer tutor|peer educator|student ambassador|teaching fellow|undergraduate researcher|student researcher|graduate research assistant|college republicans|college democrats|student government|student body) '),
  trainee: RE(' (postdoctoral|postdoc|post doctoral|post doc|post baccalaureate|postbaccalaureate|post bacc|postgraduate associate|postgraduate fellow|resident physician|medical resident|surgical resident|pgy [0-9]|fellow|fellows|fellowship) '),
  seniorFellow: RE(' (senior|distinguished|principal|chief|executive|visiting|nonresident|non resident|board|honorary|life|emeritus|research) fellow|fellow (of|at) the (american|royal|national) '),
  seniorWords: RE(' (director|professor|partner|vice president|vp|president|founder|cofounder|co founder|ceo|cfo|coo|cto|chief|head|manager|owner|attorney|physician|surgeon|dean|principal investigator|lecturer) '),
  volunteer: RE(' (volunteer|volunteers|volunteering) '),
  volunteerStaff: RE(' (coordinator|manager|director|services|program|engagement|chair|president|lead|leader|board|trustee|firefighter|emt) '),
  raAtSchool: RE(' (research assistant|research intern|lab assistant|laboratory assistant|research aide|tutor) '),
};

export const EARLY_LABELS = {
  student: 'Student: not a buyer, but may know people in the field',
  intern: 'Intern: not a buyer, but may know people at the organisation',
  incoming: 'Incoming hire (has not started yet): not a buyer yet',
  trainee: 'Fellow or trainee: early career, not a buyer',
  volunteer: 'Volunteer, not staff: unlikely to buy',
};

/**
 * Early-career stage from a (cleaned, normalized) title and the organisation classification.
 * @returns {'student'|'intern'|'incoming'|'trainee'|'volunteer'|null}
 */
export function careerStage(t, org = null, orgType = null) {
  const title = t || ' ';
  if (EARLY.incoming.test(title)) return 'incoming';
  if (EARLY.intern.test(title)) return 'intern';
  if (EARLY.student.test(title) && !EARLY.studentStaff.test(title)) return 'student';
  if (org && org.student) return 'student';
  if (EARLY.trainee.test(title) && !EARLY.seniorFellow.test(title) && !EARLY.seniorWords.test(title)) return 'trainee';
  if (EARLY.trainee.test(title) && / research fellow /.test(title) && !EARLY.seniorWords.test(title)) return 'trainee';
  if (EARLY.volunteer.test(title) && !EARLY.volunteerStaff.test(title)) return 'volunteer';
  if ((orgType === 'education') && EARLY.raAtSchool.test(title) && !EARLY.seniorWords.test(title)) return 'student';
  return null;
}

// ---------------------------------------------------------------------------
// Seniority and job function from the (cleaned, normalized) title

const SEN = [
  ['vp', RE(' (vice president|vice chair|vp|svp|evp|avp|provost|vice chancellor|deputy commissioner) ')],
  ['owner', RE(' (owner|co owner|coowner|founder|co founder|cofounder|proprietor|managing partner|managing member|general partner|(?<!(writing|thought|hr|business|learning|peer|research|study|accountability|reading|conversation|language|community|training|teaching|channel|strategic|sparring) )partner(?! (manager|success|relations|marketing|program|development|engagement|specialist|liaison|coordinator))) ')],
  ['c_level', RE(' (ceo|cfo|coo|cto|cmo|cio|cro|cno|chro|chief|president|executive director|superintendent|chancellor|general manager|managing director|publisher|mayor|commissioner|town manager|city manager|county administrator|town administrator|fractional cfo|fractional coo|fractional cmo|state director|head of school) ')],
  // "Sales Representative" is an individual contributor; only an elected representative is director-level.
  ['director', RE(' (director|head of|head|dean|principal|chair|chairman|chairwoman|chairperson|treasurer|board member|trustee|selectboard member|selectman|selectwoman|council member|councilor|senator|(?:state|house|us|u s|elected|district|county|town) representative|administrator of) ')],
  ['manager', RE(' (manager|supervisor|lead|team lead|coordinator|administrator|foreman|superintendent of|officer|clerk|buyer|program officer) ')],
];

export function detectSeniority(t) {
  if (!t.trim()) return 'unknown';
  for (const [level, re] of SEN) if (re.test(t)) return level;
  return 'ic';
}

const FUNC = [
  ['finance', RE(' (cfo|finance|financial|controller|comptroller|accountant|accounting|treasurer|bookkeeper|bookkeeping|payroll|billing|revenue cycle|cpa|tax|actuary|underwriter|underwriting|loan officer|credit analyst|credit|investment|investments|investor|investing|portfolio|private equity|growth equity|venture capital|equity research|trader|trading|capital markets|investment banking|valuation|wealth|m and a|quantitative research|quant) ')],
  ['marketing', RE(' (cmo|marketing|brand|communications|public relations|pr|growth|content|social media|advertising|seo|demand generation) ')],
  ['sales', RE(' (sales|business development|account executive|account manager|territory|sales rep|bd|partnerships|customer success|agent|broker|representative(?! state)) ')],
  ['engineering', RE(' (cto|cio|engineer|engineering|developer|software|programmer|devops|data scientist|data engineer|it|information technology|technical|network administrator|systems administrator|architect|technician|machine learning|sde|web development|web developer|full stack|frontend|backend) ')],
  ['product', RE(' (product manager|product owner|product|designer|ux|ui|user experience) ')],
  ['legal', RE(' (counsel|attorney|lawyer|legal|paralegal|compliance|esq|general counsel|law clerk|judicial clerk|litigation) ')],
  ['hr', RE(' (hr|human resources|talent|recruiter|recruiting|people operations|people ops|chro|benefits) ')],
  ['clinical', RE(' (dentist|dds|dmd|physician|md|doctor|dr|nurse|rn|np|lpn|hygienist|dental assistant|pharmacist|therapist|clinician|medical director|chief medical officer|orthodontist|periodontist|endodontist|surgeon|veterinarian|dvm|counselor|psychologist|psychiatrist|paramedic|clinical|cno|chief nursing officer|midwife|optometrist|chiropractor) ')],
  ['operations', RE(' (coo|operations|ops|office manager|practice manager|practice administrator|administrator|logistics|supply chain|plant manager|facilities|procurement|purchasing|buyer|category manager|merchandis[a-z]*|program manager|project manager|production|operator|dispatcher|scheduler|farm manager|store manager|general manager|strategy and operations|business operations) ')],
  ['executive', RE(' (ceo|president|owner|founder|co founder|executive director|managing director|superintendent|chancellor|mayor|town manager|city manager|county administrator|selectboard|commissioner|managing partner|partner|principal|proprietor|chair|director general|chief executive|head of school|farmer|rancher|grower) ')],
];

export function detectFunction(t) {
  if (!t.trim()) return 'other';
  for (const [fn, re] of FUNC) if (re.test(t)) return fn;
  return 'other';
}

const GENERIC_FIN = RE(' (analyst|associate|senior associate|summer analyst|summer associate|vice president|intern|research analyst|business analyst|strategy analyst|rotational analyst|staff analyst|senior analyst) ');
const GENERIC_CONSULT = RE(' (consultant|consultants|consulting|business analyst|analyst|associate|senior associate|engagement manager|case team leader|summer associate|intern|strategy analyst) ');
const GENERIC_LAW = RE(' (associate|senior associate|summer associate|law clerk|clerk|intern) ');
const FIN_IND = new Set(['banking', 'investment', 'accounting', 'insurance']);

/** Job function when the title alone is generic ("Analyst", "Associate", "Consultant"). */
function contextFunction(t, industries, orgType) {
  if (!t.trim()) return 'other';
  if (industries.includes('consulting') && GENERIC_CONSULT.test(t)) return 'operations';
  if (industries.some((i) => FIN_IND.has(i)) && GENERIC_FIN.test(t)) return 'finance';
  if (industries.includes('legal') && orgType !== 'government' && GENERIC_LAW.test(t)) return 'legal';
  // Management consulting maps to operations (the fixed function list has no consulting/strategy value).
  if (/ (business analyst|management consultant|strategy consultant|associate consultant|senior consultant|consultant|strategy associate) /.test(t)) return 'operations';
  return 'other';
}

// ---------------------------------------------------------------------------
// Industries

function scoreIndustries(c, t) {
  const scores = new Map();
  for (const ind of INDUSTRIES) {
    const ch = matchIndustry(ind, c).length;
    const th = matchIndustry(ind, t).length;
    if (!ch && !th) continue;
    scores.set(ind.id, (ch ? 2 + 0.25 * (ch - 1) : 0) + (th ? 1 + 0.1 * (th - 1) : 0));
  }
  // Generic single words are weak evidence: "Engineer" alone should not make someone "software".
  if (scores.has('software_it') && !matchIndustry(BY_ID.software_it, c).length &&
      !/ (software|saas|devops|programmer|data scientist|machine learning|cloud) /.test(t)) {
    scores.set('software_it', scores.get('software_it') * 0.5);
  }
  return scores;
}

// Non-US places and public-body forms. "New Mexico" is a US state and is removed first.
const FOREIGN = RE(' (ministry|ministerio|ministere|ministero|emirate|emirates|uae|fujairah|dubai|abu dhabi|sharjah|ajman|saudi|qatar|kuwait|bahrain|oman|' +
  'india|gurgaon|gurugram|delhi|mumbai|bangalore|bengaluru|hyderabad|pakistan|bangladesh|sri lanka|nepal|china|beijing|shanghai|shenzhen|hong kong|singapore|' +
  'japan|tokyo|korea|seoul|taiwan|taipei|philippines|manila|indonesia|jakarta|malaysia|thailand|bangkok|vietnam|australia|australian|new south wales|' +
  'victoria state|queensland|new zealand|canada|canadian|ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|mexico|mexican|' +
  'brazil|brasil|argentina|chile|colombia|peru|uruguay|united kingdom|uk|england|scotland|wales|ireland|france|germany|deutschland|spain|espana|madrid|' +
  'barcelona|comunidad|italy|italia|netherlands|belgium|switzerland|sweden|norway|denmark|finland|poland|austria|portugal|greece|turkey|israel|egypt|' +
  'nigeria|kenya|south africa|ghana|ethiopia|rwanda|uganda|tanzania|european commission|european union|united nations|nhs|hm treasury|hm revenue|' +
  'gov uk|gobierno|governo|regierung|municipalidad|prefecture|provincial government|province of|london|paris|berlin|toronto|vancouver|ottawa|montreal|' +
  'sydney|melbourne|estado de|ciudad de) ');
export function isForeign(company, location = '') {
  const c = normalize(company).replace(/ new mexico /g, ' ');
  if (FOREIGN.test(c)) return true;
  if (location && !locationState(location)) {
    const l = normalize(location).replace(/ new mexico /g, ' ');
    if (FOREIGN.test(l)) return true;
  }
  return false;
}
const HYPERSCALER = RE('^ (google|alphabet|amazon|amazon web services|aws|microsoft|meta|meta platforms|facebook|oracle|apple|ibm|equinix|tiktok|bytedance|x ai|xai|openai|anthropic|nvidia)\\b');
const DC_ROLE = RE(' (data center|data centers|datacenter|datacenters|data centre|critical facilities|critical facility|critical environments?|facilities|facility|site operations|site selection|' +
  'physical infrastructure|infrastructure delivery|infrastructure construction|capacity planning|energy procurement|power procurement|cooling|' +
  'mechanical engineer|electrical engineer|controls engineer|construction manager|construction project manager) ');

/**
 * Full classification (the public enrichPerson returns a subset).
 * @returns {{ industries, org_type, job_function, seniority, stage, org }}
 */
export function classifyPerson({ company, title } = {}) {
  const ct = cleanTitle(title);
  const c = normalize(company);
  const t = normalize(ct);
  const org = classifyCompany(company, ct);
  let industries;
  let org_type;
  if (org) {
    industries = [...org.industries];
    org_type = org.org_type;
    // Title words still help when the organisation itself carries no industry (pseudo-employers, unions...).
    if (!industries.length && (org.source === 'pseudo' || org.source === 'cause_society' || org.source === 'union')) {
      industries = [...scoreIndustries(' ', t).entries()].filter(([, s]) => s >= 1).sort((a, b) => b[1] - a[1])
        .slice(0, 2).map(([id]) => id);
    }
  } else {
    const scores = scoreIndustries(c, t);
    let ranked = [...scores.entries()].filter(([, s]) => s >= 0.5).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    org_type = genericOrgType(c, t, ranked);
    const cue = genericCueIndustries(c, t, org_type, ranked).filter((id) => !ranked.includes(id));
    // A company cue ("School of", "Capital", "Hospital") outranks words that appear only in the title.
    const companyHits = ranked.filter((id) => matchIndustry(BY_ID[id], c).length);
    const titleOnly = ranked.filter((id) => !companyHits.includes(id));
    ranked = [...companyHits, ...cue, ...titleOnly];
    // A dental school is education first; a university "Department of X" is not a state agency.
    if (org_type === 'education' && (/ (university|college) /.test(c) || P.campusDept.test(c))) ranked = ranked.filter((id) => id !== 'state_government' && id !== 'local_government');
    if (org_type === 'education') {
      const edu = ranked.filter((id) => id === 'higher_education' || id === 'k12_education');
      ranked = [...edu, ...ranked.filter((id) => !edu.includes(id))];
    }
    industries = ranked.slice(0, 4);
  }
  if (org_type === 'investor' && !industries.includes('investment')) industries = ['investment', ...industries].slice(0, 4);
  // A non-US public body is not a US state, local or federal agency.
  if (org_type === 'government' && isForeign(c)) industries = industries.filter((id) => !GOVERNMENT_IDS.has(id));
  // Hyperscalers and big tech: only facilities / data-center roles make someone a data-center buyer.
  if (org && org.known && HYPERSCALER.test(c) && DC_ROLE.test(t) && !industries.includes('data_centers')) industries = ['data_centers', ...industries];
  industries = [...new Set(industries)].slice(0, 4);
  const stage = careerStage(t, org, org_type);
  const seniorityNow = stage ? (t.trim() ? 'ic' : 'unknown') : detectSeniority(t);
  // Owners of small, otherwise unknown companies (and self-employed founders) are small-business owners.
  if (seniorityNow === 'owner' && ['company', 'other'].includes(org_type) && industries.length < 4 && !industries.includes('investment') &&
    !(org && org.known && org.source && org.source.startsWith('table')) && !industries.includes('small_business')) {
    industries = [...industries, 'small_business'];
  }
  let job_function = detectFunction(t);
  if (job_function === 'other') job_function = contextFunction(t, industries, org_type);
  return { industries, org_type, job_function, seniority: seniorityNow, stage, org };
}

/**
 * Pure heuristic classifier.
 * @returns {{ industries: string[], org_type: string, job_function: string, seniority: string }}
 */
export function enrichPerson({ full_name, company, title, location } = {}) {
  void full_name; void location; // names and places never decide industry
  const r = classifyPerson({ company, title });
  return { industries: r.industries, org_type: r.org_type, job_function: r.job_function, seniority: r.seniority };
}

// ---------------------------------------------------------------------------
// Search-time organisation analysis (not stored). Cheap enough to run on every candidate.

const KIND = {
  regulator: RE(' (board of (?!directors|trustees|advisors|governors)[a-z ]*?(examiners|registration|licensure|licensing|medicine|dentistry|pharmacy|nursing)|licensing board|public (utilities|service) commission|regulatory|regulator) '),
  extension: P.extension,
  gpo: RE(' (group purchasing|purchasing alliance|purchasing cooperative|buying group|dental service organization|dental support organization|dso|management services organization|msos?|purchasing consortium) '),
  multi_site: RE(' (dental partners|dental group partners|health system|healthcare system|dental service organization|dental support organization|dso) '),
  chamber: RE(' (chamber of commerce|chamber) '),
  lender: RE(' (farm credit|ag credit|agricultural credit|ag lending|agricultural lending|cdfi|loan fund|community development financial) '),
  economic_development: RE(' (economic development|development corporation|development authority|development council|regional planning|planning commission|planning district|small business development center|sbdc|rural development|enterprise center|business incubator|main street program) '),
  distributor: RE(' (distributor|distributors|distribution|distributing|wholesale|wholesaler|supply|supplies|food hub|food hubs|food broker|food brokers|brokerage|equipment dealer|implement|dealer) '),
  // Art dealers, galleries and auction houses sell to collectors; they are not channels to a founder's customers.
  distributorBlock: RE(' (supply chain|water supply|distribution center|art dealer|art dealers|antique dealer|antiques dealer|auction|auctions|auctioneers|auction house|gallery|galleries|fine art) '),
  cooperativeRetail: RE(' (food co op|food coop|co op market|coop market|natural foods co op|foods co op|grocery co op|consumer co op) '),
  cooperative: RE(' (cooperative|co op|coop) '),
  vendorCue: RE(' (marketing|advertising|agency|consulting|consultants|software|saas|technologies|tech|solutions|labs?|laboratory|billing|insurance|staffing|analytics|digital|media|systems|apps?|telehealth|telemedicine|platform|equipment|equipment services|repair) '),
  vendorBlock: RE(' (insurance agency|state agency|area agency on aging|federal agency|agency of) '),
  ventureStyle: RE(' (venture|ventures|venture partners|vc|angel|angels|angel network|seed|seed fund|accelerator|incubator|startup studio|pre seed|early stage) '),
  peStyle: RE(' (private equity|equity partners|buyout|growth equity|growth partners|capital partners) '),
};

// Front-line individual roles: not buyers, never partners.
const FRONT_LINE = RE(' (caregiver|care giver|home health aide|aide|nanny|technician|technologist|assistant(?! (director|manager|vice president|professor|dean|principal|superintendent|general counsel|secretary))|attendant|cashier|server|waiter|waitress|barista|bartender|host|hostess|driver|courier|receptionist|teller|custodian|janitor|housekeeper|cook|dishwasher|guard|security officer|associate(?! (director|dean|professor|vice president|partner|general counsel|principal))|(?<!(?:town|city|county|village|court|district|municipal) )clerk(?! of)|representative|rep|agent|caddy|lifeguard|tutor|substitute|warehouse|laborer|installer|mechanic|firefighter|fire fighter|police officer|patrol officer|trooper|correctional officer|corrections officer|soldier) ');
// Roles that can sign a partnership: business development, founders/owners, leadership.
const PARTNER_ROLE = RE(' (business development|partnerships?|alliances?|channel|strategic accounts|bd|biz dev|founder|co founder|cofounder|owner|principal|partner|president|ceo|coo|cro|chief|general manager|managing director|head of|vice president|vp|director|account executive|sales) ');

const CONNECTOR_KINDS = new Set(['lender', 'association', 'regulator', 'government', 'extension', 'gpo', 'chamber',
  'economic_development', 'distributor', 'cooperative']);
export function isConnectorKind(kind) { return CONNECTOR_KINDS.has(kind); }

// ---------------------------------------------------------------------------
// Connector link: is this connector organisation positively linked to the founder's buyer industry?
//
// An org form alone ("State of X", "Town of Y", "... Association", "... Distributors") is not enough:
//   government / regulator  the organisation (or, for someone in a role with reach, the unit named in the title) must
//                           match a public body whose remit covers the buyer industry (taxonomy GOV_REMIT: public utility
//                           commission -> utilities, department of education -> schools). Front-line roles (firefighter,
//                           clerk, assistant...) and non-US bodies never qualify; a body named for another US state does not
//                           qualify when the founder names their states.
//   association, cooperative, distributor, buying group
//                           the organisation's own industry is a buyer industry, or its name is one of the buyer
//                           industry's connector phrases ("electric cooperative" for broadband providers).
//   extension, farm lender  farms, ranches, forestry, food makers and green-industry firms only.
//   CDFI / loan fund, chamber, economic development
//                           local and small businesses (and, for economic development, towns, employers, infrastructure).
// The founder's own sector (from the profile's industry field, e.g. "Fiber broadband provider") also links: the public body
// whose remit covers that sector (a state broadband office for a broadband builder selling to towns), the sector's own
// configured connector phrases ("food distributor", "food hub" for a food maker), and distributors in that sector.

const GOV_REACH_ROLE = RE(' (commissioner|commissioners|director|directors|deputy|administrator|chief|secretary|head|manager|coordinator|program|programs|' +
  'policy|analyst|specialist|officer|superintendent|advisor|adviser|liaison|counsel|attorney|inspector|examiner|economist|planner|executive|president|' +
  'chair|chairman|chairwoman|chairperson|member|board|trustee|councilor|legislator|senator|representative|lead|leader|supervisor|consultant|' +
  'scientist|engineer|agent|educator|regulator|auditor|investigator|conservationist|forester|agronomist|epidemiologist|hydrologist|ecologist|' +
  'biologist|veterinarian|ombudsman|surveyor|evaluator|strategist|associate commissioner|state director|grants? manager) ');
const GOV_FRONT_LINE = RE(' (firefighter|fire fighter|police|trooper|sheriff|corrections|correctional|paramedic|emt|cemetery|lifeguard|custodian|janitor|' +
  'groundskeeper|bus driver|driver|dispatcher|guard|soldier|enlisted|cadet|army officer|naval officer|military officer|marine|sailor|airman|' +
  'clerk typist|receptionist|cashier|scheduler|teacher|nurse|paralegal|legislative staff|staff assistant|intern|aide) ');
const FARM_GROUP = ['agriculture', 'livestock', 'forestry', 'food_manufacturing', 'landscaping', 'veterinary'];
const LOCAL_BUSINESS = ['small_business', 'retail', 'restaurants_hospitality', 'grocery_retail', 'home_services', 'landscaping', 'automotive',
  'tourism_recreation', 'real_estate', 'construction', 'accounting', 'legal', 'insurance', 'banking', 'marketing_advertising', 'manufacturing',
  'logistics', 'food_manufacturing', 'childcare', 'economic_development'];
const COMMUNITY_LENDING = ['small_business', 'nonprofit', 'childcare', 'real_estate', 'restaurants_hospitality', 'retail', 'grocery_retail',
  'food_manufacturing', 'economic_development', 'construction', 'home_services', 'healthcare_providers'];
const ECON_DEV = ['small_business', 'manufacturing', 'local_government', 'broadband_telecom', 'workforce_development', 'economic_development',
  'utilities', 'data_centers', 'energy', 'construction', 'real_estate', 'food_manufacturing', 'logistics', 'tourism_recreation', 'retail'];
// "food distributor" also matches "Northeast Food Distributors".
function phraseIn(normText, phrase) {
  return normText.includes(` ${phrase} `) || normText.includes(` ${phrase}s `) || normText.includes(` ${phrase}es `);
}
const FARM_LENDER = RE(' (farm credit|ag credit|agricultural credit|ag lending|agricultural lending|agcountry|agfirst|cobank|farmer mac) ');

/**
 * @param {{company, title, location}} p   the person
 * @param {object} an                       analyzeOrg(p)
 * @param {string} kind                     effective connector kind
 * @param {string[]} customerIndustries      the founder's buyer industries
 * @param {{ geoStates?: Set<string>, sector?: string[] }} opts  the founder's states, when named; the founder's own sector
 * @returns {{ id: string, phrase: string|null, via: string } | null}  the linked buyer industry and the evidence, or null
 */
export function connectorLink(p, an, kind, customerIndustries, opts = {}) {
  if (!isConnectorKind(kind)) return null;
  const inds = (customerIndustries || []).map((id) => BY_ID[id]).filter(Boolean);
  if (!inds.length) return { id: null, phrase: null, via: 'unchecked' };
  const sector = (opts.sector || []).map((id) => BY_ID[id]).filter((x) => x && !inds.includes(x));
  const c = normalize(p.company);
  const t = normalize(cleanTitle(p.title));
  if (kind === 'government' || kind === 'regulator') {
    if (an.early || GOV_FRONT_LINE.test(t) || (an.frontLine && !/ (director|manager|chief|commissioner|head|program|policy) /.test(t))) return null;
    if (!GOV_REACH_ROLE.test(t)) return null;
    if (isForeign(p.company, p.location)) return null;
    const states = opts.geoStates;
    if (states && states.size) {
      const own = parseGeo(String(p.company || '').replace(/\b(?:US|U\.S\.|USA)\b/g, ' ')).states;
      if (own.size && ![...own].some((st) => states.has(st))) return null;
    }
    for (const ind of inds) {
      const ph = ind.remit.find((r) => c.includes(` ${r} `));
      if (ph) return { id: ind.id, phrase: ph, via: 'remit' };
    }
    for (const ind of inds) {
      const ph = ind.remit.find((r) => t.includes(` ${r} `));
      if (ph) return { id: ind.id, phrase: ph, via: 'title_remit' };
    }
    for (const sec of sector) {
      const ph = sec.remit.find((r) => c.includes(` ${r} `)) || sec.remit.find((r) => t.includes(` ${r} `));
      if (ph) return { id: inds[0].id, phrase: ph, via: 'sector_remit' };
    }
    return null;
  }
  const own = new Set(an.companyIndustries.filter((id) => id !== 'wholesale_distribution'));
  for (const ind of inds) if (own.has(ind.id)) return { id: ind.id, phrase: null, via: 'industry' };
  for (const ind of inds) {
    const ph = ind.connectorPhrases.find((x) => phraseIn(c, x));
    if (ph) return { id: ind.id, phrase: ph, via: 'connector_phrase' };
  }
  // Public programs that are not classed as government ("USDA Rural Development" is an economic-development body).
  for (const ind of inds) {
    const ph = ind.remit.find((r) => c.includes(` ${r} `));
    if (ph) return { id: ind.id, phrase: ph, via: 'remit' };
  }
  for (const sec of sector) {
    const ph = sec.connectorPhrases.find((x) => phraseIn(c, x));
    if (ph) return { id: inds[0].id, phrase: ph, via: 'sector_phrase' };
    if ((kind === 'distributor' || kind === 'gpo') && own.has(sec.id)) return { id: inds[0].id, phrase: null, via: 'sector_channel' };
  }
  const pick = (list) => inds.find((ind) => list.includes(ind.id));
  let hit = null;
  if (kind === 'extension') hit = pick(FARM_GROUP);
  else if (kind === 'lender') hit = FARM_LENDER.test(c) ? pick(FARM_GROUP) : pick(COMMUNITY_LENDING);
  else if (kind === 'chamber') hit = pick(LOCAL_BUSINESS);
  else if (kind === 'economic_development') hit = pick(ECON_DEV);
  return hit ? { id: hit.id, phrase: null, via: kind } : null;
}

const analysisCache = new Map();

/**
 * Richer search-time view of a person's organisation and role.
 * @returns {{ kind: string|null, vendor: boolean, serves: string[], companyIndustries: string[],
 *            early: string|null, frontLine: boolean, partnerRole: boolean, investorStyle: string|null,
 *            student: boolean }}
 *   kind: association | regulator | government | extension | gpo | multi_site | chamber |
 *         economic_development | distributor | cooperative | investor | vendor | provider | null
 */
export function analyzeOrg(p) {
  const key = `${p.company || ''}\u0001${p.title || ''}\u0001${p.org_type || ''}`;
  const hit = analysisCache.get(key);
  if (hit) return hit;
  const c = normalize(p.company);
  const t = normalize(cleanTitle(p.title));
  const cls = classifyPerson({ company: p.company, title: p.title });
  const org = cls.org;
  const tableKnown = Boolean(org && org.known && org.source && org.source !== 'pseudo');
  const companyIndustries = tableKnown ? [...org.industries] : INDUSTRIES.filter((ind) => matchIndustry(ind, c).length).map((i) => i.id);
  const nonService = companyIndustries.filter((id) => !SERVICE_IDS.has(id) && id !== 'wholesale_distribution');
  const serviceInCompany = companyIndustries.some((id) => SERVICE_IDS.has(id)) ||
    (!tableKnown && KIND.vendorCue.test(c) && !KIND.vendorBlock.test(c));
  // Fresh classification wins for known organisations (stored rows may predate a classifier change);
  // otherwise a stored value (e.g. from the optional LLM company cache) is kept.
  const orgType = (org && org.known) || !p.org_type || !['company', 'other'].includes(cls.org_type) ? cls.org_type : p.org_type;
  const studentOrg = Boolean(org && org.student);
  let kind = null;
  let vendor = false;
  if (studentOrg) kind = 'provider';
  else if (orgType === 'investor') kind = 'investor';
  else if (KIND.regulator.test(c)) kind = 'regulator';
  else if (KIND.extension.test(c) || KIND.extension.test(t)) kind = 'extension';
  else if (KIND.gpo.test(c)) kind = KIND.multi_site.test(c) && !/ (group purchasing|buying group|purchasing) /.test(c) ? 'multi_site' : 'gpo';
  else if (KIND.multi_site.test(c)) kind = 'multi_site';
  else if (KIND.cooperativeRetail.test(c)) kind = 'provider';
  else if (KIND.lender.test(c)) kind = 'lender';
  else if (KIND.chamber.test(c)) kind = 'chamber';
  else if (KIND.economic_development.test(c)) kind = 'economic_development';
  else if (orgType === 'government') kind = 'government';
  else if (KIND.cooperative.test(c) && associationSignal(c)) kind = 'cooperative';
  // A connector needs a positive signal: an industry/profession term or a chamber/business-league form.
  else if (orgType === 'association' && associationSignal(c) && !(org && (org.sports || org.student))) kind = 'association';
  else if ((KIND.distributor.test(c) && !KIND.distributorBlock.test(c) && !serviceInCompany) ||
    (tableKnown && org.industries[0] === 'wholesale_distribution')) kind = 'distributor';
  else if (serviceInCompany && nonService.length) { kind = 'vendor'; vendor = true; }
  else if (['healthcare_provider', 'education', 'company', 'nonprofit', 'association'].includes(orgType)) kind = 'provider';
  let investorStyle = null;
  if (kind === 'investor') {
    investorStyle = (org && org.style) || (KIND.ventureStyle.test(c) || KIND.ventureStyle.test(t) ? 'venture'
      : KIND.peStyle.test(c) || KIND.peStyle.test(t) ? 'pe' : 'other');
  }
  const res = {
    kind, vendor, serves: nonService, companyIndustries,
    early: cls.stage,
    frontLine: FRONT_LINE.test(t) && !PARTNER_ROLE.test(t),
    partnerRole: PARTNER_ROLE.test(t),
    investorStyle,
    student: studentOrg,
  };
  if (analysisCache.size > 50000) analysisCache.clear();
  analysisCache.set(key, res);
  return res;
}

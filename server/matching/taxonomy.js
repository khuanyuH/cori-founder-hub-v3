// Industry taxonomy for the CORI Founder Hub matching engine.
//
// Each industry lists:
//   terms      words/phrases that signal the industry in a company name, a title, or a query.
//              Matched on word boundaries after normalize(); a plural "s"/"es" is accepted
//              on the last word automatically.
//   exclude    phrases removed from the text before this industry's terms are tried
//              (e.g. "state farm" must never count as agriculture).
//   service    true for industries that usually describe a VENDOR (software, marketing,
//              consulting...). A company whose name combines a service cue with another
//              industry ("Bright Dental Marketing Agency") serves that industry; it is not a buyer.
//   customer / customers   singular / plural noun used in reasons ("dental office(s)").
//   adj        adjective used in reasons ("dental association").
//   buyers     plain-language persona queries for decision-makers at customer organisations.
//   connectors persona queries for organisations that reach many customers, grouped by kind.
//   partners   persona queries for complementary vendors / channel partners.
//   connectorIndustries  other taxonomy ids whose organisations act as connectors here.
//   related    nearby industries (partial topical credit).
//   label      plain-language buyer type shown in the guided profile picker ("Dental offices and DSOs").
//   group      picker group heading.  examples   2-3 example buyers shown under the label.
//   buyerTerms nouns that NAME a buyer (people or organisations: "dairy farmers", "newsrooms"). Only these
//              create a customer industry from a free-text description, and only in an explicit buyer
//              statement ("for X", "helps X", "X use it to"...). Technology words ("AI", "satellite",
//              "collagen", "SaaS") are never buyer terms. A trailing '!' marks a mass noun that counts
//              without a plural ("cattle", "K-12").
//   deciders   who decides to buy there, for persona wording (default "owners and managers").
//   pickable   false for categories a founder cannot pick as a buyer (investors are a lead type instead).

export const GROUPS = [
  'Health care', 'Education and children', 'Farms, food and animals', 'Trades, building and property',
  'Government and public sector', 'Business and finance', 'Industry, energy and infrastructure',
  'Shops, hospitality and tourism', 'Community, media and culture',
];

// "Builder" and "contractor" name a building contractor only in the building sense. Product builders ("resume builder",
// "website builder") and non-building contractors ("independent contractor", "defense contractor") are excluded.
const PRODUCT_BUILDERS = ['resume', 'cv', 'website', 'web site', 'site', 'web', 'app', 'page', 'landing page', 'form', 'course', 'portfolio', 'bot',
  'chatbot', 'store', 'workflow', 'report', 'deck', 'pitch', 'list', 'audience', 'team', 'community', 'brand', 'habit', 'skill', 'career',
  'profile', 'query', 'dashboard', 'no code', 'low code', 'game', 'world', 'character', 'avatar', 'playlist', 'quiz', 'survey', 'email',
  'newsletter', 'funnel', 'ai', 'agent', 'model', 'prompt', 'muscle', 'body', 'wealth', 'credit', 'confidence', 'relationship', 'consensus',
  'coalition', 'capacity', 'vocabulary', 'lesson', 'curriculum', 'schedule', 'itinerary', 'menu', 'proposal', 'contract', 'document', 'logo'];
const CONSTRUCTION_EXCLUDE = [...PRODUCT_BUILDERS.flatMap((w) => [`${w} builder`, `${w} building`]), 'bodybuilder', 'bodybuilding',
  'independent contractor', 'independent contractors', 'government contractor', 'defense contractor', 'federal contractor', 'meeting contractors',
  'event contractors', 'it contractor', 'software contractor', 'cleaning contractor', 'freelance contractor', 'contractor marketplace for freelancers'];

export const INDUSTRIES = [
  {
    id: 'dental', label: 'Dental offices and DSOs', group: 'Health care',
    examples: ['independent dental practices', 'orthodontists', 'dental service organizations'],
    adj: 'dental', customer: 'dental office', customers: 'dental offices',
    terms: ['dental', 'dentist', 'dentistry', 'dds', 'dmd', 'orthodontics', 'orthodontist', 'orthodontic',
      'endodontics', 'endodontist', 'periodontics', 'periodontist', 'prosthodontist', 'oral surgery',
      'oral surgeon', 'oral and maxillofacial', 'hygienist', 'smiles', 'smile center', 'oral health', 'dso', 'pediatric dentistry'],
    exclude: ['smile photography', 'smile studio'],
    buyerTerms: ['dentist', 'dental office', 'dental practice', 'dental clinic', 'dental group', 'orthodontist', 'oral surgeon',
      'periodontist', 'endodontist', 'dso', 'dental service organization', 'dental support organization', 'dental team', 'dental hygienist'],
    deciders: 'practice owners and office managers',
    buyers: ['dental practice owner', 'dental office manager', 'dental practice administrator', 'dental group operations'],
    connectors: {
      association: ['dental association', 'dental society'],
      channel: ['dental supply distributor', 'dental service organization'],
      government: ['board of dental examiners', 'oral health program'],
    },
    partners: ['dental lab', 'dental practice consultant'],
    related: ['healthcare_providers'],
  },
  {
    id: 'healthcare_providers', label: 'Hospitals, clinics and physician practices', group: 'Health care',
    examples: ['rural clinics', 'critical access hospitals', 'community health centers'],
    adj: 'healthcare', customer: 'clinic or hospital', customers: 'clinics and hospitals',
    terms: ['hospital', 'health system', 'medical center', 'clinic', 'health center', 'healthcare', 'health care',
      'primary care', 'family medicine', 'family practice', 'physician', 'physicians', 'critical access',
      'fqhc', 'community health', 'rural health', 'urgent care', 'medical group', 'nurse', 'nursing',
      'internal medicine', 'pediatrics', 'chief medical officer', 'medical director', 'patient', 'dermatology',
      'cardiology', 'oncology', 'radiology', 'orthopedics', 'ambulance', 'emergency medical services'],
    exclude: ['veterinary clinic', 'animal hospital', 'pet clinic', 'hospitality'],
    buyerTerms: ['hospital', 'health system', 'clinic', 'health center', 'medical center', 'physician', 'doctor', 'primary care practice',
      'medical practice', 'medical group', 'critical access hospital', 'fqhc', 'urgent care center', 'emergency department', 'nurse',
      'care team', 'clinician', 'hospitalist', 'ambulance service', 'ems agency', 'rural health clinic', 'community health center'],
    deciders: 'administrators, executives and clinical leaders',
    buyers: ['rural clinic administrator', 'critical access hospital ceo', 'health center executive director', 'hospital cfo', 'chief medical officer'],
    connectors: {
      association: ['hospital association', 'rural health association', 'primary care association'],
      channel: ['health center network', 'area health education center'],
      government: ['office of rural health', 'department of health'],
    },
    partners: ['health it consultant', 'medical billing company'],
    related: ['behavioral_health', 'long_term_care', 'public_health', 'dental', 'health_it', 'pharmacy'],
  },
  {
    id: 'behavioral_health', label: 'Mental health and addiction care', group: 'Health care',
    examples: ['counseling practices', 'community mental health centers', 'recovery centers'],
    adj: 'behavioral health', customer: 'behavioral health provider', customers: 'behavioral health providers',
    terms: ['behavioral health', 'mental health', 'counseling', 'addiction', 'recovery center', 'substance use',
      'psychiatry', 'psychiatric', 'psychologist', 'therapist', 'social worker'],
    buyerTerms: ['therapist', 'counselor', 'mental health provider', 'behavioral health provider', 'psychiatrist', 'psychologist',
      'addiction treatment center', 'recovery center', 'counseling practice', 'mental health center', 'mental health professional',
      'behavioral health professional', 'mental health clinician', 'mental health practitioner', 'mental health counselor', 'mental health agency'],
    deciders: 'directors and clinical leads',
    buyers: ['behavioral health director', 'mental health center executive director', 'counseling practice owner'],
    connectors: { association: ['behavioral health association', 'council for behavioral health'], government: ['department of mental health'] },
    partners: [], related: ['healthcare_providers'],
  },
  {
    id: 'social_services', label: 'Social service agencies and case workers', group: 'Community, media and culture',
    examples: ['family service agencies', 'county human services departments', 'case management programs'],
    adj: 'social services', customer: 'social service provider', customers: 'social service providers',
    terms: ['social services', 'social service', 'human services', 'family services', 'child welfare', 'case management', 'youth services',
      'foster care', 'homeless services', 'refugee services', 'social work', 'community services board'],
    buyerTerms: ['social worker', 'social services professional', 'social service professional', 'social service provider', 'social services provider',
      'social service agency', 'social services agency', 'human services agency', 'human service agency', 'human services provider', 'case worker',
      'caseworker', 'case manager', 'family service agency', 'child welfare agency', 'foster care agency', 'homeless shelter',
      'community services board', 'social services department', 'human services department', 'social work team'],
    deciders: 'executive directors and program directors',
    buyers: ['social services director', 'human services agency director', 'family services executive director', 'case management director'],
    connectors: {
      association: ['human services association', 'social workers association', 'national association of social workers'],
      government: ['department of human services', 'department of social services'],
    },
    partners: [], related: ['behavioral_health', 'nonprofit'],
  },
  {
    id: 'long_term_care', label: 'Nursing homes and long-term care', group: 'Health care',
    examples: ['nursing homes', 'assisted living communities', 'home health agencies'],
    adj: 'long-term care', customer: 'long-term care facility', customers: 'nursing homes and long-term care facilities',
    terms: ['nursing home', 'assisted living', 'senior living', 'home health', 'hospice', 'long term care',
      'skilled nursing', 'memory care', 'retirement community', 'area agency on aging', 'nursing and rehabilitation',
      'nursing facility', 'senior care', 'adult day'],
    buyerTerms: ['nursing home', 'assisted living', 'assisted living facility', 'assisted living community', 'senior living community',
      'long term care!', 'long term care facility', 'long term care provider', 'home health agency', 'hospice', 'skilled nursing facility',
      'memory care', 'caregiver agency', 'senior care provider', 'retirement community'],
    deciders: 'administrators and directors of nursing',
    buyers: ['nursing home administrator', 'assisted living administrator', 'nursing home director of nursing', 'home health agency director'],
    connectors: {
      association: ['health care association', 'assisted living association', 'home health association'],
      channel: ['long term care pharmacy'],
      government: ['area agency on aging', 'department of aging'],
    },
    partners: [], related: ['healthcare_providers'],
  },
  {
    id: 'pharmacy', label: 'Pharmacies', group: 'Health care',
    examples: ['independent pharmacies', 'pharmacy chains'],
    adj: 'pharmacy', customer: 'pharmacy', customers: 'pharmacies',
    terms: ['pharmacy', 'pharmacist', 'drugstore', 'apothecary'],
    buyerTerms: ['pharmacy', 'pharmacist', 'drugstore', 'independent pharmacy'],
    deciders: 'pharmacy owners and managers',
    buyers: ['pharmacy owner', 'pharmacy manager'], connectors: { association: ['pharmacy association', 'pharmacists association'], government: ['board of pharmacy'] },
    partners: [], related: ['healthcare_providers'],
  },
  {
    id: 'veterinary', label: 'Veterinary practices', group: 'Farms, food and animals',
    examples: ['large-animal vets', 'small-animal clinics', 'animal hospitals'],
    adj: 'veterinary', customer: 'veterinary practice', customers: 'veterinary practices',
    terms: ['veterinary', 'veterinarian', 'dvm', 'animal hospital', 'vet clinic', 'pet clinic', 'large animal'],
    buyerTerms: ['veterinarian', 'vet', 'veterinary practice', 'veterinary clinic', 'veterinary hospital', 'animal hospital',
      'large animal vet', 'large animal veterinarian', 'equine vet', 'vet clinic'],
    deciders: 'practice owners and managers',
    buyers: ['veterinary practice owner', 'veterinary practice manager', 'large animal veterinarian'],
    connectors: {
      association: ['veterinary medical association'],
      channel: ['veterinary distributor', 'veterinary supply company'],
      government: ['state veterinarian', 'board of veterinary medicine'],
    },
    partners: ['veterinary supply company'], related: ['agriculture', 'livestock'],
  },
  {
    id: 'public_health', label: 'Public health departments', group: 'Government and public sector',
    examples: ['county health departments', 'state public health agencies'],
    adj: 'public health', customer: 'health department', customers: 'health departments',
    terms: ['public health', 'health department', 'department of health', 'health officer', 'epidemiolog'],
    buyerTerms: ['health department', 'public health department', 'public health agency', 'epidemiologist'],
    deciders: 'health officers and program directors',
    buyers: ['public health director', 'health officer'], connectors: { association: ['public health association', 'local public health association'] },
    partners: [], related: ['healthcare_providers'],
  },
  {
    id: 'health_it', label: 'Health IT and telehealth companies', group: 'Health care',
    examples: ['telehealth providers', 'EHR vendors'],
    adj: 'health IT', customer: 'health IT company', customers: 'health IT companies',
    service: true,
    terms: ['telehealth', 'telemedicine', 'health it', 'ehr', 'electronic health record', 'health informatics',
      'digital health', 'medical billing', 'revenue cycle', 'practice management software'],
    buyerTerms: ['ehr vendor', 'telehealth provider', 'telehealth company', 'digital health company', 'health it company'],
    deciders: 'founders, product and partnership leads',
    buyers: ['health it company ceo', 'digital health partnerships director'],
    connectors: { association: ['telehealth resource center', 'health it association'] }, partners: [], related: ['healthcare_providers', 'software_it'],
  },
  {
    id: 'agriculture', label: 'Crop and produce farms', group: 'Farms, food and animals',
    examples: ['vegetable growers', 'orchards', 'grain farms'],
    adj: 'farm', customer: 'farm', customers: 'farms',
    terms: ['farm', 'farms', 'farmer', 'farming', 'ranch', 'rancher', 'dairy', 'orchard', 'orchards', 'agriculture',
      'agricultural', 'agronomy', 'agronomist', 'grower', 'growers', 'crop', 'crops', 'livestock', 'cattle',
      'poultry', 'vineyard', 'creamery farm', 'maple', 'sugarhouse', 'acres', 'harvest', 'cooperative extension',
      'extension', 'farm bureau', 'grain', 'hog', 'beef', 'produce grower', 'greenhouse', 'homestead', 'ag', 'agri',
      'soil', 'conservation district', 'agtech', 'grazing', 'graziers', 'pasture', 'agronomic'],
    exclude: ['state farm', 'farmers insurance', 'farm bureau insurance', 'farm bureau financial', 'server farm',
      'ant farm', 'farm to table', 'link farm', 'content farm', 'farmhouse', 'extension cord', 'hair extension',
      'eyelash extension', 'lash extension', 'soil testing lab', 'solar farm', 'wind farm', 'troll farm'],
    buyerTerms: ['farmer', 'farm', 'grower', 'orchard', 'vineyard', 'crop farmer', 'grain farmer', 'vegetable grower', 'vegetable farm',
      'produce grower', 'agronomist', 'crop consultant', 'farm cooperative', 'agricultural cooperative', 'ag retailer',
      'greenhouse grower', 'maple producer', 'specialty crop grower', 'farm manager', 'family farm'],
    deciders: 'farm owners and managers',
    buyers: ['farm owner', 'dairy farmer', 'orchard owner', 'farm manager', 'grower'],
    connectors: {
      association: ['farm bureau', 'growers association', 'dairy association', 'farmers cooperative'],
      channel: ['cooperative extension', 'farm credit lender', 'agricultural equipment dealer'],
      government: ['department of agriculture', 'usda rural development', 'conservation district'],
    },
    partners: ['agricultural equipment dealer', 'crop consultant'],
    related: ['food_manufacturing', 'forestry', 'veterinary', 'livestock'],
  },
  {
    id: 'livestock', label: 'Dairy and livestock farms', group: 'Farms, food and animals',
    examples: ['dairy farms', 'cattle ranches', 'poultry and hog farms'],
    adj: 'dairy and livestock', customer: 'dairy or livestock farm', customers: 'dairy and livestock farms',
    terms: ['dairy', 'dairy farm', 'dairy farmer', 'livestock', 'cattle', 'cattlemen', 'cattlemens', 'beef cattle', 'ranch', 'rancher',
      'ranching', 'herd', 'herdsman', 'herd manager', 'hog', 'swine', 'pork producers', 'poultry', 'sheep', 'goat', 'feedlot', 'dairy cooperative'],
    exclude: ['dairy queen', 'ranch dressing', 'state farm', 'dairy free', 'herd immunity'],
    buyerTerms: ['dairy farmer', 'dairy farm', 'dairy cow', 'dairy cattle!', 'dairy herd', 'dairy operation', 'dairy producer', 'cattle rancher',
      'rancher', 'ranch', 'cattle!', 'cow', 'herd', 'livestock!', 'livestock producer', 'livestock farmer', 'beef producer', 'hog farmer',
      'pig farmer', 'poultry farmer', 'poultry producer', 'poultry!', 'sheep farmer', 'goat farmer', 'feedlot', 'herd manager', 'calf'],
    deciders: 'farm owners and herd managers',
    buyers: ['dairy farmer', 'dairy farm owner', 'herd manager', 'cattle rancher', 'livestock producer'],
    connectors: {
      association: ['dairy association', 'cattlemens association', 'livestock association', 'dairy farmers cooperative'],
      channel: ['dairy cooperative', 'livestock feed supplier', 'cooperative extension'],
      government: ['department of agriculture', 'state veterinarian'],
    },
    partners: ['large animal veterinarian', 'livestock feed dealer'],
    related: ['agriculture', 'veterinary'],
  },
  {
    id: 'food_manufacturing', label: 'Food and beverage makers', group: 'Farms, food and animals',
    examples: ['bakeries and creameries', 'breweries', 'packaged-food brands'],
    adj: 'food', customer: 'food producer', customers: 'food producers',
    terms: ['food', 'foods', 'bakery', 'creamery', 'cheese', 'brewery', 'brewing', 'distillery', 'winery',
      'meat processing', 'meats', 'packing', 'cannery', 'co packer', 'copacker', 'snacks', 'granola', 'beverage',
      'provisions', 'kitchen', 'confectionery', 'chocolate', 'coffee roaster', 'roasters', 'specialty food', 'food hub'],
    exclude: ['food bank', 'food pantry', 'food safety inspector', 'pet food', 'specialty food retailer', 'food retailer',
      'food co op', 'food coop', 'natural food', 'natural foods', 'whole food'],
    buyerTerms: ['food producer', 'food manufacturer', 'food maker', 'food brand', 'food company', 'bakery', 'brewery', 'distillery',
      'winery', 'creamery', 'meat processor', 'co packer', 'cheesemaker', 'coffee roaster', 'cpg brand', 'beverage company', 'specialty food maker'],
    buyers: ['specialty food company owner', 'food production manager'],
    connectors: { association: ['specialty food association'], channel: ['food distributor', 'food hub'] },
    partners: ['co packer'], related: ['agriculture', 'grocery_retail', 'restaurants_hospitality'],
  },
  {
    id: 'grocery_retail', label: 'Grocery stores and food co-ops', group: 'Shops, hospitality and tourism',
    examples: ['independent grocers', 'natural food co-ops', 'specialty food shops'],
    adj: 'grocery', customer: 'grocery store', customers: 'grocery stores and food co-ops',
    terms: ['grocery', 'grocer', 'grocers', 'supermarket', 'food co op', 'food coop', 'natural foods', 'market',
      'general store', 'country store', 'category manager', 'grocery buyer', 'merchandiser', 'deli', 'specialty retailer',
      'marketplace', 'mercantile', 'co op market', 'foods co op', 'food co ops', 'natural food', 'food retailer',
      'specialty food retailer', 'specialty food store', 'co ops', 'grocery stores'],
    exclude: ['stock market', 'capital markets', 'capital market', 'market research', 'marketing', 'go to market',
      'market analyst', 'labor market', 'money market', 'financial markets'],
    buyerTerms: ['grocery store', 'grocer', 'supermarket', 'food co op', 'food coop', 'co op grocery', 'natural food store', 'natural food co op',
      'specialty food store', 'specialty food retailer', 'convenience store', 'general store', 'country store', 'grocery buyer'],
    deciders: 'store owners, general managers and buyers',
    buyers: ['grocery buyer', 'food co-op general manager', 'grocery store owner', 'specialty food store owner'],
    connectors: { association: ['grocers association', 'food co-op association'], channel: ['food distributor', 'food broker'] },
    partners: [], related: ['food_manufacturing', 'retail'],
  },
  {
    id: 'restaurants_hospitality', label: 'Restaurants, hotels and inns', group: 'Shops, hospitality and tourism',
    examples: ['independent restaurants', 'country inns', 'caterers and food trucks'],
    adj: 'hospitality', customer: 'restaurant or inn', customers: 'restaurants and inns',
    terms: ['restaurant', 'cafe', 'bistro', 'diner', 'hotel', 'inn', 'hospitality', 'resort', 'catering', 'tavern',
      'lodge', 'bed and breakfast', 'chef', 'farm to table'],
    buyerTerms: ['restaurant', 'cafe', 'brewpub', 'hotel', 'inn', 'bed and breakfast', 'motel', 'caterer', 'food truck', 'chef',
      'restaurateur', 'restaurant group', 'hospitality group', 'resort', 'innkeeper', 'diner'],
    deciders: 'owners and general managers',
    buyers: ['restaurant owner', 'hotel general manager', 'inn owner'],
    connectors: { association: ['restaurant and lodging association', 'restaurant association'], channel: ['restaurant supply distributor'] },
    partners: [], related: ['tourism_recreation', 'food_manufacturing'],
  },
  {
    id: 'k12_education', label: 'K-12 schools and districts', group: 'Education and children',
    examples: ['school districts', 'principals and teachers', 'charter and private schools'],
    adj: 'school', customer: 'school district', customers: 'K-12 schools and districts',
    terms: ['school district', 'elementary school', 'middle school', 'high school', 'public schools', 'superintendent',
      'school board', 'school principal', 'assistant principal', 'teacher', 'k 12', 'k12', 'unified school', 'regional school', 'academy', 'supervisory union'],
    exclude: ['academy of', 'khan academy', 'police academy', 'naval academy', 'military academy', 'air force academy'],
    buyerTerms: ['school', 'school district', 'public school', 'private school', 'charter school', 'elementary school', 'middle school',
      'high school', 'teacher', 'educator', 'principals', 'school principal', 'superintendent', 'classroom', 'k 12!', 'k12!',
      'school board', 'stem teacher', 'special education teacher', 'school counselor', 'school nurse', 'homeschool family', 'supervisory union'],
    deciders: 'superintendents, principals and curriculum or technology directors',
    buyers: ['school superintendent', 'school district technology director', 'school district curriculum director', 'school principal'],
    connectors: {
      association: ['school boards association', 'superintendents association', 'school principals association'],
      channel: ['school district service center'],
      government: ['department of education'],
    },
    partners: ['k-12 education consultant'], related: ['higher_education', 'libraries', 'childcare'],
  },
  {
    id: 'higher_education', label: 'Colleges and universities', group: 'Education and children',
    examples: ['community colleges', 'technical colleges', 'state universities'],
    adj: 'college', customer: 'college', customers: 'colleges',
    terms: ['community college', 'technical college', 'college', 'university', 'state university', 'dean', 'higher education',
      'provost', 'registrar', 'continuing education', 'workforce education', 'career and technical', 'polytechnic',
      'technical institute', 'community and technical college', 'campus'],
    exclude: ['college street movers', 'college hunks', 'electoral college'],
    buyerTerms: ['college', 'university', 'community college', 'technical college', 'professor', 'faculty!', 'registrar',
      'dean', 'admissions office', 'higher education institution', 'continuing education program', 'campus'],
    deciders: 'deans, provosts and program directors',
    buyers: ['community college dean of workforce', 'workforce board executive director', 'vice president workforce development college', 'continuing education director', 'community college president'],
    connectors: {
      association: ['association of community colleges', 'manufacturers association'],
      channel: ['community college system office'],
      government: ['department of labor', 'higher education commission'],
    },
    partners: ['edtech consultant'], related: ['workforce_development', 'k12_education'],
  },
  {
    id: 'workforce_development', label: 'Workforce boards and job-training programs', group: 'Education and children',
    examples: ['workforce development boards', 'apprenticeship programs', 'American Job Centers'],
    adj: 'workforce', customer: 'workforce program', customers: 'workforce programs',
    terms: ['workforce board', 'workforce development', 'workforce investment', 'job training', 'apprenticeship',
      'career center', 'american job center', 'workforce solutions', 'employment and training', 'workforce programs',
      'workforce partnership', 'workforce alliance', 'workforce council', 'department of labor', 'labor department',
      'workforce commission', 'labor and workforce'],
    buyerTerms: ['workforce board', 'workforce development board', 'workforce program', 'job training program', 'apprenticeship program',
      'american job center', 'career center', 'workforce agency'],
    deciders: 'executive directors and program managers',
    buyers: ['workforce board executive director', 'apprenticeship program director'],
    connectors: { association: ['workforce board association'], government: ['department of labor'] },
    partners: [], related: ['higher_education', 'economic_development'],
  },
  {
    id: 'libraries', label: 'Libraries', group: 'Education and children',
    examples: ['public libraries', 'school and college libraries'],
    adj: 'library', customer: 'library', customers: 'libraries',
    terms: ['library', 'libraries', 'librarian'],
    buyerTerms: ['library', 'librarian', 'public library', 'library system'],
    deciders: 'library directors',
    buyers: ['library director'], connectors: { association: ['library association'], government: ['state library'] }, partners: [], related: ['k12_education', 'local_government'],
  },
  {
    id: 'banking', label: 'Banks, credit unions and lenders', group: 'Business and finance',
    examples: ['community banks', 'credit unions', 'CDFIs'],
    adj: 'banking', customer: 'bank', customers: 'banks and credit unions',
    terms: ['bank', 'banking', 'bancorp', 'bankers', 'credit union', 'savings', 'lender', 'lending', 'loan officer', 'trust company',
      'farm credit', 'cdfi', 'loan fund', 'mortgage', 'investment banking', 'investment banker', 'capital markets', 'securities',
      'leveraged finance', 'securitized products'],
    exclude: ['food bank', 'blood bank', 'data bank', 'river bank', 'west bank', 'riverbank', 'seed bank', 'savings plan'],
    buyerTerms: ['bank', 'community bank', 'credit union', 'lender', 'loan officer', 'cdfi', 'mortgage lender', 'banker',
      'financial institution', 'farm credit lender', 'regional bank'],
    exclude_buyer: ['food bank', 'seed bank', 'blood bank'],
    deciders: 'presidents, CEOs and lending or operations leaders',
    buyers: ['community bank president', 'credit union ceo', 'bank chief lending officer'],
    connectors: { association: ['bankers association', 'credit union league'], government: ['division of banking'] },
    partners: [], related: ['insurance', 'accounting'],
  },
  {
    id: 'insurance', label: 'Insurers and insurance agencies', group: 'Business and finance',
    examples: ['property and casualty insurers', 'crop insurers', 'independent agencies'],
    adj: 'insurance', customer: 'insurer', customers: 'insurers and agencies',
    service: true,
    terms: ['insurance', 'insurer', 'underwriter', 'underwriting', 'claims', 'state farm', 'actuary', 'actuarial', 'mutual'],
    buyerTerms: ['insurer', 'insurance company', 'insurance carrier', 'insurance agency', 'insurance agent', 'underwriter', 'reinsurer',
      'actuary', 'claims adjuster', 'insurance broker'],
    deciders: 'underwriting, claims and risk leaders',
    buyers: ['insurance company executive', 'insurance chief risk officer', 'underwriting director', 'insurance claims director', 'insurance agency owner'],
    connectors: { association: ['insurance agents association', 'insurance federation'], government: ['department of insurance'] },
    partners: [], related: ['banking'],
  },
  {
    id: 'accounting', label: 'Accounting and bookkeeping firms', group: 'Business and finance',
    examples: ['CPA firms', 'bookkeepers', 'tax preparers'],
    adj: 'accounting', customer: 'accounting firm', customers: 'accounting firms',
    service: true,
    terms: ['cpa', 'cpas', 'accounting firm', 'accountants', 'bookkeeping', 'tax services', 'audit', 'certified public'],
    buyerTerms: ['accountant', 'accounting firm', 'cpa', 'cpa firm', 'bookkeeper', 'tax preparer'],
    deciders: 'partners and practice managers',
    buyers: ['accounting firm partner'], connectors: { association: ['society of cpas'] }, partners: [], related: ['banking'],
  },
  {
    id: 'legal', label: 'Law firms and legal teams', group: 'Business and finance',
    examples: ['small law firms', 'in-house legal teams', 'legal aid organizations'],
    adj: 'legal', customer: 'law firm', customers: 'law firms',
    service: true,
    terms: ['law firm', 'law office', 'attorney', 'attorneys', 'lawyer', 'esq', 'llp', 'counsel', 'legal', 'paralegal', 'law group', 'bar association'],
    buyerTerms: ['law firm', 'lawyer', 'attorney', 'legal team', 'paralegal', 'general counsel', 'court', 'legal aid organization'],
    deciders: 'partners and office managers',
    buyers: ['law firm partner', 'law firm administrator'], connectors: { association: ['bar association'] }, partners: [], related: [],
  },
  {
    id: 'real_estate', label: 'Real estate agents and property managers', group: 'Trades, building and property',
    examples: ['real estate brokerages', 'property management companies', 'landlords'],
    adj: 'real estate', customer: 'real estate firm', customers: 'real estate firms',
    terms: ['real estate', 'realty', 'realtor', 'property management', 'properties', 'brokerage', 'homes'],
    buyerTerms: ['real estate agent', 'realtor', 'real estate broker', 'real estate brokerage', 'property manager', 'property management company',
      'landlord', 'real estate developer', 'leasing office', 'apartment owner', 'housing authority'],
    deciders: 'brokers, owners and property managers',
    buyers: ['real estate broker', 'property management company owner'], connectors: { association: ['association of realtors'] }, partners: [], related: ['construction'],
  },
  {
    id: 'construction', label: 'Building contractors and home builders', group: 'Trades, building and property',
    examples: ['general contractors', 'home builders', 'remodelers'],
    adj: 'construction', customer: 'contractor', customers: 'building contractors',
    terms: ['construction', 'contractor', 'contractors', 'builders', 'builder', 'excavation', 'roofing', 'plumbing',
      'electrical contractor', 'hvac', 'masonry', 'paving', 'general contractor', 'carpentry', 'design build', 'homebuilder'],
    exclude: CONSTRUCTION_EXCLUDE,
    buyerTerms: ['contractor', 'general contractor', 'builder', 'home builder', 'homebuilder', 'construction company', 'construction firm',
      'subcontractor', 'remodeler', 'construction crew', 'construction manager', 'excavation contractor', 'framer', 'mason', 'developer and builder',
      'concrete producer', 'ready mix producer', 'ready mix concrete producer', 'precast concrete producer', 'concrete contractor', 'concrete supplier'],
    deciders: 'owners, estimators and project managers',
    buyers: ['construction company owner', 'general contractor', 'construction project manager'],
    connectors: { association: ['builders association', 'associated general contractors', 'home builders association'], channel: ['construction supply dealer', 'lumber yard'] },
    partners: [], related: ['real_estate', 'manufacturing'],
  },
  {
    id: 'architecture_engineering', label: 'Architecture and engineering firms', group: 'Trades, building and property',
    examples: ['architecture firms', 'civil and structural engineers', 'landscape architects'],
    adj: 'architecture and engineering', customer: 'architecture or engineering firm', customers: 'architecture and engineering firms',
    terms: ['architects', 'architecture', 'architectural', 'architecture firm', 'engineering firm', 'civil engineering', 'structural engineering',
      'structural engineer', 'civil engineer', 'consulting engineers', 'landscape architecture', 'landscape architect', 'mep engineering', 'aia'],
    exclude: ['software architecture', 'enterprise architecture', 'solutions architecture', 'cloud architecture', 'data architecture',
      'information architecture', 'security architecture', 'network architecture', 'systems architecture', 'technical architecture'],
    buyerTerms: ['architect', 'architecture firm', 'architectural firm', 'engineering firm', 'civil engineer', 'structural engineer', 'mep engineer',
      'consulting engineer', 'landscape architect', 'architecture and engineering firm', 'a e firm', 'aec firm', 'design firm'],
    exclude_buyer: ['software architect', 'solutions architect', 'cloud architect', 'data architect', 'enterprise architect'],
    deciders: 'principals and project managers',
    buyers: ['architecture firm principal', 'engineering firm principal', 'architecture firm project manager'],
    connectors: {
      association: ['american institute of architects chapter', 'consulting engineers council', 'structural engineers association'],
      government: ['board of architects licensing'],
    },
    partners: [], related: [],
  },
  {
    id: 'landscaping', label: 'Landscaping and lawn-care companies', group: 'Trades, building and property',
    examples: ['lawn-care and pesticide applicators', 'landscape contractors', 'tree services'],
    adj: 'landscaping', customer: 'landscaping or lawn-care company', customers: 'landscaping and lawn-care companies',
    terms: ['landscaping', 'landscaper', 'landscape contractor', 'landscape maintenance', 'landscape services', 'landscape company',
      'lawn care', 'lawncare', 'lawn service', 'lawn', 'turf', 'turfgrass', 'tree service', 'tree care', 'arborist', 'snow removal',
      'snow plowing', 'grounds maintenance', 'groundskeeping', 'groundskeeper', 'hardscape', 'irrigation contractor', 'lawn applicator',
      'nursery and landscape', 'landscape and nursery', 'landscape association', 'landscape industry', 'landscape professionals',
      'green industry'],
    exclude: ['lawn tennis', 'landscape architect', 'landscape architecture', 'landscape architects'],
    buyerTerms: ['landscaper', 'landscaping company', 'landscape contractor', 'landscaping business', 'landscape company', 'lawn care company',
      'lawn care business', 'lawn care provider', 'lawn care operator', 'lawn care!', 'lawn applicator', 'pesticide applicator',
      'lawn service', 'turf manager', 'groundskeeper', 'grounds crew', 'arborist', 'tree service', 'tree care company',
      'snow removal company', 'snow plow operator', 'irrigation contractor', 'golf course superintendent'],
    deciders: 'owners and operations managers',
    buyers: ['landscaping company owner', 'lawn care company owner', 'landscape contractor', 'landscaping operations manager'],
    connectors: {
      association: ['landscaping association', 'nursery and landscape association', 'lawn care association'],
      channel: ['turf equipment dealer', 'landscaping supply distributor'],
      government: ['lawn care pesticide licensing board'],
    },
    partners: ['landscaping supply company'], related: ['home_services'],
  },
  {
    id: 'home_services', label: 'Home-service trades (plumbing, HVAC, cleaning, pest control)', group: 'Trades, building and property',
    examples: ['plumbers and electricians', 'HVAC companies', 'cleaning and pest-control businesses'],
    adj: 'home services', customer: 'home-service business', customers: 'home-service businesses',
    terms: ['plumbing', 'plumber', 'hvac', 'heating and cooling', 'heating and air', 'electrician', 'electrical services', 'pest control',
      'exterminator', 'exterminating', 'house cleaning', 'cleaning services', 'maid service', 'janitorial', 'handyman', 'home services',
      'home service', 'septic', 'chimney', 'pool service', 'garage door', 'appliance repair', 'home improvement', 'remodeling',
      'painting contractor', 'roofing'],
    buyerTerms: ['plumber', 'plumbing company', 'electrician', 'hvac company', 'hvac contractor', 'hvac technician', 'pest control company',
      'exterminator', 'house cleaner', 'cleaning company', 'cleaning business', 'maid service', 'handyman', 'home service business',
      'home service company', 'home service trade', 'home services company', 'home service pro', 'roofer', 'painting contractor',
      'septic company', 'chimney sweep', 'pool service company', 'garage door company', 'appliance repair company', 'tradespeople!',
      'tradesperson', 'trades!', 'field service business'],
    deciders: 'owners and service managers',
    buyers: ['plumbing company owner', 'hvac company owner', 'home services business owner', 'hvac service manager'],
    connectors: {
      association: ['plumbing heating cooling contractors association', 'hvac contractors association', 'pest control association'],
      channel: ['plumbing supply distributor', 'hvac distributor'],
      government: ['plumbing licensing board'],
    },
    partners: [], related: ['construction', 'landscaping'],
  },
  {
    id: 'manufacturing', label: 'Manufacturers', group: 'Industry, energy and infrastructure',
    examples: ['machine shops', 'small factories', 'contract manufacturers'],
    adj: 'manufacturing', customer: 'manufacturer', customers: 'manufacturers',
    terms: ['manufacturing', 'manufacturer', 'machining', 'machine shop', 'fabrication', 'plant manager', 'industrial',
      'precision', 'tool and die', 'plastics', 'metalworks', 'foundry', 'assembly', 'production manager', 'mill', 'composites'],
    exclude: ['sawmill', 'paper mill'],
    buyerTerms: ['manufacturer', 'factory', 'plant manager', 'machine shop', 'fabricator', 'oem', 'manufacturing plant', 'contract manufacturer',
      'production manager', 'foundry', 'manufacturing^', 'smart manufacturing^', 'manufacturing company', 'manufacturing facility', 'manufacturing line',
      'production line', 'industrial facility', 'industrial plant', 'factory floor^', 'manufacturing team'],
    deciders: 'plant managers, owners and operations leaders',
    buyers: ['plant manager', 'manufacturing company owner'],
    connectors: { association: ['manufacturers association', 'manufacturing extension partnership'] },
    partners: [], related: ['logistics', 'food_manufacturing', 'forestry'],
  },
  {
    id: 'logistics', label: 'Trucking, freight and logistics', group: 'Industry, energy and infrastructure',
    examples: ['trucking companies', 'fleet operators', 'warehouses'],
    adj: 'logistics', customer: 'logistics company', customers: 'logistics companies',
    terms: ['logistics', 'trucking', 'freight', 'transportation', 'warehouse', 'warehousing', 'shipping', 'fleet',
      'distribution center', 'courier', 'transit', 'movers', 'moving'],
    buyerTerms: ['trucking company', 'fleet', 'fleet manager', 'fleet operator', 'freight broker', 'shipper', 'warehouse', '3pl',
      'logistics company', 'courier', 'delivery company', 'trucker', 'owner operator', 'moving company', 'transit agency'],
    deciders: 'owners, fleet and operations managers',
    buyers: ['trucking company owner', 'trucking fleet manager'], connectors: { association: ['trucking association'] },
    partners: [], related: ['manufacturing', 'wholesale_distribution'],
  },
  {
    id: 'wholesale_distribution', label: 'Distributors and wholesalers', group: 'Industry, energy and infrastructure',
    examples: ['food distributors', 'industrial suppliers', 'equipment dealers'],
    adj: 'distribution', customer: 'distributor', customers: 'distributors',
    terms: ['distributor', 'distributors', 'distribution', 'wholesale', 'wholesaler', 'supply', 'supplies', 'broker', 'brokerage'],
    exclude: ['supply chain', 'water supply'],
    buyerTerms: ['distributor', 'wholesaler', 'distribution company', 'equipment dealer'],
    deciders: 'owners, purchasing and sales leaders',
    buyers: ['distribution company owner', 'purchasing director distributor'], connectors: { association: ['wholesale distributors association'] }, partners: [], related: ['logistics'],
  },
  {
    id: 'retail', label: 'Shops and independent retailers', group: 'Shops, hospitality and tourism',
    examples: ['independent shops', 'hardware stores', 'online stores'],
    adj: 'retail', customer: 'retailer', customers: 'retailers',
    terms: ['retail', 'retailer', 'store', 'stores', 'shop', 'boutique', 'hardware', 'outfitters', 'outfitter', 'gift shop', 'emporium'],
    exclude: ['machine shop', 'body shop', 'app store', 'coffee shop'],
    buyerTerms: ['retailer', 'store', 'shop', 'boutique', 'independent retailer', 'store owner', 'shop owner', 'e commerce brand', 'online store',
      'online seller', 'merchant', 'hardware store', 'gift shop', 'retail owner', 'retail store owner', 'retail business', 'retail business owner',
      'retail store', 'retail shop', 'small retailer', 'shopkeeper'],
    exclude_buyer: ['app store', 'machine shop', 'body shop', 'repair shop', 'auto shop', 'tire shop'],
    deciders: 'store owners and managers',
    buyers: ['retail store owner', 'retail store manager'], connectors: { association: ['retail merchants association', 'retail association'] },
    partners: [], related: ['grocery_retail'],
  },
  {
    id: 'local_government', label: 'Towns, cities and counties', group: 'Government and public sector',
    examples: ['town managers', 'county administrators', 'public works departments'],
    adj: 'municipal', customer: 'town or county', customers: 'towns, cities and counties',
    terms: ['town of', 'city of', 'village of', 'county of', 'county', 'counties', 'towns', 'cities', 'municipalities',
      'local government', 'municipal', 'municipality', 'selectboard',
      'select board', 'town manager', 'city manager', 'town administrator', 'county administrator', 'mayor',
      'town clerk', 'city council', 'town council', 'board of selectmen', 'county commissioner', 'township', 'borough',
      'public works', 'communications union district'],
    exclude: ['county hospital', 'county bank', 'county savings', 'country'],
    buyerTerms: ['towns', 'cities', 'counties', 'municipality', 'municipal government', 'local government', 'town manager', 'city manager',
      'county administrator', 'selectboard', 'public works department', 'planning department', 'township', 'mayor', 'city council',
      'county commission', 'town clerk', 'police department', 'fire department', 'emergency management agency', 'town government', 'city government'],
    deciders: 'town managers, administrators and department heads',
    buyers: ['town manager', 'county administrator', 'selectboard chair', 'municipal it director'],
    connectors: { association: ['municipal association', 'association of counties'], government: ['regional planning commission'] },
    partners: [], related: ['state_government', 'economic_development', 'libraries'],
  },
  {
    id: 'state_government', label: 'State agencies', group: 'Government and public sector',
    examples: ['state departments', 'legislators', 'state broadband offices'],
    adj: 'state', customer: 'state agency', customers: 'state agencies',
    terms: ['state of', 'commonwealth of', 'department of', 'dept of', 'agency of', 'state agency', 'governor', 'legislature',
      'state senator', 'state representative', 'state office', 'state broadband office', 'public utilities commission',
      'public service commission', 'division of', 'house of delegates', 'general assembly', 'state senate', 'state house',
      'attorney general'],
    buyerTerms: ['state agency', 'state government', 'state department', 'state legislator', 'legislature', 'governors office', 'state office'],
    deciders: 'agency directors and program managers',
    buyers: ['state agency director', 'state agency program manager'], connectors: { association: ['state agency association'], channel: ['state government relations firm'] }, partners: [], related: ['local_government', 'federal_government'],
  },
  {
    id: 'federal_government', label: 'Federal agencies', group: 'Government and public sector',
    examples: ['USDA and SBA offices', 'military bases', 'national labs'],
    adj: 'federal', customer: 'federal agency', customers: 'federal agencies',
    terms: ['usda', 'rural development', 'sba', 'small business administration', 'federal', 'economic development administration',
      'eda', 'ntia', 'appalachian regional commission', 'delta regional authority', 'fcc', 'hhs', 'hrsa'],
    buyerTerms: ['federal agency', 'federal government', 'military', 'department of defense', 'national lab', 'government agency'],
    deciders: 'program officers and contracting officers',
    buyers: ['federal program officer', 'federal contracting officer'], connectors: { association: ['federal contractors association'], channel: ['procurement technical assistance center'] }, partners: [], related: ['state_government', 'economic_development'],
  },
  {
    id: 'economic_development', label: 'Economic development groups and chambers', group: 'Government and public sector',
    examples: ['chambers of commerce', 'regional development corporations', 'small business development centers'],
    adj: 'economic development', customer: 'economic development organisation', customers: 'economic development organisations',
    terms: ['economic development', 'development corporation', 'development authority', 'development council',
      'regional planning', 'planning commission', 'planning district', 'small business development center', 'sbdc',
      'chamber of commerce', 'chamber', 'regional development', 'business development council', 'enterprise center',
      'business incubator', 'innovation center', 'main street program', 'downtown association'],
    buyerTerms: ['economic development organization', 'economic developer', 'chamber of commerce', 'regional planning commission',
      'downtown association', 'main street program', 'sbdc', 'business incubator', 'development corporation'],
    deciders: 'executive directors',
    buyers: ['economic development director', 'chamber of commerce president'], connectors: { association: ['economic development council'] }, partners: [], related: ['local_government', 'workforce_development'],
  },
  {
    id: 'utilities', label: 'Utilities and electric co-ops', group: 'Industry, energy and infrastructure',
    examples: ['electric cooperatives', 'municipal water utilities', 'grid operators'],
    adj: 'utility', customer: 'utility', customers: 'utilities',
    terms: ['electric cooperative', 'electric coop', 'electric co op', 'rural electric', 'utility', 'utilities',
      'power company', 'water district', 'public power', 'light and power', 'electric membership', 'energy cooperative',
      'power cooperative', 'water authority', 'municipal light'],
    buyerTerms: ['utility', 'electric utility', 'water utility', 'electric cooperative', 'electric co op', 'municipal utility', 'public power utility',
      'grid operator', 'power company', 'water district', 'water authority', 'wastewater utility', 'gas utility', 'transmission operator'],
    deciders: 'general managers and operations or engineering leaders',
    buyers: ['electric cooperative ceo', 'utility operations director', 'municipal utility general manager'],
    connectors: { association: ['electric cooperative association', 'public power association', 'water utilities association'], government: ['public utilities commission'] },
    partners: [], related: ['broadband_telecom', 'energy'],
  },
  {
    id: 'broadband_telecom', label: 'Broadband and telecom providers', group: 'Industry, energy and infrastructure',
    examples: ['rural ISPs', 'telephone cooperatives', 'fiber builders'],
    adj: 'broadband', customer: 'broadband provider', customers: 'broadband providers',
    terms: ['broadband', 'fiber', 'fibre', 'internet service', 'telecom', 'telecommunications', 'telephone cooperative',
      'telephone company', 'wireless', 'isp', 'wisp', 'digital equity', 'digital inclusion', 'connectivity', 'middle mile',
      'last mile', 'fiber optic', 'cable'],
    exclude: ['fiber arts', 'fiber artist', 'fiber studio', 'wool and fiber', 'high fiber', 'dietary fiber', 'fiber mill',
      'cable knit', 'wireless retail', 'wireless store'],
    buyerTerms: ['broadband provider', 'internet service provider', 'isp', 'wisp', 'telecom company', 'telephone cooperative', 'fiber provider',
      'wireless carrier', 'cable operator', 'telecom operator'],
    deciders: 'CEOs, general managers and network leaders',
    buyers: ['broadband provider ceo', 'telecom general manager'],
    connectors: { association: ['broadband coalition', 'electric cooperative'], government: ['state broadband office', 'economic development corporation', 'usda rural development'] },
    partners: ['fiber construction contractor'], related: ['utilities', 'local_government'],
  },
  {
    id: 'energy', label: 'Solar, wind and energy companies', group: 'Industry, energy and infrastructure',
    examples: ['solar developers and installers', 'wind operators', 'propane and fuel dealers'],
    adj: 'energy', customer: 'energy company', customers: 'energy companies',
    terms: ['solar', 'wind', 'renewable', 'renewables', 'energy efficiency', 'clean energy', 'energy', 'biomass', 'geothermal', 'propane', 'fuel'],
    buyerTerms: ['solar company', 'solar installer', 'solar farm', 'solar developer', 'wind farm', 'wind operator', 'wind developer',
      'renewable energy developer', 'energy company', 'oil and gas company', 'propane dealer', 'fuel dealer', 'battery storage operator',
      'ev charging operator', 'independent power producer', 'solar operator'],
    deciders: 'owners, asset managers and operations leaders',
    buyers: ['solar company owner', 'renewable energy asset manager', 'wind farm operations manager'],
    connectors: { association: ['renewable energy association', 'solar energy industries association'] },
    partners: [], related: ['utilities'],
  },
  {
    id: 'data_centers', label: 'Data centers and cloud operators', group: 'Industry, energy and infrastructure',
    examples: ['colocation providers', 'enterprise data centers', 'cloud operators'],
    adj: 'data center', customer: 'data center operator', customers: 'data center operators',
    terms: ['data center', 'data centre', 'datacenter', 'datacentre', 'colocation', 'colo provider', 'hyperscale', 'hyperscaler', 'server farm',
      'critical facilities', 'critical environments', 'web hosting', 'managed hosting', 'cloud hosting', 'hosting provider', 'gpu cloud'],
    buyerTerms: ['data center!', 'data centre!', 'data center operator', 'colocation provider', 'hyperscaler', 'cloud provider', 'server farm',
      'critical facility'],
    deciders: 'facilities, operations and infrastructure leaders',
    buyers: ['data center operations director', 'data center facilities manager', 'critical facilities manager', 'colocation provider executive'],
    connectors: { association: ['data center association', 'data center coalition'], channel: ['data center equipment distributor'] },
    partners: [], related: ['utilities', 'software_it'],
  },
  {
    id: 'software_it', label: 'Software and tech companies', group: 'Business and finance',
    examples: ['SaaS companies', 'IT departments', 'managed service providers'],
    adj: 'software', customer: 'software company', customers: 'software companies',
    service: true,
    terms: ['software', 'saas', 'technologies', 'technology', 'tech', 'it services', 'information technology', 'cloud',
      'developer', 'engineer', 'data', 'analytics', 'platform', 'app', 'apps', 'digital', 'labs', 'cyber', 'systems',
      'computing', 'web', 'devops', 'programmer', 'ai', 'machine learning'],
    exclude: ['digital equity', 'digital inclusion', 'dental labs', 'dental lab', 'soil testing lab'],
    buyerTerms: ['software company', 'tech company', 'saas company', 'software team', 'engineering team', 'software developer', 'it department',
      'it team', 'managed service provider', 'msp', 'it leader', 'cio'],
    deciders: 'CTOs, engineering and IT leaders',
    buyers: ['software company cto', 'software company vp engineering', 'it services director'], connectors: { association: ['software association', 'saas association'] }, partners: [], related: ['health_it'],
  },
  {
    id: 'marketing_advertising', label: 'Marketing and creative agencies', group: 'Business and finance',
    examples: ['ad agencies', 'PR firms', 'in-house marketing teams'],
    adj: 'marketing', customer: 'agency', customers: 'agencies',
    service: true,
    terms: ['marketing', 'advertising', 'agency', 'public relations', 'branding', 'creative', 'media', 'seo', 'design studio', 'communications firm'],
    exclude: ['insurance agency', 'state agency', 'federal agency', 'area agency on aging', 'environmental protection agency', 'agency of'],
    buyerTerms: ['marketing agency', 'ad agency', 'advertising agency', 'marketer', 'marketing team', 'brand team', 'pr firm', 'creative agency', 'cmo'],
    deciders: 'agency owners and marketing leaders',
    buyers: ['marketing agency owner', 'marketing director'], connectors: { association: ['american marketing association chapter', 'advertising federation'] }, partners: [], related: [],
  },
  {
    id: 'consulting', label: 'Consulting firms', group: 'Business and finance',
    examples: ['management consultancies', 'independent consultants'],
    adj: 'consulting', customer: 'consultancy', customers: 'consultancies',
    service: true,
    terms: ['consulting', 'consultants', 'consultant', 'advisory', 'advisors', 'solutions', 'strategies', 'partners group'],
    buyerTerms: ['consulting firm', 'consultancy', 'management consultant', 'independent consultant', 'advisory firm'],
    deciders: 'partners and principals',
    buyers: ['consulting firm partner'], connectors: { association: ['management consultants institute'] }, partners: [], related: [],
  },
  {
    id: 'staffing_hr', label: 'Staffing firms and HR teams', group: 'Business and finance',
    examples: ['staffing agencies', 'recruiters', 'HR departments'],
    adj: 'staffing', customer: 'staffing firm', customers: 'staffing firms',
    service: true,
    terms: ['staffing', 'recruiting firm', 'recruitment', 'peo', 'hr services', 'talent agency', 'executive search'],
    buyerTerms: ['staffing firm', 'staffing agency', 'recruiter', 'recruiting firm', 'hr team', 'hr department', 'hr manager', 'people team', 'peo'],
    deciders: 'owners and HR leaders',
    buyers: ['staffing agency owner', 'recruiting firm director'], connectors: { association: ['staffing association', 'recruitment association'] }, partners: [], related: ['workforce_development'],
  },
  {
    id: 'investment', label: 'Venture and investment', group: 'Business and finance', pickable: false,
    examples: ['venture funds', 'angel networks'],
    adj: 'investment', customer: 'investor', customers: 'investors',
    terms: ['venture', 'ventures', 'venture capital', 'angel', 'angels', 'angel network', 'investor', 'investors', 'investment',
      'investments', 'private equity', 'growth equity', 'seed fund', 'capital partners', 'impact fund', 'fund', 'capital', 'hedge fund',
      'asset management', 'investment management', 'capital management', 'portfolio manager', 'wealth management', 'private wealth',
      'family office', 'equity research', 'trader', 'quantitative trading', 'endowment'],
    exclude: ['capital region', 'capital area', 'capital city', 'capital district', 'capital markets', 'capital market', 'capital projects',
      'capital one', 'human capital', 'capital campaign', 'capital improvement', 'memorial fund', 'scholarship fund', 'relief fund',
      'defense fund', 'education fund', 'emergency fund', 'fund for', 'investment challenge', 'investment banking', 'investment banker',
      'grain trader', 'commodity trader', 'student investment', 'collegiate investors', 'investor relations'],
    buyerTerms: [],
    buyers: [], connectors: {}, partners: [], related: ['banking'],
  },
  {
    id: 'life_sciences', label: 'Pharma, biotech and medical-device companies', group: 'Health care',
    examples: ['biotech startups', 'medical-device makers', 'research labs'],
    adj: 'life sciences', customer: 'life sciences company', customers: 'life sciences companies',
    terms: ['pharmaceutical', 'pharmaceuticals', 'pharma', 'biopharma', 'biopharmaceutical', 'biotech', 'biotechnology', 'life sciences',
      'therapeutics', 'medical device', 'medical devices', 'medtech', 'bioscience', 'biosciences', 'biologics', 'drug development'],
    buyerTerms: ['pharma company', 'pharmaceutical company', 'biotech company', 'biotech!', 'life sciences company', 'medical device company',
      'medical device maker', 'medical device manufacturer', 'medtech company', 'drug developer', 'research lab', 'clinical research organization', 'cro'],
    deciders: 'R&D, operations and commercial leaders',
    buyers: ['biotech company executive', 'medical device company vp operations'], connectors: { association: ['life sciences association', 'biotech association'] },
    partners: [], related: ['health_it', 'pharmacy'],
  },
  {
    id: 'aerospace_defense', label: 'Aerospace and defense companies', group: 'Industry, energy and infrastructure',
    examples: ['satellite operators', 'defense contractors', 'airports and airlines'],
    adj: 'aerospace', customer: 'aerospace or defense company', customers: 'aerospace and defense companies',
    terms: ['aerospace', 'aeronautics', 'aeronautical', 'avionics', 'spacecraft', 'rocket', 'satellite', 'defense contractor',
      'defense systems', 'space systems', 'launch vehicle'],
    buyerTerms: ['aerospace company', 'defense contractor', 'satellite operator', 'launch provider', 'airline', 'airport', 'aircraft manufacturer', 'space agency'],
    deciders: 'program managers and engineering leaders',
    buyers: ['aerospace company executive', 'aerospace program manager'], connectors: { association: ['aerospace association'] },
    partners: [], related: ['manufacturing', 'federal_government'],
  },
  {
    id: 'nonprofit', label: 'Nonprofits and foundations', group: 'Community, media and culture',
    examples: ['community nonprofits', 'advocacy groups', 'community foundations'],
    adj: 'nonprofit', customer: 'nonprofit', customers: 'nonprofits',
    terms: ['foundation', 'nonprofit', 'non profit', 'community foundation', 'charity', 'food bank', 'food pantry',
      'united way', 'community action', 'land trust', 'philanthropy'],
    buyerTerms: ['nonprofit', 'non profit', 'charity', 'foundation', 'community foundation', 'community organization', 'advocacy group',
      'advocacy organization', 'food bank', 'food pantry', 'mission driven organization', 'ngo',
      'faith based organization', 'church', 'land trust', 'community action agency'],
    exclude_buyer: ['foundation model', 'foundation repair'],
    deciders: 'executive directors and development directors',
    buyers: ['nonprofit executive director', 'nonprofit development director'],
    connectors: { association: ['nonprofit association', 'council of nonprofits'], channel: ['community foundation', 'united way'] }, partners: [], related: [],
  },
  {
    id: 'small_business', label: 'Small-business owners and solo founders', group: 'Business and finance',
    examples: ['main-street business owners', 'solo founders and freelancers', 'women-owned businesses'],
    adj: 'small business', customer: 'small business', customers: 'small-business owners',
    terms: ['small business owner', 'small business', 'solopreneur', 'entrepreneur', 'microbusiness', 'main street business'],
    exclude: ['small business administration', 'small business development center', 'small business development', 'entrepreneur in residence',
      'entrepreneurship center', 'small business lending', 'small business banking'],
    buyerTerms: ['small business', 'small business owner', 'solo founder', 'founder', 'women founder', 'female founder', 'first time founder',
      'entrepreneur', 'solopreneur', 'freelancer', 'independent business', 'main street business', 'microbusiness', 'startup', 'startup founder',
      'self employed professional', 'independent business owner', 'business owner', 'independent contractor^', 'independent worker^', 'gig worker^',
      'freelance worker^', 'small business operator'],
    deciders: 'the owners themselves',
    buyers: ['small business owner', 'small business founder', 'entrepreneur'],
    connectors: {
      association: ['chamber of commerce', 'small business development center', 'small business association'],
      channel: ['business incubator', 'entrepreneur center'],
      government: ['small business administration'],
    },
    partners: ['small business accountant', 'small business coach'], related: ['economic_development'],
  },
  {
    id: 'forestry', label: 'Forestry, logging and sawmills', group: 'Farms, food and animals',
    examples: ['sawmills', 'loggers', 'woodland owners'],
    adj: 'forestry', customer: 'forestry business', customers: 'forestry businesses',
    terms: ['forestry', 'forest products', 'timber', 'lumber', 'sawmill', 'logging', 'wood products', 'woodlands', 'paper mill', 'forester'],
    buyerTerms: ['sawmill', 'logger', 'logging company', 'forester', 'woodland owner', 'forest landowner', 'timber company', 'wood products manufacturer'],
    deciders: 'owners and foresters',
    buyers: ['sawmill owner', 'forester'], connectors: { association: ['forest products association', 'woodlands owners association'] }, partners: [], related: ['agriculture', 'manufacturing'],
  },
  {
    id: 'tourism_recreation', label: 'Tourism and outdoor recreation', group: 'Shops, hospitality and tourism',
    examples: ['ski areas', 'campgrounds and marinas', 'outfitters and guides'],
    adj: 'tourism', customer: 'tourism business', customers: 'tourism businesses',
    terms: ['tourism', 'outdoor recreation', 'recreation', 'ski', 'ski area', 'visitors bureau', 'convention and visitors',
      'campground', 'marina', 'outfitters', 'kayak', 'guide service', 'golf'],
    buyerTerms: ['ski area', 'ski resort', 'campground', 'outfitter', 'marina', 'tour operator', 'visitors bureau', 'golf course', 'attraction',
      'outdoor recreation business', 'guide service', 'rv park', 'summer camp'],
    deciders: 'owners and general managers',
    buyers: ['ski area general manager', 'campground owner'], connectors: { association: ['tourism association', 'outdoor recreation business alliance'] }, partners: [], related: ['restaurants_hospitality'],
  },
  {
    id: 'media_publishing', label: 'Newsrooms and local media', group: 'Community, media and culture',
    examples: ['local newspapers', 'public radio stations', 'digital newsrooms'],
    adj: 'media', customer: 'newsroom', customers: 'newsrooms and local media',
    terms: ['newspaper', 'publishing', 'publisher', 'radio', 'broadcasting', 'television', 'magazine', 'journalist', 'editor', 'news',
      'reporter', 'staff writer', 'correspondent', 'columnist', 'journalism', 'newsroom', 'editorial', 'public media', 'media group',
      'podcast', 'gazette', 'tribune', 'herald', 'chronicle', 'inquirer', 'courant', 'staff photographer', 'photojournalist'],
    buyerTerms: ['newsroom', 'newspaper', 'publisher', 'local news outlet', 'news outlet', 'news organization', 'journalist', 'editor',
      'reporter', 'broadcaster', 'radio station', 'tv station', 'magazine', 'podcaster', 'public media station', 'local newsroom'],
    deciders: 'publishers and editors',
    buyers: ['newspaper publisher', 'newspaper executive editor', 'radio news director', 'newsroom editor'],
    connectors: { association: ['newspaper press association', 'radio broadcasters association', 'newspaper association'] },
    partners: [], related: ['marketing_advertising'],
  },
  {
    id: 'childcare', label: 'Child care and early learning', group: 'Education and children',
    examples: ['child care centers', 'preschools', 'Head Start programs'],
    adj: 'child care', customer: 'child care center', customers: 'child care centers',
    terms: ['child care', 'childcare', 'daycare', 'day care', 'early learning', 'preschool', 'head start', 'early childhood'],
    buyerTerms: ['child care center', 'childcare center', 'daycare', 'day care', 'preschool', 'early learning center', 'head start program',
      'family child care provider', 'child care provider'],
    deciders: 'center directors and owners',
    buyers: ['child care center director'], connectors: { association: ['child care association'], government: ['office of child care licensing'] }, partners: [], related: ['k12_education'],
  },
  {
    id: 'automotive', label: 'Auto dealers and repair shops', group: 'Shops, hospitality and tourism',
    examples: ['car dealerships', 'auto repair shops', 'tire and body shops'],
    adj: 'automotive', customer: 'auto business', customers: 'auto dealers and repair shops',
    terms: ['auto', 'automotive', 'dealership', 'auto repair', 'garage', 'motors', 'collision', 'tire'],
    buyerTerms: ['auto dealer', 'car dealer', 'dealership', 'auto repair shop', 'repair shop', 'body shop', 'mechanic', 'tire shop', 'auto shop'],
    deciders: 'owners and service managers',
    buyers: ['auto dealership owner', 'service manager auto'], connectors: { association: ['auto dealers association'] }, partners: [], related: ['retail'],
  },
  {
    id: 'environmental', label: 'Environmental remediation and services', group: 'Industry, energy and infrastructure',
    examples: ['remediation contractors', 'environmental consultants', 'waste and recycling firms'],
    adj: 'environmental', customer: 'environmental services firm', customers: 'environmental services firms',
    terms: ['environmental', 'waste management', 'recycling', 'solid waste', 'wastewater', 'water quality', 'conservation',
      'remediation', 'environmental consulting', 'hazardous waste', 'brownfield', 'brownfields', 'environmental engineering', 'site remediation'],
    exclude: ['conservation district'],
    buyerTerms: ['remediation contractor', 'remediation firm', 'remediation company', 'environmental remediation contractor', 'environmental consultant',
      'environmental consulting firm', 'environmental engineering firm', 'environmental services firm', 'environmental services company',
      'waste hauler', 'waste management company', 'recycling center', 'recycler', 'brownfield developer', 'landfill', 'wastewater treatment plant'],
    deciders: 'principals and project managers',
    buyers: ['environmental remediation project manager', 'environmental services company owner', 'environmental consulting principal'],
    connectors: {
      association: ['environmental business council', 'brownfields coalition'],
      government: ['department of environmental protection', 'department of environmental quality', 'environmental protection agency'],
    },
    partners: [], related: ['utilities'],
  },
  {
    id: 'arts_culture', label: 'Museums, galleries and arts groups', group: 'Community, media and culture',
    examples: ['museums', 'art galleries', 'theaters and orchestras'],
    adj: 'arts', customer: 'arts organisation', customers: 'museums, galleries and arts organisations',
    terms: ['art gallery', 'gallery', 'galleries', 'museum', 'auction house', 'auctioneers', 'auctioneer', 'auctions', 'fine art', 'fine arts',
      'arts council', 'performing arts', 'theatre', 'theater', 'art dealer', 'orchestra', 'symphony'],
    exclude: ['operating theater', 'operating theatre', 'home theater', 'gallery of homes', 'photo gallery'],
    buyerTerms: ['museum', 'gallery', 'art gallery', 'auction house', 'arts organization', 'theater', 'theatre', 'orchestra',
      'performing arts center', 'arts council'],
    deciders: 'directors and curators',
    buyers: ['museum director', 'gallery owner', 'arts council executive director'],
    connectors: { association: ['arts council', 'museum association'] }, partners: [], related: [],
  },
];

// Public bodies whose remit names or clearly covers each buyer industry (regulates, licenses, funds or convenes it).
// A government or regulatory contact is a connector for a buyer industry only when the organisation (or, in a role with
// reach, the unit named in the title) matches one of these phrases. A generic "State of X" or "Town of X" employer does not.
// Each industry's own connectors.government phrases are added automatically.
const HEALTH_DEPT = ['department of health', 'department of public health', 'health department', 'health and human services', 'department of health services'];
const AG_DEPT = ['department of agriculture', 'usda', 'agriculture', 'agricultural', 'farm service agency', 'natural resources conservation service', 'nrcs',
  'conservation district', 'cooperative extension', 'extension service', 'food and agriculture', 'agency of agriculture'];
export const GOV_REMIT = {
  dental: ['board of dental examiners', 'dental examiners', 'dental board', 'board of dentistry', 'dental health', 'oral health', ...HEALTH_DEPT],
  healthcare_providers: [...HEALTH_DEPT, 'office of rural health', 'rural health', 'medicaid', 'health care authority', 'health authority', 'board of medicine',
    'medical board', 'board of nursing', 'board of medical', 'health resources and services administration', 'hrsa', 'centers for medicare', 'health planning'],
  behavioral_health: ['department of mental health', 'mental health', 'behavioral health', 'substance abuse', 'substance use', 'samhsa', 'addiction services',
    ...HEALTH_DEPT, 'human services', 'board of behavioral', 'board of social work'],
  social_services: ['department of social services', 'department of human services', 'human services', 'social services', 'children and families',
    'family services', 'child welfare', 'aging and disability', 'board of social work', 'health and human services'],
  long_term_care: ['department of aging', 'area agency on aging', 'aging', 'elder affairs', 'elder services', 'disabilities and aging', 'aging and disability',
    'long term care ombudsman', 'medicaid', ...HEALTH_DEPT],
  pharmacy: ['board of pharmacy', 'pharmacy board', 'pharmacy', 'drug control', ...HEALTH_DEPT],
  veterinary: ['state veterinarian', 'board of veterinary', 'veterinary', 'animal health', 'aphis', 'department of agriculture', 'agency of agriculture'],
  public_health: [...HEALTH_DEPT, 'public health', 'centers for disease control', 'cdc'],
  health_it: ['office of the national coordinator', 'health information', 'health information exchange', 'telehealth', 'medicaid', ...HEALTH_DEPT],
  agriculture: AG_DEPT,
  livestock: [...AG_DEPT, 'state veterinarian', 'animal health', 'aphis', 'livestock', 'dairy'],
  food_manufacturing: ['food safety', 'food and drug administration', 'fda', 'department of agriculture', 'agency of agriculture', 'food and agriculture',
    'usda', 'food protection'],
  grocery_retail: ['food and nutrition service', 'wic', 'snap', 'food safety', 'weights and measures', 'department of agriculture'],
  restaurants_hospitality: ['liquor control', 'alcoholic beverage', 'alcohol beverage', 'liquor and cannabis', 'food protection', 'restaurant inspection',
    'department of tourism', 'tourism', 'hospitality'],
  k12_education: ['department of education', 'board of education', 'state board of education', 'education department', 'office of education',
    'education agency', 'agency of education', 'department of public instruction', 'public instruction', 'education service center',
    'educational service', 'board of cooperative educational services', 'boces', 'school', 'schools'],
  higher_education: ['higher education', 'board of regents', 'department of education', 'board of higher education', 'education commission',
    'college system', 'university system', 'student aid', 'student assistance'],
  workforce_development: ['department of labor', 'labor and workforce', 'workforce', 'employment security', 'employment and training',
    'employment services', 'department of employment', 'labor and industry'],
  libraries: ['state library', 'library', 'libraries', 'institute of museum and library services', 'imls'],
  banking: ['division of banking', 'department of banking', 'banking', 'financial institutions', 'financial regulation', 'federal reserve', 'fdic',
    'comptroller of the currency', 'ncua', 'credit union administration', 'consumer financial protection', 'financial services'],
  insurance: ['department of insurance', 'division of insurance', 'insurance', 'financial regulation', 'financial services'],
  accounting: ['board of accountancy', 'accountancy', 'department of revenue', 'department of taxation', 'internal revenue service', 'irs', 'taxation'],
  // Courts, prosecutors and public defenders are legal teams themselves (customers), not bodies that regulate law firms.
  legal: ['board of bar examiners', 'bar admissions', 'attorney registration', 'disciplinary board', 'office of court administration',
    'legal services corporation', 'access to justice commission'],
  real_estate: ['real estate commission', 'real estate', 'housing', 'housing authority', 'housing finance', 'hud', 'department of housing'],
  construction: ['building codes', 'building code', 'contractor licensing', 'contractors board', 'board of contractors', 'building department',
    'building safety', 'department of transportation', 'labor and industry', 'public works', 'construction'],
  architecture_engineering: ['board of architects', 'board of architecture', 'board of engineers', 'board of professional engineers', 'engineering licensure',
    'professional regulation', 'department of transportation', 'public works'],
  landscaping: ['pesticide', 'nursery inspection', 'department of agriculture', 'agency of agriculture', 'urban forestry'],
  home_services: ['plumbing board', 'board of plumbing', 'electrical board', 'board of electrical', 'contractor licensing', 'building codes',
    'professional regulation', 'pest control', 'trade licensing'],
  manufacturing: ['manufacturing extension partnership', 'manufacturing', 'department of commerce', 'economic development',
    'occupational safety', 'osha'],
  logistics: ['department of transportation', 'transportation', 'motor carrier', 'fmcsa', 'port authority', 'ports authority', 'freight', 'transit'],
  wholesale_distribution: ['department of commerce', 'commerce'],
  retail: ['department of revenue', 'consumer protection', 'department of commerce', 'main street', 'weights and measures'],
  local_government: ['council of governments', 'regional planning', 'planning commission', 'department of local affairs', 'local government',
    'community affairs', 'municipal', 'local affairs', 'housing and community'],
  state_government: [],
  federal_government: [],
  economic_development: ['economic development', 'department of commerce', 'commerce', 'community development', 'economic development administration',
    'rural development', 'small business administration'],
  utilities: ['public utilities commission', 'public utility commission', 'public service commission', 'utilities commission', 'utility commission',
    'public service board', 'department of public utilities', 'department of public service', 'utilities board', 'board of public utilities',
    'utility regulatory', 'energy regulatory', 'federal energy regulatory commission', 'ferc', 'rural utilities service', 'department of energy',
    'energy office', 'energy commission', 'corporation commission', 'drinking water', 'water resources', 'public utilities', 'public utility'],
  broadband_telecom: ['broadband office', 'office of broadband', 'broadband', 'department of public service', 'public service board', 'federal communications commission', 'fcc', 'ntia',
    'national telecommunications and information administration', 'public service commission', 'public utilities commission',
    'public utility commission', 'rural utilities service', 'telecommunications', 'connectivity', 'digital equity'],
  energy: ['energy office', 'department of energy', 'energy commission', 'energy', 'public utilities commission', 'public utility commission',
    'public service commission', 'federal energy regulatory commission', 'ferc', 'energy resources'],
  data_centers: ['department of energy', 'energy office', 'public utilities commission', 'public service commission', 'economic development',
    'information technology', 'technology services'],
  software_it: ['information technology', 'technology services', 'digital services', 'innovation and technology', 'chief information officer'],
  marketing_advertising: [],
  consulting: [],
  staffing_hr: ['department of labor', 'workforce', 'employment security', 'labor and industry'],
  life_sciences: ['food and drug administration', 'fda', 'national institutes of health', 'nih', 'biomedical', 'life sciences'],
  aerospace_defense: ['federal aviation administration', 'faa', 'nasa', 'department of defense', 'aeronautics', 'space agency', 'defense innovation unit'],
  nonprofit: ['community services', 'charitable trusts', 'charities bureau', 'national service', 'americorps', 'community development'],
  small_business: ['small business administration', 'sba', 'small business development', 'economic development', 'department of commerce',
    'commerce', 'community development'],
  forestry: ['department of forests', 'forestry', 'forest service', 'forests', 'department of natural resources', 'natural resources',
    'department of conservation'],
  tourism_recreation: ['department of tourism', 'tourism', 'travel', 'parks and recreation', 'outdoor recreation', 'natural resources', 'park service',
    'forests parks and recreation', 'fish and wildlife'],
  media_publishing: ['federal communications commission', 'fcc', 'corporation for public broadcasting', 'public broadcasting'],
  childcare: ['child care', 'childcare', 'early childhood', 'early learning', 'children and families', 'children youth and families', 'head start',
    'office of child care', 'human services', 'social services'],
  automotive: ['department of motor vehicles', 'motor vehicles', 'motor vehicle', 'dmv'],
  environmental: ['department of environmental protection', 'department of environmental quality', 'environmental protection', 'environmental quality',
    'environmental conservation', 'environmental protection agency', 'epa', 'environmental', 'natural resources', 'water resources', 'waste management'],
  arts_culture: ['arts council', 'council on the arts', 'arts commission', 'national endowment for the arts', 'humanities', 'cultural affairs',
    'arts and culture', 'museum and library'],
};

for (const ind of INDUSTRIES) {
  if (ind.pickable === undefined) ind.pickable = true;
  if (!ind.deciders) ind.deciders = 'owners and managers';
  const gov = (ind.connectors && ind.connectors.government) || [];
  ind.remit = [...new Set([...(GOV_REMIT[ind.id] || []), ...gov].map((x) => normalize(x).trim()))];
  // Organisations named by this industry's connector queries ("electric cooperative" for broadband, "manufacturers
  // association" for colleges) count as linked to it even when their own industry is different.
  const conn = ind.connectors || {};
  ind.connectorPhrases = [...new Set([...(conn.association || []), ...(conn.channel || [])].map((x) => normalize(x).trim()))];
}

export const BY_ID = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));
export const SERVICE_IDS = new Set(INDUSTRIES.filter((i) => i.service).map((i) => i.id));
export const GOVERNMENT_IDS = new Set(['local_government', 'state_government', 'federal_government']);

// ---------------------------------------------------------------------------
// Text helpers

export function normalize(s) {
  return ` ${String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function termPattern(term) {
  const words = normalize(term).trim().split(' ');
  const last = words.pop();
  const lastPat = last.length > 3 && !/s$/.test(last) ? `${escapeRe(last)}(?:s|es)?` : escapeRe(last);
  return [...words.map(escapeRe), lastPat].join(' +');
}

function compile(terms) {
  if (!terms || !terms.length) return null;
  // Longest phrases first, so "ski area" is not shadowed by "ski".
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  return new RegExp(` (?:${sorted.map(termPattern).join('|')}) `, 'g');
}

for (const ind of INDUSTRIES) {
  ind._re = compile(ind.terms);
  ind._ex = ind.exclude && ind.exclude.length ? compile(ind.exclude) : null;
}

// Pad spaces between words so overlapping matches (" a b " " b c ") are all found.
function spaced(text) { return text.replace(/ /g, '  '); }

/** Return the industry terms that appear in already-normalized text. */
export function matchIndustry(ind, normText) {
  let t = normText;
  if (ind._ex) t = t.replace(ind._ex, ' ');
  if (!ind._re) return [];
  const hits = spaced(t).match(ind._re);
  return hits ? hits.map((h) => h.trim()) : [];
}

// ---------------------------------------------------------------------------
// Buyer terms (for inferring who buys from a founder's own words)

/** Last-word plural forms: "company" -> companies, "farm" -> farms, "box" -> boxes; words ending in s stay exact. */
function buyerTermPattern(term) {
  const words = normalize(term).trim().split(' ');
  const last = words.pop();
  let lastPat;
  if (/s$/.test(last)) lastPat = escapeRe(last);
  else if (/[^aeiou]y$/.test(last)) lastPat = `${escapeRe(last.slice(0, -1))}(?:y|ies)`;
  else lastPat = `${escapeRe(last)}(?:s|es)?`;
  return [...words.map(escapeRe), lastPat].join(' +');
}

for (const ind of INDUSTRIES) {
  ind._buyers = (ind.buyerTerms || []).map((raw) => {
    // '!' mass noun (counts without a plural); '^' counts only as the object of an explicit buyer statement ("for smart manufacturing").
    const mass = /!$/.test(raw);
    const statementOnly = /\^$/.test(raw);
    const term = normalize(raw.replace(/[!^]$/, '')).trim();
    return { term, mass, statementOnly, words: term.split(' ').length, re: new RegExp(` ${buyerTermPattern(term)} `, 'g') };
  });
  const ex = [...(ind.exclude || []), ...(ind.exclude_buyer || [])];
  ind._bex = ex.length ? compile(ex) : null;
}

export const PICKABLE_IDS = new Set(INDUSTRIES.filter((i) => i.pickable).map((i) => i.id));

/** Buyer types a founder can pick, grouped and in plain words: [{ id, label, group, examples }]. */
export function buyerTypes() {
  return INDUSTRIES.filter((i) => i.pickable)
    .map((i) => ({ id: i.id, label: i.label, group: i.group, examples: [...(i.examples || [])] }))
    .sort((a, b) => (GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group)) || a.label.localeCompare(b.label));
}

/** Score industries present in a piece of text. Returns [{id, hits}] (unsorted). */
export function industriesIn(text) {
  const norm = typeof text === 'string' && text.startsWith(' ') ? text : normalize(text);
  const out = [];
  for (const ind of INDUSTRIES) {
    const hits = matchIndustry(ind, norm);
    if (hits.length) out.push({ id: ind.id, hits });
  }
  return out;
}

/** Remove generic single words that are too weak to define an industry on their own in a query. */
export const WEAK_QUERY_TERMS = new Set(['data', 'platform', 'app', 'apps', 'digital', 'systems', 'web', 'tech', 'technology',
  'ai', 'engineer', 'developer', 'creative', 'media', 'solutions', 'partners group', 'mutual', 'claims', 'patient',
  'store', 'stores', 'shop', 'market', 'county', 'capital', 'fund', 'supply', 'supplies', 'distribution', 'broker',
  'extension', 'acres', 'harvest', 'kitchen', 'provisions', 'homes', 'properties', 'garage', 'tire', 'news', 'editor',
  'precision', 'industrial', 'assembly', 'mill', 'energy', 'fuel', 'cable', 'wireless', 'campus', 'dean', 'principal',
  'academy', 'nurse', 'nursing', 'savings', 'mortgage', 'counsel', 'legal', 'audit', 'golf', 'ski', 'recreation',
  'transit', 'moving', 'movers', 'shipping', 'fleet', 'soil', 'ag', 'agri', 'conservation', 'deli', 'marketplace',
  'food', 'foods', 'co ops']);

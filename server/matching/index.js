// Public interface of the matching module (see CONTRACT.md).
export { enrichPerson } from './enrich.js';
export { search } from './search.js';
export { suggestLeads } from './suggest.js';
export { explainBusiness, analyzeBusiness, confirmedIndustries, wantedLeadTypes, LEAD_TYPE_VALUES, NEEDS_INPUT_MESSAGE } from './personas.js';
export { inferBuyers } from './buyers.js';

// Extras for tests, the eval, and the backend if useful.
export { analyzeOrg, classifyPerson, careerStage, EARLY_LABELS } from './enrich.js';
export { lookupCompany, companyKey, KNOWN_COMPANY_COUNT } from './companies.js';
export { applyCompanyCache, classifyCompaniesWithLlm, ensureCompanyCache, cachedCompanyClass } from './llm_companies.js';
export { parseQuery } from './query.js';
export { rankPool } from './search.js';
export { INDUSTRIES, buyerTypes, PICKABLE_IDS } from './taxonomy.js';
export { llmAvailable } from './llm.js';

/** Words for the people_fts `tags` column: industries + org_type + job_function, space-separated. */
export function ftsTags({ industries = [], org_type, job_function } = {}) {
  return [...industries, org_type, job_function].filter(Boolean).join(' ').replace(/_/g, ' ');
}

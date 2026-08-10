export const PRODUCT_STATES = Object.freeze([
  'DRAFT',
  'EVIDENCE_REQUIRED',
  'CONDITIONAL',
  'READY_FOR_HUMAN_REVIEW',
  'APPROVED',
  'OPERATING',
  'REASSESSMENT_DUE',
  'SUSPENDED'
]);

function normaliseSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

export function evaluateProduct(spec, assessment = {}) {
  if (!spec) throw new Error('Product spec is required');

  const completedArtefacts = normaliseSet(assessment.completedArtefacts);
  const satisfiedGates = normaliseSet(assessment.satisfiedGates);
  const artefacts = spec.artefacts || [];
  const gates = spec.hardGates || [];

  const missingArtefacts = artefacts.filter(item => !completedArtefacts.has(item));
  const failedGates = gates.filter(item => !satisfiedGates.has(item));

  const artefactScore = artefacts.length ? completedArtefacts.size / artefacts.length : 1;
  const gateScore = gates.length ? satisfiedGates.size / gates.length : 1;
  const weightedScore = Math.round(((artefactScore * 0.55) + (gateScore * 0.45)) * 100);

  const humanApproval = assessment.humanApproval === true;
  const operating = assessment.operating === true;
  const reassessmentDue = assessment.reassessmentDue === true;
  const suspended = assessment.suspended === true;

  let state = 'EVIDENCE_REQUIRED';
  if (suspended) state = 'SUSPENDED';
  else if (reassessmentDue) state = 'REASSESSMENT_DUE';
  else if (failedGates.length > 0) state = weightedScore >= 60 ? 'CONDITIONAL' : 'EVIDENCE_REQUIRED';
  else if (!humanApproval) state = 'READY_FOR_HUMAN_REVIEW';
  else if (operating) state = 'OPERATING';
  else state = 'APPROVED';

  return {
    productId: assessment.productId || null,
    state,
    weightedScore,
    humanApproval,
    missingArtefacts,
    failedGates,
    metrics: spec.metrics || [],
    cadence: spec.cadence || null,
    acceptance: spec.acceptance || null,
    nextActions: buildNextActions({missingArtefacts, failedGates, humanApproval, state})
  };
}

function buildNextActions({missingArtefacts, failedGates, humanApproval, state}) {
  const actions = [];
  if (missingArtefacts.length) actions.push(`Complete ${missingArtefacts.length} required artefact(s).`);
  if (failedGates.length) actions.push(`Resolve ${failedGates.length} mandatory gate(s) before approval.`);
  if (!humanApproval && failedGates.length === 0) actions.push('Route the evidence pack to the named human approval authority.');
  if (state === 'REASSESSMENT_DUE') actions.push('Run the required reassessment before continued reliance.');
  if (state === 'SUSPENDED') actions.push('Keep the workflow blocked until an authorised human removes suspension.');
  if (!actions.length) actions.push('Maintain evidence, metrics and scheduled review cadence.');
  return actions;
}

export function createEmptyAssessment(productId, spec) {
  return {
    productId,
    completedArtefacts: [],
    satisfiedGates: [],
    humanApproval: false,
    operating: false,
    reassessmentDue: false,
    suspended: false,
    expectedArtefacts: [...(spec?.artefacts || [])],
    expectedGates: [...(spec?.hardGates || [])]
  };
}

import { getDeepProductSpec } from './deep-registry.mjs';
import { evaluateProduct } from './product-evaluator.mjs';

export const EVIDENCE_STATES = Object.freeze(['MISSING','UNVERIFIED','VERIFIED','EXPIRED','REJECTED']);
export const GATE_STATES = Object.freeze(['OPEN','PASSED','FAILED','WAIVED']);
export const APPROVAL_DECISIONS = Object.freeze(['PENDING','APPROVED','REJECTED','PAUSED']);

function isoNow(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function assertProduct(productId) {
  const spec = getDeepProductSpec(productId);
  if (!spec) throw new Error(`Unknown product: ${productId}`);
  return spec;
}

function uniqueId(prefix = 'rec') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProductCase({productId, caseId = uniqueId('case'), title = '', owner = '', now = new Date()} = {}) {
  const spec = assertProduct(productId);
  const createdAt = isoNow(now);
  return {
    schemaVersion: 1,
    caseId,
    productId,
    productName: spec.name,
    family: spec.family,
    title,
    owner,
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    evidence: [],
    gates: spec.hardGates.map(id => ({id, state: 'OPEN', evidenceRefs: [], reviewer: null, note: null, updatedAt: createdAt})),
    metrics: {},
    blockers: [],
    approval: {decision: 'PENDING', approver: null, note: null, decidedAt: null},
    operating: false,
    reassessmentDue: false,
    suspended: false,
    history: [{at: createdAt, type: 'CASE_CREATED', detail: {productId, owner}}]
  };
}

function bump(caseRecord, type, detail, now = new Date()) {
  const at = isoNow(now);
  return {
    ...caseRecord,
    updatedAt: at,
    revision: (caseRecord.revision || 0) + 1,
    history: [...(caseRecord.history || []), {at, type, detail}]
  };
}

function evidenceIsCurrent(record, now = new Date()) {
  if (record.state !== 'VERIFIED') return false;
  if (!record.expiresAt) return true;
  return new Date(record.expiresAt).getTime() > new Date(now).getTime();
}

export function addEvidence(caseRecord, {artefactId, description = '', source = '', integrity = '', owner = '', state = 'UNVERIFIED', collectedAt = new Date(), expiresAt = null, id = uniqueId('ev')} = {}, now = new Date()) {
  const spec = assertProduct(caseRecord.productId);
  if (!spec.artefacts.includes(artefactId)) throw new Error(`${artefactId} is not a required artefact for ${caseRecord.productId}`);
  if (!EVIDENCE_STATES.includes(state)) throw new Error(`Invalid evidence state: ${state}`);
  const record = {id, artefactId, description, source, integrity, owner, state, collectedAt: isoNow(collectedAt), expiresAt: expiresAt ? isoNow(expiresAt) : null};
  const next = bump({...caseRecord, evidence: [...caseRecord.evidence, record]}, 'EVIDENCE_ADDED', {id, artefactId, state}, now);
  return next;
}

export function updateEvidenceState(caseRecord, evidenceId, state, note = '', now = new Date()) {
  if (!EVIDENCE_STATES.includes(state)) throw new Error(`Invalid evidence state: ${state}`);
  let found = false;
  const evidence = caseRecord.evidence.map(item => {
    if (item.id !== evidenceId) return item;
    found = true;
    return {...item, state, reviewNote: note, reviewedAt: isoNow(now)};
  });
  if (!found) throw new Error(`Evidence not found: ${evidenceId}`);
  return bump({...caseRecord, evidence}, 'EVIDENCE_STATE_CHANGED', {evidenceId, state, note}, now);
}

export function setGate(caseRecord, gateId, state, {evidenceRefs = [], reviewer = null, note = null} = {}, now = new Date()) {
  const spec = assertProduct(caseRecord.productId);
  if (!spec.hardGates.includes(gateId)) throw new Error(`${gateId} is not a gate for ${caseRecord.productId}`);
  if (!GATE_STATES.includes(state)) throw new Error(`Invalid gate state: ${state}`);
  if (state === 'WAIVED' && !reviewer) throw new Error('A named reviewer is required to waive a gate');
  const gates = caseRecord.gates.map(gate => gate.id === gateId ? {...gate, state, evidenceRefs: [...evidenceRefs], reviewer, note, updatedAt: isoNow(now)} : gate);
  return bump({...caseRecord, gates}, 'GATE_STATE_CHANGED', {gateId, state, reviewer}, now);
}

export function recordMetric(caseRecord, metricId, value, {source = '', period = '', owner = ''} = {}, now = new Date()) {
  const spec = assertProduct(caseRecord.productId);
  if (!spec.metrics.includes(metricId)) throw new Error(`${metricId} is not a metric for ${caseRecord.productId}`);
  const metric = {value, source, period, owner, recordedAt: isoNow(now)};
  return bump({...caseRecord, metrics: {...caseRecord.metrics, [metricId]: metric}}, 'METRIC_RECORDED', {metricId, value}, now);
}

export function addBlocker(caseRecord, {severity = 'P1', code = uniqueId('blocker'), description = '', owner = '', dueAt = null} = {}, now = new Date()) {
  if (!['P0','P1','P2','P3'].includes(severity)) throw new Error(`Invalid blocker severity: ${severity}`);
  const blocker = {code, severity, description, owner, dueAt: dueAt ? isoNow(dueAt) : null, status: 'OPEN', openedAt: isoNow(now), closedAt: null, closureEvidence: null};
  return bump({...caseRecord, blockers: [...caseRecord.blockers, blocker]}, 'BLOCKER_ADDED', {code, severity, description}, now);
}

export function closeBlocker(caseRecord, code, closureEvidence, now = new Date()) {
  let found = false;
  const blockers = caseRecord.blockers.map(blocker => {
    if (blocker.code !== code) return blocker;
    found = true;
    return {...blocker, status: 'CLOSED', closedAt: isoNow(now), closureEvidence};
  });
  if (!found) throw new Error(`Blocker not found: ${code}`);
  if (!closureEvidence) throw new Error('Closure evidence is required');
  return bump({...caseRecord, blockers}, 'BLOCKER_CLOSED', {code, closureEvidence}, now);
}

export function decideApproval(caseRecord, {decision, approver, note = ''} = {}, now = new Date()) {
  if (!APPROVAL_DECISIONS.includes(decision) || decision === 'PENDING') throw new Error(`Invalid approval decision: ${decision}`);
  if (!approver) throw new Error('A named human approver is required');
  const approval = {decision, approver, note, decidedAt: isoNow(now)};
  const next = {
    ...caseRecord,
    approval,
    suspended: decision === 'PAUSED' || decision === 'REJECTED',
    operating: decision === 'APPROVED' ? caseRecord.operating : false
  };
  return bump(next, 'HUMAN_APPROVAL_DECIDED', {decision, approver}, now);
}

export function setOperating(caseRecord, operating, now = new Date()) {
  if (operating && caseRecord.approval?.decision !== 'APPROVED') throw new Error('Cannot enter operating state without named-human approval');
  return bump({...caseRecord, operating: Boolean(operating)}, 'OPERATING_STATE_CHANGED', {operating: Boolean(operating)}, now);
}

export function setReassessmentDue(caseRecord, due = true, now = new Date()) {
  return bump({...caseRecord, reassessmentDue: Boolean(due)}, 'REASSESSMENT_STATE_CHANGED', {due: Boolean(due)}, now);
}

export function assessCase(caseRecord, now = new Date()) {
  const spec = assertProduct(caseRecord.productId);
  const completedArtefacts = [...new Set(caseRecord.evidence.filter(item => evidenceIsCurrent(item, now)).map(item => item.artefactId))];
  const satisfiedGates = caseRecord.gates.filter(gate => gate.state === 'PASSED' || gate.state === 'WAIVED').map(gate => gate.id);
  const openP0Blockers = caseRecord.blockers.filter(blocker => blocker.severity === 'P0' && blocker.status === 'OPEN');
  const humanApproval = caseRecord.approval?.decision === 'APPROVED';

  const base = evaluateProduct(spec, {
    productId: caseRecord.productId,
    completedArtefacts,
    satisfiedGates,
    humanApproval,
    operating: caseRecord.operating,
    reassessmentDue: caseRecord.reassessmentDue,
    suspended: caseRecord.suspended
  });

  if (openP0Blockers.length) {
    return {
      ...base,
      state: 'SUSPENDED',
      openP0Blockers,
      nextActions: [`Resolve ${openP0Blockers.length} P0 blocker(s) before approval or operation.`, ...base.nextActions]
    };
  }

  return {...base, openP0Blockers: []};
}

export function buildCaseSnapshot(caseRecord, now = new Date()) {
  const assessment = assessCase(caseRecord, now);
  return {
    exportedAt: isoNow(now),
    schemaVersion: caseRecord.schemaVersion,
    caseId: caseRecord.caseId,
    productId: caseRecord.productId,
    productName: caseRecord.productName,
    family: caseRecord.family,
    title: caseRecord.title,
    owner: caseRecord.owner,
    revision: caseRecord.revision,
    assessment,
    approval: caseRecord.approval,
    evidence: caseRecord.evidence,
    gates: caseRecord.gates,
    metrics: caseRecord.metrics,
    blockers: caseRecord.blockers,
    history: caseRecord.history
  };
}

export function exportCaseJson(caseRecord, now = new Date()) {
  return JSON.stringify(buildCaseSnapshot(caseRecord, now), null, 2);
}

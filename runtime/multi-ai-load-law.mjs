import { createHash } from 'node:crypto';

export const MAL_VERSION = 'MAL-001/2.0';
export const CONNECTION_STATES = Object.freeze(['AVAILABLE','DEGRADED','UNREACHABLE','NOT_AUTHORISED','OUT_OF_SCOPE','QUARANTINED']);
export const LOAD_RISK = Object.freeze(['LOW','MEDIUM','HIGH','CRITICAL']);
export const LOAD_ROLES = Object.freeze(['Builder','Researcher','Tester','Adversarial Reviewer','Security Reviewer','Commercial Reviewer','Governance Reviewer','Evidence Verifier','Synthesiser']);
export const CONTRIBUTION_TYPES = Object.freeze(['Analysis','Code/Build','Test Evidence','Risk Finding','Alternative','Critique','Decision Support','Evidence']);

const ROLE_REQUIREMENTS = Object.freeze({
  LOW: ['Synthesiser'],
  MEDIUM: ['Tester','Adversarial Reviewer','Synthesiser'],
  HIGH: ['Tester','Adversarial Reviewer','Governance Reviewer','Evidence Verifier','Synthesiser'],
  CRITICAL: ['Tester','Adversarial Reviewer','Security Reviewer','Governance Reviewer','Evidence Verifier','Synthesiser']
});

const MIN_INDEPENDENT = Object.freeze({LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4});

function nowIso(now = new Date()) { return new Date(now).toISOString(); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((o,k) => (o[k]=stable(value[k]),o),{});
  return value;
}
function digest(value) { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }

export function createLoadContract({loadId, objective, riskClass='MEDIUM', consequential=false, participants=[], ownerOverride=null, now=new Date()}={}) {
  if (!loadId || !objective) throw new Error('loadId and objective are required');
  if (!LOAD_RISK.includes(riskClass)) throw new Error(`Invalid risk class: ${riskClass}`);
  const ids = participants.map(p => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('Participant IDs must be unique');
  const createdAt = nowIso(now);
  return {
    malVersion: MAL_VERSION, loadId, objective, riskClass, consequential,
    createdAt, updatedAt: createdAt,
    participants: participants.map(p => ({
      id:p.id, name:p.name || p.id, provider:p.provider || '',
      connectionState:p.connectionState || 'AVAILABLE', roles:[...(p.roles||[])],
      mandatoryForGate:Boolean(p.mandatoryForGate), authorisedScopes:[...(p.authorisedScopes||[])],
      exclusionReason:p.exclusionReason || null, quarantineReason:null
    })),
    contributions: [], conflicts: [], crossChecks: [], decisions: [],
    ownerOverride, humanApproval:null, finalResult:null, nextLoadImprovement:null,
    history:[{at:createdAt,type:'LOAD_CREATED'}]
  };
}

function bump(load, type, detail, now=new Date()) {
  const at = nowIso(now);
  return {...load, updatedAt:at, history:[...(load.history||[]),{at,type,detail}]};
}

export function recordParticipantState(load, participantId, connectionState, reason='', now=new Date()) {
  if (!CONNECTION_STATES.includes(connectionState)) throw new Error(`Invalid connection state: ${connectionState}`);
  let found=false;
  const participants=load.participants.map(p=>p.id===participantId?(found=true,{...p,connectionState,exclusionReason:reason||p.exclusionReason}):p);
  if (!found) throw new Error(`Unknown participant: ${participantId}`);
  return bump({...load,participants},'PARTICIPANT_STATE',{participantId,connectionState,reason},now);
}

export function quarantineParticipant(load, participantId, reason, now=new Date()) {
  if (!reason) throw new Error('Quarantine reason required');
  let found=false;
  const participants=load.participants.map(p=>p.id===participantId?(found=true,{...p,connectionState:'QUARANTINED',quarantineReason:reason}):p);
  if (!found) throw new Error(`Unknown participant: ${participantId}`);
  return bump({...load,participants},'PARTICIPANT_QUARANTINED',{participantId,reason},now);
}

export function addContribution(load, contribution, now=new Date()) {
  const p=load.participants.find(x=>x.id===contribution.participantId);
  if (!p) throw new Error(`Unknown participant: ${contribution.participantId}`);
  if (!['AVAILABLE','DEGRADED'].includes(p.connectionState)) throw new Error(`Participant ${p.id} is not available to contribute`);
  if (!CONTRIBUTION_TYPES.includes(contribution.type)) throw new Error(`Invalid contribution type: ${contribution.type}`);
  const record={
    id:contribution.id || `${load.loadId}-${contribution.participantId}-${load.contributions.length+1}`,
    participantId:contribution.participantId, type:contribution.type,
    summary:contribution.summary || '', evidenceRefs:[...(contribution.evidenceRefs||[])],
    confidence:Number.isFinite(contribution.confidence)?Math.max(0,Math.min(1,contribution.confidence)):0.5,
    reproducibility:Number.isFinite(contribution.reproducibility)?Math.max(0,Math.min(1,contribution.reproducibility)):0.5,
    evidenceQuality:Number.isFinite(contribution.evidenceQuality)?Math.max(0,Math.min(1,contribution.evidenceQuality)):0.5,
    safetyRisk:Number.isFinite(contribution.safetyRisk)?Math.max(0,Math.min(1,contribution.safetyRisk)):0,
    sourceFingerprint:contribution.sourceFingerprint || null,
    inputFingerprint:contribution.inputFingerprint || null,
    derivedFromParticipantIds:[...(contribution.derivedFromParticipantIds||[])],
    independent:contribution.independent !== false && !(contribution.derivedFromParticipantIds||[]).length,
    createdAt:nowIso(now)
  };
  return bump({...load,contributions:[...load.contributions,record]},'CONTRIBUTION_ADDED',{id:record.id,participantId:record.participantId},now);
}

export function scoreContribution(c) {
  const independence = c.independent ? 1 : 0.45;
  const evidence = c.evidenceRefs?.length ? c.evidenceQuality : c.evidenceQuality * 0.5;
  return Math.round(100 * Math.max(0,
    (0.32*evidence)+(0.24*c.reproducibility)+(0.18*c.confidence)+(0.16*independence)+(0.10*(1-c.safetyRisk))
  ));
}

export function addCrossCheck(load,{reviewerId,targetContributionId,result,evidenceRefs=[]}={},now=new Date()) {
  if (!load.participants.some(p=>p.id===reviewerId)) throw new Error('Unknown reviewer');
  if (!load.contributions.some(c=>c.id===targetContributionId)) throw new Error('Unknown target contribution');
  return bump({...load,crossChecks:[...load.crossChecks,{reviewerId,targetContributionId,result,evidenceRefs:[...evidenceRefs],at:nowIso(now)}]},'CROSS_CHECK_ADDED',{reviewerId,targetContributionId},now);
}

export function addConflict(load,{id,topic,severity='MATERIAL',positions=[],status='OPEN',resolution=null}={},now=new Date()) {
  if (!['MINOR','MATERIAL','CRITICAL'].includes(severity)) throw new Error('Invalid conflict severity');
  const record={id:id||`${load.loadId}-conflict-${load.conflicts.length+1}`,topic,severity,positions:[...positions],status,resolution};
  return bump({...load,conflicts:[...load.conflicts,record]},'CONFLICT_RECORDED',{id:record.id,severity},now);
}

export function setHumanApproval(load,{decision,approver,note=''}={},now=new Date()) {
  if (!['APPROVED','REJECTED','PAUSED'].includes(decision)) throw new Error('Invalid human decision');
  if (!approver) throw new Error('Named human approver required');
  return bump({...load,humanApproval:{decision,approver,note,at:nowIso(now)}},'HUMAN_GATE',{decision,approver},now);
}

export function setFinalResult(load,{result,nextLoadImprovement='',evidenceRefs=[]}={},now=new Date()) {
  if (!result) throw new Error('Final result required');
  return bump({...load,finalResult:{result,evidenceRefs:[...evidenceRefs],at:nowIso(now)},nextLoadImprovement},'MASTER_RESULT_SET',{result},now);
}

function lineageKey(c){ return c.sourceFingerprint || c.inputFingerprint || (c.derivedFromParticipantIds?.length ? `derived:${[...c.derivedFromParticipantIds].sort().join(',')}` : `participant:${c.participantId}`); }

export function evaluateLoadConformity(load) {
  const active=load.participants.filter(p=>['AVAILABLE','DEGRADED'].includes(p.connectionState));
  const unreachable=load.participants.filter(p=>['UNREACHABLE','NOT_AUTHORISED','OUT_OF_SCOPE','QUARANTINED'].includes(p.connectionState));
  const contributedIds=new Set(load.contributions.map(c=>c.participantId));
  const materiallyExcluded=active.filter(p=>!contributedIds.has(p.id) && !p.exclusionReason);
  const mandatoryUnavailable=unreachable.filter(p=>p.mandatoryForGate);

  const independent=load.contributions.filter(c=>c.independent);
  const lineages=new Set(independent.map(lineageKey));
  const independentCount=lineages.size;
  const requiredIndependent=Math.min(MIN_INDEPENDENT[load.riskClass],Math.max(1,active.length));

  const rolesPresent=new Set(active.flatMap(p=>p.roles));
  const missingRoles=ROLE_REQUIREMENTS[load.riskClass].filter(r=>!rolesPresent.has(r));
  const unresolvedMaterial=load.conflicts.filter(c=>c.status!=='RESOLVED' && ['MATERIAL','CRITICAL'].includes(c.severity));
  const hasAdversarial=active.some(p=>p.roles.includes('Adversarial Reviewer') && contributedIds.has(p.id));
  const crossChecked=load.contributions.length===0 ? false : load.contributions.every(c=>load.crossChecks.some(x=>x.targetContributionId===c.id) || c.type==='Critique');
  const humanRequired=load.consequential || ['HIGH','CRITICAL'].includes(load.riskClass);
  const humanApproved=load.humanApproval?.decision==='APPROVED';

  const violations=[];
  if (materiallyExcluded.length) violations.push(`Available participant(s) excluded without reason: ${materiallyExcluded.map(p=>p.id).join(', ')}`);
  if (mandatoryUnavailable.length) violations.push(`Mandatory participant(s) unavailable: ${mandatoryUnavailable.map(p=>p.id).join(', ')}`);
  if (independentCount<requiredIndependent) violations.push(`Independent evidence lineages ${independentCount}/${requiredIndependent}`);
  if (missingRoles.length) violations.push(`Required role coverage missing: ${missingRoles.join(', ')}`);
  if (['MEDIUM','HIGH','CRITICAL'].includes(load.riskClass) && !hasAdversarial) violations.push('Adversarial review contribution missing');
  if (['HIGH','CRITICAL'].includes(load.riskClass) && !crossChecked) violations.push('Not all material contributions are cross-checked');
  if (unresolvedMaterial.length) violations.push(`${unresolvedMaterial.length} unresolved material/critical conflict(s)`);
  if (!load.finalResult) violations.push('Master Load Result missing');
  if (humanRequired && !humanApproved) violations.push('Named-human approval required');

  let status='CONFORMING';
  if (mandatoryUnavailable.length || unresolvedMaterial.some(c=>c.severity==='CRITICAL')) status='BLOCKED';
  else if (violations.length) status='NON_CONFORMING';
  else if (humanRequired && humanApproved) status='APPROVED';

  return {
    malVersion:load.malVersion,loadId:load.loadId,status,
    participantsExpected:load.participants.length,participantsAvailable:active.length,
    participantsContributed:contributedIds.size,independentEvidenceLineages:independentCount,
    requiredIndependent,missingRoles,materiallyExcluded:materiallyExcluded.map(p=>p.id),
    unreachable:unreachable.map(p=>({id:p.id,state:p.connectionState,reason:p.exclusionReason||p.quarantineReason})),
    unresolvedConflicts:unresolvedMaterial.map(c=>c.id),humanRequired,humanApproved,violations
  };
}

export function rankContributions(load) {
  return [...load.contributions].map(c=>({...c,score:scoreContribution(c)})).sort((a,b)=>b.score-a.score);
}

export function buildLoadReceipt(load) {
  const conformity=evaluateLoadConformity(load);
  const ranked=rankContributions(load).map(c=>({id:c.id,participantId:c.participantId,type:c.type,score:c.score,evidenceRefs:c.evidenceRefs,independent:c.independent,sourceFingerprint:c.sourceFingerprint}));
  const receipt={malVersion:load.malVersion,loadId:load.loadId,objective:load.objective,riskClass:load.riskClass,consequential:load.consequential,conformity,participants:load.participants,contributions:ranked,conflicts:load.conflicts,humanApproval:load.humanApproval,finalResult:load.finalResult,nextLoadImprovement:load.nextLoadImprovement,updatedAt:load.updatedAt};
  return {...receipt,receiptSha256:digest(receipt)};
}

import { createHash } from 'node:crypto';

export const LOAD_PROTOCOL_VERSION = 'RICHO-MAL/1.0';
export const DATA_CLASSES = Object.freeze(['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','SECRET_CREDENTIAL']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((o,k)=>(o[k]=stable(value[k]),o),{});
  return value;
}
export function envelopeHash(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function createDispatchEnvelope({loadId,objective,riskClass,participantId,role,dataClass='PUBLIC',authorisedScopes=[],contextRefs=[],tasks=[],constraints=[],requiredEvidence=[],humanGates=[]}={}) {
  if (!loadId || !objective || !participantId || !role) throw new Error('loadId, objective, participantId and role are required');
  if (!DATA_CLASSES.includes(dataClass)) throw new Error(`Invalid data class: ${dataClass}`);
  if (dataClass==='SECRET_CREDENTIAL') throw new Error('Secret credentials must never be placed in load protocol envelopes');
  const payload={protocolVersion:LOAD_PROTOCOL_VERSION,type:'LOAD_DISPATCH',loadId,objective,riskClass,participantId,role,dataClass,authorisedScopes:[...authorisedScopes],contextRefs:[...contextRefs],tasks:[...tasks],constraints:[...constraints],requiredEvidence:[...requiredEvidence],humanGates:[...humanGates]};
  return {...payload,envelopeSha256:envelopeHash(payload)};
}

export function createContributionEnvelope({loadId,participantId,modelVersion='',role,type,summary,evidenceRefs=[],confidence=.5,reproducibility=.5,evidenceQuality=.5,safetyRisk=0,sourceFingerprint=null,inputFingerprint=null,derivedFromParticipantIds=[],assumptions=[],uncertainties=[],conflicts=[],recommendedNextActions=[]}={}) {
  if (!loadId || !participantId || !role || !type || !summary) throw new Error('loadId, participantId, role, type and summary are required');
  const clamp=v=>Math.max(0,Math.min(1,Number(v)));
  const payload={protocolVersion:LOAD_PROTOCOL_VERSION,type:'LOAD_CONTRIBUTION',loadId,participantId,modelVersion,role,contributionType:type,summary,evidenceRefs:[...evidenceRefs],confidence:clamp(confidence),reproducibility:clamp(reproducibility),evidenceQuality:clamp(evidenceQuality),safetyRisk:clamp(safetyRisk),sourceFingerprint,inputFingerprint,derivedFromParticipantIds:[...derivedFromParticipantIds],independent:derivedFromParticipantIds.length===0,assumptions:[...assumptions],uncertainties:[...uncertainties],conflicts:[...conflicts],recommendedNextActions:[...recommendedNextActions]};
  return {...payload,envelopeSha256:envelopeHash(payload)};
}

export function createHealthEnvelope({participantId,connectionState,capabilities=[],authorisedScopes=[],modelVersion='',notes=''}={}) {
  if (!participantId || !connectionState) throw new Error('participantId and connectionState are required');
  const payload={protocolVersion:LOAD_PROTOCOL_VERSION,type:'PARTICIPANT_HEALTH',participantId,connectionState,capabilities:[...capabilities],authorisedScopes:[...authorisedScopes],modelVersion,notes};
  return {...payload,envelopeSha256:envelopeHash(payload)};
}

export function validateEnvelope(envelope) {
  const errors=[];
  if (!envelope || typeof envelope!=='object') return {valid:false,errors:['Envelope must be an object']};
  if (envelope.protocolVersion!==LOAD_PROTOCOL_VERSION) errors.push('Unsupported protocol version');
  if (!['LOAD_DISPATCH','LOAD_CONTRIBUTION','PARTICIPANT_HEALTH'].includes(envelope.type)) errors.push('Unknown envelope type');
  if (envelope.dataClass==='SECRET_CREDENTIAL') errors.push('Secret credentials are forbidden in protocol envelopes');
  const supplied=envelope.envelopeSha256;
  const copy={...envelope}; delete copy.envelopeSha256;
  if (!supplied || supplied!==envelopeHash(copy)) errors.push('Envelope hash mismatch');
  return {valid:errors.length===0,errors};
}

export const ASCN_PARTICIPANT_PROFILE = Object.freeze({
  participantId:'ASCN-001',
  provider:'ASCN.AI',
  workspaceUrl:'https://ascn.ai/agents/ws-SN7By9jNTdx5xpTVxWBScR',
  expectedProtocol:LOAD_PROTOCOL_VERSION,
  defaultRoles:['Researcher','Tester','Automation Contributor'],
  connectionState:'NOT_AUTHORISED',
  credentialPolicy:'Store MCP/API credentials only in the platform secret store. Never place them in a load envelope, repository, Notion registry row, prompt, or evidence receipt.'
});

import assert from 'node:assert/strict';
import {createDispatchEnvelope,createContributionEnvelope,createHealthEnvelope,validateEnvelope,ASCN_PARTICIPANT_PROFILE} from '../runtime/multi-ai-load-protocol.mjs';

const dispatch=createDispatchEnvelope({loadId:'LOAD-42',objective:'Test',riskClass:'HIGH',participantId:'ASCN-001',role:'Tester',dataClass:'INTERNAL',authorisedScopes:['repo:read'],contextRefs:['ctx-1'],tasks:['validate'],requiredEvidence:['test-log'],humanGates:['deploy']});
assert.equal(validateEnvelope(dispatch).valid,true);
assert.equal(dispatch.type,'LOAD_DISPATCH');

const contribution=createContributionEnvelope({loadId:'LOAD-42',participantId:'ASCN-001',role:'Tester',type:'Test Evidence',summary:'validated',evidenceRefs:['ev-1'],confidence:.8,reproducibility:.9,evidenceQuality:.95,sourceFingerprint:'source-1'});
assert.equal(validateEnvelope(contribution).valid,true);
assert.equal(contribution.independent,true);

const derived=createContributionEnvelope({loadId:'LOAD-42',participantId:'AI-2',role:'Researcher',type:'Analysis',summary:'derived',derivedFromParticipantIds:['ASCN-001']});
assert.equal(derived.independent,false);

const health=createHealthEnvelope({participantId:'ASCN-001',connectionState:'NOT_AUTHORISED',capabilities:['research']});
assert.equal(validateEnvelope(health).valid,true);

assert.throws(()=>createDispatchEnvelope({loadId:'x',objective:'x',participantId:'x',role:'x',dataClass:'SECRET_CREDENTIAL'}),/Secret credentials/);
const tampered={...contribution,summary:'tampered'};
assert.equal(validateEnvelope(tampered).valid,false);
assert.equal(ASCN_PARTICIPANT_PROFILE.participantId,'ASCN-001');

console.log('Multi-AI Load Protocol validation PASSED');

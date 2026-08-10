import assert from 'node:assert/strict';
import {
  createLoadContract, addContribution, addCrossCheck, addConflict,
  setFinalResult, setHumanApproval, evaluateLoadConformity,
  buildLoadReceipt, quarantineParticipant, scoreContribution
} from '../runtime/multi-ai-load-law.mjs';

const participants = [
  {id:'chatgpt',roles:['Builder','Synthesiser']},
  {id:'ascn',roles:['Researcher','Tester']},
  {id:'reviewer',roles:['Adversarial Reviewer','Governance Reviewer','Evidence Verifier']}
];

let load=createLoadContract({loadId:'LOAD-TEST-001',objective:'Validate multi-AI governance',riskClass:'HIGH',consequential:true,participants});
for (const [id,type] of [['chatgpt','Code/Build'],['ascn','Test Evidence'],['reviewer','Critique']]) {
  load=addContribution(load,{participantId:id,type,summary:id,evidenceRefs:[`ev-${id}`],confidence:.8,reproducibility:.9,evidenceQuality:.9,sourceFingerprint:`source-${id}`});
}
for (const c of load.contributions) {
  load=addCrossCheck(load,{reviewerId:c.participantId==='reviewer'?'ascn':'reviewer',targetContributionId:c.id,result:'validated',evidenceRefs:['cross']});
}
load=setFinalResult(load,{result:'Validated master result',nextLoadImprovement:'Increase adverse test depth',evidenceRefs:['master']});
let result=evaluateLoadConformity(load);
assert.equal(result.status,'NON_CONFORMING','high-risk load must stop before human approval');
assert.ok(result.violations.includes('Named-human approval required'));
load=setHumanApproval(load,{decision:'APPROVED',approver:'named-human-owner'});
result=evaluateLoadConformity(load);
assert.equal(result.status,'APPROVED');
assert.equal(result.participantsContributed,3);
assert.equal(result.independentEvidenceLineages,3);
const receipt=buildLoadReceipt(load);
assert.match(receipt.receiptSha256,/^[a-f0-9]{64}$/);

let excluded=createLoadContract({loadId:'LOAD-TEST-002',objective:'Exclusion test',riskClass:'LOW',participants:[{id:'a',roles:['Synthesiser']},{id:'b',roles:[]}]});
excluded=addContribution(excluded,{participantId:'a',type:'Analysis',evidenceRefs:['x'],sourceFingerprint:'a'});
excluded=setFinalResult(excluded,{result:'partial'});
assert.equal(evaluateLoadConformity(excluded).status,'NON_CONFORMING');
assert.deepEqual(evaluateLoadConformity(excluded).materiallyExcluded,['b']);

let unreachable=createLoadContract({loadId:'LOAD-TEST-003',objective:'Reachability test',riskClass:'LOW',participants:[{id:'a',roles:['Synthesiser']},{id:'b',connectionState:'UNREACHABLE',exclusionReason:'provider outage',roles:[]}]});
unreachable=addContribution(unreachable,{participantId:'a',type:'Analysis',evidenceRefs:['x'],sourceFingerprint:'a'});
unreachable=setFinalResult(unreachable,{result:'continue with recorded outage'});
assert.equal(evaluateLoadConformity(unreachable).status,'CONFORMING');

let echo=createLoadContract({loadId:'LOAD-TEST-004',objective:'Echo test',riskClass:'MEDIUM',participants:[{id:'a',roles:['Synthesiser']},{id:'b',roles:['Tester']},{id:'c',roles:['Adversarial Reviewer']}]});
echo=addContribution(echo,{participantId:'a',type:'Analysis',evidenceRefs:['e'],sourceFingerprint:'shared'});
echo=addContribution(echo,{participantId:'b',type:'Test Evidence',evidenceRefs:['e'],sourceFingerprint:'shared'});
echo=addContribution(echo,{participantId:'c',type:'Critique',evidenceRefs:['e'],sourceFingerprint:'shared'});
echo=setFinalResult(echo,{result:'echo'});
const echoResult=evaluateLoadConformity(echo);
assert.equal(echoResult.independentEvidenceLineages,1);
assert.ok(echoResult.violations.some(v=>v.startsWith('Independent evidence lineages')));

let critical=createLoadContract({loadId:'LOAD-TEST-005',objective:'Critical conflict test',riskClass:'CRITICAL',participants:[{id:'a',roles:['Tester','Adversarial Reviewer','Security Reviewer','Governance Reviewer','Evidence Verifier','Synthesiser']}]});
critical=addContribution(critical,{participantId:'a',type:'Critique',evidenceRefs:['e'],sourceFingerprint:'a'});
critical=addConflict(critical,{topic:'security',severity:'CRITICAL',positions:['safe','unsafe']});
critical=setFinalResult(critical,{result:'cannot proceed'});
assert.equal(evaluateLoadConformity(critical).status,'BLOCKED');

let quarantine=createLoadContract({loadId:'LOAD-TEST-006',objective:'Quarantine test',riskClass:'LOW',participants:[{id:'a',roles:['Synthesiser']},{id:'bad',roles:[]}]});
quarantine=quarantineParticipant(quarantine,'bad','fabricated evidence');
quarantine=addContribution(quarantine,{participantId:'a',type:'Evidence',evidenceRefs:['real'],sourceFingerprint:'real',evidenceQuality:1,reproducibility:1,confidence:1});
quarantine=setFinalResult(quarantine,{result:'safe degraded operation'});
assert.equal(evaluateLoadConformity(quarantine).status,'CONFORMING');

assert.ok(scoreContribution({independent:true,evidenceRefs:['x'],evidenceQuality:1,reproducibility:1,confidence:1,safetyRisk:0}) > scoreContribution({independent:false,evidenceRefs:[],evidenceQuality:.3,reproducibility:.3,confidence:1,safetyRisk:.5}));

console.log('Multi-AI Load Constitution validation PASSED');

class ExecutionReviewer {
  constructor({ minimumScore = 0.8 } = {}) {
    this.minimumScore = minimumScore;
  }

  review({ objective, output, toolResults = [], policyDecisions = [], evidence = [] }) {
    const findings = [];
    let score = 1;

    if (!objective) { findings.push('missing_objective'); score -= 0.2; }
    if (!output) { findings.push('missing_output'); score -= 0.4; }
    if (policyDecisions.some(x => x === 'deny')) { findings.push('policy_denial_present'); score -= 0.5; }
    if (toolResults.some(x => x?.status === 'failed')) { findings.push('tool_failure_present'); score -= 0.25; }
    if (!evidence.length) { findings.push('missing_evidence'); score -= 0.15; }

    score = Math.max(0, Math.min(1, score));
    return {
      passed: score >= this.minimumScore,
      score,
      minimumScore: this.minimumScore,
      findings,
      recommendation: score >= this.minimumScore ? 'accept' : 'revise_or_escalate'
    };
  }
}

module.exports = { ExecutionReviewer };

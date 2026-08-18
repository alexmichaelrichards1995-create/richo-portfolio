const crypto = require('crypto');

class AIExecutionEngineV2 {
  constructor({ aiAdapter, toolRegistry, budgetGuard, reviewer, eventFabric, maxToolRounds = 6, clock = () => new Date() } = {}) {
    if (!aiAdapter) throw new Error('AIExecutionEngineV2 requires aiAdapter');
    if (!toolRegistry) throw new Error('AIExecutionEngineV2 requires toolRegistry');
    if (!budgetGuard) throw new Error('AIExecutionEngineV2 requires budgetGuard');
    if (!reviewer) throw new Error('AIExecutionEngineV2 requires reviewer');
    Object.assign(this, { aiAdapter, toolRegistry, budgetGuard, reviewer, eventFabric, maxToolRounds, clock });
  }

  async execute({ job, section, objective, context = {}, estimatedCostCents = 1 }) {
    const executionId = crypto.randomUUID();
    const startedAt = this.clock().toISOString();
    const actor = { type: 'ai_agent', id: job.agentId, section: section.id };
    const budget = await this.budgetGuard.check({ agentId: job.agentId, estimatedCostCents });

    await this.#emit('ai.execution.requested', { executionId, jobId: job.id, sectionId: section.id, agentId: job.agentId, objective, budget });
    if (!budget.allowed) return this.#blockedBudget({ executionId, job, budget, startedAt });

    const allowedTools = this.toolRegistry.listForModel({
      actor,
      environment: context.environment || 'development',
      allowedCapabilities: section.capabilities || []
    });

    let input = objective;
    let previousResponseId;
    let response = null;
    const toolResults = [];
    const policyDecisions = [];
    const evidence = [];

    for (let round = 0; round < this.maxToolRounds; round += 1) {
      response = await this.aiAdapter.execute({
        agent: { id: job.agentId, name: section.name },
        input,
        tools: allowedTools,
        previousResponseId,
        metadata: { executionId, jobId: job.id, sectionId: section.id, agentId: job.agentId, correlationId: job.correlationId || '' }
      });
      previousResponseId = response.responseId;
      const calls = normalizeToolCalls(response);
      if (!calls.length) break;

      const toolOutputs = [];
      for (const call of calls) {
        const result = await this.toolRegistry.invoke(call.name, call.arguments || {}, {
          actor,
          environment: context.environment || 'development',
          risk: context.risk,
          dataClassification: context.dataClassification,
          jobId: job.id,
          executionId
        });
        const policyDecision = result?.policy?.decision || (result?.status === 'require_approval' ? 'require_approval' : 'allow');
        toolResults.push({ callId: call.id, name: call.name, status: result?.status || 'completed', result });
        policyDecisions.push(policyDecision);
        evidence.push({ type: 'tool_result', callId: call.id, name: call.name, result });
        toolOutputs.push({ type: 'function_call_output', call_id: call.id, output: JSON.stringify(result ?? null) });

        if (result?.status === 'require_approval') {
          const waiting = { status: 'awaiting_approval', executionId, toolResults, evidence, startedAt, completedAt: this.clock().toISOString() };
          await this.#emit('ai.execution.awaiting_approval', { ...waiting, jobId: job.id, agentId: job.agentId });
          return waiting;
        }
        if (result?.status === 'deny') {
          const denied = { status: 'denied', executionId, toolResults, evidence, startedAt, completedAt: this.clock().toISOString() };
          await this.#emit('ai.execution.denied', { ...denied, jobId: job.id, agentId: job.agentId });
          return denied;
        }
      }
      input = toolOutputs;
    }

    const output = response?.outputText || response?.output || null;
    evidence.push({ type: 'model_output', output });
    const review = this.reviewer.review({ objective, output, toolResults, policyDecisions, evidence });
    const usage = normalizeUsage(response);

    await this.budgetGuard.record({
      agentId: job.agentId,
      jobId: job.id,
      provider: response?.provider || 'openai',
      model: response?.model,
      estimatedCostCents,
      actualCostCents: response?.actualCostCents || 0,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });

    const result = {
      status: review.passed ? 'completed' : 'needs_review',
      executionId, output, review, toolResults, policyDecisions, evidence, usage,
      startedAt, completedAt: this.clock().toISOString()
    };
    await this.#emit(review.passed ? 'ai.execution.completed' : 'ai.execution.needs_review', { ...result, jobId: job.id, agentId: job.agentId, sectionId: section.id });
    return result;
  }

  async #blockedBudget({ executionId, job, budget, startedAt }) {
    const blocked = { status: 'blocked_budget', executionId, budget, startedAt };
    await this.#emit('ai.execution.blocked_budget', { ...blocked, jobId: job.id, agentId: job.agentId });
    return blocked;
  }

  async #emit(type, payload) {
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.ai-execution-v2', payload });
  }
}

function normalizeToolCalls(response) {
  if (!Array.isArray(response?.output)) return [];
  return response.output
    .filter(item => item?.type === 'function_call')
    .map(item => ({ id: item.call_id || item.id, name: item.name, arguments: parseArguments(item.arguments) }));
}

function parseArguments(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { raw: value }; }
}

function normalizeUsage(response) {
  const usage = response?.usage || {};
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0
  };
}

module.exports = { AIExecutionEngineV2, normalizeToolCalls };

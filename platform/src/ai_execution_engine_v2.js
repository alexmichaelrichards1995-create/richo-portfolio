const crypto = require('crypto');

class AIExecutionEngineV2 {
  constructor({ aiAdapter, toolRegistry, budgetGuard, reviewer, eventFabric, maxToolRounds = 6, clock = () => new Date() } = {}) {
    if (!aiAdapter) throw new Error('AIExecutionEngineV2 requires aiAdapter');
    if (!toolRegistry) throw new Error('AIExecutionEngineV2 requires toolRegistry');
    if (!budgetGuard) throw new Error('AIExecutionEngineV2 requires budgetGuard');
    if (!reviewer) throw new Error('AIExecutionEngineV2 requires reviewer');
    this.aiAdapter = aiAdapter;
    this.toolRegistry = toolRegistry;
    this.budgetGuard = budgetGuard;
    this.reviewer = reviewer;
    this.eventFabric = eventFabric;
    this.maxToolRounds = maxToolRounds;
    this.clock = clock;
  }

  async execute({ job, section, objective, context = {}, model, estimatedCostCents = 1 }) {
    const executionId = crypto.randomUUID();
    const startedAt = this.clock().toISOString();
    const budget = await this.budgetGuard.check({ agentId: job.agentId, estimatedCostCents });

    await this.#emit('ai.execution.requested', { executionId, jobId: job.id, sectionId: section.id, agentId: job.agentId, objective, budget });

    if (!budget.allowed) {
      const blocked = { status: 'blocked_budget', executionId, budget, startedAt };
      await this.#emit('ai.execution.blocked_budget', { ...blocked, jobId: job.id, agentId: job.agentId });
      return blocked;
    }

    const allowedTools = await this.toolRegistry.listForActor?.({
      actor: { type: 'ai_agent', id: job.agentId, section: section.id },
      sectionId: section.id,
      capabilities: section.capabilities || [],
      context
    }) || [];

    const conversation = [{ role: 'user', content: objective }];
    const toolResults = [];
    const policyDecisions = [];
    const evidence = [];
    let response = null;

    for (let round = 0; round < this.maxToolRounds; round += 1) {
      response = await this.aiAdapter.generate({
        model,
        input: conversation,
        tools: allowedTools,
        metadata: {
          executionId,
          jobId: job.id,
          sectionId: section.id,
          agentId: job.agentId,
          correlationId: job.correlationId
        }
      });

      const calls = normalizeToolCalls(response);
      if (!calls.length) break;

      for (const call of calls) {
        const result = await this.toolRegistry.invoke({
          name: call.name,
          input: call.arguments || {},
          actor: { type: 'ai_agent', id: job.agentId, section: section.id },
          sectionId: section.id,
          context: { ...context, jobId: job.id, executionId }
        });
        toolResults.push({ callId: call.id, name: call.name, status: result?.status || 'completed', result });
        policyDecisions.push(result?.policyDecision || result?.decision || 'allow');
        evidence.push({ type: 'tool_result', callId: call.id, name: call.name, result });
        conversation.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result ?? null) });

        if (result?.status === 'awaiting_approval' || result?.decision === 'require_approval') {
          const waiting = { status: 'awaiting_approval', executionId, toolResults, evidence, startedAt, completedAt: this.clock().toISOString() };
          await this.#emit('ai.execution.awaiting_approval', { ...waiting, jobId: job.id, agentId: job.agentId });
          return waiting;
        }
      }
    }

    const output = extractOutput(response);
    evidence.push({ type: 'model_output', output });
    const review = this.reviewer.review({ objective, output, toolResults, policyDecisions, evidence });
    const usage = normalizeUsage(response);

    await this.budgetGuard.record({
      agentId: job.agentId,
      jobId: job.id,
      provider: response?.provider || 'openai',
      model: response?.model || model,
      estimatedCostCents,
      actualCostCents: response?.actualCostCents || 0,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });

    const result = {
      status: review.passed ? 'completed' : 'needs_review',
      executionId,
      output,
      review,
      toolResults,
      policyDecisions,
      evidence,
      usage,
      startedAt,
      completedAt: this.clock().toISOString()
    };

    await this.#emit(review.passed ? 'ai.execution.completed' : 'ai.execution.needs_review', { ...result, jobId: job.id, agentId: job.agentId, sectionId: section.id });
    return result;
  }

  async #emit(type, payload) {
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.ai-execution-v2', payload });
  }
}

function normalizeToolCalls(response) {
  if (Array.isArray(response?.toolCalls)) return response.toolCalls;
  if (!Array.isArray(response?.output)) return [];
  return response.output
    .filter(item => item?.type === 'function_call' || item?.type === 'tool_call')
    .map(item => ({ id: item.call_id || item.id, name: item.name, arguments: parseArguments(item.arguments) }));
}

function parseArguments(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { raw: value }; }
}

function extractOutput(response) {
  if (typeof response?.outputText === 'string') return response.outputText;
  if (typeof response?.output_text === 'string') return response.output_text;
  if (typeof response?.text === 'string') return response.text;
  return response?.output || null;
}

function normalizeUsage(response) {
  const usage = response?.usage || {};
  return {
    inputTokens: usage.input_tokens ?? usage.inputTokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.outputTokens ?? 0,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? 0
  };
}

module.exports = { AIExecutionEngineV2, normalizeToolCalls, extractOutput };

class ToolRegistry {
  constructor({ policyEngine } = {}) {
    this.policyEngine = policyEngine;
    this.tools = new Map();
  }

  register({ name, description, schema = {}, capability, risk = 'low', handler, requiresApproval = false }) {
    if (!name || typeof handler !== 'function') throw new Error('Tool requires name and handler');
    if (this.tools.has(name)) throw new Error(`Tool already registered: ${name}`);
    this.tools.set(name, { name, description, schema, capability: capability || name, risk, handler, requiresApproval });
    return this;
  }

  listForModel({ actor = {}, environment = 'development', allowedCapabilities = [] } = {}) {
    return [...this.tools.values()]
      .filter(tool => !allowedCapabilities.length || allowedCapabilities.includes(tool.capability))
      .map(tool => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
        strict: true
      }));
  }

  async invoke(name, args, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    const policy = this.policyEngine?.evaluate
      ? await this.policyEngine.evaluate({
          actor: context.actor || {},
          capability: tool.capability,
          operation: `tool:${tool.name}`,
          environment: context.environment || 'development',
          risk: context.risk || tool.risk,
          dataClassification: context.dataClassification || 'internal'
        })
      : { decision: tool.requiresApproval ? 'require_approval' : 'allow' };

    if (tool.requiresApproval && policy.decision === 'allow') policy.decision = 'require_approval';
    if (policy.decision !== 'allow') {
      return { status: policy.decision, tool: name, policy };
    }

    const startedAt = new Date().toISOString();
    const result = await tool.handler(args, context);
    return {
      status: 'completed',
      tool: name,
      startedAt,
      completedAt: new Date().toISOString(),
      result
    };
  }
}

module.exports = { ToolRegistry };

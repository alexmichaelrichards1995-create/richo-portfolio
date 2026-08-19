class OpenAIResponsesAdapter {
  constructor({ client, model = process.env.RICHO_OPENAI_MODEL || 'gpt-5.6', store = false, maxOutputTokens } = {}) {
    if (!client?.responses?.create) throw new Error('OpenAIResponsesAdapter requires an OpenAI client with responses.create');
    this.client = client;
    this.model = model;
    this.store = store;
    this.maxOutputTokens = maxOutputTokens;
  }

  async execute({ agent, instructions, input, tools = [], metadata = {}, previousResponseId, reasoning }) {
    const request = {
      model: this.model,
      instructions: instructions || buildDefaultInstructions(agent),
      input,
      tools,
      store: this.store,
      metadata: sanitizeMetadata(metadata)
    };
    if (previousResponseId) request.previous_response_id = previousResponseId;
    if (this.maxOutputTokens) request.max_output_tokens = this.maxOutputTokens;
    if (reasoning) request.reasoning = reasoning;

    const response = await this.client.responses.create(request);
    return {
      provider: 'openai',
      model: response.model || this.model,
      responseId: response.id,
      status: response.status,
      outputText: response.output_text || '',
      output: response.output || [],
      usage: response.usage || null,
      raw: response
    };
  }
}

function buildDefaultInstructions(agent = {}) {
  return [
    `You are ${agent.name || agent.id || 'a R.I.C.H.O. Systems specialist agent'}.`,
    'Operate only within the capabilities supplied by the R.I.C.H.O. control plane.',
    'Never claim an external action succeeded unless a tool receipt proves it.',
    'Prefer evidence, explicit assumptions, deterministic outputs, and reversible actions.',
    'If an action requires approval, return an approval proposal instead of bypassing the gate.'
  ].join(' ');
}

function sanitizeMetadata(metadata) {
  const entries = Object.entries(metadata || {}).slice(0, 16);
  return Object.fromEntries(entries.map(([key, value]) => [String(key).slice(0, 64), String(value).slice(0, 512)]));
}

module.exports = { OpenAIResponsesAdapter };

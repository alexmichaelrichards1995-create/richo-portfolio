class KnowledgeGraph {
  constructor({ store } = {}) {
    if (!store) throw new Error('KnowledgeGraph requires store');
    this.store = store;
  }

  async upsertNode({ type, externalKey, label, attributes = {} }) {
    if (!type || !label) throw new Error('Knowledge node requires type and label');
    return this.store.upsertKnowledgeNode({ nodeType: type, externalKey, label, attributes });
  }

  async connect({ from, relation, to, confidence = 1, evidence = [] }) {
    if (!from || !relation || !to) throw new Error('Knowledge edge requires from, relation and to');
    return this.store.upsertKnowledgeEdge({ fromNodeId: from, relation, toNodeId: to, confidence, evidence });
  }

  async traceImpact({ nodeId, maxDepth = 4, relations = [] }) {
    if (!nodeId) throw new Error('traceImpact requires nodeId');
    const visited = new Set([nodeId]);
    const frontier = [{ id: nodeId, depth: 0, path: [] }];
    const impacts = [];
    while (frontier.length) {
      const current = frontier.shift();
      if (current.depth >= maxDepth) continue;
      const edges = await this.store.listKnowledgeEdges({ fromNodeId: current.id, relations });
      for (const edge of edges) {
        const path = [...current.path, { relation: edge.relation, from: edge.fromNodeId, to: edge.toNodeId, confidence: edge.confidence }];
        impacts.push({ nodeId: edge.toNodeId, depth: current.depth + 1, path });
        if (!visited.has(edge.toNodeId)) {
          visited.add(edge.toNodeId);
          frontier.push({ id: edge.toNodeId, depth: current.depth + 1, path });
        }
      }
    }
    return { rootNodeId: nodeId, maxDepth, impacts };
  }

  async explainRelationship({ fromNodeId, toNodeId, maxDepth = 5 }) {
    const trace = await this.traceImpact({ nodeId: fromNodeId, maxDepth });
    const candidates = trace.impacts.filter(item => item.nodeId === toNodeId).sort((a, b) => a.depth - b.depth);
    return candidates[0] || null;
  }
}

module.exports = { KnowledgeGraph };

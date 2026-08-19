const crypto = require('crypto');

class MemoryStore {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error('MemoryStore requires pg Pool');
    this.pool = pool;
    this.clock = clock;
  }

  async remember({ sectionId, agentId, memoryType, subjectType, subjectId, title, content = {}, importance = 0.5, confidence = 1, sourceType, sourceId, correlationId, validUntil }) {
    const id = crypto.randomUUID();
    const { rows } = await this.pool.query(`
      INSERT INTO richo_memory_items (
        id, section_id, agent_id, memory_type, subject_type, subject_id, title,
        content, importance, confidence, source_type, source_id, correlation_id,
        valid_from, valid_until
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`, [
        id, sectionId || null, agentId || null, memoryType, subjectType || null,
        subjectId || null, title || null, JSON.stringify(content || {}), importance,
        confidence, sourceType || null, sourceId || null, correlationId || null,
        this.clock(), validUntil || null
      ]);
    return mapMemory(rows[0]);
  }

  async recall({ sectionId, agentId, subjectType, subjectId, memoryTypes = [], limit = 20 } = {}) {
    const values = [];
    const where = ['superseded_by IS NULL', '(valid_until IS NULL OR valid_until > NOW())'];
    const add = (sql, value) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
    if (sectionId) add('section_id = ?', sectionId);
    if (agentId) add('(agent_id = ? OR agent_id IS NULL)', agentId);
    if (subjectType) add('subject_type = ?', subjectType);
    if (subjectId) add('subject_id = ?', subjectId);
    if (memoryTypes.length) { values.push(memoryTypes); where.push(`memory_type = ANY($${values.length})`); }
    values.push(limit);
    const { rows } = await this.pool.query(`
      SELECT * FROM richo_memory_items
      WHERE ${where.join(' AND ')}
      ORDER BY importance DESC, confidence DESC, created_at DESC
      LIMIT $${values.length}`, values);
    return rows.map(mapMemory);
  }

  async supersede({ oldMemoryId, replacement }) {
    const next = await this.remember(replacement);
    await this.pool.query('UPDATE richo_memory_items SET superseded_by=$2, updated_at=$3 WHERE id=$1', [oldMemoryId, next.id, this.clock()]);
    return next;
  }

  async link({ fromMemoryId, relation, toMemoryId, weight = 1, metadata = {} }) {
    const id = crypto.randomUUID();
    await this.pool.query(`
      INSERT INTO richo_memory_links (id, from_memory_id, relation, to_memory_id, weight, metadata)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT (from_memory_id, relation, to_memory_id)
      DO UPDATE SET weight=EXCLUDED.weight, metadata=EXCLUDED.metadata`,
      [id, fromMemoryId, relation, toMemoryId, weight, JSON.stringify(metadata)]);
    return { id, fromMemoryId, relation, toMemoryId, weight, metadata };
  }

  async buildContext({ sectionId, agentId, subjectType, subjectId, limit = 12 } = {}) {
    const memories = await this.recall({ sectionId, agentId, subjectType, subjectId, limit });
    return memories.map(m => ({
      id: m.id,
      type: m.memoryType,
      title: m.title,
      content: m.content,
      importance: m.importance,
      confidence: m.confidence,
      source: { type: m.sourceType, id: m.sourceId }
    }));
  }
}

function mapMemory(r) {
  return {
    id: r.id,
    sectionId: r.section_id,
    agentId: r.agent_id,
    memoryType: r.memory_type,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    title: r.title,
    content: r.content || {},
    importance: Number(r.importance),
    confidence: Number(r.confidence),
    sourceType: r.source_type,
    sourceId: r.source_id,
    correlationId: r.correlation_id,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    supersededBy: r.superseded_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

module.exports = { MemoryStore };

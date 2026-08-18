const crypto = require('crypto');

class SecurityControlPlane {
  constructor({ store, clock = () => new Date() } = {}) {
    if (!store) throw new Error('SecurityControlPlane requires store');
    this.store = store;
    this.clock = clock;
  }

  async authorize({ identityId, capability, environment = 'development', resource = {}, correlationId, sessionId }) {
    const roles = await this.store.listIdentityRoles({ identityId, environment, at: this.clock() });
    const capabilities = new Set();
    for (const role of roles) for (const cap of role.capabilities || []) capabilities.add(cap);
    const allowed = capabilities.has('*') || capabilities.has(capability);
    const breakGlass = !allowed ? await this.store.getActiveBreakGlass({ identityId, at: this.clock(), capability, environment }) : null;
    const decision = allowed || breakGlass ? 'allow' : 'deny';
    await this.store.recordPrivilegedAudit({
      identityId, sessionId, action: capability, resourceType: resource.type, resourceId: resource.id,
      environment, decision, correlationId, details: { roles: roles.map(r => r.roleKey), breakGlassId: breakGlass?.id || null }
    });
    return { decision, capabilities: [...capabilities], breakGlass };
  }

  async createSession({ identityId, ttlMinutes = 60, assuranceLevel = 'standard', ip, userAgent }) {
    const token = crypto.randomBytes(32).toString('base64url');
    const sessionHash = sha256(token);
    const now = this.clock();
    const session = await this.store.createSession({
      identityId, sessionHash, assuranceLevel,
      ipHash: ip ? sha256(ip) : null,
      userAgentHash: userAgent ? sha256(userAgent) : null,
      expiresAt: new Date(now.getTime() + ttlMinutes * 60000)
    });
    return { session, token };
  }

  async validateSession(token) {
    if (!token) return null;
    const session = await this.store.getSessionByHash({ sessionHash: sha256(token) });
    if (!session || session.revokedAt || new Date(session.expiresAt) <= this.clock()) return null;
    await this.store.touchSession({ sessionId: session.id, at: this.clock() });
    return session;
  }

  async createBreakGlass({ identityId, reason, scope = {}, ttlMinutes = 15, approvedBy }) {
    if (!reason || reason.trim().length < 8) throw new Error('Break-glass reason is required');
    const now = this.clock();
    const event = await this.store.createBreakGlass({ identityId, reason, scope, approvedBy, startsAt: now, expiresAt: new Date(now.getTime() + ttlMinutes * 60000) });
    await this.store.recordPrivilegedAudit({ identityId, action: 'security.break_glass.create', resourceType: 'break_glass', resourceId: event.id, environment: scope.environment || 'all', decision: 'allow', details: { reason, scope, approvedBy } });
    return event;
  }
}

class SecretHealthService {
  constructor({ store, clock = () => new Date() } = {}) { if (!store) throw new Error('SecretHealthService requires store'); this.store = store; this.clock = clock; }
  async assess() {
    const refs = await this.store.listSecretReferences();
    return refs.map(ref => {
      const next = ref.nextRotationAt ? new Date(ref.nextRotationAt) : null;
      const overdue = Boolean(next && next <= this.clock());
      return { ...ref, overdue, effectiveStatus: ref.status !== 'healthy' ? ref.status : overdue ? 'rotation_overdue' : 'healthy' };
    });
  }
}

function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

module.exports = { SecurityControlPlane, SecretHealthService, sha256 };

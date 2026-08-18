const assert = require('assert');
const { SecurityControlPlane, SecretHealthService } = require('../src/security_control_plane');

(async () => {
  const audits = [];
  const sessions = new Map();
  const store = {
    async listIdentityRoles() { return [{ roleKey: 'owner', capabilities: ['*'] }]; },
    async getActiveBreakGlass() { return null; },
    async recordPrivilegedAudit(x) { audits.push(x); return x; },
    async createSession(x) { const s = { id: 's1', ...x }; sessions.set(x.sessionHash, s); return s; },
    async getSessionByHash({ sessionHash }) { return sessions.get(sessionHash) || null; },
    async touchSession() {},
    async createBreakGlass(x) { return { id: 'bg1', ...x }; },
    async listSecretReferences() { return [{ secretKey: 'SHOPIFY_TOKEN', status: 'healthy', nextRotationAt: new Date(Date.now() - 1000).toISOString() }]; }
  };

  const plane = new SecurityControlPlane({ store });
  const auth = await plane.authorize({ identityId: 'owner1', capability: 'deploy:production', environment: 'production' });
  assert.equal(auth.decision, 'allow');
  assert.equal(audits.length, 1);

  const created = await plane.createSession({ identityId: 'owner1', ttlMinutes: 5, ip: '127.0.0.1', userAgent: 'test' });
  assert.ok(created.token);
  const valid = await plane.validateSession(created.token);
  assert.equal(valid.identityId, 'owner1');

  const bg = await plane.createBreakGlass({ identityId: 'owner1', reason: 'Emergency production recovery', scope: { environment: 'production' }, approvedBy: 'owner1' });
  assert.equal(bg.id, 'bg1');

  const health = await new SecretHealthService({ store }).assess();
  assert.equal(health[0].effectiveStatus, 'rotation_overdue');

  console.log('security_control_plane.test.js passed');
})().catch(error => { console.error(error); process.exit(1); });

import crypto from 'node:crypto';

const VERSION = 'v1';

type DownloadClaims = {
  shop: string;
  customerId: string;
  entitlementId: string;
  resourceKey: string;
  exp: number;
};

function secret() {
  const value = process.env.RICHO_DOWNLOAD_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error('RICHO_DOWNLOAD_TOKEN_SECRET must be at least 32 characters');
  return value;
}

function b64url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

export function issueDownloadToken(claims: Omit<DownloadClaims, 'exp'>, ttlSeconds = 900) {
  if (ttlSeconds < 60 || ttlSeconds > 3600) throw new Error('download token TTL must be 60-3600 seconds');
  const payload: DownloadClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret()).update(`${VERSION}.${encoded}`).digest('base64url');
  return `${VERSION}.${encoded}.${signature}`;
}

export function verifyDownloadToken(token: string): DownloadClaims {
  const [version, encoded, supplied] = token.split('.');
  if (version !== VERSION || !encoded || !supplied) throw new Error('invalid token');
  const expected = crypto.createHmac('sha256', secret()).update(`${version}.${encoded}`).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('invalid token signature');
  const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as DownloadClaims;
  if (!claims.entitlementId || !claims.customerId || !claims.resourceKey || claims.exp <= Math.floor(Date.now()/1000)) {
    throw new Error('expired or incomplete token');
  }
  return claims;
}

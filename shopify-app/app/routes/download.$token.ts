import type { LoaderFunctionArgs } from 'react-router';
import { verifyDownloadToken } from '../lib/download-tokens.server';

export async function loader({ params }: LoaderFunctionArgs) {
  const token = params.token;
  if (!token) throw new Response('Missing token', { status: 400 });

  const secret = process.env.RICHO_DOWNLOAD_TOKEN_SECRET;
  if (!secret) throw new Response('Download service not configured', { status: 503 });

  const payload = verifyDownloadToken(token, secret);
  if (!payload) throw new Response('Invalid or expired download link', { status: 401 });

  // Final delivery resolver must verify the entitlement remains active and then
  // exchange assetKey for a short-lived object-storage URL. Never expose raw storage keys.
  return Response.json({
    entitlementId: payload.entitlementId,
    customerId: payload.customerId,
    assetKey: payload.assetKey,
    status: 'validated-awaiting-storage-resolver',
  });
}

import type { LoaderFunctionArgs } from 'react-router';
import { json } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customer_id');
  if (!customerId) throw new Response('Missing customer identity', { status: 401 });

  // Replace with authenticated customer-account session resolution before deployment.
  return json({
    customerId,
    status: 'scaffolded',
    message: 'R.I.C.H.O. customer portal endpoint is wired; connect Shopify Customer Account authentication before production.',
  });
}

export default function CustomerPortal() {
  return (
    <main>
      <h1>R.I.C.H.O. Access Centre</h1>
      <p>Your memberships, downloads, pilot access, and entitlement history will appear here after authenticated account resolution is enabled.</p>
    </main>
  );
}

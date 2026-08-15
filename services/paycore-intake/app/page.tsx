export default function Page() {
  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ textTransform: "uppercase", letterSpacing: 2, opacity: 0.7 }}>R.I.C.H.O. Systems</p>
      <h1 style={{ fontSize: 46, marginBottom: 16 }}>PayCore Payment Intake</h1>
      <p style={{ fontSize: 20, lineHeight: 1.6, opacity: 0.85 }}>
        Source-controlled payment intake. Checkout pricing is server-owned, Stripe webhooks are signature-verified, and payment truth is persisted in PayCore before fulfilment or analytics may proceed.
      </p>
      <p style={{ marginTop: 32 }}><a href="/api/health" style={{ color: "inherit" }}>Runtime health →</a></p>
    </main>
  );
}

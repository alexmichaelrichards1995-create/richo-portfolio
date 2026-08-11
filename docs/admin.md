Admin endpoints (staging preview)

Files
- /api/leads-admin - GET: returns leads.json. If ADMIN_SECRET is set, include header x-admin-secret to authenticate.
- /api/ai-logs - GET: returns ai_calls.json and ai_requests.json. If ADMIN_SECRET set, include x-admin-secret header.
- /admin.html - lightweight UI to view leads and AI logs in staging preview.

Security
- Protect admin endpoints in production. Set ADMIN_SECRET in environment and restrict access using a firewall or authentication layer.
- Do NOT expose admin.html publicly without authentication.

Usage
- For preview-only access, append the admin secret to the preview URL as a hash fragment: https://<preview-url>/admin.html#admin=YOUR_SECRET
  The admin UI reads the secret from the fragment and includes the x-admin-secret header.

Notes
- These admin endpoints are staging-only conveniences. Replace with a proper admin UI backed by authentication and a DB in production.

# social-hub

This folder contains a scaffold for a "Universal Social Hub" to index and surface your content across social platforms, blogs, and websites.

Quick start

1. Copy config.example.json -> config.json and add your sources.
2. Create a Postgres database and run the schema (social-hub/schema.sql).
3. Provide environment variables (see below).
4. Install dependencies and run the ingest script locally or deploy it as a serverless function.

Environment variables

- DATABASE_URL - Postgres connection string
- STORAGE_BUCKET - optional for media blobs (R2/S3)
- RSS_POLL_INTERVAL - poll interval in minutes (default: 15)
- SENTRY_DSN - optional
- MEILISEARCH_URL / MEILISEARCH_KEY - optional

Local dev

npm install rss-parser node-fetch pg
node social-hub/functions/ingest.js

Notes

- The ingest script is a simple example focusing on RSS feeds and OpenGraph data. For production use, add OAuth connectors, webhooks, Playwright fallbacks, and robust error handling.
- The functions directory is written so it can be used as a simple Node script or adapted into serverless functions (Vercel / Cloudflare Workers / AWS Lambda).

What's included

- config.example.json - example sources
- schema.sql - DB schema for canonical storage
- functions/ingest.js - example RSS ingest script
- functions/scrape.js - scraping fallback (placeholder)
- functions/oauth-connectors/ - connector templates
- functions/api_feed.js - simple feed API example
- frontend/FeedWidget.tsx - React widget for embedding the feed
- examples/deploy.yml - example workflow to run the ingest script on a schedule
- .github/ISSUE_TEMPLATE/social-hub-task.md - issue template for follow-up work

Next steps

If you'd like, I can open issues and a PR with these files on the `social-hub/massive-load` branch for review and iterate from there.

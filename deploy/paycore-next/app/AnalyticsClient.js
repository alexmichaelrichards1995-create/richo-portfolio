'use client';

import { useEffect } from 'react';

let ephemeralDistinctId = null;

function analyticsConfig() {
  const token = String(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || '').trim();
  const host = String(process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
  return { token, host };
}

function trackingAllowed() {
  if (typeof navigator === 'undefined') return false;
  return navigator.doNotTrack !== '1' && window.doNotTrack !== '1';
}

function distinctId() {
  if (!ephemeralDistinctId) {
    ephemeralDistinctId = crypto.randomUUID
      ? crypto.randomUUID()
      : `anonymous-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return ephemeralDistinctId;
}

function currentUrlWithoutQuery() {
  if (typeof location === 'undefined') return null;
  return `${location.origin}${location.pathname}`;
}

export async function captureRichoEvent(event, properties = {}) {
  if (!trackingAllowed()) return { skipped: 'dnt' };
  const { token, host } = analyticsConfig();
  if (!token) return { skipped: 'not_configured' };

  const body = {
    api_key: token,
    event,
    properties: {
      distinct_id: distinctId(),
      site: 'richo-paycore',
      $current_url: currentUrlWithoutQuery(),
      ...properties,
    },
  };

  try {
    const response = await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      mode: 'cors',
    });
    return response.ok ? { sent: true } : { sent: false, status: response.status };
  } catch (_) {
    return { sent: false };
  }
}

export default function AnalyticsClient() {
  useEffect(() => {
    captureRichoEvent('$pageview', {
      $host: location.host,
      $pathname: location.pathname,
    });
  }, []);

  return null;
}

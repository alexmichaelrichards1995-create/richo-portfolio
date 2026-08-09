import React from 'react';

type Item = {
  id?: number | string;
  title?: string;
  canonical_url?: string;
  excerpt?: string;
  published_at?: string;
};

export default function FeedWidget({ items = [] }: { items?: Item[] }) {
  return (
    <div className="feed-widget">
      <h3>Latest Activity</h3>
      <ul>
        {items.map((it: any) => (
          <li key={it.id || it.canonical_url} style={{ marginBottom: 12 }}>
            <a href={it.canonical_url} target="_blank" rel="noreferrer noopener">
              <strong>{it.title || it.canonical_url}</strong>
            </a>
            <div style={{ fontSize: 12, color: '#666' }}>{it.published_at ? new Date(it.published_at).toLocaleString() : ''}</div>
            <p style={{ marginTop: 6 }}>{it.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

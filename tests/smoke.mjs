import fs from 'node:fs';

const requiredFiles = ['index.html', 'styles.css', 'catalog.js', 'app.js', 'telemetry.js', 'health.json', 'assets/logo.svg'];
const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing required file: ${file}`);
}

if (fs.existsSync('index.html')) {
  const html = fs.readFileSync('index.html', 'utf8');
  const requiredTokens = [
    'R.I.C.H.O. Product Runtime Hub',
    'id="catalog"',
    'id="catalog-product"',
    'id="governance-tool"',
    'id="pilot-tool"',
    'id="diligence-tool"',
    'script src="catalog.js"',
    'script src="app.js"',
    'script src="telemetry.js"',
    'meta name="posthog-key"',
    'https://richosystems.technology/'
  ];
  for (const token of requiredTokens) {
    if (!html.includes(token)) failures.push(`index.html missing token: ${token}`);
  }
  for (const placeholder of ['Your Company', 'yourdomain.example', 'your-form-id', 'contact@yourcompany.example']) {
    if (html.includes(placeholder)) failures.push(`Placeholder remains in index.html: ${placeholder}`);
  }
}

if (fs.existsSync('health.json')) {
  try {
    const health = JSON.parse(fs.readFileSync('health.json', 'utf8'));
    if (health.status !== 'ok') failures.push('health.json status must be ok');
    if (health.service !== 'richo-product-runtime-hub') failures.push('health.json service identifier is incorrect');
  } catch (error) {
    failures.push(`health.json is invalid JSON: ${error.message}`);
  }
}

if (fs.existsSync('vercel.json')) {
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  if (!vercel.includes('"/health"')) failures.push('vercel.json missing /health route');
  if (!vercel.includes('/health.json')) failures.push('vercel.json missing health.json destination');
}

if (fs.existsSync('telemetry.js')) {
  const telemetry = fs.readFileSync('telemetry.js', 'utf8');
  for (const token of ['richo_smoke_test', '$pageview', 'offer_viewed', 'readiness_assessment_started']) {
    if (!telemetry.includes(token)) failures.push(`telemetry.js missing event: ${token}`);
  }
  if (!telemetry.includes('disable_session_recording: true')) failures.push('telemetry.js must keep session recording disabled');
  if (!telemetry.includes('autocapture: false')) failures.push('telemetry.js must keep autocapture disabled');
}

if (fs.existsSync('catalog.js')) {
  const catalog = fs.readFileSync('catalog.js', 'utf8');
  const ids = [...catalog.matchAll(/'RSP-(\d{3})'/g)].map(match => `RSP-${match[1]}`);
  const unique = new Set(ids);
  if (ids.length !== 53) failures.push(`Expected 53 catalogue entries, found ${ids.length}`);
  if (unique.size !== 53) failures.push('Catalogue contains duplicate RSP IDs');
  for (let i = 1; i <= 53; i++) {
    const id = `RSP-${String(i).padStart(3,'0')}`;
    if (!unique.has(id)) failures.push(`Catalogue missing ${id}`);
  }
}

if (fs.existsSync('app.js')) {
  const js = fs.readFileSync('app.js', 'utf8');
  for (const key of ['governance', 'pilot', 'diligence']) {
    if (!js.includes(`${key}:`)) failures.push(`app.js missing flagship engine: ${key}`);
  }
  for (const token of ['scoreProduct','renderCatalog','scoreCatalogProduct','familyChecks']) {
    if (!js.includes(token)) failures.push(`app.js missing runtime function: ${token}`);
  }
  const familyCount = (js.match(/': \[/g) || []).length;
  if (familyCount < 6) failures.push('Expected at least 6 family readiness engines');
}

if (failures.length) {
  console.error('R.I.C.H.O. smoke test FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('R.I.C.H.O. smoke test PASSED');
console.log('Verified runtime files, /health routing, privacy-minimal telemetry, 53 RSP catalogue entries, family gates and 3 flagship engines.');

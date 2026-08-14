import fs from 'node:fs';

const requiredFiles = ['index.html', 'styles.css', 'catalog.js', 'analytics.js', 'app.js', 'assets/logo.svg'];
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
    'script src="analytics.js"',
    'script src="app.js"',
    'anonymous usage events',
    'https://richosystems.technology/'
  ];
  for (const token of requiredTokens) {
    if (!html.includes(token)) failures.push(`index.html missing token: ${token}`);
  }
  for (const placeholder of ['Your Company', 'yourdomain.example', 'your-form-id', 'contact@yourcompany.example']) {
    if (html.includes(placeholder)) failures.push(`Placeholder remains in index.html: ${placeholder}`);
  }
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

if (fs.existsSync('analytics.js')) {
  const analytics = fs.readFileSync('analytics.js', 'utf8');
  for (const token of [
    'richo_cta_clicked',
    'richo_checkout_started',
    "person_profiles: 'identified_only'",
    'autocapture: false',
    'disable_session_recording: true',
    'respect_dnt: true'
  ]) {
    if (!analytics.includes(token)) failures.push(`analytics.js missing telemetry control: ${token}`);
  }

  for (const forbidden of ['checkbox_value', 'evidence_gap_text', 'readiness_score']) {
    if (analytics.includes(forbidden)) failures.push(`analytics.js contains forbidden assessment telemetry token: ${forbidden}`);
  }
}

if (fs.existsSync('app.js')) {
  const js = fs.readFileSync('app.js', 'utf8');
  for (const key of ['governance', 'pilot', 'diligence']) {
    if (!js.includes(`${key}:`)) failures.push(`app.js missing flagship engine: ${key}`);
  }
  for (const token of [
    'scoreProduct',
    'renderCatalog',
    'scoreCatalogProduct',
    'familyChecks',
    'richo_readiness_completed',
    'richo_catalog_product_selected',
    'richo_catalog_readiness_completed'
  ]) {
    if (!js.includes(token)) failures.push(`app.js missing runtime or analytics function: ${token}`);
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
console.log('Verified 6 required files, 53 RSP catalogue entries, family gates, 3 flagship engines and privacy-safe analytics controls.');
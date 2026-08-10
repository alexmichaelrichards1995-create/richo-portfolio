import fs from 'node:fs';

const requiredFiles = ['index.html', 'styles.css', 'app.js', 'assets/logo.svg'];
const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing required file: ${file}`);
}

if (fs.existsSync('index.html')) {
  const html = fs.readFileSync('index.html', 'utf8');
  const requiredTokens = [
    'R.I.C.H.O. Product Runtime Hub',
    'id="governance-tool"',
    'id="pilot-tool"',
    'id="diligence-tool"',
    'script src="app.js"',
    'https://richosystems.technology/'
  ];
  for (const token of requiredTokens) {
    if (!html.includes(token)) failures.push(`index.html missing token: ${token}`);
  }
  for (const placeholder of ['Your Company', 'yourdomain.example', 'your-form-id', 'contact@yourcompany.example']) {
    if (html.includes(placeholder)) failures.push(`Placeholder remains in index.html: ${placeholder}`);
  }
}

if (fs.existsSync('app.js')) {
  const js = fs.readFileSync('app.js', 'utf8');
  for (const key of ['governance', 'pilot', 'diligence']) {
    if (!js.includes(`${key}:`)) failures.push(`app.js missing product engine: ${key}`);
  }
  if (!js.includes('scoreProduct')) failures.push('app.js missing scoreProduct engine');
}

if (failures.length) {
  console.error('R.I.C.H.O. smoke test FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('R.I.C.H.O. smoke test PASSED');
console.log(`Verified ${requiredFiles.length} required files and 3 product engines.`);

import fs from 'node:fs';

const failures = [];

const requiredFiles = [
  '.github/workflows/ci-cd-main.yml',
  '.github/workflows/scheduled-maintenance.yml',
  '.github/workflows/security-audit.yml',
  '.github/workflows/release.yml',
  '.github/actions/runtime-validation/action.yml',
  '.github/dependabot.yml',
  '.pre-commit-config.yaml',
  '.githooks/pre-commit',
  'config/lighthouserc.json',
  'config/analytics.json',
  'config/monitoring.json',
  'data/projects.json',
  'data/project-filters.json',
  'data/skills-matrix.json',
  'data/impact-metrics.json',
  'ARCHITECTURE.md',
  'AUTOMATION.md',
  'PROJECTS.md',
  'DEPLOYMENT.md',
  'CONTRIBUTING.md'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) failures.push(`Missing required automation file: ${file}`);
}

const workflowChecks = [
  ['.github/workflows/ci-cd-main.yml', ['node-version: [16, 18, 20]', 'returntocorp/semgrep-action', 'dependency-check/Dependency-Check_Action', 'docker/build-push-action', 'actions/deploy-pages', 'slackapi/slack-github-action', 'continue-on-error: true']],
  ['.github/workflows/scheduled-maintenance.yml', ['cron:', 'treosh/lighthouse-ci-action', 'SonarSource/sonarqube-scan-action', 'backup-artifacts']],
  ['.github/workflows/security-audit.yml', ['aquasecurity/trivy-action', 'trufflesecurity/trufflehog', 'ShiftLeftSecurity/scan-action', 'returntocorp/semgrep-action']],
  ['.github/workflows/release.yml', ['softprops/action-gh-release', 'CHANGELOG.md', 'richo-portfolio.tar.gz', 'richo-portfolio.zip']]
];

for (const [file, tokens] of workflowChecks) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const token of tokens) {
    if (!content.includes(token)) failures.push(`${file} missing token: ${token}`);
  }
}

for (const file of ['config/lighthouserc.json', 'config/analytics.json', 'config/monitoring.json', 'data/projects.json', 'data/project-filters.json', 'data/skills-matrix.json', 'data/impact-metrics.json']) {
  if (!fs.existsSync(file)) continue;
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${file} is not valid JSON: ${error.message}`);
  }
}

if (fs.existsSync('data/projects.json')) {
  const projects = JSON.parse(fs.readFileSync('data/projects.json', 'utf8'));
  if (!Array.isArray(projects) || projects.length < 3) failures.push('data/projects.json must contain at least 3 project records');
}

if (fs.existsSync('data/impact-metrics.json')) {
  const metrics = JSON.parse(fs.readFileSync('data/impact-metrics.json', 'utf8'));
  if (metrics?.automation?.workflows !== 4) failures.push('data/impact-metrics.json must declare 4 workflows');
}

for (const [file, token] of [
  ['ARCHITECTURE.md', '# Architecture'],
  ['AUTOMATION.md', '# Automation'],
  ['PROJECTS.md', '# Projects'],
  ['DEPLOYMENT.md', '# Deployment'],
  ['CONTRIBUTING.md', '# Contributing'],
  ['.pre-commit-config.yaml', 'richo-automation'],
  ['.githooks/pre-commit', 'node tests/automation.mjs']
]) {
  if (!fs.existsSync(file)) continue;
  if (!fs.readFileSync(file, 'utf8').includes(token)) failures.push(`${file} missing token: ${token}`);
}

if (failures.length) {
  console.error('Automation validation FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Automation validation PASSED');
console.log('Verified workflows, shared automation templates, docs, config, and showcase data files.');

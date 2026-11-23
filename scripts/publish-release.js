const { spawnSync } = require('node:child_process');
const { build, Platform } = require('electron-builder');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const repository = process.env.MAESTRO_GITHUB_REPOSITORY || '';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw Error('Defina MAESTRO_GITHUB_REPOSITORY como owner/repo.');
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) throw Error('Defina GH_TOKEN para publicar no GitHub Releases.');
if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) throw Error('Configure CSC_LINK e CSC_KEY_PASSWORD para assinar o instalador.');
if (!process.env.MAESTRO_PUBLISHER_NAME?.trim()) throw Error('Defina MAESTRO_PUBLISHER_NAME com o nome exato do certificado de assinatura.');
for (const script of ['prepare-build.js', 'generate-icon.js']) {
  const result = spawnSync(process.execPath, [require('node:path').join(__dirname, script)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const [owner, repo] = repository.split('/');
const changelog = fs.readFileSync(path.join(__dirname, '..', 'NOVIDADES.md'), 'utf8');
const notes = changelog.split(new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')}[^\n]*\n`, 'm'))[1]?.split(/^## /m)[0]?.trim();
if (!notes) throw Error('Registre as novidades da versão em NOVIDADES.md.');
build({ targets: Platform.WINDOWS.createTarget(['nsis']), publish: 'always', config: { ...pkg.build, publish: { provider: 'github', owner, repo }, releaseInfo: { releaseNotes: notes }, win: { ...pkg.build.win, publisherName: process.env.MAESTRO_PUBLISHER_NAME.trim(), forceCodeSigning: true, verifyUpdateCodeSignature: true } } }).catch(error => { console.error(error); process.exitCode = 1; });

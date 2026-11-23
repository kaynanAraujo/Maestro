// Guarda instaladores antigos e registra quando esta versão foi construída.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const changes = fs.readFileSync(path.join(root, 'NOVIDADES.md'), 'utf8');
if (!changes.includes(`## ${version} `)) throw Error(`NOVIDADES.md não contém a versão ${version}.`);
const sourceFiles = ['package.json', 'NOVIDADES.md', 'assets/maestro.svg', 'dados/catalogo.json'];
for (const name of fs.readdirSync(path.join(root, 'scripts'))) if (name.endsWith('.js')) sourceFiles.push(`scripts/${name}`);
for (const folder of ['main', 'preload', 'renderer']) {
  for (const name of fs.readdirSync(path.join(root, folder))) if (name.endsWith('.js') || name.endsWith('.html') || name.endsWith('.css')) sourceFiles.push(`${folder}/${name}`);
}
const hash = crypto.createHash('sha256');
for (const name of sourceFiles.sort()) { hash.update(name); hash.update(fs.readFileSync(path.join(root, name))); }
const sourceHash = hash.digest('hex');
const manifestFile = path.join(root, 'release-manifest.json');
if (fs.existsSync(manifestFile)) {
  const prior = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (prior.version === version && prior.sourceHash !== sourceHash) throw Error(`O código mudou desde o build ${version}. Suba a versão no package.json e registre-a em NOVIDADES.md.`);
  if (prior.version !== version && !/^\d+\.\d+\.\d+$/.test(version)) throw Error('Versão inválida: use MAIOR.MENOR.CORREÇÃO.');
}
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  const old = fs.readdirSync(dist).filter(name => /^Maestro-Setup(?:-\d+\.\d+\.\d+)?\.exe(?:\.blockmap)?$/.test(name));
  if (old.length) {
    const archive = path.join(dist, 'anteriores'); fs.mkdirSync(archive, { recursive: true });
    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    for (const name of old) fs.renameSync(path.join(dist, name), path.join(archive, `${suffix}-${name}`));
  }
}
fs.writeFileSync(path.join(root, 'dados', 'build.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2));
fs.writeFileSync(manifestFile, JSON.stringify({ version, sourceHash }, null, 2));
console.log(`Preparando Maestro ${version}`);

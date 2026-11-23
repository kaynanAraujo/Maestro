const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Store } = require('../main/store');
const { Installer, validateInput, parsePastedCommand, buildArgs, findNodeTools } = require('../main/installer');
const seed = path.join(__dirname, '..', 'dados', 'catalogo.json');
const url = 'https://github.com/flowkit-labs/skills';

test('valida link, domínio e nome sem aceitar injeção', () => {
  assert.deepEqual(validateInput(url, 'website-builder'), { url, skill: 'website-builder' });
  for (const bad of ['http://github.com/flowkit-labs/skills', 'https://github.com.evil.com/a/b', 'https://user@github.com/a/b', 'https://github.com/a/b?x=1']) assert.throws(() => validateInput(bad, 'ok'));
  assert.throws(() => validateInput(url, 'nome; calc'));
  assert.equal(validateInput('https://git.exemplo.com/a/b', '', ['git.exemplo.com']).url, 'https://git.exemplo.com/a/b');
  assert.throws(() => findNodeTools({ PATH: '' }), /Node.js\/npx não encontrado/);
});

test('comando colado aceita flags conhecidas e bloqueia argumentos extras', () => {
  assert.deepEqual(parsePastedCommand(`npx skills add ${url} --skill website-builder -g -a claude-code`), { url, skill: 'website-builder' });
  assert.deepEqual(parsePastedCommand(`npx skills add ${url} --skill website-builder`), { url, skill: 'website-builder' });
  assert.throws(() => parsePastedCommand(`npx skills add ${url} --skill website-builder; calc`));
  assert.throws(() => parsePastedCommand(`npx skills add ${url} --exec calc`));
  assert.deepEqual(buildArgs(url, 'website-builder'), ['--yes','skills','add',url,'--skill','website-builder','-g','-a','claude-code','--copy','-y']);
});

function setup(t, mode, timeoutMs = 1000) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-install-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const globalRoot = path.join(tmp, 'skills'); fs.mkdirSync(globalRoot);
  const store = new Store(path.join(tmp, 'data'), seed); store.setPath(globalRoot); store.config.installConsent = true;
  const helper = path.join(__dirname, '..', 'scripts', 'fake-installer.cjs');
  const installer = new Installer(store, { globalRoot, timeoutMs, findTools: () => ({ node: process.execPath, cli: helper }), spawn: (file, args, options) => spawn(file, args, { ...options, env: { ...options.env, FAKE_MODE: mode, FAKE_GLOBAL_ROOT: globalRoot } }) });
  return { store, installer, globalRoot };
}
function run(installer) { return new Promise((resolve, reject) => { const log = []; try { installer.start({ url, skill: 'website-builder' }, event => { if (event.type === 'log') log.push(event.text); if (event.type === 'done') resolve({ ...event, log: log.join('') }); }); } catch (e) { reject(e); } }); }

test('instalação simulada bem-sucedida registra histórico e detecta skill', async t => {
  const { installer, globalRoot } = setup(t, 'success');
  const result = await run(installer);
  assert.equal(result.result, 'Sucesso'); assert.deepEqual(result.detected, ['website-builder']);
  assert.match(result.log, /Instalação simulada concluída/);
  assert.ok(fs.existsSync(path.join(globalRoot, 'website-builder', 'SKILL.md')));
  assert.equal(installer.history()[0].result, 'Sucesso');
});
test('erro simulado mostra falha e conserva log', async t => {
  const { installer } = setup(t, 'error'); const result = await run(installer);
  assert.equal(result.result, 'Erro'); assert.match(result.log, /Falha simulada/); assert.equal(installer.history()[0].result, 'Erro');
});
test('timeout encerra processo simulado', async t => {
  const { installer } = setup(t, 'timeout', 100); const result = await run(installer);
  assert.equal(result.result, 'Tempo esgotado'); assert.equal(installer.history()[0].result, 'Tempo esgotado');
});

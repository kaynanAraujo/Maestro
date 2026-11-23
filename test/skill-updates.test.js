const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../main/store');
const { SkillUpdates } = require('../main/skill-updates');
function setup(t, fetch) {
 const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-skill-test-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
 const root = path.join(tmp, 'skills'); fs.mkdirSync(root); const folder = path.join(root, 'demo'); fs.mkdirSync(folder);
 fs.writeFileSync(path.join(folder, 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\nOriginal');
 const store = new Store(path.join(tmp, 'data'), path.join(__dirname, '..', 'dados', 'catalogo.json')); store.setPath(root);
 store.config.trustedDomains = []; store.config.installConsent = true;
 const updates = new SkillUpdates(store, { fetch }); updates.remember('demo', 'https://github.com/example/repo');
 return { store, updates, folder };
}
const source = async (_url, repo) => { const dir = path.join(repo, 'demo'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\nAtualizada'); };
test('atualiza no lugar e preserva modo e catálogo', async t => { const { store, updates, folder } = setup(t, source); store.mode('demo', 'Só manual'); store.note('demo', { paraQueServe: 'Preferida' }); const before = store.scan().find(s => s.name === 'demo').note; const result = await updates.update('demo'); assert.equal(result.updated, true); assert.equal(store.parse(folder).mode, 'Só manual'); assert.deepEqual(store.scan().find(s => s.name === 'demo').note, before); assert.match(fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8'), /Atualizada/); });
test('falha no download mantém versão atual', async t => { const { updates, folder } = setup(t, async () => { throw Error('offline'); }); await assert.rejects(updates.update('demo'), /conexão/); assert.match(fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8'), /Original/); });
test('alteração local exige confirmação', async t => { const { updates, folder } = setup(t, source); fs.appendFileSync(path.join(folder, 'SKILL.md'), '\nLocal'); assert.equal((await updates.update('demo')).needsConfirmation, true); assert.match(fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8'), /Local/); });
test('instalação antiga sem referência informa motivo sem afirmar alteração local', async t => { const { updates, folder } = setup(t, source); const origins = updates.origins(); delete origins.demo; fs.writeFileSync(updates.file, JSON.stringify(origins)); fs.writeFileSync(updates.store.installFile, JSON.stringify([{ result: 'Sucesso', skill: 'demo', url: 'https://github.com/example/repo' }])); const check = await updates.check('demo'); assert.equal(check.modified, null); assert.equal(check.referenceKnown, false); assert.equal(check.available, true); const result = await updates.update('demo'); assert.equal(result.reason, 'unknown-reference'); assert.match(fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8'), /Original/); });
test('alteração local sozinha não vira atualização disponível', async t => { const { updates, folder } = setup(t, async (_url, repo) => { const dir = path.join(repo, 'demo'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\nOriginal'); }); fs.appendFileSync(path.join(folder, 'SKILL.md'), '\nLocal'); const check = await updates.check('demo'); assert.equal(check.available, false); assert.equal(check.modified, true); assert.equal((await updates.update('demo')).reason, 'local-changes'); });
test('falha na troca restaura a pasta anterior', async t => { const { updates, folder } = setup(t, source); const rename = fs.renameSync; fs.renameSync = (from, to) => { if (from.endsWith('.maestro-new') && to === folder) throw Error('falha simulada'); return rename(from, to); }; try { await assert.rejects(updates.update('demo', true), /falha simulada/); } finally { fs.renameSync = rename; } assert.match(fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8'), /Original/); });

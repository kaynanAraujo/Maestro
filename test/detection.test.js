const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../main/store');
const { SkillMonitor } = require('../main/monitor');
const seed = path.join(__dirname, '..', 'dados', 'catalogo.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup(t) { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-detect-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true })); const root = path.join(tmp, 'skills'); fs.mkdirSync(root); const data = path.join(tmp, 'data'); const store = new Store(data, seed); store.setPath(root); store.scan(); store.takeNotices(); return { root, data, store }; }
function skill(root, name, content = '---\nname: nova\ndescription: Create database tables\n---\nCorpo') { const folder = path.join(root, name); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'SKILL.md'), content); return folder; }

test('skill nova recebe catálogo, etiqueta e persiste ao reabrir sem alterar SKILL.md', t => {
  const { root, data, store } = setup(t); const folder = skill(root, 'nova');
  const before = fs.readFileSync(path.join(folder, 'SKILL.md'));
  let row = store.scan().find(s => s.name === 'nova');
  assert.equal(row.mode, 'Automática'); assert.equal(row.isNew, true);
  assert.match(row.note.paraQueServe, /banco de dados/); assert.equal(row.note.quandoUsar, 'Precisa de revisão');
  assert.deepEqual(fs.readFileSync(path.join(folder, 'SKILL.md')), before);
  assert.equal(store.takeNotices().filter(n => n.type === 'new').length, 1);
  const reopened = new Store(data, seed);
  row = reopened.scan().find(s => s.name === 'nova');
  assert.equal(row.isNew, true);
  reopened.details('nova');
  assert.equal(reopened.scan().find(s => s.name === 'nova').isNew, false);
});

test('skill instalada enquanto app está fechado é descoberta na próxima abertura', t => {
  const { root, data } = setup(t); skill(root, 'offline');
  const reopened = new Store(data, seed);
  assert.equal(reopened.scan().find(s => s.name === 'offline').isNew, true);
  assert.equal(reopened.takeNotices().filter(n => n.type === 'new').length, 1);
});

test('remoção externa mantém card e permite remover entrada do catálogo', t => {
  const { root, store } = setup(t); const folder = skill(root, 'externa');
  store.scan(); store.takeNotices(); fs.rmSync(folder, { recursive: true });
  assert.equal(store.scan().find(s => s.name === 'externa').missing, true);
  assert.match(store.takeNotices()[0].message, /não encontrada/);
  store.removeFromCatalog('externa');
  assert.equal(store.scan().find(s => s.name === 'externa'), undefined);
});

test('pasta sem SKILL.md e YAML inválido geram avisos sem interromper o painel', t => {
  const { root, store } = setup(t); fs.mkdirSync(path.join(root, 'vazia'));
  skill(root, 'quebrada', '---\nname: [\ndescription: teste\n---\n');
  const rows = store.scan();
  assert.match(rows.find(s => s.name === 'vazia').error, /Pasta vazia ignorada: não tem SKILL.md/);
  assert.match(rows.find(s => s.name === 'quebrada').error, /YAML inválido/);
  assert.equal(store.takeNotices().filter(n => n.type === 'warning').length, 2);
});

test('observador espera cópia lenta antes de registrar a skill', async t => {
  const { root, store } = setup(t); const changes = [];
  const monitor = new SkillMonitor(store, (_rows, notices) => changes.push(...notices), 250, 10000);
  monitor.start(); t.after(() => monitor.stop());
  const folder = path.join(root, 'lenta'); fs.mkdirSync(folder);
  const file = path.join(folder, 'SKILL.md'); fs.writeFileSync(file, '---\nname: lenta\ndescription: Create database tables\n---\n');
  for (let i = 0; i < 4; i++) { await sleep(90); fs.appendFileSync(file, Buffer.alloc(256 * 1024, 65)); }
  assert.equal(changes.filter(n => n.type === 'new').length, 0);
  await sleep(450);
  assert.equal(changes.filter(n => n.type === 'new').length, 1);
  assert.ok(store.scan().some(s => s.name === 'lenta'));
});

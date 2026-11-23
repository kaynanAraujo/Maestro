const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../main/store');
const seed = path.join(__dirname, '..', 'dados', 'catalogo.json');

test('migração registra formato 4, cria backup e preserva dados pessoais', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-migration-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const data = path.join(tmp, 'data'); fs.mkdirSync(data);
  const catalog = { pessoal: { paraQueServe: 'Minha anotação', quandoUsar: 'Quando eu quiser' } };
  const profiles = { Trabalho: { pessoal: 'Só manual' } };
  const history = [{ skill: 'pessoal', action: 'Alterei o modo' }];
  fs.writeFileSync(path.join(data, 'catalogo.json'), JSON.stringify(catalog));
  fs.writeFileSync(path.join(data, 'perfis.json'), JSON.stringify(profiles));
  fs.writeFileSync(path.join(data, 'historico.json'), JSON.stringify(history));
  fs.writeFileSync(path.join(data, 'formato.json'), JSON.stringify({ version: 1 }));
  new Store(data, seed);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'formato.json'))).version, 4);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'catalogo.json'))), catalog);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'perfis.json'))), profiles);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'historico.json'))), history);
  const backups = fs.readdirSync(path.join(data, '_backups'));
  assert.ok(backups.length >= 4);
  assert.ok(backups.some(id => fs.existsSync(path.join(data, '_backups', id, 'catalogo.json'))));
});

test('versão semântica consta no changelog e no nome previsto do instalador', () => {
  const pkg = require('../package.json');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'NOVIDADES.md'), 'utf8'), new RegExp(`## ${pkg.version.replace(/\./g, '\\.')}`));
  assert.equal(pkg.build.nsis.artifactName, 'Maestro-Setup-${version}.exe');
});

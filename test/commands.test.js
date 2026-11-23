const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../main/store');
const { presentation, copyCommand } = require('../renderer/command-ui');
const seed = path.join(__dirname, '..', 'dados', 'catalogo.json');

test('comandos e textos seguem o modo e o name do YAML', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-commands-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'skills'); fs.mkdirSync(root);
  const store = new Store(path.join(temp, 'data'), seed); store.setPath(root);
  const folder = path.join(root, 'pasta-diferente'); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'SKILL.md'), '---\nname: minha-skill\ndescription: Teste\nmetadata:\n  author: vercel\n---\nCorpo', 'utf8');
  let skill = store.scan().find(s => s.name === 'pasta-diferente');
  assert.equal(skill.command, '/minha-skill');
  assert.equal(skill.plugin, false);
  assert.match(presentation(skill).message, /O Claude decide sozinho quando usar.*\/minha-skill/);
  store.mode(skill.name, 'Só manual');
  skill = store.scan().find(s => s.name === 'pasta-diferente');
  assert.equal(presentation(skill).command, '/minha-skill');
  assert.match(presentation(skill).example, /\/minha-skill crie uma tabela de clientes/);
  store.saveProfile('Manual');
  assert.deepEqual(store.previewManualCommands('Manual').map(s => s.command), ['/minha-skill']);
  store.mode(skill.name, 'Desligada');
  skill = store.scan().find(s => s.name === 'pasta-diferente');
  assert.equal(presentation(skill).message, 'Desligada: não pode ser chamada até ser reativada');
  const fallback = path.join(root, 'sem-name'); fs.mkdirSync(fallback);
  fs.writeFileSync(path.join(fallback, 'SKILL.md'), '---\ndescription: Sem name\nplugin: true\ndisable-model-invocation: true\n---\n', 'utf8');
  assert.equal(store.scan().find(s => s.name === 'sem-name').command, '/plugin:sem-name');
});

test('Copiar envia o comando à área de transferência e confirma', async () => {
  let copied, notice;
  await copyCommand('/minha-skill', text => { copied = text; }, text => { notice = text; });
  assert.equal(copied, '/minha-skill');
  assert.equal(notice, 'Comando copiado!');
});

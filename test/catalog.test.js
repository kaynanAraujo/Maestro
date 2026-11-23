const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../main/store');
const { categoryFor, purpose, usage, REVIEW } = require('../main/catalog');
const seed = path.join(__dirname, '..', 'dados', 'catalogo.json');

test('classifica categorias pelo nome, descrição e conteúdo', () => {
  for (const [name, description, expected] of [
    ['expo-helper', 'React Native and Expo components', 'Mobile'],
    ['website-builder', 'Build a website', 'Web'],
    ['ui-design', 'Design accessible interfaces', 'Design'],
    ['supabase', 'Postgres database queries', 'Banco de Dados'],
    ['auth-guard', 'Security and authentication', 'Segurança'],
    ['workflow-runner', 'Automation of recurring tasks', 'Automação'],
    ['test-runner', 'Testing code', 'Testes'],
    ['llm-prompts', 'AI prompt engineering', 'IA'],
    ['misc-tool', 'General notes', 'Outros']
  ]) assert.equal(categoryFor({ name, description, raw: '' }), expected, name);
  assert.equal(categoryFor({ name: 'helper', description: 'General', raw: '## Usage\nUse this to test an application.' }), 'Testes');
});

test('extrai finalidade e uso sem inventar tradução', () => {
  assert.equal(purpose({ description: 'Create database tables for customer records.' }), 'Ajuda a criar tabelas de banco de dados.');
  assert.equal(purpose({ description: 'Guidance for complex deployments.' }), 'Guidance for complex deployments.');
  assert.equal(usage({ description: 'Build interfaces. Use when asked to review UI.', raw: '' }), 'Use when asked to review UI');
  assert.equal(usage({ description: 'Build interfaces.', raw: '---\nname: x\ndescription: Build interfaces.\n---\n## When to Use\n\n- For a new website\n' }), 'For a new website');
  assert.equal(usage({ description: 'Build interfaces.', raw: '' }), REVIEW);
});

test('preenche campos vazios e preserva anotações e categoria editadas', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-catalog-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, 'skills'); fs.mkdirSync(root);
  const data = path.join(tmp, 'data'); fs.mkdirSync(data);
  const old = { 'website-builder': { paraQueServe: 'Minha explicação pessoal', quandoUsar: '' } };
  fs.writeFileSync(path.join(data, 'catalogo.json'), JSON.stringify(old));
  const store = new Store(data, seed); store.setPath(root);
  const folder = path.join(root, 'website-builder'); fs.mkdirSync(folder);
  const file = path.join(folder, 'SKILL.md');
  fs.writeFileSync(file, '---\nname: website-builder\ndescription: Build websites. Use when creating a new website.\n---\n');
  const before = fs.readFileSync(file);
  let row = store.scan().find(s => s.name === 'website-builder');
  assert.equal(row.note.paraQueServe, 'Minha explicação pessoal');
  assert.equal(row.note.quandoUsar, 'Use when creating a new website');
  assert.equal(row.note.categoria, 'Web');
  store.category('website-builder', 'Design');
  store.note('website-builder', { paraQueServe: 'Texto meu', quandoUsar: 'Ao criar algo' });
  fs.writeFileSync(file, '---\nname: website-builder\ndescription: Security testing. Use when auditing access.\n---\n');
  const externallyChanged = fs.readFileSync(file);
  row = store.scan().find(s => s.name === 'website-builder');
  assert.equal(row.note.categoria, 'Design');
  assert.equal(row.note.paraQueServe, 'Texto meu');
  assert.equal(row.note.quandoUsar, 'Ao criar algo');
  assert.deepEqual(fs.readFileSync(file), externallyChanged);
  assert.notDeepEqual(externallyChanged, before);
  const reopened = new Store(data, seed); reopened.scan();
  assert.equal(reopened.scan().find(s => s.name === 'website-builder').note.categoria, 'Design');
});

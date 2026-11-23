const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('scripts da interface podem carregar juntos sem declarações repetidas', () => {
  const dir = path.join(__dirname, '..', 'renderer');
  const source = fs.readFileSync(path.join(dir, 'command-ui.js'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source));
});

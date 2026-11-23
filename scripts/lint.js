// Verifica a sintaxe dos arquivos JavaScript sem instalar dependências extras.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
let checked = 0;
for (const folder of ['main', 'preload', 'renderer', 'scripts']) {
  for (const name of fs.readdirSync(path.join(root, folder))) {
    if (!name.endsWith('.js')) continue;
    const file = path.join(root, folder, name);
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    checked++;
  }
}
console.log(`Sintaxe verificada em ${checked} arquivos JavaScript.`);

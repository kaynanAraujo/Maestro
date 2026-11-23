// CLI de teste: não usa rede nem executa npx de verdade.
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
console.log('Argumentos recebidos:', args.join(' '));
if (process.env.FAKE_MODE === 'error') { console.error('Falha simulada'); process.exit(7); }
if (process.env.FAKE_MODE === 'timeout') setInterval(() => console.log('Aguardando...'), 1000);
else {
  const index = args.indexOf('--skill'); const name = index >= 0 ? args[index + 1] : 'skill-exemplo';
  const folder = path.join(process.env.FAKE_GLOBAL_ROOT, name);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\nname: ${name}\ndescription: Skill de teste\n---\n`);
  console.log('Instalação simulada concluída');
}

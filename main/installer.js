// Instalação sem shell: entradas do usuário são validadas e viram argumentos separados.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');

const skillPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function validateInput(url, skill, domains = []) {
  let parsed;
  try { parsed = new URL(String(url || '').trim()); } catch { throw Error('Informe um link HTTPS válido do repositório.'); }
  const allowed = ['github.com', ...domains.map(x => String(x).toLowerCase())];
  if (parsed.protocol !== 'https:' || !allowed.includes(parsed.hostname.toLowerCase()) || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) throw Error('Use um link HTTPS de github.com ou de um domínio confiável configurado.');
  if (!/^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?\/?$/.test(parsed.pathname)) throw Error('O link precisa apontar para um repositório (organização/projeto).');
  if (skill && !skillPattern.test(skill)) throw Error('Nome da skill inválido. Use letras, números, hífen, underline ou ponto.');
  return { url: parsed.origin + parsed.pathname.replace(/\/$/, ''), skill: skill || '' };
}
function parsePastedCommand(input) {
  const tokens = String(input || '').match(/"[^"]*"|'[^']*'|\S+/g)?.map(x => x.replace(/^(?:"([^"]*)"|'([^']*)')$/, (_m, a, b) => a ?? b)) || [];
  if (!/^npx(?:\.cmd)?$/i.test(tokens.shift() || '')) throw Error('Cole um comando que comece com npx skills add.');
  if (tokens[0] === '--yes') tokens.shift();
  if (tokens.shift() !== 'skills' || tokens.shift() !== 'add') throw Error('O comando precisa usar npx skills add.');
  const url = tokens.shift(); let skill = '';
  while (tokens.length) {
    const flag = tokens.shift();
    if (flag === '--skill' || flag === '-s') { if (skill || !tokens.length) throw Error('Informe apenas uma skill.'); skill = tokens.shift(); }
    else if (flag === '-g' || flag === '--global' || flag === '-y' || flag === '--yes' || flag === '--copy') continue;
    else if (flag === '-a' || flag === '--agent') { if (tokens.shift() !== 'claude-code') throw Error('O agente permitido é claude-code.'); }
    else throw Error(`Argumento não permitido: ${flag}`);
  }
  return { url, skill };
}
function buildArgs(url, skill) { return ['--yes', 'skills', 'add', url, ...(skill ? ['--skill', skill] : []), '-g', '-a', 'claude-code', '--copy', '-y']; }
function previewCommand(url, skill) { return `npx ${buildArgs(url, skill).join(' ')}`; }
function findNodeTools(env = process.env) {
  const names = (env.PATH || env.Path || '').split(path.delimiter).map(x => x.replace(/^"|"$/g, ''));
  for (const dir of names) {
    const npx = path.join(dir, 'npx.cmd'), node = path.join(dir, 'node.exe'), cli = path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (fs.existsSync(npx) && fs.existsSync(node) && fs.existsSync(cli)) return { node, cli };
  }
  throw Error('Node.js/npx não encontrado. Instale o Node.js em https://nodejs.org/ e abra o Maestro novamente.');
}
class Installer {
  constructor(store, options = {}) { this.store = store; this.findTools = options.findTools || findNodeTools; this.spawn = options.spawn || spawn; this.timeoutMs = options.timeoutMs || 300000; this.globalRoot = options.globalRoot || path.join(os.homedir(), '.claude', 'skills'); this.running = null; }
  prepare(input) {
    const valid = validateInput(input.url, input.skill, this.store.config.trustedDomains || []);
    const global = path.resolve(this.globalRoot), configured = path.resolve(this.store.config.skillsPath);
    return { ...valid, args: buildArgs(valid.url, valid.skill), command: previewCommand(valid.url, valid.skill), globalRoot: global, mismatch: global.toLowerCase() !== configured.toLowerCase() };
  }
  preflight(input) { const plan = this.prepare(input); this.findTools(); return plan; }
  history() { return fs.existsSync(this.store.installFile) ? JSON.parse(fs.readFileSync(this.store.installFile, 'utf8')) : []; }
  start(input, emit) {
    if (!this.store.config.installConsent) throw Error('Confirme primeiro o aviso sobre skills de terceiros.');
    if (this.running) throw Error('Já existe uma instalação em andamento.');
    const plan = this.preflight(input), tools = this.findTools();
    if (fs.existsSync(plan.globalRoot)) this.store.backup(plan.globalRoot, 'instalação global');
    const before = new Set(this.store.scan().filter(s => s.mode).map(s => s.name));
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const child = this.spawn(tools.node, [tools.cli, ...plan.args], { shell: false, windowsHide: true, cwd: os.homedir(), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, npm_config_yes: 'true', CI: '1' } });
    const run = { id, child, plan, log: '', status: 'running', timer: null }; this.running = run;
    const output = chunk => { const text = chunk.toString('utf8'); run.log = (run.log + text).slice(-200000); emit({ type: 'log', id, text }); };
    child.stdout?.on('data', output); child.stderr?.on('data', output);
    const finish = (code, error) => {
      if (this.running !== run) return;
      clearTimeout(run.timer); this.running = null;
      const result = run.status === 'timeout' ? 'Tempo esgotado' : run.status === 'canceled' ? 'Cancelada' : error ? 'Erro' : code === 0 ? 'Sucesso' : 'Erro';
      const after = this.store.scan().filter(s => s.mode).map(s => s.name);
      const detected = after.filter(name => !before.has(name));
      const record = { date: new Date().toISOString(), url: plan.url, skill: plan.skill, detected, result, log: run.log.slice(-12000) };
      this.store.save(this.store.installFile, [record, ...this.history()].slice(0, 50));
      this.store.log(plan.skill || plan.url, `Instalação pela internet: ${result} — ${plan.url}`);
      emit({ type: 'done', id, result, code, error: error?.message, detected, mismatch: plan.mismatch, globalRoot: plan.globalRoot });
    };
    child.on('error', error => finish(null, error)); child.on('close', code => finish(code));
    run.timer = setTimeout(() => { run.status = 'timeout'; this.kill(); }, this.timeoutMs);
    emit({ type: 'start', id, command: plan.command });
    return { id, command: plan.command, mismatch: plan.mismatch, globalRoot: plan.globalRoot };
  }
  kill() {
    const run = this.running; if (!run) return;
    if (process.platform === 'win32' && run.child.pid) execFile('taskkill.exe', ['/PID', String(run.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    run.child.kill();
  }
  cancel() { if (!this.running) return false; this.running.status = 'canceled'; this.kill(); return true; }
}
module.exports = { Installer, validateInput, parsePastedCommand, buildArgs, previewCommand, findNodeTools };

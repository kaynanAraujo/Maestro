const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { validateInput } = require('./installer');
const run = promisify(execFile);
function digest(folder) {
  const hash = crypto.createHash('sha256');
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (item.isSymbolicLink()) throw Error('A skill contém um link simbólico e não pode ser atualizada com segurança.');
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (item.isFile()) { hash.update(path.relative(folder, file).replace('SKILL.md.disabled', 'SKILL.md')); let data = fs.readFileSync(file); if (item.name === 'SKILL.md' || item.name === 'SKILL.md.disabled') data = Buffer.from(data.toString().replace(/^disable-model-invocation:[^\r\n]*(\r?\n)?/m, '')); hash.update(data); }
    }
  }
  walk(folder); return hash.digest('hex');
}
function locate(repo, name) {
  const matches = [];
  function walk(dir, depth) {
    if (depth > 6 || matches.length > 1) return;
    if (fs.existsSync(path.join(dir, 'SKILL.md')) && path.basename(dir) === name) matches.push(dir);
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) if (item.isDirectory() && item.name !== '.git' && item.name !== 'node_modules') walk(path.join(dir, item.name), depth + 1);
  }
  walk(repo, 0);
  if (matches.length !== 1) throw Error('Não foi possível identificar uma única pasta da skill no repositório.');
  return matches[0];
}
class SkillUpdates {
  constructor(store, options = {}) { this.store = store; this.fetch = options.fetch || (async (url, dir) => { await run('git', ['clone', '--depth', '1', '--', url, dir], { timeout: 120000, windowsHide: true }); }); this.file = path.join(store.dataDir, 'origens-skills.json'); }
  origins() { return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : {}; }
  source(name) {
    const saved = this.origins()[name]; if (saved) return saved;
    const record = (fs.existsSync(this.store.installFile) ? JSON.parse(fs.readFileSync(this.store.installFile, 'utf8')) : []).find(x => x.result === 'Sucesso' && (x.detected?.includes(name) || x.skill === name));
    return record ? { url: record.url, baseline: null } : null;
  }
  remember(name, url) { const origins = this.origins(); origins[name] = { url, baseline: digest(this.store.folder(name)) }; this.store.save(this.file, origins); }
  async stage(name) {
    const source = this.source(name); if (!source) throw Error('Origem desconhecida. Instale esta skill pelo Maestro para habilitar atualizações.');
    const valid = validateInput(source.url, name, this.store.config.trustedDomains || []);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-skill-update-'));
    try { const repo = path.join(temp, 'repo'); await this.fetch(valid.url, repo); const folder = locate(repo, name); this.store.parse(folder); return { temp, folder, source, remoteHash: digest(folder) }; }
    catch (e) { fs.rmSync(temp, { recursive: true, force: true }); throw Error(`Não foi possível baixar ou validar ${name}. Confira a conexão e a origem. ${e.message}`); }
  }
  async check(name) { const staged = await this.stage(name); try { const localHash = digest(this.store.folder(name)); return { available: staged.remoteHash !== (staged.source.baseline || localHash), modified: staged.source.baseline ? staged.source.baseline !== localHash : null, referenceKnown: Boolean(staged.source.baseline) }; } finally { fs.rmSync(staged.temp, { recursive: true, force: true }); } }
  async update(name, overwrite = false) {
    const current = this.store.parse(this.store.folder(name)); const staged = await this.stage(name);
    const target = current.folder, prepared = target + '.maestro-new', old = target + '.maestro-old';
    try {
      const localHash = digest(target);
      if (staged.remoteHash === localHash) return { current: true };
      if (!staged.source.baseline && !overwrite) return { needsConfirmation: true, reason: 'unknown-reference' };
      if (staged.source.baseline && staged.source.baseline !== localHash && !overwrite) return { needsConfirmation: true, reason: 'local-changes' };
      const backupId = this.store.backup(target, name);
      fs.cpSync(staged.folder, prepared, { recursive: true, errorOnExist: true, force: false });
      this.store.parse(prepared);
      fs.renameSync(target, old);
      try {
        fs.renameSync(prepared, target);
        this.store.mode(name, current.mode);
        const origins = this.origins(); origins[name] = { url: staged.source.url, baseline: digest(target) }; this.store.save(this.file, origins);
        this.store.log(name, 'Skill atualizada', backupId);
        fs.rmSync(old, { recursive: true, force: true });
        return { updated: true, backupId };
      } catch (e) { if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(old, target); throw e; }
    } finally { if (fs.existsSync(prepared)) fs.rmSync(prepared, { recursive: true, force: true }); fs.rmSync(staged.temp, { recursive: true, force: true }); }
  }
}
module.exports = { SkillUpdates, digest };

// Operações de arquivos do Maestro. Nenhum caminho vindo da interface é aceito diretamente.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const YAML = require('yaml');
const { commandFor } = require('./commands');
const { CATEGORIES, enrichEntry } = require('./catalog');

const safeName = /^[\p{L}\p{N}][\p{L}\p{N}._ -]*$/u;
const enc = 'utf8';
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const readJson = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, enc)) : fallback;
class Store {
  constructor(dataDir, initialCatalog) {
    this.dataDir = path.resolve(dataDir);
    this.catalogFile = path.join(this.dataDir, 'catalogo.json');
    this.profileFile = path.join(this.dataDir, 'perfis.json');
    this.historyFile = path.join(this.dataDir, 'historico.json');
    this.configFile = path.join(this.dataDir, 'configuracoes.json');
    this.stateFile = path.join(this.dataDir, 'estado.json');
    this.formatFile = path.join(this.dataDir, 'formato.json');
    this.errorsFile = path.join(this.dataDir, 'erros.json');
    this.installFile = path.join(this.dataDir, 'instalacoes.json');
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.catalogFile)) fs.copyFileSync(initialCatalog, this.catalogFile);
    this.migrateData();
    this.config = readJson(this.configFile, { skillsPath: path.join(os.homedir(), '.claude', 'skills'), autoStart: false });
    this.config.trustedDomains ||= [];
    this.config.installConsent ||= false;
    this.state = readJson(this.stateFile, { unseen: [] });
    this.notices = [];
    this.warned = new Map();
    this.lastPresent = null;
    this.watcher = null;
  }
  migrateData() {
    const current = readJson(this.formatFile, { version: 1 });
    if (!Number.isInteger(current.version) || current.version > 4 || current.version < 1) throw Error('Formato de dados desconhecido. Atualize o Maestro antes de continuar.');
    if (current.version === 4) return;
    // O formato 4 acrescenta categoria e campos automáticos ao catálogo; arquivos anteriores são preservados.
    for (const file of [this.catalogFile, this.profileFile, this.historyFile, this.configFile, this.stateFile, this.errorsFile, this.installFile, this.formatFile]) this.backup(file, 'migração');
    const tmp = this.formatFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 4, migratedAt: new Date().toISOString(), from: current.version }, null, 2), enc);
    fs.renameSync(tmp, this.formatFile);
  }
  recordError(message) {
    const errors = readJson(this.errorsFile, []);
    errors.unshift({ date: new Date().toISOString(), message: String(message).slice(0, 500) });
    this.save(this.errorsFile, errors.slice(0, 20));
  }
  recentErrors() { return readJson(this.errorsFile, []).slice(0, 5); }
  save(file, value) {
    if (fs.existsSync(file)) this.backup(file, 'dados');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), enc);
    fs.renameSync(tmp, file);
  }
  backup(target, skill) {
    if (!fs.existsSync(target)) return null;
    const id = `${stamp()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(this.dataDir, '_backups', id);
    fs.mkdirSync(dir, { recursive: true });
    const stat = fs.statSync(target);
    if (stat.isDirectory()) fs.cpSync(target, path.join(dir, path.basename(target)), { recursive: true });
    else fs.copyFileSync(target, path.join(dir, path.basename(target)));
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, skill, source: target, folder: stat.isDirectory(), date: new Date().toISOString() }), enc);
    return id;
  }
  root() {
    const root = path.resolve(this.config.skillsPath);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Error('A pasta de skills não foi encontrada. Confira em Configurações.');
    return fs.realpathSync(root);
  }
  folder(name) {
    if (typeof name !== 'string' || !safeName.test(name) || name === '_removidas' || name === '.' || name === '..') throw Error('Nome de skill inválido.');
    const root = this.root();
    const folder = path.join(root, name);
    if (fs.existsSync(folder) && fs.realpathSync(folder) !== folder && !fs.realpathSync(folder).startsWith(root + path.sep)) throw Error('A skill aponta para fora da pasta configurada.');
    return folder;
  }
  parse(folder) {
    const active = path.join(folder, 'SKILL.md'), disabled = active + '.disabled';
    const file = fs.existsSync(active) ? active : fs.existsSync(disabled) ? disabled : null;
    if (!file) throw Error('A skill não contém SKILL.md.');
    const raw = fs.readFileSync(file, enc);
    const match = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/.exec(raw);
    if (!match) throw Error(`Frontmatter ausente ou inválido em ${path.basename(folder)}.`);
    let doc;
    try { doc = YAML.parseDocument(match[2], { uniqueKeys: true }); if (doc.errors.length) throw doc.errors[0]; }
    catch (e) { throw Error(`YAML inválido em ${path.basename(folder)}: ${e.message}`); }
    const values = doc.toJS();
    if (!values || (values.name != null && typeof values.name !== 'string') || typeof values.description !== 'string') throw Error(`name ou description inválido em ${path.basename(folder)}.`);
    const mode = file === disabled ? 'Desligada' : values['disable-model-invocation'] === true ? 'Só manual' : 'Automática';
    const plugin = /[\\/]plugins[\\/]/i.test(folder) || Boolean(values.plugin || values.metadata?.plugin) || /plugin/i.test(values.source || '');
    const title = values.name?.trim() || path.basename(folder);
    return { name: path.basename(folder), title, command: commandFor(values.name, path.basename(folder), plugin), description: values.description, mode, plugin, folder, file, raw, match, doc };
  }
  scan() {
    const root = this.root();
    const catalog = readJson(this.catalogFile, {});
    let changed = false;
    const skills = [];
    const present = new Set();
    for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name === '_removidas') continue;
      present.add(dir.name);
      try {
        const folder = this.folder(dir.name);
        if (!fs.existsSync(path.join(folder, 'SKILL.md')) && !fs.existsSync(path.join(folder, 'SKILL.md.disabled'))) throw Error(`Pasta ${dir.name} ignorada: não tem SKILL.md`);
        const s = this.parse(folder);
        const isNew = !catalog[s.name];
        const enriched = enrichEntry(catalog[s.name] || {}, s);
        if (JSON.stringify(enriched) !== JSON.stringify(catalog[s.name])) { catalog[s.name] = enriched; changed = true; }
        if (isNew) {
          this.state.unseen.push(s.name);
          this.save(this.stateFile, this.state);
          this.notices.push({ type: 'new', name: s.name, message: `Nova skill detectada: ${s.name}` });
        }
        skills.push({ name: s.name, title: s.title, command: s.command, description: s.description, mode: s.mode, plugin: s.plugin, note: catalog[s.name], isNew: this.state.unseen.includes(s.name) });
      } catch (e) {
        const message = e.message.startsWith('Pasta ') ? e.message : `Pasta ${dir.name} ignorada: ${e.message}`;
        if (this.warned.get(dir.name) !== message) { this.notices.push({ type: 'warning', name: dir.name, message }); this.warned.set(dir.name, message); this.recordError(message); }
        skills.push({ name: dir.name, error: message, ignored: true });
      }
    }
    for (const name of Object.keys(catalog)) if (!present.has(name)) {
      skills.push({ name, missing: true, note: catalog[name] });
      if (this.lastPresent?.has(name)) this.notices.push({ type: 'missing', name, message: `Skill não encontrada: ${name}` });
    }
    for (const name of this.warned.keys()) if (!present.has(name) || !skills.some(s => s.name === name && s.ignored)) this.warned.delete(name);
    this.lastPresent = present;
    if (changed) this.save(this.catalogFile, catalog);
    return skills.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  takeNotices() { return this.notices.splice(0); }
  markSeen(name) {
    if (this.state.unseen.includes(name)) {
      this.state.unseen = this.state.unseen.filter(x => x !== name);
      this.save(this.stateFile, this.state);
    }
  }
  removeFromCatalog(name) {
    const catalog = readJson(this.catalogFile, {});
    if (!catalog[name]) throw Error('Skill não encontrada no catálogo.');
    if (fs.existsSync(this.folder(name))) throw Error('A pasta ainda existe. Remova a skill antes de apagar a entrada do catálogo.');
    delete catalog[name]; this.save(this.catalogFile, catalog); this.markSeen(name);
  }
  details(name) {
    const s = this.parse(this.folder(name));
    this.markSeen(name);
    const files = [];
    const walk = (dir) => { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, item.name); if (item.isFile()) files.push(path.relative(s.folder, full)); else if (item.isDirectory() && !item.isSymbolicLink()) walk(full); } };
    walk(s.folder);
    return { ...this.scan().find(x => x.name === name), folder: s.folder, files, content: s.raw };
  }
  log(skill, action, backupId = null) {
    const history = readJson(this.historyFile, []);
    history.unshift({ id: `${stamp()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toISOString(), skill, action, backupId });
    this.save(this.historyFile, history.slice(0, 200));
  }
  mode(name, target) {
    if (!['Automática', 'Só manual', 'Desligada'].includes(target)) throw Error('Modo inválido.');
    const s = this.parse(this.folder(name));
    if (s.mode === target) return null;
    const backupId = this.backup(s.file, name);
    const active = path.join(s.folder, 'SKILL.md'), disabled = active + '.disabled';
    if (target === 'Desligada') fs.renameSync(active, disabled);
    else {
      if (s.file === disabled) fs.renameSync(disabled, active);
      // O YAML é validado, mas só a linha do campo controlado é alterada.
      let yaml = s.match[2];
      const line = /^disable-model-invocation:[^\r\n]*(?:\r?\n)?/m;
      yaml = yaml.replace(line, '');
      if (target === 'Só manual') yaml += `${yaml.endsWith('\n') ? '' : '\n'}disable-model-invocation: true`;
      const next = s.raw.slice(0, s.match.index + s.match[1].length) + yaml + s.raw.slice(s.match.index + s.match[0].length - s.match[3].length);
      const check = YAML.parseDocument(yaml, { uniqueKeys: true });
      if (check.errors.length) throw Error('A edição produziu YAML inválido; o backup está disponível.');
      fs.writeFileSync(active, next, enc);
    }
    this.log(name, `${s.mode} → ${target}`, backupId);
    return { backupId, warning: s.plugin && target === 'Só manual' ? 'Esta skill parece vir de plugin e pode ignorar o modo Só manual.' : null };
  }
  note(name, note) {
    this.parse(this.folder(name));
    const catalog = readJson(this.catalogFile, {});
    catalog[name] = { ...catalog[name], paraQueServe: String(note.paraQueServe || ''), quandoUsar: String(note.quandoUsar || ''), paraQueServeManual: true, quandoUsarManual: true };
    this.save(this.catalogFile, catalog); this.log(name, 'Anotação atualizada');
  }
  category(name, category) {
    this.parse(this.folder(name));
    if (!CATEGORIES.includes(category)) throw Error('Categoria inválida.');
    const catalog = readJson(this.catalogFile, {});
    catalog[name] = { ...catalog[name], categoria: category, categoriaManual: true };
    this.save(this.catalogFile, catalog); this.log(name, `Categoria alterada para ${category}`);
  }
  add(name, description, instructions) {
    const folder = this.folder(name);
    if (fs.existsSync(folder)) throw Error('Já existe uma skill com esse nome.');
    const yaml = YAML.stringify({ name, description: String(description || 'Descreva a skill.') }).trimEnd();
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\n${yaml}\n---\n\n# ${name}\n\n${instructions || 'Escreva aqui as instruções.'}\n`, enc);
    this.log(name, 'Skill criada'); this.scan();
  }
  import(name, source) {
    const folder = this.folder(name);
    if (fs.existsSync(folder)) throw Error('Já existe uma skill com esse nome.');
    if (!fs.statSync(source).isDirectory()) throw Error('A origem não é uma pasta.');
    this.parse(source);
    fs.cpSync(source, folder, { recursive: true, dereference: false, filter: p => !fs.lstatSync(p).isSymbolicLink() });
    this.log(name, 'Skill importada'); this.scan();
  }
  remove(name) {
    const folder = this.folder(name); this.parse(folder);
    const backupId = this.backup(folder, name);
    const destRoot = path.join(this.dataDir, '_removidas'); fs.mkdirSync(destRoot, { recursive: true });
    fs.renameSync(folder, path.join(destRoot, `${name}-${stamp()}`));
    this.log(name, 'Skill removida', backupId);
  }
  profiles() { return readJson(this.profileFile, {}); }
  saveProfile(name) {
    if (!safeName.test(name)) throw Error('Nome de perfil inválido.');
    const profiles = this.profiles(); profiles[name] = Object.fromEntries(this.scan().filter(s => s.mode).map(s => [s.name, s.mode]));
    this.save(this.profileFile, profiles); this.log('', `Perfil ${name} salvo`);
  }
  deleteProfile(name) { const profiles = this.profiles(); if (!profiles[name]) throw Error('Perfil não encontrado.'); delete profiles[name]; this.save(this.profileFile, profiles); this.log('', `Perfil ${name} excluído`); }
  previewProfile(name) {
    const profile = this.profiles()[name]; if (!profile) throw Error('Perfil não encontrado.');
    return this.scan().filter(s => s.mode && profile[s.name] && profile[s.name] !== s.mode).map(s => ({ name: s.name, from: s.mode, to: profile[s.name] }));
  }
  previewManualCommands(name) {
    const profile = this.profiles()[name]; if (!profile) throw Error('Perfil não encontrado.');
    return this.scan().filter(s => s.mode && (profile[s.name] || s.mode) === 'Só manual').map(s => ({ name: s.name, command: s.command, plugin: s.plugin }));
  }
  applyProfile(name) { const changes = this.previewProfile(name); for (const change of changes) this.mode(change.name, change.to); this.log('', `Perfil ${name} aplicado`); return changes; }
  history() { return readJson(this.historyFile, []); }
  restore(id) {
    const entry = this.history().find(x => x.backupId === id);
    if (!entry) throw Error('Backup não encontrado no histórico.');
    const metaFile = path.join(this.dataDir, '_backups', id, 'meta.json');
    if (!fs.existsSync(metaFile)) throw Error('Arquivo de backup não encontrado.');
    const meta = JSON.parse(fs.readFileSync(metaFile, enc));
    const folder = this.folder(entry.skill);
    if (meta.folder) {
      if (fs.existsSync(folder)) throw Error('A skill já existe. Remova-a antes de restaurar esta pasta.');
      fs.cpSync(path.join(path.dirname(metaFile), path.basename(meta.source)), folder, { recursive: true });
    } else {
      if (!['SKILL.md', 'SKILL.md.disabled'].includes(path.basename(meta.source))) throw Error('Backup inválido.');
      if (!fs.existsSync(folder)) throw Error('A pasta da skill não existe.');
      const active = path.join(folder, 'SKILL.md'), disabled = active + '.disabled';
      const current = fs.existsSync(active) ? active : fs.existsSync(disabled) ? disabled : null;
      if (current) { this.backup(current, entry.skill); fs.unlinkSync(current); }
      fs.copyFileSync(path.join(path.dirname(metaFile), path.basename(meta.source)), path.join(folder, path.basename(meta.source)));
    }
    this.log(entry.skill, `Backup ${id} restaurado`);
  }
  setPath(candidate) { const resolved = fs.realpathSync(candidate); if (!fs.statSync(resolved).isDirectory()) throw Error('Escolha uma pasta válida.'); this.config.skillsPath = resolved; this.save(this.configFile, this.config); }
  watch(notify) { if (this.watcher) this.watcher.close(); try { this.watcher = fs.watch(this.root(), { recursive: true }, () => notify()); } catch { try { this.watcher = fs.watch(this.root(), () => notify()); } catch { this.watcher = null; } } }
}
module.exports = { Store };

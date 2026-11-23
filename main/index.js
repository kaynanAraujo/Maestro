const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store');
const { SkillMonitor } = require('./monitor');
const { Installer, parsePastedCommand } = require('./installer');
const { UpdateManager } = require('./updater');
const { SkillUpdates } = require('./skill-updates');
app.setName('Maestro');
app.setPath('userData', path.join(app.getPath('appData'), 'Maestro'));
app.setAppUserModelId('br.com.maestro.skills');

if (!app.requestSingleInstanceLock()) app.quit();
else {
  let win, store, monitor, installer, updates, skillUpdates;
  const sendChange = (_skills, notices) => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('skills-changed', notices);
    if (win.isMinimized()) for (const notice of notices.filter(n => n.type === 'new')) {
      if (Notification.isSupported()) new Notification({ title: 'Maestro', body: notice.message, icon: path.join(__dirname, '..', 'assets', 'maestro.png') }).show();
    }
  };
  const wrap = fn => async (_event, ...args) => { try { return { ok: true, value: await fn(...args) }; } catch (e) { try { store?.recordError(e.message); } catch {} return { ok: false, error: e.message || 'Ocorreu um erro inesperado.' }; } };
  app.whenReady().then(() => {
    store = new Store(app.getPath('userData'), path.join(__dirname, '..', 'dados', 'catalogo.json'));
    installer = new Installer(store);
    skillUpdates = new SkillUpdates(store);
    updates = new UpdateManager(state => { if (win && !win.isDestroyed()) win.webContents.send('update-state', state); });
    store.config.autoStart = app.getLoginItemSettings().openAtLogin;
    win = new BrowserWindow({ width: 1200, height: 780, minWidth: 900, minHeight: 600, title: 'Maestro', icon: path.join(__dirname, '..', 'assets', 'maestro.ico'), webPreferences: { preload: path.join(__dirname, '..', 'preload', 'index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
    win.maximize();
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    win.webContents.once('did-finish-load', () => { if (app.isPackaged && process.platform === 'win32') updates.check().catch(() => {}); });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    monitor = new SkillMonitor(store, sendChange); monitor.start();
    app.on('second-instance', () => { if (win.isMinimized()) win.restore(); win.focus(); });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { monitor?.stop(); installer?.cancel(); });
  ipcMain.handle('scan', wrap(() => store.scan()));
  ipcMain.handle('notices', wrap(() => store.takeNotices()));
  ipcMain.handle('mark-seen', wrap(name => store.markSeen(name)));
  ipcMain.handle('catalog-remove', wrap(name => store.removeFromCatalog(name)));
  ipcMain.handle('copy-text', wrap(text => { if (typeof text !== 'string' || text.length > 20000) throw Error('Comando inválido para copiar.'); clipboard.writeText(text); }));
  ipcMain.handle('details', wrap(name => store.details(name)));
  ipcMain.handle('mode', wrap((name, mode) => store.mode(name, mode)));
  ipcMain.handle('note', wrap((name, note) => store.note(name, note)));
  ipcMain.handle('category', wrap((name, category) => store.category(name, category)));
  ipcMain.handle('add', wrap((name, description, instructions) => store.add(name, description, instructions)));
  ipcMain.handle('import', wrap(async name => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Escolha a pasta da skill' }); if (!r.canceled) store.import(name, r.filePaths[0]); return !r.canceled; }));
  ipcMain.handle('skill-update-sources', wrap(() => Object.fromEntries(store.scan().filter(s => s.mode && skillUpdates.source(s.name)).map(s => [s.name, true]))));
  ipcMain.handle('skill-update-check', wrap(name => skillUpdates.check(name)));
  ipcMain.handle('skill-update-run', wrap((name, overwrite) => skillUpdates.update(name, overwrite)));
  ipcMain.handle('install-parse', wrap(command => parsePastedCommand(command)));
  ipcMain.handle('install-preflight', wrap(input => installer.preflight(input)));
  ipcMain.handle('install-start', wrap(input => installer.start(input, event => {
    if (event.type === 'done' && event.result === 'Sucesso' && !event.mismatch) for (const name of event.detected) {
      try { skillUpdates.remember(name, input.url); } catch (e) { store.recordError(`Origem de ${name}: ${e.message}`); }
    }
    if (win && !win.isDestroyed()) win.webContents.send('install-event', event);
  })));
  ipcMain.handle('install-cancel', wrap(() => installer.cancel()));
  ipcMain.handle('install-history', wrap(() => installer.history()));
  ipcMain.handle('install-consent', wrap(() => { store.config.installConsent = true; store.save(store.configFile, store.config); }));
  ipcMain.handle('trusted-domains', wrap(domains => { if (!Array.isArray(domains) || domains.some(x => typeof x !== 'string' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(x) || x.length > 253)) throw Error('Domínio confiável inválido.'); store.config.trustedDomains = [...new Set(domains.map(x => x.toLowerCase()))].filter(x => x !== 'github.com'); store.save(store.configFile, store.config); return store.config.trustedDomains; }));
  ipcMain.handle('remove', wrap(name => store.remove(name)));
  ipcMain.handle('profiles', wrap(() => store.profiles()));
  ipcMain.handle('profile-save', wrap(name => store.saveProfile(name)));
  ipcMain.handle('profile-delete', wrap(name => store.deleteProfile(name)));
  ipcMain.handle('profile-preview', wrap(name => store.previewProfile(name)));
  ipcMain.handle('profile-manual-commands', wrap(name => store.previewManualCommands(name)));
  ipcMain.handle('profile-apply', wrap(name => store.applyProfile(name)));
  ipcMain.handle('history', wrap(() => store.history()));
  ipcMain.handle('restore', wrap(id => store.restore(id)));
  ipcMain.handle('config', wrap(() => ({ ...store.config, exists: (() => { try { store.root(); return true; } catch { return false; } })() })));
  ipcMain.handle('about', wrap(() => {
    const version = app.getVersion();
    const buildFile = path.join(__dirname, '..', 'dados', 'build.json');
    const builtAt = fs.existsSync(buildFile) ? JSON.parse(fs.readFileSync(buildFile, 'utf8')).builtAt : null;
    const changelog = fs.readFileSync(path.join(__dirname, '..', 'NOVIDADES.md'), 'utf8');
    const section = changelog.split(new RegExp(`^## ${version.replace(/\./g, '\\.')}[^\n]*\n`, 'm'))[1]?.split(/^## /m)[0]?.trim() || 'Nenhuma novidade registrada.';
    const skills = store.scan();
    return { version, builtAt, dataPath: app.getPath('userData'), skillsPath: store.config.skillsPath, skillCount: skills.filter(s => s.mode).length, recentErrors: store.recentErrors(), news: section };
  }));
  ipcMain.handle('choose-path', wrap(async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Escolha a pasta de skills' }); if (!r.canceled) { store.setPath(r.filePaths[0]); monitor.stop(); monitor.start(); } return !r.canceled; }));
  ipcMain.handle('autostart', wrap(value => { app.setLoginItemSettings({ openAtLogin: !!value }); store.config.autoStart = !!value; store.save(store.configFile, store.config); }));
  ipcMain.handle('update-state', wrap(() => updates.snapshot()));
  ipcMain.handle('update-check', wrap(() => updates.check()));
  ipcMain.handle('update-download', wrap(() => updates.download()));
  ipcMain.handle('update-install', wrap(() => updates.install()));
}

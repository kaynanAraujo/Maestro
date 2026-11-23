const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs');
const path = require('node:path');

class UpdateManager {
  constructor(send) {
    this.send = send;
    this.stateFile = path.join(app.getPath('userData'), 'atualizacoes.json');
    let checkedAt = null;
    try { checkedAt = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')).checkedAt || null; } catch {}
    this.state = { phase: 'idle', version: app.getVersion(), checkedAt, availableVersion: null, notes: '', percent: 0, error: null };
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('checking-for-update', () => this.set({ phase: 'checking', error: null }));
    autoUpdater.on('update-available', info => this.set({ phase: 'available', availableVersion: info.version, notes: this.notes(info.releaseNotes) }));
    autoUpdater.on('update-not-available', () => this.set({ phase: 'current', availableVersion: null, notes: '' }));
    autoUpdater.on('download-progress', progress => this.set({ phase: 'downloading', percent: Math.round(progress.percent) }));
    autoUpdater.on('update-downloaded', info => this.set({ phase: 'ready', availableVersion: info.version, percent: 100 }));
    autoUpdater.on('error', error => this.set({ phase: 'error', error: error.message }));
  }
  notes(value) {
    if (Array.isArray(value)) return value.map(item => item.note || '').join('\n').slice(0, 3000);
    return String(value || 'Novidades não informadas.').slice(0, 3000);
  }
  set(change) { this.state = { ...this.state, ...change }; this.send(this.state); }
  snapshot() { return this.state; }
  async check() {
    if (!app.isPackaged || process.platform !== 'win32') throw Error('A verificação de atualizações requer o aplicativo instalado no Windows.');
    if (this.state.phase === 'checking' || this.state.phase === 'downloading') return this.state;
    const checkedAt = new Date().toISOString();
    fs.writeFileSync(this.stateFile, JSON.stringify({ checkedAt }));
    this.set({ phase: 'checking', checkedAt, error: null });
    try { await autoUpdater.checkForUpdates(); } catch (error) { this.set({ phase: 'error', error: error.message }); throw error; }
    return this.state;
  }
  async download() {
    if (this.state.phase !== 'available') throw Error('Nenhuma atualização disponível para baixar.');
    this.set({ phase: 'downloading', percent: 0, error: null });
    try { await autoUpdater.downloadUpdate(); } catch (error) { this.set({ phase: 'error', error: error.message }); throw error; }
    return this.state;
  }
  install() {
    if (this.state.phase !== 'ready') throw Error('Nenhuma atualização foi baixada.');
    autoUpdater.quitAndInstall(false, true);
  }
}
module.exports = { UpdateManager };

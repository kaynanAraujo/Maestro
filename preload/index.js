const { contextBridge, ipcRenderer } = require('electron');
const methods = ['skill-update-sources','skill-update-check','skill-update-run','scan','notices','mark-seen','catalog-remove','details','mode','note','category','add','import','install-parse','install-preflight','install-start','install-cancel','install-history','install-consent','trusted-domains','remove','profiles','profile-save','profile-delete','profile-preview','profile-manual-commands','profile-apply','history','restore','config','about','choose-path','autostart','update-state','update-check','update-download','update-install'];
const api = Object.fromEntries(methods.map(name => [name.replace(/-([a-z])/g, (_, x) => x.toUpperCase()), (...args) => ipcRenderer.invoke(name, ...args)]));
api.onChanged = callback => { const listener = (_event, notices) => callback(notices); ipcRenderer.on('skills-changed', listener); return () => ipcRenderer.removeListener('skills-changed', listener); };
api.onInstallEvent = callback => { const listener = (_event, payload) => callback(payload); ipcRenderer.on('install-event', listener); return () => ipcRenderer.removeListener('install-event', listener); };
api.onUpdateState = callback => { const listener = (_event, payload) => callback(payload); ipcRenderer.on('update-state', listener); return () => ipcRenderer.removeListener('update-state', listener); };
api.copyText = async text => { const result = await ipcRenderer.invoke('copy-text', String(text)); if (!result.ok) throw Error(result.error); };
contextBridge.exposeInMainWorld('maestro', api);

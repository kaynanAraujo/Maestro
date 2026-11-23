const $ = id => document.getElementById(id);
let skills = [], selected = null, importMode = false, toastTimer;
const api = window.maestro;
const uiCommands = window.commandUi;
async function call(name, ...args) { const result = await api[name](...args); if (!result.ok) throw Error(result.error); return result.value; }
function showToast(message, undoId) { const box = $('toast'); box.replaceChildren(document.createTextNode(message)); if (undoId) { const button = document.createElement('button'); button.textContent = 'DESFAZER'; button.onclick = async () => { await action(async () => { await call('restore', undoId); await refreshSkills(); showToast('Alteração desfeita.'); }); }; box.append(button); } box.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => box.classList.remove('visible'), 7000); }
async function action(fn) { try { await fn(); } catch (e) { showToast('Erro: ' + e.message); } }
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function copyButton(command) { const button = node('button', 'Copiar'); button.onclick = () => action(() => uiCommands.copyCommand(command, api.copyText, showToast)); return button; }
function commandBlock(skill, withExample = false) {
  const info = uiCommands.presentation(skill), block = node('div', undefined, skill.mode === 'Só manual' ? 'command-block' : 'command-hint');
  if (info.command) { block.append(node('code', info.command), copyButton(info.command)); if (withExample) block.append(node('p', info.example)); }
  else block.append(node('span', info.message));
  return block;
}
function showNotices(notices, startup = false) {
  const fresh = notices.filter(n => n.type === 'new');
  const other = notices.filter(n => n.type !== 'new');
  if (fresh.length) showToast(startup ? `${fresh.length} skills novas desde a última vez` : fresh.length === 1 ? fresh[0].message : `${fresh.length} skills novas detectadas`);
  else if (other.length) showToast(other[0].message);
}
async function refreshSkills(startup = false, incoming = []) { skills = await call('scan'); const notices = [...incoming, ...await call('notices')]; renderSkills(); showNotices(notices, startup); if (!$('guide').classList.contains('hidden')) renderGuide(); }
let updateSources = {}, updateChecks = {};
function updateStatus(message) { $('skillUpdateStatus').textContent = message; }
async function checkSkillUpdates() {
  updateSources = await call('skillUpdateSources'); updateChecks = {}; renderSkills();
  for (const name of Object.keys(updateSources)) {
    try { updateChecks[name] = await call('skillUpdateCheck', name); }
    catch (e) { updateChecks[name] = { error: e.message }; }
    renderSkills();
  }
}
async function updateSkill(name) {
  updateStatus('Atualizando ' + name + '…');
  try {
    let result = await call('skillUpdateRun', name, false);
    if (result.needsConfirmation) {
      const warning = result.reason === 'local-changes'
        ? `A skill ${name} foi modificada desde a instalação. Atualizar substituirá essas alterações. Um backup será mantido. Continuar?`
        : `O Maestro não registrou a versão original de ${name} quando ela foi instalada. Não é possível saber se há alterações locais. Atualizar substituirá os arquivos atuais; um backup será mantido. Continuar?`;
      if (!confirm(warning)) { updateStatus('Atualização de ' + name + ' cancelada.'); return; }
      result = await call('skillUpdateRun', name, true);
    }
    updateStatus(result.updated ? name + ' atualizada. Backup disponível no Histórico.' : name + ' já está atualizada.');
    await refreshSkills();
    if (updateSources[name]) updateChecks[name] = { available: false };
  } catch (e) { updateStatus('Erro ao atualizar ' + name + ': ' + e.message + ' A versão atual foi mantida.'); }
}
function renderSkills() {
  const cards = $('cards'); cards.replaceChildren(); const search = $('search').value.toLocaleLowerCase('pt-BR'), filter = $('filter').value, category = $('categoryFilter').value;
  const alerts = $('alerts'); alerts.replaceChildren(); for (const warning of skills.filter(s => s.ignored)) alerts.append(node('p', warning.error, 'alert'));
  for (const s of skills.filter(s => (!filter || s.mode === filter) && (!category || s.note?.categoria === category) && (s.name + s.description + (s.note?.paraQueServe || '')).toLocaleLowerCase('pt-BR').includes(search))) {
    const card = node('article', undefined, 'card');
    const top = node('div', undefined, 'card-top'); top.append(node('h2', s.name));
    if (s.missing) { top.append(node('span', s.note?.categoria || 'Outros', 'category-tag')); card.append(top,node('span', 'Não encontrada', 'missing-tag'), node('p', 'A pasta desta skill não está mais no local configurado. Sua anotação continua no catálogo.')); const removeEntry = node('button', 'Remover do catálogo'); removeEntry.onclick = () => action(async () => { if (!confirm(`Remover ${s.name} do catálogo?`)) return; await call('catalogRemove', s.name); await refreshSkills(); showToast('Entrada removida do catálogo.'); }); card.append(removeEntry); cards.append(card); continue; }
    if (s.error) { card.append(top,node('p', s.error)); cards.append(card); continue; }
    if (s.isNew) top.append(node('span', 'NOVA', 'new-tag'));
    if (updateChecks[s.name]?.available) top.append(node('span', 'Atualização disponível', 'update-tag'));
    top.append(node('span', s.note?.categoria || 'Outros', 'category-tag')); card.append(top);
    const primary = node('p', s.note?.paraQueServe || 'Sem anotação', 'card-summary');
    const original = node('p', s.description, 'card-original');
    const content = node('div', undefined, 'card-content'); content.append(primary);
    if (s.description.trim() !== (s.note?.paraQueServe || '').trim()) content.append(original);
    content.append(commandBlock(s)); card.append(content);
    const row = node('div', undefined, 'card-actions');
    const modeControl = node('div', undefined, 'mode-control');
    const trigger = node('button', s.mode, 'mode-trigger');
    const menu = node('div', undefined, 'mode-menu');
    menu.setAttribute('popover', 'manual');
    const modes = ['Automática', 'Só manual', 'Desligada'];
    const closeMenu = (restoreFocus = false) => {
      if (menu.matches(':popover-open')) menu.hidePopover();
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    };
    const options = modes.map(mode => {
      const option = node('button', mode, 'mode-option');
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(mode === s.mode));
      option.tabIndex = -1;
      option.onclick = () => action(async () => {
        closeMenu();
        if (mode === s.mode) return;
        const result = await call('mode', s.name, mode);
        await refreshSkills();
        showToast(result?.warning || 'Modo alterado com sucesso.', result?.backupId);
      });
      menu.append(option);
      return option;
    });
    const openMenu = (index = modes.indexOf(s.mode)) => {
      document.querySelectorAll('.mode-menu:popover-open').forEach(other => {
        other.hidePopover();
        other.parentElement.querySelector('.mode-trigger').setAttribute('aria-expanded', 'false');
      });
      const rect = modeControl.getBoundingClientRect();
      const menuHeight = 120;
      const top = rect.bottom + menuHeight + 8 <= window.innerHeight ? rect.bottom + 6 : Math.max(6, rect.top - menuHeight - 6);
      Object.assign(menu.style, { left: `${rect.left}px`, top: `${top}px`, width: `${rect.width}px` });
      menu.showPopover();
      trigger.setAttribute('aria-expanded', 'true');
      options[index].focus();
    };
    trigger.type = 'button';
    trigger.setAttribute('aria-label', `Modo da skill ${s.name}: ${s.mode}`);
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.onclick = () => menu.matches(':popover-open') ? closeMenu() : openMenu();
    trigger.onkeydown = event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        openMenu(event.key === 'End' ? options.length - 1 : event.key === 'Home' ? 0 : modes.indexOf(s.mode));
      }
    };
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', `Modo da skill ${s.name}`);
    menu.onkeydown = event => {
      const index = options.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
      else if (event.key === 'Tab') closeMenu();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next].focus();
      }
    };
    modeControl.onfocusout = event => { if (!modeControl.contains(event.relatedTarget)) closeMenu(); };
    modeControl.dataset.mode = s.mode;
    modeControl.append(node('span', '', 'status-dot'), trigger, menu);
    const details = node('button', 'Detalhes'); details.onclick = () => openDetails(s.name);
    row.append(modeControl, details);
    if (updateChecks[s.name]?.available) { const update = node('button', 'Atualizar', 'skill-update-button'); update.onclick = () => updateSkill(s.name); row.append(update); }
    if (s.isNew) { const seen = node('button', 'Marcar como vista', 'seen-action'); seen.onclick = () => action(async () => { await call('markSeen', s.name); await refreshSkills(); }); card.append(seen); }
    card.append(row);
    cards.append(card);
  }
  if (!cards.children.length) cards.append(node('p', 'Nenhuma skill encontrada.'));
}
async function openDetails(name) { await action(async () => { selected = await call('details', name); await refreshSkills(); const body = $('detailBody'); body.replaceChildren(); body.append(node('h1', selected.name), node('span', selected.mode, 'badge'), commandBlock(selected, true), node('h2', 'Descrição completa'), node('p', selected.description), node('h2', 'Pasta'), node('p', selected.folder, 'path'));
  const categoryLabel = node('label', 'Categoria'), categorySelect = node('select'); for (const value of ['Mobile','Web','Design','Banco de Dados','Segurança','Automação','Testes','IA','Outros']) { const option = node('option', value); option.value = value; categorySelect.append(option); } categorySelect.value = selected.note?.categoria || 'Outros'; categorySelect.onchange = () => action(async () => { await call('category', name, categorySelect.value); await refreshSkills(); showToast('Categoria salva.'); }); categoryLabel.append(categorySelect); body.append(categoryLabel);
  if (selected.plugin) body.append(node('p', 'Skill de plugin: o modo Só manual pode ser ignorado.'));
  const serve = node('textarea'); serve.rows = 3; serve.value = selected.note?.paraQueServe || ''; const when = node('textarea'); when.rows = 3; when.value = selected.note?.quandoUsar || '';
  const a = node('label', 'Para que serve'), b = node('label', 'Quando usar'); a.append(serve); b.append(when); body.append(a,b);
  const save = node('button', 'Salvar anotação', 'primary'); save.onclick = () => action(async () => { await call('note', name, { paraQueServe: serve.value, quandoUsar: when.value }); await refreshSkills(); showToast('Anotação salva.'); }); body.append(save);
  body.append(node('h2', 'Arquivos')); const list = node('ul'); for (const file of selected.files) list.append(node('li', file)); body.append(list,node('h2', 'Conteúdo do SKILL.md'),node('pre', selected.content));
  const remove = node('button', 'Mover para removidas'); remove.onclick = () => action(async () => { if (!confirm(`Mover ${name} para _removidas?`)) return; await call('remove', name); closeDetails(); await refreshSkills(); showToast('Skill movida para _removidas.'); }); body.append(remove);
  $('detail').classList.remove('hidden'); $('shade').classList.remove('hidden'); }); }
function closeDetails() { $('detail').classList.add('hidden'); $('shade').classList.add('hidden'); }
function renderGuide() { const list = $('guideList'); list.replaceChildren(); const manual = skills.filter(s => s.mode === 'Só manual'); for (const s of manual) { const row = node('article', undefined, 'row'), info = node('div'); info.append(node('strong', s.name), node('p', s.command)); if (s.plugin) info.append(node('small', 'Skill de plugin: pode ignorar o modo Só manual.')); row.append(info, copyButton(s.command)); list.append(row); } if (!manual.length) list.append(node('p', 'Nenhuma skill está em modo Só manual.')); $('copyAll').disabled = !manual.length; }
async function showProfiles() { const list = $('profileList'); list.replaceChildren(); const profiles = await call('profiles'); for (const name of Object.keys(profiles)) { const row = node('article', undefined, 'row'), info = node('div'), buttons = node('div', undefined, 'buttons'); info.append(node('h2', name),node('small', `${Object.keys(profiles[name]).length} skills`)); const apply = node('button','Pré-visualizar e aplicar'); apply.onclick = () => action(async () => { const changes = await call('profilePreview',name); const manual = await call('profileManualCommands',name); const message = changes.length ? changes.map(c => `${c.name}: ${c.from} → ${c.to}`).join('\n') : 'Nenhuma mudança necessária.'; const commands = manual.length ? manual.map(s => s.command).join('\n') : 'Nenhum comando manual.'; if (!confirm(`Perfil ${name}\n\nMudanças:\n${message}\n\nComandos manuais disponíveis depois de aplicar:\n${commands}\n\nAplicar?`)) return; await call('profileApply',name); await refreshSkills(); showToast('Perfil aplicado.'); }); const del = node('button','Excluir'); del.onclick = () => action(async () => { if (!confirm(`Excluir o perfil ${name}?`)) return; await call('profileDelete',name); await showProfiles(); showToast('Perfil excluído.'); }); buttons.append(apply,del); row.append(info,buttons); list.append(row); } if (!list.children.length) list.append(node('p','Nenhum perfil salvo.')); }
async function showHistory() { const list = $('historyList'); list.replaceChildren(); for (const item of await call('history')) { const row = node('article',undefined,'row'), info = node('div'); info.append(node('strong',item.skill || 'Maestro'),node('p',item.action),node('small',new Date(item.date).toLocaleString('pt-BR'))); row.append(info); if (item.backupId) { const restore = node('button','Restaurar backup'); restore.onclick = () => action(async () => { if (!confirm(`Restaurar backup de ${item.skill}?`)) return; await call('restore',item.backupId); await refreshSkills(); await showHistory(); showToast('Backup restaurado.'); }); row.append(restore); } list.append(row); } if (!list.children.length) list.append(node('p','Nenhuma alteração registrada.')); }
let aboutInfo;
function diagnostics(info) { return `Maestro ${info.version}\nBuild: ${info.builtAt || 'não informado'}\nPasta de skills: ${info.skillsPath}\nPasta de dados: ${info.dataPath}\nSkills lidas: ${info.skillCount}\nErros recentes:\n${info.recentErrors.length ? info.recentErrors.map(e => `${e.date}: ${e.message}`).join('\n') : 'Nenhum'}`; }
async function showSettings() { const [config, about] = await Promise.all([call('config'), call('about')]); aboutInfo = about; $('skillsPath').textContent = config.skillsPath; $('pathStatus').textContent = config.exists ? '✓ Pasta encontrada' : '⚠ Pasta não encontrada'; $('autostart').checked = config.autoStart; $('trustedDomains').value = (config.trustedDomains || []).join(', '); $('aboutVersion').textContent = about.version; $('footerVersion').textContent = `· v${about.version}`; $('buildDate').textContent = about.builtAt ? new Date(about.builtAt).toLocaleString('pt-BR') : 'Não informada'; $('dataPath').textContent = about.dataPath; $('releaseNews').textContent = about.news; }
let lastUpdatePhase;
function renderUpdate(state) {
  $('updateVersion').textContent = state.version;
  $('updateChecked').textContent = state.checkedAt ? new Date(state.checkedAt).toLocaleString('pt-BR') : 'Ainda não verificado';
  const status = { idle: 'Pronto para verificar.', checking: 'Verificando atualizações…', current: 'O MAESTRO está atualizado.', available: `Versão ${state.availableVersion} disponível.`, downloading: `Baixando versão ${state.availableVersion}: ${state.percent}%`, ready: `Versão ${state.availableVersion} pronta para instalar.`, error: `Falha na verificação: ${state.error}` };
  $('updateStatus').textContent = status[state.phase] || '';
  $('updateNotes').textContent = state.notes || '';
  $('updateNotes').classList.toggle('hidden', !state.notes || !['available', 'downloading', 'ready'].includes(state.phase));
  $('updateProgress').classList.toggle('hidden', state.phase !== 'downloading');
  $('updateProgress').value = state.percent;
  $('updateCheck').disabled = ['checking', 'downloading'].includes(state.phase);
  $('updateDownload').classList.toggle('hidden', state.phase !== 'available');
  $('updateInstall').classList.toggle('hidden', state.phase !== 'ready');
  if (state.phase === 'available' && lastUpdatePhase !== 'available') showToast(`MAESTRO ${state.availableVersion} disponível. ${state.notes || ''}`.slice(0, 300));
  lastUpdatePhase = state.phase;
}
api.onUpdateState(renderUpdate);
action(async () => renderUpdate(await call('updateState')));
$('updateCheck').onclick = () => action(() => call('updateCheck'));
$('updateDownload').onclick = () => action(() => call('updateDownload'));
$('updateInstall').onclick = () => action(() => call('updateInstall'));
document.querySelectorAll('nav button').forEach(button => button.onclick = () => action(async () => { document.querySelectorAll('nav button').forEach(b => b.classList.toggle('selected',b === button)); document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden',v.id !== button.dataset.view)); if (button.dataset.view === 'guide') renderGuide(); if (button.dataset.view === 'profiles') await showProfiles(); if (button.dataset.view === 'history') await showHistory(); if (button.dataset.view === 'settings') await showSettings(); }));
$('copyAll').onclick = () => action(() => uiCommands.copyCommand(skills.filter(s => s.mode === 'Só manual').map(s => s.command).join('\n'), api.copyText, showToast));
$('updateAllSkills').onclick = () => action(async () => { updateStatus('Verificando atualizações…'); await checkSkillUpdates(); const names = Object.keys(updateChecks).filter(name => updateChecks[name].available); if (!names.length) { const errors = Object.entries(updateChecks).filter(([, check]) => check.error); updateStatus(errors.length ? 'Não foi possível verificar ' + errors.map(([name]) => name).join(', ') + ': ' + errors[0][1].error : 'Nenhuma atualização disponível.'); return; } for (const name of names) await updateSkill(name); });
action(checkSkillUpdates);
$('search').oninput = renderSkills; $('filter').onchange = renderSkills; $('categoryFilter').onchange = renderSkills; $('refresh').onclick = () => action(async () => { await refreshSkills(); showToast('Lista atualizada.'); }); $('closeDetail').onclick = closeDetails; $('shade').onclick = closeDetails;
let addMode = 'create', installPlan = null, installRunning = false, installRequested = null;
function setAddMode(mode) { addMode = mode; installPlan = null; $('localFields').classList.toggle('hidden',mode === 'internet'); $('internetFields').classList.toggle('hidden',mode !== 'internet'); $('createFields').classList.toggle('hidden',mode !== 'create'); $('importHint').classList.toggle('hidden',mode !== 'import'); for (const [id, tab] of [['createTab','create'],['importTab','import'],['internetTab','internet']]) $(id).classList.toggle('active',mode === tab); $('confirmAdd').textContent = mode === 'internet' ? 'Ver comando' : 'Adicionar'; $('installPreview').classList.add('hidden'); }
async function renderRecentInstalls() { const list = $('recentInstalls'); list.replaceChildren(); for (const item of (await call('installHistory')).slice(0, 6)) { const row = node('div', undefined, 'recent-row'); const info = node('div'); info.append(node('strong', item.skill || 'Repositório completo'), node('small', `${item.url} · ${item.result}`)); const again = node('button', 'Instalar de novo / atualizar'); again.onclick = () => action(async () => { $('installLink').value = item.url; $('installSkill').value = item.skill; installPlan = null; await prepareInstall(); }); row.append(info,again); list.append(row); } if (!list.children.length) list.append(node('p','Nenhuma instalação recente.')); }
async function openAddDialog() { $('newName').value = ''; $('newDescription').value = ''; $('newInstructions').value = ''; $('pastedCommand').value = ''; $('installLink').value = ''; $('installSkill').value = ''; $('installLog').textContent = ''; $('installProgress').classList.add('hidden'); setAddMode('create'); const config = await call('config'); $('consentRow').classList.toggle('hidden',!!config.installConsent); $('installTrust').checked = false; await renderRecentInstalls(); $('addDialog').showModal(); }
function closeAddDialog() { if (installRunning) action(() => call('installCancel')); $('addDialog').close(); }
async function prepareInstall() { const input = { url: $('installLink').value.trim(), skill: $('installSkill').value.trim() }; installPlan = await call('installPreflight',input); installRequested = input; $('installCommand').textContent = installPlan.command; $('installPathWarning').textContent = (installPlan.mismatch ? `A instalação global ficará em ${installPlan.globalRoot}, diferente da pasta configurada no Maestro.` : `A skill será instalada em ${installPlan.globalRoot}.`) + (input.skill ? '' : ' Sem nome de skill, a CLI pode instalar várias skills do repositório.'); $('installPreview').classList.remove('hidden'); $('confirmAdd').textContent = 'Instalar'; }
$('addOpen').onclick = () => action(openAddDialog); $('createTab').onclick = () => setAddMode('create'); $('importTab').onclick = () => setAddMode('import'); $('internetTab').onclick = () => setAddMode('internet');
$('cancelAdd').onclick = closeAddDialog; $('closeAdd').onclick = closeAddDialog;
for (const id of ['installLink','installSkill']) $(id).oninput = () => { installPlan = null; $('installPreview').classList.add('hidden'); $('confirmAdd').textContent = 'Ver comando'; };
$('pastedCommand').onchange = () => action(async () => { if (!$('pastedCommand').value.trim()) return; const parsed = await call('installParse',$('pastedCommand').value); $('installLink').value = parsed.url; $('installSkill').value = parsed.skill; installPlan = null; $('installPreview').classList.add('hidden'); $('confirmAdd').textContent = 'Ver comando'; showToast('Comando preenchido. Confira os campos.'); });
$('pastedCommand').onpaste = () => setTimeout(() => $('pastedCommand').dispatchEvent(new Event('change')), 0);
$('confirmAdd').onclick = () => action(async () => {
  if (addMode !== 'internet') { const name = $('newName').value.trim(); if (!name) throw Error('Informe o nome da pasta.'); const done = addMode === 'import' ? await call('import',name) : await call('add',name,$('newDescription').value,$('newInstructions').value); if (done === false) return; closeAddDialog(); await refreshSkills(); showToast('Skill adicionada.'); return; }
  if (installRunning) return;
  if (!installPlan || installRequested.url !== $('installLink').value.trim() || installRequested.skill !== $('installSkill').value.trim()) { await prepareInstall(); return; }
  const config = await call('config');
  if (!config.installConsent) { if (!$('installTrust').checked) throw Error('Confirme o aviso sobre skills de terceiros antes de instalar.'); await call('installConsent'); $('consentRow').classList.add('hidden'); }
  installRunning = true; $('installProgress').classList.remove('hidden'); $('installStatus').textContent = 'Instalando...'; $('installStatus').classList.add('installing'); $('installLog').textContent = ''; $('confirmAdd').disabled = true;
  try { await call('installStart',installRequested); } catch (e) { installRunning = false; $('confirmAdd').disabled = false; throw e; }
});
api.onInstallEvent(event => action(async () => { if (event.type === 'log') { $('installLog').textContent += event.text; $('installLog').scrollTop = $('installLog').scrollHeight; } if (event.type === 'done') { installRunning = false; $('confirmAdd').disabled = false; $('installStatus').classList.remove('installing'); $('installStatus').textContent = event.result === 'Sucesso' ? 'Instalação concluída' : `Instalação: ${event.result}`; await renderRecentInstalls(); await refreshSkills(); if (event.result === 'Sucesso') { if (event.mismatch) showToast(`Instalou em ${event.globalRoot}, fora da pasta configurada.`); else { showToast('Skill instalada com sucesso.'); const name = event.detected[0] || installRequested?.skill; if (name && skills.some(s => s.name === name && s.mode)) { closeAddDialog(); await openDetails(name); } } } else showToast(event.result === 'Tempo esgotado' ? 'A instalação excedeu o tempo limite. Confira o log.' : `Instalação não concluída: ${event.error || event.result}. Confira o log.`); } }));
$('cancelInstall').onclick = () => action(async () => { await call('installCancel'); $('installStatus').textContent = 'Cancelando instalação...'; });
$('copyInstallLog').onclick = () => action(async () => { await api.copyText($('installLog').textContent); showToast('Log copiado!'); });
$('saveProfile').onclick = () => action(async () => { const name = prompt('Nome do novo perfil:'); if (!name) return; await call('profileSave',name.trim()); await showProfiles(); showToast('Perfil salvo.'); });
$('choosePath').onclick = () => action(async () => { const changed = await call('choosePath'); if (changed) { await showSettings(); await refreshSkills(); showToast('Pasta de skills atualizada.'); } });
$('autostart').onchange = () => action(async () => { await call('autostart',$('autostart').checked); showToast('Preferência salva.'); });
$('saveDomains').onclick = () => action(async () => { const domains = $('trustedDomains').value.split(',').map(x => x.trim()).filter(Boolean); await call('trustedDomains',domains); showToast('Domínios confiáveis salvos.'); });
$('copyDiagnostics').onclick = () => action(async () => { if (!aboutInfo) await showSettings(); await api.copyText(diagnostics(aboutInfo)); showToast('Informações de diagnóstico copiadas!'); });
api.onChanged(notices => action(() => refreshSkills(false, notices))); action(async () => { await refreshSkills(true); const about = await call('about'); $('footerVersion').textContent = `· v${about.version}`; });

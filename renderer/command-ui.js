// Textos e ação de cópia compartilhados pelos cards, detalhes e guia.
function presentation(skill) {
  if (skill.mode === 'Desligada') return { message: 'Desligada: não pode ser chamada até ser reativada' };
  if (skill.mode === 'Automática') return { message: `O Claude decide sozinho quando usar. Você também pode chamar com ${skill.command}` };
  return { command: skill.command, example: `No Claude Code, digite ${skill.command} e depois descreva o que quer. Ex.: ${skill.command} crie uma tabela de clientes` };
}
async function copyCommand(text, copyText, notify) {
  await copyText(text);
  notify('Comando copiado!');
}
const commandUi = { presentation, copyCommand };
if (typeof module !== 'undefined') module.exports = commandUi;
if (typeof window !== 'undefined') window.commandUi = commandUi;

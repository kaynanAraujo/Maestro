// O comando usa o name declarado pela skill; a pasta é o plano B.
function commandFor(title, folderName, plugin) {
  const name = typeof title === 'string' && title.trim() ? title.trim() : folderName;
  return `/${plugin ? 'plugin:' : ''}${name}`;
}
module.exports = { commandFor };

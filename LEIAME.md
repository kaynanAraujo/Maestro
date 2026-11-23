# Maestro para Windows

Aplicativo de janela própria para gerenciar suas skills do Claude Code. Não usa navegador nem servidor local.

## Instalar o programa

Abra o instalador versionado em `dist` (`Maestro-Setup-VERSÃO.exe`), siga o assistente e escolha a pasta de instalação. O instalador cria atalhos na área de trabalho e no menu Iniciar. Para remover, use **Aplicativos instalados** do Windows. Seus dados permanecem em `%APPDATA%\Maestro`.

Na primeira abertura, o catálogo atual é copiado para a pasta de dados. O programa gerencia `%USERPROFILE%\.claude\skills` por padrão; outra pasta pode ser escolhida em **Configurações**.

## Gerar o instalador a partir do código

1. Instale a versão LTS do Node.js para Windows: https://nodejs.org/ . Abra um novo PowerShell.
2. Entre na pasta onde você clonou ou extraiu o projeto.
3. Execute `npm.cmd ci`.
4. Execute `npm.cmd run dist`. O arquivo final ficará em `dist\Maestro-Setup-VERSÃO.exe`.

Para testar antes de empacotar: `npm.cmd test` e `npm.cmd start`.

## Uso

No painel, escolha o modo de cada skill. **Automática** permite que o Claude decida, **Só manual** exige `/nome-da-skill` e **Desligada** renomeia o `SKILL.md`. Abra **Detalhes** para editar suas anotações. Use **Perfis** para salvar conjuntos de modos e **Histórico** para restaurar backups. O Claude Code só lê mudanças em uma sessão nova.

Em **Só manual**, o card e a aba **Guia de comandos** mostram o comando de cada skill, com botão para copiar. A prévia de um perfil também lista os comandos que ficarão disponíveis.

Em **Adicionar skill → Instalar da internet**, cole um comando `npx skills add` ou preencha o link HTTPS do repositório e o nome opcional da skill. Confira a prévia e clique em **Instalar**. O Maestro instala globalmente para Claude Code, usa modo não interativo e copia os arquivos para a pasta de skills. O log e as instalações recentes aparecem na mesma janela. Instale apenas de fontes confiáveis. Para usar esta função, instale o Node.js em https://nodejs.org/.

O Maestro observa a pasta de skills, espera alguns segundos após mudanças e também faz uma verificação periódica. Skills novas recebem a etiqueta **NOVA** até você abrir os detalhes ou marcá-las como vistas. Pastas removidas por fora aparecem como **Não encontrada**, com opção de remover apenas a entrada do catálogo. Avisos de pastas incompletas aparecem no painel. As etiquetas e o catálogo são guardados em `%APPDATA%\Maestro`.

Para atualizar o aplicativo, feche o Maestro e execute o novo instalador versionado em `dist`. A instalação por cima é suficiente; não é necessário desinstalar. O catálogo, os perfis e os backups ficam em `%APPDATA%\Maestro` e permanecem após a atualização.

## Versões

O número segue `MAIOR.MENOR.CORREÇÃO`: aumente **CORREÇÃO** para corrigir um erro, **MENOR** para uma função nova e **MAIOR** para uma mudança incompatível. Antes de cada entrega, rode `npm.cmd version NOVA_VERSÃO --no-git-tag-version`, registre a versão em `NOVIDADES.md` e gere o instalador. O build recusa código alterado com o mesmo número de uma entrega anterior. Instaladores antigos vão para `dist\anteriores`.

Em **Configurações → Sobre o Maestro**, veja a versão, a data do build, a pasta de dados e as novidades. O botão de diagnóstico copia essas informações e os erros recentes. O formato dos dados fica em `%APPDATA%\Maestro\formato.json`; migrações fazem backup antes de atualizar.

O script antigo está em `legado\maestro.ps1` para consulta. O catálogo original permanece em `catalogo.json`; o aplicativo usa a cópia em `%APPDATA%\Maestro` após a migração.

## Ícone

O ícone é criado a partir de `assets\maestro.svg`. Para gerar novamente o PNG e o ICO, execute `npm.cmd run icon`; `npm.cmd run dist` também faz isso antes de construir o instalador.

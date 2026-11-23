param([Parameter(Position=0)][string]$Acao = '', [Parameter(Position=1)][string]$Alvo = '', [Parameter(Position=2)][string]$Valor = '', [string]$SkillsPath = (Join-Path $env:USERPROFILE '.claude\skills'))

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$catalogFile = Join-Path $base 'catalogo.json'
$profilesFile = Join-Path $base 'perfis.json'
$backupRoot = Join-Path $base '_backups'

function Fail($message) { throw $message }
function Backup($path) {
    if (!(Test-Path -LiteralPath $path)) { return }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $dir = Join-Path $backupRoot $stamp
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $name = Split-Path -Leaf $path
    Copy-Item -LiteralPath $path -Destination (Join-Path $dir $name) -Recurse -Force
}
function Save-Json($path, $data) {
    Backup $path
    $json = ConvertTo-Json -InputObject $data -Depth 20
    [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
}
function Load-Json($path) {
    if (!(Test-Path -LiteralPath $path)) { return @{} }
    $v = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $h = @{}
    foreach ($p in $v.PSObject.Properties) { $h[$p.Name] = $p.Value }
    return $h
}
function RootPath {
    if (!(Test-Path -LiteralPath $SkillsPath -PathType Container)) { Fail "Pasta de skills não encontrada: $SkillsPath" }
    return (Resolve-Path -LiteralPath $SkillsPath).ProviderPath.TrimEnd('\')
}
function SkillPath($name) {
    if ($name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' -or $name -eq '_removidas') { Fail 'Nome de skill inválido.' }
    $root = RootPath
    $path = Join-Path $root $name
    if (!(Test-Path -LiteralPath $path -PathType Container)) { Fail "Skill inexistente: $name" }
    $resolved = (Resolve-Path -LiteralPath $path).ProviderPath
    if (!$resolved.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { Fail 'Skill fora da pasta configurada.' }
    return $resolved
}
function Read-Skill($folder) {
    $on = Join-Path $folder 'SKILL.md'; $off = Join-Path $folder 'SKILL.md.disabled'
    if (Test-Path -LiteralPath $on) { $file = $on; $mode = 'Automática' }
    elseif (Test-Path -LiteralPath $off) { $file = $off; $mode = 'Desligada' }
    else { Fail "SKILL.md ausente em $folder" }
    $text = [System.IO.File]::ReadAllText($file)
    $match = [regex]::Match($text, '\A(?:\uFEFF)?---\r?\n(?<yaml>[\s\S]*?)\r?\n---(?=\r?\n|\z)')
    if (!$match.Success) { Fail "YAML inválido ou frontmatter ausente: $file" }
    $yaml = $match.Groups['yaml'].Value
    if ($yaml -notmatch '(?m)^name:\s*\S+' -or $yaml -notmatch '(?m)^description:\s*') { Fail "YAML inválido (name/description): $file" }
    $n = [regex]::Match($yaml, '(?m)^name:\s*(.+?)\s*$').Groups[1].Value.Trim('"', "'", ' ')
    $d = [regex]::Match($yaml, '(?ms)^description:\s*(.*?)(?=\r?\n[a-zA-Z][\w-]*:|\z)').Groups[1].Value
    $d = ($d -replace '(?m)^\s+', ' ' -replace '\s+', ' ').Trim(' ', '"', "'")
    if ($mode -ne 'Desligada' -and $yaml -match '(?m)^disable-model-invocation:\s*true\s*$') { $mode = 'Só manual' }
    $plugin = ($yaml -match '(?mi)^\s*(plugin|source):\s*.*plugin' -or $yaml -match '(?mi)^\s*author:\s*(vercel|supabase|plugin)' -or $folder -match '[\\/]plugins[\\/]')
    return [pscustomobject]@{ Name=$n; Folder=$folder; File=$file; Mode=$mode; Description=$d; Text=$text; Match=$match; Yaml=$yaml; Plugin=$plugin }
}
function All-Skills {
    $root = RootPath
    @(Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object { $_.Name -ne '_removidas' -and ((Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md')) -or (Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md.disabled'))) } | ForEach-Object { Read-Skill $_.FullName })
}
function Sync-Catalog {
    $cat = Load-Json $catalogFile; $changed = $false
    foreach ($s in (All-Skills)) {
        $key = Split-Path -Leaf $s.Folder
        if (!$cat.ContainsKey($key)) { $cat[$key] = @{ paraQueServe = $s.Description; quandoUsar = '' }; $changed = $true }
    }
    if ($changed) { Save-Json $catalogFile $cat }
    return $cat
}
function Get-One($name) { Read-Skill (SkillPath $name) }
function Set-Mode($name, $desired) {
    $s = Get-One $name
    switch ($desired.ToLowerInvariant()) {
        'automatica' { $target='Automática' }
        'automática' { $target='Automática' }
        'manual' { $target='Só manual' }
        'desligada' { $target='Desligada' }
        default { Fail 'Modo inválido. Use automatica, manual ou desligada.' }
    }
    if ($s.Mode -eq $target) { Write-Host 'A skill já está nesse modo.'; return }
    Backup $s.File
    if ($target -eq 'Desligada') { Rename-Item -LiteralPath $s.File -NewName 'SKILL.md.disabled'; return }
    $yaml = $s.Yaml
    if ($target -eq 'Só manual') {
        if ($yaml -match '(?m)^disable-model-invocation:') { $yaml = [regex]::Replace($yaml, '(?m)^disable-model-invocation:.*$', 'disable-model-invocation: true') }
        else { $yaml = $yaml.TrimEnd("`r", "`n") + "`r`ndisable-model-invocation: true" }
    } else { $yaml = [regex]::Replace($yaml, '(?m)^disable-model-invocation:.*\r?\n?', '') }
    $newText = $s.Text.Substring(0,$s.Match.Groups['yaml'].Index) + $yaml + $s.Text.Substring($s.Match.Groups['yaml'].Index + $s.Match.Groups['yaml'].Length)
    $targetFile = Join-Path $s.Folder 'SKILL.md'
    if ($s.Mode -eq 'Desligada') { Rename-Item -LiteralPath $s.File -NewName 'SKILL.md' }
    [System.IO.File]::WriteAllText($targetFile, $newText, (New-Object System.Text.UTF8Encoding($false)))
    if ($s.Plugin -and $target -eq 'Só manual') { Write-Warning 'Skill de plugin detectada: o plugin pode ignorar disable-model-invocation.' }
}
function Show-List {
    $cat = Sync-Catalog
    All-Skills | ForEach-Object { $key=Split-Path -Leaf $_.Folder; [pscustomobject]@{ Skill=$key; Modo=$_.Mode; Descrição=($_.Description.Substring(0,[Math]::Min(60,$_.Description.Length))); Anotação=$cat[$key].paraQueServe } } | Format-Table -Wrap -AutoSize
}
function Show-Detail($name) {
    $s=Get-One $name; $cat=Sync-Catalog; $key=Split-Path -Leaf $s.Folder
    Write-Host "`n$($s.Name) — $($s.Mode)" -ForegroundColor Cyan
    Write-Host "Descrição: $($s.Description)"; Write-Host "Pasta: $($s.Folder)"
    Write-Host "Para que serve: $($cat[$key].paraQueServe)"; Write-Host "Quando usar: $($cat[$key].quandoUsar)"
    Write-Host 'Arquivos:'; Get-ChildItem -LiteralPath $s.Folder -File -Recurse | ForEach-Object { Write-Host "  $($_.FullName.Substring($s.Folder.Length+1))" }
    if ($s.Plugin) { Write-Warning 'Skill de plugin: o modo Só manual pode ser ignorado pelo plugin.' }
}
function Edit-Note($name) {
    $null=Get-One $name; $cat=Sync-Catalog
    $a=Read-Host 'Para que serve (em suas palavras)'; $b=Read-Host 'Quando usar'
    $cat[$name]=@{paraQueServe=$a; quandoUsar=$b}; Save-Json $catalogFile $cat
}
function Add-Skill($name, $source) {
    $root=RootPath
    if ($name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' -or $name -eq '_removidas') { Fail 'Nome inválido.' }
    $dest=Join-Path $root $name
    if (Test-Path -LiteralPath $dest) { Fail 'Já existe uma pasta com esse nome.' }
    if ($source) {
        if (!(Test-Path -LiteralPath $source -PathType Container)) { Fail 'Pasta de origem não encontrada.' }
        $null=Read-Skill (Resolve-Path -LiteralPath $source).ProviderPath
        New-Item -ItemType Directory -Path $dest | Out-Null
        Backup $dest
        Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $dest -Recurse -Force
    } else {
        New-Item -ItemType Directory -Path $dest | Out-Null
        Backup $dest
        $body="---`r`nname: $name`r`ndescription: Descreva aqui a função desta skill.`r`n---`r`n`r`n# $name`r`n`r`nEscreva aqui as instruções para o Claude.`r`n"
        [System.IO.File]::WriteAllText((Join-Path $dest 'SKILL.md'),$body,(New-Object System.Text.UTF8Encoding($false)))
    }
    $null=Sync-Catalog
}
function Remove-Skill($name) {
    $path=SkillPath $name; $root=RootPath
    $answer=Read-Host "Mover '$name' para _removidas? Digite SIM para confirmar"
    if ($answer -cne 'SIM') { Write-Host 'Cancelado.'; return }
    Backup $path
    $removed=Join-Path $root '_removidas'; if (!(Test-Path -LiteralPath $removed)) { New-Item -ItemType Directory -Path $removed | Out-Null }
    $dest=Join-Path $removed ($name + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Move-Item -LiteralPath $path -Destination $dest
}
function Save-Profile($name) {
    if ($name -notmatch '^[a-zA-Z0-9_-]+$') { Fail 'Nome de perfil inválido.' }
    $profiles=Load-Json $profilesFile; $modes=@{}
    foreach ($s in (All-Skills)) { $modes[(Split-Path -Leaf $s.Folder)]=$s.Mode }
    $profiles[$name]=$modes; Save-Json $profilesFile $profiles
}
function Apply-Profile($name) {
    $profiles=Load-Json $profilesFile; if (!$profiles.ContainsKey($name)) { Fail 'Perfil inexistente.' }
    foreach ($p in $profiles[$name].PSObject.Properties) {
        $mode=switch ($p.Value) { 'Automática' {'automatica'} 'Só manual' {'manual'} 'Desligada' {'desligada'} }
        if (Test-Path -LiteralPath (Join-Path (RootPath) $p.Name)) { Set-Mode $p.Name $mode }
        else { Write-Warning "Skill do perfil não encontrada: $($p.Name)" }
    }
}
function Html($value) { [System.Net.WebUtility]::HtmlEncode([string]$value) }
function Make-Panel {
    $cat=Sync-Catalog; $rows=foreach ($s in (All-Skills)) {
        $key=Split-Path -Leaf $s.Folder
        $command = if ($s.Mode -eq 'Desligada') { 'Desligada: não pode ser chamada até ser reativada' } else { '/' + $s.Name }
        '<tr><td><strong>'+ (Html $key) +'</strong></td><td><span class="badge">'+(Html $s.Mode)+'</span></td><td>'+(Html $s.Description)+'</td><td>'+(Html $cat[$key].paraQueServe)+'</td><td>'+(Html $cat[$key].quandoUsar)+'</td><td>'+(Html $command)+'</td></tr>'
    }
    $html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maestro</title><style>body{font:16px Segoe UI,Arial;background:#101827;color:#eef3fa;margin:0}main{max-width:1200px;margin:50px auto;padding:24px}h1{font-size:3rem;letter-spacing:.15em;color:#e7b85c}p{color:#aebbd0}table{border-collapse:collapse;width:100%;background:#1b2940;border-radius:12px;overflow:hidden}th,td{text-align:left;padding:18px;border-bottom:1px solid #34445c;vertical-align:top}th{color:#e7b85c}.badge{background:#34445c;border-radius:20px;padding:6px 12px;white-space:nowrap}@media(max-width:700px){table{display:block;overflow-x:auto}}</style><main><h1>MAESTRO</h1><p>Seu catálogo de skills · gerado em '+(Html (Get-Date -Format 'dd/MM/yyyy HH:mm'))+'</p><table><thead><tr><th>Skill</th><th>Modo</th><th>Descrição</th><th>Para que serve</th><th>Quando usar</th><th>Como chamar</th></tr></thead><tbody>'+($rows -join '')+'</tbody></table></main></html>'
    $path=Join-Path $base 'painel.html'; Backup $path
    [System.IO.File]::WriteAllText($path,$html,(New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Painel gerado: $path" -ForegroundColor Green
}
function Menu {
    while ($true) {
        Clear-Host; Write-Host '        MAESTRO' -ForegroundColor Yellow
        Write-Host '1 Listar  2 Detalhes  3 Mudar modo  4 Anotação  5 Adicionar  6 Perfis  7 Gerar painel  8 Remover  0 Sair' -ForegroundColor Cyan
        $choice=Read-Host 'Escolha'
        try {
            switch ($choice) {
                '1' { Show-List }
                '2' { Show-Detail (Read-Host 'Nome da skill') }
                '3' { Set-Mode (Read-Host 'Nome da skill') (Read-Host 'Modo: automatica, manual ou desligada') }
                '4' { Edit-Note (Read-Host 'Nome da skill') }
                '5' { $n=Read-Host 'Nome da skill'; $src=Read-Host 'Pasta existente para copiar (Enter para criar modelo)'; Add-Skill $n $src }
                '6' { $op=Read-Host '1 Salvar perfil / 2 Aplicar perfil / 3 Listar perfis'; if($op -eq '1'){Save-Profile (Read-Host 'Nome do perfil')} elseif($op -eq '2'){Apply-Profile (Read-Host 'Nome do perfil')} else {(Load-Json $profilesFile).Keys} }
                '7' { Make-Panel }
                '8' { Remove-Skill (Read-Host 'Nome da skill') }
                '0' { return }
                default { Write-Host 'Opção inválida.' }
            }
        } catch { Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red }
        Read-Host 'Pressione Enter para continuar' | Out-Null
    }
}
try {
    switch ($Acao.ToLowerInvariant()) {
        '' { Menu }
        'listar' { Show-List }
        'detalhes' { Show-Detail $Alvo }
        'modo' { Set-Mode $Alvo $Valor }
        'anotacao' { Edit-Note $Alvo }
        'adicionar' { Add-Skill $Alvo $Valor }
        'remover' { Remove-Skill $Alvo }
        'painel' { Make-Panel }
        'perfil' { if($Alvo -eq 'salvar'){Save-Profile $Valor} elseif($Alvo -eq 'aplicar'){Apply-Profile $Valor} elseif($Alvo -eq 'listar'){(Load-Json $profilesFile).Keys} else {Fail 'Use perfil salvar|aplicar|listar.'} }
        default { Fail 'Comando desconhecido.' }
    }
} catch { Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

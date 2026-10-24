param([switch]$PrepareOnly,[switch]$ResolveOnly)
$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$package = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if (-not $package) { throw 'Installed Codex package not found.' }
$appRoot = Join-Path $package.InstallLocation 'app'
$resources = Join-Path $appRoot 'resources'
$appExe = Join-Path $appRoot 'ChatGPT.exe'
$bundledCli = Join-Path $resources 'codex.exe'
$nativeTools = Join-Path $resources 'plugins\openai-bundled\plugins\codex-app-tools\server.mjs'
foreach ($required in @($appExe,$bundledCli,$nativeTools)) { if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required installed component missing: $required" } }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$cliHash = (Get-FileHash -LiteralPath $bundledCli -Algorithm SHA256).Hash
$runtimeBase = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
$stockCli = $null
if (Test-Path -LiteralPath $runtimeBase) {
 foreach ($folder in (Get-ChildItem -LiteralPath $runtimeBase -Directory)) {
  $candidate = Join-Path $folder.FullName 'codex.exe'
  if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -eq $cliHash) { $stockCli = $candidate; break }
 }
}
# Prefer the exact current registered core. Resolve again on every launch after updates.
if (-not $stockCli) { $stockCli = $bundledCli }
$resolved = @{cli=$stockCli;resources=$resources;node=$nodePath;packageVersion=[string]$package.Version;cliSha256=$cliHash}
if ($ResolveOnly) { $resolved | ConvertTo-Json -Compress; exit 0 }
$configPath = Join-Path $bundleRoot 'runtime-config.json'
if (Test-Path -LiteralPath $configPath) { Copy-Item -LiteralPath $configPath -Destination ($configPath+'.previous') -Force }
$resolved | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
if ($PrepareOnly) { Write-Output "Prepared for installed Codex $($package.Version)."; exit 0 }
$active = Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath,$appExe,[StringComparison]::OrdinalIgnoreCase) }
if ($active) { throw 'Codex is already running. Close it normally after your work is saved, then use this launcher. No process was stopped.' }
$previousOverride = $env:CODEX_CLI_PATH
try {
 $env:CODEX_CLI_PATH = Join-Path $bundleRoot 'codex-live-viewer.exe'
 Start-Process -FilePath $appExe -WindowStyle Hidden
} finally { $env:CODEX_CLI_PATH = $previousOverride }

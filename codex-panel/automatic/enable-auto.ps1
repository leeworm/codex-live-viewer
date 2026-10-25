param([switch]$Check,[switch]$Disable,[switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$variableName = 'CODEX_CLI_PATH'
$bundleRoot = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $bundleRoot 'BUILD.json') -Raw | ConvertFrom-Json
$installRoot = $bundleRoot
$statePath = Join-Path $installRoot 'AUTO-STATE.json'
$shimPath = Join-Path $installRoot 'codex-live-viewer.exe'
$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
$localMarketplaceName = (Get-Content -LiteralPath (Join-Path $bundleRoot 'marketplace.json') -Raw | ConvertFrom-Json).name
$pluginSelector = 'codex-live-viewer@'+$localMarketplaceName
$codexPluginRoot = Join-Path $userHome ('.codex\plugins\cache\'+$localMarketplaceName+'\codex-live-viewer\'+$manifest.version)
$personalMarketplacePath = Join-Path $userHome '.agents\plugins\marketplace.json'
function Initialize-EnvironmentApi {
 if (-not ('LiveViewerEnvironmentBroadcast' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LiveViewerEnvironmentBroadcast {
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,UIntPtr w,string l,uint flags,uint timeout,out UIntPtr result);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("userenv.dll",SetLastError=true)] static extern bool CreateEnvironmentBlock(out IntPtr block,IntPtr token,bool inherit);
 [DllImport("userenv.dll")] static extern bool DestroyEnvironmentBlock(IntPtr block);
 public static string FreshValue(string name) {
  IntPtr token=IntPtr.Zero,block=IntPtr.Zero;
  try {
   if(!OpenProcessToken(GetCurrentProcess(),8,out token)||!CreateEnvironmentBlock(out block,token,false))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
   IntPtr item=block;
   for(int n=0;n<65536;n++){string value=Marshal.PtrToStringUni(item);if(String.IsNullOrEmpty(value))return null;if(value.StartsWith(name+"=",StringComparison.OrdinalIgnoreCase))return value.Substring(name.Length+1);item=IntPtr.Add(item,(value.Length+1)*2);}
   throw new InvalidOperationException("Environment block exceeded limit");
  } finally {if(block!=IntPtr.Zero)DestroyEnvironmentBlock(block);if(token!=IntPtr.Zero)CloseHandle(token);}
 }
}
'@
 }
}
function Broadcast-Environment {
 Initialize-EnvironmentApi
 $reply = [UIntPtr]::Zero
 return [LiveViewerEnvironmentBroadcast]::SendMessageTimeout([IntPtr]0xffff,0x1a,[UIntPtr]::Zero,'Environment',2,500,[ref]$reply) -ne [IntPtr]::Zero
}
function Get-StockPluginCli {
 $package = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
 if (-not $package) { throw 'Installed Codex package not found.' }
 $cli = Join-Path $package.InstallLocation 'app\resources\codex.exe'
 if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'Stock Codex CLI not found.' }
 return $cli
}
function Register-PersonalPlugin {
 $cli = Get-StockPluginCli
 & $cli plugin marketplace add $installRoot --json | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Local marketplace registration failed. Existing settings were preserved.' }
 & $cli plugin add $pluginSelector --json | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Native plugin installation failed.' }
 & (Get-Command node.exe -ErrorAction Stop).Source (Join-Path $installRoot 'configure-transport.cjs') --enable | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Live Viewer transport registration failed.' }
}
function Unregister-PersonalPlugin($previousMarketplaceText) {
 & (Get-Command node.exe -ErrorAction Stop).Source (Join-Path $installRoot 'configure-transport.cjs') --disable | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Live Viewer transport disable failed.' }
 $cli = Get-StockPluginCli
 & $cli plugin remove $pluginSelector --json | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Native plugin removal failed.' }
}
if ($Check) {
 $current = [Environment]::GetEnvironmentVariable($variableName,'User')
 Initialize-EnvironmentApi
 @{registered=($current -eq $shimPath);freshWindowsEnvironment=([LiveViewerEnvironmentBroadcast]::FreshValue($variableName) -eq $shimPath);override=$current;installRoot=$installRoot;pluginRoot=$codexPluginRoot;pluginInstalled=(Test-Path -LiteralPath $codexPluginRoot);marketplacePresent=(Test-Path -LiteralPath (Join-Path $installRoot 'marketplace.json'));mode='plugin';statePresent=(Test-Path -LiteralPath $statePath);appliesTo='new app processes; running app unchanged'} | ConvertTo-Json -Compress
 exit 0
}
if ($Disable) {
 if (-not (Test-Path -LiteralPath $statePath)) { throw 'No owned auto-connection state.' }
 $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
 if ($state.shim -ne $shimPath -or [Environment]::GetEnvironmentVariable($variableName,'User') -ne $shimPath) { throw 'Override ownership changed. No setting was changed.' }
 [Environment]::SetEnvironmentVariable($variableName,$state.previousUserValue,'User')
 if ($state.PSObject.Properties['previousMarketplaceText']) {
  Unregister-PersonalPlugin $state.previousMarketplaceText
 }
 $state.enabled=$false
 $state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
 $sent = Broadcast-Environment
 @{disabled=$true;restoredPreviousValue=$true;pluginRemoved=$true;broadcastSent=$sent;appRestarted=$false} | ConvertTo-Json -Compress
 exit 0
}
$previousUserValue = [Environment]::GetEnvironmentVariable($variableName,'User')
if ($previousUserValue -eq $shimPath -and (Test-Path -LiteralPath $statePath)) {
 Register-PersonalPlugin
 @{enabled=$true;alreadyRegistered=$true;mode='plugin';installRoot=$installRoot;pluginRoot=$codexPluginRoot;appRestarted=$false} | ConvertTo-Json -Compress
 exit 0
}
if (-not [string]::IsNullOrEmpty($previousUserValue)) {
 $managedBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'CoS-Live-Viewer\codex'))+[IO.Path]::DirectorySeparatorChar
 $previousRoot = [IO.Path]::GetDirectoryName($previousUserValue)
 if (-not [IO.Path]::GetFullPath($previousUserValue).StartsWith($managedBase,[StringComparison]::OrdinalIgnoreCase)) { throw 'Another user CLI override is configured; preserved.' }
 $previousStatePath = Join-Path $previousRoot 'AUTO-STATE.json'
 $previousManifestPath = Join-Path $previousRoot 'BUILD.json'
 if (-not ((Test-Path -LiteralPath $previousStatePath) -and (Test-Path -LiteralPath $previousManifestPath))) { throw 'Previous override has no owned state; preserved.' }
 $previousState = Get-Content -LiteralPath $previousStatePath -Raw | ConvertFrom-Json
 $previousManifest = Get-Content -LiteralPath $previousManifestPath -Raw | ConvertFrom-Json
 $previousBinary = $previousManifest.files | Where-Object path -eq 'codex-live-viewer.exe'
 if ($previousState.shim -ne $previousUserValue -or -not $previousBinary -or (Get-FileHash -LiteralPath $previousUserValue -Algorithm SHA256).Hash.ToLower() -ne $previousBinary.sha256) { throw 'Previous override ownership or digest differs; preserved.' }
}
$reuse = $false
if (Test-Path -LiteralPath $installRoot) {
 if (-not (Test-Path -LiteralPath $statePath)) { throw 'Install target already exists. It was preserved.' }
 $ownedState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
 if ($ownedState.shim -ne $shimPath -or $ownedState.version -ne $manifest.version) { throw 'Install target ownership differs.' }
 foreach ($file in $manifest.files) { if ((Get-FileHash -LiteralPath (Join-Path $installRoot $file.path) -Algorithm SHA256).Hash.ToLower() -ne $file.sha256) { throw 'Owned installation differs; preserved.' } }
 $reuse = $true
}
foreach ($file in $manifest.files) {
 $absolute = [IO.Path]::GetFullPath((Join-Path $bundleRoot $file.path))
 if (-not $absolute.StartsWith([IO.Path]::GetFullPath($bundleRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid bundle member path.' }
 if ((Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLower() -ne $file.sha256) { throw ('Bundle hash mismatch: '+$file.path) }
}
if (-not $reuse) {
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
foreach ($file in $manifest.files) {
 $destination = Join-Path $installRoot $file.path
 New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $bundleRoot $file.path) -Destination $destination
}
Copy-Item -LiteralPath (Join-Path $bundleRoot 'BUILD.json') -Destination (Join-Path $installRoot 'BUILD.json')
}
$resolvedText = & (Join-Path $installRoot 'launch.ps1') -ResolveOnly
$resolved = $resolvedText | ConvertFrom-Json
$resolved | Add-Member -NotePropertyName autoResolve -NotePropertyValue $true
$resolved | Add-Member -NotePropertyName mode -NotePropertyValue ($(if ($OpenBrowser) { 'browser' } else { 'plugin' }))
$resolved | Add-Member -NotePropertyName openBrowser -NotePropertyValue ([bool]$OpenBrowser)
$resolved | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installRoot 'runtime-config.json') -Encoding UTF8
$actualVersion = & $shimPath --version
if ($LASTEXITCODE -ne 0 -or $actualVersion -notmatch '^codex-cli ') { throw 'Installed connection preflight failed. User setting was not changed.' }
$previousMarketplaceText = if (Test-Path -LiteralPath $personalMarketplacePath) { Get-Content -LiteralPath $personalMarketplacePath -Raw } else { '' }
$state = @{version=$manifest.version;enabled=$false;mode=($(if ($OpenBrowser) { 'browser' } else { 'plugin' }));shim=$shimPath;previousUserValue=$previousUserValue;previousMarketplaceText=$previousMarketplaceText;registeredAt=[DateTime]::UtcNow.ToString('o');appRestarted=$false}
$state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
if ([Environment]::GetEnvironmentVariable($variableName,'User') -ne $previousUserValue) { throw 'User override changed during preflight. No setting was overwritten.' }
[Environment]::SetEnvironmentVariable($variableName,$shimPath,'User')
Initialize-EnvironmentApi
if ([LiveViewerEnvironmentBroadcast]::FreshValue($variableName) -ne $shimPath) {
 [Environment]::SetEnvironmentVariable($variableName,$previousUserValue,'User')
 throw 'Fresh Windows environment did not reflect the setting. Previous value restored.'
}
Register-PersonalPlugin
$state.enabled=$true
$state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
$sent = Broadcast-Environment
@{enabled=$true;mode=($(if ($OpenBrowser) { 'browser' } else { 'plugin' }));installRoot=$installRoot;pluginRoot=$codexPluginRoot;marketplace=(Join-Path $installRoot 'marketplace.json');override=[Environment]::GetEnvironmentVariable($variableName,'User');broadcastSent=$sent;freshWindowsEnvironment=$true;appRestarted=$false;cliVersion=[string]$actualVersion} | ConvertTo-Json -Compress

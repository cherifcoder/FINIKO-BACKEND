# Fix Windows : embarque un manifest "longPathAware" dans les binaires du
# SDK/NDK Android pour autoriser les chemins > 260 caracteres.
#
# Voir docs/windows-build-long-paths.md pour le contexte complet.
#
# Usage (PowerShell administrateur non requis, mais LongPathsEnabled=1 doit
# etre defini au prealable) :
#   powershell -ExecutionPolicy Bypass -File scripts/fix-windows-longpaths.ps1

$ErrorActionPreference = 'Stop'

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$cmakeBin = Join-Path $sdk 'cmake\3.22.1\bin'
$ndkRoot = Get-ChildItem (Join-Path $sdk 'ndk') -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
$ndkBin = if ($ndkRoot) { Join-Path $ndkRoot.FullName 'toolchains\llvm\prebuilt\windows-x86_64\bin' } else { $null }

if (-not (Test-Path $cmakeBin)) { Write-Error "SDK introuvable : $cmakeBin" }
if (-not $ndkBin -or -not (Test-Path $ndkBin)) { Write-Error "NDK introuvable sous $sdk\ndk" }

Write-Host "SDK cmake : $cmakeBin"
Write-Host "NDK       : $ndkBin"

$manifest = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="Finiko.Tool" version="1.0.0.0"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
  <asmv3:application xmlns:asmv3="urn:schemas-microsoft-com:asm.v3">
    <asmv3:windowsSettings>
      <longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware>
    </asmv3:windowsSettings>
  </asmv3:application>
</assembly>
'@

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ManifestPatcher {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);
}
'@

$targets = @(
  "$cmakeBin\cmake.exe",
  "$ndkBin\clang.exe",
  "$ndkBin\clang++.exe",
  "$ndkBin\ld.lld.exe",
  "$ndkBin\lld.exe",
  "$ndkBin\llvm-ar.exe",
  "$ndkBin\llvm-ranlib.exe",
  "$ndkBin\llvm-lib.exe",
  "$ndkBin\llvm-strip.exe"
) | Where-Object { Test-Path $_ }

$data = [System.Text.Encoding]::UTF8.GetBytes($manifest)

foreach ($exe in $targets) {
  $name = Split-Path $exe -Leaf
  $bak = "$exe.lp.bak"

  $bytes = [System.IO.File]::ReadAllBytes($exe)
  if ([System.Text.Encoding]::ASCII.GetString($bytes).Contains('longPathAware')) {
    Write-Host "$name : deja patche, ignore"
    continue
  }

  if (-not (Test-Path $bak)) { Copy-Item $exe $bak -Force }
  else { Copy-Item $bak $exe -Force }  # repart toujours de l'original

  $h = [ManifestPatcher]::BeginUpdateResource($exe, $false)
  if ($h -eq [IntPtr]::Zero) {
    Write-Warning "$name : ECHEC BeginUpdateResource ($([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
    continue
  }
  $ok = [ManifestPatcher]::UpdateResource($h, [IntPtr]24, [IntPtr]1, 0, $data, [uint32]$data.Length)
  if (-not $ok) { [void][ManifestPatcher]::EndUpdateResource($h, $true); Write-Warning "$name : ECHEC UpdateResource"; continue }
  if (-not [ManifestPatcher]::EndUpdateResource($h, $false)) { Write-Warning "$name : ECHEC EndUpdateResource"; continue }

  $check = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($exe)).Contains('longPathAware')
  Write-Host "$name : patche OK (verification=$check, sauvegarde : $name.lp.bak)"
}

Write-Host ''
Write-Host 'Rappel : le ninja du SDK doit AUSSI etre remplace par une build officielle >= 1.11 :'
Write-Host '  curl.exe -sL -o ninja-win.zip https://github.com/ninja-build/ninja/releases/latest/download/ninja-win.zip'
Write-Host "  puis remplacer $cmakeBin\ninja.exe (voir docs/windows-build-long-paths.md)"

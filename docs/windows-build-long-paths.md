# Fix Windows : échec du build natif sur des chemins > 260 caractères

## Symptôme

Le build Android (`npx expo run:android`) échoue pendant la compilation C++
des modules natifs avec une erreur ninja du type :

```
ninja: error: mkdir(rngesturehandler_codegen_autolinked_build/CMakeFiles/
react_codegen_rngesturehandler_codegen.dir/C_/.../rngesturehandler_codegen):
No such file or directory
```

ou :

```
ninja: error: Stat(...): Filename longer than 260 characters
```

## Cause

Le codegen de React Native (gesture-handler, screens…) produit des chemins
d'objets de ~300 caractères : `.cxx/Debug/<hash>/arm64-v8a/<target>_autolinked_build/
CMakeFiles/<target>.dir/C_/<chemin absolu du module>/…`. Aucun
raccourcissement du dossier projet ne suffit.

Windows 10/11 accepte les chemins longs si **les deux** conditions sont
remplies :

1. registre `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1` ;
2. **chaque exécutable** déclare `<longPathAware>true</longPathAware>` dans son
   manifest embarqué.

Les binaires livrés avec le SDK Android (cmake 3.22.1) et le NDK 27
(ninja, clang, ld.lld, llvm-ar…) **ne déclarent pas** ce flag, et le ninja
1.10.2 du SDK a de surcroît une limite `MAX_PATH` codée en dur.

## Correctif (une fois par machine / par mise à jour du SDK)

1. **Activer les long paths** (PowerShell **administrateur**) :

   ```powershell
   Set-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem `
     -Name LongPathsEnabled -Value 1 -Type DWord
   ```

2. **Remplacer le ninja du SDK** par une build officielle ≥ 1.11 (support
   natif `\\?\`) :

   ```powershell
   curl.exe -sL -o ninja-win.zip `
     https://github.com/ninja-build/ninja/releases/latest/download/ninja-win.zip
   Expand-Archive ninja-win.zip -DestinationPath ninja-new
   Copy-Item ninja-new\ninja.exe "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin\ninja.exe" -Force
   ```

3. **Patcher le manifest `longPathAware`** des outils du NDK (sauvegarde
   automatique en `*.lp.bak`) :

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/fix-windows-longpaths.ps1
   ```

   Le script embarque un manifest minimal dans : `clang.exe`, `clang++.exe`,
   `ld.lld.exe`, `lld.exe`, `llvm-ar.exe`, `llvm-ranlib.exe`, `llvm-lib.exe`,
   `llvm-strip.exe` (NDK) et `cmake.exe` (SDK). Les originaux sont conservés
   en `*.lp.bak` : restaurer par `Copy-Item outil.exe.lp.bak outil.exe`.

## Vérification

```powershell
# un dossier de 315 caractères doit être créé sans erreur
$dir = "$env:TEMP\nt"; New-Item -ItemType Directory -Force $dir | Out-Null
$rel = ('d'*60) + '\' + ('e'*90) + '\' + ('f'*110) + '\out.txt'
Set-Content "$dir\build.ninja" "rule t`n  command = cmd /c echo ok`nbuild $rel : t`n"
& "$env:LOCALAPPDATA\Android\Sdk\cmake\3.22.1\bin\ninja.exe" -C $dir
```

## Remarques

- Les chemins de projet restent de préférence courts (`C:\dev\F2` plutôt que
  `C:\Users\<user>\Documents\Dev\2026_10_21___FINIKO v2`) : cela réduit la
  longueur totale, mais ne résout pas à lui seul le problème du codegen.
- Après une mise à jour du SDK/NDK via Android Studio, les binaires neufs
  n'ont plus le patch : relancer le script de l'étape 3 (et vérifier que le
  ninja officiel n'a pas été écrasé par celui du SDK).

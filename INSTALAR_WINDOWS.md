# Instalar el proyecto en Windows (PC recién formateado)

Guía para dejar el proyecto compilando y corriendo desde cero en Windows 10 u 11.
Todos los comandos se copian y pegan en **PowerShell**.

> ⚠️ **No hagas esto en el PC de la iglesia durante un servicio.** ProPresenter sigue siendo el respaldo.

---

## 1. Instalar los programas

1. Abre **PowerShell como administrador**: clic derecho en el menú Inicio → **Terminal (Administrador)**.
2. Instala **Git**:
   ```powershell
   winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
   ```
3. Instala **Node.js 22 LTS** (la versión recomendada):
   ```powershell
   winget install --id OpenJS.NodeJS.22 -e --source winget --accept-package-agreements --accept-source-agreements
   ```
   > También funciona con Node 26, pero su npm bloquea algunos pasos automáticos y obliga a hacer las correcciones del punto 3. Con Node 22 normalmente no hacen falta.
4. Instala **Python 3.12**:
   ```powershell
   winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
   ```
5. Instala **Visual Studio Build Tools 2022**, que trae el compilador C++ y el Windows SDK (unos 5 GB, entre 10 y 30 minutos):
   ```powershell
   winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```
6. **Reinicia el PC.**
7. Después de reiniciar, abre PowerShell (normal, no como administrador) e instala **setuptools** para Python:
   ```powershell
   py -3.12 -m pip install --upgrade setuptools
   ```
8. *(Solo si vas a usar la DeckLink en este PC)* Instala **Blackmagic Desktop Video** (el driver de la tarjeta) desde https://www.blackmagicdesign.com/support → "Desktop Video". **Anota antes la configuración actual de la tarjeta.**

---

## 2. Descargar el proyecto y arrancarlo

1. Crea la carpeta y clona el fork:
   ```powershell
   New-Item -ItemType Directory -Force C:\proyectos; cd C:\proyectos; git clone https://github.com/comunicacionescfcsincelejo-arch/FreeShow.git; cd FreeShow
   ```
2. Instala las dependencias (tarda unos 3 a 5 minutos):
   ```powershell
   npm install
   ```
   Los avisos amarillos `npm warn` son normales. Solo importa que **no** termine con `npm error`.
3. Arranca el programa:
   ```powershell
   npm start
   ```
   Espera entre 20 y 40 segundos. Se abre FreeShow, y al lado una ventana de herramientas de desarrollo que puedes cerrar.
4. Para cerrarlo, cierra la ventana de FreeShow y en PowerShell presiona `Ctrl + C`.

---

## 3. Correcciones a mano (solo si hacen falta)

Hazlas con PowerShell dentro de `C:\proyectos\FreeShow` y **después** de `npm install`.
Repítelas cada vez que borres `node_modules` o vuelvas a ejecutar `npm install`.

### 3.1 Electron no arranca

**Síntoma:** `npm start` falla con un error parecido a `Electron failed to install correctly`.
**Causa:** npm no dejó correr el paso que descarga Electron.

```powershell
cd C:\proyectos\FreeShow; node node_modules\electron\install.js
```

### 3.2 Aparece "OPUS not found!"

**Síntoma:** al arrancar, la consola muestra `OPUS not found!`. Sin esto, el audio no sale por las salidas (tampoco por la Blackmagic).
**Causa:** el módulo de audio Opus quedó compilado para Node y no para Electron.

```powershell
cd C:\proyectos\FreeShow\node_modules\@discordjs\opus; ..\..\.bin\node-pre-gyp rebuild --runtime=electron --target=45.1.0 --dist-url=https://electronjs.org/headers; cd C:\proyectos\FreeShow
```

> Si en el futuro FreeShow cambia de versión de Electron, cambia `45.1.0` por la nueva versión. La ves con:
> ```powershell
> cd C:\proyectos\FreeShow; npx electron --version
> ```

---

## 4. Comprobar que todo quedó bien

1. **Herramientas instaladas.** Pega esto:
   ```powershell
   node -v; npm -v; git --version; py -3.12 --version; py -3.12 -c "import setuptools; print('setuptools OK')"; Test-Path "C:\Program Files (x86)\Windows Kits\10"; & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -products * -property displayName
   ```
   Debes ver: una versión de Node que empiece por `v22`, versiones de npm y Git, `Python 3.12.x`, `setuptools OK`, `True` y `Visual Studio Build Tools 2022`.

2. **Electron descargado.** Pega esto:
   ```powershell
   cd C:\proyectos\FreeShow; Test-Path node_modules\electron\dist\electron.exe
   ```
   Debe decir `True`.

3. **Opus funcionando dentro de Electron.** Pega esto:
   ```powershell
   cd C:\proyectos\FreeShow; $env:ELECTRON_RUN_AS_NODE=1; .\node_modules\electron\dist\electron.exe -e "const {OpusEncoder}=require('@discordjs/opus'); new OpusEncoder(48000,2); console.log('Opus OK')"; Remove-Item Env:ELECTRON_RUN_AS_NODE
   ```
   Debe decir `Opus OK`.

4. **Piezas de DeckLink y NDI compiladas.** Pega esto:
   ```powershell
   cd C:\proyectos\FreeShow; Test-Path node_modules\macadam\build\Release\macadam.node; Test-Path node_modules\grandiose\build\Release\grandiose.node
   ```
   Debe decir `True` dos veces.

5. **El programa arranca.** Ejecuta `npm start`. En la consola deben aparecer estas líneas:
   ```
   REMOTE on: 5510
   STAGE on: 5511
   ```
   Y **no** debe aparecer `OPUS not found!`.

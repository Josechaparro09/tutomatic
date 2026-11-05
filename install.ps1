# Instalador de Tutomatic para Windows.
#   Dentro de la carpeta clonada:  doble clic en install.cmd   (o: powershell -ExecutionPolicy Bypass -File install.ps1)
#   Sin clonar todavía:             powershell -ExecutionPolicy Bypass -File install.ps1 -Dir "C:\ruta\destino"
param(
  [string]$Dir = "$env:USERPROFILE\tutomatic",
  [string]$Repo = "https://github.com/Josechaparro09/tutomatic.git",
  [switch]$NoSetup
)
$ErrorActionPreference = "Stop"
function Step($t) { Write-Host "`n▸ $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "✔ $t" -ForegroundColor Green }
function Warn($t) { Write-Host "! $t" -ForegroundColor Yellow }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Winget-Install($id, $name) {
  if (-not (Has winget)) { throw "Falta $name y no tengo winget para instalarlo. Instálalo a mano y vuelve a correr este instalador." }
  Step "Instalando $name…"
  winget install --id $id -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
}

Write-Host "Tutomatic · instalador" -ForegroundColor White

# 1. Node 22+
$needNode = $true
if (Has node) { $v = [int]((node -v).TrimStart('v').Split('.')[0]); if ($v -ge 22) { $needNode = $false; Ok "Node $(node -v)" } else { Warn "Tienes Node $(node -v); hace falta 22 o superior" } }
if ($needNode) { Winget-Install "OpenJS.NodeJS.LTS" "Node.js"; if (-not (Has node)) { throw "Node se instaló pero esta ventana no lo ve. Cierra la terminal, ábrela de nuevo y vuelve a correr el instalador." } }

# 2. Git
if (-not (Has git)) { Winget-Install "Git.Git" "Git" } else { Ok "Git $((git --version) -replace 'git version ','')" }

# 3. Código (si este script no está ya dentro de la carpeta clonada)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path (Join-Path $here "bin\tutomatic.js")) { $Dir = $here }
elseif (Test-Path (Join-Path $Dir "bin\tutomatic.js")) { Step "Ya existe $Dir; la actualizo"; git -C $Dir pull --ff-only }
else { Step "Descargando Tutomatic en $Dir…"; git clone $Repo $Dir }
Set-Location $Dir

# 4. Dependencias y comando global `tutomatic`
Step "Instalando dependencias (puede tardar unos minutos la primera vez)…"
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { throw "npm install falló" }
Step "Registrando el comando tutomatic…"
npm link --no-fund --no-audit | Out-Null
Refresh-Path
if (Has tutomatic) { Ok "Comando tutomatic listo" } else { Warn "No se registró el comando global; usa: node `"$Dir\bin\tutomatic.js`" <comando>" }

# 5. Asistente de configuración
if (-not $NoSetup) { node "$Dir\bin\tutomatic.js" setup }
Write-Host "`nListo. Abre una terminal nueva y escribe: tutomatic doctor" -ForegroundColor Green

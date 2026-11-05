#!/usr/bin/env bash
# Instalador de Tutomatic para Mac y Linux.
#   Dentro de la carpeta clonada:  ./install.sh
#   Sin clonar todavía:             bash install.sh            (clona en ~/tutomatic; TUTOMATIC_DIR para cambiarlo)
set -euo pipefail
REPO="${TUTOMATIC_REPO:-https://github.com/Josechaparro09/tutomatic.git}"
DIR="${TUTOMATIC_DIR:-$HOME/tutomatic}"
step() { printf '\n\033[36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$1"; }
warn() { printf '\033[33m! %s\033[0m\n' "$1"; }
has()  { command -v "$1" >/dev/null 2>&1; }

echo "Tutomatic · instalador"
OS="$(uname -s)"

# 1. Node 22+
if has node && [ "$(node -v | sed 's/v//' | cut -d. -f1)" -ge 22 ]; then ok "Node $(node -v)"
else
  if [ "$OS" = "Darwin" ] && has brew; then step "Instalando Node con Homebrew…"; brew install node
  else warn "Hace falta Node 22 o superior: https://nodejs.org (o: curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22)"; exit 1; fi
fi
# 2. Git
has git || { if [ "$OS" = "Darwin" ] && has brew; then brew install git; else warn "Instala git (sudo apt install git)"; exit 1; fi; }
# FFmpeg (opcional: el proyecto trae uno, pero el del sistema suele ser más completo)
has ffmpeg || { if [ "$OS" = "Darwin" ] && has brew; then step "Instalando FFmpeg…"; brew install ffmpeg || true; fi; }

# 3. Código
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HERE/bin/tutomatic.js" ]; then DIR="$HERE"
elif [ -f "$DIR/bin/tutomatic.js" ]; then step "Ya existe $DIR; la actualizo"; git -C "$DIR" pull --ff-only
else step "Descargando Tutomatic en $DIR…"; git clone "$REPO" "$DIR"; fi
cd "$DIR"

# 4. Dependencias y comando global
step "Instalando dependencias…"
npm install --no-fund --no-audit
step "Registrando el comando tutomatic…"
if npm link --no-fund --no-audit >/dev/null 2>&1 || { has sudo && sudo npm link --no-fund --no-audit >/dev/null 2>&1; }; then ok "Comando tutomatic listo"
else warn "No se pudo registrar el comando global; usa: node \"$DIR/bin/tutomatic.js\" <comando>"; fi

# 5. Asistente
[ "${1:-}" = "--no-setup" ] || node "$DIR/bin/tutomatic.js" setup
printf '\n\033[32mListo. Prueba: tutomatic doctor\033[0m\n'

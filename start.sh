#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== GeuLIS ==="

# Backend .env
if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  echo "[setup] backend/.env dibuat dari .env.example — sesuaikan DB_PASSWORD jika perlu"
fi

# Dependencies
if [[ ! -d backend/node_modules ]] || [[ ! -d frontend/node_modules ]]; then
  echo "[setup] Menginstall dependensi backend & frontend..."
  npm run install:all
fi

if [[ ! -d node_modules ]]; then
  echo "[setup] Menginstall dependensi root..."
  npm install
fi

echo ""
echo "  Frontend : http://localhost:5173"
echo "  API      : http://localhost:3001"
echo "  Login    : admin / lab — sandi awal ada di SANDI_AWAL.txt"
echo ""
echo "Tekan Ctrl+C untuk berhenti."
echo ""

exec npx concurrently -k -n API,WEB -c blue,green \
  "npm run dev --prefix backend" \
  "npm run dev --prefix frontend"

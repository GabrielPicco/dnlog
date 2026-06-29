#!/bin/bash
echo "============================================================"
echo "  DNLog Backend - Iniciando"
echo "============================================================"
echo

if ! command -v node &> /dev/null; then
    echo "[ERRO] Node.js nao encontrado!"
    echo "Instale Node.js 20+ em https://nodejs.org"
    exit 1
fi

if [ ! -f .env ]; then
    echo "[INFO] Copiando .env.example para .env"
    cp .env.example .env
fi

if [ ! -d node_modules ]; then
    echo "[INFO] Instalando dependencias (primeira execucao)"
    npm install
fi

echo
echo "Iniciando servidor..."
echo "Pressione Ctrl+C para parar"
echo
npm run start:dev

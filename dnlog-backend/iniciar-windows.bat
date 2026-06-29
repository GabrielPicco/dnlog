@echo off
chcp 65001 > nul
title DNLog Backend
echo ============================================================
echo   DNLog Backend - Iniciando
echo ============================================================
echo.

REM Verifica se Node.js esta instalado
where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo Baixe e instale Node.js 20+ em https://nodejs.org
    echo Depois execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)

REM Verifica se .env existe
if not exist .env (
    echo [INFO] Arquivo .env nao encontrado. Copiando de .env.example
    copy .env.example .env > nul
    echo.
    echo Configuracao padrao: MODO MOCK (SAP simulado)
    echo Para conectar no SAP real, edite o arquivo .env
    echo.
)

REM Instala dependencias na primeira vez
if not exist node_modules (
    echo [INFO] Instalando dependencias (so na primeira vez, leva ~2 min)
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo.
echo Iniciando servidor...
echo Pressione Ctrl+C para parar
echo.
call npm run start:dev
pause

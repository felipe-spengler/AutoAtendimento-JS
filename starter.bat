@echo off

title AutoAtendimento JS Starter

REM =================================================================
REM O "%~dp0" expande para o caminho do diretório onde este arquivo .bat está.
REM Isso torna o caminho totalmente dinâmico.
REM =================================================================

REM Altera para o diretório do seu projeto (onde o .bat está)
cd /d "%~dp0"

REM Verifica se é necessário rodar 'npm install' e instala se faltar algo
echo.
echo Verificando e instalando dependencias (npm install)...
call npm install

REM Inicia o servidor e o Electron
echo.
echo Iniciando o Servidor e o Electron (npm start)...
call npm start

echo.
pause
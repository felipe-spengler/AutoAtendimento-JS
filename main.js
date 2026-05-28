const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Otimizações para PCs Fracos/Antigos
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512'); // Limita o uso de RAM

let serverProcess;

// Limpeza de porta DEFINITIVA: mata processos na porta 3001 antes do início (Windows PowerShell)
try {
    const { execSync } = require('child_process');
    execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
} catch (e) { /* porta já livre */ }

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        fullscreen: true,
        frame: false, // Remove a barra de título e botões de fechar
        autoHideMenuBar: true, // Esconde o menu (Alt para mostrar)
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    // Aguarda o servidor iniciar antes de carregar a página
    setTimeout(() => {
        win.loadURL('http://localhost:3001/home.html');
    }, 1000);

    // Tenta puxar atualizações do GitHub antes de iniciar o servidor e carregar a página
    try {
        console.log("🔄 [AutoUpdate] Buscando atualizações no GitHub (timeout: 6s)...");
        const { execSync } = require('child_process');
        execSync('git pull', { stdio: 'inherit', timeout: 6000 });
        console.log("✅ [AutoUpdate] Sucesso!");
    } catch (e) {
        console.error("⚠️ [AutoUpdate] Falha ao atualizar:", e.message);
    }

    // Iniciar o servidor Node.js junto com o Electron
    serverProcess = spawn('node', ['server.js'], { shell: true });

    serverProcess.stdout.on('data', (data) => {
        console.log(`[Server] ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[Server ERROR] ${data}`);
    });

    serverProcess.on('close', (code) => {
        console.log(`Servidor Node finalizado com código ${code}`);
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('quit', () => {
    if (serverProcess) {
        console.log('Encerrando o backend Node...');
        serverProcess.kill();
    }
});
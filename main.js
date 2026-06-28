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

    console.log("🔄 [AutoUpdate] Buscando atualizações no GitHub...");
    const { exec } = require('child_process');
    exec('git pull', { timeout: 8000 }, (error, stdout, stderr) => {
        if (error) {
            console.error("⚠️ [AutoUpdate] Falha ao atualizar:", error.message);
        } else {
            console.log("✅ [AutoUpdate] Sucesso!");
        }

        // Iniciar o servidor Node.js junto com o Electron
        serverProcess = spawn('node', ['server.js'], { shell: true });

        let pageLoaded = false;
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Server] ${output}`);
            
            // Só carrega a URL se o Express estiver rodando e ainda não tiver sido carregado
            if (!pageLoaded && output.includes('Servidor rodando em')) {
                pageLoaded = true;
                win.loadURL('http://localhost:3001/home.html');
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`[Server ERROR] ${data}`);
        });

        serverProcess.on('close', (code) => {
            console.log(`Servidor Node finalizado com código ${code}`);
        });

        // Backup de segurança: Se por qualquer motivo a frase de inicialização mudar, carrega após 4 segundos
        setTimeout(() => {
            if (!pageLoaded) {
                pageLoaded = true;
                win.loadURL('http://localhost:3001/home.html');
            }
        }, 4000);
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
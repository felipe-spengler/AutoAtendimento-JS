const { app, BrowserWindow } = require('electron');
const path = require('path');
// const { spawn } = require('child_process'); // NÃO PRECISA MAIS

// A lógica do servidor (serverProcess) foi movida para o script 'start' no package.json

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        // É recomendável deixar fullscreen: false durante o desenvolvimento para fácil acesso ao DevTools.
        // Mantenha fullscreen: true se estiver pronto para produção.
        fullscreen: true, 
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    // O Electron carrega a interface, que se conectará ao servidor (que já está rodando pelo 'concurrently')
    win.loadFile(path.join(__dirname, 'public', 'home.html'));

    // Opcional: Abrir o DevTools automaticamente durante o desenvolvimento
    //win.webContents.openDevTools(); 
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // No macOS, fechar a janela não encerra a aplicação. Este código encerra em outros OS.
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // No macOS, é comum recriar uma janela se o dock icon for clicado e não houver janelas abertas.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// A lógica de encerramento do servidor (serverProcess.kill()) é desnecessária aqui,
// pois o 'concurrently' irá encerrar o processo do servidor quando o Electron for fechado.
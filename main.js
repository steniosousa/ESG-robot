const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'assets/icon.png'), // Opcional: adicionar ícone
        title: 'ESG Robot - Sistema de Automação',
        show: true // Mostra imediatamente com tela de carregamento
    });

    // Mostrar tela de carregamento primeiro
    const loadingPath = path.join(__dirname, 'loading.html');
    mainWindow.loadFile(loadingPath);

    // Iniciar o servidor backend
    startServer();

    // Esperar o servidor iniciar e depois carregar a página real
    setTimeout(() => {
        loadApplication();
    }, 3000); // 3 segundos para o servidor iniciar

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (serverProcess) {
            serverProcess.kill();
        }
    });
}

function loadApplication() {
    // Tentar carregar a aplicação web
    mainWindow.loadURL('http://localhost:3000')
        .then(() => {
            console.log('Aplicação carregada com sucesso');
            
            // Remover menu de desenvolvimento em produção
            if (process.env.NODE_ENV === 'production') {
                Menu.setApplicationMenu(null);
            }
        })
        .catch(error => {
            console.error('Erro ao carregar a aplicação:', error);
            
            // Tentar novamente após mais tempo
            setTimeout(() => {
                mainWindow.loadURL('http://localhost:3000')
                    .then(() => {
                        console.log('Aplicação carregada na segunda tentativa');
                    })
                    .catch(err => {
                        console.error('Falha ao carregar:', err);
                        // Mostrar página de erro
                        mainWindow.loadURL('data:text/html,<h1>Erro ao carregar aplicação</h1><p>Tente reiniciar o programa.</p>');
                    });
            }, 2000);
        });
}

function startServer() {
    // Iniciar o servidor Node.js
    serverProcess = spawn('ts-node', ['src/index.ts'], {
        stdio: 'inherit',
        shell: true,
        cwd: __dirname // Garante que está no diretório correto
    });

    serverProcess.on('error', (error) => {
        console.error('Erro ao iniciar o servidor:', error);
    });

    serverProcess.on('close', (code) => {
        console.log(`Servidor encerrado com código ${code}`);
    });

    console.log('Servidor iniciado, aguardando 3 segundos para carregar aplicação...');
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

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

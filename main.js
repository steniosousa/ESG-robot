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
    }, 3333); // 3 segundos para o servidor iniciar

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (serverProcess) {
            serverProcess.kill();
        }
    });
}

function loadApplication() {
    // Tentar carregar a aplicação web
    mainWindow.loadURL('http://localhost:3333')
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
                mainWindow.loadURL('http://localhost:3333')
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
    console.log('Iniciando servidor...');
    
    // Sempre iniciar o servidor, tanto em dev quanto em produção
    console.log('Iniciando servidor embutido...');
    
    // Em ambiente de desenvolvimento, usar ts-node
    // Em produção, executar o servidor diretamente no processo atual
    const isDev = process.env.NODE_ENV !== 'production';
    
    if (isDev) {
        // Em desenvolvimento, iniciar como processo separado
        const nodeExecutable = 'node';
        const serverScript = 'src/index.ts';
        const args = ['-r', 'ts-node/register', serverScript];
        
        console.log(`Executando: ${nodeExecutable} ${args.join(' ')}`);
        
        serverProcess = spawn(nodeExecutable, args, {
            stdio: 'inherit',
            shell: false,
            cwd: __dirname
        });
        
        serverProcess.on('error', (error) => {
            console.error('Erro ao iniciar o servidor:', error);
        });
    } else {
        // Em produção, executar o servidor diretamente no processo atual
        console.log('Executando servidor diretamente no processo...');
        try {
            // Carregar e executar o servidor compilado
            const app = require('electron').app || require('@electron/remote').app;
            const appPath = app ? app.getAppPath() : __dirname;
            const serverPath = path.join(appPath, 'dist', 'index.js');
            console.log('Tentando carregar servidor de:', serverPath);
            
            // Limpar cache do require para garantir recarregamento
            delete require.cache[require.resolve(serverPath)];
            require(serverPath);
            console.log('Servidor iniciado com sucesso');
        } catch (error) {
            console.error('Erro ao iniciar servidor:', error);
            
            // Tentar carregar o TypeScript como fallback
            try {
                require('ts-node/register');
                require('./src/index.ts');
                console.log('Servidor TypeScript iniciado como fallback');
            } catch (fallbackError) {
                console.error('Erro no fallback:', fallbackError);
                
                // Último recurso - tentar iniciar servidor Express diretamente
                try {
                    console.log('Tentando iniciar servidor manualmente...');
                    const express = require('express');
                    const app = express();
                    const port = 3333;
                    
                    app.use(express.static(path.join(__dirname, 'public')));
                    
                    app.get('/', (req, res) => {
                        res.sendFile(path.join(__dirname, 'public', 'index.html'));
                    });
                    
                    app.listen(port, () => {
                        console.log(`🌐 Servidor manual rodando em http://localhost:${port}`);
                    });
                } catch (manualError) {
                    console.error('Erro no servidor manual:', manualError);
                }
            }
        }
    }
    
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

import puppeteer from "puppeteer";
import readlineSync from "readline-sync";
import express from "express";
import path from "path";

// Variáveis de controle global
let isPaused = false;
let shouldStop = false;
let browser: any = null;
let page: any = null;
let controlPage: any = null;

// Variáveis para controle de permissões
let pendingPermission: { action: string; resolve: (value: boolean) => void } | null = null;
let permissionRequests: Array<{ action: string; timestamp: number }> = [];

// Função para solicitar permissão do usuário via interface web
function requestPermission(action: string): Promise<boolean> {
    console.log(`\n🔔 Aguardando permissão para: ${action}`);
    console.log('📱 Acesse a janela de controle para permitir ou negar');

    return new Promise((resolve) => {
        pendingPermission = { action, resolve };

        // Adicionar à lista de solicitações
        permissionRequests.push({
            action,
            timestamp: Date.now()
        });

        // Timeout de 30 segundos se não houver resposta
        setTimeout(() => {
            if (pendingPermission && pendingPermission.action === action) {
                console.log(`⏰ Timeout: Permissão para "${action}" não respondida. Negando automaticamente.`);
                pendingPermission.resolve(false);
                pendingPermission = null;
                // Remover da lista
                permissionRequests = permissionRequests.filter(req => req.action !== action);
            }
        }, 9000000);
    });
}

// Função para limpar e preencher campo
async function clearAndType(selector: string, value: string) {
    await page.click(selector);
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.type(selector, value);
}

async function clearAndSelectOption(name: string, value: string) {
    try {
        const wrapper = `egs-gcadastro[name="${name}"]`;

        // 1. Limpar via botão X (Angular)
        await page.evaluate((wrapper: any) => {
            const el = document.querySelector(wrapper);
            const btn = el?.querySelector('span#closeBtn') as HTMLElement;
            if (btn && btn.offsetParent !== null) {
                btn.click();
                return true;
            }
            return false;
        }, wrapper);


        // 2. Abrir select
        const inputInline = `${wrapper} input.editComboboxPdr`;
        await page.waitForSelector(inputInline, { visible: true });
        await page.click(inputInline);

        // 3. Input real de busca
        await page.waitForSelector(wrapper, { visible: true });

        await page.click(wrapper, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        await page.type(wrapper, value);


        const firstOption = '#egs-select ul.keydownRows';
        await page.waitForSelector(firstOption, { visible: true });

        await page.click(firstOption);

    } catch (err) {
        console.error('Erro ao selecionar opção:', err);
        throw err;
    }
}







// Função para aguardar enquanto estiver pausado
async function waitForResume(action?: string) {
    while (isPaused && !shouldStop) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (shouldStop) {
        throw new Error("Processo interrompido pelo usuário");
    }
}

// Criar servidor Express
function createControlServer() {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));

    // Endpoint para obter status atual
    app.get('/api/status', (req, res) => {
        res.json({
            isPaused,
            shouldStop,
            isRunning: browser !== null && !browser.process()?.killed,
            permissionRequests: permissionRequests.map(req => ({
                action: req.action,
                timestamp: req.timestamp
            }))
        });
    });

    // Endpoint para pausar
    app.post('/api/pause', (req, res) => {
        isPaused = true;
        console.log('🔴 Processo pausado');
        res.json({ success: true, isPaused: true });
    });

    // Endpoint para retomar
    app.post('/api/resume', (req, res) => {
        isPaused = false;
        console.log('🟢 Processo retomado');
        res.json({ success: true, isPaused: false });
    });

    // Endpoint para parar
    app.post('/api/stop', async (req, res) => {
        shouldStop = true;
        isPaused = false;
        console.log('🛑 Processo parado');
        if (browser) {
            await browser.close();
            browser = null;
            page = null;
        }
        res.json({ success: true, shouldStop: true });
    });

    // Endpoint para conceder permissão
    app.post('/api/grant-permission', (req, res) => {
        const { action, granted } = req.body;
        console.log(`📝 Permissão para "${action}": ${granted ? 'CONCEDIDA' : 'NEGADA'}`);

        // Processar permissão pendente
        if (pendingPermission && pendingPermission.action === action) {
            pendingPermission.resolve(granted);
            pendingPermission = null;
        }

        res.json({ success: true });
    });

    // Endpoint para registrar nova solicitação de permissão
    app.post('/api/request-permission', (req, res) => {
        const { action } = req.body;

        // Enviar para todos os clientes conectados via WebSocket ou polling
        res.json({ success: true, action });
    });

    // Servir interface HTML
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    const port = 3000;
    app.listen(port, () => {
        console.log(`🌐 Servidor de controle rodando em http://localhost:${port}`);
    });

    return app;
}

// Função para abrir janela de controle
async function openControlWindow() {
    const controlBrowser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--window-position=1400,100",  // Posicionar ao lado
            "--window-size=400,600"         // Tamanho da janela de controle
        ]
    });

    controlPage = await controlBrowser.newPage();
    await controlPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await controlPage.goto("http://localhost:3000");

    return controlBrowser;
}

async function main() {
    // Iniciar servidor de controle
    createControlServer();

    // Abrir janela de controle
    setTimeout(() => {
        openControlWindow();
    }, 2000);

    const login = "FINANCEIRO"
    const password = "inter2026"
    const key = "50201"

    const identification = {
        destination: "373.249.934-00",
        load_value: "100.00",
        quantity: 18,
        load_service: 40.85,
        type: "FIO",
        predominant_product: "FIO",
        service_recipient: 128.99
    }

    const taxes = {
        vehicle: "AAW1H16",
        driver_cpf: "022.280.219-70"
    }

    console.log("Iniciando robô de web scraping para EGS...");
    console.log("🌐 Janela de controle será aberta ao lado");

    await waitForResume();


    browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    console.log("Acessando página de login...");
    await waitForResume();

    try {
        await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
        console.log("Erro ao carregar página. Tentando novamente...");
        await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    const currentUrl = page.url();

    if (currentUrl.includes("login")) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const hasCaptcha = await page.$(".g-recaptcha, iframe[src*=\"recaptcha\"], .captcha, [class*=\"captcha\"]") !== null;

        if (hasCaptcha) {
            console.log("Verificação de robô detectada! Aguardando você resolver...");
        }

        await waitForResume();

        try {
            await page.waitForSelector('input[name="login"]', { timeout: 10000 });
            await page.type('input[name="login"]', login);

            await page.waitForSelector('input[name="senha"]', { timeout: 10000 });
            await page.type('input[name="senha"]', password);

            await page.waitForSelector('input[name="chaveAcesso"]', { timeout: 10000 });
            await page.type('input[name="chaveAcesso"]', key);

            const submitButton = await page.$('button[type="submit"]');
            if (submitButton) {
                await submitButton.click();
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                readlineSync.question("NÃO FOI POSSÍVEL ENCONTRAR O BOTÃO DE SUBMIT");
            }

        } catch (error) {
            console.log("Erro ao preencher formulário automaticamente:", error);
            readlineSync.question("");
        }
    }

    try {
        await waitForResume();

        // const canNavigateCTE = await requestPermission("Navegar para página CTE");
        // if (!canNavigateCTE) {
        //     console.log("❌ Permissão negada para navegar para CTE");
        // } else {
        // }
        await page.waitForSelector("div[class*='box-emissor-hover']", { timeout: 10000 });
        await page.goto("https://app.egssistemas.com.br/cte", { waitUntil: "domcontentloaded", timeout: 30000 });
        const canClickCopy = await requestPermission("Clicar no botão copiar");
        if (canClickCopy) {
            await page.click("button[data-original-title='Copiar']");
        }
    } catch (error) {
        console.log("Erro ao aguardar elemento box-emissor-hover ou navegar para CTE:", error);
    }

    try {
        await waitForResume();

        const canFillCTE = await requestPermission("Preencher dados de Identificação");
        if (canFillCTE) {
            // Usar a função para limpar, colar e selecionar destinatário
            await clearAndSelectOption('destinatario', identification.destination);

            // // Limpar e preencher campos
            // await clearAndType('input[name="valorCarga"]', identification.load_value);
            // await clearAndType('input[name="prodPredominante"]', identification.predominant_product);
            // await clearAndType('input[name="tipoCarga"]', identification.type);
            // await clearAndType('input[name="qtdeCarga"]', identification.quantity.toString());
            // await clearAndType('input[name="valorServico"]', identification.service_recipient.toString());
            // await clearAndType('input[name="valorReceber"]', identification.service_recipient.toString());

            // await page.click('li[id="cteNormal"]');

            // console.log("CT-e normal selecionado!");
        }
    } catch (error) {
        console.log(error)
    }

    try {
        await waitForResume();

        // Solicitar permissão para preencher dados do veículo
        const canFillVehicle = await requestPermission("Preencher dados do veículo");
        if (canFillVehicle) {
            await clearAndSelectOption('IDVEICULO', taxes.vehicle);
        }
        await page.waitForSelector("ul[ng-repeat='data in searchData']", { timeout: 10000 });
        await page.click("ul[ng-repeat='data in searchData'] li:first-child");
    } catch (error) {
        console.log("Erro ao preencher destinatário:", error);
    }

    //     // Navegar para a página de emissão de CTE

    //     console.log("Robô aguardando instruções...");
    //     console.log("Pressione ENTER para capturar dados da página atual ou Ctrl+C para sair:");
    //     readlineSync.question("");

    //     const pageContent = await page.content();
    //     console.log("Conteúdo da página capturado com sucesso!");
    //     console.log("Tamanho do conteúdo:", pageContent.length, "caracteres");

    //     await page.screenshot({ path: "screenshot.png", fullPage: true });
    //     console.log("Screenshot salvo como screenshot.png");
    // } else {
    //     console.log("Login não foi bem-sucedido. Verifique suas credenciais.");
    // }

    console.log("Pressione ENTER para fechar o navegador...");
    readlineSync.question("");

    await browser.close();
    console.log("Robô finalizado.");
}

main().catch(console.error);

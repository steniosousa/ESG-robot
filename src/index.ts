import puppeteer from "puppeteer";
import readlineSync from "readline-sync";
import express from "express";
import path from "path";

const login = "FINANCEIRO"
const password = "inter2026"
const key = "50201"

const identification = {
    destination: "",
    load_value: "",
    quantity: 0,
    load_service: 0,
    type: "",
    service_recipient: 0
}

const taxes = {
    vehicle: "",
    driver_cpf: "",
    "Valor B.C. ICMS": "",
    "Valor do ICMS": ""
}

const docs = {
    access_key: []
}

const emition = {
    finality: "0"
}

const tax_reform = {
    edit_ibs: true,
    "V. BC IBS/CBS": "",
    "V. CBS": "",
    "V. IBS": ""
}

let timerDuration = 10; // Default 10 segundos


let isPaused = false;
let shouldStop = false;
let browser: any = null;
let page: any = null;
let controlPage: any = null;

let pendingPermission: { action: string; resolve: (value: boolean) => void } | null = null;
let permissionRequests: Array<{ action: string; timestamp: number }> = [];
let robotCanStart = false;

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


async function waitForResume(action?: string) {
    while (isPaused && !shouldStop) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (shouldStop) {
        throw new Error("Processo interrompido pelo usuário");
    }
}

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

    // Endpoint para iniciar o robô
    app.post('/api/start-robot', (req, res) => {
        // Validar se todos os campos obrigatórios estão preenchidos
        const requiredFields = [
            { field: identification.destination, name: 'Destinatário' },
            { field: identification.load_value, name: 'Valor da Carga' },
            { field: identification.quantity, name: 'Quantidade' },
            { field: identification.service_recipient, name: 'Valor do Serviço' },
            { field: identification.type, name: 'Tipo de Carga' },
            { field: taxes.vehicle, name: 'Veículo' },
            { field: taxes.driver_cpf, name: 'CPF Motorista' },
            { field: taxes["Valor B.C. ICMS"], name: 'Valor BC ICMS' },
            { field: taxes["Valor do ICMS"], name: 'Valor ICMS' }
        ];

        const missingFields = requiredFields.filter(item => !item.field || item.field === "");
        
        if (docs.access_key.length === 0) {
            missingFields.push({ field: "", name: 'Chaves de Acesso' });
        }

        if (missingFields.length > 0) {
            res.json({ 
                success: false, 
                message: `Preencha os campos obrigatórios: ${missingFields.map(item => item.name).join(', ')}` 
            });
            return;
        }

        // Sinalizar que pode iniciar
        robotCanStart = true;
        console.log('🚀 Robô autorizado a iniciar');
        res.json({ success: true, message: 'Robô iniciando...' });
    });

    // Endpoint para obter configuração atual
    app.get('/api/get-config', (req, res) => {
        res.json({
            identification,
            taxes,
            docs,
            emition,
            tax_reform
        });
    });

    // Endpoint para atualizar configuração
    app.post('/api/update-config', (req, res) => {
        const config = req.body;
        
        // Atualizar variáveis globais
        if (config.identification) Object.assign(identification, config.identification);
        if (config.taxes) Object.assign(taxes, config.taxes);
        if (config.docs) Object.assign(docs, config.docs);
        if (config.emition) Object.assign(emition, config.emition);
        if (config.tax_reform) Object.assign(tax_reform, config.tax_reform);
        
        // Atualizar configuração do timer
        if (config.timer_config) {
            timerDuration = config.timer_config.duration || 10;
        }
        
        console.log('📝 Configuração atualizada via painel de controle');
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

async function openControlWindow() {
    const controlBrowser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--window-size=400,600"
        ]
    });

    controlPage = await controlBrowser.newPage();
    await controlPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await controlPage.goto("http://localhost:3000");

    return controlBrowser;
}

async function clearAndType(selector: string, value: string) {
    await page.click(`input[name="${selector}"]`);
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.type(`input[name="${selector}"]`, value);
}
const timer = async () => {
    for (let i = 0; i < timerDuration; i++) {
        await waitForResume();
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo por iteração
    }
};


async function clearAndSelectOption(name: string, value: string) {
    await timer();

    let wrapper =
        name === 'IDVEICULO'
            ? `egs-gveiculo[name="${name}"]` : `egs-gcadastro[name="${name}"]`;


    if (name === 'finalidadeCte') {
        wrapper = `egs-cte-finalidade[name="${name}"]`;
    }
    await page.evaluate((wrapper: any) => {
        const el = document.querySelector(wrapper);
        const btn = el?.querySelector('span#closeBtn');
        btn?.click();
    }, wrapper);

    if (name !== 'finalidadeCte') {
        const selector = `${wrapper} input.editComboboxPdr`;
        await page.type(selector, value);
        await timer();
    } else {
        const selector = `${wrapper} input[type="text"]`;

        await page.waitForSelector(selector, { visible: true });

        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        await page.type(selector, value);
        await timer();
    }
    if (name === 'IDVEICULO') {
        await page.waitForSelector('egs-gveiculo #egs-select ul.keydownRows', {
            visible: true
        });
        await page.click('egs-gveiculo #egs-select ul.keydownRows:first-of-type');
    } else if (name === 'IDMOTORISTA') {
        const selectBase = 'egs-gcadastro[name="IDMOTORISTA"]';

        await page.waitForSelector(
            `${selectBase} #egs-select ul.keydownRows`,
            { visible: true }
        );

        await page.click(
            `${selectBase} #egs-select ul.keydownRows`
        );

    } else if (name === 'finalidadeCte') {
        await page.waitForSelector('egs-cte-finalidade #egs-select ul.keydownRows', {
            visible: true
        });
        await page.click('egs-cte-finalidade #egs-select ul.keydownRows:first-of-type');
    }


    else {
        await page.waitForFunction(() => {
            return document.querySelectorAll('#egs-select ul.keydownRows').length > 0;
        });

        // 5. Clicar na PRIMEIRA opção
        await page.evaluate(() => {
            const first = document.querySelector('#egs-select ul.keydownRows') as HTMLElement;
            first?.scrollIntoView({ block: 'center' });
            first?.click();
        });
    }

}






async function main() {
    createControlServer();
    openControlWindow();

    console.log("⏳ Aguardando configuração e autorização para iniciar...");
    console.log("📱 Preencha os dados no painel de controle e clique em 'Iniciar Robô'");

    // Aguardar até que o robô seja autorizado a iniciar
    while (!robotCanStart && !shouldStop) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (shouldStop) {
            console.log("🛑 Processo interrompido antes de iniciar");
            return;
        }
    }

    console.log("🚀 Iniciando robô de web scraping para ESG...");
    console.log("🌐 Janela de controle será aberta ao lado");

    await waitForResume();


    browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    console.log("Acessando página de login...");
    await waitForResume();

    await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });

    const currentUrl = page.url();

    if (currentUrl.includes("login")) {

        const hasCaptcha = await page.$(".g-recaptcha, iframe[src*=\"recaptcha\"], .captcha, [class*=\"captcha\"]") !== null;

        if (hasCaptcha) {
            console.log("Verificação de robô detectada! Aguardando você resolver...");
        }

        await timer()
        await waitForResume();

        await page.waitForSelector('input[name="login"]', { timeout: 10000 });
        await page.type('input[name="login"]', login);

        await page.waitForSelector('input[name="senha"]', { timeout: 10000 });
        await page.type('input[name="senha"]', password);

        await page.waitForSelector('input[name="chaveAcesso"]', { timeout: 10000 });
        await page.type('input[name="chaveAcesso"]', key);

        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
            await submitButton.click();
        } else {
            readlineSync.question("NÃO FOI POSSÍVEL ENCONTRAR O BOTÃO DE SUBMIT");
        }

    }



    //page copy
    await waitForResume();
    await page.waitForSelector("div[class*='box-emissor-hover']", { timeout: 10000 });
    await page.goto("https://app.egssistemas.com.br/cte", { waitUntil: "domcontentloaded", timeout: 30000 });
    const canClickCopy = await requestPermission("Clicar no botão copiar");
    if (canClickCopy) {
        await page.click("button[data-original-title='Copiar']");
    }

    await timer()


    //page destination
    await waitForResume();
    await page.waitForSelector("input[name='valorCarga']", { timeout: 10000 });

    await clearAndSelectOption('destinatario', identification.destination);
    await clearAndSelectOption('destinatario', identification.destination);

    await clearAndType('valorCarga', identification.load_value);

    await clearAndType('prodPredominante', identification.type);
    await clearAndType('tipoCarga', identification.type);

    await clearAndType('qtdeCarga', identification.quantity.toString());

    await clearAndType('valorServico', identification.service_recipient.toString());

    await clearAndType('valorReceber', identification.service_recipient.toString());


    await page.click('li[id="cteNormal"]');


    //page taxes
    await waitForResume();


    await page.waitForSelector("input[name='valorRedBaseICMS']", { timeout: 10000 });


    await clearAndSelectOption('IDVEICULO', taxes.vehicle);


    await clearAndSelectOption("IDMOTORISTA", taxes.driver_cpf);

    await clearAndType('valorbcICMS', taxes['Valor B.C. ICMS']);
    await clearAndType('valorIcms', taxes['Valor do ICMS']);

    await page.click('li[id="documentos"]');



    await waitForResume();
    await page.waitForSelector('div[class="dx-checkbox-container"]', { timeout: 10000 });
    await page.click('div[class="dx-checkbox-container"]');

    await timer()

    await page.click('egs-button-delete');

    await timer()
    await page.waitForSelector('button[id="btnSimConfirm"]', { timeout: 10000 });

    await page.click('button[id="btnSimConfirm"]');

    await waitForResume();
    await page.waitForSelector('egs-combobox-tabela[name="cClassTribIBSCBS"]', { timeout: 10000 });


    for (const key of docs.access_key) {
        await timer()
        await page.click('egs-button-new')
        await timer()
        await page.waitForSelector('input[name="CHAVENFE"]', { timeout: 20000 });
        await page.type('input[name="CHAVENFE"]', key)
        await page.waitForSelector('egs-button-save-popup button', { timeout: 20000 });
        await page.click('egs-button-save-popup button')
        await timer()
    }

    await timer()

    await page.click('li[id="emissao"]');
    await clearAndSelectOption('finalidadeCte', emition.finality);




    await page.click('li[id="ReformaTrib"]');

    await clearAndType('vBC', tax_reform['V. BC IBS/CBS']);

    await clearAndType('vCBS', tax_reform['V. CBS']);
    
    await clearAndType('vIBS', tax_reform['V. IBS']);
    
    await clearAndType('vIBSUF', tax_reform['V. IBS']);



    const canClickSave = await requestPermission("Clicar no botão salvar");

    if (canClickSave) {
        await page.click('egs-button-save-form button');
    }
}
// await browser.close();

main().catch(console.error);

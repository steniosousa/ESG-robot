import puppeteer from "puppeteer";
import readlineSync from "readline-sync";
import express from "express";
import path from "path";

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
    vehicle: "ABZ0A56",
    driver_cpf: "02228021970",
    "Valor B.C. ICMS": "128,99",
    "Valor do ICMS": "18,13"
}

const docs = {
    access_key: ['24260207332190000789550010007590641216385302', '24260207332190000789550010007590641216385303', '24260207332190000789550010007590641216385304']
}

const emition = {
    city_end: "fortaleza"
}

const tax_reform = {
    edit_ibs: true,
    "CST IBS/CBS": "200",
    "Class. Trib. IBS/CBS": "200021",
    "V. BC IBS/CBS": '128,99',
    "P. CBS": '0,9',
    "P. IBS UF": '0,1',
    "V. CBS": '18,13',
    "V. IBS UF": '1,81',
    "V. IBS": '1,81'
}

let isPaused = false;
let shouldStop = false;
let browser: any = null;
let page: any = null;
let controlPage: any = null;

let pendingPermission: { action: string; resolve: (value: boolean) => void } | null = null;
let permissionRequests: Array<{ action: string; timestamp: number }> = [];

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
    for (let i = 0; i < 30; i++) {
        await waitForResume();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};


async function clearAndSelectOption(name: string, value: string) {
    await timer();

    let wrapper =
        name === 'IDVEICULO'
            ? `egs-gveiculo[name="${name}"]` : `egs-gcadastro[name="${name}"]`;

    await page.evaluate((wrapper: any) => {
        const el = document.querySelector(wrapper);
        const btn = el?.querySelector('span#closeBtn');
        btn?.click();
    }, wrapper);
    const selector = `${wrapper} input.editComboboxPdr`;
    await page.type(selector, value);
    await timer();
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

    } else {
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

    await clearAndType('prodPredominante', identification.predominant_product);
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

    await page.click('li[id="ReformaTrib"]');

    await clearAndType('vIBS', tax_reform['V. IBS']);

    await clearAndType('pCBS', tax_reform['P. CBS']);

    await clearAndType('vCBS', tax_reform['V. CBS']);

    await clearAndType('pIBSUF', tax_reform['P. IBS UF']);

    await clearAndType('vIBSUF', tax_reform['V. IBS UF']);

    await clearAndType('vBC', tax_reform['V. BC IBS/CBS']);


    const canClickSave = await requestPermission("Clicar no botão salvar");

    if (canClickSave) {
        await page.click('egs-button-save-form button');
    }
}
// await browser.close();

main().catch(console.error);

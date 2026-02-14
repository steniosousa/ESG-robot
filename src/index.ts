import puppeteer from "puppeteer";
import express from "express";
import path from "path";

const login = "FINANCEIRO"
const password = "inter2026"
const key = "50201"

const destination_register = {
    "cpf/cnpj": "61332882056",
    "Razão Social": "berkj",
    "cep": "60831545",
    "Inscr.estadual": "234234",
    "numero": 'aksdj'
}

let identification = {
    destination: "",
    load_value: "",
    quantity: 0,
    load_service: 0,
    type: "",
    service_recipient: 0
}

let taxes = {
    vehicle: "",
    driver_cpf: "",
    "Valor B.C. ICMS": "",
    "Valor do ICMS": ""
}

let docs = {
    access_key: []
}

let emition = {
    finality: "0"
}

let tax_reform = {
    edit_ibs: true,
    "V. BC IBS/CBS": "",
    "V. CBS": "",
    "V. IBS UF / V. IBS": ""
}

let timerDuration = 10;

let isPaused = false;
let shouldStop = false;
let browser: any = null;
let page: any = null;
let controlPage: any = null;

let pendingPermission: { action: string; resolve: (value: boolean) => void } | null = null;
let permissionRequests: Array<{ action: string; timestamp: number }> = [];
let robotCanStart = false;

function requestPermission(action: string): Promise<boolean> {
    return new Promise((resolve) => {
        pendingPermission = { action, resolve };
        permissionRequests.push({
            action,
            timestamp: Date.now()
        });

        setTimeout(() => {
            if (pendingPermission && pendingPermission.action === action) {
                pendingPermission.resolve(false);
                pendingPermission = null;
                permissionRequests = permissionRequests.filter(req => req.action !== action);
            }
        }, 9000000);
    });
}

const creations = {
    "create_driver": async () => {
        await page.goto("https://app.egssistemas.com.br/cadastro-geral", { waitUntil: "domcontentloaded", timeout: 30000 });

        await page.waitForSelector(`td:nth-of-type(3) input[aria-label="Filtro de célula"]`, { timeout: 10000 });

        await page.locator(`td:nth-of-type(3) input[aria-label="Filtro de célula"]`).fill("");
        await page.locator(`td:nth-of-type(3) input[aria-label="Filtro de célula"]`).fill(destination_register["cpf/cnpj"]); await timer()

        await page.waitForSelector('.dx-datagrid-table');
        const rows = await page.$$('.dx-datagrid-table tbody tr.dx-data-row');

        if (rows.length === 0) {
            await page.click("egs-button-new button")
            await page.waitForSelector("input[name='cpfCnpj']", { timeout: 10000 });
            await page.locator("input[name='cpfCnpj']").fill(destination_register["cpf/cnpj"]);
            if (destination_register["cpf/cnpj"].length === 14) {
                await page.waitForSelector("span[id='butonConsultaCpfCnpj']", { state: 'visible' });
                await page.click("span[id='butonConsultaCpfCnpj']");
                const ieSelector = "input[name='inscEstadual']";
                await page.waitForSelector(ieSelector);
                await page.locator(ieSelector).fill("");
                await page.locator(ieSelector).fill(destination_register["Inscr.estadual"]);
            } else {
                await page.locator("input[name='RAZAOSOCIAL']").fill(destination_register["Razão Social"]);
            }
        }

    },
    "create_recipient": async () => {
        creations.create_driver()
    },
    "create_cte": async () => {
        await page.goto("https://app.egssistemas.com.br/cte-emissao", { waitUntil: "domcontentloaded", timeout: 30000 });

        const canClickCopy = await requestPermission("Clicar no botão copiar");

        if (canClickCopy) {
            await page.click("button[data-original-title='Copiar']");
        }

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

        await page.waitForSelector("input[name='valorRedBaseICMS']", { timeout: 10000 });

        await clearAndSelectOption('IDVEICULO', taxes.vehicle);

        await clearAndSelectOption("IDMOTORISTA", taxes.driver_cpf);

        await clearAndType('valorbcICMS', taxes['Valor B.C. ICMS']);
        await clearAndType('valorIcms', taxes['Valor do ICMS']);

        await page.click('li[id="documentos"]');

        //notas

        await page.waitForSelector('div[class="dx-checkbox-container"]', { timeout: 10000 });
        await page.click('div[class="dx-checkbox-container"]');

        await timer()

        await page.click('egs-button-delete');

        await timer()
        await page.waitForSelector('button[id="btnSimConfirm"]', { timeout: 10000 });

        await page.click('button[id="btnSimConfirm"]');

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

        //emissao
        await page.click('li[id="emissao"]');
        await clearAndSelectOption('finalidadeCte', emition.finality);

        //obs
        await page.waitForSelector('a[link-id="cteNormal"]');
        await page.evaluate(() => {
            const elements = document.querySelectorAll('a[link-id="cteNormal"]');
            const elementsArray = Array.from(elements);
            for (const element of elementsArray) {
                if (element.textContent.trim() === 'Obs. Cont.') {
                    (element as HTMLElement).click();
                    return true;
                }
            }
            return false;
        });

        await timer()
        await page.click('egs-button-new[ng-click="novo(Observacoes)"] button');
        await timer()
        await clearAndType('observacoes', "new item");
        await page.click('egs-button-save-popup button')
        await timer()
        await page.evaluate(() => {
            const rowCheckboxes = document.querySelectorAll('.dx-data-row .dx-checkbox-icon') as NodeListOf<HTMLElement>;

            if (rowCheckboxes.length > 0) {
                rowCheckboxes.forEach(cb => cb.click());
            } else {
                console.warn("Nenhuma linha encontrada para selecionar.");
            }
        });

        await timer()
        const botaoExcluir = 'egs-button-delete[ng-click="excluir(Observacoes)"]';
        await page.click(botaoExcluir);
        await timer()
        const seletorSim = '#btnSimConfirm';
        await page.waitForSelector(seletorSim, { visible: true });
        await page.click(seletorSim);

        //reforma tributaria
        await page.click('li[id="ReformaTrib"]');

        await clearAndType('vBC', tax_reform['V. BC IBS/CBS']);

        await clearAndType('vCBS', tax_reform['V. CBS']);

        await clearAndType('vIBS', tax_reform['V. IBS UF / V. IBS']);

        await clearAndType('vIBSUF', tax_reform['V. IBS UF / V. IBS']);
    },
    "login": async () => {
        await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });

        const hasCaptcha = await page.$(".g-recaptcha, iframe[src*=\"recaptcha\"], .captcha, [class*=\"captcha\"]") !== null;

        if (hasCaptcha) {
            console.log("Verificação de robô detectada! Aguardando você resolver...");
        }

        await timer()

        await page.waitForSelector('input[name="login"]', { timeout: 10000 });
        await page.type('input[name="login"]', login);

        await page.waitForSelector('input[name="senha"]', { timeout: 10000 });
        await page.type('input[name="senha"]', password);

        await page.waitForSelector('input[name="chaveAcesso"]', { timeout: 10000 });
        await page.type('input[name="chaveAcesso"]', key);

        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
            await submitButton.click();
        }

    },
    "complete_route": async () => {
        await creations.login()
        await creations.create_driver()
        await creations.create_recipient()
        await creations.create_cte()
    }
}

function createControlServer() {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));

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

    // Endpoint para fazer login
    app.post('/api/fazer-login', async (req, res) => {
        try {
            await creations.login()
            console.log('✅ Login executado com sucesso');
            res.json({ success: true, message: 'Login executado com sucesso' });

        } catch (error) {
            console.error('❌ Erro no login:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });

    // Endpoint para cadastro de motorista
    app.post('/api/cadastro-motorista', async (req, res) => {
        try {
            await creations.create_driver();
            res.json({ success: true, message: 'Cadastro de motorista executado com sucesso' });

        } catch (error) {
            console.error('❌ Erro no cadastro de motorista:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });

    // Endpoint para registrar destinatário
    app.post('/api/registrar-destinatario', async (req, res) => {
        try {
            await creations.create_recipient();
            console.log('✅ Registro de destinatário executado com sucesso');
            res.json({ success: true, message: 'Registro de destinatário executado com sucesso' });

        } catch (error) {
            console.error('❌ Erro no registro de destinatário:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });

    // Endpoint para iniciar o robô
    app.post('/api/start-robot', (req, res) => {
        const config = req.body;
        timerDuration = config.timer_config.duration;
        identification = config.identification;
        taxes = config.taxes;
        docs = config.docs;
        emition = config.emition;
        tax_reform = config.tax_reform;
        docs.access_key = config.docs.access_key;


        robotCanStart = true;
        console.log('🚀 Robô autorizado a iniciar');
        res.json({ success: true, message: 'Robô iniciando...' });
    });

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
            "--window-size=400,600",
            "--disable-features=DefaultBrowserSecurityFeatures"
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
    } else {
        await page.waitForFunction(() => {
            return document.querySelectorAll('#egs-select ul.keydownRows').length > 0;
        });

        // Clicar na PRIMEIRA opção
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

    while (!robotCanStart && !shouldStop) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (shouldStop) {
            return;
        }
    }

    browser = await puppeteer.launch({
        headless: false,
        userDataDir: './browser-data',
        defaultViewport: null,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
}

main().catch(console.error);

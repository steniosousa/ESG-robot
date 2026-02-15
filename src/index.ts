import puppeteer from "puppeteer";
import express from "express";
import path from "path";

let general_config = {
    driver: {
        cpf: '',
        name: '',
    },
    destination: {
        cpf_cnpj: '',
        razao_social: '',
        cep: '',
        insc_estadual: '',
        numero: ''
    },
    note_fiscal: {
        destination: "",
        load_value: "",
        quantity: '',
        load_service: '',
        type: "",
        service_recipient: ''
    },
    taxes: {
        vehicle: "",
        Valor_BC_ICMS: "",
        Valor_ICMS: ""
    },
    docs: {
        access_key: []
    },
    emition: {
        finality: ""
    },
    tax_reform: {
        edit_ibs: true,
        Valor_BC_IBS_CBS: "",
        Valor_CBS: "",
        Valor_IBS_UF_IBS: ""
    },
    timerDuration: 2
}

let isPaused = false;
let shouldStop = false;
let browser: any = null;
let page: any = null;
let controlPage: any = null;

let pendingPermission: { action: string; resolve: (value: boolean) => void } | null = null;
let permissionRequests: Array<{ action: string; timestamp: number }> = [];
let robotCanStart = false;

function requestPermission(action: string): Promise<boolean> {
    console.log(`🔔 [DEBUG] Criando solicitação de permissão para: ${action}`);
    return new Promise((resolve) => {
        pendingPermission = { action, resolve };
        permissionRequests.push({
            action,
            timestamp: Date.now()
        });
        console.log(`🔔 [DEBUG] Permissão adicionada ao array. Total: ${permissionRequests.length}`);
        console.log(`🔔 [DEBUG] Array de permissões:`, permissionRequests);
    });
}

async function checkLoadingAndWait(page: any) {
    console.log("🔍 Vigiando loading...");
    const selector = '.load.jqmOverlay';

    while (true) {
        // O evaluate funciona em Playwright e Puppeteer
        const isVisible = await page.evaluate((sel: string) => {
            const el = document.querySelector(sel) as HTMLElement;
            if (!el) return false; // Se não existe, não está visível

            // Verifica se o display é diferente de 'none' e se está visível no layout
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }, selector);

        if (!isVisible) {
            console.log("✅ Tela liberada! Prosseguindo...");
            return true;
        }

        console.log("⏳ Loading detectado no estilo... aguardando 500ms");
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function waitForLoadingComplete(page: any) {
    console.log("⏳ Aguardando loading completar...");
    await checkLoadingAndWait(page);
    console.log("🚀 Loading completado! Continuando...");
}

const creations = {
    "create_driver": async () => {
        const { cpf, name } = general_config.driver;

        await page.goto("https://app.egssistemas.com.br/cadastro-geral", {
            waitUntil: "networkidle2",
            timeout: 30000
        });

        const filterSelector = 'td:nth-of-type(3) input[aria-label="Filtro de célula"]';
        await page.waitForSelector(filterSelector, { visible: true });

        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(filterSelector, cpf);

        await page.waitForNetworkIdle({ idleTime: 500 });

        const isEmpty = await page.evaluate(() => {
            const grid = document.querySelector('.dx-datagrid-nodata');
            const rows = document.querySelectorAll('.dx-datagrid-table tbody tr.dx-data-row');
            return !!grid || rows.length === 0;
        });

        if (isEmpty) {
            await page.click("egs-button-new button");
            clearAndType("cpfCnpj", cpf);
            clearAndType("RAZAOSOCIAL", name);
        }
    },
    "create_destination": async () => {
        const { cpf_cnpj, insc_estadual, razao_social, cep, numero } = general_config.destination;

        await page.goto("https://app.egssistemas.com.br/cadastro-geral", {
            waitUntil: "networkidle2",
            timeout: 30000
        });

        await waitForLoadingComplete(page);

        const filterSelector = 'td:nth-of-type(3) input[aria-label="Filtro de célula';
        await page.waitForSelector(filterSelector, { visible: true });

        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(filterSelector, cpf_cnpj, { delay: 50 });
        await waitForLoadingComplete(page);

        await page.waitForNetworkIdle({ idleTime: 1000 });

        const isEmpty = await page.evaluate(() => {
            const grid = document.querySelector('.dx-datagrid-nodata');
            const rows = document.querySelectorAll('.dx-datagrid-table tbody tr.dx-data-row');
            return !!grid || rows.length === 0;
        });
        await waitForLoadingComplete(page);

        if (isEmpty) {
            await page.click("egs-button-new button");
            clearAndType("cpfCnpj", cpf_cnpj);

            await waitForLoadingComplete(page);
            if (cpf_cnpj.length === 14) {
                const submitButton = '#butonConsultaCpfCnpj';
                await page.waitForSelector(submitButton, { state: 'visible' });
                await page.click(submitButton);
                clearAndType("inscEstadual", insc_estadual);
            }
            else {
                const selector = 'input[ui-br-cep-mask]';
                await page.locator(selector).fill(cep);
                await waitForLoadingComplete(page);
                await page.click("#buttonCep");
                await waitForLoadingComplete(page);
                console.log("⏳ Aguardando request do CEP completar...");
                await page.waitForResponse((response: any) =>
                    response.url().includes('GetCEP') && response.status() === 200
                    , { timeout: 10000 });
                console.log("✅ Request do CEP completada!");

                await timer();
                await waitForLoadingComplete(page);

                const numeroSelector = 'input[placeholder="Ex.: 000"]';

                await page.waitForSelector(numeroSelector, { state: 'visible' });
                await page.locator(numeroSelector).fill(numero);

                await waitForLoadingComplete(page);
                clearAndType("INSCESTADUAL", insc_estadual);
                await timer();
                await page.waitForSelector("input[name='INSCESTADUAL']", { timeout: 10000 });

                const valorInscricao = await page.evaluate(() => {
                    const input = document.querySelector('input[name="INSCESTADUAL"]') as HTMLInputElement;
                    return input ? input.value : '';
                });

                if (valorInscricao !== insc_estadual) {
                    await page.type('input[name="INSCESTADUAL"]', insc_estadual);
                    await timer();
                } else {
                    console.log(`✅ Campo INSCESTADUAL preenchido corretamente: ${valorInscricao}`);
                }

                clearAndType("RAZAOSOCIAL", razao_social);
            }


        }
        return
    },
    "create_cte": async () => {
        await page.goto("https://app.egssistemas.com.br/cte", { waitUntil: "domcontentloaded", timeout: 30000 });
        await waitForLoadingComplete(page);

        const canClickCopy = await requestPermission("Clicar no botão copiar");

        if (canClickCopy) {
            await page.click("button[data-original-title='Copiar']");
        }

        await page.waitForSelector("input[name='valorCarga']", { timeout: 10000 });

        await clearAndSelectOption('destinatario', general_config.note_fiscal.destination);

        await clearAndType('valorCarga', general_config.note_fiscal.load_value);

        await clearAndType('prodPredominante', general_config.note_fiscal.type);
        await clearAndType('tipoCarga', general_config.note_fiscal.type);

        await clearAndType('qtdeCarga', general_config.note_fiscal.quantity.toString());

        await clearAndType('valorServico', general_config.note_fiscal.service_recipient.toString());

        await clearAndType('valorReceber', general_config.note_fiscal.service_recipient.toString());

        await page.click('li[id="cteNormal"]');



        //page taxes

        await page.waitForSelector("input[name='valorRedBaseICMS']", { timeout: 10000 });

        await clearAndSelectOption('IDVEICULO', general_config.taxes.vehicle);

        await clearAndSelectOption("IDMOTORISTA", general_config.driver.cpf);

        await clearAndType('valorbcICMS', general_config.taxes.Valor_BC_ICMS);
        await clearAndType('valorIcms', general_config.taxes.Valor_ICMS);

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

        for (const key of general_config.docs.access_key) {
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
        await clearAndSelectOption('finalidadeCte', general_config.emition.finality);

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

        await clearAndType('vBC', general_config.tax_reform.Valor_BC_IBS_CBS);

        await clearAndType('vCBS', general_config.tax_reform.Valor_CBS);

        await clearAndType('vIBS', general_config.tax_reform.Valor_IBS_UF_IBS);

        await clearAndType('vIBSUF', general_config.tax_reform.Valor_IBS_UF_IBS);
    },
    "login": async () => {
        await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });

        const isLoading = await checkLoadingAndWait(page);
        if (isLoading) {
            console.log("✅ Loading parou! Continuando execução...");
        }
        const hasCaptcha = await page.$(".g-recaptcha, iframe[src*=\"recaptcha\"], .captcha, [class*=\"captcha\"]") !== null;

        if (hasCaptcha) {
            console.log("Verificação de robô detectada! Aguardando você resolver...");
        }


        await page.waitForSelector('input[name="login"]', { timeout: 10000 });

        await clearAndType('login', "FINANCEIRO");

        await clearAndType('senha', "inter2026");

        await clearAndType('chaveAcesso', "50201");

        const submitButton = 'button[type="submit"]';
        await page.waitForSelector(submitButton, { state: 'visible' });
        await page.click(submitButton);

    },
    "complete_route": async () => {
        await creations.login()
        await creations.create_driver()
        await creations.create_destination()
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
            await creations.create_destination();
            console.log('✅ Registro de destinatário executado com sucesso');
            res.json({ success: true, message: 'Registro de destinatário executado com sucesso' });

        } catch (error) {
            console.error('❌ Erro no registro de destinatário:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });

    app.post('/api/create-cte', async (req, res) => {
        try {
            await creations.create_cte();
            console.log('✅ CTe criado com sucesso');
            res.json({ success: true, message: 'CTe criado com sucesso' });

        } catch (error) {
            console.error('❌ Erro no registro de destinatário:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });



    // Endpoint para iniciar o robô
    app.post('/api/start-robot', async (req, res) => {
        const config = req.body;
        general_config = {
            driver: config.driver,
            destination: config.destination,
            note_fiscal: config.note_fiscal,
            taxes: config.taxes,
            docs: {
                access_key: config.docs.access_key
            },
            timerDuration: config.timerDuration,
            emition: config.emition,
            tax_reform: config.tax_reform,

        };


        robotCanStart = true;
        res.json({ success: true, message: 'Robô iniciando...' });
    });


    // Endpoint para iniciar o robô
    app.post('/api/start-agente', async (req, res) => {
        const config = req.body;

        general_config = {
            driver: config.driver,
            destination: config.destination,
            note_fiscal: config.note_fiscal,
            taxes: config.taxes,
            docs: {
                access_key: config.docs.access_key
            },
            timerDuration: config.timerDuration,
            emition: config.emition,
            tax_reform: config.tax_reform,

        };

        robotCanStart = true;

        await creations.login();
        await creations.create_driver();
        await creations.create_cte();

        res.json({ success: true, message: 'Agente iniciando...' });
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
    const launchOptions: any = {
        headless: false,
        defaultViewport: null,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--window-size=maximized",
            "--disable-features=DefaultBrowserSecurityFeatures"
        ]
    };


    const controlBrowser = await puppeteer.launch(launchOptions);

    const pages = await controlBrowser.pages();
    if (pages.length > 0) {
        controlPage = pages[0];
        await controlPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        await controlPage.goto("http://localhost:3000");
    } else {
        controlPage = await controlBrowser.newPage();
        await controlPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        await controlPage.goto("http://localhost:3000");
    }

    browser = controlBrowser;

    return controlBrowser;
}

async function clearAndType(name: string, value: string) {
    const selector = `input[name="${name}"]`;
    await page.waitForSelector(selector, { visible: true });

    await page.focus(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    await page.waitForSelector(selector, { timeout: 1000 });
    await page.type(selector, value);
    await timer();

}

const timer = async () => {
    for (let i = 0; i < general_config.timerDuration; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo por iteração
    }
};

async function clearAndSelectOption(name: string, value: string) {
    await waitForLoadingComplete(page);
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

    while (!robotCanStart && !shouldStop) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (shouldStop) {
            return;
        }
    }

    page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
}

main().catch(console.error);

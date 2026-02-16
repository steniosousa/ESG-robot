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
        numero: '',
        rua: '',
        bairro: ''
    },
    note_fiscal: {
        load_value: "",
        quantity: '',
        load_service: '',
        type: "",
        service_recipient: '',
        load_icms: "",
    },
    trucker: {
        plate: "",
        trucker_uf: "",
        description: "",
        renavam: "",
        type_trucker: "",
        type_wheelset: "",
        type_body: "",
        type_owner: "",
        weight: "",
        capacity: "",
        rntrc: ""
    },
    docs: {
        access_key: []
    },
    tax_reform: {
        Valor_CBS: "",
        Valor_IBS_UF_IBS: ""
    },
    timerDuration: 2
}

let isPaused = false;
let shouldStop = false;
let browser: any = null;
let page: any = null;
let loadingMonitorInterval: any = null;

async function startGlobalLoadingMonitor() {
    if (loadingMonitorInterval) {
        clearInterval(loadingMonitorInterval);
    }
    loadingMonitorInterval = setInterval(async () => {
        if (!page) return;

        try {
            const isLoading = await page.evaluate(() => {
                const loadingElement = document.querySelector('.load.jqmOverlay');
                if (!loadingElement) return false;

                const style = window.getComputedStyle(loadingElement);
                const isVisible = style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0';

                // Log adicional para debug
                if (isVisible) {
                    console.log('🔍 Loading ainda visível:', {
                        display: style.display,
                        visibility: style.visibility,
                        opacity: style.opacity
                    });
                }

                return isVisible;
            });

            if (isLoading && !isPaused) {
                console.log("⏸️ Loading detectado! Pausando execução...");
                isPaused = true;
            } else if (!isLoading && isPaused) {
                console.log("▶️ Loading sumiu! Retomando execução...");
                isPaused = false;
            }
        } catch (error: any) {
            if (isPaused) {
                isPaused = false;
            }
        }
    }, 500); // Aumentei para 500ms para reduzir carga
}

async function waitForGlobalLoading(maxWaitTime: number = 30000) {
    const startTime = Date.now();

    while (isPaused) {

        // Verifica se excedeu o tempo máximo
        if (Date.now() - startTime > maxWaitTime) {
            isPaused = false;
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }
}


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
    });
}

async function listerRequest(includes: string) {
    const responsePromise = page.waitForResponse((res: any) => {
        const matchesUrl = res.url().includes(`${includes}`);
        const isNotPreflight = res.request().method() !== 'OPTIONS';
        return matchesUrl && isNotPreflight;
    }, { timeout: 10000 });
    return responsePromise;
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
        await page.focus(filterSelector);
        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        await page.locator(filterSelector).fill(cpf);
        const responsePromise = listerRequest('Gcadastro');
        await page.keyboard.press('Enter');

        const response = await responsePromise;
        const responseData = await response.json();
        await timer()
        if (responseData.value && responseData.value.length === 0) {
            await page.click("egs-button-new button");
            await clearAndType("cpfCnpj", cpf);
            await clearAndType("RAZAOSOCIAL", name);
        }
    },
    "create_destination": async () => {
        const { cpf_cnpj, insc_estadual, razao_social, cep, numero, bairro, rua } = general_config.destination;

        await page.goto("https://app.egssistemas.com.br/cadastro-geral", {
            waitUntil: "networkidle2",
            timeout: 30000
        });

        await timer()

        const filterSelector = 'td:nth-of-type(3) input[aria-label="Filtro de célula';
        await page.waitForSelector(filterSelector, { visible: true });
        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        const responsePromise = listerRequest('/odata/Gcadastro');
        await page.locator(filterSelector).fill(cpf_cnpj);
        await page.keyboard.press('Enter');

        const response = await responsePromise;
        const responseData = await response.json();
        if (responseData.value && responseData.value.length === 0) {
            await page.click("egs-button-new button");
            clearAndType("cpfCnpj", cpf_cnpj);
            if (cpf_cnpj.length === 18) {
                const submitButton = '#butonConsultaCpfCnpj';
                await page.waitForSelector(submitButton, { state: 'visible' });
                await page.click(submitButton);
                listerRequest('GetCadastroReceiraFederal')
                clearAndType("inscEstadual", insc_estadual);
                await timer();
                await page.waitForSelector("li[id=dadosAdicionais]", { timeout: 10000 });
                await page.click("li[id=dadosAdicionais]");
                await clearAndSelectOption('contribuinteIcms', "1")
                await clearAndSelectOption('consumidorFinal', "0")
            }
            else {
                const selector = 'input[ui-br-cep-mask]';
                await page.locator(selector).fill(cep);
                
                listerRequest("GetCEP")
                await page.click("#buttonCep");
                
                clearAndType("INSCESTADUAL", insc_estadual);
                
                await timer();
                await clearAndTypeByPlaceholder("Ex.: 000", numero);
                await clearAndTypeByPlaceholder("Informe o endereço", rua);
                await clearAndTypeByPlaceholder("Informe o bairro", bairro);
                await timer();
                await page.waitForSelector("input[name='INSCESTADUAL']", { timeout: 10000 });

                const valorInscricao = await page.evaluate(() => {
                    const input = document.querySelector('input[name="INSCESTADUAL"]') as HTMLInputElement;
                    return input ? input.value : '';
                });

                if (valorInscricao !== insc_estadual) {
                    await page.locator('input[name="INSCESTADUAL"]').fill(insc_estadual);
                    await timer();
                } else {
                    console.log(`✅ Campo INSCESTADUAL preenchido corretamente: ${valorInscricao}`);
                }

                clearAndType("RAZAOSOCIAL", razao_social);

                await timer();
                await page.waitForSelector("li[id=dadosAdicionais]", { timeout: 10000 });
                await page.click("li[id=dadosAdicionais]");
                
                await clearAndSelectOption('contribuinteIcms', "1")
                await clearAndSelectOption('consumidorFinal', "0")
            }





        }
    },
    "create_cte": async () => {
        await page.goto("https://app.egssistemas.com.br/cte", { waitUntil: "domcontentloaded", timeout: 30000 });
        

        const canClickCopy = await requestPermission("Clicar no botão copiar");

        if (canClickCopy) {
            await page.click("button[data-original-title='Copiar']");
        }

        await page.waitForSelector("input[name='valorCarga']", { timeout: 10000 });

        await clearAndSelectOption('destinatario', general_config.destination.cpf_cnpj);
        await clearAndType('valorCarga', general_config.note_fiscal.load_value);

        await clearAndType('prodPredominante', general_config.note_fiscal.type);
        await clearAndType('tipoCarga', general_config.note_fiscal.type);

        await clearAndType('qtdeCarga', general_config.note_fiscal.quantity.toString());

        await clearAndType('valorServico', general_config.note_fiscal.service_recipient.toString());

        await clearAndType('valorReceber', general_config.note_fiscal.service_recipient.toString());

        await page.click('li[id="cteNormal"]');



        //page trucker

        await page.waitForSelector("input[name='valorRedBaseICMS']", { timeout: 10000 });

        await clearAndSelectOption('IDVEICULO', general_config.trucker.plate);

        await clearAndSelectOption("IDMOTORISTA", general_config.driver.cpf);

        await clearAndType('valorbcICMS', general_config.note_fiscal.service_recipient);
        await clearAndType('valorIcms', general_config.note_fiscal.load_icms);

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
            await page.locator('input[name="CHAVENFE"]').fill(key)
            await page.waitForSelector('egs-button-save-popup button', { timeout: 20000 });
            await page.click('egs-button-save-popup button')
            await timer()
        }

        //emissao
        await page.click('li[id="emissao"]');
        await clearAndSelectOption('finalidadeCte', '0');

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
        await timer()
        await clearAndType('vBC', general_config.note_fiscal.service_recipient);
        await timer()

        await clearAndType('vCBS', general_config.tax_reform.Valor_CBS);
        await timer()

        await clearAndType('vIBSUF', general_config.tax_reform.Valor_IBS_UF_IBS);
        await timer()
        await clearAndType('vIBS', general_config.tax_reform.Valor_IBS_UF_IBS);
    },
    "create_trucker": async () => {
        await page.goto("https://app.egssistemas.com.br/veiculo", { waitUntil: "domcontentloaded", timeout: 30000 });
        

        const filterSelector = 'td:nth-of-type(2) input[aria-label="Filtro de célula"]';
        await page.waitForSelector(filterSelector, { visible: true });
        await page.focus(filterSelector);
        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        const responsePromise = listerRequest('Gveiculo');
        await page.locator(filterSelector).fill(general_config.trucker.plate);
        await page.keyboard.press('Enter');
        const response = await responsePromise;
        const responseData = await response.json();
        if (responseData.value && responseData.value.length === 0) {
            await page.click("egs-button-new button");
            await clearAndType("placa", general_config.trucker.plate);
            await clearAndType("renavam", "00187995699");
            await clearAndType("descricaoVeiculo", "SCANIA/T142 H 4X2");
            await clearAndType("pesoVeiculo", "30000");
            await clearAndType("capacidadeKg", "28000");
            await clearAndType("RNTRC", "RNTRC");
        }
    },
    "login": async () => {


        await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });

        
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

    app.get('/api/status', async (req, res) => {
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

        // Remover permissão do array para não aparecer novamente
        const requestIndex = permissionRequests.findIndex(req => req.action === action);
        if (requestIndex !== -1) {
            permissionRequests.splice(requestIndex, 1);
            console.log(`🗑️ Permissão "${action}" removida do array. Restantes: ${permissionRequests.length}`);
        }

        res.json({ success: true });
    });

    // Endpoint para fazer login
    app.post('/api/fazer-login', async (req, res) => {
        try {
            if (!robotCanStart) {
                robotCanStart = true;
            }
            await timer()
            await creations.login()
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
            if (!robotCanStart) {
                return res.json({ success: false, message: 'Robô não está pronto para executar esta ação' });
            }
            const driverData = req.body;

            general_config.driver.cpf = driverData.cpf;
            general_config.driver.name = driverData.name;

            await creations.create_driver();
            res.json({ success: true, message: 'Cadastro de motorista executado com sucesso' });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });

    // Endpoint para cadastro de motorista
    app.post('/api/cadastro-caminhao', async (req, res) => {
        try {
            if (!robotCanStart) {
                return res.json({ success: false, message: 'Robô não está pronto para executar esta ação' });
            }
            const truckData = req.body;
            console.log(truckData)
            general_config.trucker = truckData;

            await creations.create_trucker();
            res.json({ success: true, message: 'Cadastro de caminhão executado com sucesso' });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });

    app.post('/api/registrar-destinatario', async (req, res) => {
        try {
            if (!robotCanStart) {
                return res.json({ success: false, message: 'Robô não está pronto para executar esta ação' });
            }
            const destinationData = req.body;

            general_config.destination.cpf_cnpj = destinationData.cpf_cnpj;
            general_config.destination.razao_social = destinationData.razao_social;
            general_config.destination.cep = destinationData.cep;
            general_config.destination.insc_estadual = destinationData.insc_estadual;
            general_config.destination.numero = destinationData.numero;
            general_config.destination.rua = destinationData.rua;
            general_config.destination.bairro = destinationData.bairro;


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
            if (!robotCanStart) {
                return res.json({ success: false, message: 'Robô não está pronto para executar esta ação' });
            }

            const cteData = req.body;
            general_config = cteData;
            await creations.create_cte();
            console.log('✅ CTe criado com sucesso');
            res.json({ success: true, message: 'CTe criado com sucesso' });

        } catch (error) {
            console.error('❌ Erro no registro de destinatário:', error);
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
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
    browser = controlBrowser;

    // Criar página de controle
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


    await startGlobalLoadingMonitor();

    return controlBrowser;
}

async function clearAndTypeByPlaceholder(placeholder: string, value: string) {
    const selector = `input[placeholder="${placeholder}"]`;
    await page.waitForSelector(selector, { visible: true });

    await page.focus(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    await page.waitForSelector(selector, { timeout: 1000 });
    await page.locator(selector).fill(value);


}

async function clearAndType(name: string, value: string) {
    const selector = `input[name="${name}"]`;
    await page.waitForSelector(selector, { visible: true });

    await page.focus(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    await page.waitForSelector(selector, { timeout: 1000 });
    await page.locator(selector).fill(value);
}

const timer = async () => {
    for (let i = 0; i < general_config.timerDuration; i++) {
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

    if (name === 'contribuinteIcms') {
        wrapper = `egs-nfe-contribuinte-icms[name="${name}"]`
    }

    if (name === 'consumidorFinal') {
        wrapper = `egs-nfe-ind-final[name="${name}"]`
    }

    if (name !== 'contribuinteIcms' && name !== 'consumidorFinal') {
        await page.evaluate((wrapper: any) => {
            const el = document.querySelector(wrapper);
            const btn = el?.querySelector('span#closeBtn');
            btn?.click();
        }, wrapper);
    }


    if (name !== 'finalidadeCte' && name !== 'contribuinteIcms' && name !== 'consumidorFinal') {
        const selector = `${wrapper} input.editComboboxPdr`;
        await page.locator(selector).fill(value);

    } else {
        const selector = `${wrapper} input[type="text"]`;

        await page.waitForSelector(selector, { visible: true });

        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        await page.locator(selector).fill(value);
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
    } else if (name === "consumidorFinal") {
        await page.waitForSelector('egs-nfe-ind-final #egs-select ul.keydownRows', {
            visible: true
        });
        await page.click('egs-nfe-ind-final #egs-select ul.keydownRows:first-of-type');
    }
    else {
        await page.waitForFunction(() => {
            return document.querySelectorAll('#egs-select ul.keydownRows').length > 0;
        });

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

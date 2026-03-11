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
        rntrc: "",
        owner: {
            cpf_cnpj: '',
            razao_social: '',
        },
    },
    reboque: {
        reboque_plate: "",
        reboque_trucker_uf: "",
        reboque_description: "",
        reboque_renavam: "",
        reboque_type_trucker: "",
        reboque_type_wheelset: "",
        reboque_type_body: "",
        reboque_type_owner: "",
        reboque_weight: "",
        reboque_capacity: "",
        reboque_rntrc: "",
        reboque_owner: {
            cpf_cnpj: '',
            razao_social: '',
        },
    },
    docs: {
        access_key: [] as string[]
    },
    tax_reform: {
        Valor_CBS: "",
        Valor_IBS_UF_IBS: ""
    },
    timerDuration: 1
}

let isPaused = false;
let shouldStop = false;
let browser: any = null;
let page: any = null;
let loadingMonitorInterval: any = null;
let controlPage: any = null;

let pendingPermission: { action: string; resolve: (value: boolean) => void } | null = null;
let permissionRequests: Array<{ action: string; timestamp: number }> = [];
let robotCanStart = false;

// Função para processar XML e extrair informações
function processarXML(xmlContent: string) {
    try {
        // Extrair informações usando regex (mais robusto que parser XML)
        const extrairCampo = (tag: string): string => {
            const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
            const match = xmlContent.match(regex);
            return match && match[0] ? match[0].replace(/<[^>]*>/g, '').trim() : '';
        };

        // Extrair chave de acesso
        const chaveAcesso = extrairCampo('chNFe')
        // Extrair dados do destinatário
        const destinatarioCNPJ = xmlContent.match(/<dest>[\s\S]*?<CNPJ>([^<]*)<\/CNPJ>[\s\S]*?<\/dest>/)?.[1] || '';
        const destinatarioIE = xmlContent.match(/<dest>[\s\S]*?<IE>([^<]+)<\/IE>[\s\S]*?<\/dest>/)?.[1] || '';
        // Extrair dados da nota fiscal
        const valorTotal = extrairCampo('vNF') || '';
        const quantidade = extrairCampo('qVol') || '';
        const valorICMS = extrairCampo('vICMS') || '';
        const tipoProduto = extrairCampo('esp') || '';
        const valorBruto = extrairCampo('pesoB') || '';
        const destinatarioUF = xmlContent.match(/<dest>[\s\S]*?<enderDest>[\s\S]*?<UF>([^<]*)<\/UF>[\s\S]*?<\/enderDest>[\s\S]*?<\/dest>/)?.[1] || '';

        const custoPorEstado = [
            {
                UF: "CE", value: 0.69
            },
            {
                UF: "PE", value: 0.62
            }
        ]

        general_config.destination.cpf_cnpj = formatarCNPJ(destinatarioCNPJ);
        general_config.destination.insc_estadual = destinatarioIE;
        general_config.note_fiscal.load_value = valorTotal;
        general_config.note_fiscal.quantity = quantidade;
        general_config.note_fiscal.load_service = valorTotal;
        general_config.note_fiscal.type = tipoProduto;
        general_config.note_fiscal.service_recipient = (parseFloat(valorBruto) * (custoPorEstado.find((item) => item.UF === destinatarioUF)?.value || 0)).toString();
        general_config.note_fiscal.load_icms = valorICMS;
        general_config.destination.insc_estadual = destinatarioIE

        if (chaveAcesso) {
            general_config.docs.access_key = [chaveAcesso];
        }


        return {
            success: true,
            data: general_config,
            message: 'XML processado com sucesso!'
        };

    } catch (error: any) {
        console.error('❌ Erro ao processar XML:', error);
        return {
            success: false,
            error: error.message,
            message: 'Erro ao processar XML'
        };
    }
}

// Função auxiliar para formatar CNPJ
function formatarCNPJ(cnpj: string): string {
    const numeros = cnpj.replace(/\D/g, '');
    if (numeros.length !== 14) return cnpj;

    return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

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

                return isVisible;
            });

            if (isLoading && !isPaused) {
                isPaused = true;
                console.log('🔄 Loading detectado - PAUSANDO TODAS AS OPERAÇÕES');
            } else if (!isLoading && isPaused) {
                isPaused = false;
                console.log('✅ Loading finalizado - RETOMANDO OPERAÇÕES');
            }
        } catch (error: any) {
            if (isPaused) {
                isPaused = false;
            }
        }
    }, 200); // Reduzi para 200ms para detectar mais rápido
}

function requestPermission(action: string): Promise<boolean> {
    return new Promise((resolve) => {
        pendingPermission = { action, resolve };
        permissionRequests.push({
            action,
            timestamp: Date.now()
        });
    });
}

async function listerRequest(includes: string, expectedValue: string) {
    return await page.waitForResponse((res: any) => {
        const urlRaw = res.url();
        const method = res.request().method();

        // Ignora OPTIONS e URLs que não batem com o "includes"
        if (method === 'OPTIONS' || !urlRaw.includes(includes)) {
            return false;
        }

        const postData = res.request().postData() || "";

        // 1. Decodifica a URL (Transforma %2F em /)
        const urlDecoded = decodeURIComponent(urlRaw);

        // 2. Prepara o valor esperado (minúsculo)
        const lowerExpected = expectedValue.toLowerCase();

        // 3. Versão do valor apenas com números (caso a API limpe os pontos)
        const cleanValue = expectedValue.replace(/\D/g, "");

        // COMPARAÇÃO:
        // Verificamos na URL decodificada para aceitar a barra "/"
        // Verificamos na URL bruta caso o valor passado já esteja codificado
        // Verificamos apenas números por segurança
        const match =
            urlDecoded.toLowerCase().includes(lowerExpected) ||
            urlRaw.toLowerCase().includes(lowerExpected) ||
            urlRaw.includes(cleanValue) ||
            postData.toLowerCase().includes(lowerExpected);

        if (match) {
            console.log(`Requisição capturada para: ${expectedValue}`);
        }

        return match;
    }, { timeout: 15000 });
}

async function listerRequestCNPJ(includes: string, expectedValue: string) {
    console.log(`Aguardando resposta da API para: ${expectedValue}...`);

    const response = await page.waitForResponse(async (res: any) => {
        const urlRaw = res.url();
        const method = res.request().method();

        // 1. Filtro básico: Método e se a URL contém o endpoint (ex: "GetCadastroReceiraFederal")
        if (method !== 'GET' || !urlRaw.includes(includes)) {
            return false;
        }

        // 2. Limpeza para comparação (Remove pontos/traços do CNPJ esperado)
        const cleanValue = expectedValue.replace(/\D/g, "");
        const urlDecoded = decodeURIComponent(urlRaw);

        // 3. Verifica se o CNPJ limpo está na URL
        const isMatch = urlRaw.includes(cleanValue) || urlDecoded.includes(cleanValue);

        if (isMatch) {
            console.log(`✅ Requisição detectada: ${urlRaw}`);
            // Opcional: Verificar se o status é 200
            return res.status() === 200;
        }

        return false;
    }, { timeout: 20000 });

    // Retorna o JSON da resposta para você usar os dados se quiser
    return await response.json();
}

const creations = {
    "create_driver": async () => {
        const { cpf, name } = general_config.driver;

        await page.goto("https://app.egssistemas.com.br/cadastro-geral", {
            waitUntil: "networkidle2",
            timeout: 30000
        });
        await timer()

        const responsePromise = listerRequest('Gcadastro', cpf);

        const filterSelector = 'td:nth-of-type(3) input[aria-label="Filtro de célula"]';
        await page.waitForSelector(filterSelector, { visible: true });
        await page.focus(filterSelector);
        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        await page.locator(filterSelector).fill(cpf);
        await page.keyboard.press('Enter');

        const response = await responsePromise;
        const responseData = await response.json();
        await timer()
        if (responseData.value && responseData.value.length === 0) {
            await page.click("egs-button-new button");
            await clearAndType("cpfCnpj", cpf);
            await timer();
            await clearAndType("RAZAOSOCIAL", name);
        }
        const canClickCreate = await requestPermission("Salvar motorista?");
        if (canClickCreate) {
            await page.click("egs-button-save-popup button");
        } else {
            return
        }

    },
    "create_destination": async () => {
        try {

            const { cpf_cnpj, insc_estadual, razao_social, cep, numero, bairro, rua } = general_config.destination;

            await page.goto("https://app.egssistemas.com.br/cadastro-geral", {
                waitUntil: "networkidle2",
                timeout: 30000
            });
            await timer()

            const responsePromise = listerRequest('Gcadastro', cpf_cnpj);

            const filterSelector = 'td:nth-of-type(3) input[aria-label="Filtro de célula';
            await page.waitForSelector(filterSelector, { visible: true });
            await page.click(filterSelector, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await timer();
            await page.locator(filterSelector).fill(cpf_cnpj);
            await page.keyboard.press('Enter');

            const response = await responsePromise;
            const responseData = await response.json();
            await timer()
            if (responseData.value && responseData.value.length === 0) {
                await page.click("egs-button-new button");
                await timer()
                await timer()
                await timer()
                clearAndType("cpfCnpj", cpf_cnpj);
                await timer()
                await timer()
                await timer()

                await timer()
                await timer()
                await timer()
                if (cpf_cnpj.length === 18) {
                    const submitButton = 'span[id=butonConsultaCpfCnpj]';
                    await page.waitForSelector(submitButton);
                    await page.click(submitButton);
                    await listerRequestCNPJ('GetCadastroReceiraFederal', cpf_cnpj);
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

                    listerRequest("GetCEP", cep)
                    await page.click("#buttonCep");
                    await timer();

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
                    }

                    clearAndType("RAZAOSOCIAL", razao_social);

                    await timer();
                    await page.waitForSelector("li[id=dadosAdicionais]", { timeout: 10000 });
                    await page.click("li[id=dadosAdicionais]");

                    await clearAndSelectOption('contribuinteIcms', "1")
                    await clearAndSelectOption('consumidorFinal', "0")
                }
                const canClickCreate = await requestPermission("Salvar destinatário?");
                if (canClickCreate) {
                    await page.click("egs-button-save-popup button");
                } else {
                    return
                }
            }
        } catch (er) {
            console.log(er)
        }
    },
    "create_owner": async (isReboque: boolean) => {
        try {
            const { cpf_cnpj, razao_social } = isReboque ? general_config.reboque.reboque_owner : general_config.trucker.owner;

            await page.goto("https://app.egssistemas.com.br/cadastro-geral", {
                waitUntil: "networkidle2",
                timeout: 30000
            });
            await timer()

            const responsePromise = listerRequest('Gcadastro', cpf_cnpj);

            const filterSelector = 'td:nth-of-type(3) input[aria-label="Filtro de célula';
            await page.waitForSelector(filterSelector, { visible: true });
            await page.click(filterSelector, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await timer();
            await page.locator(filterSelector).fill(cpf_cnpj);
            await page.keyboard.press('Enter');

            const response = await responsePromise;
            const responseData = await response.json();
            await timer()
            if (responseData.value && responseData.value.length === 0) {
                await page.click("egs-button-new button");
                await timer()
                await timer()
                await timer()
                clearAndType("cpfCnpj", cpf_cnpj);
                await timer()
                await timer()
                await timer()

                await timer()
                await timer()
                await timer()
                if (cpf_cnpj.length === 18) {
                    const submitButton = 'span[id=butonConsultaCpfCnpj]';
                    await page.waitForSelector(submitButton);
                    await page.click(submitButton);
                    await listerRequestCNPJ('GetCadastroReceiraFederal', cpf_cnpj);
                    await timer();
                }
                else {
                    clearAndType("RAZAOSOCIAL", razao_social);
                    await timer();
                    await page.waitForSelector("li[id=dadosAdicionais]", { timeout: 10000 });
                    await page.click("li[id=dadosAdicionais]");

                    await clearAndSelectOption('contribuinteIcms', "1")
                    await clearAndSelectOption('consumidorFinal', "0")
                }
            }
            const canClickCreate = await requestPermission("Salvar proprietário?");
            if (canClickCreate) {
                await page.click("egs-button-save-popup button");
            } else {
                return
            }
        } catch (er) {
            console.log(er)
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
        const responsePromise = listerRequest('Gveiculo', general_config.trucker.plate);
        const filterSelector = 'td:nth-of-type(2) input[aria-label="Filtro de célula"]';
        await page.waitForSelector(filterSelector, { visible: true });
        await page.focus(filterSelector);
        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.locator(filterSelector).fill(general_config.trucker.plate);
        await page.keyboard.press('Enter');
        const response = await responsePromise;
        const responseData = await response.json();
        if (responseData.value && responseData.value.length === 0) {
            await page.click("egs-button-new button");
            await timer()
            await clearAndType("placa", general_config.trucker.plate);
            await timer()
            await clearAndType("renavam", general_config.trucker.renavam);
            await timer()
            await clearAndType("descricaoVeiculo", general_config.trucker.description);
            await timer()
            await clearAndType("pesoVeiculo", general_config.trucker.weight);
            await timer()
            await clearAndType("capacidadeKg", general_config.trucker.capacity);
            await timer()
            await clearAndType("RNTRC", general_config.trucker.rntrc);
            await timer()
            await findAndSelectOption("ufPlaca", general_config.trucker.trucker_uf);
            await timer()
            await findAndSelectOption("tipoVeiculo", general_config.trucker.type_trucker);
            await timer()
            await findAndSelectOption("tipoRodado", general_config.trucker.type_wheelset);
            await timer()
            await findAndSelectOption("tipoCarroceria", general_config.trucker.type_body)
            await timer()
            await findAndSelectOption("tipoProprietario", general_config.trucker.type_owner)
            await page.waitForSelector('egs-gcadastro input.form-control:not([type="hidden"])', { timeout: 10000 });
            await findAndSelectOption("propVeiculo", general_config.trucker.owner.cpf_cnpj)
        }
        const canClickCreate = await requestPermission("Salvar veículo?");
        if (canClickCreate) {
            await page.click("egs-button-save-popup button");
        } else {
            return
        }
    },
    "create_reboque": async () => {
        await page.goto("https://app.egssistemas.com.br/veiculo", { waitUntil: "domcontentloaded", timeout: 30000 });
        const responsePromise = listerRequest('Gveiculo', general_config.reboque.reboque_plate);
        const filterSelector = 'td:nth-of-type(2) input[aria-label="Filtro de célula"]';
        await page.waitForSelector(filterSelector, { visible: true });
        await page.focus(filterSelector);
        await page.click(filterSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.locator(filterSelector).fill(general_config.reboque.reboque_plate);
        await page.keyboard.press('Enter');
        const response = await responsePromise;
        const responseData = await response.json();
        if (responseData.value && responseData.value.length === 0) {
            await page.click("egs-button-new button");
            await timer()
            await clearAndType("placa", general_config.reboque.reboque_plate);
            await timer()
            await clearAndType("renavam", general_config.reboque.reboque_renavam);
            await timer()
            await clearAndType("descricaoVeiculo", general_config.reboque.reboque_description);
            await timer()
            await clearAndType("pesoVeiculo", general_config.reboque.reboque_weight);
            await timer()
            await clearAndType("capacidadeKg", general_config.reboque.reboque_capacity);
            await timer()
            await clearAndType("RNTRC", general_config.reboque.reboque_rntrc);
            await timer()
            await findAndSelectOption("ufPlaca", general_config.reboque.reboque_trucker_uf);
            await timer()
            await findAndSelectOption("tipoVeiculo", general_config.reboque.reboque_type_trucker);
            await timer()
            await findAndSelectOption("tipoRodado", general_config.reboque.reboque_type_wheelset);
            await timer()
            await findAndSelectOption("tipoCarroceria", general_config.reboque.reboque_type_body)
            await timer()
            await findAndSelectOption("tipoProprietario", general_config.reboque.reboque_type_owner)
            await page.waitForSelector('egs-gcadastro input.form-control:not([type="hidden"])', { timeout: 10000 });
            await findAndSelectOption("propVeiculo", general_config.reboque.reboque_owner.cpf_cnpj)
        }
        const canClickCreate = await requestPermission("Salvar reboque?");
        if (canClickCreate) {
            await page.click("egs-button-save-popup button");
        } else {
            return
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
        await creations.create_owner(true)
        await creations.create_owner(false)
        await creations.create_trucker()
        await creations.create_reboque()
        await creations.create_cte()
    }
}

async function findAndSelectOption(placeholder: string, value: string) {
    while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const selectors: Record<string, string> = {
        "tipoVeiculo": "egs-cte-tipo-veiculo",
        "tipoRodado": "egs-gveiculo-rodado",
        "tipoCarroceria": "egs-gveiculo-carroceria",
        "tipoProprietario": "egs-cte-tipo-proprietario",
        "ufPlaca": "egs-gestado",
        "propVeiculo": "egs-gcadastro"
    };

    const containerTag = selectors[placeholder];
    if (!containerTag) return;

    const inputSelector = `${containerTag} input.form-control:not([type="hidden"])`;
    const itemSelector = `${containerTag} ul.keydownRows`;
    const notFoundSelector = `${containerTag} .mgs-select`;

    try {
        await page.waitForSelector(inputSelector, { visible: true });

        // 1. Limpeza e Preenchimento com Validação (IGUAL AO CLEARANDTYPE)
        await page.click(inputSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        // Digita com delay para o Angular acompanhar o filtro
        await page.type(inputSelector, value, { delay: 40 });

        // GARANTE que o texto no input é o que queremos antes de prosseguir
        await page.waitForFunction(
            (sel: string, val: string) => {
                const el = document.querySelector(sel) as HTMLInputElement;
                return el && el.value.toLowerCase().includes(val.toLowerCase());
            },
            { timeout: 5000 },
            inputSelector,
            value
        );

        // 2. Aguarda o loader específico do componente sumir
        await page.waitForFunction((tag: string) => {
            const loader = document.querySelector(`${tag} .bg-box-select-text`);
            return !loader || loader.classList.contains('ng-hide') || loader.innerHTML === '';
        }, { timeout: 10000 }, containerTag);

        // Pequena pausa para o DOM estabilizar a lista de resultados
        await new Promise(r => setTimeout(r, 400));

        // 3. Verifica se apareceu "Pesquisa não encontrada"
        const isNotFound = await page.evaluate((sel: string) => {
            const el = document.querySelector(sel) as HTMLElement;
            return el && !el.classList.contains('ng-hide') && el.offsetHeight > 0;
        }, notFoundSelector);

        if (isNotFound) {
            console.log(`Valor "${value}" não encontrado em ${placeholder}.`);

            return;
        }

        // 4. Seleção Inteligente
        // Se for propVeiculo ou campos de busca pesada, usamos teclado (mais estável)
        if (placeholder === "propVeiculo" || placeholder === "ufPlaca") {
            await page.focus(inputSelector);
            await page.keyboard.press('ArrowDown');
            await new Promise(r => setTimeout(r, 100));
            await page.keyboard.press('Enter');
        } else {
            // Para os demais, espera a lista estar visível e clica no primeiro
            await page.waitForSelector(itemSelector, { visible: true, timeout: 5000 });
            const items = await page.$$(itemSelector);
            if (items.length > 0) {
                // Força o clique via evaluate para evitar erro de "Not Clickable"
                await page.evaluate((sel: string) => {
                    const firstItem = document.querySelector(sel) as HTMLElement;
                    firstItem?.click();
                }, itemSelector);
            }
        }

        // Espera o input "perder o foco" ou a lista sumir para confirmar a seleção
        await page.waitForSelector(itemSelector, { hidden: true, timeout: 2000 }).catch(() => { });

    } catch (error: any) {
        console.error(`Erro crítico no campo ${placeholder}:`, error.message);
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

        // Processar permissão pendente
        if (pendingPermission && pendingPermission.action === action) {
            pendingPermission.resolve(granted);
            pendingPermission = null;
        }

        // Remover permissão do array para não aparecer novamente
        const requestIndex = permissionRequests.findIndex(req => req.action === action);
        if (requestIndex !== -1) {
            permissionRequests.splice(requestIndex, 1);
        }

        res.json({ success: true });
    });

    // Endpoint para processar XML
    app.post('/api/processar-xml', (req, res) => {
        try {
            const { xmlContent } = req.body;

            if (!xmlContent) {
                return res.json({
                    success: false,
                    message: 'Conteúdo XML não fornecido'
                });
            }

            const resultado = processarXML(xmlContent);
            res.json(resultado);

        } catch (error: any) {
            console.error('❌ Erro no endpoint /api/processar-xml:', error);
            res.json({
                success: false,
                error: error.message,
                message: 'Erro ao processar XML no servidor'
            });
        }
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
            general_config.trucker = truckData;

            await creations.create_owner(false);
            const continueButton = await requestPermission("Continuar cadastro");

            if (continueButton) {
                await page.click("button[data-original-title='Copiar']");
            }
            await creations.create_trucker();
            res.json({ success: true, message: 'Cadastro de caminhão executado com sucesso' });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            res.json({ success: false, message: errorMessage });
        }
    });

    app.post('/api/cadastro-reboque', async (req, res) => {
        try {
            if (!robotCanStart) {
                return res.json({ success: false, message: 'Robô não está pronto para executar esta ação' });
            }
            const reboqueData = req.body;
            general_config.reboque = reboqueData;
            console.log("Reboque data:", reboqueData);

            await creations.create_reboque();
            // await creations.create_owner(true);
            res.json({ success: true, message: 'Cadastro de reboque executado com sucesso' });

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
            res.json({ success: true, message: 'Registro de destinatário executado com sucesso' });

        } catch (error) {
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
            res.json({ success: true, message: 'CTe criado com sucesso' });

        } catch (error) {
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
    while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const selector = `input[placeholder="${placeholder}"]`;
    await page.waitForSelector(selector, { visible: true });

    await page.focus(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    await page.waitForSelector(selector, { timeout: 1000 });
    await page.locator(selector).fill(value);


}

async function clearAndType(name: string, value: string) {
    // Aguarda se estiver pausado por loading
    while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    const selector = `input[name="${name}"]`;
    await page.waitForSelector(selector, { visible: true });

    // 1. Foca e limpa o campo de forma agressiva
    await page.focus(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    // 2. Digita com um delay de 50ms a 100ms entre as teclas
    // Isso evita que o script de máscara do site se perca
    await page.type(selector, String(value));

    // 3. Verifica se o foco não fugiu (opcional)
    // Se o foco pulou antes da hora, você pode forçar o clique novamente
}

const timer = async () => {
    for (let i = 0; i < general_config.timerDuration; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
};

async function clearAndSelectOption(name: string, value: string) {
    while (isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
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

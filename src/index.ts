import puppeteer from "puppeteer";
import readlineSync from "readline-sync";

async function main() {
    const login = "FINANCEIRO"
    const password = "inter2026"
    const key = "50201"
    console.log("Iniciando robô de web scraping para EGS...");

    const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    console.log("Acessando página de login...");
    try {
        await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
        console.log("Erro ao carregar página. Tentando novamente...");
        await page.goto("https://app.egssistemas.com.br/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    console.log("Página carregada. Verificando se há verificação de robô...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    const hasCaptcha = await page.$(".g-recaptcha, iframe[src*=\"recaptcha\"], .captcha, [class*=\"captcha\"]") !== null;

    if (hasCaptcha) {
        console.log("Verificação de robô detectada! Aguardando você resolver...");
        console.log("Por favor, resolva a verificação de robô na página.");
    }

    console.log("Preenchendo formulário de login automaticamente...");
    
    // Preencher os campos do formulário
    try {
        await page.waitForSelector('input[name="login"]', { timeout: 10000 });
        await page.type('input[name="login"]', login);
        console.log("Campo login preenchido");
        
        await page.waitForSelector('input[name="senha"]', { timeout: 10000 });
        await page.type('input[name="senha"]', password);
        console.log("Campo senha preenchido");
        
        await page.waitForSelector('input[name="chaveAcesso"]', { timeout: 10000 });
        await page.type('input[name="chaveAcesso"]', key);
        console.log("Campo chaveAcesso preenchido");
        
        // Aguardar um pouco antes de submeter
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Tentar encontrar e clicar no botão de login
        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
            await submitButton.click();
            console.log("Formulário submetido automaticamente");
        } else {
            console.log("Botão de submit não encontrado. Pressione ENTER para continuar...");
            readlineSync.question("");
        }
    } catch (error) {
        console.log("Erro ao preencher formulário automaticamente:", error);
        console.log("Por favor, faça o login manualmente na página aberta.");
        console.log("Depois de fazer o login, pressione ENTER para continuar...");
        readlineSync.question("");
    }

    console.log("Verificando se o login foi bem-sucedido...");
    const currentUrl = page.url();

    if (currentUrl.includes("dashboard") || currentUrl.includes("home") || !currentUrl.includes("login")) {
        console.log("Login realizado com sucesso!");
        console.log("URL atual:", currentUrl);
        console.log("Robô aguardando instruções...");
        console.log("Pressione ENTER para capturar dados da página atual ou Ctrl+C para sair:");
        readlineSync.question("");

        const pageContent = await page.content();
        console.log("Conteúdo da página capturado com sucesso!");
        console.log("Tamanho do conteúdo:", pageContent.length, "caracteres");

        await page.screenshot({ path: "screenshot.png", fullPage: true });
        console.log("Screenshot salvo como screenshot.png");
    } else {
        console.log("Login não foi bem-sucedido. Verifique suas credenciais.");
    }

    console.log("Pressione ENTER para fechar o navegador...");
    readlineSync.question("");

    await browser.close();
    console.log("Robô finalizado.");
}

main().catch(console.error);

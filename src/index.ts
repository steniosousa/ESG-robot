import puppeteer from "puppeteer";
import readlineSync from "readline-sync";

async function main() {
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
    
    console.log("Por favor, faça o login com seu email e senha na página aberta.");
    console.log("Depois de fazer o login, pressione ENTER para continuar...");
    readlineSync.question("");
    
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

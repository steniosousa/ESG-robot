# 🤖 Robô ESG com Controle Web e Sistema de Permissões

Robô de web scraping para o sistema ESG com interface de controle web que permite pausar, retomar, parar e **autorizar cada ação** do processo.

## 🚀 Funcionalidades

- ✅ Automação de login e navegação no sistema ESG
- 🌐 Interface web de controle em tempo real
- ⏸️ Pausar execução a qualquer momento
- ▶️ Retomar execução pausada
- ⏹️ Parar processo completamente
- 🔐 **Sistema de permissões para cada ação**
- 📊 Status em tempo real da execução
- 📋 Log de eventos com timestamps
- 🖥️ **Janela flutuante ao lado do Chrome**
- 🏠 **Aplicação Desktop (Electron)**
- 📮 **Busca automática de CEP**
- 📝 **Máscaras de CPF/CNPJ e CEP**

## 📋 Pré-requisitos

- Node.js instalado
- Navegador Chrome/Chromium
- Dois monitores ou espaço suficiente para duas janelas

## 🔧 Instalação

1. Instale as dependências:
```bash
npm install
```

2. Execute o robô:
```bash
npm start
```

## 🖥️ **Versão Desktop (Executável)**

### Desenvolvimento Electron
```bash
npm run electron-dev
```

### Build para Windows
```bash
npm run build-win
```

### Build Geral
```bash
npm run build
```

O executável será gerado na pasta `dist/` com instalador completo para Windows.

### Funcionalidades da Versão Desktop:
- 🚀 **Aplicação independente** (não precisa abrir navegador separado)
- 🖥️ **Interface integrada** em janela desktop
- 📦 **Instalador profissional** com atalhos
- 🎯 **Servidor backend embutido**
- 📁 **Portabilidade completa**

## 🌐 Interface de Controle

Após iniciar o robô, **duas janelas** serão abertas:

1. **Janela do Chrome** (esquerda): Onde o robô executa as ações
2. **Janela de Controle** (direita): Onde você controla o processo

Acesse também: **http://localhost:3333** (se a janela não abrir automaticamente)

### 🔐 **Sistema de Permissões**

**Cada ação do robô requer sua autorização!**

O robô irá solicitar permissão para:
- 🚀 Iniciar navegador Chrome
- 🌐 Acessar página de login
- 📝 Preencher formulário de login
- 📄 Navegar para página CTE
- 🔘 Clicar no botão Novo
- 📋 Preencher dados do CT-e
- 🚚 Preencher dados do veículo

### Controles Disponíveis:

- **⏸️ Pausar**: Interrompe temporariamente a execução
- **▶️ Retomar**: Continua a execução pausada
- **⏹️ Parar**: Finaliza completamente o processo
- **✅ Permitir**: Autoriza uma ação solicitada
- **❌ Negar**: Recusa uma ação solicitada

### Status Visual:

- 🟢 **Executando**: Robô em operação normal
- 🟡 **Pausado**: Execução interrompida temporariamente
- 🔴 **Parado**: Processo finalizado
- 🔔 **Aguardando**: Aguardando sua permissão

## 📁 Estrutura do Projeto

```
ESG-robot/
├── src/
│   └── index.ts          # Código principal do robô
├── public/
│   └── index.html        # Interface web de controle
├── package.json          # Dependências e scripts
└── README.md            # Este arquivo
```

## 🔧 Configuração

As credenciais e configurações estão definidas no início do arquivo `src/index.ts`:

```typescript
const login = "FINANCEIRO"
const password = "inter2026"
const key = "50201"
```

## 🚨 **Como Usar o Sistema de Permissões**

1. **Iniciar o Robô**:
   ```bash
   npm start
   ```

2. **Aguardar as Janelas**:
   - Janela do Chrome abrirá para automação
   - Janela de Controle abrirá ao lado

3. **Monitorar Solicitações**:
   - Cada ação aparecerá na seção "🔔 Solicitações de Permissão"
   - Você terá 30 segundos para responder

4. **Autorizar ou Negar**:
   - ✅ **Permitir**: A ação será executada
   - ❌ **Negar**: A ação será pulada

5. **Controlar Execução**:
   - Use ⏸️ Pausar se precisar de mais tempo
   - Use ▶️ Retomar para continuar
   - Use ⏹️ Parar para finalizar tudo

## 📱 **Fluxo de Trabalho Típico**

1. Robô solicita: *"Iniciar navegador Chrome"*
2. Você clica: ✅ **Permitir**
3. Robô solicita: *"Acessar página de login"*
4. Você clica: ✅ **Permitir**
5. Robô solicita: *"Preencher formulário de login"*
6. Você clica: ✅ **Permitir**
7. ... e assim por diante

## 🔍 Logs e Monitoramento

A interface web exibe:
- Status atual do processo
- **Solicitações de permissão pendentes**
- Histórico de ações
- Timestamps de cada evento
- Indicadores visuais de estado

## 🛠️ Tecnologias

- **TypeScript**: Linguagem principal
- **Puppeteer**: Automação web e janelas
- **Express**: Servidor web
- **HTML/CSS/JavaScript**: Interface de controle

## 📝 Notas Importantes

- O servidor web roda na porta 3333
- **A janela de controle é posicionada automaticamente ao lado**
- **Cada solicitação tem timeout de 30 segundos**
- **Se não responder, a permissão é negada automaticamente**
- Logs são mantidos na interface (últimas 30 entradas)
- **O robô NÃO executa nenhuma ação sem sua permissão!**

## 🎯 **Vantagens do Sistema**

- 🔐 **Controle total**: Você decide cada ação
- 🛡️ **Segurança**: Nada é executado sem autorização
- ⏸️ **Flexibilidade**: Pausa a qualquer momento
- 📊 **Transparência**: Veja exatamente o que está acontecendo
- 🖥️ **Conveniência**: Interface dedicada ao lado do Chrome

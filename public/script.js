let currentStatus = { isPaused: false, shouldStop: false, isRunning: false, permissionRequests: [] };
let knownPermissions = new Set();
let pendingPermissions = [];
let accessKeys = [];

// Função para ler arquivo XML selecionado
function lerArquivoXML(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Mostrar informações do arquivo
    document.getElementById('file_info').style.display = 'block';
    document.getElementById('file_name').textContent = file.name;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const xmlContent = e.target.result;
        document.getElementById('xml_content').value = xmlContent;
        showNotification(`📁 Arquivo "${file.name}" carregado com sucesso!`, 'success');
    };
    
    reader.onerror = function() {
        showNotification('❌ Erro ao ler o arquivo XML', 'error');
    };
    
    reader.readAsText(file);
}

// Função para processar XML
async function processarXML() {
    const xmlContent = document.getElementById('xml_content').value.trim();
    
    if (!xmlContent) {
        showNotification('❌ Selecione um arquivo XML para processar', 'error');
        return;
    }

    showNotification('🔄 Processando XML...', 'info');
    
    try {
        const response = await fetch('/api/processar-xml', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ xmlContent })
        });

        const result = await response.json();

        if (result.success) {
            // Preencher campos com os dados extraídos
            if (result.data.destination.cpf_cnpj) {
                document.getElementById('dest_cpf_cnpj').value = result.data.destination.cpf_cnpj;
                // Dispara o evento para formatar e buscar CNPJ
                document.getElementById('dest_cpf_cnpj').dispatchEvent(new Event('input'));
            }
            
            if (result.data.destination.razao_social) {
                document.getElementById('dest_razao_social').value = result.data.destination.razao_social;
            }
            
            if (result.data.note_fiscal.load_value) {
                document.getElementById('note_fiscal_load_value').value = result.data.note_fiscal.load_value;
            }
            
            if (result.data.note_fiscal.quantity) {
                document.getElementById('note_fiscal_quantity').value = result.data.note_fiscal.quantity;
            }
            
            if (result.data.note_fiscal.type) {
                document.getElementById('note_fiscal_type').value = result.data.note_fiscal.type;
            }
            
            if (result.data.note_fiscal.load_icms) {
                document.getElementById('note_fiscal_load_icms').value = result.data.note_fiscal.load_icms;
            }
            
            if (result.data.note_fiscal.service_recipient) {
                document.getElementById('note_fiscal_service_recipient').value = result.data.note_fiscal.service_recipient;
                calcPercent(); // Recalcula percentuais
            }
            
            // Adicionar chaves de acesso
            if (result.data.docs.access_key && result.data.docs.access_key.length > 0) {
                accessKeys = [...accessKeys, ...result.data.docs.access_key];
                updateKeysList();
            }

            
            showNotification('✅ XML processado e campos preenchidos!', 'success');
            
        } else {
            showNotification(result.message, 'error');
        }
        
    } catch (error) {
        showNotification('❌ Erro ao processar XML', 'error');
    }
}

// Função para limpar campo XML
function limparXML() {
    document.getElementById('xml_content').value = '';
    document.getElementById('file_info').style.display = 'none';
    document.getElementById('xml_file').value = '';
    showNotification('🧹 Campos XML limpos', 'info');
}

// Função para buscar dados do CNPJ
async function buscarCnpj(cnpj) {
    try {
        // Remove caracteres não numéricos do CNPJ
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        
        if (cnpjLimpo.length !== 14) {
            console.log('CNPJ incompleto, aguardando...');
            return;
        }

        showNotification('🔍 Buscando dados do CNPJ...', 'info');

        // API BrasilAPI (gratuita e confiável)
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);

        if (!response.ok) {
            throw new Error('CNPJ não encontrado na base de dados');
        }

        const data = await response.json();

        document.getElementById('dest_razao_social').value = data.razao_social || '';
        document.getElementById('dest_cep').value = data.cep || '';
        document.getElementById('dest_rua').value = data.logradouro || '';
        document.getElementById('dest_numero').value = data.numero || '';
        document.getElementById('dest_bairro').value = data.bairro || '';
        document.getElementById('dest_cidade').value = data.municipio || '';
        document.getElementById('dest_insc_estadual').focus();

        showNotification('✅ Dados do CNPJ preenchidos com sucesso!', 'success');

    } catch (error) {
        console.error('Erro ao buscar CNPJ:', error);
        showNotification('❌ CNPJ não encontrado. Preencha os dados manualmente.', 'error');
    }
}

function formatarCpfCnpj(input) {
    let value = input.value.replace(/\D/g, ''); // Remove caracteres não numéricos

    // Limita o comprimento máximo
    if (value.length > 14) {
        value = value.substring(0, 14);
    }

    // Formata como CPF (XXX.XXX.XXX-XX) ou CNPJ (XX.XXX.XXX/XXXX-XX)
    if (value.length <= 11) {
        // Formato CPF: XXX.XXX.XXX-XX
        if (value.length <= 3) {
            value = value;
        } else if (value.length <= 6) {
            value = value.replace(/(\d{3})(\d{0,3})/, '$1.$2');
        } else if (value.length <= 9) {
            value = value.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
        } else {
            value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
        }
    } else {
        // Formato CNPJ: XX.XXX.XXX/XXXX-XX
        if (value.length <= 2) {
            value = value;
        } else if (value.length <= 5) {
            value = value.replace(/(\d{2})(\d{0,3})/, '$1.$2');
        } else if (value.length <= 8) {
            value = value.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
        } else if (value.length <= 12) {
            value = value.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
        } else {
            value = value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
        }
    }

    input.value = value;

    // Se for CNPJ completo (18 caracteres formatados), busca automático
    if (value.length === 18 && input.id === 'dest_cpf_cnpj') {
        buscarCnpj(input.value);
    }
}

function formatarCep(input) {
    let value = input.value.replace(/\D/g, ''); // Remove caracteres não numéricos

    // Limita o comprimento máximo
    if (value.length > 8) {
        value = value.substring(0, 8);
    }

    // Formata CEP: XXXXX-XXX
    if (value.length <= 5) {
        value = value;
    } else if (value.length <= 8) {
        value = value.replace(/(\d{5})(\d{0,3})/, '$1-$2');
    }

    input.value = value;

    // Se o CEP estiver completo (8 dígitos), busca automaticamente
    if (value.length === 9) {
        console.log(' [DEBUG] CEP completo, acionando busca automática:', value);
        buscarCep(value);
    }
}

async function buscarCep(cep) {
    try {
        // Remove caracteres não numéricos do CEP
        const cepLimpo = cep.replace(/\D/g, '');
        console.log(cepLimpo.length, "oi")

        if (cepLimpo.length !== 8) {
            showNotification('CEP deve ter 8 dígitos', 'error');
            return;
        }

        showNotification('🔍 Buscando CEP...', 'info');

        // API ViaCEP (gratuita e confiável)
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);

        console.log(response)
        if (!response.ok) {
            showNotification('Erro ao buscar CEP', 'error');
            return;
        }

        const dados = await response.json();

        if (dados.erro) {
            showNotification('CEP não encontrado', 'error');
            return;
        }

        // Preenche os campos com os dados retornados
        document.getElementById('dest_cep').value = dados.cep;
        document.getElementById('dest_rua').value = dados.logradouro || '';
        document.getElementById('dest_bairro').value = dados.bairro || '';
        document.getElementById('dest_cidade').value = dados.localidade || '';

        showNotification('✅ Endereço preenchido automaticamente!', 'success');

    } catch (error) {
        showNotification('Erro ao buscar CEP', 'error');
    }
}

function calcPercent() {
    let value = document.getElementById('note_fiscal_service_recipient').value;
    console.log(value)
    document.getElementById('v_ibs').value = ((parseFloat(value) * 0.1) / 100).toFixed(2);
    document.getElementById('v_cbs').value = ((parseFloat(value) * 0.9) / 100).toFixed(2);
    if (value == '') {
        document.getElementById('v_ibs').value = '0,1%';
        document.getElementById('v_cbs').value = '0,9%';
        return;
    }

}

setInterval(updateStatus, 1000);

async function updateStatus() {
    try {
        const response = await fetch('/api/status', { method: 'GET' });
        const status = await response.json();
        currentStatus = status;

        checkNewPermissions(status.permissionRequests || []);
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}

function checkNewPermissions(permissionRequests) {
    permissionRequests.forEach(request => {
        const permissionKey = `${request.action}-${request.timestamp}`;
        if (!knownPermissions.has(permissionKey)) {
            knownPermissions.add(permissionKey);
            addPermissionRequest(request.action, request.timestamp);
        }
    });
}

function addPermissionRequest(action, timestamp = Date.now()) {
    // Verificar se já existe
    const exists = pendingPermissions.find(p => p.action === action && p.timestamp === timestamp);
    if (exists) return;

    const permission = {
        id: timestamp,
        action: action,
        timestamp: timestamp
    };

    pendingPermissions.push(permission);
    updatePermissionsList();

    showNotification(`Solicitação: ${action}`, 'info');
}

function updatePermissionsList() {
    const permissionsDiv = document.getElementById('permissions');
    const permissionsList = document.getElementById('permissions-list');

    if (pendingPermissions.length === 0) {
        permissionsDiv.style.display = 'none';
        return;
    }

    permissionsDiv.style.display = 'block';
    permissionsList.innerHTML = '';

    pendingPermissions.forEach(permission => {
        const permissionItem = document.createElement('div');
        permissionItem.className = 'permission-item';
        permissionItem.innerHTML = `
                    <div class="permission-title">📝 ${permission.action}</div>
                    <div class="permission-buttons">
                        <button class="btn-permit" style="background-color: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; margin-right: 5px;" onclick="grantPermission(${permission.id}, true)">
                            ✅ Permitir
                        </button>
                        <button class="btn-deny" style="background-color: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;" onclick="grantPermission(${permission.id}, false)">
                            ❌ Negar
                        </button>
                    </div>
                `;
        permissionsList.appendChild(permissionItem);
    });
}

async function grantPermission(permissionId, granted) {
    const permission = pendingPermissions.find(p => p.id === permissionId);
    if (!permission) return;

    try {
        const response = await fetch('/api/grant-permission', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: permission.action,
                granted: granted
            })
        });

        const result = await response.json();
        if (result.success) {
            pendingPermissions = pendingPermissions.filter(p => p.id !== permissionId);
            updatePermissionsList();

            showNotification(`${permission.action}: ${granted ? 'Permitido' : 'Negado'}`,
                granted ? 'success' : 'error');
        }
    } catch (error) {
        console.error('Erro ao conceder permissão:', error);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;

    if (type === 'success') {
        notification.style.background = '#28a745';
    } else if (type === 'error') {
        notification.style.background = '#dc3545';
    } else if (type === 'warning') {
        notification.style.background = '#ffc107';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

updateStatus();

function addAccessKey() {
    const input = document.getElementById('access_key_input');
    const key = input.value.trim();

    if (!key) {
        showNotification('Digite uma chave de acesso', 'error');
        return;
    }

    if (accessKeys.includes(key)) {
        showNotification('Esta chave já foi adicionada', 'error');
        return;
    }

    accessKeys.push(key);
    input.value = '';
    updateKeysList();
    showNotification('Chave adicionada com sucesso', 'success');
}

// Remover chave de acesso
function removeAccessKey(index) {
    accessKeys.splice(index, 1);
    updateKeysList();
    showNotification('Chave removida', 'warning');
}

// Atualizar lista visual de chaves
function updateKeysList() {
    const keysList = document.getElementById('keys_list');

    if (accessKeys.length === 0) {
        keysList.innerHTML = '<div class="empty-keys">Nenhuma chave de acesso adicionada</div>';
        return;
    }

    keysList.innerHTML = accessKeys.map((key, index) => `
                <div class="key-item">
                    <span class="key-text">${key}</span>
                    <button type="button" class="btn-delete" style="background-color: #dc3545; color: #ffffff; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer;" onclick="removeAccessKey(${index})">
                        Excluir
                    </button>
                </div>
            `).join('');
}

// Adicionar evento Enter no input
document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('access_key_input');
    input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addAccessKey();
        }
    });

    // Adicionar evento de change ao input de arquivo
    const xmlFileInput = document.getElementById('xml_file');
    if (xmlFileInput) {
        xmlFileInput.addEventListener('change', lerArquivoXML);
    }

    // Inicializar lista vazia
    updateKeysList();
});

function validateConfig(type) {
    let requiredFields = [];

    if (type === "driver") {
        const element = document.getElementById("driver_cpf");
        if (element.value.length !== 14) {
            showNotification('CPF do motorista deve ter 14 caracteres', 'error');
            return false;
        }
        requiredFields = [
            { id: 'driver_cpf', name: 'CPF Motorista' },
            { id: 'driver_name', name: 'Nome do Motorista' }
        ];
    } else if (type === "destination") {
        const element = document.getElementById("dest_cpf_cnpj");
        if (element.value.length === 18) {
            requiredFields = [
                { id: 'dest_cpf_cnpj', name: 'CPF/CNPJ do destinatário' },
                { id: 'dest_insc_estadual', name: 'Inscrição Estadual do destinatário' },
            ];
        } else {
            requiredFields = [
                { id: 'dest_cpf_cnpj', name: 'CPF/CNPJ do destinatário' },
                { id: 'dest_razao_social', name: 'Razão Social do destinatário' },
                { id: 'dest_cep', name: 'CEP do destinatário' },
                { id: 'dest_insc_estadual', name: 'Inscrição Estadual do destinatário' },
                { id: 'dest_numero', name: 'Número do destinatário' }
            ];
        }
    } else if (type === "truck") {
        requiredFields = [
            { id: 'plate', name: 'Veículo' },
            { id: 'trucker_uf', name: 'UF do veículo' },
            { id: 'renavam', name: 'renavam' },
            { id: 'description', name: 'Descrição' },
            { id: 'type_trucker', name: 'Tipo do veículo' },
            { id: 'type_wheelset', name: 'Tipo do veículo' },
            { id: 'type_body', name: 'Tipo do veículo' },
            { id: 'type_owner', name: 'Tipo do veículo' },
            { id: 'weight', name: 'Peso' },
            { id: 'capacity', name: 'Capacidade' },
            { id: 'rntrc', name: 'RNTRC' },

        ];
    } else {
        // Validação completa (tipo não especificado)
        requiredFields = [
            { id: 'driver_cpf', name: 'CPF Motorista' },
            { id: 'driver_name', name: 'Nome do Motorista' },
            { id: 'dest_razao_social', name: 'Razão Social do destinatário' },
            { id: 'dest_cpf_cnpj', name: 'CPF/CNPJ do destinatário' },
            { id: 'dest_cep', name: 'CEP do destinatário' },
            { id: 'dest_insc_estadual', name: 'Inscrição Estadual do destinatário' },
            { id: 'dest_numero', name: 'Número do destinatário' },
            { id: 'note_fiscal_load_value', name: 'Valor da Carga' },
            { id: 'note_fiscal_quantity', name: 'Quantidade' },
            { id: 'note_fiscal_service_recipient', name: 'Valor do Serviço' },
            { id: 'note_fiscal_type', name: 'Tipo de Carga' },
            { id: 'note_fiscal_load_icms', name: 'Valor ICMS' },


            { id: 'plate', name: 'Veículo' },
            { id: 'trucker_uf', name: 'UF do veículo' },
            { id: 'renavam', name: 'renavam' },
            { id: 'description', name: 'Descrição' },
            { id: 'type_trucker', name: 'Tipo do veículo' },
            { id: 'type_wheelset', name: 'Tipo do veículo' },
            { id: 'type_body', name: 'Tipo do veículo' },
            { id: 'type_owner', name: 'Tipo do veículo' },
            { id: 'weight', name: 'Peso' },
            { id: 'capacity', name: 'Capacidade' },
            { id: 'rntrc', name: 'RNTRC' },


            { id: 'v_cbs', name: 'Valor CBSe' },
            { id: 'v_ibs', name: 'Valor IBS' }
        ];
    }

    for (const field of requiredFields) {
        const element = document.getElementById(field.id);
        if (!element) {
            console.warn(`Elemento não encontrado: ${field.id}`);
            continue;
        }
        const value = element.value.trim();
        if (element === 'dest_cpf_cnpj' && value.length === 18) {
            requiredFields.filter(field => field.id !== 'dest_cpf_cnpj');
        }

        if (!value) {
            showNotification(`Preencha o campo: ${field.name}`, 'error');
            return false;
        }
    }

    if (type === "cte" && accessKeys.length === 0) {
        showNotification('Adicione pelo menos uma chave de acesso', 'error');
        return false;
    }

    return true;
}


function fazerLogin() {
    showNotification('🚀 Iniciando processo de login...', 'info');
    // Enviar requisição para executar o login
    fetch('/api/fazer-login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('✅ Login executado com sucesso', 'success');
            } else {
                showNotification('❌ Erro ao fazer login', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('❌ Erro de conexão com o servidor', 'error');
        });
}


// Registrar Destinatário
function registrarDestinatario() {
    if (!validateConfig("destination")) {
        return;
    }

    showNotification('🚀 Iniciando registro de destinatário...', 'info');

    let destinationData;
    const contentCpfCnpj = document.getElementById('dest_cpf_cnpj').value
    if (contentCpfCnpj.length === 18) {
        destinationData = {
            cpf_cnpj: contentCpfCnpj,
            insc_estadual: document.getElementById('dest_insc_estadual').value,
        };
    } else {
        destinationData = {
            cpf_cnpj: contentCpfCnpj,
            razao_social: document.getElementById('dest_razao_social').value,
            cep: document.getElementById('dest_cep').value,
            insc_estadual: document.getElementById('dest_insc_estadual').value,
            numero: document.getElementById('dest_numero').value,
            rua: document.getElementById('dest_rua').value,
            bairro: document.getElementById('dest_bairro').value,
            cidade: document.getElementById('dest_cidade').value
        };
    }



    // Enviar requisição para executar o registro de destinatário com os dados atuais
    fetch('/api/registrar-destinatario', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(destinationData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('✅ Destinatário cadastrado com sucesso! Pode cadastrar o próximo.', 'success');
            } else {
                showNotification('❌ Erro ao registrar destinatário', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('❌ Erro de conexão com o servidor', 'error');
        });
}

// Cadastro de Motorista
function cadastrarMotorista() {
    if (!validateConfig("driver")) {
        return;
    }

    showNotification('🚀 Iniciando cadastro de motorista...', 'info');

    // Obter dados atuais do frontend
    const driverData = {
        cpf: document.getElementById('driver_cpf').value,
        name: document.getElementById('driver_name').value
    };

    // Enviar requisição para executar o cadastro de motorista com os dados atuais
    fetch('/api/cadastro-motorista', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(driverData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('✅ Motorista cadastrado com sucesso! Pode cadastrar o próximo.', 'success');
            } else {
                showNotification('❌ Erro ao iniciar cadastro de motorista', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('❌ Erro de conexão com o servidor', 'error');
        });
}


// Cadastro de Caminhão
function cadastrarCaminhao() {
    // if (!validateConfig("truck")) {
    //     return;
    // }
    showNotification('🚀 Iniciando cadastro de caminhão...', 'info');

    const truckData = {
        type_wheelset: document.getElementById('type_wheelset').value,
        type_body: document.getElementById('type_body').value,
        type_owner: document.getElementById('type_owner').value,
        plate: document.getElementById('plate').value,
        trucker_uf: document.getElementById('trucker_uf').value,
        description: document.getElementById("description").value,
        type_trucker: document.getElementById("type_trucker").value,
        weight: document.getElementById("weight").value,
        capacity: document.getElementById("capacity").value,
        rntrc: document.getElementById("rntrc").value,
        owner: {
            cpf_cnpj: '00.000.000/0001-91',
            razao_social: '',
            cep: '',
            insc_estadual: '123456789',
            numero: '',
            rua: '',
            bairro: ''
        }
    };


    // Enviar requisição para executar o cadastro de motorista com os dados atuais
    fetch('/api/cadastro-caminhao', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(truckData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('✅ Motorista cadastrado com sucesso! Pode cadastrar o próximo.', 'success');
            } else {
                showNotification('❌ Erro ao iniciar cadastro de motorista', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification('❌ Erro de conexão com o servidor', 'error');
        });
}

// Criação de CTe
function criarCTE() {
    if (!validateConfig("cte")) {
        return;
    }

    showNotification(' Iniciando criação de CTe...', 'info');

    const config = {
        driver: {
            cpf: document.getElementById('driver_cpf').value,
            name: document.getElementById('driver_name').value
        },
        destination: {
            cpf_cnpj: document.getElementById('dest_cpf_cnpj').value,
            razao_social: document.getElementById('dest_razao_social').value,
            cep: document.getElementById('dest_cep').value,
            insc_estadual: document.getElementById('dest_insc_estadual').value,
            numero: document.getElementById('dest_numero').value,
            rua: document.getElementById('dest_rua').value,
            bairro: document.getElementById('dest_bairro').value
        },
        note_fiscal: {
            load_value: document.getElementById('note_fiscal_load_value').value,
            quantity: parseInt(document.getElementById('note_fiscal_quantity').value),
            load_service: parseFloat(document.getElementById('note_fiscal_load_value').value),
            service_recipient: parseFloat(document.getElementById('note_fiscal_service_recipient').value),
            type: document.getElementById('note_fiscal_type').value,
            load_icms: document.getElementById('note_fiscal_load_icms').value
        },
        trucker: {
            plate: document.getElementById('plate').value,
        },
        docs: {
            access_key: accessKeys
        },
        tax_reform: {
            Valor_CBS: document.getElementById('v_cbs').value,
            Valor_IBS_UF_IBS: document.getElementById('v_ibs').value
        },
        timerDuration: document.getElementById('timer_duration').value
    };

    // Enviar requisição para executar a criação de CTe com os dados atuais
    fetch('/api/create-cte', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(' CTe criado com sucesso! Pode criar o próximo.', 'success');
            } else {
                showNotification(' Erro ao criar CTe', 'error');
            }
        })
        .catch(error => {
            console.error('Erro:', error);
            showNotification(' Erro de conexão com o servidor', 'error');
        });
}

// Log inicial para verificar se o script está sendo executado
console.log('🚀 [INIT] Script carregado!');

let currentStatus = { isPaused: false, shouldStop: false, isRunning: false, permissionRequests: [] };
let knownPermissions = new Set();
let pendingPermissions = [];
let accessKeys = [];

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
}

setInterval(updateStatus, 1000); // Reduzido para 1 segundo

async function updateStatus() {
    try {
        console.log('🔍 [DEBUG] Atualizando status...');
        const response = await fetch('/api/status', { method: 'GET' });
        const status = await response.json();
        console.log('🔍 [DEBUG] Status recebido:', status);
        currentStatus = status;

        checkNewPermissions(status.permissionRequests || []);
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}

function checkNewPermissions(permissionRequests) {
    console.log('🔍 [DEBUG] Verificando novas permissões...');
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

    console.log('🔍 [DEBUG] updatePermissionsList chamado. pendingPermissions:', pendingPermissions.length);

    if (pendingPermissions.length === 0) {
        permissionsDiv.style.display = 'none';
        return;
    }

    permissionsDiv.style.display = 'block';
    permissionsList.innerHTML = '';

    pendingPermissions.forEach(permission => {
        console.log('🔍 [DEBUG] Adicionando permissão:', permission);
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
        console.log('🔍 [DEBUG] Botão adicionado ao DOM');
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

    // Inicializar lista vazia
    updateKeysList();
});

function validateConfig(type) {
    let requiredFields = [];

    // Definir campos por tipo
    if (type === "driver") {
        requiredFields = [
            { id: 'driver_cpf', name: 'CPF Motorista' },
            { id: 'driver_name', name: 'Nome do Motorista' }
        ];
    } else if (type === "destination") {
        requiredFields = [
            { id: 'dest_razao_social', name: 'Razão Social do destinatário' },
            { id: 'dest_cpf_cnpj', name: 'CPF/CNPJ do destinatário' },
            { id: 'dest_cep', name: 'CEP do destinatário' },
            { id: 'dest_insc_estadual', name: 'Inscrição Estadual do destinatário' },
            { id: 'dest_numero', name: 'Número do destinatário' }
        ];
    } else if (type === "vehicle") {
        requiredFields = [
            { id: 'vehicle', name: 'Veículo' },
            { id: 'valor_bc_icms', name: 'Valor BC ICMS' },
            { id: 'valor_icms', name: 'Valor ICMS' }
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
            { id: 'vehicle', name: 'Veículo' },
            { id: 'valor_bc_icms', name: 'Valor BC ICMS' },
            { id: 'valor_icms', name: 'Valor ICMS' },
            { id: 'v_cbs', name: 'Valor CBSe' },
            { id: 'v_bc', name: 'Valor do IBS' },
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

// Registrar Destinatário
function registrarDestinatario() {
    if (!validateConfig("destination")) {
        return;
    }

    showNotification('🚀 Iniciando registro de destinatário...', 'info');

    // Obter dados atuais do frontend
    const destinationData = {
        cpf_cnpj: document.getElementById('dest_cpf_cnpj').value,
        razao_social: document.getElementById('dest_razao_social').value,
        cep: document.getElementById('dest_cep').value,
        insc_estadual: document.getElementById('dest_insc_estadual').value,
        numero: document.getElementById('dest_numero').value,
        rua: document.getElementById('dest_rua').value,
        bairro: document.getElementById('dest_bairro').value,
        cidade: document.getElementById('dest_cidade').value
    };

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

// Cadastro de Caminhão
function cadastrarCaminhao() {
    showNotification('🚀 Iniciando cadastro de caminhão...', 'info');

    // Aqui você pode adicionar a lógica para abrir o formulário de cadastro
    // ou redirecionar para a página de cadastro de caminhão

    setTimeout(() => {
        showNotification(' Formulário de caminhão pronto para preenchimento', 'success');
    }, 1000);
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
            type: document.getElementById('note_fiscal_type').value
        },
        taxes: {
            vehicle: document.getElementById('vehicle').value,
            Valor_BC_ICMS: document.getElementById('valor_bc_icms').value,
            Valor_ICMS: document.getElementById('valor_icms').value
        },
        docs: {
            access_key: accessKeys
        },
        emition: {
            finality: document.getElementById('finality').value
        },
        tax_reform: {
            Valor_BC_IBS_CBS: document.getElementById('v_bc').value,
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
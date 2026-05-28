const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const dbConfig = require('./dbConfig');
const mqtt = require('mqtt');


const app = express();
const port = 3001;

if (!dbConfig) {
    console.error('CRÍTICO: Não foi possível carregar as configurações do banco de dados.');
    process.exit(1);
}

// Configuração do pool de conexões usando o arquivo de logs/Documents
const pool = mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    port: dbConfig.port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.text({ type: 'text/plain' }));
app.use(express.static('public')); // Para servir arquivos estáticos

// Cache para configurações voláteis
let cachedIp = null;
const filial = dbConfig.filial || 'toledo';
const mqttHost = dbConfig.host; // O host do banco remoto é o mesmo do broker MQTT (Coolify)
const mqttUrl = `mqtt://${mqttHost}:1883`;

// Inicializa MQTT com persistência e auto-reconexão
const mqttClient = mqtt.connect(mqttUrl, {
    clientId: `AutoAtend_Node_${filial}_${Math.random().toString(16).slice(2, 8)}`,
    clean: false,
    reconnectPeriod: 5000, // Tenta reconectar a cada 5s se cair
    connectTimeout: 30 * 1000
});

mqttClient.on('connect', () => {
    console.log(`✅ [MQTT] Conectado ao broker: ${mqttUrl}`);
});

mqttClient.on('error', (err) => {
    console.error('❌ [MQTT] Erro:', err.message);
});

// Função para publicar comando via MQTT
function publicarComando(comando) {
    const topico = `motel/${filial.toLowerCase()}/comandos`;
    const payload = JSON.stringify({
        id: -1, // ID -1 indica origem local/autoatendimento direto
        comando: comando
    });

    return new Promise((resolve) => {
        let finished = false;
        
        // Timeout de 3 segundos para evitar travamento da requisição caso o broker esteja offline ou instável
        const timeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                console.warn(`⚠️ [MQTT] Timeout de 3s ao publicar em ${topico} (Conexão lenta/offline)`);
                resolve(false);
            }
        }, 3000);

        mqttClient.publish(topico, payload, { qos: 1 }, (err) => {
            if (!finished) {
                finished = true;
                clearTimeout(timeout);
                if (err) {
                    console.error(`❌ [MQTT] Falha ao publicar em ${topico}:`, err.message);
                    resolve(false);
                } else {
                    console.log(`📡 [MQTT] Comando publicado em ${topico}: ${comando}`);
                    resolve(true);
                }
            }
        });
    });
}


// Função para executar consultas
function queryDatabase(query, params) {
    return new Promise((resolve, reject) => {
        pool.query(query, params, (err, results) => {
            if (err) {
                console.error('Erro na consulta ao banco de dados:', err);
                return reject(err);
            }
            resolve(results);
        });
    });
}

// Rota para carregar a imagem de fundo
app.get('/imagem/fundoAbertura', async (req, res) => {
    const query = "SELECT imagem FROM imagens WHERE nome_da_imagem = 'fundoAbertura'";
    try {
        const results = await queryDatabase(query);
        if (results.length > 0) {
            const imagemBase64 = results[0].imagem.toString('base64');
            res.json({ imagem: `data:image/jpeg;base64,${imagemBase64}` });
        } else {
            res.status(404).send("Imagem não encontrada");
        }
    } catch (err) {
        res.status(500).send("Erro: " + err.message);
    }
});

// Rota para carregar a imagem do cabeçalho
app.get('/imagem/cabecalho', async (req, res) => {
    const tipoQuarto = 'cabecalho'; // O tipo da imagem que você deseja carregar
    const query = "SELECT imagem FROM imagens WHERE nome_da_imagem = ?";

    try {
        const results = await queryDatabase(query, [tipoQuarto]);
        if (results.length > 0) {
            const imagemBase64 = results[0].imagem.toString('base64');
            res.json({ imagem: `data:image/jpeg;base64,${imagemBase64}` });
        } else {
            res.status(404).send("Imagem não encontrada");
        }
    } catch (err) {
        res.status(500).send("Erro: " + err.message);
    }
});

// Rota para carregar a imagem de direcionamento
app.get('/imagem/direcionamento', async (req, res) => {
    const tipoQuarto = 'direcionamento'; // O tipo da imagem que você deseja carregar
    const query = "SELECT imagem FROM imagens WHERE nome_da_imagem = ?";

    try {
        const results = await queryDatabase(query, [tipoQuarto]);
        if (results.length > 0) {
            const imagemBase64 = results[0].imagem.toString('base64');
            res.json({ imagem: `data:image/jpeg;base64,${imagemBase64}` });
        } else {
            res.status(404).send("Imagem não encontrada");
        }
    } catch (err) {
        res.status(500).send("Erro: " + err.message);
    }
});

// Rota para obter todos os quartos e seu status de disponibilidade
app.get('/quartos', async (req, res) => {
    console.log("🔍 [Backend] Recebida requisição para listar quartos...");
    const query = `
        SELECT q.*, 
               s.adicional as horaExtra,
               s.atualquarto as status,
               (SELECT MIN(valor) FROM periodos_quarto WHERE numeroquarto = q.numeroquarto) as min_periodo,
               q.valorquarto as preco_legado,
               CASE WHEN s.atualquarto = 'livre' THEN 1 ELSE 0 END as disponivel
        FROM quartos q
        LEFT JOIN status s ON q.numeroquarto = s.numeroquarto
    `;

    try {
        const results = await queryDatabase(query);
        console.log(`✅ [Backend] Consulta concluída. Encontrados ${results.length} quartos.`);
        res.json(results);
    } catch (err) {
        console.error('❌ [Backend] Erro na consulta de quartos:', err.message);
        res.status(500).send("Erro: " + err.message);
    }
});

// Rota para obter períodos dinâmicos (Usando tabela real)
app.get('/periodos', async (req, res) => {
    const query = "SELECT DISTINCT descricao, tempo_minutos, is_pernoite FROM periodos_quarto ORDER BY tempo_minutos";
    try {
        const results = await queryDatabase(query);
        res.json(results);
    } catch (err) {
        res.status(500).send("Erro: " + err.message);
    }
});

// Rota para obter valores de um quarto específico por período (Usando tabela real)
app.get('/precos/:numeroquarto', async (req, res) => {
    const { numeroquarto } = req.params;
    const query = `
        SELECT descricao, valor, tempo_minutos, is_pernoite
        FROM periodos_quarto
        WHERE numeroquarto = ?
        ORDER BY tempo_minutos
    `;
    try {
        const results = await queryDatabase(query, [numeroquarto]);
        res.json(results);
    } catch (err) {
        res.status(500).send("Erro: " + err.message);
    }
});

// Endpoint para obter números de quartos disponíveis filtrados por tipo
app.get('/quartos/disponiveis', async (req, res) => {
    const tipo = req.query.tipo;
    const query = `
        SELECT numeroquarto, tipoquarto 
        FROM quartos 
        WHERE numeroquarto IN (SELECT numeroquarto FROM status WHERE atualquarto = 'livre')
    `;

    try {
        const results = await queryDatabase(query);
        res.json(results);
    } catch (err) {
        res.status(500).send("Erro: " + err.message);
    }
});

// Endpoint para obter números de quartos disponíveis filtrados por tipo
app.get('/config/ip', async (req, res) => {
    const query = `SELECT meuip FROM configuracoes LIMIT 1`;

    try {
        const results = await queryDatabase(query);
        if (results && results.length > 0) {
            cachedIp = results[0].meuip;
            res.json(results);
        } else if (cachedIp) {
            console.log("⚠️ [Backend] Usando IP em cache pois o banco não retornou resultados.");
            res.json([{ meuip: cachedIp }]);
        } else {
            res.status(404).send("Configuração não encontrada");
        }
    } catch (err) {
        if (cachedIp) {
            console.warn("⚠️ [Backend] Banco offline. Usando IP em cache:", cachedIp);
            res.json([{ meuip: cachedIp }]);
        } else {
            res.status(500).send("Erro: " + err.message);
        }
    }
});

// NOVO: Rota robusta para enviar comando (Tenta HTTP Local + MQTT Remoto)
app.post('/enviar-comando', async (req, res) => {
    const comando = req.body; // Recebe o texto puro do comando
    console.log(`\n🚀 [Comando] >>> PROCESSANDO: "${comando}"`);

    let enviadoHttp = false;
    let enviadoMqtt = false;
    let errorLog = [];

    // 1. Tenta atualizar o IP do banco/cache se necessário
    if (!cachedIp) {
        try {
            const results = await queryDatabase("SELECT meuip FROM configuracoes LIMIT 1");
            if (results && results.length > 0) {
                cachedIp = results[0].meuip;
                console.log(`📡 [Config] IP recuperado do banco: ${cachedIp}`);
            }
        } catch (e) {
            console.warn("⚠️ [Config] Não foi possível buscar IP do banco no momento.");
        }
    }

    // 2. Determina o IP de destino. 
    // Se o IP no banco for o mesmo da máquina (externo ou interno), usa localhost para evitar falhas de rede.
    let targetIp = cachedIp || '127.0.0.1';
    
    // Se estivermos no ambiente do totem e o IP for o próprio IP externo, forçamos localhost
    if (targetIp === '138.99.250.16') {
        console.log(`🏠 [Rede] IP detectado como local (${targetIp}), usando localhost para maior estabilidade.`);
        targetIp = '127.0.0.1';
    }

    // 3. Tenta envio via HTTP Local (Comunicação direta com o Java)
    try {
        const url = `http://${targetIp}:1521/receberNumeroQuarto`;
        console.log(`🔗 [HTTP] Tentando envio direto para: ${url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: comando,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            enviadoHttp = true;
            console.log("✅ [HTTP] Comando entregue com sucesso via rede local.");
        } else {
            const txt = await response.text();
            console.error(`❌ [HTTP] Java recusou o comando: ${response.status} - ${txt}`);
            errorLog.push(`HTTP Status ${response.status}`);
        }
    } catch (err) {
        console.error(`❌ [HTTP] Falha na conexão local: ${err.message}`);
        errorLog.push(`HTTP Error: ${err.message}`);
    }

    // 4. Tenta envio via MQTT (Redundância via VPS)
    console.log("📡 [MQTT] Tentando redundância via nuvem...");
    enviadoMqtt = await publicarComando(comando);
    
    if (!enviadoMqtt) {
        errorLog.push("MQTT Timeout/Failure");
    } else {
        console.log("✅ [MQTT] Comando publicado no broker com sucesso.");
    }

    // 5. Retorno final
    if (enviadoHttp || enviadoMqtt) {
        const via = enviadoHttp ? (enviadoMqtt ? 'Ambos' : 'Rede Local') : 'MQTT (Nuvem)';
        console.log(`✨ [Sucesso] Comando processado via: ${via}\n`);
        res.json({ success: true, via: via });
    } else {
        console.error(`🛑 [ERRO TOTAL] O comando não pôde ser entregue por nenhum meio: ${errorLog.join(' | ')}\n`);
        res.status(500).json({ 
            success: false, 
            error: "Falha na entrega",
            details: errorLog 
        });
    }
});



// Rota para finalizar a locação integrada com o Java Desktop
app.get('/finalizar-locacao', async (req, res) => {
    const { numeroquarto, periodo, valor_final, desconto } = req.query;

    try {
        // Buscar IP do Java Desktop
        const resIp = await queryDatabase("SELECT meuip FROM configuracoes");
        if (!resIp || resIp.length === 0) {
            throw new Error("IP do Java Desktop não configurado no banco.");
        }
        const ip = resIp[0].meuip;

        // Monta o comando unificado: locar <numero> <periodo-com-hifen> <desconto>
        const periodoFormatado = periodo.replace(/\s+/g, '-');
        const comando = `locar ${numeroquarto} ${periodoFormatado} ${desconto}`;

        console.log(`📡 Enviando comando unificado para o Java: ${comando}`);

        // Chamada direta para o Java Desktop
        try {
            await fetch(`http://${ip}:1521/receberNumeroQuarto`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: comando
            });
            res.json({ success: true });
        } catch (e) {
            console.error("Erro ao avisar Java Desktop:", e);
            res.status(500).json({ success: false, error: "Java Desktop não respondeu" });
        }

    } catch (err) {
        console.error('Erro ao processar locação:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Rota para obter imagens dos quartos
app.get('/imagensquartos', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const dir = path.join(__dirname, 'imagens_exportadas');

        // Mapeamento exato com os nomes do banco
        const map = {
            "Apartamento Standard": "apartamento_standard.jpg",
            "Suíte Master": "su_te_master.jpg",
            "Suite Intensy": "suite_intensy.jpg",
            "Suite dos Deuses": "suite_dos_deuses.jpg"
        };

        const query = "SELECT nome_da_imagem as tipoquarto, imagem FROM imagens";
        const rows = await queryDatabase(query);

        const processed = rows.map(r => {
            const fileName = map[r.tipoquarto];
            let imageBase64 = null;

            if (fileName && fs.existsSync(path.join(dir, fileName))) {
                // Se a imagem editada existe na pasta, USA ELA!
                const buffer = fs.readFileSync(path.join(dir, fileName));
                imageBase64 = buffer.toString('base64');
            } else if (r.imagem) {
                // Caso contrário, usa a do banco
                imageBase64 = r.imagem.toString('base64');
            }

            return {
                tipoquarto: r.tipoquarto,
                imagem: imageBase64
            };
        });

        res.json(processed);
    } catch (err) {
        console.error('Erro ao buscar imagens:', err);
        res.status(500).json({ error: err.message });
    }
});

// Inicie o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
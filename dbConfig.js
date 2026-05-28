const fs = require('fs');
const path = require('path');
const os = require('os');

function getDbConfig() {
    try {
        const userHome = os.homedir();
        const filePath = path.join(userHome, 'Documents', 'logs', 'application.properties');
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`Arquivo de configuração não encontrado: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const props = {};

        lines.forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                props[key.trim()] = value.trim();
            }
        });

        const multiplier = 3;
        const deobfuscate = (obfuscated) => {
            if (!obfuscated) return '';
            return obfuscated.split('-')
                .map(val => String.fromCharCode(parseInt(val) / multiplier))
                .join('');
        };

        // Priorizar o banco REMOTO como solicitado
        const remoteUrl = props['REMOTE_DB_URL'] || '';
        const localUrl = props['LOCAL_DB_URL'] || '';
        const urlToUse = remoteUrl || localUrl;

        // Limpa a string JDBC (ex: jdbc:mysql://145.223.30.211/u876938716_motel)
        // Pega o que está entre // e a próxima / ou :
        const match = urlToUse.match(/\/\/([^:/]+)(?::(\d+))?\/([^?]+)/);
        
        const config = {
            host: match ? match[1] : '127.0.0.1',
            port: match && match[2] ? parseInt(match[2]) : 3306,
            user: props['USER_DB'],
            password: deobfuscate(props['PASS_DB']),
            database: match ? match[3] : '',
            filial: props['SISTEMA']
        };

        console.log(`📡 Configuração carregada: Conectando em ${config.host} (Banco: ${config.database})`);
        return config;
    } catch (err) {
        console.error('Erro ao carregar dbConfig:', err.message);
        return null;
    }
}

module.exports = getDbConfig();

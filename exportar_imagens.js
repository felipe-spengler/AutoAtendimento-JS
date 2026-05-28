const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./dbConfig');

if (!dbConfig) {
    console.error('Não foi possível carregar as configurações do banco.');
    process.exit(1);
}

// Conexão dinâmica
const connection = mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    port: dbConfig.port
});

const outputDir = path.join(__dirname, 'imagens_exportadas');

// Cria a pasta se não existir
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

console.log('--- Iniciando exportação de imagens do banco ---');

connection.query('SELECT nome_da_imagem, imagem FROM imagens', (err, results) => {
    if (err) {
        console.error('Erro ao consultar banco:', err);
        process.exit(1);
    }

    console.log(`Encontradas ${results.length} imagens.`);

    results.forEach(row => {
        if (row.imagem) {
            const fileName = `${row.nome_da_imagem.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
            const filePath = path.join(outputDir, fileName);
            
            // Grava o buffer (blob) direto em arquivo
            fs.writeFileSync(filePath, row.imagem);
            console.log(`✅ Salvo: ${fileName}`);
        } else {
            console.warn(`⚠️ Imagem "${row.nome_da_imagem}" está vazia no banco.`);
        }
    });

    console.log('\n--- Finalizado! Verifique a pasta "imagens_exportadas" ---');
    connection.end();
});

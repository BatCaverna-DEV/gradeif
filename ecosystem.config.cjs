// F5-09 — Configuração do PM2 na VPS. Uso: pm2 start ecosystem.config.cjs
// Um único processo: os jobs de geração ficam em memória (gerenciador.js), então
// não use o modo cluster com mais de uma instância.
module.exports = {
  apps: [
    {
      name: 'horarios',
      cwd: __dirname + '/backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '700M',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 3333,
        // A API serve a interface compilada; o Apache só faz proxy e HTTPS.
        FRONTEND_DIST: __dirname + '/frontend/dist',
      },
      out_file: __dirname + '/logs/horarios.log',
      error_file: __dirname + '/logs/horarios-erro.log',
      time: true,
    },
  ],
}

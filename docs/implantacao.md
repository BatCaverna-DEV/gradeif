# Implantação na VPS (F5-09) e backup (F5-10)

Roteiro para colocar o sistema numa VPS Linux (Ubuntu 24.04 ou Debian 12) com Apache, PM2 e MariaDB. Os comandos supõem o sistema em `/srv/horarios` e o domínio `horarios.exemplo.edu.br`; troque pelos valores reais.

A API Node serve a própria interface (o build do Vue). O Apache só faz HTTPS e proxy reverso.

## 1. Pacotes

```bash
sudo apt install -y apache2 mariadb-server git
```

Node.js 22 ou superior, de preferência pelo repositório oficial (NodeSource) ou pelo `nvm`, e o PM2:

```bash
sudo npm install -g pm2
```

## 2. Banco de dados

```bash
sudo mariadb
```

```sql
CREATE DATABASE horarios CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'horarios'@'localhost' IDENTIFIED BY 'uma-senha-longa';
GRANT ALL PRIVILEGES ON horarios.* TO 'horarios'@'localhost';
```

## 3. Código e configuração

```bash
sudo git clone <repositório> /srv/horarios
```

```bash
cd /srv/horarios && npm ci && npm run build
```

Crie `backend/.env` a partir de `backend/.env.example`, com permissão 600:

```ini
NODE_ENV=production
PORT=3333
SESSION_SECRET=gere-com-openssl-rand-hex-32
CORS_ORIGIN=https://horarios.exemplo.edu.br
DB_HOST=127.0.0.1
DB_USER=horarios
DB_PASSWORD=uma-senha-longa
DB_NAME=horarios
GESTOR_NOME=Nome do gestor
GESTOR_EMAIL=gestor@ifma.edu.br
GESTOR_SENHA=senha-provisoria
```

A API recusa subir em produção com o `SESSION_SECRET` padrão.

```bash
npm run migrate && npm run seed
```

O seed cria o gestor. Entre no sistema e troque a senha pelo menu do usuário.

## 4. PM2

```bash
mkdir -p logs && pm2 start ecosystem.config.cjs && pm2 save
```

```bash
pm2 startup
```

Rode o comando que o `pm2 startup` imprimir, para o processo voltar sozinho depois de um reinício da VPS.

Use uma instância só: os jobs de geração ficam na memória do processo. As sessões ficam na tabela `sessao`, então reiniciar a API não desconecta ninguém. Uma geração em andamento, porém, é perdida.

## 5. Apache com HTTPS

```bash
sudo a2enmod proxy proxy_http headers ssl rewrite
```

`/etc/apache2/sites-available/horarios.conf`:

```apache
<VirtualHost *:80>
    ServerName horarios.exemplo.edu.br
    RewriteEngine On
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,R=permanent]
</VirtualHost>

<VirtualHost *:443>
    ServerName horarios.exemplo.edu.br

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"

    # Progresso da geração (Server-Sent Events): sem buffer e sem compressão.
    <LocationMatch "/geracao/eventos$">
        SetEnv no-gzip 1
        SetEnv proxy-sendchunked 1
    </LocationMatch>
    ProxyPassMatch "^/(api/periodos/[0-9]+/geracao/eventos)$" "http://127.0.0.1:3333/$1" flushpackets=on timeout=3600

    ProxyPass        / http://127.0.0.1:3333/
    ProxyPassReverse / http://127.0.0.1:3333/

    # Planilhas e PDFs grandes
    LimitRequestBody 10485760

    SSLEngine on
    # Preenchido pelo certbot
</VirtualHost>
```

```bash
sudo a2ensite horarios && sudo systemctl reload apache2
```

```bash
sudo apt install -y certbot python3-certbot-apache && sudo certbot --apache -d horarios.exemplo.edu.br
```

Para conferir o SSE, inicie uma geração pela tela e veja o progresso andar. Se a barra só mexer no fim, o Apache está segurando a resposta: confira o `flushpackets=on` e se o `mod_deflate` respeita o `no-gzip`.

## 6. Atualização

```bash
cd /srv/horarios && git pull && npm ci && npm run build && npm run migrate && pm2 reload horarios
```

Atualize fora do horário de geração: o reload interrompe jobs em andamento.

## Backup e restauração

O script `scripts/backup.sh` gera um dump compactado por dia e apaga os com mais de 30 dias. As credenciais ficam em `~/.my.cnf` do usuário que roda o cron (permissão 600):

```ini
[mysqldump]
user=horarios
password=uma-senha-longa
```

```bash
chmod +x /srv/horarios/scripts/backup.sh && /srv/horarios/scripts/backup.sh
```

Agende com `crontab -e`:

```
0 2 * * * /srv/horarios/scripts/backup.sh >> /srv/horarios/logs/backup.log 2>&1
```

Copie a pasta `/srv/backups/horarios` para fora da VPS (outro servidor, armazenamento do IFMA). Backup na mesma máquina não protege contra perda do disco.

### Restaurar

1. Pare a API, para ninguém gravar durante a restauração:

   ```bash
   pm2 stop horarios
   ```

2. Restaure o dump escolhido. Ele substitui as tabelas existentes:

   ```bash
   gunzip -c /srv/backups/horarios/horarios-AAAAMMDD-HHMMSS.sql.gz | mariadb horarios
   ```

3. Aplique migrations mais novas que o backup e suba a API:

   ```bash
   cd /srv/horarios && npm run migrate && pm2 start horarios
   ```

Teste a restauração pelo menos uma vez por semestre, numa base de teste (`CREATE DATABASE horarios_restauracao` e o passo 2 apontando para ela).

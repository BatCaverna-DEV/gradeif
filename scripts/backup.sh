#!/usr/bin/env bash
# F5-10 — Backup diário do MariaDB do sistema de horários.
#
# Gera um dump compactado em $PASTA_BACKUP e apaga os mais antigos que $DIAS_RETENCAO.
# As credenciais ficam em ~/.my.cnf (permissão 600), nunca na linha de comando:
#
#   [mysqldump]
#   user=horarios
#   password=...
#
# Agendamento (crontab -e do usuário do sistema), todo dia às 2h:
#   0 2 * * * /srv/horarios/scripts/backup.sh >> /srv/horarios/logs/backup.log 2>&1
#
# Restauração: ver docs/implantacao.md, seção "Backup e restauração".

set -euo pipefail

BANCO="${BANCO:-horarios}"
PASTA_BACKUP="${PASTA_BACKUP:-/srv/backups/horarios}"
DIAS_RETENCAO="${DIAS_RETENCAO:-30}"

mkdir -p "$PASTA_BACKUP"
chmod 700 "$PASTA_BACKUP"

ARQUIVO="$PASTA_BACKUP/${BANCO}-$(date +%Y%m%d-%H%M%S).sql.gz"
TEMPORARIO="${ARQUIVO}.parcial"

# --single-transaction: cópia consistente sem travar as tabelas InnoDB.
mysqldump --single-transaction --quick --routines --triggers \
  --default-character-set=utf8mb4 "$BANCO" | gzip -9 > "$TEMPORARIO"

# Só vira backup válido se o gzip estiver íntegro.
gzip -t "$TEMPORARIO"
mv "$TEMPORARIO" "$ARQUIVO"
chmod 600 "$ARQUIVO"

find "$PASTA_BACKUP" -name "${BANCO}-*.sql.gz" -type f -mtime +"$DIAS_RETENCAO" -delete

echo "$(date '+%F %T') backup ok: $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1))"

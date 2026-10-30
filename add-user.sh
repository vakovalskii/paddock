#!/bin/bash
# Добавляет пользователя: свой контейнер харнесса harness-<name>, свои тома (история, workspace), свой ws-токен.
# --admin: ещё и монтирует исходники морды (./web) в /workspace/paddock-web, чтобы агент мог её править и выкатывать.
# После: docker compose up -d harness-<name>, затем вход в ChatGPT из морды: Настройки → Аккаунт ChatGPT → «Получить код»
# (или по-старому: docker compose exec -it harness-<name> codex login --device-auth)
set -euo pipefail
cd "$(dirname "$0")"

U="${1:?usage: ./add-user.sh <name> [--admin]  (a-z0-9-)}"
ADMIN="${2:-}"
[[ "$U" =~ ^[a-z0-9-]+$ ]] || { echo "bad name: $U"; exit 1; }
[ -f "users/$U.yml" ] && { echo "user $U already exists"; exit 1; }

mkdir -p secrets/tokens && chmod 700 secrets
openssl rand -hex 32 > "secrets/tokens/$U.token"
chmod 644 "secrets/tokens/$U.token"   # читает uid 1000 внутри контейнера; доступ к каталогу закрыт chmod 700
if [ "$ADMIN" = "--admin" ]; then mount='      - ./web:/workspace/paddock-web'; else mount=''; fi
sed -e "s/__USER__/$U/g" -e "s|      # __ADMIN_MOUNT__|$mount|" users/_template.yml | grep -v '^$' > "users/$U.yml"

files="docker-compose.yml"
for f in users/*.yml; do [ "$(basename "$f")" = _template.yml ] || files="$files:$f"; done
# COMPOSE_PATH_SEPARATOR=: — на Windows compose по умолчанию делит COMPOSE_FILE по ';'
{ grep -v -e '^COMPOSE_FILE=' -e '^COMPOSE_PATH_SEPARATOR=' .env 2>/dev/null || true; echo "COMPOSE_FILE=$files"; echo "COMPOSE_PATH_SEPARATOR=:"; } > .env.tmp && mv .env.tmp .env

echo "added $U; compose files: $files"

#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-/srv/saosa/current/server}"
ENV_DIR=/etc/saosa
ENV_FILE="$ENV_DIR/api.env"
SERVICE_USER=saosa-api
DB_NAME=saosa
DB_USER=saosa_app
KAVENEGAR_KEY_FILE=/run/saosa-kavenegar-key

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends postgresql nodejs npm

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home /nonexistent --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -m 750 -o root -g "$SERVICE_USER" "$ENV_DIR"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  SESSION_SECRET="$(openssl rand -hex 48)"
  cat > "$ENV_FILE" <<EOF
PORT=3000
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
KAVENEGAR_API_KEY=
KAVENEGAR_TEMPLATE=saosalogin
KAVENEGAR_INVITE_TEMPLATE=SaosaInvite
RESEND_API_KEY=
INVITATION_FROM_EMAIL=
INVITATION_BASE_URL=https://saosa.ir
EOF
  chown root:"$SERVICE_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
else
  DB_PASSWORD="$(sed -nE 's#^DATABASE_URL=postgresql://[^:]+:([^@]+)@.*#\1#p' "$ENV_FILE")"
  if [[ -z "$DB_PASSWORD" ]]; then
    echo "Could not read the existing database password" >&2
    exit 1
  fi
fi

if [[ -s "$KAVENEGAR_KEY_FILE" ]]; then
  KAVENEGAR_API_KEY_VALUE="$(<"$KAVENEGAR_KEY_FILE")"
  rm -f "$KAVENEGAR_KEY_FILE"
  if [[ -z "$KAVENEGAR_API_KEY_VALUE" || "$KAVENEGAR_API_KEY_VALUE" == *$'\n'* ]]; then
    echo "The deployed Kavenegar API key is invalid" >&2
    exit 1
  fi
  TEMP_ENV="$(mktemp "$ENV_DIR/api.env.XXXXXX")"
  grep -vE '^(KAVENEGAR_API_KEY|KAVENEGAR_TEMPLATE|KAVENEGAR_INVITE_TEMPLATE)=' "$ENV_FILE" > "$TEMP_ENV"
  printf 'KAVENEGAR_API_KEY=%s\nKAVENEGAR_TEMPLATE=saosalogin\nKAVENEGAR_INVITE_TEMPLATE=SaosaInvite\n' "$KAVENEGAR_API_KEY_VALUE" >> "$TEMP_ENV"
  chown root:"$SERVICE_USER" "$TEMP_ENV"
  chmod 640 "$TEMP_ENV"
  mv -f "$TEMP_ENV" "$ENV_FILE"
fi

if ! grep -qE '^KAVENEGAR_API_KEY=.+$' "$ENV_FILE"; then
  echo "Kavenegar API key is missing from $ENV_FILE" >&2
  exit 1
fi

if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}'"
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE ${DB_USER} PASSWORD '${DB_PASSWORD}'"
fi

if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  runuser -u postgres -- createdb --owner="$DB_USER" "$DB_NAME"
fi

for migration in "$APP_ROOT"/sql/*.sql; do
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -f "$migration"
done
npm --prefix "$APP_ROOT" ci --omit=dev --no-audit --no-fund

cat > /etc/systemd/system/saosa-api.service <<EOF
[Unit]
Description=Saosa API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_ROOT}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_ROOT}/src/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
EOF

install -d -m 750 -o postgres -g postgres /var/backups/saosa
cat > /usr/local/sbin/saosa-db-backup <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
backup_dir=/var/backups/saosa
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
runuser -u postgres -- pg_dump --format=custom --file="$backup_dir/saosa-$stamp.dump" saosa
find "$backup_dir" -type f -name 'saosa-*.dump' -mtime +14 -delete
EOF
chmod 750 /usr/local/sbin/saosa-db-backup

cat > /etc/systemd/system/saosa-db-backup.service <<'EOF'
[Unit]
Description=Backup Saosa PostgreSQL database

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/saosa-db-backup
EOF

cat > /etc/systemd/system/saosa-db-backup.timer <<'EOF'
[Unit]
Description=Daily Saosa PostgreSQL backup

[Timer]
OnCalendar=*-*-* 02:30:00 UTC
Persistent=true
RandomizedDelaySec=900

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now postgresql saosa-api.service saosa-db-backup.timer
systemctl restart saosa-api.service
for attempt in {1..20}; do
  if curl --fail --silent --show-error http://127.0.0.1:3000/api/health; then
    exit 0
  fi
  sleep 1
done
systemctl --no-pager --full status saosa-api.service || true
journalctl --no-pager -u saosa-api.service -n 100 || true
exit 1

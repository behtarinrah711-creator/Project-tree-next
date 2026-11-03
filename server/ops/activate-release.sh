#!/usr/bin/env bash
set -euo pipefail

RELEASE_ROOT="$(readlink -f "${1:?Usage: activate-release.sh /path/to/release}")"
SITE_ROOT="${SAOSA_SITE_ROOT:-/srv/saosa}"
UNIT_ROOT="${SAOSA_SYSTEMD_ROOT:-/etc/systemd/system}"
PREVIOUS_ROOT="$(readlink -e "$SITE_ROOT/current" || true)"
UNIT_BACKUP="$(mktemp)"
HAD_UNIT=false
if [[ -f "$UNIT_ROOT/saosa-api.service" ]]; then
  cp "$UNIT_ROOT/saosa-api.service" "$UNIT_BACKUP"
  HAD_UNIT=true
fi

rollback(){
  local status=$?
  trap - ERR
  set +e
  echo 'Release activation failed; restoring the previous release and service unit.' >&2
  if [[ -n "$PREVIOUS_ROOT" ]]; then
    ln -sfn "$PREVIOUS_ROOT" "$SITE_ROOT/current.next"
    mv -Tf "$SITE_ROOT/current.next" "$SITE_ROOT/current"
  fi
  if "$HAD_UNIT"; then
    install -m 644 "$UNIT_BACKUP" "$UNIT_ROOT/saosa-api.service"
    systemctl daemon-reload
    systemctl restart saosa-api.service
  else
    systemctl stop saosa-api.service
    rm -f "$UNIT_ROOT/saosa-api.service"
    systemctl daemon-reload
    if [[ -z "$PREVIOUS_ROOT" ]]; then rm -f "$SITE_ROOT/current"; fi
  fi
  exit "$status"
}
trap 'rm -f "$UNIT_BACKUP"' EXIT
trap rollback ERR

# Provisioning validates the packaged runtime before changing the service.
# The old static release remains selected until the new API passes its health check.
bash "$RELEASE_ROOT/server/ops/provision.sh" "$RELEASE_ROOT/server"
ln -sfn "$RELEASE_ROOT" "$SITE_ROOT/current.next"
mv -Tf "$SITE_ROOT/current.next" "$SITE_ROOT/current"
nginx -t
systemctl enable --now nginx
systemctl reload nginx
curl -fsS -o /dev/null http://127.0.0.1/
curl -fsS http://127.0.0.1/api/health
trap - ERR
echo 'Release activation completed.'

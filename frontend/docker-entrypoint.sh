#!/bin/sh
set -e

: "${PORT:=8080}"
: "${BACKEND_URL:?BACKEND_URL env var is required (e.g. https://timesync-backend-xxxxx-uc.a.run.app)}"

BACKEND_HOST=$(echo "$BACKEND_URL" | sed -E 's#^https?://##; s#/.*##')

sed -e "s#__PORT__#${PORT}#g" \
    -e "s#__BACKEND_URL__#${BACKEND_URL}#g" \
    -e "s#__BACKEND_HOST__#${BACKEND_HOST}#g" \
    /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g "daemon off;"

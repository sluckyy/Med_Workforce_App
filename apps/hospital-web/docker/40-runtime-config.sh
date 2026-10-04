#!/bin/sh
# Generates /config.js from environment variables so the same image can
# point at any backend/sibling app (local docker-compose, Azure, staging...).
set -e
API_BASE_URL="${API_BASE_URL:-}"
DOCTOR_WEB_URL="${DOCTOR_WEB_URL:-}"
cat > /usr/share/nginx/html/config.js <<JS
window.__MED_WORKFORCE_CONFIG__ = { apiBaseUrl: "${API_BASE_URL}", doctorWebUrl: "${DOCTOR_WEB_URL}" };
JS
echo "[runtime-config] apiBaseUrl=${API_BASE_URL:-<build default>} doctorWebUrl=${DOCTOR_WEB_URL:-<build default>}"

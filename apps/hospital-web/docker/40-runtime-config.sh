#!/bin/sh
# Generates /config.js from the API_BASE_URL environment variable so the same
# image can point at any backend (local docker-compose, Azure, staging...).
set -e
API_BASE_URL="${API_BASE_URL:-}"
cat > /usr/share/nginx/html/config.js <<JS
window.__MED_WORKFORCE_CONFIG__ = { apiBaseUrl: "${API_BASE_URL}" };
JS
echo "[runtime-config] apiBaseUrl=${API_BASE_URL:-<build default>}"

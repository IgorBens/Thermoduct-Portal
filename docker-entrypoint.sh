#!/bin/sh
set -e

HTML_ROOT=/usr/share/nginx/html

# Generate config.js from environment variables at container startup.
# Only the listed variables are substituted — everything else stays untouched.
envsubst '${APP_TITLE} ${AUTH_ISSUER} ${AUTH_CLIENT_ID} ${AUTH_REDIRECT_URI} ${AUTH_POST_LOGOUT_URI} ${AUTH_SCOPES} ${API_BASE_URL} ${WEBHOOK_TASKS} ${WEBHOOK_FOLDERS} ${WEBHOOK_FILES} ${WEBHOOK_SERVE_FILE} ${WEBHOOK_FILE_DELETE} ${WEBHOOK_UPLOAD_FORM} ${WEBHOOK_PDF_UPLOAD}' \
  < "$HTML_ROOT/js/core/config.js.template" \
  > "$HTML_ROOT/js/core/config.js"

echo "[entrypoint] config.js generated from environment"

# Cache-busting: append ?v=<timestamp> to all .css and .js references in HTML.
# This forces browsers to fetch new files after every deploy/restart.
BUILD_VER=$(date +%s)
sed -i "s/\.css\"/\.css?v=${BUILD_VER}\"/g; s/\.js\"/\.js?v=${BUILD_VER}\"/g" "$HTML_ROOT/index.html"
echo "[entrypoint] cache-bust v=${BUILD_VER} injected into index.html"

exec nginx -g 'daemon off;'

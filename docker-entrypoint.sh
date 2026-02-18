#!/bin/sh
set -e

# Generate config.js from environment variables at container startup.
# Only the listed variables are substituted — everything else stays untouched.
envsubst '${APP_TITLE} ${AUTH_ISSUER} ${AUTH_CLIENT_ID} ${AUTH_REDIRECT_URI} ${AUTH_POST_LOGOUT_URI} ${AUTH_SCOPES} ${API_BASE_URL} ${WEBHOOK_TASKS} ${WEBHOOK_FOLDERS} ${WEBHOOK_FILES} ${WEBHOOK_SERVE_FILE} ${WEBHOOK_FILE_DELETE} ${WEBHOOK_UPLOAD_FORM} ${WEBHOOK_PDF_UPLOAD}' \
  < /usr/share/nginx/html/js/core/config.js.template \
  > /usr/share/nginx/html/js/core/config.js

echo "[entrypoint] config.js generated from environment"

exec nginx -g 'daemon off;'

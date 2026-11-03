#!/usr/bin/env bash
# Gera a chave de assinatura do APK (uma única vez) e imprime os valores dos secrets do GitHub.
# Guarde o arquivo .keystore e a senha em local seguro: sem eles não dá para publicar atualizações.
set -euo pipefail
OUT="${1:-phanki-release.keystore}"
ALIAS="phanki"
read -rsp "Senha para a keystore (mín. 6 caracteres): " PASS; echo
keytool -genkeypair -v -keystore "$OUT" -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=Phanki"
echo
echo "Crie estes secrets em Settings > Secrets and variables > Actions:"
echo "  ANDROID_KEYSTORE_BASE64  = (copiado para a área de transferência / arquivo $OUT.b64)"
echo "  ANDROID_KEYSTORE_PASSWORD = a senha digitada"
echo "  ANDROID_KEY_ALIAS         = $ALIAS"
echo "  ANDROID_KEY_PASSWORD      = a senha digitada"
base64 < "$OUT" | tr -d '\n' > "$OUT.b64"
command -v pbcopy >/dev/null && pbcopy < "$OUT.b64" && echo "(base64 copiado para a área de transferência)"

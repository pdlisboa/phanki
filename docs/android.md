# App Android

## Instalar

1. No celular, baixe o `phanki-vX.Y.Z.apk` da última [release](https://github.com/pdlisboa/phanki/releases) e permita que o navegador instale apps desconhecidos.
2. Abra o Phanki, informe a URL do servidor (ex.: `https://phanki.seudominio.com` ou `http://192.168.0.10:3500`) e faça login.
3. Para atualizar, instale o APK novo por cima: os dados locais são mantidos. Em *Ajustes* há um link para a última release.

O app aceita servidor sem HTTPS na rede local, mas para uso fora de casa use HTTPS.

## Assinatura do APK

O Android só instala uma atualização por cima da anterior se as duas forem assinadas com a **mesma chave**. Por isso a chave é gerada uma vez e guardada nos secrets do GitHub.

### Gerar a chave (uma vez)

Precisa do `keytool`, que vem com o Java (JDK):

```bash
./scripts/create-keystore.sh
```

O script pede uma senha, gera `phanki-release.keystore` e um arquivo `.b64` com a chave em base64 (no macOS ele já copia para a área de transferência).

Guarde o `.keystore` e a senha num lugar seguro, fora do repositório (os dois padrões estão no `.gitignore`). Sem eles não dá para publicar atualizações instaláveis por cima das anteriores.

### Cadastrar os secrets

Em *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Valor |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Conteúdo do arquivo `.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | A senha digitada |
| `ANDROID_KEY_ALIAS` | `phanki` |
| `ANDROID_KEY_PASSWORD` | A senha digitada |

### Sem os secrets

A release continua funcionando, mas o APK sai assinado com uma chave de debug diferente a cada build. Cada atualização exige desinstalar o app antes, o que apaga o que não tiver sido sincronizado.

## Build local

Precisa do JDK 21 e do Android SDK:

```bash
npm run build -w @phanki/web
cd apps/web && npx cap sync android
cd android && ./gradlew assembleDebug
```

O APK fica em `apps/web/android/app/build/outputs/apk/debug/`.

## Ícone e splash screen

Gerados a partir de `apps/web/public/icon.svg` (o mesmo logo da tela de login). Depois de alterar o SVG:

```bash
npm run icons -w @phanki/web
```

O comando atualiza os PNGs do app web (`apps/web/public`) e os ícones adaptativos e splash screens do Android (`apps/web/android/app/src/main/res`). Commite os arquivos gerados.

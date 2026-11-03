# Phanki

Flashcards com repetição espaçada **FSRS** para estudar inglês — o modelo do Anki (decks, tipos de nota, cloze, importação `.apkg`) com uma interface moderna (React + shadcn/ui). Roda na web (container no Portainer) e no Android (APK), estudando **offline** e sincronizando quando houver conexão.

## Como funciona

```
apps/web       React + Vite + Tailwind + shadcn/ui · banco local IndexedDB (Dexie) · ts-fsrs
apps/web/android  Projeto Android (Capacitor) que empacota o mesmo app web
apps/server    Node + Hono + SQLite · login, sync, importação .apkg, mídia · serve o app web
packages/shared  Tipos, renderização de templates do Anki, regras de sync
```

- **Agendamento** é feito no próprio dispositivo com `ts-fsrs`, então estudar não precisa de rede.
- **Sync**: cada alteração local fica marcada como pendente e é enviada ao servidor (`POST /api/sync`), que devolve o que mudou desde o último sync. Conflitos: vence a edição mais recente; o histórico de revisões nunca conflita. O app sincroniza ao abrir, ao voltar a ficar online, alguns segundos após editar, ao terminar uma sessão e a cada 5 minutos.
- **Mídia** importada do Anki fica no servidor (`/data/media`) e é guardada no dispositivo na primeira vez que aparece.
- **TTS**: pronúncia em inglês pelo Web Speech API no navegador e pelo motor de voz do Android no app.

## Rodar localmente

```bash
npm install
ADMIN_EMAIL=eu@exemplo.com ADMIN_PASSWORD=senha JWT_SECRET=$(openssl rand -hex 32) npm run dev -w @phanki/server
npm run dev -w @phanki/web   # http://localhost:5173 (proxy de /api para :3000)
```

### Qualidade

```bash
npm run lint              # ESLint (TypeScript + regras de hooks do React)
npm run typecheck
npm run test:coverage     # testes unitários; falha abaixo de 90% de cobertura
npm run test:integration  # Testcontainers: constrói a imagem Docker e testa contra containers reais
```

A cobertura mede a lógica (`packages/shared`, `apps/server`, `apps/web/src/lib`); as telas React ficam de fora. Os testes de integração precisam do Docker rodando e cobrem o container de produção (app web, login, sync entre dois aparelhos, importação `.apkg`, mídia, persistência após reiniciar) e o motor de sync do app contra o servidor real, simulando estudo offline num aparelho e a chegada dos dados em outro. O CI roda tudo em todo PR, e uma release só é publicada se o gate passar.

## Fluxo de trabalho e publicação

- **Pull requests** rodam o workflow **CI**: lint, tipos, testes unitários com cobertura mínima de 90%, build e testes de integração com Docker. O check **Gate** só passa se tudo passar e é o que libera o merge.
- **Merge na `main`** dispara o workflow **Release**: roda o gate de novo e, se passar, publica uma nova versão (patch). Também dá para rodar manualmente em *Actions → Release → Run workflow*, escolhendo patch, minor ou major.

Cada release gera:

1. a imagem Docker `ghcr.io/pdlisboa/phanki:<versão>` e `:latest` (amd64 + arm64);
2. o APK `phanki-v<versão>.apk` e a tag `v<versão>`, na página de [Releases](https://github.com/pdlisboa/phanki/releases).

### Proteger a `main` (fazer uma vez)

Em *Settings → Rules → Rulesets → New branch ruleset*: alvo `main` (Default branch), marque **Require a pull request before merging** e **Require status checks to pass** com o check `Gate`, e **Block force pushes**. Assim nada entra na `main` sem passar pelo gate.

### Assinatura do APK (fazer uma vez)

O Android só instala uma atualização por cima da versão anterior se ela for assinada com a **mesma chave**. Gere a chave e cadastre os secrets do repositório:

```bash
./scripts/create-keystore.sh
```

Secrets em *Settings → Secrets and variables → Actions*: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Guarde o `.keystore` fora do repositório (ele está no `.gitignore`). Sem os secrets o APK sai assinado com uma chave de debug aleatória e cada atualização exigirá desinstalar o app (perdendo o que não foi sincronizado).

## Deploy no Portainer

1. Na primeira release, o pacote no GHCR nasce **privado**: em *github.com → seu perfil → Packages → phanki → Package settings* torne-o público, ou cadastre o `ghcr.io` em *Portainer → Registries* com um token `read:packages`.
2. *Stacks → Add stack*, cole o [docker-compose.yml](docker-compose.yml) e defina `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `JWT_SECRET` (`openssl rand -hex 32`).
3. Exponha a porta 3000 atrás do seu proxy reverso com HTTPS (recomendado, principalmente se for acessar fora de casa).
4. Para atualizar: na stack, **Pull and redeploy**.

Os dados ficam no volume `phanki-data` (`/data/phanki.db` + `/data/media`); faça backup desse volume.

## Instalar no Android

1. Baixe o `.apk` da última release no celular e permita "instalar apps desconhecidos" para o navegador.
2. Abra o Phanki, informe a URL do servidor (ex.: `https://phanki.seudominio.com` ou `http://192.168.0.10:3000`) e faça login.
3. Para atualizar, instale o APK novo por cima (os dados locais são mantidos). Em *Ajustes* há um link para a última release.

## Importar do Anki

No Anki: *Arquivo → Exportar → Pacote de deck (.apkg)* com mídia. No Phanki: *Ajustes → Importar do Anki*. O progresso e o histórico são convertidos para FSRS (ou marque "começar do zero"). Reimportar o mesmo deck atualiza as notas sem duplicar e sem mexer no agendamento de cartas já existentes.

## Atalhos de estudo

`Espaço` mostrar resposta / Bom · `1`–`4` Errei/Difícil/Bom/Fácil · `R` repetir áudio · `U` desfazer. No editor, `Ctrl/⌘+Enter` salva e `Ctrl/⌘+Shift+C` cria uma lacuna cloze.

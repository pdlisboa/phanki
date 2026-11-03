# CI, releases e proteção da main

## Pull requests: o gate

Todo PR roda o workflow **CI** ([ci.yml](../.github/workflows/ci.yml)):

- **Lint, types, unit tests, build**: ESLint, TypeScript, testes unitários com cobertura mínima de 90% e build de produção.
- **Integration tests**: constrói a imagem Docker e roda os testes com Testcontainers.
- **Gate**: só passa se os dois jobs acima passarem. É o check que libera o merge.

## Releases

O workflow **Release** ([release.yml](../.github/workflows/release.yml)) roda:

- a cada merge na `main` (aumenta o patch: `0.1.3` → `0.1.4`);
- manualmente em *Actions → Release → Run workflow*, escolhendo patch, minor ou major.

Antes de publicar, ele roda o gate de novo. Se passar:

1. calcula a versão a partir da última tag `v*` (a primeira usa a versão do `package.json`);
2. publica a imagem `ghcr.io/pdlisboa/phanki:<versão>` e `:latest`;
3. gera o APK assinado;
4. cria a tag `v<versão>` e a release com o APK anexado.

O `versionCode` do Android vem do número da execução do workflow, então sempre aumenta.

## Proteger a main (fazer uma vez)

Em *Settings → Rules → Rulesets → New branch ruleset*:

1. **Target branches**: *Include default branch*.
2. Marque **Require a pull request before merging**.
3. Marque **Require status checks to pass** e adicione o check `Gate`. Ele só aparece na busca depois de ter rodado em algum PR.
4. Marque **Block force pushes**.
5. *Enforcement status*: **Active**.

Assim nada entra na `main`, e portanto nada é publicado, sem passar pelo gate.

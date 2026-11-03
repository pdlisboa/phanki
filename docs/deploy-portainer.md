# Deploy no Portainer

## 1. Imagem

A imagem é publicada a cada release em `ghcr.io/pdlisboa/phanki` (tags `latest` e uma por versão, amd64 e arm64).

O pacote no GHCR tem visibilidade própria, separada do repositório. Na primeira publicação, abra o pacote em *github.com/pdlisboa → Packages → phanki → Package settings → Change visibility* e deixe **Public**. Se preferir mantê-lo privado, cadastre o `ghcr.io` em *Portainer → Registries* com um token do GitHub com permissão `read:packages`.

## 2. Stack

Em *Stacks → Add stack → Web editor*, cole o [docker-compose.yml](../docker-compose.yml) e defina em *Environment variables*:

| Variável | Valor |
| --- | --- |
| `ADMIN_EMAIL` | Seu email de login |
| `ADMIN_PASSWORD` | Sua senha |
| `JWT_SECRET` | Gere com `openssl rand -hex 32` |
| `PHANKI_PORT` | Opcional: porta do host (padrão `3500`) |

## 3. Acesso externo

Coloque a porta 3500 atrás do seu proxy reverso com HTTPS, principalmente se for usar o app fora de casa. Sem HTTPS a senha e os dados trafegam em texto puro.

## 4. Atualizações

Na stack, use **Pull and redeploy** depois de cada release.

## Backup

Tudo fica no volume `phanki-data`: `/data/phanki.db` (banco SQLite) e `/data/media`. Faça backup desse volume.

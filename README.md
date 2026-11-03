# Phanki

Spaced-repetition flashcards for learning English, built on the [FSRS](https://github.com/open-spaced-repetition/fsrs4anki) algorithm. Anki's model (decks, note types, cloze, `.apkg` import) with a modern web UI, an offline-first Android app, and a self-hosted sync server.

## Features

- FSRS scheduling on the device, so studying works offline
- Basic, Basic (and reversed) and Cloze note types, with Anki template rendering
- Import Anki `.apkg` decks, including media and review history
- English text-to-speech on the web and on Android
- Sync between web and Android through your own server
- Statistics: activity heatmap, reviews, forecast and retention

## Quick start

```bash
docker run -d --name phanki \
  -p 3500:3500 \
  -v phanki-data:/data \
  -e ADMIN_EMAIL=you@example.com \
  -e ADMIN_PASSWORD=change-me \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  ghcr.io/pdlisboa/phanki:latest
```

Open http://localhost:3500 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. A ready-to-use [docker-compose.yml](docker-compose.yml) is included.

The Android APK is attached to each [release](https://github.com/pdlisboa/phanki/releases).

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ADMIN_EMAIL` | yes | | Login email of the single user |
| `ADMIN_PASSWORD` | yes | | Login password |
| `JWT_SECRET` | yes | | Secret used to sign sessions. Generate with `openssl rand -hex 32` |
| `PORT` | no | `3500` | HTTP port |
| `DATA_DIR` | no | `/data` | Where the SQLite database and media are stored. Mount a volume here |

Changing `JWT_SECRET` signs every device out.

## Development

Requires Node.js 24 and, for integration tests, Docker.

```bash
npm install
ADMIN_EMAIL=dev@example.com ADMIN_PASSWORD=dev JWT_SECRET=dev-secret npm run dev -w @phanki/server
npm run dev -w @phanki/web    # http://localhost:5173
```

| Command | Description |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript checks for every package |
| `npm run test:coverage` | Unit tests, fails below 90% coverage |
| `npm run test:integration` | Testcontainers tests against the production Docker image |
| `npm run build` | Production build of the web app and server |

## Project structure

```
apps/web          React web app (also packaged for Android with Capacitor)
apps/web/android  Android project
apps/server       Sync server and API (Hono + SQLite); serves the web app
packages/shared   Types, template rendering and sync rules
docs/             Guides (Portuguese)
```

## Documentation

- [Arquitetura e sincronização](docs/arquitetura.md)
- [Deploy no Portainer](docs/deploy-portainer.md)
- [App Android e assinatura do APK](docs/android.md)
- [CI, releases e proteção da main](docs/releases.md)
- [Desenvolvimento e testes](docs/desenvolvimento.md)
- [Guia de uso](docs/uso.md)

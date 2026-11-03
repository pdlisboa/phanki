# Desenvolvimento e testes

## Rodar localmente

```bash
npm install
ADMIN_EMAIL=dev@example.com ADMIN_PASSWORD=dev JWT_SECRET=dev-secret npm run dev -w @phanki/server
npm run dev -w @phanki/web
```

O app abre em http://localhost:5173 e o Vite encaminha `/api` para o servidor em `:3500`. Os dados de desenvolvimento ficam em `apps/server/data`.

## Variáveis de build

Usadas só no build do app web, normalmente pelo CI:

| Variável | Uso |
| --- | --- |
| `APP_VERSION` | Versão mostrada em *Ajustes* |
| `VITE_RELEASES_URL` | Link "Baixar nova versão" no app Android |

## Checagens

| Comando | O que faz |
| --- | --- |
| `npm run lint` | ESLint com regras de TypeScript e de hooks do React |
| `npm run typecheck` | TypeScript em todos os pacotes e nos testes |
| `npm run test:coverage` | Testes unitários; falha abaixo de 90% de cobertura |
| `npm run test:integration` | Testes de integração com Docker |

### Testes unitários

- `packages/shared/test`: templates, cloze, regra de conflito, virada do dia de estudo.
- `apps/server/test`: rotas, login e bloqueio por tentativas, paginação do sync, importação `.apkg` (formatos antigo e novo do Anki).
- `apps/web/test`: banco local, decks e notas, fila de estudo, FSRS, sync contra um servidor em memória, mídia offline, TTS. Rodam em jsdom com IndexedDB simulado (`fake-indexeddb`).

A cobertura mede a lógica (`packages/shared`, `apps/server`, `apps/web/src/lib`); as telas React ficam de fora. O relatório HTML fica em `coverage/`.

### Testes de integração

Precisam do Docker rodando. A configuração fica em `vitest.integration.config.ts` e os testes em `test/integration/`:

- `*.container.test.ts`: constrói a imagem de produção e testa o app web servido, login, sync entre dois aparelhos, importação `.apkg`, mídia, persistência após reiniciar o container e o healthcheck.
- `*.client.test.ts`: roda o motor de sync do app contra o container. Estuda offline num aparelho simulado, volta a ficar online e confere que as cartas chegam estudadas num segundo aparelho.

O primeiro build da imagem leva alguns minutos; os seguintes usam o cache do Docker.

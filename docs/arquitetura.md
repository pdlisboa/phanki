# Arquitetura e sincronização

## Visão geral

```
apps/web          React + Vite + Tailwind + shadcn/ui · banco local IndexedDB (Dexie) · ts-fsrs
apps/web/android  Projeto Android (Capacitor) que empacota o mesmo app web
apps/server       Node + Hono + SQLite · login, sync, importação .apkg, mídia · serve o app web
packages/shared   Tipos, renderização de templates do Anki, regras de sync
```

Um único container serve a API (`/api/*`) e o app web compilado. O APK do Android empacota o mesmo app web e conversa com o servidor pela URL configurada no login.

## Offline-first

Cada aparelho guarda a coleção inteira localmente (IndexedDB) e agenda as revisões com `ts-fsrs`. Estudar, adicionar e editar cartas não dependem de rede; o servidor só serve para sincronizar.

## Modelo de dados

Igual ao do Anki, simplificado:

| Tabela | Conteúdo |
| --- | --- |
| `decks` | Nome (`Pai::Filho` para subdecks) e opções (limites diários, retenção desejada, passos) |
| `notetypes` | Campos e templates (`{{Campo}}`, `{{cloze:Texto}}`, seções condicionais) |
| `notes` | Valores dos campos e tags |
| `cards` | Uma por template (ou por lacuna cloze), com o estado FSRS |
| `revlogs` | Histórico de respostas, só acrescentado |

Todas as linhas têm um id gerado no aparelho, `updatedAt` e `deleted` (exclusão lógica, para a exclusão também sincronizar).

## Sincronização

`POST /api/sync` recebe `{ cursor, changes }`:

1. O app envia as linhas marcadas como pendentes.
2. O servidor aplica cada uma se ela for mais recente que a cópia dele (**vence a última escrita**). O histórico de revisões nunca é sobrescrito.
3. O servidor devolve tudo o que mudou depois do `cursor` do aparelho, em páginas de até 5000 linhas, e o novo cursor.

No servidor cada linha é guardada como JSON numa única tabela, com um número de sequência crescente que define o cursor.

O app sincroniza ao abrir, ao voltar a ficar online ou para a frente, alguns segundos depois de cada edição, ao terminar uma sessão de estudo e a cada 5 minutos. Uma linha editada durante uma sincronização continua pendente para a próxima.

## Mídia

Imagens e áudios importados do Anki ficam em `/data/media` no servidor. O app baixa cada arquivo na primeira vez que ele aparece numa carta e guarda no aparelho, para funcionar offline depois.

## Autenticação

Um único usuário, definido por `ADMIN_EMAIL` e `ADMIN_PASSWORD`. O login devolve um token JWT válido por 180 dias, enviado no header `Authorization`. Depois de 10 tentativas erradas, o IP fica bloqueado por 15 minutos.

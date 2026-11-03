import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_NOTETYPES, syncRequestSchema, type SyncResponse } from '@phanki/shared'
import { createStore, type Db } from './db'
import { createAuth } from './auth'
import { importApkg, safeMediaName } from './apkg'

const PULL_PAGE = 5000

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
}

export interface AppOptions {
  db: Db
  dataDir: string
  webDir?: string
  email: string
  password: string
  jwtSecret: string
}

export function createApp(opts: AppOptions) {
  const store = createStore(opts.db)
  const auth = createAuth({ email: opts.email, password: opts.password, secret: opts.jwtSecret })
  const mediaDir = path.join(opts.dataDir, 'media')

  // Built-in notetypes exist on the server so every client converges on them.
  store.apply(BUILTIN_NOTETYPES.filter((nt) => !store.get('notetypes', nt.id)).map((nt) => ({ table: 'notetypes' as const, data: { ...nt, updatedAt: 1 } })))

  const app = new Hono()
  // Bearer tokens (no cookies), so any origin is fine — the Android app runs on https://localhost.
  app.use('/api/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], maxAge: 86400 }))

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.post('/api/login', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
    const token = await auth.login(ip, String(body.email ?? ''), String(body.password ?? ''))
    if (!token) return c.json({ error: 'Email ou senha inválidos' }, 401)
    return c.json({ token })
  })

  app.use('/api/sync', auth.requireAuth)
  app.post('/api/sync', bodyLimit({ maxSize: 50 * 1024 * 1024 }), async (c) => {
    const parsed = syncRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid request', issues: parsed.error.issues.slice(0, 5) }, 400)
    store.apply(parsed.data.changes)
    const res: SyncResponse = store.since(parsed.data.cursor, PULL_PAGE)
    return c.json(res)
  })

  app.use('/api/import', auth.requireAuth)
  app.post('/api/import', async (c) => {
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) return c.json({ error: 'Envie um arquivo .apkg' }, 400)
    try {
      const result = await importApkg(new Uint8Array(await file.arrayBuffer()), {
        store,
        mediaDir,
        resetProgress: body.resetProgress === 'true',
      })
      return c.json(result)
    } catch (e) {
      console.error('import failed', e)
      return c.json({ error: e instanceof Error ? e.message : 'Falha na importação' }, 400)
    }
  })

  app.use('/api/media/*', auth.requireAuth)
  app.get('/api/media/:name', (c) => {
    const name = safeMediaName(decodeURIComponent(c.req.param('name')))
    const file = name && path.join(mediaDir, name)
    if (!file || !fs.existsSync(file)) return c.json({ error: 'not found' }, 404)
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
    return c.body(fs.readFileSync(file), 200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000' })
  })

  if (opts.webDir && fs.existsSync(opts.webDir)) {
    const root = path.relative(process.cwd(), opts.webDir)
    app.use('/*', serveStatic({ root }))
    const index = fs.readFileSync(path.join(opts.webDir, 'index.html'), 'utf8')
    app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.html(index)))
  }

  return app
}

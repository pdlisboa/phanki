import { serve } from '@hono/node-server'
import path from 'node:path'
import { openDb } from './db'
import { createApp } from './app'

const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback
  if (v === undefined) {
    console.error(`Missing required env var ${name}`)
    process.exit(1)
  }
  return v
}

const dataDir = path.resolve(env('DATA_DIR', './data'))
const app = createApp({
  db: openDb(dataDir),
  dataDir,
  webDir: process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : undefined,
  email: env('ADMIN_EMAIL'),
  password: env('ADMIN_PASSWORD'),
  jwtSecret: env('JWT_SECRET'),
})

const port = Number(env('PORT', '3000'))
serve({ fetch: app.fetch, port }, () => console.log(`Phanki listening on :${port} (data: ${dataDir})`))

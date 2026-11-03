import { SignJWT, jwtVerify } from 'jose'
import crypto from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

export function createAuth(opts: { email: string; password: string; secret: string }) {
  const key = crypto.webcrypto.subtle.importKey('raw', Buffer.from(opts.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

  function safeEqual(a: string, b: string) {
    const ha = crypto.createHash('sha256').update(a).digest()
    const hb = crypto.createHash('sha256').update(b).digest()
    return crypto.timingSafeEqual(ha, hb)
  }

  // Simple in-memory brute-force guard: 10 failed attempts per IP per 15 minutes.
  const failures = new Map<string, { count: number; until: number }>()

  async function login(ip: string, email: string, password: string): Promise<string | null> {
    const f = failures.get(ip)
    if (f && f.until > Date.now() && f.count >= 10) return null
    const ok = safeEqual(email.trim().toLowerCase(), opts.email.trim().toLowerCase()) && safeEqual(password, opts.password)
    if (!ok) {
      const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + 15 * 60_000 }
      cur.count++
      failures.set(ip, cur)
      return null
    }
    failures.delete(ip)
    return new SignJWT({ sub: opts.email }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('180d').sign(await key)
  }

  const requireAuth: MiddlewareHandler = async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    try {
      await jwtVerify(token, await key)
    } catch {
      return c.json({ error: 'unauthorized' }, 401)
    }
    await next()
  }

  return { login, requireAuth }
}

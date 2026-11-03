import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { inject } from 'vitest'

export const CREDENTIALS = { email: 'it@phanki.test', password: 'integration-password' }

export async function startPhanki(): Promise<{ container: StartedTestContainer; url: () => string }> {
  const container = await new GenericContainer(inject('image'))
    .withEnvironment({ ADMIN_EMAIL: CREDENTIALS.email, ADMIN_PASSWORD: CREDENTIALS.password, JWT_SECRET: 'integration-secret-0123456789abcdef' })
    .withExposedPorts(3500)
    .withWaitStrategy(Wait.forHttp('/api/health', 3500).forStatusCode(200))
    .start()
  // The mapped port changes after a restart, so resolve it lazily.
  return { container, url: () => `http://${container.getHost()}:${container.getMappedPort(3500)}` }
}

export async function loginToken(base: string) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CREDENTIALS) })
  if (!res.ok) throw new Error(`login ${res.status}`)
  return ((await res.json()) as { token: string }).token
}

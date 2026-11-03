import { GenericContainer } from 'testcontainers'
import path from 'node:path'
import type { TestProject } from 'vitest/node'

export const IMAGE = 'phanki:integration-test'

declare module 'vitest' {
  export interface ProvidedContext {
    image: string
  }
}

export default async function setup(project: TestProject) {
  const root = path.resolve(import.meta.dirname, '../..')
  console.log('Building Docker image (first run can take a few minutes)…')
  await GenericContainer.fromDockerfile(root).withBuildArgs({ APP_VERSION: 'integration' }).withCache(true).build(IMAGE, { deleteOnExit: false })
  project.provide('image', IMAGE)
}

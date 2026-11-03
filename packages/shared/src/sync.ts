import { z } from 'zod'
import { TABLES, type SyncFields, type TableName } from './types'

export const syncRecordSchema = z.object({
  table: z.enum(TABLES as [TableName, ...TableName[]]),
  data: z.looseObject({ id: z.string().min(1).max(200), updatedAt: z.number() }),
})

export const syncRequestSchema = z.object({
  cursor: z.number().int().min(0),
  changes: z.array(syncRecordSchema).max(5000),
})

export type SyncRecord = z.infer<typeof syncRecordSchema>
export type SyncRequest = z.infer<typeof syncRequestSchema>

export interface SyncResponse {
  cursor: number
  changes: SyncRecord[]
  /** More pages are waiting on the server */
  more: boolean
}

/**
 * Last-write-wins merge rule shared by server and client.
 * Revlogs are immutable, so an existing one is never replaced.
 */
export function shouldApply(table: TableName, existing: SyncFields | undefined, incoming: SyncFields): boolean {
  if (!existing) return true
  if (table === 'revlogs') return !!incoming.deleted && !existing.deleted
  return incoming.updatedAt > existing.updatedAt
}

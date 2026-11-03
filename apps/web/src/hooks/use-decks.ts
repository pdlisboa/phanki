import { useLiveQuery } from 'dexie-react-hooks'
import { liveDecks } from '@/lib/repo'
import { alive, db } from '@/lib/db'

export function useDecks() {
  return useLiveQuery(liveDecks, [], undefined)
}

export function useNotetypes() {
  return useLiveQuery(async () => (await db.notetypes.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name)), [], undefined)
}

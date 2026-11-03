import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, ChevronLeft, ChevronRight, Play, Search, Trash2 } from 'lucide-react'
import { CardState, stripHtml, type Card } from '@phanki/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card as UICard } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { alive, db } from '@/lib/db'
import { useDecks } from '@/hooks/use-decks'
import { deleteNote, setSuspended, subtreeIds } from '@/lib/repo'
import { formatInterval } from '@/lib/scheduler'

const PAGE = 100
const STATE_LABEL: Record<number, string> = { 0: 'Nova', 1: 'Aprendendo', 2: 'Revisão', 3: 'Reaprendendo' }

export function BrowsePage() {
  const navigate = useNavigate()
  const decks = useDecks()
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query.trim().toLowerCase())
  const [deckId, setDeckId] = useState('all')
  const [state, setState] = useState('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [now] = useState(Date.now)

  const data = useLiveQuery(async () => {
    const [cards, notes] = await Promise.all([db.cards.toArray(), db.notes.toArray()])
    const noteMap = new Map(notes.filter(alive).map((n) => [n.id, { note: n, text: n.fields.map(stripHtml).join(' · ') }]))
    return { cards: cards.filter(alive), noteMap }
  }, [])

  const rows = useMemo(() => {
    if (!data || !decks) return []
    const deck = decks.find((d) => d.id === deckId)
    const deckIds = deck ? new Set(subtreeIds(decks, deck)) : undefined
    return data.cards
      .filter((c) => {
        if (deckIds && !deckIds.has(c.deckId)) return false
        if (state === 'suspended') {
          if (!c.suspended) return false
        } else if (state !== 'all' && String(c.state) !== state) return false
        const n = data.noteMap.get(c.noteId)
        if (!n) return false
        if (!q) return true
        if (q.startsWith('tag:')) return n.note.tags.some((t) => t.toLowerCase().startsWith(q.slice(4)))
        return n.text.toLowerCase().includes(q)
      })
      .sort((a, b) => (data.noteMap.get(b.noteId)!.note.updatedAt - data.noteMap.get(a.noteId)!.note.updatedAt) || a.ord - b.ord)
  }, [data, decks, deckId, state, q])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE)
  const deckName = (id: string) => decks?.find((d) => d.id === id)?.name ?? '—'
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])))
  const selectedCards = rows.filter((c) => selected.has(c.id))

  function dueLabel(c: Card) {
    if (c.state === CardState.New) return '—'
    const diff = c.due - now
    return diff <= 0 ? 'Agora' : formatInterval(diff)
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Cartas</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder='Buscar texto ou "tag:verbs"'
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={deckId} onValueChange={(v) => (setDeckId(v), setPage(0))}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os decks</SelectItem>
              {decks?.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={state} onValueChange={(v) => (setState(v), setPage(0))}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos estados</SelectItem>
              <SelectItem value="0">Novas</SelectItem>
              <SelectItem value="1">Aprendendo</SelectItem>
              <SelectItem value="2">Revisão</SelectItem>
              <SelectItem value="3">Reaprendendo</SelectItem>
              <SelectItem value="suspended">Suspensas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
          <span className="px-2">{selected.size} selecionadas</span>
          <Button size="sm" variant="outline" onClick={() => setSuspended([...selected], !selectedCards.every((c) => c.suspended)).then(() => setSelected(new Set()))}>
            {selectedCards.every((c) => c.suspended) ? <Play /> : <Ban />}
            {selectedCards.every((c) => c.suspended) ? 'Reativar' : 'Suspender'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={async () => {
              if (!confirm('Excluir as notas das cartas selecionadas?')) return
              for (const id of new Set(selectedCards.map((c) => c.noteId))) await deleteNote(id)
              setSelected(new Set())
            }}
          >
            <Trash2 /> Excluir notas
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar
          </Button>
        </div>
      )}

      <UICard className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={visible.length > 0 && visible.every((c) => selected.has(c.id))}
                  onCheckedChange={(v) => setSelected(v ? new Set([...selected, ...visible.map((c) => c.id)]) : new Set())}
                  aria-label="Selecionar página"
                />
              </TableHead>
              <TableHead>Conteúdo</TableHead>
              <TableHead className="hidden md:table-cell">Deck</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden sm:table-cell">Vence</TableHead>
              <TableHead className="hidden lg:table-cell">Intervalo</TableHead>
              <TableHead className="hidden lg:table-cell">Lapsos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" data-state={selected.has(c.id) ? 'selected' : undefined} onClick={() => navigate(`/edit/${c.noteId}`)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} aria-label="Selecionar" />
                </TableCell>
                <TableCell className="max-w-[16rem] truncate sm:max-w-md">{data?.noteMap.get(c.noteId)?.text}</TableCell>
                <TableCell className="hidden max-w-40 truncate text-muted-foreground md:table-cell">{deckName(c.deckId)}</TableCell>
                <TableCell>
                  {c.suspended ? <Badge variant="outline">Suspensa</Badge> : <Badge variant={c.state === 2 ? 'secondary' : 'outline'}>{STATE_LABEL[c.state]}</Badge>}
                </TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">{dueLabel(c)}</TableCell>
                <TableCell className="hidden tabular-nums lg:table-cell">{c.scheduledDays ? `${c.scheduledDays}d` : '—'}</TableCell>
                <TableCell className="hidden tabular-nums lg:table-cell">{c.lapses}</TableCell>
              </TableRow>
            ))}
            {data && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhuma carta encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </UICard>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{rows.length} cartas</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior">
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            {page + 1} / {pages}
          </span>
          <Button variant="outline" size="icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Próxima página">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}

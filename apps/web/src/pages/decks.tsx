import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, FolderPlus, MoreVertical, Pencil, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { dayKey, type Deck } from '@phanki/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useDecks } from '@/hooks/use-decks'
import { allDeckCounts, type DeckCounts } from '@/lib/queue'
import { createDeck, deleteDeck, renameDeck } from '@/lib/repo'
import { alive, db } from '@/lib/db'
import { cn } from '@/lib/utils'
import { NameDialog } from '@/components/name-dialog'
import { DeckOptionsDialog } from '@/components/deck-options'

function Counts({ c, className }: { c?: DeckCounts; className?: string }) {
  const cell = (n: number | undefined, color: string) => <span className={cn('w-8 text-right tabular-nums', n ? color : 'text-muted-foreground/40')}>{n ?? 0}</span>
  return (
    <div className={cn('flex gap-2 text-sm font-medium', className)}>
      {cell(c?.new, 'text-new')}
      {cell(c?.learn, 'text-learn')}
      {cell(c?.review, 'text-review')}
    </div>
  )
}

function useStreak() {
  return useLiveQuery(async () => {
    const since = Date.now() - 400 * 86_400_000
    const days = new Set((await db.revlogs.where('review').above(since).toArray()).filter(alive).map((r) => dayKey(r.review)))
    let streak = 0
    const d = new Date()
    if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1)
    while (days.has(dayKey(d.getTime()))) {
      streak++
      d.setDate(d.getDate() - 1)
    }
    const today = (await db.revlogs.where('review').above(Date.now() - 86_400_000).toArray()).filter((r) => alive(r) && dayKey(r.review) === dayKey(Date.now()))
    return { streak, todayCount: today.length, todayMinutes: Math.round(today.reduce((s, r) => s + r.duration, 0) / 60_000) }
  }, [])
}

export function DecksPage() {
  const decks = useDecks()
  const counts = useLiveQuery(() => (decks ? allDeckCounts(decks) : undefined), [decks])
  const stats = useStreak()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<{ kind: 'create' } | { kind: 'rename' | 'delete' | 'options'; deck: Deck } | null>(null)

  const visible = (decks ?? []).filter((d) => {
    const parts = d.name.split('::')
    for (let i = 1; i < parts.length; i++) if (collapsed.has(parts.slice(0, i).join('::'))) return false
    return true
  })
  const hasChildren = (d: Deck) => decks?.some((x) => x.name.startsWith(d.name + '::'))
  const total = decks?.filter((d) => !d.name.includes('::')).reduce((s, d) => {
    const c = counts?.get(d.id)
    return s + (c ? c.new + c.learn + c.review : 0)
  }, 0)

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-3 gap-3">
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">Para hoje</span>
          <span className="text-2xl font-semibold tabular-nums">{total ?? '–'}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">Estudadas</span>
          <span className="text-2xl font-semibold tabular-nums">
            {stats?.todayCount ?? '–'}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{stats ? `${stats.todayMinutes}min` : ''}</span>
          </span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">Sequência</span>
          <span className="text-2xl font-semibold tabular-nums">
            {stats?.streak ?? '–'} <span className="text-sm font-normal text-muted-foreground">dias</span>
          </span>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Decks</h1>
        <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'create' })}>
          <FolderPlus /> Novo deck
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center border-b px-4 py-2 text-xs text-muted-foreground">
          <span className="flex-1">Deck</span>
          <div className="flex gap-2">
            <span className="w-8 text-right">Novos</span>
            <span className="w-8 text-right">Apr.</span>
            <span className="w-8 text-right">Rev.</span>
          </div>
          <span className="w-10" />
        </div>
        {!decks && <Skeleton className="m-4 h-10" />}
        {visible.map((d) => {
          const depth = d.name.split('::').length - 1
          const label = d.name.split('::').pop()
          const children = hasChildren(d)
          return (
            <div key={d.id} className="group flex items-center border-b last:border-b-0 hover:bg-accent/50">
              <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: 8 + depth * 20 }}>
                <button
                  className={cn('grid size-7 shrink-0 place-items-center text-muted-foreground', !children && 'invisible')}
                  aria-label="Expandir"
                  onClick={() => setCollapsed((s) => (s.has(d.name) ? new Set([...s].filter((x) => x !== d.name)) : new Set([...s, d.name])))}
                >
                  <ChevronRight className={cn('size-4 transition-transform', !collapsed.has(d.name) && 'rotate-90')} />
                </button>
                <Link to={`/study/${d.id}`} className="min-w-0 flex-1 truncate py-3.5 pr-2 font-medium">
                  {label}
                </Link>
              </div>
              <Counts c={counts?.get(d.id)} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="mx-1" aria-label="Opções do deck">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDialog({ kind: 'options', deck: d })}>
                    <Settings2 /> Opções
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDialog({ kind: 'rename', deck: d })}>
                    <Pencil /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: 'delete', deck: d })}>
                    <Trash2 /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </Card>
      <p className="text-center text-xs text-muted-foreground">Use "Pai::Filho" no nome para criar subdecks.</p>

      <NameDialog
        key={dialog ? `${dialog.kind}-${'deck' in dialog ? dialog.deck.id : ''}` : 'closed'}
        open={dialog?.kind === 'create' || dialog?.kind === 'rename'}
        title={dialog?.kind === 'rename' ? 'Renomear deck' : 'Novo deck'}
        initial={dialog && 'deck' in dialog ? dialog.deck.name : ''}
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          if (dialog?.kind === 'rename') await renameDeck(dialog.deck, name)
          else await createDeck(name)
          setDialog(null)
        }}
      />
      {dialog?.kind === 'options' && <DeckOptionsDialog deck={dialog.deck} onClose={() => setDialog(null)} />}
      <AlertDialog open={dialog?.kind === 'delete'} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir deck?</AlertDialogTitle>
            <AlertDialogDescription>
              "{dialog && 'deck' in dialog ? dialog.deck.name : ''}", seus subdecks e todas as cartas serão excluídos em todos os dispositivos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (dialog?.kind === 'delete') await deleteDeck(dialog.deck)
                toast.success('Deck excluído')
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

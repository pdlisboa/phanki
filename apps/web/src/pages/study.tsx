import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, PartyPopper, Undo2, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { renderCard, stripHtml, type Card, type Note, type Notetype } from '@phanki/shared'
import type { Grade } from 'ts-fsrs'
import { Button } from '@/components/ui/button'
import { Card as UICard } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { db, save } from '@/lib/db'
import { buildQueue, nextCard, type Queue } from '@/lib/queue'
import { liveDecks } from '@/lib/repo'
import { GRADES, answerCard, previewIntervals } from '@/lib/scheduler'
import { playSound, soundsIn, useCardHtml } from '@/lib/media'
import { speak, stopSpeaking } from '@/lib/tts'
import { getSettings } from '@/lib/settings'
import { sync } from '@/lib/sync'
import { cn } from '@/lib/utils'

interface Current {
  card: Card
  note: Note
  notetype: Notetype
  question: string
  answer: string
}

const BUTTONS = [
  { label: 'Errei', key: '1', className: 'border-red-500/40 hover:bg-red-500/10 text-red-600 dark:text-red-400' },
  { label: 'Difícil', key: '2', className: 'border-orange-500/40 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  { label: 'Bom', key: '3', className: 'border-green-500/40 hover:bg-green-500/10 text-green-600 dark:text-green-400' },
  { label: 'Fácil', key: '4', className: 'border-sky-500/40 hover:bg-sky-500/10 text-sky-600 dark:text-sky-400' },
]

function CardHtml({ html, onClick }: { html: string; onClick: (e: React.MouseEvent) => void }) {
  const out = useCardHtml(html)
  return <div className="card-content" onClick={onClick} dangerouslySetInnerHTML={{ __html: out }} />
}

export function StudyPage() {
  const { deckId } = useParams()
  const navigate = useNavigate()
  const [deckName, setDeckName] = useState('')
  const [queue, setQueue] = useState<Queue>()
  const [current, setCurrent] = useState<Current | null>()
  const [revealed, setRevealed] = useState(false)
  const [studied, setStudied] = useState(0)
  const [undoStack, setUndoStack] = useState<{ card: Card; revlogId: string }[]>([])
  const shownAt = useRef(0)

  const load = useCallback(
    async (studiedCount: number) => {
      const decks = await liveDecks()
      const deck = decks.find((d) => d.id === deckId)
      if (!deck) return navigate('/')
      setDeckName(deck.name)
      const q = await buildQueue(deck, decks)
      setQueue(q)
      const card = nextCard(q, studiedCount)
      if (!card) return setCurrent(null)
      const note = await db.notes.get(card.noteId)
      const notetype = note && (await db.notetypes.get(note.notetypeId))
      if (!note || !notetype) {
        // Orphan card (note not synced yet): skip it for this session.
        q.review = q.review.filter((c) => c.id !== card.id)
        return setCurrent(null)
      }
      const { question, answer } = renderCard({ notetype, fields: note.fields, ord: card.ord, tags: note.tags, deckName: deck.name })
      setCurrent({ card, note, notetype, question, answer })
      setRevealed(false)
      shownAt.current = Date.now()
    },
    [deckId, navigate],
  )

  useEffect(() => {
    // Reads the queue from IndexedDB; state is only set once that async read resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(0)
    return () => stopSpeaking()
  }, [load])

  const ttsText = current ? stripHtml(current.note.fields[current.notetype.ttsField ?? 0] ?? '') : ''

  const playSide = useCallback(
    (side: 'question' | 'answer') => {
      if (!current) return
      const html = side === 'question' ? current.question : current.answer
      const already = side === 'answer' ? new Set(soundsIn(current.question)) : new Set<string>()
      const sounds = soundsIn(html).filter((s) => !already.has(s))
      if (sounds.length) return void playSound(sounds[0])
      if (getSettings().autoplay === side) void speak(ttsText)
    },
    [current, ttsText],
  )

  useEffect(() => {
    if (current) playSide(revealed ? 'answer' : 'question')
  }, [current, revealed, playSide])

  const answer = useCallback(
    async (grade: Grade) => {
      if (!current || !queue) return
      const { card, revlog } = answerCard(current.card, grade, queue.config, Date.now() - shownAt.current)
      await db.transaction('rw', db.cards, db.revlogs, async () => {
        await save('cards', [card])
        await save('revlogs', [revlog])
      })
      setUndoStack((s) => [...s.slice(-19), { card: current.card, revlogId: revlog.id }])
      setStudied(studied + 1)
      await load(studied + 1)
    },
    [current, queue, studied, load],
  )

  const undo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1]
    if (!last) return
    const revlog = await db.revlogs.get(last.revlogId)
    await db.transaction('rw', db.cards, db.revlogs, async () => {
      const latest = await db.cards.get(last.card.id)
      await save('cards', [{ ...last.card, updatedAt: latest?.updatedAt ?? last.card.updatedAt }])
      if (revlog) await save('revlogs', [{ ...revlog, deleted: 1 }])
    })
    setUndoStack((s) => s.slice(0, -1))
    setStudied(Math.max(0, studied - 1))
    // Show the undone card again.
    const note = await db.notes.get(last.card.noteId)
    const notetype = note && (await db.notetypes.get(note.notetypeId))
    if (note && notetype) {
      const { question, answer } = renderCard({ notetype, fields: note.fields, ord: last.card.ord, tags: note.tags, deckName })
      setCurrent({ card: last.card, note, notetype, question, answer })
      setRevealed(false)
      shownAt.current = Date.now()
    }
    toast('Resposta desfeita')
  }, [undoStack, studied, deckName])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'z' && (e.metaKey || e.ctrlKey)) || e.key === 'u') return void undo()
      if (!current) return
      if (e.key === 'r') return playSide(revealed ? 'answer' : 'question')
      if (!revealed) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          setRevealed(true)
        }
        return
      }
      const idx = ['1', '2', '3', '4'].indexOf(e.key)
      if (idx >= 0) void answer(GRADES[idx])
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        void answer(GRADES[2])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, answer, undo, playSide])

  useEffect(() => {
    if (current === null && studied > 0) void sync()
  }, [current, studied])

  function onContentClick(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest('[data-sound],[data-tts]') as HTMLElement | null
    if (!el) return
    e.stopPropagation()
    if (el.dataset.sound) void playSound(decodeURIComponent(el.dataset.sound))
    else if (el.dataset.tts) void speak(decodeURIComponent(el.dataset.tts))
  }

  const intervals = current && queue ? previewIntervals(current.card, queue.config) : []
  const active = current?.card.state === 0 ? 'new' : current?.card.state === 2 ? 'review' : 'learn'

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/" aria-label="Voltar">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="min-w-0 flex-1 truncate font-medium">{deckName.split('::').pop()}</span>
        {queue && current && (
          <div className="flex gap-3 text-sm font-semibold tabular-nums">
            <span className={cn('text-new', active === 'new' && 'underline underline-offset-4')}>{queue.counts.new}</span>
            <span className={cn('text-learn', active === 'learn' && 'underline underline-offset-4')}>{queue.counts.learn}</span>
            <span className={cn('text-review', active === 'review' && 'underline underline-offset-4')}>{queue.counts.review}</span>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={() => void undo()} disabled={!undoStack.length} aria-label="Desfazer">
          <Undo2 />
        </Button>
        {current && (
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/edit/${current.note.id}`} aria-label="Editar nota">
              <Pencil />
            </Link>
          </Button>
        )}
      </div>

      {current === undefined && <Skeleton className="h-80 w-full rounded-xl" />}

      {current === null && (
        <UICard className="items-center gap-3 p-10 text-center">
          <PartyPopper className="size-10 text-review" />
          <h2 className="text-xl font-semibold">Parabéns! Você terminou por hoje.</h2>
          <p className="text-muted-foreground">{studied ? `${studied} cartas estudadas nesta sessão.` : 'Nenhuma carta pendente neste deck.'}</p>
          <Button asChild className="mt-2">
            <Link to="/">Voltar aos decks</Link>
          </Button>
        </UICard>
      )}

      {current && (
        <>
          <UICard className="relative flex-1 justify-center p-6 text-center sm:p-10" onClick={() => !revealed && setRevealed(true)}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3"
              aria-label="Ouvir pronúncia"
              onClick={(e) => {
                e.stopPropagation()
                void speak(ttsText)
              }}
            >
              <Volume2 />
            </Button>
            <CardHtml html={revealed ? current.answer : current.question} onClick={onContentClick} />
          </UICard>

          <div className="sticky bottom-0 bg-background pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {!revealed ? (
              <Button size="lg" className="h-14 w-full text-base" onClick={() => setRevealed(true)}>
                Mostrar resposta
              </Button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {BUTTONS.map((b, i) => (
                  <Button key={b.key} variant="outline" className={cn('h-16 flex-col gap-0.5', b.className)} onClick={() => void answer(GRADES[i])}>
                    <span className="text-xs opacity-80">{intervals[i]}</span>
                    <span className="font-semibold">{b.label}</span>
                  </Button>
                ))}
              </div>
            )}
            <p className="mt-2 hidden text-center text-xs text-muted-foreground md:block">Espaço: mostrar/bom · 1–4: responder · R: repetir áudio · U: desfazer</p>
          </div>
        </>
      )}
    </div>
  )
}

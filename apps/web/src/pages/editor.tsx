import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, Trash2, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { BASIC_ID, renderCard, cardOrds, stripHtml, type Note } from '@phanki/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDecks, useNotetypes } from '@/hooks/use-decks'
import { db } from '@/lib/db'
import { addNote, deleteNote, updateNote } from '@/lib/repo'
import { useCardHtml } from '@/lib/media'
import { speak } from '@/lib/tts'

const LAST_KEY = 'phanki.editor.last'

function Preview({ html }: { html: string }) {
  const out = useCardHtml(html)
  return <div className="card-content min-h-24 rounded-lg border bg-muted/30 p-4 text-center" dangerouslySetInnerHTML={{ __html: out }} />
}

export function EditorPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const decks = useDecks()
  const notetypes = useNotetypes()
  const [editing, setEditing] = useState<Note>()
  const last = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as { deckId?: string; notetypeId?: string }
    } catch {
      return {}
    }
  }, [])
  const [selectedDeckId, setDeckId] = useState(last.deckId ?? '')
  const [notetypeId, setNotetypeId] = useState(last.notetypeId ?? BASIC_ID)
  const [fields, setFields] = useState<string[]>([])
  const [tags, setTags] = useState('')
  const [previewOrd, setPreviewOrd] = useState(0)
  const [side, setSide] = useState<'q' | 'a'>('q')
  const firstField = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!noteId) return
    void db.notes.get(noteId).then((n) => {
      if (!n) return navigate('/browse')
      setEditing(n)
      setDeckId(n.deckId)
      setNotetypeId(n.notetypeId)
      setFields(n.fields)
      setTags(n.tags.join(' '))
    })
  }, [noteId, navigate])

  // Fall back to the first deck when the remembered one no longer exists.
  const deckId = decks?.some((d) => d.id === selectedDeckId) ? selectedDeckId : (decks?.[0]?.id ?? '')

  const notetype = notetypes?.find((n) => n.id === notetypeId)
  const values = notetype ? notetype.fields.map((_f, i) => fields[i] ?? '') : []
  const ords = notetype ? cardOrds(notetype, values) : []
  const rendered = notetype ? renderCard({ notetype, fields: values, ord: ords.includes(previewOrd) ? previewOrd : (ords[0] ?? 0) }) : undefined

  async function submit() {
    if (!notetype || !deckId) return
    if (!stripHtml(values[0] ?? '')) return toast.error(`Preencha o campo "${notetype.fields[0]}"`)
    if (notetype.kind === 'cloze' && !ords.length) return toast.error('Use {{c1::texto}} para criar uma lacuna')
    const tagList = tags.split(/\s+/).filter(Boolean)
    if (editing) {
      await updateNote({ ...editing, deckId, notetypeId, fields: values, tags: tagList }, notetype)
      toast.success('Nota salva')
      navigate(-1)
    } else {
      // Clear before the async write so typing right after saving starts a fresh note.
      setFields([])
      firstField.current?.focus()
      try {
        await addNote({ deckId, notetype, fields: values, tags: tagList })
      } catch (e) {
        setFields(values)
        throw e
      }
      localStorage.setItem(LAST_KEY, JSON.stringify({ deckId, notetypeId }))
      toast.success(`${ords.length} carta${ords.length > 1 ? 's' : ''} adicionada${ords.length > 1 ? 's' : ''}`)
    }
  }

  function wrapCloze() {
    const el = document.activeElement
    if (!(el instanceof HTMLTextAreaElement)) return
    const idx = Number(el.dataset.idx)
    const n = Math.max(0, ...values.flatMap((v) => [...v.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1])))) + 1
    const v = values[idx]
    const next = `${v.slice(0, el.selectionStart)}{{c${n}::${v.slice(el.selectionStart, el.selectionEnd)}}}${v.slice(el.selectionEnd)}`
    setFields(values.map((x, i) => (i === idx ? next : x)))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? 'Editar nota' : 'Adicionar nota'}</CardTitle>
        </CardHeader>
        <CardContent
          className="grid gap-4"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
            if (e.key.toLowerCase() === 'c' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              wrapCloze()
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={notetypeId} onValueChange={setNotetypeId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {notetypes?.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Deck</Label>
              <Select value={deckId} onValueChange={setDeckId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {decks?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {notetype?.fields.map((name, i) => (
            <div key={name + i} className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`f${i}`}>{name}</Label>
                {i === (notetype.ttsField ?? 0) && (
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => void speak(stripHtml(values[i]))} aria-label="Ouvir">
                    <Volume2 className="size-4" />
                  </Button>
                )}
              </div>
              <Textarea
                id={`f${i}`}
                ref={i === 0 ? firstField : undefined}
                data-idx={i}
                rows={i === 0 ? 2 : 3}
                value={values[i]}
                autoFocus={i === 0 && !editing}
                onChange={(e) => setFields(values.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </div>
          ))}
          {notetype?.kind === 'cloze' && (
            <p className="text-xs text-muted-foreground">
              Selecione um trecho e use Ctrl/⌘+Shift+C ou{' '}
              <button type="button" className="underline" onMouseDown={(e) => e.preventDefault()} onClick={wrapCloze}>
                crie uma lacuna
              </button>
              .
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" placeholder="verbs phrasal-verbs" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void submit()}>
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
            {editing && (
              <Button
                variant="outline"
                size="icon"
                className="text-destructive"
                aria-label="Excluir nota"
                onClick={async () => {
                  if (!confirm('Excluir esta nota e suas cartas?')) return
                  await deleteNote(editing.id)
                  toast.success('Nota excluída')
                  navigate(-1)
                }}
              >
                <Trash2 />
              </Button>
            )}
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">Ctrl/⌘+Enter para salvar</p>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="size-4" /> Pré-visualização
          </CardTitle>
          <Tabs value={side} onValueChange={(v) => setSide(v as 'q' | 'a')}>
            <TabsList>
              <TabsTrigger value="q">Frente</TabsTrigger>
              <TabsTrigger value="a">Verso</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="grid gap-3">
          {ords.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {ords.map((o) => (
                <Button key={o} size="sm" variant={o === previewOrd ? 'secondary' : 'ghost'} onClick={() => setPreviewOrd(o)}>
                  Carta {o + 1}
                </Button>
              ))}
            </div>
          )}
          <Preview html={side === 'q' ? (rendered?.question ?? '') : (rendered?.answer ?? '')} />
          <p className="text-xs text-muted-foreground">
            Gera {ords.length} carta{ords.length === 1 ? '' : 's'}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

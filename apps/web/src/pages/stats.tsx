import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CardState, dayKey, startOfStudyDay } from '@phanki/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { alive, db } from '@/lib/db'
import { useDecks } from '@/hooks/use-decks'
import { subtreeIds } from '@/lib/repo'

const DAY = 86_400_000

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  )
}

function Heatmap({ counts }: { counts: Map<string, number> }) {
  const weeks = 53
  const today = new Date(startOfStudyDay())
  const start = new Date(today)
  start.setDate(start.getDate() - (weeks - 1) * 7 - today.getDay())
  const max = Math.max(1, ...counts.values())
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)))
  const shades = ['bg-muted', 'bg-review/30', 'bg-review/55', 'bg-review/80', 'bg-review']
  const cols = Array.from({ length: weeks }, (_w, w) =>
    Array.from({ length: 7 }, (_d, d) => {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      return date
    }),
  )
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max gap-[3px]">
        {cols.map((days, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {days.map((date) => {
              if (date > today) return <div key={date.getTime()} className="size-3" />
              const key = dayKey(date.getTime() + 5 * 3_600_000)
              const n = counts.get(key) ?? 0
              return (
                <UITooltip key={key}>
                  <TooltipTrigger asChild>
                    <div className={`size-3 rounded-[3px] ${shades[level(n)]}`} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {n} revisões · {date.toLocaleDateString()}
                  </TooltipContent>
                </UITooltip>
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        Menos {shades.map((s) => <div key={s} className={`size-3 rounded-[3px] ${s}`} />)} Mais
      </div>
    </div>
  )
}

function DayBars({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
        <Tooltip
          cursor={{ fill: 'var(--accent)' }}
          contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--popover-foreground)', fontSize: 12 }}
          formatter={(v) => [v, label]}
        />
        <Bar dataKey="value" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function StatsPage() {
  const decks = useDecks()
  const [deckId, setDeckId] = useState('all')
  const raw = useLiveQuery(async () => {
    const [revlogs, cards] = await Promise.all([db.revlogs.where('review').above(Date.now() - 366 * DAY).toArray(), db.cards.toArray()])
    return { revlogs: revlogs.filter(alive), cards: cards.filter(alive) }
  }, [])

  const s = useMemo(() => {
    if (!raw || !decks) return undefined
    const deck = decks.find((d) => d.id === deckId)
    const ids = deck ? new Set(subtreeIds(decks, deck)) : undefined
    const revlogs = ids ? raw.revlogs.filter((r) => ids.has(r.deckId)) : raw.revlogs
    const cards = ids ? raw.cards.filter((c) => ids.has(c.deckId)) : raw.cards

    const perDay = new Map<string, number>()
    for (const r of revlogs) perDay.set(dayKey(r.review), (perDay.get(dayKey(r.review)) ?? 0) + 1)

    const today = startOfStudyDay()
    const last30 = Array.from({ length: 30 }, (_x, i) => {
      const t = today - (29 - i) * DAY + 5 * 3_600_000
      return { day: new Date(t).toLocaleDateString([], { day: '2-digit', month: '2-digit' }), value: perDay.get(dayKey(t)) ?? 0 }
    })

    const forecast = Array.from({ length: 30 }, (_x, i) => ({ day: i === 0 ? 'Hoje' : `+${i}d`, value: 0 }))
    for (const c of cards) {
      if (c.state === CardState.New || c.suspended) continue
      const idx = Math.max(0, Math.floor((c.due - today) / DAY))
      if (idx < 30) forecast[idx].value++
    }

    // True retention: share of review-state answers in the last 30 days that were not "Again".
    const recent = revlogs.filter((r) => r.state === CardState.Review && r.review >= today - 30 * DAY)
    const retention = recent.length ? Math.round((recent.filter((r) => r.rating > 1).length / recent.length) * 1000) / 10 : null

    const byState = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 }
    for (const c of cards) {
      if (c.suspended) byState.suspended++
      else if (c.state === CardState.New) byState.new++
      else if (c.state !== CardState.Review) byState.learning++
      else if (c.scheduledDays >= 21) byState.mature++
      else byState.young++
    }
    const totalTime = revlogs.filter((r) => r.review >= today - 30 * DAY).reduce((a, r) => a + r.duration, 0)
    return { perDay, last30, forecast, retention, recentCount: recent.length, byState, totalCards: cards.length, minutes30: Math.round(totalTime / 60_000), studiedDays: perDay.size }
  }, [raw, decks, deckId])

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Estatísticas</h1>
        <Select value={deckId} onValueChange={setDeckId}>
          <SelectTrigger className="w-40 sm:w-48">
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
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Retenção real (30d)" value={s?.retention != null ? `${s.retention}%` : '—'} hint={s ? `${s.recentCount} revisões` : undefined} />
        <Stat label="Tempo estudado (30d)" value={s ? `${s.minutes30}min` : '—'} />
        <Stat label="Dias estudados (1 ano)" value={s?.studiedDays ?? '—'} />
        <Stat label="Total de cartas" value={s?.totalCards ?? '—'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atividade</CardTitle>
          <CardDescription>Revisões por dia no último ano</CardDescription>
        </CardHeader>
        <CardContent>{s && <Heatmap counts={s.perDay} />}</CardContent>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revisões</CardTitle>
            <CardDescription>Últimos 30 dias</CardDescription>
          </CardHeader>
          <CardContent>{s && <DayBars data={s.last30} label="Revisões" />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Previsão</CardTitle>
            <CardDescription>Cartas que vencem nos próximos 30 dias</CardDescription>
          </CardHeader>
          <CardContent>{s && <DayBars data={s.forecast} label="Vencem" />}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cartas por estado</CardTitle>
          <CardDescription>Maduras = intervalo de 21 dias ou mais</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {s &&
            (
              [
                ['Novas', s.byState.new, 'bg-new'],
                ['Aprendendo', s.byState.learning, 'bg-learn'],
                ['Jovens', s.byState.young, 'bg-review/50'],
                ['Maduras', s.byState.mature, 'bg-review'],
                ['Suspensas', s.byState.suspended, 'bg-muted-foreground/40'],
              ] as const
            ).map(([label, n, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${color}`} />
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="ml-auto font-medium tabular-nums">{n}</span>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  )
}

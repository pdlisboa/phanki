import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2, LogOut, RefreshCw, Upload, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { api, serverUrl } from '@/lib/api'
import { db } from '@/lib/db'
import { isNative } from '@/lib/platform'
import { setSettings, useSettings } from '@/lib/settings'
import { fullResync, sync, useSyncState } from '@/lib/sync'
import { speak } from '@/lib/tts'

const RELEASES_URL = import.meta.env.VITE_RELEASES_URL as string | undefined

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="sm:w-56">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  const syncState = useSyncState()
  const fileRef = useRef<HTMLInputElement>(null)
  const [resetProgress, setResetProgress] = useState(false)
  const [importing, setImporting] = useState(false)

  async function importFile(file: File) {
    setImporting(true)
    try {
      await sync()
      const form = new FormData()
      form.append('file', file)
      form.append('resetProgress', String(resetProgress))
      const r = await api<{ decks: number; notes: number; cards: number; revlogs: number; media: number }>('/api/import', { method: 'POST', body: form })
      await sync()
      toast.success(`Importado: ${r.notes} notas, ${r.cards} cartas novas, ${r.media} mídias`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na importação')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

      <Card>
        <CardHeader>
          <CardTitle>Estudo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Row label="Tocar áudio automaticamente" description="Usa o áudio da carta ou a voz (TTS) do primeiro campo">
            <Select value={settings.autoplay} onValueChange={(v) => setSettings({ autoplay: v as typeof settings.autoplay })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="question">Na frente</SelectItem>
                <SelectItem value="answer">No verso</SelectItem>
                <SelectItem value="off">Desligado</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Velocidade da voz" description={`${settings.ttsRate.toFixed(2)}x`}>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.ttsRate}
                onChange={(e) => setSettings({ ttsRate: Number(e.target.value) })}
                className="w-full accent-primary"
                aria-label="Velocidade da voz"
              />
              <Button variant="outline" size="icon" onClick={() => void speak('The quick brown fox jumps over the lazy dog.')} aria-label="Testar voz">
                <Volume2 />
              </Button>
            </div>
          </Row>
          <Row label="Tema">
            <Select value={settings.theme} onValueChange={(v) => setSettings({ theme: v as typeof settings.theme })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Sistema</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importar do Anki</CardTitle>
          <CardDescription>Arquivo .apkg exportado pelo Anki (com mídia). Reimportar o mesmo deck atualiza as notas sem duplicar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={resetProgress} onCheckedChange={(v) => setResetProgress(!!v)} />
            Começar do zero (ignorar o progresso e o histórico do Anki)
          </label>
          <input ref={fileRef} type="file" accept=".apkg,.colpkg" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          <Button variant="outline" disabled={importing || syncState.status === 'offline'} onClick={() => fileRef.current?.click()}>
            {importing ? <Loader2 className="animate-spin" /> : <Upload />}
            {importing ? 'Importando…' : 'Escolher arquivo .apkg'}
          </Button>
          {syncState.status === 'offline' && <p className="text-xs text-muted-foreground">A importação precisa de conexão com o servidor.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sincronização</CardTitle>
          <CardDescription>
            Servidor: {serverUrl() || '—'}
            {syncState.lastSync && ` · última às ${new Date(syncState.lastSync).toLocaleTimeString()}`}
            {syncState.pending > 0 && ` · ${syncState.pending} pendentes`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {isNative && (
            <div className="grid gap-1.5">
              <Label htmlFor="server">URL do servidor</Label>
              <Input
                id="server"
                inputMode="url"
                defaultValue={settings.serverUrl}
                onBlur={(e) => {
                  const v = e.target.value.trim().replace(/\/+$/, '')
                  if (v !== settings.serverUrl) setSettings({ serverUrl: v, cursor: 0, token: '' })
                }}
              />
              <p className="text-xs text-muted-foreground">Mudar o servidor exige novo login.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void sync()}>
              <RefreshCw className={syncState.status === 'syncing' ? 'animate-spin' : ''} /> Sincronizar agora
            </Button>
            <Button variant="ghost" onClick={() => void fullResync().then(() => toast.success('Coleção baixada novamente'))}>
              Baixar tudo de novo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSettings({ token: '' })}>
              <LogOut /> Sair
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (syncState.pending && !confirm(`Há ${syncState.pending} alterações não sincronizadas que serão perdidas. Continuar?`)) return
                if (!confirm('Apagar todos os dados deste dispositivo? Os dados no servidor não são afetados.')) return
                await db.delete()
                setSettings({ token: '', cursor: 0 })
                location.reload()
              }}
            >
              Apagar dados locais
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Phanki {__APP_VERSION__}</span>
            {isNative && RELEASES_URL && (
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                <Download className="size-3" /> Baixar nova versão
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

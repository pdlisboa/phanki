import { CloudOff, CloudAlert, Loader2, Cloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { sync, useSyncState } from '@/lib/sync'

export function SyncIndicator() {
  const s = useSyncState()
  const label =
    s.status === 'syncing'
      ? 'Sincronizando…'
      : s.status === 'offline'
        ? `Offline${s.pending ? ` · ${s.pending} alterações pendentes` : ''}`
        : s.status === 'error'
          ? `Erro: ${s.error}`
          : s.lastSync
            ? `Sincronizado às ${new Date(s.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Sincronizar'
  const Icon = s.status === 'syncing' ? Loader2 : s.status === 'offline' ? CloudOff : s.status === 'error' ? CloudAlert : Cloud
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={() => void sync()}>
          <Icon className={s.status === 'syncing' ? 'animate-spin' : s.status === 'error' ? 'text-destructive' : ''} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

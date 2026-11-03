import { useState } from 'react'
import type { Deck, DeckConfig } from '@phanki/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deckConfig, updateDeckConfig } from '@/lib/repo'

export function DeckOptionsDialog({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [cfg, setCfg] = useState<DeckConfig>(deckConfig(deck))
  const num = (k: keyof DeckConfig, label: string, props: React.ComponentProps<'input'> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} type="number" value={cfg[k] as number} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} {...props} />
    </div>
  )
  const steps = (k: 'learningSteps' | 'relearningSteps', label: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={cfg[k].join(' ')} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value.split(/\s+/).filter(Boolean) })} placeholder="1m 10m" />
    </div>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opções · {deck.name.split('::').pop()}</DialogTitle>
          <DialogDescription>Os limites valem para este deck incluindo os subdecks.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {num('newPerDay', 'Novas por dia', { min: 0 })}
          {num('reviewsPerDay', 'Revisões por dia', { min: 0 })}
          {num('retention', 'Retenção desejada', { min: 0.7, max: 0.99, step: 0.01 })}
          {num('maxInterval', 'Intervalo máximo (dias)', { min: 1 })}
          {steps('learningSteps', 'Passos de aprendizado')}
          {steps('relearningSteps', 'Passos de reaprendizado')}
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              await updateDeckConfig(deck, { ...cfg, retention: Math.min(0.99, Math.max(0.7, cfg.retention)) })
              onClose()
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

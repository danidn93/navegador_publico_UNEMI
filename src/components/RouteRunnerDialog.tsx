import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (o:boolean)=>void
  routeName: string
  currentStepText: string | null
  imageUrl?: string | null
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

export default function RouteRunnerDialog({
  open, onOpenChange, routeName, currentStepText, imageUrl, hasPrev, hasNext, onPrev, onNext
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recorrido: {routeName}</DialogTitle>
          <DialogDescription>Sigue las indicaciones en orden. Usa “Siguiente” para avanzar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {imageUrl ? (
            <div className="w-full border rounded overflow-hidden">
              <img src={imageUrl} alt="Paso del recorrido" className="w-full h-auto object-contain max-h-[280px]" />
            </div>
          ) : null}
          <div className="min-h-[80px] whitespace-pre-wrap text-sm">
            {currentStepText ?? 'Sin paso seleccionado'}
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrev} disabled={!hasPrev}>Anterior</Button>
          <Button onClick={onNext} disabled={!hasNext}>Siguiente</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

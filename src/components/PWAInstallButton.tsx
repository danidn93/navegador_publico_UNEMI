import { Button } from '@/components/ui/button'
import { usePWAInstall } from '@/pwa/usePWAInstall'
import { Smartphone } from 'lucide-react'

export default function PWAInstallButton() {
  const { canInstall, promptInstall } = usePWAInstall()
  if (!canInstall) return null
  return (
    <Button size="sm" variant="outline" onClick={promptInstall} title="Instalar como app">
      <Smartphone className="w-4 h-4 mr-2" /> Instalar
    </Button>
  )
}

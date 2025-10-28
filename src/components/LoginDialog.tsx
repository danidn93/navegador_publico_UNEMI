import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'

interface Props { open: boolean; onOpenChange: (o:boolean)=>void }

export default function LoginDialog({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { toast.error('Credenciales inválidas'); return }
    toast.success('Sesión iniciada')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciar sesión</DialogTitle>
          <DialogDescription>Accede para ver destinos según tu rol.</DialogDescription>
        </DialogHeader>
        <form onSubmit={signIn} className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={e=>setEmail(e.target.value)} type="email" required/>
          </div>
          <div>
            <Label>Contraseña</Label>
            <Input value={password} onChange={e=>setPassword(e.target.value)} type="password" required/>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading? 'Entrando…':'Entrar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

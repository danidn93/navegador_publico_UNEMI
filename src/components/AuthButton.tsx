import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LogIn, LogOut, User2 } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import LoginDialog from './LoginDialog'

export default function AuthButton(){
  const [session, setSession] = useState<any>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription?.unsubscribe?.()
  }, [])

  if (!session) return (
    <>
      <Button size="sm" onClick={()=>setOpen(true)}><LogIn className="w-4 h-4 mr-2"/> Iniciar sesión</Button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary"><User2 className="w-4 h-4 mr-2"/> Cuenta</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={async()=>{ await supabase.auth.signOut() }}>
          <LogOut className="w-4 h-4 mr-2"/> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type AppRole = 'student' | 'viewer' | 'editor' | 'admin' | 'super_admin'
export type RoomTarget = 'public' | 'student' | 'admin'

export function targetsFor(role: AppRole | null): RoomTarget[] {
  if (!role) return ['public']
  if (role === 'student' || role === 'viewer') return ['public', 'student']
  return ['public', 'student', 'admin']
}

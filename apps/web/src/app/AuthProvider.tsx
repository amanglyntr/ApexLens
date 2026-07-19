import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authService, type AppUser } from '@/services/authService'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { void authService.session().then(setUser).finally(() => setLoading(false)) }, [])
  return <AuthContext.Provider value={{
    user, loading,
    signIn: async (email, password) => setUser(await authService.signIn(email, password)),
    signUp: async (email, password, displayName) => { await authService.signUp(email, password, displayName) },
    signOut: async () => { await authService.signOut(); setUser(null) },
  }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

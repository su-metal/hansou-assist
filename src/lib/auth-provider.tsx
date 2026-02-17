'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type AuthContextType = {
    user: User | null
    session: Session | null
    loading: boolean
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>
    signOut: () => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    signIn: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        }

        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event: string, session: Session | null) => {
                setSession(session)
                setUser(session?.user ?? null)
                setLoading(false)
                if (_event === 'SIGNED_IN') {
                    router.refresh()
                }
                if (_event === 'SIGNED_OUT') {
                    router.push('/login')
                    router.refresh()
                }
            }
        )

        return () => subscription.unsubscribe()
    }, [router, supabase.auth])

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        return { error }
    }

    const signOut = async () => {
        const { error } = await supabase.auth.signOut()
        return { error }
    }

    return (
        <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

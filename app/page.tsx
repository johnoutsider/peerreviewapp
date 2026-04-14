'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { auth, isFirebaseConfigured } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'

export default function Home() {
    const router = useRouter()

    useEffect(() => {
        let active = true

        if (!isFirebaseConfigured()) {
            router.replace('/auth/signin')
            return
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!active) return

            if (!user) {
                router.replace('/auth/signin')
                return
            }

            try {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)
                if (!active) return
                if (profile?.role === 'teacher') {
                    router.replace('/teacher')
                } else {
                    router.replace('/dashboard')
                }
            } catch {
                if (!active) return
                router.replace('/dashboard')
            }
        })

        return () => {
            active = false
            unsubscribe()
        }
    }, [router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="h-8 w-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
        </div>
    )
}

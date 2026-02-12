'use client'

import { signOut } from '@/lib/auth'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useEffect, useState } from 'react'

export default function Header() {
    const router = useRouter()
    const pathname = usePathname()
    const [user] = useAuthState(auth)
    const [userProfile, setUserProfile] = useState<any>(null)

    useEffect(() => {
        const fetchProfile = async () => {
            if (user?.uid) {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)
                setUserProfile(profile)
            }
        }
        fetchProfile()
    }, [user])

    const handleSignOut = async () => {
        const { signOut } = await import('@/lib/auth')
        await signOut()
        router.push('/')
    }

    if (!user) return null

    const isTeacher = userProfile?.role === 'teacher'

    return (
        <header className="bg-slate-900/50 backdrop-blur-lg border-b border-white/10 sticky top-0 z-50">
            <div className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                    <Link href={isTeacher ? "/teacher" : "/dashboard"} className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                        IELTS Peer Review
                    </Link>

                    <nav className="hidden md:flex gap-6">
                        {isTeacher ? (
                            <Link
                                href="/teacher"
                                className={`transition-colors ${pathname === '/teacher' ? 'text-blue-400' : 'text-gray-300 hover:text-white'}`}
                            >
                                Teacher Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href="/dashboard"
                                    className={`transition-colors ${pathname === '/dashboard' ? 'text-blue-400' : 'text-gray-300 hover:text-white'}`}
                                >
                                    Dashboard
                                </Link>
                                <Link
                                    href="/submit-essay"
                                    className={`transition-colors ${pathname === '/submit-essay' ? 'text-blue-400' : 'text-gray-300 hover:text-white'}`}
                                >
                                    Submit Essay
                                </Link>
                                <Link
                                    href="/review"
                                    className={`transition-colors ${pathname === '/review' ? 'text-blue-400' : 'text-gray-300 hover:text-white'}`}
                                >
                                    Peer Review
                                </Link>
                                <Link
                                    href="/my-essays"
                                    className={`transition-colors ${pathname === '/my-essays' ? 'text-blue-400' : 'text-gray-300 hover:text-white'}`}
                                >
                                    My Essays
                                </Link>
                            </>
                        )}
                    </nav>

                    <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-300">
                            {user.displayName || user.email}
                            {isTeacher && <span className="ml-2 px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300">Teacher</span>}
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-500/30 transition-colors"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </header>
    )
}

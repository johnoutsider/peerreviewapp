'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useEffect, useState } from 'react'
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore'
import { useTheme } from 'next-themes'

export default function Header() {
    const router = useRouter()
    const pathname = usePathname()
    const [user] = useAuthState(auth)
    const [userProfile, setUserProfile] = useState<any>(null)
    const [unreadCount, setUnreadCount] = useState(0)
    const [menuOpen, setMenuOpen] = useState(false)
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

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

    // Close mobile menu on route change
    useEffect(() => { setMenuOpen(false) }, [pathname])

    // Live unread count for students
    useEffect(() => {
        if (!user?.uid || userProfile?.role === 'teacher') return
        const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'))
        const unsub = onSnapshot(q, snap => {
            const count = snap.docs.filter(d => {
                const data = d.data()
                // Only count messages the student is a recipient of
                const recipients: string[] | null = data.recipients ?? null
                if (recipients && !recipients.includes(user.uid)) return false
                // Count as unread if UID not in readBy
                return !((data.readBy as string[] || []).includes(user.uid))
            }).length
            setUnreadCount(count)
        })
        return () => unsub()
    }, [user, userProfile])

    const handleSignOut = async () => {
        const { signOut } = await import('@/lib/auth')
        await signOut()
        router.push('/')
        setMenuOpen(false)
    }

    if (!user) return null

    const isTeacher = userProfile?.role === 'teacher'

    interface NavLink { href: string; label: string; badge?: number }

    const studentLinks: NavLink[] = [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/submit-essay', label: '✍️ Submit Essay' },
        { href: '/review', label: '🤝 Peer Review' },
        { href: '/my-essays', label: '📚 My Essays' },
        { href: '/progress', label: '📈 Progress' },
        { href: '/rubric', label: '📋 Rubric' },
        { href: '/messages', label: '📬 Messages', badge: unreadCount },
        { href: '/profile', label: '👤 Profile' },
    ]

    const teacherLinks: NavLink[] = [
        { href: '/teacher', label: '📊 Dashboard' },
        { href: '/teacher/topics', label: '🏷️ Topics' },
        { href: '/teacher/messages', label: '✉️ Messages' },
    ]

    const links: NavLink[] = isTeacher ? teacherLinks : studentLinks

    return (
        <header className="bg-blue-600 backdrop-blur-lg border-b border-slate-200 dark:border-white/10 shadow-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                    {/* Logo */}
                    <Link
                        href={isTeacher ? '/teacher' : '/dashboard'}
                        className="text-xl font-bold text-white text-2xl drop-shadow-sm shrink-0"
                    >
                        Peer feedback app
                    </Link>

                    {/* Desktop nav */}
                    <nav className="hidden md:flex items-center gap-5">
                        {links.map(({ href, label, badge }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`relative text-sm transition-colors ${pathname === href ? 'text-white font-bold border-b-2 border-white' : 'text-blue-100 hover:text-white'}`}
                            >
                                {label}
                                {badge != null && badge > 0 && (
                                    <span className="absolute -top-2 -right-3 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                                        {badge > 9 ? '9+' : badge}
                                    </span>
                                )}
                            </Link>
                        ))}
                    </nav>

                    {/* Right side: teacher badge + sign out + hamburger */}
                    <div className="flex items-center gap-3">
                        {isTeacher && (
                            <span className="hidden sm:block px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-100 border border-blue-500/30">
                                Teacher
                            </span>
                        )}
                        <button
                            onClick={handleSignOut}
                            className="hidden md:block bg-red-500/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                        >
                            Sign Out
                        </button>

                        {/* Theme Toggle */}
                        {mounted && (
                            <button
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="p-2 rounded-lg hover:bg-blue-500 transition-colors text-white text-xl flex items-center justify-center w-10 h-10"
                                aria-label="Toggle Dark Mode"
                            >
                                {theme === 'dark' ? '☀️' : '🌙'}
                            </button>
                        )}

                        {/* Messages badge (mobile only) */}
                        {!isTeacher && unreadCount > 0 && (
                            <Link href="/messages" className="relative md:hidden">
                                <span className="text-xl">📬</span>
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            </Link>
                        )}

                        {/* Hamburger (mobile) */}
                        <button
                            className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-blue-500 transition-colors"
                            onClick={() => setMenuOpen(o => !o)}
                            aria-label="Toggle menu"
                        >
                            <span className={`block w-5 h-0.5 bg-white dark:bg-slate-800 transition-transform ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                            <span className={`block w-5 h-0.5 bg-white dark:bg-slate-800 transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
                            <span className={`block w-5 h-0.5 bg-white dark:bg-slate-800 transition-transform ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Mobile dropdown menu */}
                {menuOpen && (
                    <nav className="md:hidden absolute top-full left-0 w-full bg-blue-600 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 shadow-sm p-4 flex flex-col gap-2 z-50 shadow-2xl">
                        {links.map(({ href, label, badge }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${pathname === href
                                    ? 'bg-blue-500/20 text-white font-bold border-b-2 border-white'
                                    : 'text-blue-100 hover:bg-blue-500 hover:text-white'
                                    }`}
                            >
                                <span>{label}</span>
                                {badge != null && badge > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                                        {badge > 9 ? '9+' : badge}
                                    </span>
                                )}
                            </Link>
                        ))}
                        <div className="mt-2 border-t border-slate-200 dark:border-white/10 shadow-sm pt-2">
                            <button
                                onClick={handleSignOut}
                                className="w-full text-left px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                            >
                                🚪 Sign Out
                            </button>
                        </div>
                    </nav>
                )}
            </div>
        </header >
    )
}

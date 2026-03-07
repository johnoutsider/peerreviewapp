'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useEffect, useState } from 'react'

interface TeacherLayoutProps {
    children: React.ReactNode
    /** Page title shown in the top bar breadcrumb */
    title?: string
}

const navLinks = [
    {
        href: '/teacher', label: 'Dashboard', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
        )
    },
    {
        href: '/teacher/topics', label: 'Topics', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M7 7h10M7 12h10M7 17h6" strokeLinecap="round" />
                <circle cx="19" cy="17" r="3" />
            </svg>
        )
    },
    {
        href: '/teacher/messages', label: 'Messages', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
        )
    },
    {
        href: '/teacher/reviews', label: 'Reviews', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        href: '/teacher/assistant', label: 'AI Assistant', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <circle cx="12" cy="12" r="9" />
                <path d="M9 9a3 3 0 116 0c0 2-3 3-3 3" strokeLinecap="round" />
                <circle cx="12" cy="17" r="0.5" fill="currentColor" />
            </svg>
        )
    },
    {
        href: '/teacher/teacher-assistant', label: 'Teacher Assistant', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M12 3l3 6 6 .9-4.5 4.3 1.1 6.1L12 17l-5.6 3.3 1.1-6.1L3 9.9 9 9z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },    {
        href: '/teacher/eva-settings', label: 'EVA Settings', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M12 2a5 5 0 015 5v.5a5 5 0 01-10 0V7a5 5 0 015-5z" />
                <path d="M2 20a10 10 0 0120 0" strokeLinecap="round" />
            </svg>
        )
    },
    {
        href: '/teacher/logs', label: 'AI Logs', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
        )
    },
    {
        href: '/teacher/approvals', label: 'Approvals', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
]

export default function TeacherLayout({ children, title = 'Teacher Panel' }: TeacherLayoutProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [user] = useAuthState(auth)
    const [userProfile, setUserProfile] = useState<any>(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

    // Derive active link: exact match for /teacher, prefix match for sub-routes
    const isActive = (href: string) => {
        if (href === '/teacher') return pathname === '/teacher'
        return pathname.startsWith(href)
    }

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

    // Close mobile sidebar on route change
    useEffect(() => { setMobileSidebarOpen(false) }, [pathname])

    const handleSignOut = async () => {
        const { signOut } = await import('@/lib/auth')
        await signOut()
        router.push('/')
    }

    const initials = (userProfile?.displayName || userProfile?.name || 'T')
        .split(' ')
        .slice(0, 2)
        .map((w: string) => w[0])
        .join('')
        .toUpperCase()

    return (
        <div className="teacher-layout flex h-screen overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* â”€â”€ Sidebar â”€â”€ */}
            {/* Mobile overlay */}
            {mobileSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-20 md:hidden"
                    onClick={() => setMobileSidebarOpen(false)}
                />
            )}

            <aside
                className={`
                    fixed md:static inset-y-0 left-0 z-30 flex flex-col
                    transition-all duration-300 ease-in-out shadow-xl md:shadow-none flex-shrink-0
                    ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    ${sidebarCollapsed ? 'md:w-[72px]' : 'w-64'}
                `}
                style={{ backgroundColor: '#1a2535', borderRight: '1px solid rgba(255,255,255,0.07)' }}
            >
                {/* Logo area */}
                <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', minHeight: '64px' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #1a9aaa 0%, #127080 100%)' }}>
                        PF
                    </div>
                    {!sidebarCollapsed && (
                        <div className="overflow-hidden">
                            <div className="text-white font-bold text-sm leading-tight truncate">Peer Feedback</div>
                            <div className="text-xs font-medium" style={{ color: '#6b8ca8' }}>Teacher Panel</div>
                        </div>
                    )}
                    {/* Collapse button â€” desktop only */}
                    <button
                        onClick={() => setSidebarCollapsed(c => !c)}
                        className="hidden md:flex ml-auto p-1.5 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-white shrink-0"
                        aria-label="Toggle sidebar"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                            {sidebarCollapsed
                                ? <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                                : <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                            }
                        </svg>
                    </button>
                </div>

                {/* Nav links */}
                <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
                    {!sidebarCollapsed && (
                        <div className="px-4 mb-2 text-xs font-semibold uppercase tracking-widest"
                            style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Navigation
                        </div>
                    )}
                    <ul className="space-y-0.5 px-2">
                        {navLinks.map(({ href, label, icon }) => {
                            const active = isActive(href)
                            return (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        title={sidebarCollapsed ? label : undefined}
                                        className={`
                                            flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative
                                            ${active
                                                ? 'text-white font-semibold'
                                                : 'text-gray-400 hover:text-white hover:bg-white/8'
                                            }
                                        `}
                                        style={active ? {
                                            background: 'linear-gradient(90deg, rgba(26,154,170,0.25) 0%, rgba(26,154,170,0.10) 100%)',
                                            borderLeft: '3px solid #1a9aaa',
                                            paddingLeft: '9px'
                                        } : { borderLeft: '3px solid transparent' }}
                                    >
                                        <span className={`shrink-0 ${active ? 'text-[#1a9aaa]' : 'text-gray-500 group-hover:text-gray-300'}`}>
                                            {icon}
                                        </span>
                                        {!sidebarCollapsed && (
                                            <span className="text-sm truncate">{label}</span>
                                        )}
                                        {/* Tooltip for collapsed sidebar */}
                                        {sidebarCollapsed && (
                                            <span className="
                                                absolute left-full ml-2 px-2 py-1 text-xs font-medium text-white rounded-md
                                                opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50
                                            " style={{ background: '#1a9aaa' }}>
                                                {label}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </nav>

                {/* Bottom: sign-out */}
                <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                    <button
                        onClick={handleSignOut}
                        title={sidebarCollapsed ? 'Sign Out' : undefined}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 group"
                        style={{ borderLeft: '3px solid transparent' }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5 shrink-0">
                            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {!sidebarCollapsed && <span className="text-sm">Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* â”€â”€ Right Side â”€â”€ */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

                {/* â”€â”€ Top Header Bar â”€â”€ */}
                <header className="flex items-center justify-between px-5 h-16 shrink-0 shadow-md z-10"
                    style={{ backgroundColor: '#1a9aaa', minHeight: '64px' }}>
                    {/* Left: mobile menu btn + breadcrumb */}
                    <div className="flex items-center gap-4">
                        <button
                            className="md:hidden p-2 rounded-lg hover:bg-white/20 transition-colors text-white"
                            onClick={() => setMobileSidebarOpen(o => !o)}
                            aria-label="Open menu"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                            </svg>
                        </button>
                        {/* Breadcrumb */}
                        <nav className="flex items-center gap-1.5 text-sm">
                            <Link href="/teacher" className="text-white/70 hover:text-white transition-colors font-medium">
                                Home
                            </Link>
                            {title !== 'Dashboard' && (
                                <>
                                    <span className="text-white/40">/</span>
                                    <span className="text-white font-semibold">{title}</span>
                                </>
                            )}
                        </nav>
                    </div>

                    {/* Right: user info */}
                    <div className="flex items-center gap-3">
                        {userProfile && (
                            <Link href="/profile" className="hidden sm:flex flex-col items-end hover:opacity-80 transition-opacity">
                                <span className="text-white text-sm font-semibold leading-tight">
                                    {userProfile.displayName || userProfile.name || 'Teacher'}
                                </span>
                                <span className="text-white/60 text-xs">O'qituvchi</span>
                            </Link>
                        )}
                        <Link href="/profile" className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-md hover:scale-105 transition-transform"
                            style={{ background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.4)' }}>
                            {initials}
                        </Link>
                    </div>
                </header>

                {/* â”€â”€ Page Content â”€â”€ */}
                <main className="flex-1 overflow-y-auto" style={{ backgroundColor: '#f0f2f5' }}>
                    {children}
                </main>
            </div>
        </div>
    )
}










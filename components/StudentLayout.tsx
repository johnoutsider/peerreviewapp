'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { useAuthState } from 'react-firebase-hooks/auth'
import { useEffect, useState } from 'react'

interface StudentLayoutProps {
    children: React.ReactNode
    /** Page title shown in the top bar breadcrumb */
    title?: string
}

const navLinks = [
    {
        href: '/dashboard', label: 'Dashboard', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
        )
    },
    {
        href: '/submit-essay', label: 'Submit Essay', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        href: '/review', label: 'Review Peers', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        href: '/my-essays', label: 'My Essays', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        href: '/progress', label: 'Progress', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
    },
]

export default function StudentLayout({ children, title = 'Dashboard' }: StudentLayoutProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [user] = useAuthState(auth)
    const [userProfile, setUserProfile] = useState<any>(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

    // Derive active link: exact match for /dashboard, prefix match for sub-routes
    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard'
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

    const initials = (userProfile?.displayName || userProfile?.name || 'S')
        .split(' ')
        .slice(0, 2)
        .map((w: string) => w[0])
        .join('')
        .toUpperCase()

    return (
        <div className="flex h-screen overflow-hidden text-slate-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* ── Sidebar ── */}
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
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #1a9aaa 0%, #127080 100%)' }}>
                        🎓
                    </div>
                    {!sidebarCollapsed && (
                        <div className="overflow-hidden">
                            <div className="text-white font-bold text-sm leading-tight truncate">Peer Feedback</div>
                            <div className="text-xs font-medium" style={{ color: '#6b8ca8' }}>Student Portal</div>
                        </div>
                    )}
                    {/* Collapse button — desktop only */}
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
                    {/* Close button for mobile inside sidebar */}
                    <button
                        className="md:hidden ml-auto text-gray-400 hover:text-white p-1"
                        onClick={() => setMobileSidebarOpen(false)}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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

            {/* ── Right Side ── */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

                {/* ── Top Header Bar ── */}
                <header className="flex items-center justify-between px-5 h-16 shrink-0 shadow-md z-10"
                    style={{ backgroundColor: '#1a9aaa', minHeight: '64px' }}>
                    {/* Left: mobile menu btn + breadcrumb style title */}
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

                        <nav className="flex items-center gap-1.5 text-sm">
                            <a href="/dashboard" className="text-white/70 hover:text-white transition-colors font-medium">Home</a>
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
                            <div className="hidden sm:flex flex-col items-end">
                                <span className="text-white text-sm font-semibold leading-tight">
                                    {userProfile.displayName || userProfile.name || 'Student'}
                                </span>
                                <span className="text-white/60 text-xs">Student</span>
                            </div>
                        )}
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-md"
                            style={{ background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.4)' }}>
                            {initials}
                        </div>
                    </div>
                </header>

                {/* ── Page Content ── */}
                <main className="flex-1 overflow-y-auto relative" style={{ backgroundColor: '#f0f2f5' }}>
                    <div className="absolute inset-0 max-w-7xl mx-auto w-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}

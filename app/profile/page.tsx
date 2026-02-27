'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, doc, getDoc, setDoc, addDoc, serverTimestamp, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

export default function Profile() {
    const router = useRouter()
    const [displayName, setDisplayName] = useState('')
    const [groupName, setGroupName] = useState('')
    const [email, setEmail] = useState('')
    const [googleName, setGoogleName] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Telegram State
    const [telegramLinked, setTelegramLinked] = useState(false)
    const [telegramUsername, setTelegramUsername] = useState('')
    const [linkCode, setLinkCode] = useState<string | null>(null)
    const [generatingLink, setGeneratingLink] = useState(false)

    useEffect(() => {
        const load = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            setEmail(auth.currentUser.email || '')
            setGoogleName(auth.currentUser.displayName || '')
            try {
                const snap = await getDoc(doc(db, 'users', auth.currentUser.uid))
                if (snap.exists()) {
                    const data = snap.data() as any
                    setDisplayName(data.displayName || data.name || '')
                    setGroupName(data.groupName || '')
                    if (data.telegramChatId) {
                        setTelegramLinked(true)
                        setTelegramUsername(data.telegramUsername || '')
                    }
                }
            } catch (e) { console.error(e) }
            setLoading(false)
        }
        load()
    }, [router])

    // Poll /api/telegram/check-link every 3 s once user has clicked "Open Telegram App".
    // No webhook or ngrok needed — works in local dev and production alike.
    useEffect(() => {
        if (!linkCode || !auth.currentUser) return

        let active = true

        const poll = async () => {
            if (!active || !auth.currentUser) return
            try {
                const res = await fetch(`/api/telegram/check-link?code=${linkCode}`)
                const data = await res.json()

                if (data.found && active && auth.currentUser) {
                    active = false

                    // Save chatId to own profile (authenticated write)
                    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                        telegramChatId: data.chatId,
                        ...(data.username ? { telegramUsername: data.username } : {}),
                        telegramLinkedAt: serverTimestamp(),
                    })

                    // Clean up the one-time link code
                    const linksSnap = await getDocs(
                        query(collection(db, 'telegram_links'), where('code', '==', linkCode))
                    )
                    linksSnap.forEach(d => deleteDoc(d.ref))

                    setTelegramLinked(true)
                    setTelegramUsername(data.username || '')
                    setLinkCode(null)
                    setSuccess('✅ Telegram linked! You\'ll now receive review notifications.')
                    setTimeout(() => setSuccess(null), 6000)
                }
            } catch (err) {
                console.error('Telegram poll error:', err)
            }

            if (active) setTimeout(poll, 3000)
        }

        poll()
        return () => { active = false }
    }, [linkCode])

    const generateTelegramLink = async () => {
        if (!auth.currentUser) return
        setGeneratingLink(true)
        setError(null)

        try {
            // First check if user already has an active code
            const q = query(
                collection(db, 'telegram_links'),
                where('userId', '==', auth.currentUser.uid)
            )
            const snapshot = await getDocs(q)

            if (!snapshot.empty) {
                // Return existing code
                setLinkCode(snapshot.docs[0].data().code)
                setGeneratingLink(false)
                return
            }

            // Generate a random 8-character string for the code
            const code = 'link_' + Math.random().toString(36).substring(2, 10)

            // Save to Firestore
            await addDoc(collection(db, 'telegram_links'), {
                userId: auth.currentUser.uid,
                code: code,
                createdAt: serverTimestamp()
            })

            setLinkCode(code)
        } catch (err) {
            console.error('Error generating link:', err)
            setError('Failed to generate Telegram link. Please try again.')
        } finally {
            setGeneratingLink(false)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!auth.currentUser) return
        setSaving(true)
        setError(null)
        try {
            await setDoc(doc(db, 'users', auth.currentUser.uid), {
                displayName: displayName.trim() || googleName,
                groupName: groupName.trim(),
            }, { merge: true })
            setSuccess('Profile saved successfully!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (e) {
            setError('Failed to save. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8 max-w-xl">
                <div className="mb-8 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shrink-0">
                        {(displayName || googleName || '?')[0].toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Profile</h1>
                        <p className="text-slate-500 dark:text-gray-400 text-sm">{email}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-8 border border-slate-200 dark:border-white/10 shadow-sm">
                    {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                    {success && <Alert type="success" message={success} />}

                    <form onSubmit={handleSave} className="space-y-6">
                        <div>
                            <label className="block text-slate-900 dark:text-white font-semibold mb-1">
                                Display Name <span className="text-slate-500 dark:text-gray-400 font-normal text-sm">(your real name)</span>
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                placeholder={googleName || 'Enter your real name'}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                maxLength={60}
                            />
                            <p className="text-gray-500 text-xs mt-1">This is the name your teacher will see</p>
                        </div>

                        <div>
                            <label className="block text-slate-900 dark:text-white font-semibold mb-1">
                                Group Name <span className="text-slate-500 dark:text-gray-400 font-normal text-sm">(e.g. Group A, Wednesday 14:00)</span>
                            </label>
                            <input
                                type="text"
                                value={groupName}
                                onChange={e => setGroupName(e.target.value)}
                                placeholder="Enter your group or class"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                maxLength={60}
                            />
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 border border-slate-200 dark:border-white/10">
                            <p className="text-slate-500 dark:text-gray-400 text-sm">
                                <span className="text-slate-600 dark:text-gray-300 font-medium">Google Account:</span> {googleName}
                            </p>
                            <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">
                                <span className="text-slate-600 dark:text-gray-300 font-medium">Email:</span> {email}
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Saving…' : 'Save Profile'}
                        </button>
                    </form>
                </div>

                {/* Notification Settings Area */}
                <div className="mt-8 bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-8 border border-slate-200 dark:border-white/10 shadow-sm">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                        <span>🔔</span> Notifications
                    </h2>
                    <p className="text-slate-500 dark:text-gray-400 text-sm mb-6">
                        Get notified instantly when your peers complete reviewing your essays.
                    </p>

                    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-5 border border-slate-200 dark:border-white/10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center text-xl shrink-0">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-slate-900 dark:text-white font-medium">Telegram Notifications</h3>
                                    {telegramLinked ? (
                                        <p className="text-sm text-green-500 font-medium">✓ Connected {telegramUsername ? `(@${telegramUsername})` : ''}</p>
                                    ) : (
                                        <p className="text-sm text-slate-500 dark:text-gray-400">Not connected</p>
                                    )}
                                </div>
                            </div>

                            {!telegramLinked && !linkCode && (
                                <button
                                    onClick={generateTelegramLink}
                                    disabled={generatingLink}
                                    className="px-4 py-2 bg-[#0088cc] hover:bg-[#0077b3] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                                >
                                    {generatingLink ? 'Loading...' : 'Connect Telegram'}
                                </button>
                            )}
                        </div>

                        {!telegramLinked && linkCode && (
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 animate-fade-in">
                                <p className="text-sm text-slate-600 dark:text-gray-300 mb-3">
                                    Click the button below to open Telegram and start the bot to link your account.
                                </p>
                                <a
                                    href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'MyDigitalTwinBot'}?start=${linkCode}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center w-full sm:w-auto px-6 py-2.5 bg-[#0088cc] hover:bg-[#0077b3] text-white font-medium rounded-lg transition-colors gap-2"
                                >
                                    Open Telegram App
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </a>
                                <p className="text-xs text-slate-400 mt-3 text-center sm:text-left">
                                    Waiting for you to connect in the app...
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}

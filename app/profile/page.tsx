'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
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
                }
            } catch (e) { console.error(e) }
            setLoading(false)
        }
        load()
    }, [router])

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
            </main>
        </div>
    )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import {
    collection, getDocs, query, where,
    doc, getDoc, setDoc
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

const EVA_SETTINGS_DOC = doc  // re-exported below via usage

export default function EvaSettings() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [groups, setGroups] = useState<string[]>([])
    const [allowedGroups, setAllowedGroups] = useState<Set<string>>(new Set())
    const [success, setSuccess] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/'); return }
            try {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)
                if (profile?.role !== 'teacher') { router.push('/dashboard'); return }

                // 1. Fetch all unique groups from students
                const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
                const allGroups = [...new Set(
                    usersSnap.docs.map(d => (d.data().groupName as string || '')).filter(Boolean)
                )].sort()
                setGroups(allGroups)

                // 2. Fetch existing EVA settings
                const evaDoc = await getDoc(doc(db, 'settings', 'eva'))
                if (evaDoc.exists()) {
                    const data = evaDoc.data()
                    setAllowedGroups(new Set<string>(data.allowedGroups || []))
                }

            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        })
        return () => unsub()
    }, [router])

    const toggle = (group: string) => {
        setAllowedGroups(prev => {
            const next = new Set(prev)
            if (next.has(group)) next.delete(group)
            else next.add(group)
            return next
        })
    }

    const enableAll = () => setAllowedGroups(new Set(groups))
    const disableAll = () => setAllowedGroups(new Set())

    const save = async () => {
        setSaving(true)
        setError(null)
        try {
            await setDoc(doc(db, 'settings', 'eva'), {
                allowedGroups: [...allowedGroups],
                updatedAt: new Date().toISOString(),
            })
            setSuccess('EVA access settings saved!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (e: any) {
            setError('Failed to save settings.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        </div>
    )

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8 max-w-2xl">

                {/* Page header */}
                <div className="mb-8">
                    <button
                        onClick={() => router.push('/teacher')}
                        className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white text-sm flex items-center gap-1 mb-3 transition-colors"
                    >
                        ← Teacher Dashboard
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center font-extrabold text-white text-sm">
                            EVA
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">EVA Access Control</h1>
                            <p className="text-slate-500 dark:text-gray-400 text-sm mt-0.5">
                                Choose which student groups can use the AI Essay Assistant
                            </p>
                        </div>
                    </div>
                </div>

                {success && <Alert type="success" message={success} />}
                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">

                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
                        <div>
                            <span className="text-slate-900 dark:text-white font-semibold">Student Groups</span>
                            <span className="ml-2 text-slate-400 dark:text-slate-500 text-sm">
                                {allowedGroups.size} / {groups.length} groups enabled
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={enableAll}
                                className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20 font-medium transition-colors"
                            >
                                Enable All
                            </button>
                            <button
                                type="button"
                                onClick={disableAll}
                                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 font-medium transition-colors"
                            >
                                Disable All
                            </button>
                        </div>
                    </div>

                    {/* Group list */}
                    {groups.length === 0 ? (
                        <div className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                            <div className="text-4xl mb-3">👥</div>
                            <p>No student groups found. Students need to set their group in their profile first.</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-white/5">
                            {groups.map(group => {
                                const enabled = allowedGroups.has(group)
                                return (
                                    <li key={group} className="flex items-center justify-between px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                            <span className="text-slate-900 dark:text-white font-medium">{group}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${enabled
                                                ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                                                : 'bg-slate-100 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/10'
                                                }`}>
                                                {enabled ? 'EVA Enabled' : 'No Access'}
                                            </span>
                                        </div>

                                        {/* Toggle switch */}
                                        <button
                                            type="button"
                                            onClick={() => toggle(group)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                                                ${enabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                                                    ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
                                            />
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}

                    {/* Save button */}
                    <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end">
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
                        >
                            {saving ? (
                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                            ) : '💾 Save Settings'}
                        </button>
                    </div>
                </div>

                <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
                    Changes take effect immediately. Students in disabled groups will see the editor without EVA.
                </p>
            </main>
        </div>
    )
}

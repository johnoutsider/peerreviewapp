'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import {
    collection, getDocs, query, where,
    doc, getDoc, setDoc
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import TeacherLayout from '@/components/TeacherLayout'
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
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        </div>
    )

    return (
        <TeacherLayout title="EVA Settings">
            <div className="p-6 max-w-2xl mx-auto">

                {/* Page header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center font-extrabold text-white text-xs shrink-0">
                            EVA
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">EVA Access Control</h1>
                    </div>
                    <p className="text-slate-400 text-sm ml-12">Choose which student groups can use the AI Essay Assistant</p>
                </div>

                {success && <Alert type="success" message={success} />}
                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

                {/* Main card */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">

                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                        <div>
                            <span className="text-slate-700 font-semibold text-sm">Student Groups</span>
                            <span className="ml-2 text-slate-400 text-xs">
                                {allowedGroups.size} / {groups.length} enabled
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={enableAll}
                                className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 font-medium transition-colors"
                            >
                                Enable All
                            </button>
                            <button
                                type="button"
                                onClick={disableAll}
                                className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 font-medium transition-colors"
                            >
                                Disable All
                            </button>
                        </div>
                    </div>

                    {/* Group list */}
                    {groups.length === 0 ? (
                        <div className="px-6 py-12 text-center text-slate-400">
                            <div className="text-4xl mb-3">👥</div>
                            <p className="text-sm">No student groups found. Students need to set their group in their profile first.</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-50">
                            {groups.map(group => {
                                const enabled = allowedGroups.has(group)
                                return (
                                    <li key={group} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${enabled ? 'bg-green-500' : 'bg-slate-300'}`} />
                                            <span className="text-slate-800 font-semibold text-sm">{group}</span>
                                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${enabled
                                                ? 'bg-green-50 text-green-700 border border-green-100'
                                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                                                }`}>
                                                {enabled ? 'EVA Enabled' : 'No Access'}
                                            </span>
                                        </div>

                                        {/* Toggle switch */}
                                        <button
                                            type="button"
                                            onClick={() => toggle(group)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-teal-500' : 'bg-slate-200'
                                                }`}
                                        >
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}

                    {/* Save button */}
                    <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            className="bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm"
                        >
                            {saving ? (
                                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                            ) : '💾 Save Settings'}
                        </button>
                    </div>
                </div>

                <p className="text-xs text-slate-400 text-center mt-4">
                    Changes take effect immediately. Students in disabled groups will see the editor without EVA.
                </p>
            </div>
        </TeacherLayout>
    )
}

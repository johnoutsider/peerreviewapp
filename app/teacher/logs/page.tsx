'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'

interface AILog {
    id: string
    studentId: string
    studentName: string
    essayTitle: string
    topicName: string
    verdict: string
    detectedAt: any
    excerpt: string
    fullText?: string
}

export default function AIDetectionLogs() {
    const router = useRouter()
    const [logs, setLogs] = useState<AILog[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/'); return }
            const { getUserProfile } = await import('@/lib/auth')
            const profile = await getUserProfile(user.uid)
            if (profile?.role !== 'teacher') { router.push('/dashboard'); return }

            try {
                const snap = await getDocs(
                    query(collection(db, 'ai_detection_logs'), orderBy('detectedAt', 'desc'), limit(20))
                )
                setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AILog)))
            } catch (e) {
                console.error('Failed to load AI detection logs:', e)
            } finally {
                setLoading(false)
            }
        })
        return () => unsub()
    }, [router])

    const filtered = logs.filter(l =>
        l.studentName?.toLowerCase().includes(search.toLowerCase()) ||
        l.essayTitle?.toLowerCase().includes(search.toLowerCase()) ||
        l.topicName?.toLowerCase().includes(search.toLowerCase())
    )

    const fmt = (ts: any) => {
        if (!ts) return '—'
        const d = ts.toDate ? ts.toDate() : new Date(ts)
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
            ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <TeacherLayout title="AI Detection Logs">
            <div className="p-6 max-w-5xl mx-auto">

                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 mb-0.5">AI Detection Logs</h1>
                    <p className="text-slate-400 text-sm">Students flagged for suspected AI-generated content</p>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm" style={{ borderLeft: '4px solid #ef4444' }}>
                        <div className="text-slate-400 text-xs mb-1">Total Flags</div>
                        <div className="text-2xl font-bold text-red-500">{logs.length}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm" style={{ borderLeft: '4px solid #f59e0b' }}>
                        <div className="text-slate-400 text-xs mb-1">Unique Students</div>
                        <div className="text-2xl font-bold text-amber-500">
                            {new Set(logs.map(l => l.studentId)).size}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm col-span-2 sm:col-span-1" style={{ borderLeft: '4px solid #8b5cf6' }}>
                        <div className="text-slate-400 text-xs mb-1">Topics Affected</div>
                        <div className="text-2xl font-bold text-violet-500">
                            {new Set(logs.map(l => l.topicName)).size}
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-4">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by student name, essay title, or topic..."
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-teal-400 transition-colors"
                    />
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-xl p-12 border border-slate-100 shadow-sm text-center">
                        <div className="text-5xl mb-4">{logs.length === 0 ? '✅' : '🔍'}</div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">
                            {logs.length === 0 ? 'No AI Flags Yet' : 'No Results'}
                        </h3>
                        <p className="text-slate-400 text-sm">
                            {logs.length === 0
                                ? 'No students have been flagged for AI-generated content. Flags appear here when the AI detector blocks a submission.'
                                : 'No records match your search.'}
                        </p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">#</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Essay Title</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Topic</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Flagged At</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map((log, i) => (
                                    <>
                                        <tr
                                            key={log.id}
                                            className="hover:bg-slate-50 transition-colors"
                                        >
                                            <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{i + 1}</td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs font-bold shrink-0">
                                                        {(log.studentName || '?')[0].toUpperCase()}
                                                    </div>
                                                    <span className="font-semibold text-slate-800">{log.studentName}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-slate-600 hidden sm:table-cell max-w-[180px] truncate" title={log.essayTitle}>
                                                {log.essayTitle || '—'}
                                            </td>
                                            <td className="px-5 py-3.5 hidden md:table-cell">
                                                <span className="bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full text-xs">
                                                    {log.topicName || '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                                                {fmt(log.detectedAt)}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <button
                                                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                                                    className="text-teal-600 hover:text-teal-800 text-xs font-medium"
                                                >
                                                    {expanded === log.id ? 'Hide' : 'View content'}
                                                </button>
                                            </td>
                                        </tr>
                                        {expanded === log.id && (
                                            <tr key={`${log.id}-expanded`} className="bg-red-50">
                                                <td colSpan={6} className="px-5 py-4">
                                                    <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2">⚠️ Flagged Content</p>
                                                    <div className="text-sm text-slate-700 leading-relaxed bg-white rounded-xl shadow-sm p-4 border border-red-100 whitespace-pre-wrap font-serif overflow-y-auto max-h-[400px]">
                                                        {log.fullText || (log.excerpt ? `"${log.excerpt}..."\n\n(Full text was not saved for this older entry)` : 'No text saved.')}
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-3">
                                                        Student ID: <span className="font-mono">{log.studentId}</span>
                                                    </p>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))}
                            </tbody>
                        </table>
                        <div className="px-5 py-3 border-t border-slate-50 text-xs text-slate-400">
                            Showing {filtered.length} of {logs.length} flag{logs.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                )}
            </div>
        </TeacherLayout>
    )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'

interface EssayRow {
    id: string
    studentId: string
    studentName: string
    groupName: string
    essayTitle: string
    topicName: string
    topicId: string
    submittedAt: any
    status: string
    fullText: string
    verdict: 'ai' | 'uncertain' | 'human'
    confidence?: number
    reasoning?: string
    detectedAt?: any
    excerpt?: string
}

const PAGE_SIZE = 20

const VERDICT_META = {
    ai:        { label: 'AI Flagged', bg: 'bg-red-100',   text: 'text-red-700',   dot: 'bg-red-500'   },
    uncertain: { label: 'Uncertain',  bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
    human:     { label: 'Human',      bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
}

export default function AIDetectionLogs() {
    const router = useRouter()
    const [rows, setRows] = useState<EssayRow[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [verdictFilter, setVerdictFilter] = useState<'all' | 'ai' | 'uncertain' | 'human'>('all')
    const [groupFilter, setGroupFilter] = useState('all')
    const [topicFilter, setTopicFilter] = useState('all')
    const [page, setPage] = useState(1)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/'); return }
            const { getUserProfile } = await import('@/lib/auth')
            const profile = await getUserProfile(user.uid)
            if (profile?.role !== 'teacher') { router.push('/dashboard'); return }

            try {
                const [essaysSnap, logsSnap, usersSnap] = await Promise.all([
                    getDocs(query(collection(db, 'essays'), orderBy('submittedAt', 'desc'))),
                    getDocs(collection(db, 'ai_detection_logs')),
                    getDocs(collection(db, 'users')),
                ])

                const groupMap: Record<string, string> = {}
                usersSnap.docs.forEach(d => {
                    const data = d.data() as any
                    groupMap[d.id] = data.groupName || 'Unassigned'
                })

                const logMap: Record<string, any> = {}
                logsSnap.docs.forEach(d => {
                    const data = d.data() as any
                    const key = `${data.studentId}__${data.essayTitle}`
                    if (!logMap[key] || (data.detectedAt?.toMillis?.() || 0) > (logMap[key].detectedAt?.toMillis?.() || 0)) {
                        logMap[key] = { id: d.id, ...data }
                    }
                })

                // Track which log keys were matched to an essay doc
                const matchedLogKeys = new Set<string>()

                const merged: EssayRow[] = essaysSnap.docs.map(d => {
                    const e = d.data() as any
                    const key = `${e.studentId}__${e.title}`
                    const log = logMap[key]
                    if (log) matchedLogKeys.add(key)
                    return {
                        id: d.id,
                        studentId: e.studentId || '',
                        studentName: e.studentName || 'Unknown',
                        groupName: groupMap[e.studentId] || 'Unassigned',
                        essayTitle: e.title || 'Untitled',
                        topicName: e.topicName || '—',
                        topicId: e.topicId || '',
                        submittedAt: e.submittedAt,
                        status: e.status || '',
                        fullText: e.content || '',
                        verdict: log ? (log.verdict as 'ai' | 'uncertain') : 'human',
                        confidence: log?.confidence,
                        reasoning: log?.reasoning,
                        detectedAt: log?.detectedAt,
                        excerpt: log?.excerpt,
                    }
                })

                // Add blocked essays that exist only in ai_detection_logs
                // (these were flagged and blocked before submission — no essay doc was created)
                Object.entries(logMap).forEach(([key, log]) => {
                    if (matchedLogKeys.has(key)) return // already matched above
                    merged.push({
                        id: `log__${log.id}`,
                        studentId: log.studentId || '',
                        studentName: log.studentName || 'Unknown',
                        groupName: groupMap[log.studentId] || 'Unassigned',
                        essayTitle: log.essayTitle || 'Untitled',
                        topicName: log.topicName || '—',
                        topicId: '',
                        submittedAt: log.detectedAt, // use detection time as proxy
                        status: 'blocked',
                        fullText: log.fullText || '',
                        verdict: log.verdict as 'ai' | 'uncertain',
                        confidence: log.confidence,
                        reasoning: log.reasoning,
                        detectedAt: log.detectedAt,
                        excerpt: log.excerpt,
                    })
                })

                // Sort all rows by submittedAt descending
                merged.sort((a, b) => {
                    const tA = a.submittedAt?.toMillis?.() || new Date(a.submittedAt || 0).getTime()
                    const tB = b.submittedAt?.toMillis?.() || new Date(b.submittedAt || 0).getTime()
                    return tB - tA
                })

                setRows(merged)
            } catch (e) {
                console.error('Failed to load logs:', e)
            } finally {
                setLoading(false)
            }
        })
        return () => unsub()
    }, [router])

    const groups = useMemo(() => Array.from(new Set(rows.map(r => r.groupName).filter(Boolean))).sort(), [rows])
    const topics = useMemo(() => Array.from(new Set(rows.map(r => r.topicName).filter(t => t && t !== '—'))).sort(), [rows])

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return rows.filter(r => {
            if (verdictFilter !== 'all' && r.verdict !== verdictFilter) return false
            if (groupFilter !== 'all' && r.groupName !== groupFilter) return false
            if (topicFilter !== 'all' && r.topicName !== topicFilter) return false
            if (q && !(r.studentName.toLowerCase().includes(q) || r.essayTitle.toLowerCase().includes(q) || r.topicName.toLowerCase().includes(q) || r.groupName.toLowerCase().includes(q))) return false
            return true
        })
    }, [rows, search, verdictFilter, groupFilter, topicFilter])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    useEffect(() => { setPage(1) }, [search, verdictFilter, groupFilter, topicFilter])

    const stats = useMemo(() => ({
        total: rows.length,
        flagged: rows.filter(r => r.verdict === 'ai').length,
        uncertain: rows.filter(r => r.verdict === 'uncertain').length,
        human: rows.filter(r => r.verdict === 'human').length,
        uniqueStudentsFlagged: new Set(rows.filter(r => r.verdict === 'ai').map(r => r.studentId)).size,
    }), [rows])

    const fmt = (ts: any) => {
        if (!ts) return '—'
        const d = ts.toDate ? ts.toDate() : new Date(ts)
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
            ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const hasActiveFilters = search || verdictFilter !== 'all' || groupFilter !== 'all' || topicFilter !== 'all'
    const clearFilters = () => { setSearch(''); setVerdictFilter('all'); setGroupFilter('all'); setTopicFilter('all') }

    return (
        <TeacherLayout title="Essay Submission Logs">
            <div className="p-6 max-w-6xl mx-auto">

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 mb-0.5">Essay Submission Logs</h1>
                    <p className="text-slate-400 text-sm">All submitted essays — AI flagged, uncertain, and human-written</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                    {[
                        { label: 'Total Essays',      value: stats.total,               color: '#64748b', textClass: 'text-slate-700'  },
                        { label: 'Human',             value: stats.human,               color: '#22c55e', textClass: 'text-green-500'  },
                        { label: 'Uncertain',         value: stats.uncertain,           color: '#f59e0b', textClass: 'text-amber-500'  },
                        { label: 'AI Flagged',        value: stats.flagged,             color: '#ef4444', textClass: 'text-red-500'    },
                        { label: 'Students Flagged',  value: stats.uniqueStudentsFlagged, color: '#8b5cf6', textClass: 'text-violet-500', span: true },
                    ].map(s => (
                        <div key={s.label} className={`bg-white rounded-xl p-4 border border-slate-100 shadow-sm ${s.span ? 'col-span-2 sm:col-span-1' : ''}`} style={{ borderLeft: `4px solid ${s.color}` }}>
                            <div className="text-slate-400 text-xs mb-1">{s.label}</div>
                            <div className={`text-2xl font-bold ${s.textClass}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm space-y-3">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by student name, essay title, topic or group…"
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-teal-400 transition-colors"
                    />
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Verdict:</span>
                            {(['all', 'human', 'uncertain', 'ai'] as const).map(v => (
                                <button key={v} onClick={() => setVerdictFilter(v)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize ${
                                        verdictFilter === v
                                            ? v === 'ai' ? 'bg-red-500 text-white border-red-500'
                                            : v === 'uncertain' ? 'bg-amber-500 text-white border-amber-500'
                                            : v === 'human' ? 'bg-green-500 text-white border-green-500'
                                            : 'bg-teal-500 text-white border-teal-500'
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                                    }`}>
                                    {v === 'all' ? 'All' : VERDICT_META[v].label}
                                </button>
                            ))}
                        </div>
                        {groups.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Group:</span>
                                <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-teal-400">
                                    <option value="all">All Groups</option>
                                    {groups.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        )}
                        {topics.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Topic:</span>
                                <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-teal-400">
                                    <option value="all">All Topics</option>
                                    {topics.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        )}
                        {hasActiveFilters && (
                            <button onClick={clearFilters} className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors font-medium">
                                ✕ Clear filters
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-xl p-12 border border-slate-100 shadow-sm text-center">
                        <div className="text-5xl mb-4">{rows.length === 0 ? '📭' : '🔍'}</div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">{rows.length === 0 ? 'No Essays Yet' : 'No Results'}</h3>
                        <p className="text-slate-400 text-sm">{rows.length === 0 ? 'No essays have been submitted yet.' : 'No essays match your current filters.'}</p>
                        {hasActiveFilters && <button onClick={clearFilters} className="mt-4 text-teal-500 text-sm font-semibold hover:underline">Clear filters</button>}
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
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Group</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Verdict</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Submitted</th>
                                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {paginated.map((row, i) => {
                                    const vm = VERDICT_META[row.verdict]
                                    const globalIndex = (page - 1) * PAGE_SIZE + i + 1
                                    return (
                                        <>
                                            <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${row.verdict === 'ai' ? 'bg-red-50/40' : row.verdict === 'uncertain' ? 'bg-amber-50/30' : ''}`}>
                                                <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{globalIndex}</td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${row.verdict === 'ai' ? 'bg-red-100 text-red-500' : row.verdict === 'uncertain' ? 'bg-amber-100 text-amber-600' : 'bg-teal-100 text-teal-600'}`}>
                                                            {(row.studentName || '?')[0].toUpperCase()}
                                                        </div>
                                                        <span className="font-semibold text-slate-800 whitespace-nowrap">{row.studentName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-slate-600 hidden sm:table-cell max-w-[180px] truncate" title={row.essayTitle}>{row.essayTitle || '—'}</td>
                                                <td className="px-5 py-3.5 hidden md:table-cell">
                                                    <span className="bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full text-xs">{row.topicName || '—'}</span>
                                                </td>
                                                <td className="px-5 py-3.5 hidden lg:table-cell text-slate-500 text-xs">{row.groupName}</td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${vm.bg} ${vm.text}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${vm.dot}`} />
                                                            {vm.label}
                                                        </span>
                                                        {row.confidence !== undefined && <span className="text-xs text-slate-400">{row.confidence}%</span>}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">{fmt(row.submittedAt)}</td>
                                                <td className="px-5 py-3.5">
                                                    <button onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="text-teal-600 hover:text-teal-800 text-xs font-medium">
                                                        {expanded === row.id ? 'Hide' : 'View'}
                                                    </button>
                                                </td>
                                            </tr>
                                            {expanded === row.id && (
                                                <tr key={`${row.id}-exp`} className={row.verdict === 'ai' ? 'bg-red-50' : row.verdict === 'uncertain' ? 'bg-amber-50' : 'bg-slate-50'}>
                                                    <td colSpan={8} className="px-5 py-4">
                                                        {row.verdict !== 'human' && (
                                                            <div className="mb-3 flex flex-wrap gap-3 items-start">
                                                                <div>
                                                                    <p className={`text-xs font-bold uppercase tracking-widest mb-0.5 ${row.verdict === 'ai' ? 'text-red-400' : 'text-amber-500'}`}>
                                                                        {row.verdict === 'ai' ? '⚠️ AI Content Detected' : '🔍 Uncertain — Mixed Signals'}
                                                                    </p>
                                                                    {row.reasoning && <p className="text-xs text-slate-500 italic">&ldquo;{row.reasoning}&rdquo;</p>}
                                                                </div>
                                                                {row.confidence !== undefined && (
                                                                    <div className="ml-auto flex items-center gap-2 shrink-0">
                                                                        <span className="text-xs text-slate-400">AI likelihood</span>
                                                                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                                            <div className={`h-full rounded-full ${row.confidence >= 70 ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${row.confidence}%` }} />
                                                                        </div>
                                                                        <span className="text-xs font-semibold text-slate-600">{row.confidence}%</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                                            {row.verdict === 'human' ? '📄 Essay Content' : '📄 Submitted Content'}
                                                        </p>
                                                        <div className={`text-sm text-slate-700 leading-relaxed bg-white rounded-xl shadow-sm p-4 border whitespace-pre-wrap font-serif overflow-y-auto max-h-[400px] ${row.verdict === 'ai' ? 'border-red-100' : row.verdict === 'uncertain' ? 'border-amber-100' : 'border-slate-100'}`}>
                                                            {row.fullText || (row.excerpt ? `"${row.excerpt}…"\n\n(Full text not available)` : 'No text saved.')}
                                                        </div>
                                                        <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
                                                            <span>Student ID: <span className="font-mono">{row.studentId}</span></span>
                                                            <span>Group: <span className="font-medium text-slate-600">{row.groupName}</span></span>
                                                            {row.detectedAt && <span>Flagged: <span className="font-medium text-slate-600">{fmt(row.detectedAt)}</span></span>}
                                                            {row.status === 'blocked' && (
                                                                <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                                                                    🚫 Submission was blocked — essay never saved
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    )
                                })}
                            </tbody>
                        </table>

                        {/* Footer + pagination */}
                        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <span className="text-xs text-slate-400">
                                Showing {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} essay{filtered.length !== 1 ? 's' : ''}
                                {hasActiveFilters && ` (filtered from ${rows.length} total)`}
                            </span>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">«</button>
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                        .reduce<(number | string)[]>((acc, p, idx, arr) => {
                                            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push(`e${idx}`)
                                            acc.push(p); return acc
                                        }, [])
                                        .map(p => typeof p === 'string' ? (
                                            <span key={p} className="px-2 text-xs text-slate-300">…</span>
                                        ) : (
                                            <button key={p} onClick={() => setPage(p)}
                                                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${page === p ? 'bg-teal-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                                                {p}
                                            </button>
                                        ))
                                    }
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                                    <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">»</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </TeacherLayout>
    )
}

'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import Header from '@/components/Header'
import { isNewRubric, getScore100 } from '@/lib/score-calculator'

interface ReviewRow {
    reviewId: string
    reviewerName: string
    reviewerId: string
    reviewerGroup: string
    essayId: string
    essayTitle: string
    essayAuthorName: string
    essayAuthorId: string
    essayAuthorGroup: string
    essaySubmittedAt: any
    topicName: string
    overallBand: number | null
    submittedAt: any
    reviewerRole: string
    // reviewer's written comment
    feedback: string
    // student's reaction to the review
    studentRating: number | null
    studentResponse: string
    // score format
    isNewRubric: boolean
    score100: number | null
}

const STAR_LABELS = ['', 'Not Helpful', 'Slightly Helpful', 'Helpful', 'Very Helpful', 'Extremely Helpful']

export default function TeacherReviewActivity() {
    const router = useRouter()
    const [rows, setRows] = useState<ReviewRow[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [groupFilter, setGroupFilter] = useState('')
    const [sortBy, setSortBy] = useState<string>('date')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [expandedId, setExpandedId] = useState<string | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            try {
                const { getUserProfile } = await import('@/lib/auth')
                const myProfile = await getUserProfile(auth.currentUser.uid)
                if (myProfile?.role !== 'teacher') { router.push('/dashboard'); return }

                const [usersSnap, essaysSnap, reviewsSnap] = await Promise.all([
                    getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
                    getDocs(collection(db, 'essays')),
                    getDocs(collection(db, 'reviews')),
                ])

                const usersMap = new Map(usersSnap.docs.map(d => [d.id, d.data() as any]))
                const essaysMap = new Map(essaysSnap.docs.map(d => [d.id, { id: d.id, ...d.data() as any }]))

                // Deduplicate reviews by (reviewerId + essayId)
                const uniqueReviewsMap = new Map()
                reviewsSnap.docs.forEach(d => {
                    const r = d.data() as any
                    if (r.reviewerRole === 'ai') return

                    const dedupeKey = `${r.reviewerId}_${r.essayId}`
                    const reviewDate = r.completedAt || r.submittedAt
                    const existingDate = uniqueReviewsMap.get(dedupeKey)?.data?.completedAt || uniqueReviewsMap.get(dedupeKey)?.data?.submittedAt
                    if (!uniqueReviewsMap.has(dedupeKey) ||
                        reviewDate?.toMillis() > existingDate?.toMillis()) {
                        uniqueReviewsMap.set(dedupeKey, { id: d.id, data: r })
                    }
                })

                const built: ReviewRow[] = Array.from(uniqueReviewsMap.values())
                    .map(({ id, data: r }) => {
                        const essay = essaysMap.get(r.essayId) as any
                        const reviewer = usersMap.get(r.reviewerId) as any
                        const author = essay ? usersMap.get(essay.studentId) as any : null
                        const reviewDate = r.completedAt || r.submittedAt

                        let band = r.overallBand ?? null
                        if (band === null && r.scores && typeof r.scores === 'object') {
                            const vals = Object.values(r.scores as Record<string, number>).filter(v => typeof v === 'number')
                            if (vals.length > 0) {
                                const avg = vals.reduce((a, b) => a + b, 0) / vals.length
                                band = Math.round(avg * 2) / 2
                            }
                        }

                        return {
                            reviewId: id,
                            reviewerName: reviewer ? (reviewer.displayName || reviewer.name || 'Unknown') : (r.reviewerName || 'Unknown'),
                            reviewerId: r.reviewerId,
                            reviewerGroup: reviewer?.groupName || '',
                            essayId: r.essayId,
                            essayTitle: essay?.title || r.essayTitle || 'Untitled',
                            essayAuthorName: author ? (author.displayName || author.name || 'Unknown') : 'Unknown',
                            essayAuthorId: essay?.studentId || '',
                            essayAuthorGroup: author?.groupName || '',
                            essaySubmittedAt: essay?.submittedAt ?? null,
                            topicName: essay?.topicName || '',
                            overallBand: band,
                            submittedAt: reviewDate,
                            reviewerRole: r.reviewerRole || 'student',
                            feedback: r.feedback || '',
                            studentRating: r.studentRating ?? null,
                            studentResponse: r.studentResponse ?? '',
                            isNewRubric: isNewRubric(r.scores ?? {}),
                            score100: isNewRubric(r.scores ?? {}) ? getScore100(r.scores ?? {}) : null,
                        } as ReviewRow
                    })
                    .filter(Boolean) as ReviewRow[]

                setRows(built)
            } catch (err) {
                console.error('Error loading review activity:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [router])

    const groups = useMemo(() => [...new Set(rows.map(r => r.reviewerGroup).filter(Boolean))].sort(), [rows])

    const toggleSort = (col: string) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortBy(col); setSortDir('desc') }
    }
    const sortArrow = (col: string) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return rows
            .filter(r => {
                const matchesSearch = !q ||
                    r.reviewerName.toLowerCase().includes(q) ||
                    r.essayAuthorName.toLowerCase().includes(q) ||
                    r.essayTitle.toLowerCase().includes(q) ||
                    r.topicName.toLowerCase().includes(q)
                const matchesGroup = !groupFilter || r.reviewerGroup === groupFilter || r.essayAuthorGroup === groupFilter
                return matchesSearch && matchesGroup
            })
            .sort((a, b) => {
                const dir = sortDir === 'asc' ? 1 : -1
                if (sortBy === 'reviewer') return dir * a.reviewerName.localeCompare(b.reviewerName)
                if (sortBy === 'author') return dir * a.essayAuthorName.localeCompare(b.essayAuthorName)
                if (sortBy === 'essay') return dir * a.essayTitle.localeCompare(b.essayTitle)
                if (sortBy === 'topic') return dir * (a.topicName || '').localeCompare(b.topicName || '')
                if (sortBy === 'band') return dir * ((a.overallBand ?? -1) - (b.overallBand ?? -1))
                return dir * ((a.submittedAt?.toMillis() || 0) - (b.submittedAt?.toMillis() || 0))
            })
    }, [rows, search, groupFilter, sortBy, sortDir])

    const sameGroup = filtered.filter(r => r.reviewerGroup && r.reviewerGroup === r.essayAuthorGroup).length
    const crossGroup = filtered.filter(r => r.reviewerGroup !== r.essayAuthorGroup).length

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <button onClick={() => router.push('/teacher')} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white text-sm flex items-center gap-1 mb-3 transition-colors">
                            ← Teacher Dashboard
                        </button>
                        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-1">👥 Review Activity</h1>
                        <p className="text-slate-500 dark:text-gray-400">See exactly who is reviewing whose work — and how students responded</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Total Reviews', value: filtered.length, color: 'blue' },
                        { label: 'Unique Reviewers', value: new Set(filtered.map(r => r.reviewerId)).size, color: 'purple' },
                        { label: 'Same-Group Reviews', value: sameGroup, color: 'green' },
                        { label: 'Cross-Group Reviews', value: crossGroup, color: 'yellow' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className={`bg-${color}-500/10 border border-${color}-500/30 rounded-xl p-4 text-center`}>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
                            <div className={`text-${color}-300 text-sm mt-1`}>{label}</div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <input
                        type="text"
                        placeholder="🔍 Search reviews…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full sm:flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    {groups.length > 0 && (
                        <select
                            value={groupFilter}
                            onChange={e => setGroupFilter(e.target.value)}
                            className="flex-1 sm:flex-none bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option value="">All Groups</option>
                            {groups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    )}
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-slate-900/60">
                                <tr>
                                    {[['reviewer', 'Reviewer'], ['', '→'], ['author', 'Essay Author'], ['essay', 'Essay'], ['topic', 'Topic'], ['band', 'Score'], ['date', 'Date']].map(([col, label]) => (
                                        <th
                                            key={col || 'arrow'}
                                            onClick={col ? () => toggleSort(col) : undefined}
                                            className={`py-4 px-5 text-slate-600 dark:text-gray-300 font-semibold text-sm whitespace-nowrap select-none
                                                ${col ? 'cursor-pointer hover:text-blue-400 transition-colors' : 'text-slate-500 dark:text-gray-400 font-normal text-xs px-3'}`}
                                        >
                                            {label}{col ? <span className="text-slate-400 text-xs ml-0.5">{sortArrow(col)}</span> : null}
                                        </th>
                                    ))}
                                    <th className="py-4 px-5 text-slate-600 dark:text-gray-300 font-semibold text-sm">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-gray-500">
                                            {search || groupFilter ? 'No reviews match your filters.' : 'No peer reviews submitted yet.'}
                                        </td>
                                    </tr>
                                ) : filtered.map(row => {
                                    const sameGrp = row.reviewerGroup && row.reviewerGroup === row.essayAuthorGroup
                                    const isExpanded = expandedId === row.reviewId
                                    const hasStudentResponse = row.studentRating || row.studentResponse?.trim()
                                    return (
                                        <>
                                            <tr
                                                key={row.reviewId}
                                                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${isExpanded ? 'bg-slate-50 dark:bg-slate-900/30' : ''}`}
                                                onClick={() => setExpandedId(isExpanded ? null : row.reviewId)}
                                            >
                                                {/* Reviewer */}
                                                <td className="py-3.5 px-5">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); router.push(`/teacher/${row.reviewerId}`) }}
                                                        className="text-blue-600 dark:text-blue-300 hover:text-blue-700 dark:hover:text-blue-200 font-medium text-sm text-left transition-colors"
                                                    >
                                                        {row.reviewerName}
                                                    </button>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        {row.reviewerGroup && (
                                                            <span className="text-xs text-purple-600 dark:text-purple-400">{row.reviewerGroup}</span>
                                                        )}
                                                        {row.submittedAt && (
                                                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                                                {row.submittedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                {/* Arrow */}
                                                <td className="px-3 text-slate-400 text-lg">→</td>
                                                {/* Author */}
                                                <td className="py-3.5 px-5">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); router.push(`/teacher/${row.essayAuthorId}`) }}
                                                        className="text-green-600 dark:text-green-300 hover:text-green-700 dark:hover:text-green-200 font-medium text-sm text-left transition-colors"
                                                    >
                                                        {row.essayAuthorName}
                                                    </button>
                                                    {row.essayAuthorGroup && (
                                                        <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">{row.essayAuthorGroup}</div>
                                                    )}
                                                </td>
                                                {/* Essay */}
                                                <td className="py-3.5 px-5">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); router.push(`/feedback/${row.essayId}`) }}
                                                        className="text-slate-700 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white text-sm text-left line-clamp-1 transition-colors max-w-[180px]"
                                                    >
                                                        {row.essayTitle}
                                                    </button>
                                                    {row.essaySubmittedAt && (
                                                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                                            Submitted {row.essaySubmittedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </div>
                                                    )}
                                                </td>
                                                {/* Topic */}
                                                <td className="py-3.5 px-5">
                                                    {row.topicName ? (
                                                        <span className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs">
                                                            {row.topicName}
                                                        </span>
                                                    ) : <span className="text-slate-400 text-sm">—</span>}
                                                </td>
                                                {/* Score: /100 for new rubric, band for old */}
                                                <td className="py-3.5 px-5 text-center">
                                                    {row.isNewRubric ? (
                                                        row.score100 != null ? (
                                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-sm font-bold ${row.score100 >= 80 ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                                                                    : row.score100 >= 65 ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                                                                        : row.score100 >= 50 ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                                                            : 'bg-red-500/20 text-red-700 dark:text-red-400'
                                                                }`}>
                                                                {row.score100}/100
                                                            </span>
                                                        ) : <span className="text-slate-400 text-sm">—</span>
                                                    ) : (
                                                        row.overallBand != null ? (
                                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-sm font-bold ${row.overallBand >= 7 ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                                                                    : row.overallBand >= 5.5 ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                                                                        : 'bg-red-500/20 text-red-700 dark:text-red-400'
                                                                }`}>
                                                                Band {row.overallBand}
                                                            </span>
                                                        ) : <span className="text-slate-400 text-sm">—</span>
                                                    )}
                                                </td>
                                                {/* Date */}
                                                <td className="py-3.5 px-5 whitespace-nowrap">
                                                    {row.submittedAt ? (
                                                        <>
                                                            <div className="text-slate-700 dark:text-gray-200 text-sm">
                                                                {row.submittedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                            </div>
                                                            <div className="text-slate-400 dark:text-slate-500 text-xs mt-0.5">
                                                                {row.submittedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </>
                                                    ) : <span className="text-slate-400">—</span>}
                                                </td>
                                                {/* Actions */}
                                                <td className="py-3.5 px-5">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={e => { e.stopPropagation(); router.push(`/feedback/${row.essayId}`) }}
                                                            className="text-xs bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 px-2.5 py-1 rounded-full hover:bg-purple-500/20 transition-colors"
                                                        >
                                                            View Essay →
                                                        </button>
                                                        <span className={`text-slate-400 text-sm transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                                                        {hasStudentResponse && !isExpanded && (
                                                            <span title="Student responded" className="text-amber-500 text-xs">✍️</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expandable detail row */}
                                            {isExpanded && (
                                                <tr key={`${row.reviewId}-detail`} className="bg-slate-50 dark:bg-slate-900/20">
                                                    <td colSpan={8} className="px-6 py-4 border-t border-slate-100 dark:border-white/10">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">

                                                            {/* Reviewer's comment */}
                                                            <div>
                                                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                                                    💬 Reviewer's Feedback
                                                                </p>
                                                                {row.feedback ? (
                                                                    <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 border-l-4 border-l-blue-500">
                                                                        {row.feedback}
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">No written comment.</p>
                                                                )}
                                                            </div>

                                                            {/* Student's reaction */}
                                                            <div>
                                                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                                                    🎓 {row.essayAuthorName.split(' ')[0]}'s Reaction
                                                                </p>

                                                                {/* Star rating */}
                                                                <div className="mb-2 flex items-center gap-2">
                                                                    <div className="flex gap-0.5">
                                                                        {[1, 2, 3, 4, 5].map(star => (
                                                                            <span key={star} className={`text-lg ${row.studentRating && star <= row.studentRating ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}>★</span>
                                                                        ))}
                                                                    </div>
                                                                    {row.studentRating ? (
                                                                        <span className="text-xs text-slate-600 dark:text-gray-300 font-medium">
                                                                            {STAR_LABELS[row.studentRating]}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">Not yet rated</span>
                                                                    )}
                                                                </div>

                                                                {/* Written response */}
                                                                {row.studentResponse?.trim() ? (
                                                                    <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 border-l-4 border-l-green-500">
                                                                        {row.studentResponse}
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">No written response yet.</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length > 0 && (
                        <div className="px-5 py-3 border-t border-slate-200 dark:border-white/10 text-xs text-slate-400 dark:text-gray-500">
                            Showing {filtered.length} of {rows.length} reviews · Click any row to see feedback details
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

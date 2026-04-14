'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'

interface TeacherDiscussionRow {
    essayId: string
    essayTitle: string
    authorName: string
    authorId: string
    authorGroup: string
    topicName: string
    reviewCount: number
    latestReviewAt: any
    sortTime: number
    isRecent: boolean
}

const ITEMS_PER_PAGE = 25
const RECENT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

function formatDate(value: any): string {
    if (!value?.toDate) return 'No reviews yet'
    return value.toDate().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

export default function TeacherDiscussionsPage() {
    const router = useRouter()
    const [rows, setRows] = useState<TeacherDiscussionRow[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [groupFilter, setGroupFilter] = useState('')
    const [topicFilter, setTopicFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'recent' | 'older'>('all')
    const [sortBy, setSortBy] = useState<string>('latestReview')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [currentPage, setCurrentPage] = useState(1)

    useEffect(() => {
        setCurrentPage(1)
    }, [search, groupFilter, topicFilter, statusFilter, sortBy, sortDir])

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

                // Group reviews by essayId, excluding teacher and AI reviews
                const reviewsByEssay = new Map<string, any[]>()
                reviewsSnap.docs.forEach(d => {
                    const review = { id: d.id, ...d.data() as any }
                    if (review.reviewerRole === 'teacher' || review.reviewerRole === 'ai') return
                    const existing = reviewsByEssay.get(review.essayId) ?? []
                    existing.push(review)
                    reviewsByEssay.set(review.essayId, existing)
                })

                const now = Date.now()
                const built: TeacherDiscussionRow[] = []

                reviewsByEssay.forEach((reviews, essayId) => {
                    const essay = essaysMap.get(essayId) as any
                    const author = essay ? usersMap.get(essay.studentId) as any : null

                    const latestReviewAt = reviews.reduce<any>((latest, r) => {
                        if (!latest) return r.completedAt
                        const latestMs = latest?.toMillis?.() ?? 0
                        const rMs = r.completedAt?.toMillis?.() ?? 0
                        return rMs > latestMs ? r.completedAt : latest
                    }, null)
                    const sortTime = latestReviewAt?.toMillis?.() ?? 0
                    const isRecent = sortTime > 0 && (now - sortTime) < RECENT_THRESHOLD_MS

                    built.push({
                        essayId,
                        essayTitle: essay?.title || 'Untitled',
                        authorName: author ? (author.displayName || author.name || 'Unknown') : 'Unknown',
                        authorId: essay?.studentId || '',
                        authorGroup: author?.groupName || '',
                        topicName: essay?.topicName || '',
                        reviewCount: reviews.length,
                        latestReviewAt,
                        sortTime,
                        isRecent,
                    })
                })

                setRows(built)
            } catch (err) {
                console.error('Error loading discussions:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [router])

    const groups = useMemo(() => [...new Set(rows.map(r => r.authorGroup).filter(Boolean))].sort(), [rows])
    const topics = useMemo(() => [...new Set(rows.map(r => r.topicName).filter(Boolean))].sort(), [rows])

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
                    r.essayTitle.toLowerCase().includes(q) ||
                    r.authorName.toLowerCase().includes(q) ||
                    r.topicName.toLowerCase().includes(q)
                const matchesGroup = !groupFilter || r.authorGroup === groupFilter
                const matchesTopic = !topicFilter || r.topicName === topicFilter
                const matchesStatus =
                    statusFilter === 'all' ||
                    (statusFilter === 'recent' && r.isRecent) ||
                    (statusFilter === 'older' && !r.isRecent)
                return matchesSearch && matchesGroup && matchesTopic && matchesStatus
            })
            .sort((a, b) => {
                const dir = sortDir === 'asc' ? 1 : -1
                if (sortBy === 'title') return dir * a.essayTitle.localeCompare(b.essayTitle)
                if (sortBy === 'reviews') return dir * (a.reviewCount - b.reviewCount)
                return dir * (a.sortTime - b.sortTime)
            })
    }, [rows, search, groupFilter, topicFilter, statusFilter, sortBy, sortDir])

    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filtered.slice(start, start + ITEMS_PER_PAGE)
    }, [filtered, currentPage])
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    const recentCount = rows.filter(r => r.isRecent).length
    const totalReviews = rows.reduce((sum, r) => sum + r.reviewCount, 0)
    const uniqueAuthors = new Set(rows.map(r => r.authorId).filter(Boolean)).size

    return (
        <TeacherLayout title="Discussions">
            <div className="p-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 mb-0.5">Peer Feedback Discussions</h1>
                    <p className="text-slate-400 text-sm">All essays with peer feedback — open any to read anonymous reviews</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Essays with Feedback', value: rows.length, accent: '#3b82f6' },
                        { label: 'New Feedback (7 days)', value: recentCount, accent: '#10b981' },
                        { label: 'Total Peer Reviews', value: totalReviews, accent: '#8b5cf6' },
                        { label: 'Unique Authors', value: uniqueAuthors, accent: '#f59e0b' },
                    ].map(({ label, value, accent }) => (
                        <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100" style={{ borderLeft: `4px solid ${accent}` }}>
                            <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
                            <div className="text-slate-500 text-xs mt-1">{label}</div>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                    <input
                        type="text"
                        placeholder="Search by essay title, author, or topic…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full sm:flex-1 bg-white border border-slate-200 text-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-teal-500 transition-colors"
                    />
                    {groups.length > 0 && (
                        <select
                            value={groupFilter}
                            onChange={e => setGroupFilter(e.target.value)}
                            className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500"
                        >
                            <option value="">All Groups</option>
                            {groups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    )}
                    {topics.length > 0 && (
                        <select
                            value={topicFilter}
                            onChange={e => setTopicFilter(e.target.value)}
                            className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500"
                        >
                            <option value="">All Topics</option>
                            {topics.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    )}
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as 'all' | 'recent' | 'older')}
                        className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500"
                    >
                        <option value="all">All</option>
                        <option value="recent">New (7 days)</option>
                        <option value="older">Older</option>
                    </select>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    {[
                                        ['title', 'Essay Title'],
                                        ['', 'Author'],
                                        ['', 'Topic'],
                                        ['reviews', 'Peer Reviews'],
                                        ['latestReview', 'Latest Review'],
                                        ['', 'Status'],
                                    ].map(([col, label], i) => (
                                        <th
                                            key={i}
                                            onClick={col ? () => toggleSort(col) : undefined}
                                            className={`py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide whitespace-nowrap select-none
                                                ${col ? 'cursor-pointer hover:text-teal-500 transition-colors' : ''}`}
                                        >
                                            {label}{col ? <span className="text-slate-400 text-xs ml-0.5">{sortArrow(col)}</span> : null}
                                        </th>
                                    ))}
                                    <th className="py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                                            {search || groupFilter || topicFilter || statusFilter !== 'all'
                                                ? 'No essays match your filters.'
                                                : 'No peer feedback submitted yet.'}
                                        </td>
                                    </tr>
                                ) : paginatedRows.map(row => (
                                    <tr key={row.essayId} className="hover:bg-slate-50 transition-colors">
                                        {/* Essay Title */}
                                        <td className="py-3.5 px-5 max-w-[220px]">
                                            <Link
                                                href={`/discussion/${row.essayId}`}
                                                className="text-slate-700 hover:text-slate-900 text-sm font-medium line-clamp-2 leading-snug transition-colors block"
                                            >
                                                {row.essayTitle}
                                            </Link>
                                        </td>
                                        {/* Author */}
                                        <td className="py-3.5 px-5">
                                            <Link
                                                href={`/teacher/${row.authorId}`}
                                                className="text-teal-600 hover:text-teal-700 font-medium text-sm transition-colors block"
                                            >
                                                {row.authorName}
                                            </Link>
                                            {row.authorGroup && (
                                                <div className="text-xs text-violet-600 mt-0.5">{row.authorGroup}</div>
                                            )}
                                        </td>
                                        {/* Topic */}
                                        <td className="py-3.5 px-5">
                                            {row.topicName ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                    {row.topicName}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 text-sm">—</span>
                                            )}
                                        </td>
                                        {/* Review Count */}
                                        <td className="py-3.5 px-5">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                                {row.reviewCount}
                                            </span>
                                        </td>
                                        {/* Latest Review Date */}
                                        <td className="py-3.5 px-5">
                                            <div className="text-slate-500 text-sm">{formatDate(row.latestReviewAt)}</div>
                                        </td>
                                        {/* Status */}
                                        <td className="py-3.5 px-5">
                                            {row.isRecent ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-100">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                                    New
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                                                    Older
                                                </span>
                                            )}
                                        </td>
                                        {/* Action */}
                                        <td className="py-3.5 px-5">
                                            <Link
                                                href={`/discussion/${row.essayId}`}
                                                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors whitespace-nowrap"
                                                style={{ backgroundColor: '#1a9aaa' }}
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
                                                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                                View Feedback
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filtered.length > 0 && totalPages > 1 && (
                        <div className="px-5 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50">
                            <div className="text-sm text-slate-500">
                                Showing <span className="font-medium text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                                <span className="font-medium text-slate-700">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of{' '}
                                <span className="font-medium text-slate-700">{filtered.length}</span> essays
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-sm"
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-slate-500 font-medium px-2">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-sm"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </TeacherLayout>
    )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'

interface DiscussionRow {
    reviewId: string
    essayId: string
    totalScore: number | null
    completedAt: any
    essayTitle: string | null
    essayTopic: string | null
}

function scoreBadgeBg(score: number | null): string {
    if (score === null) return 'bg-slate-100 text-slate-500'
    if (score >= 80) return 'bg-green-50 text-green-700 border border-green-200'
    if (score >= 65) return 'bg-blue-50 text-blue-700 border border-blue-200'
    if (score >= 50) return 'bg-amber-50 text-amber-700 border border-amber-200'
    return 'bg-red-50 text-red-600 border border-red-200'
}

export default function DiscussionsPage() {
    const router = useRouter()
    const [rows, setRows] = useState<DiscussionRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            try {
                const q = query(
                    collection(db, 'reviews'),
                    where('reviewerId', '==', auth.currentUser.uid)
                )
                const snap = await getDocs(q)
                const raw = snap.docs.map(d => ({
                    reviewId: d.id,
                    essayId: d.data().essayId ?? '',
                    totalScore: d.data().totalScore ?? null,
                    completedAt: d.data().completedAt,
                }))

                // Sort newest first
                raw.sort((a, b) => (b.completedAt?.toMillis?.() ?? 0) - (a.completedAt?.toMillis?.() ?? 0))

                // Batch-fetch unique essays
                const uniqueEssayIds = [...new Set(raw.map(r => r.essayId).filter(Boolean))]
                const essayMap: Record<string, any> = {}
                await Promise.all(
                    uniqueEssayIds.map(async (eid) => {
                        const essayDoc = await getDoc(doc(db, 'essays', eid))
                        if (essayDoc.exists()) essayMap[eid] = essayDoc.data()
                    })
                )

                setRows(raw.map(r => ({
                    ...r,
                    essayTitle: essayMap[r.essayId]?.title ?? null,
                    essayTopic: essayMap[r.essayId]?.topicName ?? null,
                })))
            } catch (err) {
                console.error('Error loading discussions:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
        )
    }

    return (
        <StudentLayout title="Discussions">
            <main className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Discussions</h1>
                    <p className="text-slate-500">
                        Essays you&apos;ve reviewed — join the discussion to see all feedback and scores.
                    </p>
                </div>

                {/* Anonymity notice */}
                <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
                    <span className="text-blue-500 mt-0.5 shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                    <p className="text-blue-700 text-sm leading-relaxed">
                        <span className="font-semibold">Anonymity is maintained.</span> Essay authors are not identified anywhere on this page or in the discussion view.
                    </p>
                </div>

                {rows.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-6xl mb-4">💬</div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">No Discussions Yet</h3>
                        <p className="text-slate-500 text-sm">
                            Once you review a peer&apos;s essay, it will appear here so you can follow the discussion.
                        </p>
                        <Link
                            href="/review"
                            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                            style={{ backgroundColor: '#1a9aaa' }}
                        >
                            👥 Go Review Peers
                        </Link>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50">
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500 w-10">#</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Topic</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Essay Title</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500 text-center">Score Given</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Reviewed On</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, idx) => {
                                        const reviewedOn = row.completedAt?.toDate
                                            ? row.completedAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                            : '—'

                                        return (
                                            <tr key={row.reviewId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                                                {/* # */}
                                                <td className="py-4 px-4">
                                                    <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                                        {idx + 1}
                                                    </span>
                                                </td>

                                                {/* Topic */}
                                                <td className="py-4 px-4">
                                                    {row.essayTopic ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                            {row.essayTopic}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 text-sm">—</span>
                                                    )}
                                                </td>

                                                {/* Essay Title */}
                                                <td className="py-4 px-4 max-w-xs">
                                                    <span className="text-slate-800 text-sm font-medium line-clamp-2 leading-snug">
                                                        {row.essayTitle ?? <span className="text-slate-400 italic">Untitled</span>}
                                                    </span>
                                                </td>

                                                {/* Score */}
                                                <td className="py-4 px-4 text-center">
                                                    {row.totalScore !== null ? (
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${scoreBadgeBg(row.totalScore)}`}>
                                                            {row.totalScore}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 text-sm">—</span>
                                                    )}
                                                </td>

                                                {/* Reviewed On */}
                                                <td className="py-4 px-4">
                                                    <span className="text-slate-500 text-sm">{reviewedOn}</span>
                                                </td>

                                                {/* Action */}
                                                <td className="py-4 px-4">
                                                    <Link
                                                        href={`/discussion/${row.essayId}`}
                                                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors whitespace-nowrap"
                                                        style={{ backgroundColor: '#1a9aaa' }}
                                                    >
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
                                                            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                        Join Discussion
                                                    </Link>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </StudentLayout>
    )
}

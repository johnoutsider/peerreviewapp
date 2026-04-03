'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import AnnotationSummary from '@/components/review/AnnotationSummary'
import { ReviewAnnotation } from '@/lib/review-types'

const RATING_LABELS: Record<number, string> = {
    1: 'Not Helpful',
    2: 'Slightly Helpful',
    3: 'Somewhat Helpful',
    4: 'Very Helpful',
    5: 'Extremely Helpful',
}

interface MyReview {
    id: string
    essayId: string
    feedback: string
    annotations: ReviewAnnotation[]
    annotationsCount: number
    totalScore: number | null
    scores: Record<string, any>
    completedAt: any
    studentRating: number | null
    studentResponse: string | null
    // fetched from essays collection
    essayTitle?: string
    essayTopic?: string
    essayContent?: string
    essayWordCount?: number
}

export default function MyReviewsPage() {
    const router = useRouter()
    const [reviews, setReviews] = useState<MyReview[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

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
                    id: d.id,
                    essayId: d.data().essayId ?? '',
                    feedback: d.data().feedback ?? '',
                    annotations: d.data().annotations ?? [],
                    annotationsCount: d.data().annotationsCount ?? ((d.data().annotations ?? []).length || 0),
                    totalScore: d.data().totalScore ?? null,
                    scores: d.data().scores ?? {},
                    completedAt: d.data().completedAt,
                    studentRating: d.data().studentRating ?? null,
                    studentResponse: d.data().studentResponse ?? null,
                })) as MyReview[]

                // Sort newest first in memory
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

                // Merge essay data into reviews
                const enriched = raw.map(r => {
                    const essay = essayMap[r.essayId]
                    const content = essay?.content ?? ''
                    return {
                        ...r,
                        essayTitle: essay?.title ?? null,
                        essayTopic: essay?.topicName ?? null,
                        essayContent: content,
                        essayWordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
                    }
                })

                setReviews(enriched)
            } catch (err) {
                console.error('Error loading my reviews:', err)
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
        <StudentLayout title="My Reviews">
            <main className="container mx-auto px-4 py-8 max-w-3xl">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">My Reviews</h1>
                    <p className="text-slate-500">
                        Feedback you&apos;ve submitted to peers — and how authors anonymously responded.
                    </p>
                </div>

                {reviews.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-6xl mb-4">📝</div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">No Reviews Yet</h3>
                        <p className="text-slate-500 text-sm">
                            You haven&apos;t submitted any peer reviews yet. Head to <strong>Review Peers</strong> to get started.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {reviews.map((review, idx) => {
                            const hasReaction = review.studentRating !== null || (review.studentResponse && review.studentResponse.trim() !== '')
                            const isExpanded = expandedIds.has(review.id)
                            const submittedAt = review.completedAt?.toDate
                                ? review.completedAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                : null

                            return (
                                <div key={review.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                                    {/* ── Card Header ── */}
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                                                {idx + 1}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-800 text-sm truncate">
                                                    Your Review #{idx + 1}
                                                </p>
                                                {(review.essayTopic || review.essayTitle) && (
                                                    <p className="text-xs text-slate-400 truncate mt-0.5">
                                                        {[review.essayTopic, review.essayTitle].filter(Boolean).join(' · ')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 ml-3">
                                            {review.totalScore !== null && (
                                                <span className="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
                                                    Score: {review.totalScore}/100
                                                </span>
                                            )}
                                            {review.annotationsCount > 0 && (
                                                <span className="text-xs font-bold bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-200">
                                                    {review.annotationsCount} note{review.annotationsCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {submittedAt && (
                                                <span className="text-xs text-slate-400">{submittedAt}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Topic + Title badges ── */}
                                    <div className="px-6 pt-4 flex flex-wrap gap-2">
                                        {review.essayTopic && (
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full">
                                                📌 {review.essayTopic}
                                            </span>
                                        )}
                                        {review.essayTitle && (
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full">
                                                📄 {review.essayTitle}
                                            </span>
                                        )}
                                        {review.essayWordCount ? (
                                            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full">
                                                📝 {review.essayWordCount} words
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="p-6 space-y-5">
                                        {/* ── Your Feedback ── */}
                                        <div>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                                Your Feedback
                                            </p>
                                            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                    {review.feedback || <em className="text-slate-400">No written feedback provided.</em>}
                                                </p>
                                            </div>
                                        </div>
                                        {review.annotations.length > 0 && (
                                            <AnnotationSummary
                                                content={review.essayContent || ''}
                                                annotations={review.annotations}
                                                tone="student"
                                                title="Your Highlighted Notes"
                                                emptyText="No highlighted notes were attached to this review."
                                            />
                                        )}

                                        {/* ── Author's anonymous reaction ── */}
                                        <div>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                                Author&apos;s Anonymous Reaction
                                            </p>

                                            {hasReaction ? (
                                                <div className="space-y-3">
                                                    {review.studentRating !== null && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-slate-500 font-medium w-24 shrink-0">Helpfulness:</span>
                                                            <div className="flex items-center gap-1">
                                                                {[1, 2, 3, 4, 5].map(n => (
                                                                    <span
                                                                        key={n}
                                                                        className={`text-xl ${n <= (review.studentRating ?? 0) ? 'text-yellow-400' : 'text-slate-200'}`}
                                                                    >
                                                                        ★
                                                                    </span>
                                                                ))}
                                                                <span className="text-sm font-semibold text-slate-700 ml-2">
                                                                    {RATING_LABELS[review.studentRating!] ?? `${review.studentRating}/5`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {review.studentResponse && review.studentResponse.trim() !== '' ? (
                                                        <div>
                                                            <p className="text-xs text-slate-400 mb-1">Their reply:</p>
                                                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                                    {review.studentResponse}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        review.studentRating !== null && (
                                                            <p className="text-sm text-slate-400 italic">No written reply from the author.</p>
                                                        )
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-sm text-slate-400 italic bg-slate-50 rounded-lg p-4 border border-slate-100">
                                                    <span>⏳</span>
                                                    <span>The author hasn&apos;t responded to your feedback yet.</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── See More / Essay Content ── */}
                                        {review.essayContent && (
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpand(review.id)}
                                                    className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                                                >
                                                    <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                    {isExpanded ? 'Hide Essay' : 'See Essay'}
                                                </button>

                                                {isExpanded && (
                                                    <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                                                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Essay Content</span>
                                                        </div>
                                                        <div className="p-4 max-h-72 overflow-y-auto">
                                                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                                                {review.essayContent}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Info banner */}
                <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-5">
                    <h3 className="text-blue-700 font-semibold mb-2 text-sm">🛡️ Anonymity Guaranteed</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">
                        All peer reviews in this system are anonymous. You cannot see who authored the essays you reviewed,
                        and essay authors cannot see your identity when they rate or reply to your feedback.
                    </p>
                </div>
            </main>
        </StudentLayout>
    )
}

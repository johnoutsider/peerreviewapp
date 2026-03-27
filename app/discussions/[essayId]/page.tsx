'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import { isNewRubric, getScore100 } from '@/lib/score-calculator'

export default function DiscussionThreadPage() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [reviews, setReviews] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [accessDenied, setAccessDenied] = useState(false)

    const newRubricAspects = [
        { key: 'content', label: 'Content', max: 30 },
        { key: 'organization', label: 'Organization', max: 20 },
        { key: 'vocabulary', label: 'Vocabulary', max: 20 },
        { key: 'languageUse', label: 'Language Use', max: 25 },
        { key: 'mechanics', label: 'Mechanics', max: 5 },
    ]

    useEffect(() => {
        const load = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            try {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(auth.currentUser.uid)
                const isTeacher = profile?.role === 'teacher'

                // Fetch essay
                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (!essayDoc.exists()) { setLoading(false); return }
                const essayData = { id: essayDoc.id, ...essayDoc.data() } as any

                // Access: owner, teacher, or reviewer
                if (essayData.studentId !== auth.currentUser.uid && !isTeacher) {
                    const reviewerSnap = await getDocs(query(
                        collection(db, 'reviews'),
                        where('essayId', '==', essayId),
                        where('reviewerId', '==', auth.currentUser.uid)
                    ))
                    if (reviewerSnap.empty) {
                        setAccessDenied(true)
                        setLoading(false)
                        return
                    }
                }

                // Fetch peer reviews (exclude AI and teacher)
                const reviewsSnap = await getDocs(query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essayId)
                ))
                // Deduplicate by reviewerId, keep latest
                const uniqueMap = new Map()
                reviewsSnap.docs.forEach(d => {
                    const data = { id: d.id, ...d.data() } as any
                    if (data.reviewerRole === 'ai' || data.reviewerRole === 'teacher') return
                    if (!uniqueMap.has(data.reviewerId) ||
                        data.completedAt?.toMillis() > uniqueMap.get(data.reviewerId).completedAt?.toMillis()) {
                        uniqueMap.set(data.reviewerId, data)
                    }
                })
                const peerReviews = Array.from(uniqueMap.values())

                setEssay(essayData)
                setReviews(peerReviews)
            } catch (err) {
                console.error('Error loading discussion:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [essayId, router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
        )
    }

    if (accessDenied) {
        return (
            <StudentLayout title="Discussions">
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-6xl mb-4">🚫</div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Denied</h2>
                        <p className="text-slate-500 text-sm mb-6">You can only view discussions for essays you have reviewed.</p>
                        <Link href="/discussions" className="text-[#1a9aaa] hover:underline font-medium">&larr; Back to Discussions</Link>
                    </div>
                </main>
            </StudentLayout>
        )
    }

    if (!essay) {
        return (
            <StudentLayout title="Discussions">
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-6xl mb-4">🔍</div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Essay Not Found</h2>
                        <Link href="/discussions" className="text-[#1a9aaa] hover:underline font-medium">&larr; Back to Discussions</Link>
                    </div>
                </main>
            </StudentLayout>
        )
    }

    const usingNewRubric = reviews.length > 0 ? isNewRubric(reviews[0].scores ?? {}) : false
    const avgScore100 = (usingNewRubric && reviews.length > 0)
        ? Math.round(reviews.reduce((sum, r) => sum + getScore100(r.scores ?? {}), 0) / reviews.length)
        : null

    return (
        <StudentLayout title="Discussions">
            <main className="container mx-auto px-4 py-8 max-w-4xl">

                {/* Back link */}
                <div className="mb-6">
                    <Link href="/discussions" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Back to Discussions
                    </Link>
                </div>

                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-slate-900 mb-1">{essay.title}</h1>
                    <div className="flex items-center gap-3 mt-2">
                        {essay.topicName && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                {essay.topicName}
                            </span>
                        )}
                        <span className="text-slate-400 text-sm">
                            {reviews.length} peer {reviews.length === 1 ? 'review' : 'reviews'}
                        </span>
                    </div>
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
                        <span className="font-semibold">Anonymity is maintained.</span> The essay author and all reviewers are kept anonymous throughout this discussion.
                    </p>
                </div>

                {reviews.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
                        <div className="text-5xl mb-3">⏳</div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">No Reviews Yet</h3>
                        <p className="text-slate-500 text-sm">Peer reviews for this essay have not been submitted yet.</p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* Score summary */}
                        {usingNewRubric && avgScore100 !== null && (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h2 className="text-lg font-semibold text-slate-900 mb-4">Score Summary</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-slate-200">
                                                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Aspect</th>
                                                <th className="py-2 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500 text-center">Max</th>
                                                {reviews.map((_, i) => (
                                                    <th key={i} className="py-2 px-3 text-xs font-semibold text-slate-600 text-center">Reviewer {i + 1}</th>
                                                ))}
                                                {reviews.length > 1 && (
                                                    <th className="py-2 px-3 text-xs font-semibold text-slate-600 text-center">Avg</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {newRubricAspects.map(({ key, label, max }) => {
                                                const vals = reviews.map(r => {
                                                    const raw = r.scores?.[key]
                                                    if (typeof raw === 'number') return raw
                                                    const nums = String(raw ?? '').split('–').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n))
                                                    return nums.length ? Math.max(...nums) : 0
                                                })
                                                const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
                                                return (
                                                    <tr key={key} className="border-b border-slate-100">
                                                        <td className="py-2 px-3 text-slate-800 text-sm font-medium">{label}</td>
                                                        <td className="py-2 px-3 text-center text-slate-400 text-sm">/{max}</td>
                                                        {vals.map((v, i) => (
                                                            <td key={i} className="py-2 px-3 text-center font-bold text-slate-900 text-sm">{v}</td>
                                                        ))}
                                                        {reviews.length > 1 && (
                                                            <td className="py-2 px-3 text-center font-bold text-blue-600 text-sm">{avg}</td>
                                                        )}
                                                    </tr>
                                                )
                                            })}
                                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                                                <td className="py-2 px-3 font-bold text-slate-900 text-sm">Total</td>
                                                <td className="py-2 px-3 text-center text-slate-400 text-sm">/100</td>
                                                {reviews.map((r, i) => (
                                                    <td key={i} className="py-2 px-3 text-center font-extrabold text-slate-900 text-sm">{getScore100(r.scores ?? {})}</td>
                                                ))}
                                                {reviews.length > 1 && (
                                                    <td className="py-2 px-3 text-center font-extrabold text-blue-600 text-sm">{avgScore100}</td>
                                                )}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Peer review cards */}
                        <h2 className="text-xl font-semibold text-slate-900">Peer Feedback</h2>
                        {reviews.map((review, idx) => (
                            <div key={review.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                                        {idx + 1}
                                    </span>
                                    <h3 className="text-lg font-semibold text-slate-900">Reviewer {idx + 1}</h3>
                                    {review.totalScore !== null && (
                                        <span className="ml-auto text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                                            Score: {review.totalScore}
                                        </span>
                                    )}
                                </div>

                                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Feedback</p>
                                    <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{review.feedback}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </StudentLayout>
    )
}

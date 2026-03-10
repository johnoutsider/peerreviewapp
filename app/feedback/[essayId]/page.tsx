'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import ScoreChart from '@/components/ScoreChart'
import { calculateFinalScores, getScoreColor, getScoreLabel, isNewRubric, getScore100, getScore100Label, getScore100Color } from '@/lib/score-calculator'

export default function Feedback() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [reviews, setReviews] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [unlockLoading, setUnlockLoading] = useState(true)
    const [finalScores, setFinalScores] = useState<any>(null)
    const [notFound, setNotFound] = useState(false)
    const [accessDenied, setAccessDenied] = useState(false)
    const [isTeacher, setIsTeacher] = useState(false)
    const [canViewScores, setCanViewScores] = useState(true)
    const [completedReviewCount, setCompletedReviewCount] = useState(0)

    // Teacher review state
    const [teacherReview, setTeacherReview] = useState('')
    const [teacherScores, setTeacherScores] = useState({
        taskAchievement: 5,
        coherenceCohesion: 5,
        lexicalResource: 5,
        grammaticalRange: 5,
    })
    const [submittingTeacherReview, setSubmittingTeacherReview] = useState(false)

    // Per-review student response state: { [reviewId]: { rating, response, saving, saved } }
    const [studentResponses, setStudentResponses] = useState<Record<string, {
        rating: number | null
        response: string
        saving: boolean
        saved: boolean
    }>>({})

    const RATING_LABELS: Record<number, string> = {
        1: 'Not Helpful',
        2: 'Slightly Helpful',
        3: 'Somewhat Helpful',
        4: 'Very Helpful',
        5: 'Extremely Helpful',
    }

    // AI assessment is performed at submission time. No on-demand AI button is needed.

    useEffect(() => {
        const fetchFeedback = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                // Get user profile to check role
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(auth.currentUser.uid)
                const isTeacherRole = profile?.role === 'teacher'
                setIsTeacher(isTeacherRole)

                // Get essay
                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (!essayDoc.exists()) {
                    setNotFound(true)
                    setLoading(false)
                    return
                }

                const essayData = { id: essayDoc.id, ...essayDoc.data() } as any

                // Verify access: Student (owner) or Teacher
                if (essayData.studentId !== auth.currentUser.uid && !isTeacherRole) {
                    setAccessDenied(true)
                    setLoading(false)
                    return
                }

                // Get peer reviews received for this essay
                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essayId)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)

                // Deduplicate reviews by reviewerId so one user can't skew the score with double submissions
                const uniqueReviewsMap = new Map()
                reviewsSnapshot.docs.forEach(doc => {
                    const data = { id: doc.id, ...doc.data() } as any
                    // Keep the latest review if duplicates exist
                    if (!uniqueReviewsMap.has(data.reviewerId) ||
                        data.completedAt?.toMillis() > uniqueReviewsMap.get(data.reviewerId).completedAt?.toMillis()) {
                        uniqueReviewsMap.set(data.reviewerId, data)
                    }
                })
                const reviewsData = Array.from(uniqueReviewsMap.values())

                // Seed student response state from existing Firestore data
                const initialResponses: typeof studentResponses = {}
                reviewsData.forEach((r: any) => {
                    initialResponses[r.id] = {
                        rating: r.studentRating ?? null,
                        response: r.studentResponse ?? '',
                        saving: false,
                        saved: !!(r.studentRating || r.studentResponse),
                    }
                })
                setStudentResponses(initialResponses)


                setEssay(essayData)
                setReviews(reviewsData)
            } catch (error) {
                console.error('Error fetching feedback:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchFeedback()
    }, [essayId, router])

    // Gate score visibility: students must complete at least 2 reviews in this topic
    useEffect(() => {
        const checkUnlock = async () => {
            if (!auth.currentUser) return
            if (!essay || !essay.topicId) {
                setCanViewScores(true)
                setUnlockLoading(false)
                return
            }

            try {
                const { getStudentCompletedReviewCount } = await import('@/lib/peer-assignment')
                const count = await getStudentCompletedReviewCount(auth.currentUser.uid, essay.topicId)
                setCompletedReviewCount(count)

                // Teachers always see scores. Students must complete >= 2 reviews in this topic.
                if (isTeacher || essay.studentId !== auth.currentUser.uid) {
                    setCanViewScores(true)
                } else {
                    setCanViewScores(count >= 2)
                }
            } catch (err) {
                console.error('Error checking review unlock:', err)
                setCanViewScores(true)
            } finally {
                setUnlockLoading(false)
            }
        }

        checkUnlock()
    }, [essay, isTeacher])

    // Calculate final scores once reviews are loaded (independent of unlock state)
    useEffect(() => {
        if (reviews.length > 0) {
            const final = calculateFinalScores(reviews as any)
            setFinalScores(final)
        } else {
            setFinalScores(null)
        }
    }, [reviews])

    const handleTeacherSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!teacherReview.trim()) return

        setSubmittingTeacherReview(true)
        try {
            const { serverTimestamp, addDoc, collection } = await import('firebase/firestore')
            await addDoc(collection(db, 'reviews'), {
                essayId,
                reviewerId: auth.currentUser!.uid,
                reviewerName: 'Teacher',
                reviewerRole: 'teacher',
                scores: teacherScores,
                feedback: teacherReview,
                completedAt: serverTimestamp(),
            })

            // Reload page to show new review
            window.location.reload()
        } catch (error) {
            console.error('Error submitting teacher review:', error)
            alert('Failed to submit review')
        } finally {
            setSubmittingTeacherReview(false)
        }
    }

    const handleSaveResponse = async (reviewId: string) => {
        const state = studentResponses[reviewId]
        if (!state || state.saving) return
        setStudentResponses(prev => ({ ...prev, [reviewId]: { ...prev[reviewId], saving: true } }))
        try {
            await updateDoc(doc(db, 'reviews', reviewId), {
                studentRating: state.rating,
                studentResponse: state.response,
            })
            setStudentResponses(prev => ({ ...prev, [reviewId]: { ...prev[reviewId], saving: false, saved: true } }))
        } catch (err) {
            console.error('Error saving response:', err)
            setStudentResponses(prev => ({ ...prev, [reviewId]: { ...prev[reviewId], saving: false } }))
        }
    }

    // No on-demand AI handler here—AI assessments are created when essays are submitted.

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (notFound) {
        return (
            <div className="min-h-screen bg-slate-50  flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-slate-900  mb-4">Essay Not Found</h1>
                    <Link href="/my-essays" className="text-blue-400 hover:text-blue-300 inline-block">
                        &larr; Back to My Essays
                    </Link>
                </div>
            </div>
        )
    }

    if (accessDenied) {
        return (
            <div className="min-h-screen bg-slate-50  flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">🚫</div>
                    <h1 className="text-4xl font-bold text-slate-900  mb-4">Access Denied</h1>
                    <p className="text-slate-500  mb-6">You only have permission to view your own essays.</p>
                    <Link href="/my-essays" className="text-blue-400 hover:text-blue-300 inline-block">
                        &larr; Back to My Essays
                    </Link>
                </div>
            </div>
        )
    }

    const criteria = [
        { key: 'taskAchievement', label: 'Task Achievement' },
        { key: 'coherenceCohesion', label: 'Coherence & Cohesion' },
        { key: 'lexicalResource', label: 'Lexical Resource' },
        { key: 'grammaticalRange', label: 'Grammatical Range & Accuracy' },
    ]

    // Detect rubric format from the first peer review (not AI/teacher)
    const firstPeerReview = reviews.find(r => r.reviewerRole !== 'ai' && r.reviewerRole !== 'teacher')
    const usingNewRubric = firstPeerReview ? isNewRubric(firstPeerReview.scores ?? {}) : false

    // For new rubric: compute avg /100 across peer reviews
    const newRubricAspects = [
        { key: 'content', label: 'Content', max: 30 },
        { key: 'organization', label: 'Organization', max: 20 },
        { key: 'vocabulary', label: 'Vocabulary', max: 20 },
        { key: 'languageUse', label: 'Language Use', max: 25 },
        { key: 'mechanics', label: 'Mechanics', max: 5 },
    ]
    const peerReviews = reviews.filter(r => r.reviewerRole !== 'ai' && r.reviewerRole !== 'teacher')
    const avgScore100 = (usingNewRubric && peerReviews.length > 0)
        ? Math.round(peerReviews.reduce((sum, r) => sum + getScore100(r.scores ?? {}), 0) / peerReviews.length)
        : 0

    // ─── Render ───
    return (
        <StudentLayout title="Feedback & Scores">
            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900  mb-2">{essay.title}</h1>
                        <p className="text-slate-500 ">Comprehensive Feedback &amp; Assessment</p>
                    </div>
                    {!isTeacher && essay.studentId === auth.currentUser?.uid && reviews.length === 0 && (
                        <Link
                            href={`/edit-essay/${essayId}`}
                            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors font-medium text-sm inline-block text-center"
                        >
                            ✏️ Edit Essay
                        </Link>
                    )}
                </div>

                {/* AI assessments are created during submission; on-demand AI buttons removed. */}

                {/* ―― Locked state: student hasn't completed enough peer reviews ―― */}
                {!isTeacher && essay.studentId === auth.currentUser?.uid && !canViewScores && !unlockLoading && (
                    <div className="mb-6 rounded-2xl overflow-hidden border-2 border-amber-300 shadow-md">
                        {/* Top accent bar */}
                        <div className="bg-amber-400 px-6 py-2 flex items-center gap-2">
                            <span className="text-xl">🔒</span>
                            <span className="text-amber-900 font-bold text-sm tracking-wide uppercase">Scores &amp; Feedback Locked</span>
                        </div>
                        <div className="bg-amber-50 px-6 py-5">
                            <p className="text-slate-700 font-medium mb-1">
                                You must review <span className="font-bold text-amber-700">2 classmates&apos; essays on this same topic</span> before you can see your scores and peer feedback.
                            </p>
                            <p className="text-slate-500 text-sm mb-4">
                                Progress: <span className="font-bold text-amber-600">{completedReviewCount} / 2</span> reviews completed for this topic.
                            </p>
                            {/* Progress bar */}
                            <div className="w-full bg-amber-200 rounded-full h-2.5 mb-4">
                                <div
                                    className="bg-amber-500 h-2.5 rounded-full transition-all"
                                    style={{ width: `${Math.min(completedReviewCount / 2 * 100, 100)}%` }}
                                />
                            </div>
                            <Link
                                href="/review"
                                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors shadow-sm"
                            >
                                👥 Go Review Peers
                            </Link>
                        </div>
                    </div>
                )}

                {/* Score Visualization — only for old IELTS rubric, hidden if locked for the owner */}
                {!usingNewRubric && finalScores && canViewScores && (
                    <div className="mb-8">
                        <ScoreChart scores={finalScores.finalScores} title="Final Scores by Criterion" />
                    </div>
                )}

                {/* Score Breakdown — adapts to rubric format; hidden if locked for the owner */}
                {canViewScores && (
                    <div className="bg-white  backdrop-blur-sm rounded-xl p-6 border border-slate-200  shadow-sm mb-8">
                        <h2 className="text-2xl font-semibold text-slate-900  mb-4">Score Breakdown</h2>

                        {usingNewRubric ? (
                            /* New rubric: show 5 aspects with max scores and per-review columns */
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200 ">
                                            <th className="py-3 px-4 text-slate-600 ">Aspect</th>
                                            <th className="py-3 px-4 text-center text-slate-500  text-xs">Max</th>
                                            {peerReviews.map((r, i) => (
                                                <th key={i} className="py-3 px-4 text-center text-slate-600 ">Reviewer {i + 1}</th>
                                            ))}
                                            {peerReviews.length > 1 && <th className="py-3 px-4 text-center text-slate-600  font-bold">Avg</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {newRubricAspects.map(({ key, label, max }) => {
                                            const vals = peerReviews.map(r => {
                                                const raw = r.scores?.[key]
                                                if (typeof raw === 'number') return raw
                                                const nums = String(raw ?? '').split('\u2013').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n))
                                                return nums.length ? Math.max(...nums) : 0
                                            })
                                            const avgVal = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
                                            return (
                                                <tr key={key} className="border-b border-slate-100 ">
                                                    <td className="py-3 px-4 text-slate-900  font-medium">{label}</td>
                                                    <td className="py-3 px-4 text-center text-slate-400 text-sm">/{max}</td>
                                                    {vals.map((v, i) => (
                                                        <td key={i} className="py-3 px-4 text-center font-bold text-slate-900 ">{v}</td>
                                                    ))}
                                                    {peerReviews.length > 1 && (
                                                        <td className="py-3 px-4 text-center font-bold text-blue-600 ">{avgVal}</td>
                                                    )}
                                                </tr>
                                            )
                                        })}
                                        {/* Total row */}
                                        <tr className="border-t-2 border-slate-200  bg-slate-50 ">
                                            <td className="py-3 px-4 font-bold text-slate-900 ">Total</td>
                                            <td className="py-3 px-4 text-center text-slate-400 text-sm">/100</td>
                                            {peerReviews.map((r, i) => (
                                                <td key={i} className="py-3 px-4 text-center font-extrabold text-slate-900 ">{getScore100(r.scores ?? {})}</td>
                                            ))}
                                            {peerReviews.length > 1 && (
                                                <td className={`py-3 px-4 text-center font-extrabold text-xl ${getScore100Color(avgScore100)}`}>{avgScore100}</td>
                                            )}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            /* Legacy IELTS rubric: original table */
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200  shadow-sm">
                                            <th className="py-3 px-4 text-slate-600 ">Criterion</th>
                                            {reviews.map((review, idx) => (
                                                <th key={idx} className="py-3 px-4 text-center text-slate-600 ">
                                                    {review.reviewerRole === 'ai' ? '🤖 AI' : review.reviewerRole === 'teacher' ? 'Teacher' : `Reviewer ${idx + 1}`}
                                                </th>
                                            ))}
                                            {finalScores && <th className="py-3 px-4 text-center text-slate-600  font-bold">Final</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {criteria.map(({ key, label }) => (
                                            <tr key={key} className="border-b border-slate-200  shadow-sm">
                                                <td className="py-3 px-4 text-slate-900 ">{label}</td>
                                                {reviews.map((review, idx) => (
                                                    <td key={idx} className="py-3 px-4 text-center text-slate-900  font-bold">
                                                        {review.scores?.[key] || 'N/A'}
                                                    </td>
                                                ))}
                                                {finalScores && (
                                                    <td className="py-3 px-4 text-center font-bold text-slate-900 ">
                                                        {finalScores.finalScores[key]}
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}



                {/* Peer Reviews — gated for essay owner until they complete 2 reviews */}
                {reviews.length > 0 && (canViewScores || isTeacher || essay.studentId !== auth.currentUser?.uid) && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-slate-900 ">Peer Reviews</h2>
                        {reviews.map((review, idx) => {
                            const isAI = review.reviewerRole === 'ai'
                            const isTeacherReview = review.reviewerRole === 'teacher'

                            // Rich AI feedback display with dimensions
                            if (isAI && review.dimensions) {
                                const dimensionConfig = [
                                    { key: 'task_response', label: 'Task Achievement', icon: '📋', color: 'blue' },
                                    { key: 'coherence_cohesion', label: 'Coherence & Cohesion', icon: '🔗', color: 'purple' },
                                    { key: 'lexical_resource', label: 'Lexical Resource', icon: '📚', color: 'teal' },
                                    { key: 'grammatical_range_accuracy', label: 'Grammar & Accuracy', icon: '✏️', color: 'pink' },
                                ]

                                const colorMap: Record<string, { border: string; bg: string; text: string; badge: string }> = {
                                    blue: { border: 'border-blue-500/40', bg: 'bg-blue-900/20', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
                                    purple: { border: 'border-purple-500/40', bg: 'bg-purple-900/20', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
                                    teal: { border: 'border-teal-500/40', bg: 'bg-teal-900/20', text: 'text-teal-400', badge: 'bg-teal-500/20 text-teal-300' },
                                    pink: { border: 'border-pink-500/40', bg: 'bg-pink-900/20', text: 'text-pink-400', badge: 'bg-pink-500/20 text-pink-300' },
                                }

                                return (
                                    <div key={review.id} className="space-y-4">
                                        {/* AI Header + Overall Band */}
                                        <div className="bg-gradient-to-br from-cyan-900/30 to-teal-900/30 backdrop-blur-sm rounded-2xl p-6 border border-cyan-500/40">
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <h3 className="text-2xl font-bold text-cyan-400 flex items-center gap-3">
                                                        🤖 AI Assessment
                                                    </h3>
                                                    <p className="text-slate-500  text-sm mt-1">Official assessment descriptor rubric</p>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-sm text-slate-500  mb-1">Overall Band</div>
                                                    <div className="text-5xl font-bold text-slate-900 ">
                                                        {review.overallBand}
                                                    </div>
                                                </div>
                                            </div>
                                            {review.feedback && (
                                                <div className="bg-slate-50  rounded-lg p-4 border border-slate-200 ">
                                                    <p className="text-slate-600  italic">{review.feedback}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* 4 Dimension Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {dimensionConfig.map(({ key, label, icon, color }) => {
                                                const dim = review.dimensions?.[key]
                                                if (!dim) return null
                                                const colors = colorMap[color]
                                                return (
                                                    <div key={key} className={`rounded-xl p-5 border ${colors.border} ${colors.bg} backdrop-blur-sm`}>
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h4 className={`font-bold text-lg ${colors.text} flex items-center gap-2`}>
                                                                {icon} {label}
                                                            </h4>
                                                            <div className="text-3xl font-bold text-slate-900 ">{dim.band}</div>
                                                        </div>
                                                        <div className="mb-2">
                                                            <span className="text-green-400 text-sm font-semibold">✅ Good: </span>
                                                            <span className="text-slate-600  text-sm">{dim.good}</span>
                                                        </div>
                                                        <div className="mb-3">
                                                            <span className="text-amber-400 text-sm font-semibold">🎯 Focus: </span>
                                                            <span className="text-slate-600  text-sm">{dim.focus}</span>
                                                        </div>
                                                        {dim.descriptors && dim.descriptors.length > 0 && (
                                                            <div className="space-y-2 mt-3 pt-3 border-t border-slate-200  shadow-sm">
                                                                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Band Descriptors</div>
                                                                {dim.descriptors.map((desc: any, di: number) => (
                                                                    <div key={di} className="flex gap-2 items-start">
                                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${colors.badge}`}>
                                                                            Band {desc.band}
                                                                        </span>
                                                                        <span className="text-slate-500  text-xs leading-relaxed">{desc.text}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Top Priority Actions */}
                                        {review.topActions && review.topActions.length > 0 && (
                                            <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 backdrop-blur-sm rounded-xl p-6 border border-amber-500/30">
                                                <h4 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
                                                    🎯 Top Priority Improvements
                                                </h4>
                                                <div className="space-y-3">
                                                    {review.topActions.map((action: string, ai: number) => (
                                                        <div key={ai} className="flex items-start gap-3">
                                                            <span className="bg-amber-500/20 text-amber-300 text-sm font-bold rounded-full w-7 h-7 flex items-center justify-center shrink-0">
                                                                {ai + 1}
                                                            </span>
                                                            <span className="text-slate-600 ">{action}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            }

                            // Standard peer/teacher review display
                            return (
                                <div
                                    key={review.id}
                                    className={`backdrop-blur-sm rounded-xl p-6 border ${isTeacherReview
                                        ? 'border-purple-500/50 bg-purple-900/10'
                                        : 'border-slate-200  shadow-sm bg-white '
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className={`text-xl font-semibold ${isTeacherReview ? 'text-purple-400' : 'text-slate-900 '}`}>
                                            {isTeacherReview ? '🎓 Teacher Feedback' : `Reviewer ${idx + 1}`}
                                        </h3>
                                        {isTeacher && !isTeacherReview && review.reviewerName && (
                                            <span className="text-slate-500  text-sm italic bg-slate-100  px-3 py-1 rounded-full border border-slate-200 ">
                                                Reviewer Name: {review.reviewerName}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                        {criteria.map(({ key, label }) => (
                                            <div key={key} className="bg-slate-100  rounded-lg p-3 text-center">
                                                <div className="text-sm text-slate-500  mb-1">{label}</div>
                                                <div className="text-2xl font-bold text-slate-900 ">
                                                    {review.scores[key]}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="bg-slate-100  rounded-lg p-4">
                                        <div className="text-sm text-slate-500  mb-2">Feedback:</div>
                                        <p className="text-slate-600  whitespace-pre-wrap">{review.feedback}</p>
                                    </div>

                                    {/* ── Helpfulness rating + student response ── */}
                                    {!isTeacher && !isAI && !isTeacherReview && studentResponses[review.id] && (
                                        <div className="mt-4 border-t border-slate-200  pt-4 space-y-4">
                                            {/* Rating */}
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700  mb-2">
                                                    RATE THIS REVIEW
                                                </p>
                                                <p className="text-xs text-slate-500  mb-3">How helpful was this peer review to you?</p>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {[1, 2, 3, 4, 5].map(n => (
                                                        <button
                                                            key={n}
                                                            type="button"
                                                            onClick={() => setStudentResponses(prev => ({ ...prev, [review.id]: { ...prev[review.id], rating: n, saved: false } }))}
                                                            className={`text-2xl transition-all focus:outline-none ${studentResponses[review.id].rating !== null && n <= (studentResponses[review.id].rating ?? 0)
                                                                ? 'text-yellow-400 scale-110'
                                                                : 'text-slate-300 hover:text-yellow-300'
                                                                }`}
                                                            title={RATING_LABELS[n]}
                                                        >
                                                            ★
                                                        </button>
                                                    ))}
                                                    {studentResponses[review.id].rating && (
                                                        <span className="text-sm font-medium text-slate-600 ml-1">
                                                            {RATING_LABELS[studentResponses[review.id].rating!]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Written response */}
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700  mb-1">
                                                    Your response to the reviewer&apos;s feedback:
                                                </p>
                                                <textarea
                                                    rows={3}
                                                    value={studentResponses[review.id].response}
                                                    onChange={e => setStudentResponses(prev => ({ ...prev, [review.id]: { ...prev[review.id], response: e.target.value, saved: false } }))}
                                                    placeholder="Clarify the changes you've made in response to the reviewer's feedback. If you have any disagreements with their comments, provide a clear and logical justification."
                                                    className="w-full bg-slate-50  border border-slate-200  text-slate-800  rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none transition-colors"
                                                />
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveResponse(review.id)}
                                                    disabled={studentResponses[review.id].saving || (!studentResponses[review.id].rating && !studentResponses[review.id].response.trim())}
                                                    className="bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                                                >
                                                    {studentResponses[review.id].saving ? 'Saving…' : 'Save Response'}
                                                </button>
                                                {studentResponses[review.id].saved && (
                                                    <span className="text-green-500 text-sm font-medium">✓ Saved</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Teacher sees the student's rating + response ── */}
                                    {isTeacher && !isAI && !isTeacherReview && (
                                        <div className="mt-4 border-t border-slate-200  pt-4 space-y-3">
                                            <p className="text-xs font-semibold text-slate-500  uppercase tracking-wide">
                                                💬 Student&apos;s Response to this Review
                                            </p>

                                            {/* Helpfulness rating */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-slate-600  font-medium">Helpfulness:</span>
                                                {review.studentRating ? (
                                                    <div className="flex items-center gap-1">
                                                        {[1, 2, 3, 4, 5].map(n => (
                                                            <span
                                                                key={n}
                                                                className={`text-xl ${n <= review.studentRating
                                                                    ? 'text-yellow-400'
                                                                    : 'text-slate-200'
                                                                    }`}
                                                            >
                                                                ★
                                                            </span>
                                                        ))}
                                                        <span className="text-sm font-medium text-slate-600 ml-1">
                                                            {RATING_LABELS[review.studentRating as number] ?? `${review.studentRating}/5`}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-slate-400 italic">Not rated yet</span>
                                                )}
                                            </div>

                                            {/* Written reply */}
                                            {review.studentResponse ? (
                                                <div className="bg-slate-50  rounded-lg p-3 text-sm text-slate-700  whitespace-pre-wrap border border-slate-200  shadow-sm">
                                                    {review.studentResponse}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-slate-400 italic">No written reply yet.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Teacher Grading Form */}
                {isTeacher && (
                    <div className="bg-purple-900/20 backdrop-blur-sm rounded-xl p-8 border border-purple-500/30 mt-8">
                        <h2 className="text-2xl font-bold text-slate-900  mb-6">✏️ Teacher Feedback</h2>
                        <form onSubmit={handleTeacherSubmit}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                {criteria.map(({ key, label }) => (
                                    <div key={key}>
                                        <label className="block text-slate-600  mb-2 text-sm">{label} (0-9)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="9"
                                            step="0.5"
                                            value={teacherScores[key as keyof typeof teacherScores]}
                                            onChange={(e) => setTeacherScores(prev => ({
                                                ...prev,
                                                [key]: parseFloat(e.target.value)
                                            }))}
                                            className="w-full bg-slate-100  border border-slate-200  shadow-sm rounded-lg p-3 text-slate-900  focus:outline-none focus:border-purple-500"
                                            required
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="mb-6">
                                <label className="block text-slate-600  mb-2">Overall Comments</label>
                                <textarea
                                    value={teacherReview}
                                    onChange={(e) => setTeacherReview(e.target.value)}
                                    className="w-full h-32 bg-slate-100  border border-slate-200  shadow-sm rounded-lg p-4 text-slate-900  focus:outline-none focus:border-purple-500"
                                    placeholder="Provide detailed feedback for the student..."
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submittingTeacherReview}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 rounded-xl transition-all disabled:opacity-50"
                            >
                                {submittingTeacherReview ? 'Submitting...' : 'Submit Teacher Feedback'}
                            </button>
                        </form>
                    </div>
                )}
            </main>
        </StudentLayout>
    )
}

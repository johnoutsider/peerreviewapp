'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore'
import Header from '@/components/Header'
import ScoreChart from '@/components/ScoreChart'
import { calculateFinalScores, getScoreColor, getScoreLabel } from '@/lib/score-calculator'

export default function Feedback() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [reviews, setReviews] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [finalScores, setFinalScores] = useState<any>(null)
    const [reviewsGiven, setReviewsGiven] = useState(0)
    const [sameTopicReviewsDone, setSameTopicReviewsDone] = useState(0)
    const [assignedSameTopicCount, setAssignedSameTopicCount] = useState(0)
    const [notFound, setNotFound] = useState(false)
    const [accessDenied, setAccessDenied] = useState(false)
    const [isTeacher, setIsTeacher] = useState(false)

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

                // Check how many reviews this student has GIVEN + same-topic gating
                if (!isTeacherRole) {
                    const uid = auth.currentUser.uid

                    // All reviews given by this student
                    const myReviewsSnap = await getDocs(
                        query(collection(db, 'reviews'), where('reviewerId', '==', uid))
                    )
                    setReviewsGiven(myReviewsSnap.size)

                    // How many of those reviews are for same-topic essays?
                    const myReviewedEssayIds = myReviewsSnap.docs.map(d => d.data().essayId as string)
                    if (myReviewedEssayIds.length > 0 && essayData.topicId) {
                        // Check which reviewed essays share the same topic
                        const reviewedEssaysSnap = await getDocs(
                            query(collection(db, 'essays'), where('topicId', '==', essayData.topicId))
                        )
                        const sameTopicEssayIds = new Set(reviewedEssaysSnap.docs.map(d => d.id))
                        const sameTopicDone = myReviewedEssayIds.filter(eid => sameTopicEssayIds.has(eid)).length
                        setSameTopicReviewsDone(sameTopicDone)
                    }

                    // How many same-topic essays are assigned to this student?
                    const assignedSnap = await getDocs(
                        query(
                            collection(db, 'essays'),
                            where('peerReviewIds', 'array-contains', uid),
                            where('topicId', '==', essayData.topicId)
                        )
                    )
                    // Exclude own essay from count
                    const assignedOtherTopicEssays = assignedSnap.docs.filter(d => d.data().studentId !== uid)
                    setAssignedSameTopicCount(assignedOtherTopicEssays.length)
                }

                // Calculate final scores
                if (reviewsData.length > 0) {
                    const final = calculateFinalScores(reviewsData as any)
                    setFinalScores(final)
                }

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
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (notFound) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Essay Not Found</h1>
                    <button onClick={() => router.push('/my-essays')} className="text-blue-400 hover:text-blue-300">
                        &larr; Back to My Essays
                    </button>
                </div>
            </div>
        )
    }

    if (accessDenied) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">🚫</div>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Access Denied</h1>
                    <p className="text-slate-500 dark:text-gray-400 mb-6">You only have permission to view your own essays.</p>
                    <button onClick={() => router.push('/my-essays')} className="text-blue-400 hover:text-blue-300">
                        &larr; Back to My Essays
                    </button>
                </div>
            </div>
        )
    }

    // Gate: students must review at least 2 same-topic essays before seeing results
    if (!isTeacher && sameTopicReviewsDone < 2) {
        // Required reviews to unlock feedback
        const TARGET = 2
        // Show progress percentage
        const progressPct = Math.min(100, Math.round((sameTopicReviewsDone / TARGET) * 100))

        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
                <Header />
                <main className="container mx-auto px-4 py-16 max-w-xl text-center">
                    <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-10">
                        <div className="text-7xl mb-6">🔒</div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">Results Locked</h1>
                        <p className="text-slate-600 dark:text-gray-300 mb-2 text-lg">
                            To see your essay feedback you need to{' '}
                            <span className="text-yellow-400 font-semibold">review 2 of your classmates&apos; essays first</span>.
                        </p>
                        {essay?.topicName && (
                            <p className="text-slate-500 dark:text-gray-400 mb-6 text-sm">
                                You must review essays from the <span className="text-blue-300 font-medium">{essay.topicName}</span> topic.
                            </p>
                        )}
                        {/* Progress bar */}
                        <div className="w-full bg-slate-100 dark:bg-slate-900/50/60 rounded-full h-3 mb-2">
                            <div className="bg-yellow-400 h-3 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                        </div>
                        <p className="text-sm text-slate-500 dark:text-gray-400 mb-8">
                            {sameTopicReviewsDone} / {TARGET} same-topic reviews completed
                        </p>
                        <button
                            onClick={() => router.push('/review')}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-4 rounded-xl transition-all text-lg"
                        >
                            👥 Go Review Now
                        </button>
                        <button
                            onClick={() => router.push('/my-essays')}
                            className="mt-4 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white text-sm transition-colors"
                        >
                            ← Back to My Essays
                        </button>
                    </div>
                </main>
            </div>
        )
    }

    const criteria = [
        { key: 'taskAchievement', label: 'Task Achievement' },
        { key: 'coherenceCohesion', label: 'Coherence & Cohesion' },
        { key: 'lexicalResource', label: 'Lexical Resource' },
        { key: 'grammaticalRange', label: 'Grammatical Range & Accuracy' },
    ]



    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">{essay.title}</h1>
                        <p className="text-slate-500 dark:text-gray-400">Comprehensive Feedback &amp; Assessment</p>
                    </div>
                    {!isTeacher && essay.studentId === auth.currentUser?.uid && reviews.length === 0 && (
                        <button
                            onClick={() => router.push(`/edit-essay/${essayId}`)}
                            className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors font-medium text-sm"
                        >
                            ✏️ Edit Essay
                        </button>
                    )}
                </div>

                {/* AI assessments are created during submission; on-demand AI buttons removed. */}

                {/* Essay Content - Always visible */}
                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Your Essay</h2>
                        <div className="flex items-center gap-2">
                            {essay.topicName && (
                                <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full text-xs font-medium">
                                    🏷️ {essay.topicName}
                                </span>
                            )}
                            <span className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-white/10 shadow-sm px-3 py-1 rounded-full text-sm font-medium">
                                📝 {essay.content?.trim().split(/\s+/).filter((w: string) => w).length ?? 0} words
                            </span>
                        </div>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-4">
                        <p className="text-slate-600 dark:text-gray-300 whitespace-pre-wrap">{essay.content}</p>
                    </div>
                </div>

                {/* Overall Band Score */}
                {finalScores && (
                    <div className="bg-gradient-to-r from-blue-500/20 to-purple-600/20 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 mb-8 text-center">
                        <div className="text-slate-600 dark:text-gray-300 text-lg mb-2">Overall Band Score</div>
                        <div className="text-7xl font-bold text-slate-900 dark:text-white mb-2">{finalScores.overallBand}</div>
                        <div className="text-2xl font-semibold text-slate-900 dark:text-white">
                            {getScoreLabel(finalScores.overallBand)}
                        </div>
                        <div className="mt-4 text-sm text-slate-500 dark:text-gray-400">
                            Based on 3 peer reviews (100%)
                        </div>
                    </div>
                )}

                {/* Score Visualization */}
                {finalScores && (
                    <div className="mb-8">
                        <ScoreChart scores={finalScores.finalScores} title="Final Scores by Criterion" />
                    </div>
                )}

                {/* Detailed Score Breakdown */}
                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm mb-8">
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">Score Breakdown</h2>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-white/10 shadow-sm">
                                    <th className="py-3 px-4 text-slate-600 dark:text-gray-300">Criterion</th>

                                    {reviews.map((review, idx) => (
                                        <th key={idx} className="py-3 px-4 text-center text-slate-600 dark:text-gray-300">
                                            {review.reviewerRole === 'ai'
                                                ? '🤖 AI'
                                                : review.reviewerRole === 'teacher'
                                                    ? 'Teacher'
                                                    : `Peer ${idx + 1}`
                                            }
                                        </th>
                                    ))}
                                    {finalScores && <th className="py-3 px-4 text-center text-slate-600 dark:text-gray-300 font-bold">Final</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {criteria.map(({ key, label }) => (
                                    <tr key={key} className="border-b border-slate-200 dark:border-white/10 shadow-sm">
                                        <td className="py-3 px-4 text-slate-900 dark:text-white">{label}</td>

                                        {reviews.map((review, idx) => (
                                            <td key={idx} className="py-3 px-4 text-center text-slate-900 dark:text-white font-bold">
                                                {review.scores?.[key] || 'N/A'}
                                            </td>
                                        ))}
                                        {finalScores && (
                                            <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white">
                                                {finalScores.finalScores[key]}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>



                {/* Peer Reviews - Always visible if they exist */}
                {reviews.length > 0 && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Peer Reviews</h2>
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
                                                    <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">Official assessment descriptor rubric</p>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-sm text-slate-500 dark:text-gray-400 mb-1">Overall Band</div>
                                                    <div className="text-5xl font-bold text-slate-900 dark:text-white">
                                                        {review.overallBand}
                                                    </div>
                                                </div>
                                            </div>
                                            {review.feedback && (
                                                <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 border border-slate-200 dark:border-white/10">
                                                    <p className="text-slate-600 dark:text-gray-300 italic">{review.feedback}</p>
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
                                                            <div className="text-3xl font-bold text-slate-900 dark:text-white">{dim.band}</div>
                                                        </div>
                                                        <div className="mb-2">
                                                            <span className="text-green-400 text-sm font-semibold">✅ Good: </span>
                                                            <span className="text-slate-600 dark:text-gray-300 text-sm">{dim.good}</span>
                                                        </div>
                                                        <div className="mb-3">
                                                            <span className="text-amber-400 text-sm font-semibold">🎯 Focus: </span>
                                                            <span className="text-slate-600 dark:text-gray-300 text-sm">{dim.focus}</span>
                                                        </div>
                                                        {dim.descriptors && dim.descriptors.length > 0 && (
                                                            <div className="space-y-2 mt-3 pt-3 border-t border-slate-200 dark:border-white/10 shadow-sm">
                                                                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Band Descriptors</div>
                                                                {dim.descriptors.map((desc: any, di: number) => (
                                                                    <div key={di} className="flex gap-2 items-start">
                                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${colors.badge}`}>
                                                                            Band {desc.band}
                                                                        </span>
                                                                        <span className="text-slate-500 dark:text-gray-400 text-xs leading-relaxed">{desc.text}</span>
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
                                                            <span className="text-slate-600 dark:text-gray-300">{action}</span>
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
                                        : 'border-slate-200 dark:border-white/10 shadow-sm bg-white dark:bg-slate-800'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className={`text-xl font-semibold ${isTeacherReview ? 'text-purple-400' : 'text-slate-900 dark:text-white'}`}>
                                            {isTeacherReview ? '🎓 Teacher Feedback' : `Peer Review ${idx + 1}`}
                                        </h3>
                                        {isTeacher && !isTeacherReview && review.reviewerName && (
                                            <span className="text-slate-500 dark:text-gray-400 text-sm italic bg-slate-100 dark:bg-slate-900/50 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10">
                                                Reviewer: {review.reviewerName}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                        {criteria.map(({ key, label }) => (
                                            <div key={key} className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-3 text-center">
                                                <div className="text-sm text-slate-500 dark:text-gray-400 mb-1">{label}</div>
                                                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                                                    {review.scores[key]}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg p-4">
                                        <div className="text-sm text-slate-500 dark:text-gray-400 mb-2">Feedback:</div>
                                        <p className="text-slate-600 dark:text-gray-300 whitespace-pre-wrap">{review.feedback}</p>
                                    </div>

                                    {/* ── Helpfulness rating + student response ── */}
                                    {!isTeacher && !isAI && !isTeacherReview && studentResponses[review.id] && (
                                        <div className="mt-4 border-t border-slate-200 dark:border-white/10 pt-4 space-y-4">
                                            {/* Rating */}
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-1">
                                                    Is this reviewer&apos;s feedback helpful?
                                                </p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">1 = very unhelpful; 5 = very helpful</p>
                                                <div className="flex gap-2">
                                                    {[1, 2, 3, 4, 5].map(n => (
                                                        <button
                                                            key={n}
                                                            type="button"
                                                            onClick={() => setStudentResponses(prev => ({ ...prev, [review.id]: { ...prev[review.id], rating: n, saved: false } }))}
                                                            className={`w-9 h-9 rounded-lg border text-sm font-bold transition-all ${studentResponses[review.id].rating === n
                                                                ? 'bg-blue-500 border-blue-500 text-white'
                                                                : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-white/20 text-slate-700 dark:text-white hover:border-blue-400'
                                                                }`}
                                                        >
                                                            {n}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Written response */}
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-1">
                                                    Your response to the reviewer&apos;s feedback:
                                                </p>
                                                <textarea
                                                    rows={3}
                                                    value={studentResponses[review.id].response}
                                                    onChange={e => setStudentResponses(prev => ({ ...prev, [review.id]: { ...prev[review.id], response: e.target.value, saved: false } }))}
                                                    placeholder="Clarify the changes you've made in response to the reviewer's feedback. If you have any disagreements with their comments, provide a clear and logical justification."
                                                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none transition-colors"
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
                                        <div className="mt-4 border-t border-slate-200 dark:border-white/10 pt-4 space-y-3">
                                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                                💬 Student&apos;s Response to this Review
                                            </p>

                                            {/* Helpfulness rating */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-slate-600 dark:text-gray-300 font-medium">Helpfulness:</span>
                                                {review.studentRating ? (
                                                    <div className="flex items-center gap-1">
                                                        {[1, 2, 3, 4, 5].map(n => (
                                                            <span
                                                                key={n}
                                                                className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold border ${n <= review.studentRating
                                                                        ? 'bg-blue-500 border-blue-500 text-white'
                                                                        : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-white/10 text-slate-400'
                                                                    }`}
                                                            >
                                                                {n}
                                                            </span>
                                                        ))}
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">{review.studentRating}/5</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-slate-400 italic">Not rated yet</span>
                                                )}
                                            </div>

                                            {/* Written reply */}
                                            {review.studentResponse ? (
                                                <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 text-sm text-slate-700 dark:text-gray-300 whitespace-pre-wrap border border-slate-200 dark:border-white/10 shadow-sm">
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
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">✏️ Teacher Feedback</h2>
                        <form onSubmit={handleTeacherSubmit}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                {criteria.map(({ key, label }) => (
                                    <div key={key}>
                                        <label className="block text-slate-600 dark:text-gray-300 mb-2 text-sm">{label} (0-9)</label>
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
                                            className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 shadow-sm rounded-lg p-3 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
                                            required
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="mb-6">
                                <label className="block text-slate-600 dark:text-gray-300 mb-2">Overall Comments</label>
                                <textarea
                                    value={teacherReview}
                                    onChange={(e) => setTeacherReview(e.target.value)}
                                    className="w-full h-32 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 shadow-sm rounded-lg p-4 text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
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
        </div>
    )
}

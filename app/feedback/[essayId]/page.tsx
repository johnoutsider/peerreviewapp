'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
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
                const reviewsData = reviewsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

                // check how many reviews this student has GIVEN to others (only if student)
                if (!isTeacherRole) {
                    const myReviewsQuery = query(
                        collection(db, 'reviews'),
                        where('reviewerId', '==', auth.currentUser.uid)
                    )
                    const myReviewsSnapshot = await getDocs(myReviewsQuery)
                    setReviewsGiven(myReviewsSnapshot.size)
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (notFound) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-white mb-4">Essay Not Found</h1>
                    <button onClick={() => router.push('/my-essays')} className="text-blue-400 hover:text-blue-300">
                        &larr; Back to My Essays
                    </button>
                </div>
            </div>
        )
    }

    if (accessDenied) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">🚫</div>
                    <h1 className="text-4xl font-bold text-white mb-4">Access Denied</h1>
                    <p className="text-gray-400 mb-6">You only have permission to view your own essays.</p>
                    <button onClick={() => router.push('/my-essays')} className="text-blue-400 hover:text-blue-300">
                        &larr; Back to My Essays
                    </button>
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



    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">{essay.title}</h1>
                    <p className="text-gray-400">Comprehensive Feedback & Assessment</p>
                </div>

                {/* Essay Content - Always visible */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 mb-8">
                    <h2 className="text-2xl font-semibold text-white mb-4">Your Essay</h2>
                    <div className="bg-slate-900/50 rounded-lg p-4">
                        <p className="text-gray-300 whitespace-pre-wrap">{essay.content}</p>
                    </div>
                </div>

                {/* Overall Band Score */}
                {finalScores && (
                    <div className="bg-gradient-to-r from-blue-500/20 to-purple-600/20 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 mb-8 text-center">
                        <div className="text-gray-300 text-lg mb-2">Overall Band Score</div>
                        <div className="text-7xl font-bold text-white mb-2">{finalScores.overallBand}</div>
                        <div className={`text-2xl font-semibold ${getScoreColor(finalScores.overallBand)}`}>
                            {getScoreLabel(finalScores.overallBand)}
                        </div>
                        <div className="mt-4 text-sm text-gray-400">
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
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 mb-8">
                    <h2 className="text-2xl font-semibold text-white mb-4">Score Breakdown</h2>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="py-3 px-4 text-gray-300">Criterion</th>

                                    {reviews.map((review, idx) => (
                                        <th key={idx} className="py-3 px-4 text-center text-gray-300">
                                            {review.reviewerRole === 'teacher' ? 'Teacher' : `Peer ${idx + 1}`}
                                        </th>
                                    ))}
                                    {finalScores && <th className="py-3 px-4 text-center text-gray-300 font-bold">Final</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {criteria.map(({ key, label }) => (
                                    <tr key={key} className="border-b border-white/10">
                                        <td className="py-3 px-4 text-white">{label}</td>

                                        {reviews.map((review, idx) => (
                                            <td key={idx} className={`py-3 px-4 text-center ${review.reviewerRole === 'teacher' ? 'text-purple-400 font-bold' : 'text-gray-300'}`}>
                                                {review.scores?.[key] || 'N/A'}
                                            </td>
                                        ))}
                                        {finalScores && (
                                            <td className={`py-3 px-4 text-center font-bold ${getScoreColor(finalScores.finalScores[key])}`}>
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
                        <h2 className="text-2xl font-semibold text-white">Peer Reviews</h2>
                        {reviews.map((review, idx) => (
                            <div key={review.id} className={`bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border ${review.reviewerRole === 'teacher' ? 'border-purple-500/50 bg-purple-900/10' : 'border-white/10'}`}>
                                <h3 className={`text-xl font-semibold mb-4 ${review.reviewerRole === 'teacher' ? 'text-purple-400' : 'text-white'}`}>
                                    {review.reviewerRole === 'teacher' ? '🎓 Teacher Feedback' : `Peer Review ${idx + 1}`}
                                </h3>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    {criteria.map(({ key, label }) => (
                                        <div key={key} className="bg-slate-900/50 rounded-lg p-3 text-center">
                                            <div className="text-sm text-gray-400 mb-1">{label}</div>
                                            <div className={`text-2xl font-bold ${getScoreColor(review.scores[key])}`}>
                                                {review.scores[key]}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-slate-900/50 rounded-lg p-4">
                                    <div className="text-sm text-gray-400 mb-2">Feedback:</div>
                                    <p className="text-gray-300 whitespace-pre-wrap">{review.feedback}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Teacher Grading Form */}
                {isTeacher && (
                    <div className="bg-purple-900/20 backdrop-blur-sm rounded-xl p-8 border border-purple-500/30 mt-8">
                        <h2 className="text-2xl font-bold text-white mb-6">✏️ Teacher Feedback</h2>
                        <form onSubmit={handleTeacherSubmit}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                {criteria.map(({ key, label }) => (
                                    <div key={key}>
                                        <label className="block text-gray-300 mb-2 text-sm">{label} (0-9)</label>
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
                                            className="w-full bg-slate-900/50 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500"
                                            required
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="mb-6">
                                <label className="block text-gray-300 mb-2">Overall Comments</label>
                                <textarea
                                    value={teacherReview}
                                    onChange={(e) => setTeacherReview(e.target.value)}
                                    className="w-full h-32 bg-slate-900/50 border border-white/10 rounded-lg p-4 text-white focus:outline-none focus:border-purple-500"
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

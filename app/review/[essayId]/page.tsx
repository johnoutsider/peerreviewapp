'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

export default function ReviewEssay() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [alreadyReviewed, setAlreadyReviewed] = useState(false)
    const [notFound, setNotFound] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [scores, setScores] = useState({
        taskAchievement: 5,
        coherenceCohesion: 5,
        lexicalResource: 5,
        grammaticalRange: 5,
    })
    const [feedback, setFeedback] = useState('')

    useEffect(() => {
        const fetchEssay = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                // Get essay
                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (!essayDoc.exists()) {
                    setNotFound(true)
                    return
                }

                // Check if already reviewed
                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essayId),
                    where('reviewerId', '==', auth.currentUser.uid)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)

                if (!reviewsSnapshot.empty) {
                    setAlreadyReviewed(true)
                }

                setEssay({ id: essayDoc.id, ...essayDoc.data() })
            } catch (error) {
                console.error('Error fetching essay:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchEssay()
    }, [essayId, router])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!auth.currentUser || !essay) return

        if (!feedback.trim()) {
            setError('Please provide feedback')
            return
        }

        setSubmitting(true)

        try {
            await addDoc(collection(db, 'reviews'), {
                essayId,
                reviewerId: auth.currentUser.uid,
                reviewerName: auth.currentUser.displayName || 'Anonymous',
                scores,
                feedback,
                completedAt: serverTimestamp(),
            })

            setSuccess('Review submitted successfully! Redirecting...')
            setTimeout(() => {
                router.push('/review')
            }, 1500)
        } catch (error) {
            console.error('Error submitting review:', error)
            setError('Failed to submit review. Please try again.')
        } finally {
            setSubmitting(false)
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
                    <button onClick={() => router.push('/review')} className="text-blue-400 hover:text-blue-300">
                        &larr; Back to Reviews
                    </button>
                </div>
            </div>
        )
    }

    if (alreadyReviewed) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
                <Header />
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-12 text-center">
                        <div className="text-6xl mb-4">✅</div>
                        <h2 className="text-2xl font-semibold text-white mb-2">Already Reviewed</h2>
                        <p className="text-gray-400 mb-6">You&apos;ve already submitted a review for this essay.</p>
                        <button
                            onClick={() => router.push('/review')}
                            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Back to Reviews
                        </button>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-5xl">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">Review Essay</h1>
                    <p className="text-gray-400">Provide constructive feedback using the assessment criteria</p>
                </div>

                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && <Alert type="success" message={success} />}

                <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
                    {/* Essay Content */}
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 md:p-8 border border-white/10 h-max">
                        <div className="flex items-start justify-between mb-6 gap-4">
                            <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">{essay.title}</h2>
                            {essay.topicName && (
                                <span className="shrink-0 bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap">
                                    🏷️ {essay.topicName}
                                </span>
                            )}
                        </div>

                        <div className="bg-slate-900/50 rounded-lg p-5 md:p-6 mb-4">
                            <p className="text-gray-200 text-lg leading-relaxed whitespace-pre-wrap font-serif">
                                {essay.content}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
                                📝 {essay.content?.trim().split(/\s+/).filter((w: string) => w).length ?? 0} words
                            </span>
                        </div>
                    </div>

                    {/* Review Form */}
                    <form onSubmit={handleSubmit} className="space-y-6 flex flex-col h-full">
                        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                            <h3 className="text-xl font-semibold text-white mb-4">Assessment Criteria Scores (0-9)</h3>

                            {Object.entries(scores).map(([key, value]) => (
                                <div key={key} className="mb-4">
                                    <label className="block text-gray-300 mb-2 capitalize">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range"
                                            min="0"
                                            max="9"
                                            step="0.5"
                                            value={value}
                                            onChange={(e) => setScores({ ...scores, [key]: parseFloat(e.target.value) })}
                                            className="flex-1"
                                        />
                                        <span className="text-2xl font-bold text-blue-400 min-w-[40px]">{value}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                            <h3 className="text-xl font-semibold text-white mb-4">Written Feedback</h3>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="Provide detailed feedback on strengths and areas for improvement..."
                                rows={10}
                                className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                required
                            />
                        </div>

                        <div className="pt-4 mt-auto">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white font-bold text-xl py-5 rounded-xl hover:from-green-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-green-500/20"
                            >
                                {submitting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                        Submitting Review...
                                    </>
                                ) : (
                                    'Submit Review'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    )
}

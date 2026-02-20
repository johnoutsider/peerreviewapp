'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import Header from '@/components/Header'
import EssayCard from '@/components/EssayCard'
import DeadlineBanner from '@/components/DeadlineBanner'

interface Essay {
    id: string
    title: string
    content: string
    studentName: string
    submittedAt: any
    status: 'submitted' | 'under_review' | 'completed'
    overallScore?: number
    reviewCount: number
    topicId?: string
}

interface TopicDeadlines {
    [topicId: string]: { essayDeadline: Date | null; reviewDeadline: Date | null }
}

export default function MyEssays() {
    const router = useRouter()
    const [essays, setEssays] = useState<Essay[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [topicDeadlines, setTopicDeadlines] = useState<TopicDeadlines>({})

    const fetchEssays = async () => {
        if (!auth.currentUser) {
            router.push('/')
            return
        }

        try {
            const q = query(
                collection(db, 'essays'),
                where('studentId', '==', auth.currentUser.uid)
            )
            const snapshot = await getDocs(q)

            const essayData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Essay[]

            // Client-side sort
            essayData.sort((a, b) => {
                const timeA = a.submittedAt?.toMillis() || 0
                const timeB = b.submittedAt?.toMillis() || 0
                return timeB - timeA
            })

            // Fetch scores AND review count for each essay
            const { calculateFinalScores } = await import('@/lib/score-calculator')
            const essaysWithData = await Promise.all(essayData.map(async (essay) => {
                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essay.id)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)
                const reviewsData = reviewsSnapshot.docs.map(doc => doc.data())
                const reviewCount = reviewsSnapshot.size

                if (reviewsData.length > 0) {
                    const scores = calculateFinalScores(reviewsData as any)
                    return { ...essay, overallScore: scores.overallBand, reviewCount }
                }
                return { ...essay, reviewCount }
            }))

            setEssays(essaysWithData)

            // Fetch topic deadlines to show countdowns
            const topicsSnap = await getDocs(collection(db, 'topics'))
            const dl: TopicDeadlines = {}
            topicsSnap.docs.forEach(d => {
                const data = d.data() as any
                dl[d.id] = {
                    essayDeadline: data.essayDeadline ? (data.essayDeadline as Timestamp).toDate() : null,
                    reviewDeadline: data.reviewDeadline ? (data.reviewDeadline as Timestamp).toDate() : null,
                }
            })
            setTopicDeadlines(dl)
        } catch (error) {
            console.error('Error fetching essays:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchEssays()
    }, [router])

    const handleDelete = async (essayId: string) => {
        setDeletingId(essayId)
        try {
            await deleteDoc(doc(db, 'essays', essayId))
            setEssays(prev => prev.filter(e => e.id !== essayId))
        } catch (error) {
            console.error('Error deleting essay:', error)
        } finally {
            setDeletingId(null)
            setConfirmDeleteId(null)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />

            {/* Delete Confirmation Modal */}
            {confirmDeleteId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
                    <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
                        <div className="text-5xl mb-4">🗑️</div>
                        <h2 className="text-2xl font-bold text-white mb-2">Delete Essay?</h2>
                        <p className="text-gray-400 mb-6">
                            This action cannot be undone. Your essay will be permanently removed.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex-1 bg-slate-700 text-gray-300 font-semibold py-3 rounded-lg hover:bg-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(confirmDeleteId)}
                                disabled={deletingId === confirmDeleteId}
                                className="flex-1 bg-red-500/80 text-white font-semibold py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {deletingId === confirmDeleteId ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        Deleting...
                                    </>
                                ) : (
                                    'Yes, Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="container mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-white mb-2">My Essays</h1>
                        <p className="text-gray-400">View your submissions and feedback</p>
                    </div>
                    <button
                        onClick={() => router.push('/submit-essay')}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all"
                    >
                        + Submit New Essay
                    </button>
                </div>

                {essays.length === 0 ? (
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-12 border border-white/10 text-center">
                        <div className="text-6xl mb-4">📝</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">No Essays Yet</h3>
                        <p className="text-gray-400 mb-6">You haven&apos;t submitted any essays yet.</p>
                        <button
                            onClick={() => router.push('/submit-essay')}
                            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Submit Your First Essay
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-6">
                        {essays.map(essay => {
                            const dl = essay.topicId ? topicDeadlines[essay.topicId] : null
                            return (
                                <div key={essay.id} className="space-y-2">
                                    {dl?.essayDeadline && <DeadlineBanner label="Essay Submission" deadline={dl.essayDeadline} emoji="📝" />}
                                    {dl?.reviewDeadline && <DeadlineBanner label="Peer Review" deadline={dl.reviewDeadline} emoji="👥" />}
                                    <EssayCard
                                        {...essay}
                                        overallScore={essay.overallScore}
                                        reviewCount={essay.reviewCount}
                                        onClick={() => router.push(`/feedback/${essay.id}`)}
                                        onEdit={(e) => {
                                            e.stopPropagation()
                                            router.push(`/edit-essay/${essay.id}`)
                                        }}
                                        onDelete={essay.reviewCount === 0 ? (e) => {
                                            e.stopPropagation()
                                            setConfirmDeleteId(essay.id)
                                        } : undefined}
                                    />
                                </div>
                            )
                        })}
                    </div>
                )}
            </main>
        </div>
    )
}


'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import Header from '@/components/Header'
import EssayCard from '@/components/EssayCard'

interface Essay {
    id: string
    title: string
    content: string
    studentName: string
    submittedAt: any
    status: 'submitted' | 'under_review' | 'completed'
    overallScore?: number
}

export default function MyEssays() {
    const router = useRouter()
    const [essays, setEssays] = useState<Essay[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
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

                // Client-side sort to avoid composite index requirement
                essayData.sort((a, b) => {
                    const timeA = a.submittedAt?.toMillis() || 0
                    const timeB = b.submittedAt?.toMillis() || 0
                    return timeB - timeA
                })

                // Fetch scores for each essay
                const { calculateFinalScores } = await import('@/lib/score-calculator')
                const essaysWithScores = await Promise.all(essayData.map(async (essay) => {
                    const reviewsQuery = query(
                        collection(db, 'reviews'),
                        where('essayId', '==', essay.id)
                    )
                    const reviewsSnapshot = await getDocs(reviewsQuery)
                    const reviewsData = reviewsSnapshot.docs.map(doc => doc.data())

                    if (reviewsData.length > 0) {
                        const scores = calculateFinalScores(reviewsData as any)
                        return { ...essay, overallScore: scores.overallBand }
                    }
                    return essay
                }))

                setEssays(essaysWithScores)
            } catch (error) {
                console.error('Error fetching essays:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchEssays()
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Header />

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
                        {essays.map(essay => (
                            <EssayCard
                                key={essay.id}
                                {...essay}
                                overallScore={essay.overallScore}
                                onClick={() => router.push(`/feedback/${essay.id}`)}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}

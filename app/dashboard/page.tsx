'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import Header from '@/components/Header'
import IELTSRubric from '@/components/IELTSRubric'

export default function Dashboard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        submittedEssays: 0,
        reviewsCompleted: 0,
        reviewsPending: 0,
    })

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                router.push('/')
                return
            }

            try {
                // Get essays submitted by user
                const essaysQuery = query(
                    collection(db, 'essays'),
                    where('studentId', '==', user.uid)
                )
                const essaysSnapshot = await getDocs(essaysQuery)

                // Get reviews completed by user
                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('reviewerId', '==', user.uid)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)

                // Get essays assigned for review
                const assignedQuery = query(
                    collection(db, 'essays'),
                    where('peerReviewIds', 'array-contains', user.uid)
                )
                const assignedSnapshot = await getDocs(assignedQuery)

                setStats({
                    submittedEssays: essaysSnapshot.size,
                    reviewsCompleted: reviewsSnapshot.size,
                    reviewsPending: assignedSnapshot.size - reviewsSnapshot.size,
                })
            } catch (error) {
                console.error('Error fetching stats:', error)
            }

            setLoading(false)
        })

        return () => unsubscribe()
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
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">Welcome Back!</h1>
                    <p className="text-gray-400">Here&apos;s your IELTS writing progress</p>
                </div>

                {/* Stats Cards */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
                        <div className="text-5xl mb-3">📝</div>
                        <div className="text-3xl font-bold text-white mb-1">{stats.submittedEssays}</div>
                        <div className="text-blue-300">Essays Submitted</div>
                    </div>

                    <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 backdrop-blur-sm rounded-xl p-6 border border-green-500/30">
                        <div className="text-5xl mb-3">✅</div>
                        <div className="text-3xl font-bold text-white mb-1">{stats.reviewsCompleted}</div>
                        <div className="text-green-300">Reviews Completed</div>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 backdrop-blur-sm rounded-xl p-6 border border-yellow-500/30">
                        <div className="text-5xl mb-3">⏳</div>
                        <div className="text-3xl font-bold text-white mb-1">{stats.reviewsPending}</div>
                        <div className="text-yellow-300">Pending Reviews</div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                    <h2 className="text-2xl font-semibold text-white mb-4">Quick Actions</h2>

                    <div className="grid md:grid-cols-2 gap-4">
                        <button
                            onClick={() => router.push('/submit-essay')}
                            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all text-left group"
                        >
                            <div className="text-3xl mb-2">✍️</div>
                            <h3 className="text-xl font-semibold mb-1">Submit New Essay</h3>
                            <p className="text-blue-100 text-sm">Upload your IELTS essay and get AI feedback</p>
                        </button>

                        <button
                            onClick={() => router.push('/review')}
                            className="bg-gradient-to-r from-green-500 to-teal-600 text-white p-6 rounded-lg hover:from-green-600 hover:to-teal-700 transition-all text-left group"
                        >
                            <div className="text-3xl mb-2">🤝</div>
                            <h3 className="text-xl font-semibold mb-1">Review Peers</h3>
                            <p className="text-green-100 text-sm">Help your classmates by reviewing their essays</p>
                        </button>

                        <button
                            onClick={() => router.push('/my-essays')}
                            className="bg-gradient-to-r from-purple-500 to-pink-600 text-white p-6 rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all text-left group"
                        >
                            <div className="text-3xl mb-2">📊</div>
                            <h3 className="text-xl font-semibold mb-1">View My Essays</h3>
                            <p className="text-purple-100 text-sm">See your submissions and feedback</p>
                        </button>

                        <button
                            onClick={() => router.push('/progress')}
                            className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-6 rounded-lg hover:from-orange-600 hover:to-red-700 transition-all text-left group"
                        >
                            <div className="text-3xl mb-2">📈</div>
                            <h3 className="text-xl font-semibold mb-1">Track Progress</h3>
                            <p className="text-orange-100 text-sm">Monitor your improvement over time</p>
                        </button>
                    </div>
                </div>
            </main>

            <IELTSRubric />
        </div>
    )
}

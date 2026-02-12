'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Header from '@/components/Header'
import EssayCard from '@/components/EssayCard'
import Alert from '@/components/Alert'

interface Essay {
    id: string
    title: string
    content: string
    studentName: string
    submittedAt: any
    status: 'submitted' | 'under_review' | 'completed'
}

export default function Review() {
    const router = useRouter()
    const [assignedEssays, setAssignedEssays] = useState<Essay[]>([])
    const [reviewedEssays, setReviewedEssays] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchAssignedEssays = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                // Get user profile for classId
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(auth.currentUser.uid)

                if (!profile) return

                // Get essays assigned to this reviewer
                let essaysQuery = query(
                    collection(db, 'essays'),
                    where('peerReviewIds', 'array-contains', auth.currentUser.uid)
                )
                let essaysSnapshot = await getDocs(essaysQuery)

                // If no essays assigned, try to claim one
                if (essaysSnapshot.empty) {
                    const { claimEssayForReview } = await import('@/lib/peer-assignment')
                    const claimed = await claimEssayForReview(auth.currentUser.uid, profile.classId)

                    if (claimed) {
                        // Refresh query
                        essaysSnapshot = await getDocs(essaysQuery)
                    }
                }

                const essays = essaysSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Essay[]

                // Get reviews already completed by this user
                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('reviewerId', '==', auth.currentUser.uid)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)
                const reviewed = new Set(reviewsSnapshot.docs.map(doc => doc.data().essayId))

                setAssignedEssays(essays)
                setReviewedEssays(reviewed)
            } catch (error) {
                console.error('Error fetching assigned essays:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchAssignedEssays()
    }, [router])

    const [requesting, setRequesting] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [actionSuccess, setActionSuccess] = useState<string | null>(null)

    const handleFindEssay = async () => {
        if (!auth.currentUser) return
        setRequesting(true)
        setActionError(null)
        setActionSuccess(null)

        try {
            const { getUserProfile } = await import('@/lib/auth')
            const profile = await getUserProfile(auth.currentUser.uid)

            if (!profile) {
                setActionError('User profile not found')
                return
            }

            const { claimEssayForReview } = await import('@/lib/peer-assignment')
            const claimed = await claimEssayForReview(auth.currentUser.uid, profile.classId)

            if (claimed) {
                setActionSuccess('New essay assigned! Refreshing list...')
                // Refresh list logic - ideally refactor fetchAssignedEssays to be reusable
                // For now, simple reload or we can trigger re-fetch if we extract it
                setTimeout(() => window.location.reload(), 1000)
            } else {
                setActionError('No essays available for review right now. Please check back later!')
            }
        } catch (error) {
            console.error('Error finding essay:', error)
            setActionError('Failed to find essay.')
        } finally {
            setRequesting(false)
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8">
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-bold text-white mb-2">Peer Review</h1>
                        <p className="text-gray-400">Review your classmates&apos; essays and provide constructive feedback</p>
                    </div>
                    <button
                        onClick={handleFindEssay}
                        disabled={requesting}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {requesting ? (
                            <>
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                Finding...
                            </>
                        ) : (
                            <>
                                <span>➕</span> Find Another Essay
                            </>
                        )}
                    </button>
                </div>

                {actionError && <Alert type="info" message={actionError} onClose={() => setActionError(null)} />}
                {actionSuccess && <Alert type="success" message={actionSuccess} />}

                {assignedEssays.length === 0 ? (
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-12 border border-white/10 text-center">
                        <div className="text-6xl mb-4">📝</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">No Essays to Review</h3>
                        <p className="text-gray-400 mb-6">You don&apos;t have any essays assigned for review yet.</p>
                        <button
                            onClick={handleFindEssay}
                            disabled={requesting}
                            className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg transition-colors"
                        >
                            Find an Essay to Review
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-6">
                        {assignedEssays.map(essay => (
                            <div key={essay.id} className="relative">
                                <EssayCard
                                    {...essay}
                                    onClick={() => router.push(`/review/${essay.id}`)}
                                />
                                {reviewedEssays.has(essay.id) && (
                                    <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                                        ✓ Reviewed
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
                    <h3 className="text-blue-400 font-semibold mb-3">💡 Review Tips</h3>
                    <ul className="text-gray-300 space-y-2">
                        <li>• Be constructive and specific in your feedback</li>
                        <li>• Use the IELTS rubric as a guide for scoring</li>
                        <li>• Highlight both strengths and areas for improvement</li>
                        <li>• Consider the essay structure and arguments clearly</li>
                    </ul>
                </div>
            </main>
        </div>
    )
}

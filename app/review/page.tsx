'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
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
    topicId?: string
    topicName?: string
}

interface Topic {
    id: string
    name: string
}

export default function Review() {
    const router = useRouter()
    const [assignedEssays, setAssignedEssays] = useState<Essay[]>([])
    const [reviewedEssays, setReviewedEssays] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [topics, setTopics] = useState<Topic[]>([])
    const [selectedTopicId, setSelectedTopicId] = useState('')
    const [requesting, setRequesting] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [actionSuccess, setActionSuccess] = useState<string | null>(null)
    const [showFindPanel, setShowFindPanel] = useState(false)

    useEffect(() => {
        const init = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                // Load topics for the filter dropdown
                const topicsSnap = await getDocs(query(collection(db, 'topics'), orderBy('createdAt', 'desc')))
                setTopics(topicsSnap.docs.map(d => ({ id: d.id, name: (d.data() as any).name })) as Topic[])

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
                    const claimedId = await claimEssayForReview(auth.currentUser.uid, profile.classId)

                    if (claimedId) {
                        router.push(`/review/${claimedId}`)
                        return
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

        init()
    }, [router])

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
            const claimedId = await claimEssayForReview(
                auth.currentUser.uid,
                profile.classId,
                selectedTopicId || undefined
            )

            if (claimedId) {
                setActionSuccess('Essay found! Redirecting to review...')
                router.push(`/review/${claimedId}`)
            } else {
                const topicLabel = selectedTopicId
                    ? `the "${topics.find(t => t.id === selectedTopicId)?.name}" topic`
                    : 'any topic'
                setActionError(`No essays available for ${topicLabel} right now. Please check back later or try a different topic!`)
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8">
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-bold text-white mb-2">Peer Review</h1>
                        <p className="text-gray-400">Review your classmates&apos; essays and provide constructive feedback</p>
                    </div>
                    <button
                        onClick={() => setShowFindPanel(prev => !prev)}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <span>➕</span> Find Another Essay
                    </button>
                </div>

                {/* Find Essay Panel */}
                {showFindPanel && (
                    <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30 mb-6">
                        <h3 className="text-lg font-semibold text-white mb-4">🔍 Search for an Essay to Review</h3>
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-gray-300 text-sm mb-2">Filter by Topic (optional)</label>
                                <select
                                    value={selectedTopicId}
                                    onChange={e => setSelectedTopicId(e.target.value)}
                                    className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500 transition-colors"
                                >
                                    <option value="">Any Topic</option>
                                    {topics.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={handleFindEssay}
                                disabled={requesting}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                            >
                                {requesting ? (
                                    <>
                                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                        Finding…
                                    </>
                                ) : (
                                    '🔍 Find Essay'
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {actionError && <Alert type="info" message={actionError} onClose={() => setActionError(null)} />}
                {actionSuccess && <Alert type="success" message={actionSuccess} />}

                {assignedEssays.length === 0 ? (
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-12 border border-white/10 text-center">
                        <div className="text-6xl mb-4">📝</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">No Essays to Review</h3>
                        <p className="text-gray-400 mb-6">You don&apos;t have any essays assigned for review yet.</p>
                        <button
                            onClick={() => setShowFindPanel(true)}
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
                                {/* Topic badge */}
                                {essay.topicName && (
                                    <div className="absolute top-4 left-4 bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full text-xs font-medium">
                                        🏷️ {essay.topicName}
                                    </div>
                                )}
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

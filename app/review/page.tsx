'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy, Timestamp, limit } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import EssayCard from '@/components/EssayCard'
import Alert from '@/components/Alert'
import DeadlineBanner from '@/components/DeadlineBanner'

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
    reviewDeadline?: Date | null
}

export default function Review() {
    const router = useRouter()
    const [assignedEssays, setAssignedEssays] = useState<Essay[]>([])
    const [reviewedEssays, setReviewedEssays] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [topics, setTopics] = useState<Topic[]>([])
    const [selectedTopicId, setSelectedTopicId] = useState('')
    const [eligibleTopicIds, setEligibleTopicIds] = useState<string[]>([])
    const [isTeacher, setIsTeacher] = useState(false)
    const [requesting, setRequesting] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const [actionSuccess, setActionSuccess] = useState<string | null>(null)
    const [showFindPanel, setShowFindPanel] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 25

    useEffect(() => {
        const init = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                // Load topics for the filter dropdown
                const topicsSnap = await getDocs(query(collection(db, 'topics'), orderBy('createdAt', 'desc')))
                setTopics(topicsSnap.docs.map(d => ({
                    id: d.id,
                    name: (d.data() as any).name,
                    reviewDeadline: (d.data() as any).reviewDeadline
                        ? ((d.data() as any).reviewDeadline as Timestamp).toDate()
                        : null,
                })) as Topic[])

                // Get user profile for classId and role
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(auth.currentUser.uid)
                if (!profile) return

                setIsTeacher(profile.role === 'teacher')

                // For students, restrict review topics to those they have submitted essays for
                if (profile.role !== 'teacher') {
                    const { getStudentSubmittedTopicIds } = await import('@/lib/peer-assignment')
                    const submittedTopicIds = await getStudentSubmittedTopicIds(auth.currentUser.uid)
                    setEligibleTopicIds(submittedTopicIds)

                    // Pre-select the first topic the student has submitted for (if any)
                    const firstEligible = topicsSnap.docs.find(d => submittedTopicIds.includes(d.id))
                    if (firstEligible) {
                        setSelectedTopicId(firstEligible.id)
                    }
                } else if (topicsSnap.docs.length > 0) {
                    // Teachers can review any topic; default to latest
                    setSelectedTopicId(topicsSnap.docs[0].id)
                }

                // Get essays assigned to this reviewer
                const { getAssignedEssays } = await import('@/lib/peer-assignment')
                const essays = await getAssignedEssays(auth.currentUser.uid)

                // Get reviews already completed by this user
                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('reviewerId', '==', auth.currentUser.uid)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)
                const reviewed = new Set(reviewsSnapshot.docs.map(doc => doc.data().essayId))

                setAssignedEssays(essays as Essay[])
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

            if (profile.role === 'teacher') {
                setActionError('Teachers cannot use the automatic peer-review finder.')
                return
            }

            if (!selectedTopicId) {
                setActionError('Select a topic you have submitted an essay for before finding a peer essay.')
                return
            }

            const { claimEssayForReview, hasSubmittedTopic } = await import('@/lib/peer-assignment')

            // Enforce: students can only review topics they have submitted essays for
            const hasSubmitted = await hasSubmittedTopic(auth.currentUser.uid, selectedTopicId)
            if (!hasSubmitted) {
                setActionError('You must submit an essay for this topic before reviewing classmates in it.')
                return
            }

            const claimedId = await claimEssayForReview(
                auth.currentUser.uid,
                profile.classId,
                selectedTopicId
            )

            if (claimedId) {
                setActionSuccess('Essay found! Redirecting to review...')
                router.push(`/review/${claimedId}`)
            } else {
                const topicLabel = searchTopicId
                    ? `the "${topics.find(t => t.id === searchTopicId)?.name}" topic`
                    : 'any topic'
                setActionError(`No essays available for ${topicLabel} right now. Peer review is a community process—as soon as more classmates submit and need reviews, you will be able to find one here. Please try again in 30 minutes!`)
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
            <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }


    return (
        <StudentLayout title="Peer Review">

            <main className="container mx-auto px-4 py-8">
                <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900  mb-2">Peer Review</h1>
                        <p className="text-slate-500 ">Review your classmates&apos; essays and provide constructive feedback</p>
                    </div>
                    <button
                        onClick={() => setShowFindPanel(prev => !prev)}
                        className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <span>➕</span> Find Another Essay
                    </button>
                </div>

                {/* Find Essay Panel */}
                {showFindPanel && (
                    <div className="bg-white  backdrop-blur-sm rounded-xl p-6 border border-purple-500/30 mb-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900  mb-4">🔍 Search for an Essay to Review</h3>
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-slate-600  text-sm mb-2">
                                    Review Topic (must match your own submission)
                                </label>
                                <select
                                    value={selectedTopicId}
                                    onChange={e => setSelectedTopicId(e.target.value)}
                                    className="w-full bg-white  border border-slate-200  text-slate-900  rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500 transition-colors"
                                >
                                    <option value="">Select topic…</option>
                                    {topics
                                        .filter(t => isTeacher || eligibleTopicIds.length === 0 || eligibleTopicIds.includes(t.id))
                                        .map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                </select>
                                {!isTeacher && eligibleTopicIds.length === 0 && (
                                    <p className="mt-2 text-xs text-amber-600 ">
                                        Submit an essay first to unlock peer review for that topic.
                                    </p>
                                )}
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

                {(() => {
                    const paginatedEssays = assignedEssays.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                    const totalPages = Math.ceil(assignedEssays.length / ITEMS_PER_PAGE)

                    if (assignedEssays.length === 0) {
                        return (
                            <div className="bg-white  backdrop-blur-sm rounded-xl p-12 border border-slate-200  shadow-sm text-center">
                                <div className="text-6xl mb-4">📝</div>
                                <h3 className="text-2xl font-semibold text-slate-900  mb-2">No Essays to Review</h3>
                                <p className="text-slate-500  mb-6">You don&apos;t have any essays assigned for review yet.</p>
                                <button
                                    onClick={() => setShowFindPanel(true)}
                                    className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg transition-colors"
                                >
                                    Find an Essay to Review
                                </button>
                            </div>
                        )
                    }

                    return (
                        <>
                            <div className="grid gap-6">
                                {paginatedEssays.map(essay => {
                                    const topic = essay.topicId ? topics.find(t => t.id === essay.topicId) : null
                                    return (
                                        <div key={essay.id} className="space-y-2">
                                            {topic?.reviewDeadline && (
                                                <DeadlineBanner label="Peer Review" deadline={topic.reviewDeadline} emoji="👥" />
                                            )}
                                            <div className="relative">
                                                <EssayCard
                                                    {...essay}
                                                    topicName={essay.topicName}
                                                    onClick={() => router.push(`/review/${essay.id}`)}
                                                />
                                                {reviewedEssays.has(essay.id) && (
                                                    <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                                                        ✓ Reviewed
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {assignedEssays.length > 0 && totalPages > 1 && (
                                <div className="mt-6 px-5 py-4 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 bg-white">
                                    <div className="text-sm text-slate-500">
                                        Showing <span className="font-medium text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium text-slate-700">{Math.min(currentPage * ITEMS_PER_PAGE, assignedEssays.length)}</span> of <span className="font-medium text-slate-700">{assignedEssays.length}</span> assigned essays
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-slate-500 font-medium px-2">
                                            Page {currentPage} of {totalPages}
                                        </span>
                                        <button
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            className="px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )
                })()}

                <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
                    <h3 className="text-blue-400 font-semibold mb-3">💡 Review Tips</h3>
                    <ul className="text-slate-600  space-y-2">
                        <li>• Be constructive and specific in your feedback</li>
                        <li>• Use the assessment rubric as a guide for scoring</li>
                        <li>• Highlight both strengths and areas for improvement</li>
                        <li>• Consider the essay structure and arguments clearly</li>
                    </ul>
                </div>
            </main>
        </StudentLayout>
    )
}

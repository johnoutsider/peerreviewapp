'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import { DiscussionForum } from '@/components/DiscussionForum'
import { getStudentCompletedReviewCount } from '@/lib/peer-assignment'
import { PeerReviewAlias, buildPeerReviewAliases } from '@/lib/review-discussions'

type AccessState = 'loading' | 'ready' | 'not-found' | 'denied' | 'locked'

export default function DiscussionPage() {
    const params = useParams()
    const router = useRouter()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [peerReviews, setPeerReviews] = useState<PeerReviewAlias[]>([])
    const [accessState, setAccessState] = useState<AccessState>('loading')

    useEffect(() => {
        const fetchDiscussion = async () => {
            const currentUser = auth.currentUser
            if (!currentUser) {
                router.push('/')
                return
            }

            try {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(currentUser.uid)
                if (profile?.role === 'teacher') {
                    setAccessState('denied')
                    return
                }

                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (!essayDoc.exists()) {
                    setAccessState('not-found')
                    return
                }

                const essayData = { id: essayDoc.id, ...essayDoc.data() } as any
                const reviewsSnapshot = await getDocs(query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essayId)
                ))
                const aliasReviews = buildPeerReviewAliases(
                    reviewsSnapshot.docs.map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() })),
                    essayId
                )

                const isEssayOwner = essayData.studentId === currentUser.uid
                const isPeerReviewer = aliasReviews.some((review) => review.reviewerId === currentUser.uid)

                if (isEssayOwner && essayData.topicId) {
                    const completedReviewCount = await getStudentCompletedReviewCount(currentUser.uid, essayData.topicId)
                    if (completedReviewCount < 2) {
                        setEssay(essayData)
                        setPeerReviews(aliasReviews)
                        setAccessState('locked')
                        return
                    }
                } else if (!isEssayOwner && !isPeerReviewer) {
                    setAccessState('denied')
                    return
                }

                setEssay(essayData)
                setPeerReviews(aliasReviews)
                setAccessState('ready')
            } catch (error) {
                console.error('Error fetching discussion:', error)
                setAccessState('denied')
            }
        }

        fetchDiscussion()
    }, [essayId, router])

    if (accessState === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-11 w-11 border-b-2 border-blue-500" />
            </div>
        )
    }

    if (accessState === 'not-found') {
        return (
            <StudentLayout title="Peer Discussion">
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-5xl mb-4">?</div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Essay Not Found</h2>
                        <p className="text-slate-500 text-sm mb-6">The requested discussion could not be found.</p>
                        <Link href="/discussions" className="text-[#1a9aaa] hover:underline font-medium">
                            &larr; Back to Discussions
                        </Link>
                    </div>
                </main>
            </StudentLayout>
        )
    }

    if (accessState === 'locked') {
        return (
            <StudentLayout title="Peer Discussion">
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-10">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0">
                                !
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-slate-900 mb-2">Discussion Locked</h2>
                                <p className="text-slate-600 text-sm leading-relaxed mb-5">
                                    Complete two peer reviews in this topic first. Once your feedback is unlocked, you can open the peer discussion for this essay and respond to specific reviews.
                                </p>
                                <div className="flex flex-wrap items-center gap-4">
                                    <Link
                                        href="/review"
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                                        style={{ backgroundColor: '#1a9aaa' }}
                                    >
                                        Go Review Peers
                                    </Link>
                                    <Link href="/discussions" className="text-[#1a9aaa] hover:underline font-medium text-sm">
                                        Back to Discussions
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </StudentLayout>
        )
    }

    if (accessState === 'denied') {
        return (
            <StudentLayout title="Peer Discussion">
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-5xl mb-4">!</div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Denied</h2>
                        <p className="text-slate-500 text-sm mb-6">
                            You can only join discussions for essays you own after feedback unlocks, or essays you have already reviewed.
                        </p>
                        <Link href="/discussions" className="text-[#1a9aaa] hover:underline font-medium">
                            &larr; Back to Discussions
                        </Link>
                    </div>
                </main>
            </StudentLayout>
        )
    }

    return (
        <StudentLayout title="Peer Discussion">
            <DiscussionForum
                essayId={essayId}
                essayAuthorId={essay?.studentId || ''}
                essayTitle={essay?.title}
                essayContent={essay?.content}
                peerReviews={peerReviews}
            />
        </StudentLayout>
    )
}

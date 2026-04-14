'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import TeacherLayout from '@/components/TeacherLayout'
import { DiscussionForum } from '@/components/DiscussionForum'
import { PeerReviewAlias, buildPeerReviewAliases } from '@/lib/review-discussions'

type AccessState = 'loading' | 'ready' | 'not-found' | 'denied'

export default function DiscussionPage() {
    const params = useParams()
    const router = useRouter()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [peerReviews, setPeerReviews] = useState<PeerReviewAlias[]>([])
    const [accessState, setAccessState] = useState<AccessState>('loading')
    const [isTeacher, setIsTeacher] = useState(false)

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
                    setIsTeacher(true)
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
                    setEssay(essayData)
                    setPeerReviews(aliasReviews)
                    setAccessState('ready')
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

                if (!isEssayOwner && !isPeerReviewer) {
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

    const Layout = isTeacher
        ? ({ children }: { children: React.ReactNode }) => <TeacherLayout title="Peer Discussion">{children}</TeacherLayout>
        : ({ children }: { children: React.ReactNode }) => <StudentLayout title="Peer Discussion">{children}</StudentLayout>

    if (accessState === 'not-found') {
        return (
            <Layout>
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-5xl mb-4">?</div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Essay Not Found</h2>
                        <p className="text-slate-500 text-sm mb-6">The requested discussion could not be found.</p>
                        <Link href={isTeacher ? '/teacher/discussions' : '/discussions'} className="text-[#1a9aaa] hover:underline font-medium">
                            &larr; Back to Discussions
                        </Link>
                    </div>
                </main>
            </Layout>
        )
    }

    if (accessState === 'denied') {
        return (
            <Layout>
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-5xl mb-4">!</div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Access Denied</h2>
                        <p className="text-slate-500 text-sm mb-6">
                            You can only view discussions for essays you own or essays you have already reviewed.
                        </p>
                        <Link href="/discussions" className="text-[#1a9aaa] hover:underline font-medium">
                            &larr; Back to Discussions
                        </Link>
                    </div>
                </main>
            </Layout>
        )
    }

    return (
        <Layout>
            <DiscussionForum
                essayId={essayId}
                essayAuthorId={essay?.studentId || ''}
                essayTitle={essay?.title}
                essayContent={essay?.content}
                peerReviews={peerReviews}
            />
        </Layout>
    )
}

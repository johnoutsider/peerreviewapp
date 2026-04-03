'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import { getStudentCompletedReviewCount } from '@/lib/peer-assignment'
import { PeerReviewThreadSummary, buildPeerReviewAliases } from '@/lib/review-discussions'

interface DiscussionRow {
    essayId: string
    essayTitle: string | null
    essayTopic: string | null
    role: 'Author' | 'Reviewer' | 'Author + Reviewer'
    peerReviewCount: number
    lastActivityAt: any
    sortTime: number
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size))
    }
    return chunks
}

function formatActivityDate(value: any): string {
    if (!value?.toDate) return 'No discussion yet'
    return value.toDate().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function roleBadgeClass(role: DiscussionRow['role']): string {
    if (role === 'Author') return 'bg-amber-50 text-amber-700 border border-amber-200'
    if (role === 'Reviewer') return 'bg-blue-50 text-blue-700 border border-blue-200'
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
}

export default function DiscussionsPage() {
    const router = useRouter()
    const [rows, setRows] = useState<DiscussionRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const currentUser = auth.currentUser
            if (!currentUser) {
                router.push('/')
                return
            }

            try {
                const userReviewsSnap = await getDocs(query(
                    collection(db, 'reviews'),
                    where('reviewerId', '==', currentUser.uid)
                ))
                const currentUserReviews = userReviewsSnap.docs
                    .map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() } as any))
                    .filter((review) => review.reviewerRole !== 'teacher' && review.reviewerRole !== 'ai')

                const reviewedEssayIds = new Set(
                    currentUserReviews
                        .map((review) => review.essayId as string | undefined)
                        .filter((essayId): essayId is string => Boolean(essayId))
                )

                const ownEssaysSnap = await getDocs(query(
                    collection(db, 'essays'),
                    where('studentId', '==', currentUser.uid)
                ))
                const ownEssayDocs = ownEssaysSnap.docs.map((essayDoc) => ({
                    id: essayDoc.id,
                    ...essayDoc.data(),
                } as any))

                const unlockCountByTopic = new Map<string, number>()
                const accessibleOwnEssayIds = new Set<string>()

                for (const essay of ownEssayDocs) {
                    if (!essay.topicId) {
                        accessibleOwnEssayIds.add(essay.id)
                        continue
                    }

                    if (!unlockCountByTopic.has(essay.topicId)) {
                        unlockCountByTopic.set(
                            essay.topicId,
                            await getStudentCompletedReviewCount(currentUser.uid, essay.topicId)
                        )
                    }

                    if ((unlockCountByTopic.get(essay.topicId) ?? 0) >= 2) {
                        accessibleOwnEssayIds.add(essay.id)
                    }
                }

                const allEssayIds = [...new Set([...reviewedEssayIds, ...accessibleOwnEssayIds])]
                if (allEssayIds.length === 0) {
                    setRows([])
                    return
                }

                const essayMap = new Map<string, any>(ownEssayDocs.map((essay) => [essay.id, essay]))
                const missingEssayIds = allEssayIds.filter((essayId) => !essayMap.has(essayId))
                await Promise.all(
                    missingEssayIds.map(async (essayId) => {
                        const essayDoc = await getDoc(doc(db, 'essays', essayId))
                        if (essayDoc.exists()) {
                            essayMap.set(essayId, { id: essayDoc.id, ...essayDoc.data() })
                        }
                    })
                )

                const reviewsByEssay = new Map<string, any[]>()
                for (const essayIdChunk of chunk(allEssayIds, 10)) {
                    const reviewsSnap = await getDocs(query(
                        collection(db, 'reviews'),
                        where('essayId', 'in', essayIdChunk)
                    ))
                    reviewsSnap.docs.forEach((reviewDoc) => {
                        const review = { id: reviewDoc.id, ...reviewDoc.data() } as any
                        const existingReviews = reviewsByEssay.get(review.essayId) ?? []
                        existingReviews.push(review)
                        reviewsByEssay.set(review.essayId, existingReviews)
                    })
                }

                const threadsByEssay = new Map<string, PeerReviewThreadSummary[]>()
                for (const essayIdChunk of chunk(allEssayIds, 10)) {
                    const threadSnap = await getDocs(query(
                        collection(db, 'reviewDiscussionThreads'),
                        where('essayId', 'in', essayIdChunk)
                    ))
                    threadSnap.docs.forEach((threadDoc) => {
                        const thread = { id: threadDoc.id, ...threadDoc.data() } as PeerReviewThreadSummary
                        const existingThreads = threadsByEssay.get(thread.essayId) ?? []
                        existingThreads.push(thread)
                        threadsByEssay.set(thread.essayId, existingThreads)
                    })
                }

                const nextRows = allEssayIds.flatMap((essayId) => {
                    const essay = essayMap.get(essayId)
                    if (!essay) return []

                    const peerReviews = buildPeerReviewAliases(reviewsByEssay.get(essayId) ?? [], essayId)
                    if (peerReviews.length === 0) return []

                    const isAuthor = accessibleOwnEssayIds.has(essayId)
                    const isReviewer = reviewedEssayIds.has(essayId)
                    const role: DiscussionRow['role'] = isAuthor && isReviewer
                        ? 'Author + Reviewer'
                        : isAuthor
                            ? 'Author'
                            : 'Reviewer'

                    const essayThreads = threadsByEssay.get(essayId) ?? []
                    const lastActivityAt = essayThreads.reduce<any>((latest, thread) => {
                        if (!latest) return thread.lastCommentAt
                        const latestMillis = latest?.toMillis?.() ?? 0
                        const threadMillis = thread.lastCommentAt?.toMillis?.() ?? 0
                        return threadMillis > latestMillis ? thread.lastCommentAt : latest
                    }, null)
                    const fallbackSortTime = Math.max(
                        ...peerReviews.map((review) => review.submittedAt?.toMillis?.() ?? 0),
                        0
                    )

                    return [{
                        essayId,
                        essayTitle: essay.title ?? null,
                        essayTopic: essay.topicName ?? null,
                        role,
                        peerReviewCount: peerReviews.length,
                        lastActivityAt,
                        sortTime: lastActivityAt?.toMillis?.() ?? fallbackSortTime,
                    }]
                })

                nextRows.sort((left, right) => right.sortTime - left.sortTime)
                setRows(nextRows)
            } catch (error) {
                console.error('Error loading discussions:', error)
                setRows([])
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
        )
    }

    return (
        <StudentLayout title="Discussions">
            <main className="container mx-auto px-4 py-8 max-w-5xl">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Discussions</h1>
                    <p className="text-slate-500">
                        Open an essay discussion and choose which anonymous peer review you want to discuss.
                    </p>
                </div>

                <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
                    <span className="text-blue-500 mt-0.5 shrink-0">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                    <p className="text-blue-700 text-sm leading-relaxed">
                        <span className="font-semibold">Anonymity is maintained.</span> Reviewers are shown only as Reviewer 1, Reviewer 2, and so on by submission order.
                    </p>
                </div>

                {rows.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                        <div className="text-6xl mb-4">...</div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">No Discussions Available Yet</h3>
                        <p className="text-slate-500 text-sm">
                            Discussions appear after peer reviews are submitted and unlocked for the essay owner.
                        </p>
                        <Link
                            href="/review"
                            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                            style={{ backgroundColor: '#1a9aaa' }}
                        >
                            Go Review Peers
                        </Link>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50">
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500 w-10">#</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Role</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Topic</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Essay Title</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500 text-center">Peer Reviews</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Last Activity</th>
                                        <th className="py-3 px-4 text-xs font-semibold uppercase tracking-widest text-slate-500"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => (
                                        <tr key={row.essayId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                                            <td className="py-4 px-4">
                                                <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                                                    {index + 1}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${roleBadgeClass(row.role)}`}>
                                                    {row.role}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                {row.essayTopic ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                        {row.essayTopic}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 text-sm">-</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 max-w-xs">
                                                <span className="text-slate-800 text-sm font-medium line-clamp-2 leading-snug">
                                                    {row.essayTitle ?? <span className="text-slate-400 italic">Untitled</span>}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-center">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                                    {row.peerReviewCount}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="text-slate-500 text-sm">{formatActivityDate(row.lastActivityAt)}</span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <Link
                                                    href={`/discussion/${row.essayId}`}
                                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors whitespace-nowrap"
                                                    style={{ backgroundColor: '#1a9aaa' }}
                                                >
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 shrink-0">
                                                        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                    Open Discussion
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </StudentLayout>
    )
}

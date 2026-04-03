import { db } from './firebase'
import {
    Timestamp,
    addDoc,
    collection,
    doc,
    increment,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    where,
} from 'firebase/firestore'

interface RawReview {
    id: string
    reviewerId?: string
    reviewerRole?: string | null
    feedback?: string
    completedAt?: Timestamp | null
}

export interface PeerReviewAlias {
    reviewId: string
    reviewerId: string
    label: string
    feedback: string
    submittedAt: Timestamp | null
    firstCompletedAt: Timestamp | null
    threadId: string
}

export interface PeerReviewThreadSummary {
    id: string
    essayId: string
    reviewerId: string
    createdAt: Timestamp | null
    lastCommentAt: Timestamp | null
    commentCount: number
}

export interface PeerReviewDiscussionComment {
    id: string
    essayId: string
    reviewerId: string
    authorId: string
    text: string
    createdAt: Timestamp | null
}

export interface LegacyEssayDiscussionComment {
    id: string
    authorId?: string
    text: string
    createdAt: Timestamp | null
}

function getTimestampMillis(value: Timestamp | null | undefined): number {
    return value?.toMillis?.() ?? 0
}

export function getReviewDiscussionThreadId(essayId: string, reviewerId: string): string {
    return `${essayId}__${reviewerId}`
}

export function buildPeerReviewAliases(reviews: RawReview[], essayId: string): PeerReviewAlias[] {
    const grouped = new Map<string, {
        reviewerId: string
        earliestAt: Timestamp | null
        latestReview: RawReview
    }>()

    reviews.forEach((review) => {
        if (!review.reviewerId) return
        if (review.reviewerRole === 'teacher' || review.reviewerRole === 'ai') return

        const existing = grouped.get(review.reviewerId)
        if (!existing) {
            grouped.set(review.reviewerId, {
                reviewerId: review.reviewerId,
                earliestAt: review.completedAt ?? null,
                latestReview: review,
            })
            return
        }

        if (getTimestampMillis(review.completedAt) < getTimestampMillis(existing.earliestAt) || !existing.earliestAt) {
            existing.earliestAt = review.completedAt ?? existing.earliestAt
        }

        if (getTimestampMillis(review.completedAt) >= getTimestampMillis(existing.latestReview.completedAt)) {
            existing.latestReview = review
        }
    })

    return Array.from(grouped.values())
        .sort((left, right) => {
            const timeDiff = getTimestampMillis(left.earliestAt) - getTimestampMillis(right.earliestAt)
            if (timeDiff !== 0) return timeDiff
            return left.reviewerId.localeCompare(right.reviewerId)
        })
        .map((entry, index) => ({
            reviewId: entry.latestReview.id,
            reviewerId: entry.reviewerId,
            label: `Reviewer ${index + 1}`,
            feedback: entry.latestReview.feedback ?? '',
            submittedAt: entry.latestReview.completedAt ?? null,
            firstCompletedAt: entry.earliestAt,
            threadId: getReviewDiscussionThreadId(essayId, entry.reviewerId),
        }))
}

export function getDiscussionParticipantLabel(
    authorId: string | undefined,
    essayAuthorId: string,
    peerReviews: PeerReviewAlias[],
    fallbackLabel = 'Participant'
): string {
    if (!authorId) return fallbackLabel
    if (authorId === essayAuthorId) return 'Essay Author'

    const reviewer = peerReviews.find((review) => review.reviewerId === authorId)
    return reviewer?.label ?? fallbackLabel
}

export function subscribeToReviewThreadSummaries(
    essayId: string,
    onChange: (threads: PeerReviewThreadSummary[]) => void
): () => void {
    const threadQuery = query(
        collection(db, 'reviewDiscussionThreads'),
        where('essayId', '==', essayId)
    )

    return onSnapshot(threadQuery, (snapshot) => {
        onChange(snapshot.docs.map((threadDoc) => ({
            id: threadDoc.id,
            ...(threadDoc.data() as Omit<PeerReviewThreadSummary, 'id'>),
        })))
    })
}

export function subscribeToReviewDiscussionComments(
    essayId: string,
    reviewerId: string,
    onChange: (comments: PeerReviewDiscussionComment[]) => void
): () => void {
    const commentsQuery = query(
        collection(db, 'reviewDiscussionThreads', getReviewDiscussionThreadId(essayId, reviewerId), 'comments'),
        orderBy('createdAt', 'asc')
    )

    return onSnapshot(commentsQuery, (snapshot) => {
        onChange(snapshot.docs.map((commentDoc) => ({
            id: commentDoc.id,
            ...(commentDoc.data() as Omit<PeerReviewDiscussionComment, 'id'>),
        })))
    })
}

export function subscribeToLegacyEssayDiscussion(
    essayId: string,
    onChange: (comments: LegacyEssayDiscussionComment[]) => void
): () => void {
    const legacyQuery = query(
        collection(db, 'essays', essayId, 'discussion'),
        orderBy('createdAt', 'asc')
    )

    return onSnapshot(legacyQuery, (snapshot) => {
        onChange(snapshot.docs.map((commentDoc) => ({
            id: commentDoc.id,
            ...(commentDoc.data() as Omit<LegacyEssayDiscussionComment, 'id'>),
        })))
    })
}

export async function postReviewDiscussionComment(input: {
    essayId: string
    reviewerId: string
    authorId: string
    text: string
}): Promise<void> {
    const trimmedText = input.text.trim()
    if (!trimmedText) return

    const threadId = getReviewDiscussionThreadId(input.essayId, input.reviewerId)
    const threadRef = doc(db, 'reviewDiscussionThreads', threadId)
    const commentsRef = collection(db, 'reviewDiscussionThreads', threadId, 'comments')

    await runTransaction(db, async (transaction) => {
        const existingThread = await transaction.get(threadRef)
        const newCommentRef = doc(commentsRef)

        if (existingThread.exists()) {
            transaction.update(threadRef, {
                lastCommentAt: serverTimestamp(),
                commentCount: increment(1),
            })
        } else {
            transaction.set(threadRef, {
                essayId: input.essayId,
                reviewerId: input.reviewerId,
                createdAt: serverTimestamp(),
                lastCommentAt: serverTimestamp(),
                commentCount: 1,
            })
        }

        transaction.set(newCommentRef, {
            essayId: input.essayId,
            reviewerId: input.reviewerId,
            authorId: input.authorId,
            text: trimmedText,
            createdAt: serverTimestamp(),
        })
    })
}

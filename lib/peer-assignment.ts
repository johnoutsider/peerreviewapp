import { db } from './firebase'
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, limit } from 'firebase/firestore'

/**
 * Assigns up to 3 peer reviewers to an essay on submission.
 *
 * Strict rules:
 * - Reviewers must be students in the same class.
 * - Reviewers must have already submitted at least one essay for the SAME topic.
 * - If no eligible same-topic classmates exist, no peer reviewers are assigned
 *   (teacher / future peers can still review later).
 */
export async function assignPeerReviewers(
    essayId: string,
    authorId: string,
    classId: string,
    topicId: string
): Promise<string[]> {
    try {
        const usersRef = collection(db, 'users')
        const usersSnap = await getDocs(
            query(usersRef, where('classId', '==', classId), where('role', '==', 'student'))
        )

        // Find which classmates have submitted at least one essay for this topic
        const essaysSnap = await getDocs(
            query(collection(db, 'essays'), where('topicId', '==', topicId))
        )
        const topicSubmitters = new Set<string>()
        essaysSnap.docs.forEach(d => {
            const data = d.data() as any
            if (data.studentId) topicSubmitters.add(data.studentId)
        })

        const potentialReviewers = usersSnap.docs
            .filter(d => d.id !== authorId && topicSubmitters.has(d.id))
            .map(d => d.id)

        if (potentialReviewers.length === 0) return []

        // Simple random selection among eligible classmates
        const shuffled = potentialReviewers.sort(() => Math.random() - 0.5)
        const selected = shuffled.slice(0, Math.min(3, shuffled.length))

        await updateDoc(doc(db, 'essays', essayId), { peerReviewIds: selected })
        return selected
    } catch (error) {
        console.error('Peer assignment error:', error)
        return []
    }
}

/**
 * Finds an available same-topic essay for the student to review.
 *
 * Rules:
 * 1. Essay must be in the SAME TOPIC as the one the reviewer submitted
 * 2. Not the reviewer's own essay
 * 3. Reviewer hasn't already been assigned to it
 * 4. Prioritises essays with fewer reviewers
 *
 * If no topicId is given (student hasn't submitted yet), returns null.
 */
export async function claimEssayForReview(
    reviewerId: string,
    classId: string,
    topicId: string        // Required: enforce same-topic matching
): Promise<string | null> {
    try {
        // Reviewer must have submitted at least one essay for this topic
        const hasSubmitted = await hasSubmittedTopic(reviewerId, topicId)
        if (!hasSubmitted) {
            return null
        }

        const essaysRef = collection(db, 'essays')
        const q = query(essaysRef, where('status', '==', 'under_review'))
        const snapshot = await getDocs(q)

        const candidates = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }) as any)
            .filter(data => {
                const existingReviewers: string[] = data.peerReviewIds || []
                const topicMatch = data.topicId === topicId

                return (
                    data.studentId !== reviewerId &&          // not own essay
                    !existingReviewers.includes(reviewerId) && // not already assigned
                    topicMatch                                  // same topic (enforced)
                )
            })

        if (candidates.length === 0) return null

        // Prioritise essays with fewest reviewers
        candidates.sort((a, b) => (a.peerReviewIds?.length || 0) - (b.peerReviewIds?.length || 0))
        const selected = candidates[0]

        await updateDoc(doc(db, 'essays', selected.id), {
            peerReviewIds: arrayUnion(reviewerId),
        })

        return selected.id
    } catch (error) {
        console.error('Claim essay error:', error)
        return null
    }
}

/**
 * Returns an array of unique topic IDs the student has submitted essays for.
 * Used to enforce that students can only review topics they have participated in.
 */
export async function getStudentSubmittedTopicIds(studentId: string): Promise<string[]> {
    try {
        const snap = await getDocs(
            query(collection(db, 'essays'), where('studentId', '==', studentId))
        )
        if (snap.empty) return []

        const topics = new Set<string>()
        snap.docs.forEach(d => {
            const data = d.data() as any
            if (data.topicId) topics.add(data.topicId)
        })

        return Array.from(topics)
    } catch (error) {
        console.error('getStudentSubmittedTopicIds error:', error)
        return []
    }
}

/**
 * Returns the number of reviews a student has completed for a specific topic.
 */
export async function getStudentCompletedReviewCount(studentId: string, topicId: string): Promise<number> {
    try {
        // 1. Get all essays for this topic
        const essaysSnap = await getDocs(
            query(collection(db, 'essays'), where('topicId', '==', topicId))
        )
        const topicEssayIds = essaysSnap.docs.map(d => d.id)

        if (topicEssayIds.length === 0) return 0

        // 2. Get reviews by this student for any of those essays
        // Note: Firestore 'in' query limited to 10. If more essays exist, we chunk.
        let count = 0
        for (let i = 0; i < topicEssayIds.length; i += 10) {
            const chunk = topicEssayIds.slice(i, i + 10)
            const reviewsSnap = await getDocs(
                query(
                    collection(db, 'reviews'),
                    where('reviewerId', '==', studentId),
                    where('essayId', 'in', chunk)
                )
            )
            count += reviewsSnap.size
        }

        return count
    } catch (error) {
        console.error('getStudentCompletedReviewCount error:', error)
        return 0
    }
}

/**
 * Checks if a student has submitted an essay for a specific topic.
 */
export async function hasSubmittedTopic(studentId: string, topicId: string): Promise<boolean> {
    try {
        const snap = await getDocs(
            query(
                collection(db, 'essays'),
                where('studentId', '==', studentId),
                where('topicId', '==', topicId),
                limit(1)
            )
        )
        return !snap.empty
    } catch (error) {
        console.error('hasSubmittedTopic error:', error)
        return false
    }
}

/**
 * Gets essays assigned to a specific reviewer.
 */
export async function getAssignedEssays(reviewerId: string) {
    try {
        const snap = await getDocs(
            query(collection(db, 'essays'), where('peerReviewIds', 'array-contains', reviewerId))
        )
        return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (error) {
        console.error('Get assigned essays error:', error)
        return []
    }
}

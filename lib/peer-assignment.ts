import { db } from './firebase'
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore'

/**
 * Assigns up to 3 same-topic peer reviewers to an essay on submission.
 * Falls back to any-topic if not enough same-topic students exist.
 */
export async function assignPeerReviewers(
    essayId: string,
    authorId: string,
    classId: string,
    topicId?: string
): Promise<string[]> {
    try {
        const usersRef = collection(db, 'users')
        const q = query(usersRef, where('classId', '==', classId), where('role', '==', 'student'))
        const snapshot = await getDocs(q)

        const potentialReviewers = snapshot.docs
            .filter(d => d.id !== authorId)
            .map(d => d.id)

        if (potentialReviewers.length === 0) return []

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
    topicId?: string        // If provided, enforces same-topic matching
): Promise<string | null> {
    try {
        const essaysRef = collection(db, 'essays')
        const q = query(essaysRef, where('status', '==', 'under_review'))
        const snapshot = await getDocs(q)

        const candidates = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }) as any)
            .filter(data => {
                const existingReviewers: string[] = data.peerReviewIds || []
                const topicMatch = topicId ? data.topicId === topicId : true

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

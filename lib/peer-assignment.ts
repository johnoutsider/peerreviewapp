import { db } from './firebase'
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'

/**
 * Assigns 3 random peer reviewers to an essay
 * Ensures no self-review and fair distribution
 */
export async function assignPeerReviewers(
    essayId: string,
    authorId: string,
    classId: string
): Promise<string[]> {
    try {
        // Get all students in the same class (excluding essay author)
        const usersRef = collection(db, 'users')
        const q = query(
            usersRef,
            where('classId', '==', classId),
            where('role', '==', 'student')
        )
        const snapshot = await getDocs(q)

        const potentialReviewers = snapshot.docs
            .filter(doc => doc.id !== authorId)
            .map(doc => doc.id)

        // Handle edge case: not enough students
        if (potentialReviewers.length < 3) {
            console.warn(`Not enough students in class ${classId} for peer review`)
            return potentialReviewers
        }

        // Randomly select 3 reviewers
        const shuffled = potentialReviewers.sort(() => Math.random() - 0.5)
        const selectedReviewers = shuffled.slice(0, 3)

        // Update essay document with reviewer IDs
        await updateDoc(doc(db, 'essays', essayId), {
            peerReviewIds: selectedReviewers,
        })

        return selectedReviewers
    } catch (error) {
        console.error('Peer assignment error:', error)
        return []
    }
}

/**
 * Finds an available essay for the user to review
 * (Pull mechanism to fix 'early submission' issue)
 */
export async function claimEssayForReview(reviewerId: string, classId: string): Promise<boolean> {
    try {
        // Get all essays under review
        const essaysRef = collection(db, 'essays')
        const q = query(
            essaysRef,
            where('status', '==', 'under_review')
            // Can't filter by array-contains-not in Firestore easily
            // So we filter in memory
        )
        const snapshot = await getDocs(q)

        // Find all candidate essays
        const candidates = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }) as any).filter((data) => {
            const existingReviewers = data.peerReviewIds || []

            // Criteria:
            // 1. Not my own essay
            // 2. I haven't been assigned it yet
            // 3. Needs more reviews (less than 3)
            return data.studentId !== reviewerId &&
                !existingReviewers.includes(reviewerId) &&
                existingReviewers.length < 3
        })

        if (candidates.length > 0) {
            // Sort by number of reviews (ascending) to prioritize least reviewed essays
            candidates.sort((a, b) => {
                return (a.peerReviewIds?.length || 0) - (b.peerReviewIds?.length || 0)
            })

            const selected = candidates[0]

            // Assign it
            const existingReviewers = selected.peerReviewIds || []
            await updateDoc(doc(db, 'essays', selected.id), {
                peerReviewIds: [...existingReviewers, reviewerId]
            })
            return true // Found and assigned
        }

        return false // No essays available
    } catch (error) {
        console.error('Claim essay error:', error)
        return false
    }
}

/**
 * Gets essays assigned to a specific reviewer
 */
export async function getAssignedEssays(reviewerId: string) {
    try {
        const essaysRef = collection(db, 'essays')
        const q = query(essaysRef, where('peerReviewIds', 'array-contains', reviewerId))
        const snapshot = await getDocs(q)

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }))
    } catch (error) {
        console.error('Get assigned essays error:', error)
        return []
    }
}

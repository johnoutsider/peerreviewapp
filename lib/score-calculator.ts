export interface Review {
    id: string
    essayId: string
    reviewerId: string
    reviewerName: string
    scores: {
        taskAchievement: number
        coherenceCohesion: number
        lexicalResource: number
        grammaticalRange: number
    }
    feedback: string
    completedAt: Date
}

export interface AIAssessment {
    taskAchievement: number
    coherenceCohesion: number
    lexicalResource: number
    grammaticalRange: number
    overallBand: number
    feedback: string
}

export function calculateFinalScores(
    peerReviews: Review[]
): {
    finalScores: {
        taskAchievement: number
        coherenceCohesion: number
        lexicalResource: number
        grammaticalRange: number
    }
    overallBand: number
} {
    // Weight: 100% peer reviews
    // Average score across all reviews

    const criteria = ['taskAchievement', 'coherenceCohesion', 'lexicalResource', 'grammaticalRange'] as const
    const finalScores: any = {}

    if (peerReviews.length === 0) {
        return {
            finalScores: {
                taskAchievement: 0,
                coherenceCohesion: 0,
                lexicalResource: 0,
                grammaticalRange: 0
            },
            overallBand: 0
        }
    }

    for (const criterion of criteria) {
        let total = 0

        for (const review of peerReviews) {
            total += review.scores[criterion]
        }

        // Average and round to nearest 0.5
        const average = total / peerReviews.length
        finalScores[criterion] = Math.round(average * 2) / 2
    }

    // Calculate overall band (average of all criteria)
    const average = criteria.reduce((sum, c) => sum + finalScores[c], 0) / criteria.length
    const overallBand = Math.round(average * 2) / 2

    return { finalScores, overallBand }
}

export function getScoreColor(score: number): string {
    if (score >= 7) return 'text-green-500'
    if (score >= 5.5) return 'text-yellow-500'
    return 'text-red-500'
}

export function getScoreLabel(score: number): string {
    if (score >= 8) return 'Excellent'
    if (score >= 7) return 'Good'
    if (score >= 6) return 'Competent'
    if (score >= 5) return 'Modest'
    return 'Limited'
}

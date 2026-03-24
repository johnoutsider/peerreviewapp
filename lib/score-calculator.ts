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
        const average = total / peerReviews.length
        finalScores[criterion] = Math.round(average * 2) / 2
    }

    const average = criteria.reduce((sum, c) => sum + finalScores[c], 0) / criteria.length
    const overallBand = Math.round(average * 2) / 2

    return { finalScores, overallBand }
}

// ─── New rubric (5-category, /100) helpers ──────────────────────────────────

/** Returns true when a scores object comes from the new 5-category rubric */
export function isNewRubric(scores: Record<string, any>): boolean {
    return scores != null && 'content' in scores
}

/** Sum all 5-category scores → value out of 100 */
export function getScore100(scores: Record<string, any>): number {
    if (!scores) return 0
    const keys = ['content', 'organization', 'vocabulary', 'languageUse', 'mechanics']
    return keys.reduce((sum, k) => {
        const raw = scores[k]
        if (typeof raw === 'number') return sum + raw
        // Handle range strings like "27-30" → take the highest number
        const nums = String(raw ?? '').split(/[-\u2013]/).map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n))
        return sum + (nums.length ? Math.max(...nums) : 0)
    }, 0)
}

/** Returns a /100 score for either rubric format.
 *  New rubric: sums the 5 category scores (already /100).
 *  Old IELTS:  averages the 4 band scores (0-9) then maps to 0-100. */
export function getUniversalScore100(scores: Record<string, any>): number {
    if (!scores) return 0
    if (isNewRubric(scores)) return getScore100(scores)
    const keys = ['taskAchievement', 'coherenceCohesion', 'lexicalResource', 'grammaticalRange'] as const
    const values = keys.map(k => (typeof scores[k] === 'number' ? scores[k] : 0))
    const avg = values.reduce((a, b) => a + b, 0) / keys.length
    return Math.round((avg / 9) * 100)
}

/** Averages getUniversalScore100 across multiple reviews. Returns null if no reviews have scores. */
export function getAverageScore100(reviews: Array<{ scores?: Record<string, any> }>): number | null {
    const valid = reviews.filter(r => r.scores != null)
    if (valid.length === 0) return null
    const total = valid.reduce((sum, r) => sum + getUniversalScore100(r.scores!), 0)
    return Math.round(total / valid.length)
}

export function getScore100Color(score: number): string {
    if (score >= 80) return 'text-green-500'
    if (score >= 65) return 'text-yellow-500'
    if (score >= 50) return 'text-amber-500'
    return 'text-red-500'
}

export function getScore100Label(score: number): string {
    if (score >= 85) return 'Excellent'
    if (score >= 70) return 'Good'
    if (score >= 55) return 'Satisfactory'
    if (score >= 40) return 'Needs Work'
    return 'Limited'
}

// ─── Legacy IELTS (band 0-9) helpers ────────────────────────────────────────

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

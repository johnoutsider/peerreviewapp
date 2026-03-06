'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import {
    collection, query, where, getDocs, deleteDoc,
    doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'

// ─── Rubric Aspects ───────────────────────────────────────────────────────────
const ASPECTS = [
    { id: 'content', title: 'Content', max: 30 },
    { id: 'organization', title: 'Organization', max: 20 },
    { id: 'vocabulary', title: 'Vocabulary', max: 20 },
    { id: 'languageUse', title: 'Language Use', max: 25 },
    { id: 'mechanics', title: 'Mechanics', max: 5 },
]
const MAX_TOTAL = ASPECTS.reduce((a, b) => a + b.max, 0)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const avg = (nums: number[]) =>
    nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0

// Sum all numeric values in a scores object (handles both string and numeric keys)
function totalScore(scores: Record<string, any>): number {
    if (!scores || typeof scores !== 'object') return 0
    return Object.values(scores).reduce((sum: number, v: any) => {
        const n = typeof v === 'number' ? v : parseInt(String(v).split('–').pop() ?? '0', 10)
        return sum + (isNaN(n) ? 0 : n)
    }, 0)
}

// Get score for a specific aspect key, trying both string and numeric keys
function getAspectScore(scores: Record<string, any>, id: string, index: number): number {
    if (!scores) return 0
    // Try string key first (new rubric), then numeric index (old rubric)
    const raw = scores[id] ?? scores[index + 1] ?? 0
    if (typeof raw === 'number') return raw
    // Range string like "27–30" → take highest number
    const nums = String(raw).split('–').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n))
    return nums.length ? Math.max(...nums) : 0
}

const pct = (score: number) => Math.round((score / MAX_TOTAL) * 100)

function scoreColor(p: number) {
    if (p >= 80) return 'text-green-600 '
    if (p >= 65) return 'text-blue-600 '
    if (p >= 50) return 'text-amber-600 '
    return 'text-red-600 '
}
function scoreColorHex(p: number) {
    if (p >= 80) return '#16a34a'
    if (p >= 65) return '#2563eb'
    if (p >= 50) return '#d97706'
    return '#dc2626'
}
function scoreBadge(p: number) {
    if (p >= 80) return 'Excellent'
    if (p >= 65) return 'Good'
    if (p >= 50) return 'Satisfactory'
    return 'Needs Work'
}

const STAR_LABELS = ['', 'Not Helpful', 'Slightly Helpful', 'Helpful', 'Very Helpful', 'Extremely Helpful']

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReviewData {
    id: string
    reviewerName: string
    reviewerIndex?: number
    completedAt: any
    scores: Record<string, any>
    feedback: string
    studentRating: number | null
    studentResponse: string
}

interface EssayData {
    id: string
    title: string
    content: string
    topicName: string
    topicId?: string
    submittedAt: any
    reviews: ReviewData[]
    wordCount: number
    status?: string
}

// ─── Star Rating ──────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
    const [hovered, setHovered] = useState<number | null>(null)
    const display = hovered ?? value ?? 0
    return (
        <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star === value ? null : star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(null)}
                    className={`text-2xl leading-none transition-transform ${star <= display ? 'text-amber-400 scale-110' : 'text-slate-300 '}`}
                >★</button>
            ))}
            {(hovered || value) && (
                <span className="text-xs text-slate-500  ml-1">{STAR_LABELS[hovered ?? value ?? 0]}</span>
            )}
        </div>
    )
}

// ─── Aspect Score Bar ─────────────────────────────────────────────────────────
function AspectBar({ title, score, max }: { title: string; score: number; max: number }) {
    const p = Math.round((score / max) * 100)
    return (
        <div className="mb-2">
            <div className="flex justify-between mb-1">
                <span className="text-xs text-slate-500  font-semibold">{title}</span>
                <span className="text-xs font-bold text-slate-700 ">{score}<span className="text-slate-400  font-normal">/{max}</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100  overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${p}%`, background: scoreColorHex(p) }}
                />
            </div>
        </div>
    )
}

// ─── Single Review Card ───────────────────────────────────────────────────────
function ReviewCard({
    review, onSave,
}: {
    review: ReviewData
    onSave: (updates: { studentRating?: number | null; studentResponse?: string }) => Promise<void>
}) {
    const [expanded, setExpanded] = useState(false)
    const [rating, setRating] = useState<number | null>(review.studentRating ?? null)
    const [response, setResponse] = useState(review.studentResponse ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(!!(review.studentRating || review.studentResponse?.trim()))

    const total = totalScore(review.scores)
    const p = pct(total)
    const wordCount = response.trim() === '' ? 0 : response.trim().split(/\s+/).length
    const canSubmit = wordCount >= 10 || rating !== null

    const handleSave = async () => {
        if (!canSubmit) return
        setSaving(true)
        try {
            await onSave({ studentRating: rating, studentResponse: response })
            setSaved(true)
        } finally {
            setSaving(false)
        }
    }

    const dateStr = review.completedAt?.toDate
        ? review.completedAt.toDate().toLocaleDateString()
        : review.completedAt?.seconds
            ? new Date(review.completedAt.seconds * 1000).toLocaleDateString()
            : '—'

    return (
        <div className="border border-slate-200  rounded-xl overflow-hidden bg-white  mb-3 shadow-sm">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 ">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100  flex items-center justify-center text-sm font-bold text-blue-700  shrink-0">
                        {review.reviewerIndex}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900 ">Reviewer {review.reviewerIndex}</p>
                        <p className="text-xs text-slate-400 ">{dateStr}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <span className={`text-xl font-extrabold ${scoreColor(p)}`}>{total}</span>
                        <span className="text-xs text-slate-400 ">/{MAX_TOTAL}</span>
                        <span className={`block text-xs font-bold uppercase tracking-wide ${scoreColor(p)}`}>{scoreBadge(p)}</span>
                    </div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="bg-slate-50  border border-slate-200  rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600  flex items-center gap-1.5 hover:bg-slate-100 :bg-slate-600 transition-colors"
                    >
                        {expanded ? 'Hide' : 'View'} Details
                        <span className={`transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                </div>
            </div>

            {expanded && (
                <div>
                    {/* Score breakdown */}
                    <div className="px-4 py-3 border-b border-slate-100  bg-slate-50 ">
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-2">Score Breakdown</p>
                        {ASPECTS.map((a, i) => (
                            <AspectBar key={a.id} title={a.title} score={getAspectScore(review.scores, a.id, i)} max={a.max} />
                        ))}
                    </div>

                    {/* Comment */}
                    <div className="px-4 py-3 border-b border-slate-100 ">
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-2">Reviewer's Comment</p>
                        <p className="text-sm text-slate-700  leading-relaxed bg-slate-50  px-4 py-3 rounded-lg border-l-4 border-blue-500">
                            {review.feedback || 'No written comment provided.'}
                        </p>
                    </div>

                    {/* Rate this review */}
                    <div className="px-4 py-3 border-b border-slate-100 ">
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Rate This Review</p>
                        <p className="text-xs text-slate-500  mb-2">How helpful was this peer review to you?</p>
                        <StarRating value={rating} onChange={setRating} />
                        {saved && rating && (
                            <p className="text-xs text-green-600  font-semibold mt-1.5">✓ You rated this {rating} star{rating !== 1 ? 's' : ''}</p>
                        )}
                    </div>

                    {/* Justification */}
                    <div className="px-4 py-3">
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Your Response</p>
                        <p className="text-xs text-slate-500  mb-2">Do you agree or disagree with this feedback? Explain your reasoning.</p>

                        {saved && response.trim() && !saving ? (
                            <div>
                                <div className="bg-green-50  border border-green-200  rounded-lg px-4 py-3 mb-2">
                                    <p className="text-sm text-green-800  leading-relaxed">{response}</p>
                                </div>
                                <button
                                    onClick={() => setSaved(false)}
                                    className="text-xs text-blue-600  font-semibold hover:underline"
                                >Edit Response</button>
                            </div>
                        ) : (
                            <>
                                <textarea
                                    value={response}
                                    onChange={e => { setResponse(e.target.value); setSaved(false) }}
                                    placeholder="Write at least 10 words. For example: I agree with the feedback about transitions. However, I believe my conclusion does summarise new insights because..."
                                    rows={4}
                                    className="w-full bg-slate-50  border border-slate-200  text-slate-900  rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-vertical placeholder:text-slate-400 :text-slate-500"
                                />
                                <div className="flex items-center justify-between mt-2">
                                    <span className={`text-xs ${canSubmit ? 'text-slate-400 ' : 'text-red-500 '}`}>
                                        {wordCount} word{wordCount !== 1 ? 's' : ''}
                                        {wordCount > 0 && wordCount < 10 && ` · ${10 - wordCount} more needed`}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {saved && <span className="text-xs text-green-600  font-semibold">✓ Saved</span>}
                                        <button
                                            onClick={handleSave}
                                            disabled={!canSubmit || saving}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${canSubmit && !saving ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-100  text-slate-400  cursor-not-allowed'}`}
                                        >
                                            {saving ? 'Saving…' : 'Save Response'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Essay Detail View ────────────────────────────────────────────────────────
function EssayDetail({
    essay, onBack, onSaveReview, onDeleteClick,
}: {
    essay: EssayData
    onBack: () => void
    onSaveReview: (essayId: string, reviewId: string, updates: any) => Promise<void>
    onDeleteClick: (essayId: string) => void
}) {
    const allScores = essay.reviews.map(r => totalScore(r.scores))
    const avgScore = avg(allScores)
    const avgPct = pct(avgScore)
    const reviewCount = essay.reviews.length

    return (
        <div className="max-w-3xl mx-auto px-4 pb-12">
            <div className="flex items-center justify-between pt-5 pb-4">
                <button onClick={onBack} className="flex items-center gap-1.5 text-blue-600  font-semibold text-sm hover:underline">
                    ← Back to My Essays
                </button>
                {reviewCount === 0 && essay.status !== 'pending_teacher_approval' && (
                    <button
                        onClick={() => onDeleteClick(essay.id)}
                        className="flex items-center gap-1.5 text-red-500 hover:text-red-700 bg-red-50  px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border border-red-100 "
                    >
                        🗑️ Delete Essay
                    </button>
                )}
            </div>

            {/* Essay header */}
            <div className="bg-white  border border-slate-200  rounded-xl p-5 mb-5 shadow-sm">
                <div className="flex justify-between items-start flex-wrap gap-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">{essay.topicName || 'Essay'}</p>
                        <h2 className="text-xl font-extrabold text-slate-900  mb-3 leading-snug">{essay.title}</h2>
                        <div className="flex gap-4 flex-wrap text-xs text-slate-500 ">
                            <span>📅 {essay.submittedAt?.toDate ? essay.submittedAt.toDate().toLocaleDateString() : '—'}</span>
                            <span>📝 {essay.wordCount} words</span>
                            <span>💬 {reviewCount} review{reviewCount !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    {reviewCount > 0 && (
                        <div className="text-center bg-slate-50  border border-slate-200  rounded-xl px-5 py-3 shrink-0">
                            <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Avg Score</p>
                            <p className={`text-4xl font-black leading-none ${scoreColor(avgPct)}`}>{avgScore}</p>
                            <p className="text-xs text-slate-400  mt-0.5">out of {MAX_TOTAL}</p>
                            <span className={`mt-2 inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${scoreColor(avgPct)} bg-current/10`}
                                style={{ background: scoreColorHex(avgPct) + '18' }}>
                                {scoreBadge(avgPct)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Aspect averages */}
                {reviewCount > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 ">
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-3">Average Scores by Aspect</p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {ASPECTS.map((a, i) => {
                                const avgA = avg(essay.reviews.map(r => getAspectScore(r.scores, a.id, i)))
                                const ap = Math.round((avgA / a.max) * 100)
                                return (
                                    <div key={a.id} className="bg-slate-50  rounded-lg p-3 border border-slate-100  text-center">
                                        <p className="text-xs text-slate-500  font-semibold mb-1">{a.title}</p>
                                        <p className={`text-lg font-extrabold ${scoreColor(ap)}`}>{avgA}<span className="text-xs text-slate-400  font-normal">/{a.max}</span></p>
                                        <div className="mt-1.5 h-1 rounded-full bg-slate-200 ">
                                            <div className="h-full rounded-full" style={{ width: `${ap}%`, background: scoreColorHex(ap) }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Essay Content */}
            <div className="bg-white  border border-slate-200  rounded-xl p-5 mb-5 shadow-sm">
                <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-3">Your Essay</p>
                <div className="bg-slate-50  rounded-lg p-4 text-slate-700  whitespace-pre-wrap text-sm leading-relaxed border border-slate-100 ">
                    {essay.content}
                </div>
            </div>

            {/* Reviews */}
            {essay.status === 'pending_teacher_approval' ? (
                <div className="text-center py-10 text-amber-600 ">
                    <p className="text-4xl mb-3">⏳</p>
                    <p className="text-sm font-bold mb-1">Pending Teacher Approval</p>
                    <p className="text-xs max-w-sm mx-auto">This essay was flagged by our AI detection system and requires teacher review before it can be assigned to peers.</p>
                </div>
            ) : essay.status === 'rejected' ? (
                <div className="text-center py-10 text-red-600 ">
                    <p className="text-4xl mb-3">❌</p>
                    <p className="text-sm font-bold mb-1">Essay Rejected</p>
                    <p className="text-xs max-w-sm mx-auto">This essay was rejected by your teacher. Please check your messages for details.</p>
                </div>
            ) : reviewCount === 0 ? (
                <div className="text-center py-10 text-slate-400 ">
                    <p className="text-4xl mb-3">⏳</p>
                    <p className="text-sm">No peer reviews yet. Check back soon!</p>
                </div>
            ) : (
                <>
                    <p className="text-sm font-bold text-slate-700  mb-3">{reviewCount} Peer Review{reviewCount !== 1 ? 's' : ''} Received</p>
                    {essay.reviews.map((review, idx) => (
                        <ReviewCard
                            key={review.id}
                            review={{ ...review, reviewerIndex: essay.reviews.length - idx }}
                            onSave={(updates) => onSaveReview(essay.id, review.id, updates)}
                        />
                    ))}
                </>
            )}
        </div>
    )
}

// ─── Summary Stats Bar ────────────────────────────────────────────────────────
function SummaryBar({ essays }: { essays: EssayData[] }) {
    const allReviews = essays.flatMap(e => e.reviews)
    const totalReviews = allReviews.length
    const ratedCount = allReviews.filter(r => r.studentRating !== null && r.studentRating !== undefined).length
    const respondedCount = allReviews.filter(r => r.studentResponse?.trim()).length
    const allScores = allReviews.map(r => totalScore(r.scores))
    const overallAvg = avg(allScores)
    const overallPct = pct(overallAvg)

    const stats = [
        { label: 'Essays', value: essays.length, icon: '📄' },
        { label: 'Reviews Received', value: totalReviews, icon: '💬' },
        { label: 'Reviews Rated', value: `${ratedCount}/${totalReviews}`, icon: '⭐' },
        { label: 'Responses Submitted', value: `${respondedCount}/${totalReviews}`, icon: '✍️' },
        { label: 'Overall Avg Score', value: overallAvg > 0 ? `${overallAvg}/${MAX_TOTAL}` : '—', icon: '📊', colored: overallAvg > 0, p: overallPct },
    ]

    return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {stats.map((s, i) => (
                <div key={i} className="bg-white  border border-slate-200  rounded-xl p-4 text-center shadow-sm">
                    <p className="text-xl mb-1">{s.icon}</p>
                    <p className={`text-xl font-extrabold ${s.colored ? scoreColor(s.p!) : 'text-slate-900 '}`}>{s.value}</p>
                    <p className="text-xs text-slate-400  font-semibold uppercase tracking-wide mt-0.5">{s.label}</p>
                </div>
            ))}
        </div>
    )
}

// ─── Essay List Card ──────────────────────────────────────────────────────────
function EssayListCard({ essay, onClick }: { essay: EssayData; onClick: () => void }) {
    const allScores = essay.reviews.map(r => totalScore(r.scores))
    const avgScore = avg(allScores)
    const avgPct = pct(avgScore)
    const reviewCount = essay.reviews.length
    const ratedCount = essay.reviews.filter(r => r.studentRating != null).length
    const respondedCount = essay.reviews.filter(r => r.studentResponse?.trim()).length

    return (
        <div
            onClick={onClick}
            className="bg-white  border border-slate-200  rounded-xl p-5 mb-4 cursor-pointer shadow-sm hover:shadow-md hover:border-blue-300 :border-blue-500/40 transition-all"
        >
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">{essay.topicName || 'Essay'}</p>
                    <h3 className="text-base font-extrabold text-slate-900  mb-2 leading-snug">{essay.title}</h3>
                    <div className="flex gap-4 flex-wrap text-xs text-slate-500 ">
                        <span>📅 {essay.submittedAt?.toDate ? essay.submittedAt.toDate().toLocaleDateString() : '—'}</span>
                        <span>📝 {essay.wordCount} words</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {essay.status === 'pending_teacher_approval' ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full text-amber-600 bg-amber-50   border border-amber-200 ">
                                ⏳ Pending Approval
                            </span>
                        ) : essay.status === 'rejected' ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full text-red-600 bg-red-50   border border-red-200 ">
                                ❌ Rejected
                            </span>
                        ) : reviewCount > 0 ? (
                            <>
                                <div className="flex items-baseline gap-0.5">
                                    <span className={`text-2xl font-black ${scoreColor(avgPct)}`}>{avgScore}</span>
                                    <span className="text-xs text-slate-400 ">/{MAX_TOTAL}</span>
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${scoreColor(avgPct)}`}
                                    style={{ background: scoreColorHex(avgPct) + '18' }}>
                                    {scoreBadge(avgPct)}
                                </span>
                            </>
                        ) : (
                            <span className="text-xs text-slate-400  italic">No reviews yet</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress row */}
            {essay.status === 'pending_teacher_approval' ? (
                <div className="mt-4 pt-3 border-t border-slate-100 ">
                    <p className="text-xs text-amber-600  font-medium">Awaiting manual teacher review due to AI detection.</p>
                </div>
            ) : essay.status === 'rejected' ? (
                <div className="mt-4 pt-3 border-t border-slate-100 ">
                    <p className="text-xs text-red-600  font-medium">This essay was rejected. Click to view full text.</p>
                </div>
            ) : (
                <div className="mt-4 pt-3 border-t border-slate-100  flex items-center gap-4 flex-wrap">
                    {[
                        { dot: reviewCount > 0, label: `${reviewCount} review${reviewCount !== 1 ? 's' : ''}` },
                        { dot: ratedCount === reviewCount && reviewCount > 0, partial: ratedCount > 0, label: `${ratedCount}/${reviewCount} rated` },
                        { dot: respondedCount === reviewCount && reviewCount > 0, partial: respondedCount > 0, label: `${respondedCount}/${reviewCount} responded` },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full inline-block ${item.dot ? 'bg-green-500' : item.partial ? 'bg-amber-400' : 'bg-slate-300 '}`} />
                            <span className="text-xs text-slate-600 ">{item.label}</span>
                        </div>
                    ))}
                    <span className="ml-auto text-xs font-semibold text-blue-600 ">View Reviews →</span>
                </div>
            )}
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyEssaysPage() {
    const router = useRouter()
    const [essays, setEssays] = useState<EssayData[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        const load = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            try {
                // Fetch essays
                const essaySnap = await getDocs(
                    query(collection(db, 'essays'), where('studentId', '==', auth.currentUser!.uid))
                )
                const rawEssays = essaySnap.docs.map(d => ({ id: d.id, ...d.data() as any }))
                rawEssays.sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0))

                // Fetch reviews for each essay
                const essaysWithReviews: EssayData[] = await Promise.all(
                    rawEssays.map(async (essay) => {
                        const revSnap = await getDocs(
                            query(collection(db, 'reviews'), where('essayId', '==', essay.id))
                        )
                        const reviews: ReviewData[] = revSnap.docs.map(d => ({
                            id: d.id,
                            reviewerName: d.data().reviewerName || 'Peer Reviewer',
                            completedAt: d.data().completedAt,
                            scores: d.data().scores || {},
                            feedback: d.data().feedback || '',
                            studentRating: d.data().studentRating ?? null,
                            studentResponse: d.data().studentResponse ?? '',
                        }))
                        const wc = (essay.content ?? '').trim().split(/\s+/).filter(Boolean).length
                        return {
                            id: essay.id,
                            title: essay.title ?? 'Untitled Essay',
                            content: essay.content ?? '',
                            topicName: essay.topicName ?? '',
                            topicId: essay.topicId,
                            submittedAt: essay.submittedAt,
                            status: essay.status,
                            wordCount: wc,
                            reviews,
                        }
                    })
                )
                setEssays(essaysWithReviews)
            } catch (err) {
                console.error('Error loading essays:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [router])

    const handleSaveReview = async (essayId: string, reviewId: string, updates: any) => {
        await updateDoc(doc(db, 'reviews', reviewId), {
            ...updates,
            updatedAt: serverTimestamp(),
        })
        // Optimistic update
        setEssays(prev => prev.map(e => e.id !== essayId ? e : {
            ...e,
            reviews: e.reviews.map(r => r.id !== reviewId ? r : { ...r, ...updates }),
        }))
    }

    const handleDelete = async (essayId: string) => {
        setDeleting(true)
        try {
            await deleteDoc(doc(db, 'essays', essayId))
            setEssays(prev => prev.filter(e => e.id !== essayId))
            if (selectedId === essayId) setSelectedId(null)
        } finally {
            setDeleting(false)
            setConfirmDeleteId(null)
        }
    }

    const selectedEssay = essays.find(e => e.id === selectedId)

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
        )
    }

    return (
        <StudentLayout title="My Essays">

            {/* Delete confirmation modal */}
            {confirmDeleteId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
                    <div className="bg-white  border border-slate-200  rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                        <p className="text-5xl mb-4">🗑️</p>
                        <h2 className="text-xl font-bold text-slate-900  mb-2">Delete Essay?</h2>
                        <p className="text-slate-500  text-sm mb-6">This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDeleteId(null)} className="flex-1 bg-slate-100  text-slate-700  font-semibold py-2.5 rounded-lg hover:bg-slate-200 :bg-slate-600 transition-colors">Cancel</button>
                            <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleting} className="flex-1 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                                {deleting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Deleting…</> : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedEssay ? (
                <EssayDetail
                    essay={selectedEssay}
                    onBack={() => setSelectedId(null)}
                    onSaveReview={handleSaveReview}
                    onDeleteClick={setConfirmDeleteId}
                />
            ) : (
                <main className="max-w-3xl mx-auto px-4 py-8">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900  mb-1">My Essays</h1>
                            <p className="text-sm text-slate-500 ">View your submissions, read peer feedback, and respond to reviews.</p>
                        </div>
                        <button
                            onClick={() => router.push('/submit-essay')}
                            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:from-blue-600 hover:to-purple-700 transition-all shrink-0"
                        >
                            + New Essay
                        </button>
                    </div>

                    {essays.length > 0 && <SummaryBar essays={essays} />}

                    {essays.length === 0 ? (
                        <div className="bg-white  border border-slate-200  rounded-xl p-12 text-center">
                            <p className="text-5xl mb-4">📝</p>
                            <h3 className="text-xl font-bold text-slate-900  mb-2">No Essays Yet</h3>
                            <p className="text-slate-500  mb-6 text-sm">You haven't submitted any essays yet.</p>
                            <button onClick={() => router.push('/submit-essay')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                                Submit Your First Essay
                            </button>
                        </div>
                    ) : essays.map(essay => (
                        <EssayListCard
                            key={essay.id}
                            essay={essay}
                            onClick={() => setSelectedId(essay.id)}
                        />
                    ))}
                </main>
            )}
        </StudentLayout>
    )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'

// ─── Rubric Definition ────────────────────────────────────────────────────────
const ASPECTS = [
    {
        id: 'content', title: 'Content',
        levels: [
            { range: '27–30', desc: 'Essay clearly addresses topic · Ideas are developed thoroughly · Essay reflects substantive thought · No extraneous material' },
            { range: '22–26', desc: 'Essay mostly focused on topic · Expresses a few advanced ideas · Some details and reasons included, though thesis not fully developed' },
            { range: '17–21', desc: 'Essay minimally addresses the topic (at the surface level) · Development of ideas is not complete · Lacks detail and support' },
            { range: '13–16', desc: 'Essay does not adequately address the topic · Ideas are either non-substantive or not pertinent · OR Not enough to evaluate' },
        ],
    },
    {
        id: 'organization', title: 'Organization',
        levels: [
            { range: '18–20', desc: 'Essay is well-organized · Paragraphs demonstrate logical sequencing · Sophisticated use of connectors contribute to cohesion' },
            { range: '14–17', desc: 'Somewhat choppy and loosely organized, but clear main ideas · Mostly logical sequencing · Frequent and appropriate use of connectors' },
            { range: '10–13', desc: 'Essay organization barely seen; lacks fluidity · Ideas appear disconnected and lack logical flow · Some simple connectors may be used' },
            { range: '7–9', desc: 'Essay lacks any discernible organization of ideas · Sentences unrelated to one another, or randomly written · OR Not enough to evaluate' },
        ],
    },
    {
        id: 'vocabulary', title: 'Vocabulary',
        levels: [
            { range: '18–20', desc: 'Effective and appropriate word/idiom choice and usage · Wide range of vocabulary; more frequent use of academic vocabulary · Word form mastery' },
            { range: '14–17', desc: 'Occasional errors of word/idiom choice and usage, but meaning not obscured · Adequate range; some use of low-frequency or specialized vocabulary' },
            { range: '10–13', desc: 'More frequent errors of word/idiom choice and usage; meaning occasionally obscured · More limited range of vocabulary; repetitive' },
            { range: '7–9', desc: 'Large number of errors in word choice and usage such that meaning is frequently obscured · Very limited range and/or too little writing to evaluate' },
        ],
    },
    {
        id: 'languageUse', title: 'Language Use',
        levels: [
            { range: '22–25', desc: 'Effective complex constructions · No, or only a few minor errors in use of relative clauses, agreement, tense, articles, pronouns, prepositions' },
            { range: '18–21', desc: 'Effective but simple constructions · Errors of agreement, tense, articles, pronouns, and prepositions, but meaning not obscured' },
            { range: '11–17', desc: 'Definite problems in simple/complex constructions · Little variety in sentence type · Frequent errors obscure meaning' },
            { range: '5–10', desc: 'Virtually no mastery of sentence construction rules · Dominated by errors and grammar problems · Barely communicates' },
        ],
    },
    {
        id: 'mechanics', title: 'Mechanics',
        levels: [
            { range: '5', desc: 'Demonstrates mastery of conventions · Few errors of spelling, punctuation, capitalization, paragraphing' },
            { range: '4', desc: 'Occasional errors of spelling, punctuation, capitalization, paragraphing but meaning not obscured' },
            { range: '3', desc: 'Frequent errors of spelling, punctuation, capitalization, paragraphing · Poor handwriting · Meaning confused or obscured' },
            { range: '2', desc: 'No mastery of conventions · Dominated by errors · Handwriting illegible · OR Not enough to evaluate' },
        ],
    },
]

function getHighest(range: string | null): number {
    if (!range) return 0
    const nums = range.split('–').map(n => parseInt(n.trim(), 10))
    return Math.max(...nums)
}

// ─── AspectCard ───────────────────────────────────────────────────────────────
function AspectCard({
    aspect, index, selected, onSelect,
}: {
    aspect: typeof ASPECTS[0]
    index: number
    selected: string | null
    onSelect: (range: string | null) => void
}) {
    return (
        <div className="border border-slate-200  rounded-xl mb-3 bg-white  overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 ">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {index}
                </span>
                <span className="text-sm font-bold text-slate-900 ">{aspect.title}</span>
            </div>
            <div className="p-3 space-y-1.5">
                {aspect.levels.map((lv, i) => {
                    const isSelected = selected === lv.range
                    return (
                        <div
                            key={i}
                            className={`flex items-stretch rounded-lg overflow-hidden border transition-all ${isSelected
                                ? 'border-blue-500'
                                : 'border-transparent'
                                } ${i % 2 === 0 ? 'bg-slate-50 ' : 'bg-white '}`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(isSelected ? null : lv.range)}
                                className={`px-3 py-2 text-xs font-bold whitespace-nowrap shrink-0 border-r transition-all ${isSelected
                                    ? 'bg-blue-600 text-white border-blue-500'
                                    : 'bg-slate-100  text-slate-600  border-slate-200  hover:bg-blue-50 :bg-blue-900/20'
                                    }`}
                            >
                                {lv.range}
                            </button>
                            <span className="px-3 py-2 text-xs text-slate-600  leading-relaxed">
                                {lv.desc}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Essay Panel (left) ───────────────────────────────────────────────────────
function EssayPanel({ essay }: { essay: any }) {
    const wordCount = essay?.content?.trim().split(/\s+/).filter(Boolean).length ?? 0
    return (
        <div className="p-4 space-y-4">
            {/* Topic card */}
            <div className="bg-white  border border-slate-200  rounded-xl p-4">
                <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Topic</p>
                <p className="text-base font-bold text-slate-900  mb-3">{essay?.topicName || 'Essay'}</p>
                {essay?.topicInstruction && (
                    <>
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Task Instruction</p>
                        <p className="text-sm text-slate-600  leading-relaxed">{essay.topicInstruction}</p>
                    </>
                )}
            </div>

            {/* Essay content */}
            <div className="bg-white  border border-slate-200  rounded-xl p-4">
                {essay?.title && (
                    <p className="text-sm font-bold text-slate-900  mb-3 pb-3 border-b border-slate-100 ">
                        {essay.title}
                    </p>
                )}
                <p className="text-sm text-slate-700  leading-relaxed whitespace-pre-wrap">
                    {essay?.content}
                </p>
                <div className="mt-4 pt-3 border-t border-slate-100 ">
                    <span className="text-xs font-medium text-blue-600  bg-blue-50  border border-blue-100  px-3 py-1 rounded-full">
                        📝 {wordCount} words
                    </span>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReviewEssay() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [alreadyReviewed, setAlreadyReviewed] = useState(false)
    const [notFound, setNotFound] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [scores, setScores] = useState<Record<string, string | null>>({
        content: null, organization: null, vocabulary: null, languageUse: null, mechanics: null,
    })
    const [feedback, setFeedback] = useState('')
    const [activeTab, setActiveTab] = useState<'essay' | 'rubric'>('essay')
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    useEffect(() => {
        const fetchEssay = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            try {
                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (!essayDoc.exists()) { setNotFound(true); return }

                const reviewsQ = query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essayId),
                    where('reviewerId', '==', auth.currentUser.uid)
                )
                if (!(await getDocs(reviewsQ)).empty) setAlreadyReviewed(true)

                setEssay({ id: essayDoc.id, ...essayDoc.data() })
            } catch (err) {
                console.error('Error fetching essay:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchEssay()
    }, [essayId, router])

    const allScored = ASPECTS.every(a => scores[a.id] !== null)
    const totalScore = ASPECTS.reduce((sum, a) => sum + getHighest(scores[a.id]), 0)
    const wordCount = feedback.trim() === '' ? 0 : feedback.trim().split(/\s+/).length
    const feedbackValid = wordCount >= 20
    const canSubmit = allScored && feedbackValid && !submitting

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (!auth.currentUser || !essay) return
        if (!allScored) { setError('Please select a score for all 5 rubric categories.'); return }
        if (!feedbackValid) { setError('Please write at least 20 words of feedback.'); return }

        setSubmitting(true)
        try {
            await addDoc(collection(db, 'reviews'), {
                essayId,
                reviewerId: auth.currentUser.uid,
                reviewerName: auth.currentUser.displayName || 'Anonymous',
                scores,
                totalScore,
                feedback,
                completedAt: serverTimestamp(),
            })

            // Telegram notification (fire-and-forget)
            try {
                const authorDoc = await getDoc(doc(db, 'users', essay.studentId))
                const chatId = authorDoc.exists() ? authorDoc.data().telegramChatId : null
                if (chatId) {
                    fetch('/api/notifications/telegram', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chatId, essayTitle: essay.title }),
                    }).catch(() => { })
                }
            } catch { }

            setSuccess('Review submitted! Redirecting...')
            setTimeout(() => router.push('/review'), 1500)
        } catch (err) {
            setError('Failed to submit review. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    // ── States ────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
                <div className="animate-spin rounded-full h-11 w-11 border-b-2 border-blue-500" />
            </div>
        )
    }

    if (notFound) {
        return (
            <div className="min-h-screen bg-slate-50  flex items-center justify-center">
                <div className="text-center">
                    <p className="text-5xl mb-4">🔍</p>
                    <h2 className="text-xl font-bold text-slate-900  mb-2">Essay Not Found</h2>
                    <button onClick={() => router.push('/review')} className="text-blue-500  hover:underline text-sm">← Back to Reviews</button>
                </div>
            </div>
        )
    }

    if (alreadyReviewed) {
        return (
            <StudentLayout title="Already Reviewed">
                <div className="max-w-md mx-auto mt-20 p-10 bg-white  border border-slate-200  rounded-2xl text-center shadow-sm">
                    <p className="text-5xl mb-4">✅</p>
                    <h2 className="text-xl font-bold text-slate-900  mb-2">Already Reviewed</h2>
                    <p className="text-slate-500  text-sm mb-6">You've already submitted a review for this essay.</p>
                    <button onClick={() => router.push('/review')} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                        Back to Reviews
                    </button>
                </div>
            </StudentLayout>
        )
    }

    // ── Rubric panel ──────────────────────────────────────────────────────

    const rubricPanelJSX = (
        <div className="p-4 bg-slate-50  space-y-0">
            <div className="mb-4">
                <p className="text-base font-bold text-slate-900  mb-0.5">Writing Development Rubric</p>
                <p className="text-xs text-slate-500 ">Click a score range to select it for each category.</p>
            </div>

            {error && (
                <div className="mb-3 px-4 py-3 rounded-lg bg-red-50  border border-red-200  text-sm text-red-600 ">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-3 px-4 py-3 rounded-lg bg-green-50  border border-green-200  text-sm text-green-700 ">
                    {success}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                {ASPECTS.map((aspect, i) => (
                    <AspectCard
                        key={aspect.id}
                        aspect={aspect}
                        index={i + 1}
                        selected={scores[aspect.id]}
                        onSelect={(range) => setScores(prev => ({ ...prev, [aspect.id]: range }))}
                    />
                ))}

                {/* Total score bar */}
                <div className="border border-slate-200  rounded-xl bg-white  p-4 mb-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Total Score</p>
                        <p className={`text-3xl font-extrabold leading-none ${allScored ? 'text-blue-600 ' : 'text-slate-300 '}`}>
                            {allScored ? totalScore : '—'}
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end max-w-[60%]">
                        {ASPECTS.map(a => (
                            <div key={a.id} className="text-center">
                                <div className="text-xs text-slate-400  mb-1">{a.title}</div>
                                <div className={`px-2 py-0.5 rounded text-xs font-bold ${scores[a.id] ? 'bg-blue-600 text-white' : 'bg-slate-100  text-slate-400 '}`}>
                                    {scores[a.id] ? getHighest(scores[a.id]) : '–'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Write Your Review */}
                <div className="border border-slate-200  rounded-xl bg-white  overflow-hidden mb-3">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 ">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">6</span>
                        <span className="text-sm font-bold text-slate-900 ">Write Your Review</span>
                    </div>
                    <div className="p-4">
                        <textarea
                            value={feedback}
                            onChange={e => { setFeedback(e.target.value); setError(null) }}
                            placeholder="Please input at least 20 words. When providing comments, please avoid simply copying and pasting the descriptors from the rating rubric. Your peers would benefit from personalized feedback that is specific to their work."
                            rows={5}
                            className="w-full bg-slate-50  border border-slate-200  text-slate-900  rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-vertical placeholder:text-slate-400 :text-slate-500"
                        />
                        <p className={`text-xs mt-1.5 ${feedbackValid ? 'text-slate-400 ' : 'text-red-500 '}`}>
                            {wordCount} word{wordCount !== 1 ? 's' : ''}
                            {!feedbackValid && wordCount > 0 && ` · ${20 - wordCount} more needed`}
                        </p>
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${canSubmit
                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow-green-500/20'
                        : 'bg-slate-100  text-slate-400  cursor-not-allowed'
                        }`}
                >
                    {submitting ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            Submitting…
                        </>
                    ) : 'Submit Review'}
                </button>
            </form>
        </div>
    )

    // ── Layout ────────────────────────────────────────────────────────────
    return (
        <StudentLayout title="Reviewing Essay">

            {/* Mobile tabs */}
            {isMobile && (
                <div className="flex bg-white  border-b border-slate-200  shrink-0">
                    {(['essay', 'rubric'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-3 text-sm font-semibold capitalize transition-colors border-b-2 ${activeTab === tab
                                ? 'text-blue-600  border-blue-600 '
                                : 'text-slate-500  border-transparent'
                                }`}
                        >
                            {tab === 'essay' ? 'Essay' : 'Rubric'}
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            {isMobile ? (
                <div className="flex-1 overflow-auto">
                    {activeTab === 'essay' ? <EssayPanel essay={essay} /> : (
                        <div className="p-4 bg-slate-50  space-y-0">
                            <div className="mb-4">
                                <p className="text-base font-bold text-slate-900  mb-0.5">Writing Development Rubric</p>
                                <p className="text-xs text-slate-500 ">Click a score range to select it for each category.</p>
                            </div>

                            {error && (
                                <div className="mb-3 px-4 py-3 rounded-lg bg-red-50  border border-red-200  text-sm text-red-600 ">
                                    {error}
                                </div>
                            )}
                            {success && (
                                <div className="mb-3 px-4 py-3 rounded-lg bg-green-50  border border-green-200  text-sm text-green-700 ">
                                    {success}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                {ASPECTS.map((aspect, i) => (
                                    <AspectCard
                                        key={aspect.id}
                                        aspect={aspect}
                                        index={i + 1}
                                        selected={scores[aspect.id]}
                                        onSelect={(range) => setScores(prev => ({ ...prev, [aspect.id]: range }))}
                                    />
                                ))}

                                {/* Total score bar */}
                                <div className="border border-slate-200  rounded-xl bg-white  p-4 mb-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Total Score</p>
                                        <p className={`text-3xl font-extrabold leading-none ${allScored ? 'text-blue-600 ' : 'text-slate-300 '}`}>
                                            {allScored ? totalScore : '—'}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 flex-wrap justify-end max-w-[60%]">
                                        {ASPECTS.map(a => (
                                            <div key={a.id} className="text-center">
                                                <div className="text-xs text-slate-400  mb-1">{a.title}</div>
                                                <div className={`px-2 py-0.5 rounded text-xs font-bold ${scores[a.id] ? 'bg-blue-600 text-white' : 'bg-slate-100  text-slate-400 '}`}>
                                                    {scores[a.id] ? getHighest(scores[a.id]) : '–'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Write Your Review */}
                                <div className="border border-slate-200  rounded-xl bg-white  overflow-hidden mb-3">
                                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 ">
                                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">6</span>
                                        <span className="text-sm font-bold text-slate-900 ">Write Your Review</span>
                                    </div>
                                    <div className="p-4">
                                        <textarea
                                            value={feedback}
                                            onChange={e => { setFeedback(e.target.value); setError(null) }}
                                            placeholder="Please input at least 20 words. When providing comments, please avoid simply copying and pasting the descriptors from the rating rubric. Your peers would benefit from personalized feedback that is specific to their work."
                                            rows={5}
                                            className="w-full bg-slate-50  border border-slate-200  text-slate-900  rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-vertical placeholder:text-slate-400 :text-slate-500"
                                        />
                                        <p className={`text-xs mt-1.5 ${feedbackValid ? 'text-slate-400 ' : 'text-red-500 '}`}>
                                            {wordCount} word{wordCount !== 1 ? 's' : ''}
                                            {!feedbackValid && wordCount > 0 && ` · ${20 - wordCount} more needed`}
                                        </p>
                                    </div>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${canSubmit
                                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow-green-500/20'
                                        : 'bg-slate-100  text-slate-400  cursor-not-allowed'
                                        }`}
                                >
                                    {submitting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                            Submitting…
                                        </>
                                    ) : 'Submit Review'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>

            ) : (
                <div className="grid grid-cols-2 h-full overflow-hidden">
                    <div className="overflow-auto border-r border-slate-200 ">
                        <EssayPanel essay={essay} />
                    </div>
                    <div className="overflow-auto">
                        <div className="p-4 bg-slate-50  space-y-0">
                            <div className="mb-4">
                                <p className="text-base font-bold text-slate-900  mb-0.5">Writing Development Rubric</p>
                                <p className="text-xs text-slate-500 ">Click a score range to select it for each category.</p>
                            </div>

                            {error && (
                                <div className="mb-3 px-4 py-3 rounded-lg bg-red-50  border border-red-200  text-sm text-red-600 ">
                                    {error}
                                </div>
                            )}
                            {success && (
                                <div className="mb-3 px-4 py-3 rounded-lg bg-green-50  border border-green-200  text-sm text-green-700 ">
                                    {success}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                {ASPECTS.map((aspect, i) => (
                                    <AspectCard
                                        key={aspect.id}
                                        aspect={aspect}
                                        index={i + 1}
                                        selected={scores[aspect.id]}
                                        onSelect={(range) => setScores(prev => ({ ...prev, [aspect.id]: range }))}
                                    />
                                ))}

                                {/* Total score bar */}
                                <div className="border border-slate-200  rounded-xl bg-white  p-4 mb-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-slate-400  uppercase tracking-widest mb-1">Total Score</p>
                                        <p className={`text-3xl font-extrabold leading-none ${allScored ? 'text-blue-600 ' : 'text-slate-300 '}`}>
                                            {allScored ? totalScore : '—'}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 flex-wrap justify-end max-w-[60%]">
                                        {ASPECTS.map(a => (
                                            <div key={a.id} className="text-center">
                                                <div className="text-xs text-slate-400  mb-1">{a.title}</div>
                                                <div className={`px-2 py-0.5 rounded text-xs font-bold ${scores[a.id] ? 'bg-blue-600 text-white' : 'bg-slate-100  text-slate-400 '}`}>
                                                    {scores[a.id] ? getHighest(scores[a.id]) : '–'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Write Your Review */}
                                <div className="border border-slate-200  rounded-xl bg-white  overflow-hidden mb-3">
                                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 ">
                                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">6</span>
                                        <span className="text-sm font-bold text-slate-900 ">Write Your Review</span>
                                    </div>
                                    <div className="p-4">
                                        <textarea
                                            value={feedback}
                                            onChange={e => { setFeedback(e.target.value); setError(null) }}
                                            placeholder="Please input at least 20 words. When providing comments, please avoid simply copying and pasting the descriptors from the rating rubric. Your peers would benefit from personalized feedback that is specific to their work."
                                            rows={5}
                                            className="w-full bg-slate-50  border border-slate-200  text-slate-900  rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-vertical placeholder:text-slate-400 :text-slate-500"
                                        />
                                        <p className={`text-xs mt-1.5 ${feedbackValid ? 'text-slate-400 ' : 'text-red-500 '}`}>
                                            {wordCount} word{wordCount !== 1 ? 's' : ''}
                                            {!feedbackValid && wordCount > 0 && ` · ${20 - wordCount} more needed`}
                                        </p>
                                    </div>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${canSubmit
                                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow-green-500/20'
                                        : 'bg-slate-100  text-slate-400  cursor-not-allowed'
                                        }`}
                                >
                                    {submitting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                            Submitting…
                                        </>
                                    ) : 'Submit Review'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </StudentLayout>
    )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import Header from '@/components/Header'

// ─── Rubric Definition ─────────────────────────────────────────────────────────
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

const ACCENT = '#2563eb'

function getHighest(range: string | null): number {
    if (!range) return 0
    const nums = range.split('–').map(n => parseInt(n.trim(), 10))
    return Math.max(...nums)
}

// ─── Sub-components ─────────────────────────────────────────────────────────────
function AspectCard({
    aspect, index, selected, onSelect,
}: {
    aspect: typeof ASPECTS[0]
    index: number
    selected: string | null
    onSelect: (range: string | null) => void
}) {
    return (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, background: '#fff', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{index}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{aspect.title}</span>
            </div>
            <div style={{ padding: '10px 16px 12px' }}>
                {aspect.levels.map((lv, i) => {
                    const isSelected = selected === lv.range
                    return (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'stretch',
                            borderRadius: 6, marginBottom: 4, overflow: 'hidden',
                            border: isSelected ? `1.5px solid ${ACCENT}` : '1.5px solid transparent',
                            background: i % 2 === 0 ? '#f9fafb' : '#fff',
                        }}>
                            <button
                                type="button"
                                onClick={() => onSelect(isSelected ? null : lv.range)}
                                style={{
                                    padding: '8px 12px',
                                    background: isSelected ? ACCENT : '#f3f4f6',
                                    color: isSelected ? '#fff' : '#374151',
                                    fontSize: 11, fontWeight: 700,
                                    border: 'none',
                                    borderRight: `1px solid ${isSelected ? ACCENT : '#e5e7eb'}`,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {lv.range}
                            </button>
                            <span style={{ padding: '8px 12px', fontSize: 12.5, color: '#374151', lineHeight: 1.6 }}>
                                {lv.desc}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function EssayPanel({ essay }: { essay: any }) {
    const wordCount = essay?.content?.trim().split(/\s+/).filter(Boolean).length ?? 0
    return (
        <div style={{ padding: '16px' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Topic</p>
                <p style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 14px' }}>{essay?.topicName || 'Essay'}</p>
                {essay?.topicInstruction && (
                    <>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Task Instruction</p>
                        <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.75, margin: 0 }}>{essay.topicInstruction}</p>
                    </>
                )}
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 16px' }}>
                {essay?.title && (
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 14px', paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>{essay.title}</p>
                )}
                <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.85, margin: 0, whiteSpace: 'pre-wrap' }}>{essay?.content}</p>
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>📝 {wordCount} words</span>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ───────────────────────────────────────────────────────────────────
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

    // Rubric scores: { content: '27–30' | null, organization: ... }
    const [scores, setScores] = useState<Record<string, string | null>>({
        content: null, organization: null, vocabulary: null, languageUse: null, mechanics: null,
    })
    const [feedback, setFeedback] = useState('')

    // Mobile tab
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
                const reviewsSnap = await getDocs(reviewsQ)
                if (!reviewsSnap.empty) setAlreadyReviewed(true)

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

            setSuccess('Review submitted successfully! Redirecting...')
            setTimeout(() => router.push('/review'), 1500)
        } catch (err) {
            console.error('Error submitting review:', err)
            setError('Failed to submit review. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    // ── Loading / guard states ────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${ACCENT}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        )
    }

    if (notFound) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 48, margin: '0 0 12px' }}>🔍</p>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Essay Not Found</h2>
                    <button onClick={() => router.push('/review')} style={{ color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back to Reviews</button>
                </div>
            </div>
        )
    }

    if (alreadyReviewed) {
        return (
            <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
                <Header />
                <div style={{ maxWidth: 480, margin: '80px auto', padding: '40px 32px', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', textAlign: 'center' }}>
                    <p style={{ fontSize: 52, margin: '0 0 12px' }}>✅</p>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Already Reviewed</h2>
                    <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 24px' }}>You've already submitted a review for this essay.</p>
                    <button onClick={() => router.push('/review')} style={{ background: ACCENT, color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back to Reviews</button>
                </div>
            </div>
        )
    }

    // ── Rubric panel (right side) ─────────────────────────────────────────
    const RubricPanel = () => (
        <div style={{ padding: '16px', background: '#f9fafb' }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Writing Development Rubric</p>
            <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 16px', lineHeight: 1.6 }}>
                Click a score range to select it for each category.
            </p>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#b91c1c' }}>
                    {error}
                </div>
            )}
            {success && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#15803d' }}>
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

                {/* Total Score */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Total Score</p>
                        <p style={{ fontSize: 28, fontWeight: 800, color: allScored ? ACCENT : '#d1d5db', margin: 0, lineHeight: 1 }}>
                            {allScored ? totalScore : '—'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60%' }}>
                        {ASPECTS.map(a => (
                            <div key={a.id} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{a.title}</div>
                                <div style={{ padding: '2px 8px', borderRadius: 4, background: scores[a.id] ? ACCENT : '#f3f4f6', color: scores[a.id] ? '#fff' : '#9ca3af', fontSize: 12, fontWeight: 700 }}>
                                    {scores[a.id] ? getHighest(scores[a.id]) : '–'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Write Your Review */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>6</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Write Your Review</span>
                    </div>
                    <div style={{ padding: '12px 16px' }}>
                        <textarea
                            value={feedback}
                            onChange={e => { setFeedback(e.target.value); setError(null) }}
                            placeholder="Please input at least 20 words. When providing comments, please avoid simply copying and pasting the descriptors from the rating rubric. Your peers would benefit from personalized feedback that is specific to their work."
                            style={{
                                width: '100%', minHeight: 130, padding: '10px 12px',
                                border: '1px solid #e5e7eb', borderRadius: 6,
                                fontSize: 13, color: '#374151', lineHeight: 1.65,
                                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                background: '#f8fafc',
                            }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                            <span style={{ fontSize: 12, color: feedbackValid ? '#6b7280' : '#ef4444' }}>
                                {wordCount} word{wordCount !== 1 ? 's' : ''}
                                {!feedbackValid && wordCount > 0 && ` · ${20 - wordCount} more needed`}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={submitting || !allScored || !feedbackValid}
                    style={{
                        width: '100%', padding: '13px 0', borderRadius: 9,
                        background: allScored && feedbackValid ? '#16a34a' : '#e5e7eb',
                        color: allScored && feedbackValid ? '#fff' : '#9ca3af',
                        fontSize: 15, fontWeight: 700, border: 'none',
                        cursor: allScored && feedbackValid ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                >
                    {submitting ? (
                        <>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                            Submitting…
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </>
                    ) : 'Submit Review'}
                </button>
            </form>
        </div>
    )

    // ── Layout ────────────────────────────────────────────────────────────
    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f3f4f6' }}>
            <Header />

            {/* Mobile tabs */}
            {isMobile && (
                <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                    {(['essay', 'rubric'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                flex: 1, padding: '12px 0',
                                fontSize: 14, fontWeight: 600,
                                border: 'none', cursor: 'pointer',
                                background: 'transparent',
                                color: activeTab === tab ? ACCENT : '#6b7280',
                                borderBottom: activeTab === tab ? `2.5px solid ${ACCENT}` : '2.5px solid transparent',
                                transition: 'all 0.15s',
                                textTransform: 'capitalize',
                            }}
                        >
                            {tab === 'essay' ? 'Essay' : 'Rubric'}
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            {isMobile ? (
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {activeTab === 'essay' ? <EssayPanel essay={essay} /> : <RubricPanel />}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden' }}>
                    <div style={{ overflow: 'auto', borderRight: '1px solid #e5e7eb' }}>
                        <EssayPanel essay={essay} />
                    </div>
                    <div style={{ overflow: 'auto' }}>
                        <RubricPanel />
                    </div>
                </div>
            )}
        </div>
    )
}

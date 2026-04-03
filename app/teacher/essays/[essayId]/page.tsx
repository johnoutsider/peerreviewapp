'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import {
    doc, getDoc, collection, query, where, getDocs,
    addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'
import EssayAnnotator from '@/components/review/EssayAnnotator'
import { normalizeReviewAnnotations } from '@/lib/review-annotations'
import { ReviewAnnotation } from '@/lib/review-types'
import {
    createEssayAnnotation,
    deleteEssayAnnotation,
    subscribeToEssayAnnotations,
    updateEssayAnnotation,
} from '@/lib/essay-annotations'

// ─── Rubric (identical to student review page) ────────────────────────────────
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

// ─── AspectCard (identical to student review page) ────────────────────────────
function AspectCard({
    aspect, index, selected, onSelect, missing,
}: {
    aspect: typeof ASPECTS[0]
    index: number
    selected: string | null
    onSelect: (range: string | null) => void
    missing?: boolean
}) {
    return (
        <div className={`rounded-xl mb-3 bg-white overflow-hidden border transition-all ${missing ? 'border-red-400 ring-1 ring-red-400' : 'border-slate-200'}`}>
            <div className={`flex items-center gap-3 px-4 py-3 border-b ${missing ? 'border-red-100 bg-red-50' : 'border-slate-100'}`}>
                <span className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0 ${selected ? 'bg-teal-600' : missing ? 'bg-red-500' : 'bg-slate-400'}`}>
                    {selected ? '✓' : index}
                </span>
                <span className="text-sm font-bold text-slate-900 flex-1">{aspect.title}</span>
                {missing && (
                    <span className="text-xs font-semibold text-red-500 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">Required</span>
                )}
                {selected && !missing && (
                    <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">✓ Scored</span>
                )}
            </div>
            <div className="p-3 space-y-1.5">
                {aspect.levels.map((lv, i) => {
                    const isSelected = selected === lv.range
                    return (
                        <div
                            key={i}
                            className={`flex items-stretch rounded-lg overflow-hidden border transition-all ${isSelected ? 'border-teal-500' : 'border-transparent'} ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(isSelected ? null : lv.range)}
                                className={`px-3 py-2 text-xs font-bold whitespace-nowrap shrink-0 border-r transition-all ${isSelected
                                    ? 'bg-teal-600 text-white border-teal-500'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-teal-50'}`}
                            >
                                {lv.range}
                            </button>
                            <span className="px-3 py-2 text-xs text-slate-600 leading-relaxed">{lv.desc}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Essay Panel (left column) ────────────────────────────────────────────────
function EssayPanel({
    essay,
    annotations,
    canEditAnnotation,
    onCreateAnnotation,
    onUpdateAnnotation,
    onDeleteAnnotation,
}: {
    essay: any
    annotations: ReviewAnnotation[]
    canEditAnnotation: (annotation: ReviewAnnotation) => boolean
    onCreateAnnotation: (draft: any, note: string) => Promise<void>
    onUpdateAnnotation: (annotation: ReviewAnnotation, note: string) => Promise<void>
    onDeleteAnnotation: (annotation: ReviewAnnotation) => Promise<void>
}) {
    const wordCount = essay?.content?.trim().split(/\s+/).filter(Boolean).length ?? 0
    return (
        <div className="p-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Topic</p>
                <p className="text-base font-bold text-slate-900 mb-1">{essay?.topicName || 'Essay'}</p>
                {essay?.authorName && (
                    <p className="text-xs text-slate-400 mt-1">🎓 {essay.authorName} · {essay.submittedAt?.toDate?.().toLocaleDateString()}</p>
                )}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                {essay?.title && (
                    <p className="text-sm font-bold text-slate-900 mb-3 pb-3 border-b border-slate-100">{essay.title}</p>
                )}
                <EssayAnnotator
                    content={essay?.content || ''}
                    annotations={annotations}
                    editable
                    onCreateAnnotation={onCreateAnnotation}
                    onUpdateAnnotation={onUpdateAnnotation}
                    onDeleteAnnotation={onDeleteAnnotation}
                    canEditAnnotation={canEditAnnotation}
                    tone="teacher"
                    title="Teacher Annotation"
                    subtitle="Highlight a passage to save a shared teacher note visible to every reviewer and the student."
                    emptyText="No highlighted teacher notes yet."
                />
                <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className="text-xs font-medium text-teal-600 bg-teal-50 border border-teal-100 px-3 py-1 rounded-full">
                        📝 {wordCount} words
                    </span>
                </div>
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TeacherEssayReview() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [existingReviewId, setExistingReviewId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [submitAttempted, setSubmitAttempted] = useState(false)
    const [activeTab, setActiveTab] = useState<'essay' | 'rubric'>('essay')
    const [isMobile, setIsMobile] = useState(false)

    const [scores, setScores] = useState<Record<string, string | null>>({
        content: null, organization: null, vocabulary: null, languageUse: null, mechanics: null,
    })
    const [feedback, setFeedback] = useState('')
    const [annotations, setAnnotations] = useState<ReviewAnnotation[]>([])

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    useEffect(() => {
        const load = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            try {
                setExistingReviewId(null)
                setFeedback('')
                setAnnotations([])
                setScores({
                    content: null,
                    organization: null,
                    vocabulary: null,
                    languageUse: null,
                    mechanics: null,
                })
                const { getUserProfile } = await import('@/lib/auth')
                const myProfile = await getUserProfile(auth.currentUser.uid)
                if (myProfile?.role !== 'teacher') { router.push('/dashboard'); return }

                // Fetch essay
                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (!essayDoc.exists()) { router.push('/teacher'); return }
                const essayData = { id: essayDoc.id, ...essayDoc.data() as any }

                // Fetch author name
                let authorName = 'Student'
                if (essayData.studentId) {
                    const authorDoc = await getDoc(doc(db, 'users', essayData.studentId))
                    if (authorDoc.exists()) {
                        const a = authorDoc.data() as any
                        authorName = a.displayName || a.name || 'Student'
                    }
                }
                setEssay({ ...essayData, authorName })

                // Load existing teacher review if any
                const existing = await getDocs(query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essayId),
                    where('reviewerId', '==', auth.currentUser.uid),
                    where('reviewerRole', '==', 'teacher'),
                ))
                if (!existing.empty) {
                    const r = existing.docs[0]
                    setExistingReviewId(r.id)
                    const d = r.data() as any
                    setFeedback(d.feedback || '')
                    setAnnotations(normalizeReviewAnnotations(essayData.content || '', d.annotations || []))
                    const loadedScores: Record<string, string | null> = {}
                    ASPECTS.forEach(a => { loadedScores[a.id] = d.scores?.[a.id] ?? null })
                    setScores(loadedScores)
                }
            } catch (err) {
                console.error('Error loading essay:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [essayId, router])

    useEffect(() => {
        if (!auth.currentUser) return

        setAnnotations([])
        const unsubscribe = subscribeToEssayAnnotations(essayId, setAnnotations)
        return () => unsubscribe()
    }, [essayId])

    const allScored = ASPECTS.every(a => scores[a.id] !== null)
    const totalScore = ASPECTS.reduce((sum, a) => sum + getHighest(scores[a.id]), 0)
    const wordCount = feedback.trim() === '' ? 0 : feedback.trim().split(/\s+/).length
    const feedbackValid = wordCount >= 10
    const canSubmit = allScored && feedbackValid && !submitting

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitAttempted(true)
        if (!auth.currentUser || !essay) return
        const currentUser = auth.currentUser
        if (!allScored) { setError('Please select a score for all 5 rubric categories.'); return }
        if (!feedbackValid) { setError('Please write at least 10 words of feedback.'); return }

        setSubmitting(true)
        try {
            const safeAnnotations = normalizeReviewAnnotations(
                essay.content || '',
                annotations.filter(annotation => annotation.authorId === currentUser.uid)
            )
            const payload = {
                essayId,
                reviewerId: currentUser.uid,
                reviewerRole: 'teacher',
                reviewerName: 'Teacher',
                scores,
                totalScore,
                overallBand: totalScore,
                feedback,
                annotations: safeAnnotations,
                annotationsCount: safeAnnotations.length,
                annotationSchemaVersion: 1,
                updatedAt: serverTimestamp(),
            }
            if (existingReviewId) {
                await updateDoc(doc(db, 'reviews', existingReviewId), payload)
            } else {
                const ref = await addDoc(collection(db, 'reviews'), {
                    ...payload,
                    completedAt: serverTimestamp(),
                })
                setExistingReviewId(ref.id)
            }
            setSuccess(existingReviewId ? 'Feedback updated!' : 'Feedback submitted!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            console.error('Save error:', err)
            setError('Failed to save feedback. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    // ── States ────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="animate-spin rounded-full h-11 w-11 border-b-2 border-teal-500" />
        </div>
    )
    if (!essay) return null

    // ── Rubric panel JSX ──────────────────────────────────────────────────────
    const rubricPanel = (
        <div className="p-4 bg-slate-50 space-y-0">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <p className="text-base font-bold text-slate-900 mb-0.5">Writing Development Rubric</p>
                    <p className="text-xs text-slate-500">Teacher assessment — click a score range to select it.</p>
                </div>
                <div className={`text-sm font-bold px-3 py-1 rounded-full border ${allScored
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {ASPECTS.filter(a => scores[a.id]).length}/{ASPECTS.length} scored
                </div>
            </div>

            {error && (
                <div className="mb-3 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>
            )}
            {success && (
                <div className="mb-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                    ✅ {success}
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
                        missing={submitAttempted && !scores[aspect.id]}
                    />
                ))}

                {/* Total score */}
                <div className="border border-slate-200 rounded-xl bg-white p-4 mb-3 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Score</p>
                        <p className={`text-3xl font-extrabold leading-none ${allScored ? 'text-teal-600' : 'text-slate-300'}`}>
                            {allScored ? totalScore : '—'}
                        </p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end max-w-[60%]">
                        {ASPECTS.map(a => (
                            <div key={a.id} className="text-center">
                                <div className="text-xs text-slate-400 mb-1">{a.title}</div>
                                <div className={`px-2 py-0.5 rounded text-xs font-bold ${scores[a.id] ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                    {scores[a.id] ? getHighest(scores[a.id]) : '–'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Written feedback */}
                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden mb-3">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                        <span className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0">6</span>
                        <span className="text-sm font-bold text-slate-900">Teacher Feedback</span>
                        <span className="ml-auto text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">Visible to student</span>
                    </div>
                    <div className="p-4">
                        <textarea
                            value={feedback}
                            onChange={e => { setFeedback(e.target.value); setError(null) }}
                            placeholder="Write personalised feedback for this student (at least 10 words). Be specific about what they did well and what to improve."
                            rows={6}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 transition-colors resize-vertical placeholder:text-slate-400"
                        />
                        <p className={`text-xs mt-1.5 ${feedbackValid ? 'text-slate-400' : 'text-red-500'}`}>
                            {wordCount} word{wordCount !== 1 ? 's' : ''}
                            {!feedbackValid && wordCount > 0 && ` · ${10 - wordCount} more needed`}
                        </p>
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${canSubmit
                        ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                >
                    {submitting ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving…</>
                    ) : existingReviewId ? '✏️ Update Feedback' : '💾 Submit Feedback'}
                </button>
            </form>
        </div>
    )

    // ── Layout (mirrors student review page exactly) ──────────────────────────
    return (
        <TeacherLayout title="Essay Feedback">
            {/* Back link */}
            <div className="px-4 pt-4 pb-0">
                <Link
                    href={`/teacher/${essay.studentId}`}
                    className="text-slate-400 hover:text-slate-700 transition-colors text-sm flex items-center gap-1.5 inline-flex"
                >
                    ← Back to Student Profile
                </Link>
            </div>

            {/* Mobile tabs */}
            {isMobile && (
                <div className="flex bg-white border-b border-slate-200 mt-3">
                    {(['essay', 'rubric'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-3 text-sm font-semibold capitalize transition-colors border-b-2 ${activeTab === tab
                                ? 'text-teal-600 border-teal-600'
                                : 'text-slate-500 border-transparent'}`}
                        >
                            {tab === 'essay' ? '📄 Essay' : '📋 Rubric'}
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            {isMobile ? (
                <div className="flex-1 overflow-auto">
                    {activeTab === 'essay' ? (
                        <EssayPanel
                            essay={essay}
                            annotations={annotations}
                            canEditAnnotation={(annotation) => annotation.authorId === auth.currentUser?.uid}
                            onCreateAnnotation={async (draft, note) => {
                                if (!auth.currentUser) return
                                await createEssayAnnotation({
                                    essayId,
                                    authorId: auth.currentUser.uid,
                                    authorName: auth.currentUser.displayName || 'Teacher',
                                    authorRole: 'teacher',
                                    draft,
                                    note,
                                })
                            }}
                            onUpdateAnnotation={(annotation, note) => updateEssayAnnotation(annotation.id, note)}
                            onDeleteAnnotation={(annotation) => deleteEssayAnnotation(annotation.id)}
                        />
                    ) : rubricPanel}
                </div>
            ) : (
                <div className="grid grid-cols-2 h-full overflow-hidden">
                    <div className="overflow-auto border-r border-slate-200">
                        <EssayPanel
                            essay={essay}
                            annotations={annotations}
                            canEditAnnotation={(annotation) => annotation.authorId === auth.currentUser?.uid}
                            onCreateAnnotation={async (draft, note) => {
                                if (!auth.currentUser) return
                                await createEssayAnnotation({
                                    essayId,
                                    authorId: auth.currentUser.uid,
                                    authorName: auth.currentUser.displayName || 'Teacher',
                                    authorRole: 'teacher',
                                    draft,
                                    note,
                                })
                            }}
                            onUpdateAnnotation={(annotation, note) => updateEssayAnnotation(annotation.id, note)}
                            onDeleteAnnotation={(annotation) => deleteEssayAnnotation(annotation.id)}
                        />
                    </div>
                    <div className="overflow-auto">
                        {rubricPanel}
                    </div>
                </div>
            )}
        </TeacherLayout>
    )
}

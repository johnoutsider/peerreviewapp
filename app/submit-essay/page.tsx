'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, Timestamp, doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { assignPeerReviewers } from '@/lib/peer-assignment'
import Header from '@/components/Header'
import Alert from '@/components/Alert'
import DeadlineBanner from '@/components/DeadlineBanner'
import EssayEditor from '@/components/EssayEditor'
import EssayTimer, { TimerResult } from '@/components/EssayTimer'
import EssayAssistant from '@/components/EssayAssistant'
import AiDetectorModal from '@/components/AiDetectorModal'
import { getUserProfile } from '@/lib/auth'

interface Topic {
    id: string
    name: string
    essayDeadline?: Timestamp | null
    reviewDeadline?: Timestamp | null
}

export default function SubmitEssay() {
    const router = useRouter()
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [topicId, setTopicId] = useState('')
    const [topicName, setTopicName] = useState('')
    const [topics, setTopics] = useState<Topic[]>([])
    const [loadingTopics, setLoadingTopics] = useState(true)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [aiDetectorState, setAiDetectorState] = useState<'checking' | 'rejected' | null>(null)
    const [evaOpen, setEvaOpen] = useState(false)

    // Timer (optional)
    const [timerResult, setTimerResult] = useState<TimerResult>({ durationMinutes: null, elapsedSeconds: 0 })
    const handleTimerUpdate = useCallback((r: TimerResult) => setTimerResult(r), [])

    // EVA access
    const [evaAllowed, setEvaAllowed] = useState(false)

    useEffect(() => {
        const fetchTopics = async () => {
            try {
                const q = query(collection(db, 'topics'), orderBy('createdAt', 'desc'))
                const snapshot = await getDocs(q)
                const data = snapshot.docs.map(d => ({
                    id: d.id,
                    name: (d.data() as any).name,
                    essayDeadline: (d.data() as any).essayDeadline ?? null,
                    reviewDeadline: (d.data() as any).reviewDeadline ?? null,
                })) as Topic[]
                setTopics(data)
            } catch (err) {
                console.error('Error fetching topics:', err)
            } finally {
                setLoadingTopics(false)
            }
        }

        const checkEvaAccess = () => {
            // Use onAuthStateChanged so we wait for Firebase Auth to fully initialize
            // (auth.currentUser is null on first render before Auth resolves)
            const unsub = onAuthStateChanged(auth, async (user) => {
                unsub() // only need the resolved state once
                if (!user) return
                try {
                    const profile = await getUserProfile(user.uid)
                    const group: string = (profile as any)?.groupName || ''
                    if (!group) return
                    const evaDoc = await getDoc(doc(db, 'settings', 'eva'))
                    if (evaDoc.exists()) {
                        const allowed: string[] = evaDoc.data().allowedGroups || []
                        setEvaAllowed(allowed.includes(group))
                    }
                } catch (e) { console.error('EVA check error', e) }
            })
        }

        fetchTopics()
        checkEvaAccess()
    }, [])

    const handleTopicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selected = topics.find(t => t.id === e.target.value)
        setTopicId(e.target.value)
        setTopicName(selected?.name ?? '')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!auth.currentUser) {
            setError('Please sign in first')
            return
        }

        if (!title.trim() || !content.trim()) {
            setError('Please fill in all fields')
            return
        }

        if (!topicId) {
            setError('Please select a topic for your essay')
            return
        }

        setLoading(true)

        // ── Step 0: AI-content detection ──────────────────────────────────
        try {
            setAiDetectorState('checking')
            const detectRes = await fetch('/api/ai-detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    essay_content: content,
                    studentId: auth.currentUser.uid,
                    studentName: auth.currentUser.displayName || 'Student',
                    essayTitle: title.trim(),
                    topicName,
                }),
            })
            const detectData = await detectRes.json()

            if (detectData.verdict === 'ai') {
                // Block submission — show rejection modal
                setAiDetectorState('rejected')
                setLoading(false)
                return
            }

            // Human content — close the checking modal and proceed
            setAiDetectorState(null)
        } catch (detectErr) {
            // If detection fails, log it but allow submission to continue
            console.warn('AI detection error (allowing submission):', detectErr)
            setAiDetectorState(null)
        }
        // ─────────────────────────────────────────────────────────────────

        try {
            // Get user profile for classId
            const userProfile = await getUserProfile(auth.currentUser.uid)
            if (!userProfile) {
                setError('User profile not found. Please try signing out and back in.')
                setLoading(false)
                return
            }

            // Step 1: Create essay document
            const essayRef = await addDoc(collection(db, 'essays'), {
                studentId: auth.currentUser.uid,
                studentName: auth.currentUser.displayName || 'Student',
                title,
                content,
                topicId,
                topicName,
                submittedAt: serverTimestamp(),
                status: 'under_review',
                peerReviewIds: [],
                // Timer data (null / 0 if timer wasn't used)
                timerUsed: timerResult.durationMinutes !== null,
                timerDurationMinutes: timerResult.durationMinutes,
                timerElapsedSeconds: timerResult.elapsedSeconds,
            })

            // Step 2: AI assessment — currently disabled
            // Uncomment the block below to re-enable AI feedback on submission
            /*
            try {
                const aiResponse = await fetch('/api/assess-essay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ essayTitle: title, essayContent: content }),
                })
                if (aiResponse.ok) {
                    const aiData = await aiResponse.json()
                    await addDoc(collection(db, 'reviews'), {
                        essayId: essayRef.id,
                        reviewerId: 'ai-examiner',
                        reviewerName: 'AI Examiner',
                        reviewerRole: 'ai',
                        scores: aiData.assessment.scores,
                        feedback: aiData.assessment.feedback,
                        completedAt: serverTimestamp(),
                        overallBand: aiData.assessment.overallBand,
                        dimensions: aiData.assessment.dimensions,
                        topActions: aiData.assessment.topActions,
                    })
                }
            } catch (aiError) {
                console.error('AI assessment failed:', aiError)
            }
            */

            // Step 3: Assign peer reviewers
            await assignPeerReviewers(essayRef.id, auth.currentUser.uid, userProfile.classId)

            setSuccess('Essay submitted successfully! Redirecting...')

            // Delay redirect to show success message
            setTimeout(() => {
                router.push('/my-essays')
            }, 2000)

        } catch (error) {
            console.error('Submission error:', error)
            setError('Submission failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const wordCount = content.trim().split(/\s+/).filter(w => w).length

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {/* AI Detector Modal — shown while checking or when rejected */}
            <AiDetectorModal
                state={aiDetectorState}
                onDismiss={() => setAiDetectorState(null)}
            />
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-3xl">
                <div className="mb-6">
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Submit Essay</h1>
                    <p className="text-slate-500 dark:text-gray-400">Your essay will be reviewed by 3 peers</p>
                </div>

                {/* Essay form — centered, full width */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 sm:p-8 border border-slate-200 dark:border-white/10 shadow-sm">
                    {/* Alerts */}
                    {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                    {success && <Alert type="success" message={success} />}

                    <form onSubmit={handleSubmit}>
                        {/* Topic Dropdown */}
                        <div className="mb-6">
                            <label className="block text-slate-900 dark:text-white font-semibold mb-2">
                                Essay Topic <span className="text-red-400">*</span>
                            </label>
                            {loadingTopics ? (
                                <div className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 text-slate-500 dark:text-gray-400 flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                                    Loading topics…
                                </div>
                            ) : topics.length === 0 ? (
                                <div className="w-full bg-white dark:bg-slate-800 border border-yellow-500/40 rounded-lg px-4 py-3 text-yellow-400 text-sm">
                                    ⚠️ No topics available yet. Ask your teacher to add topics first.
                                </div>
                            ) : (
                                <>
                                    <select
                                        value={topicId}
                                        onChange={handleTopicChange}
                                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors mb-3"
                                        required
                                    >
                                        <option value="" disabled>Select a topic…</option>
                                        {topics.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    {topicId && (() => {
                                        const t = topics.find(x => x.id === topicId)
                                        const essayD = t?.essayDeadline ? t.essayDeadline.toDate() : null
                                        const reviewD = t?.reviewDeadline ? t.reviewDeadline.toDate() : null
                                        return (
                                            <div className="space-y-2">
                                                <DeadlineBanner label="Essay Submission" deadline={essayD} emoji="📝" />
                                                <DeadlineBanner label="Peer Review" deadline={reviewD} emoji="👥" />
                                                {essayD && essayD.getTime() < Date.now() && (
                                                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm font-medium">
                                                        ⚠️ The essay submission deadline for this topic has passed. You may still submit, but contact your teacher.
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </>
                            )}
                        </div>

                        <div className="mb-6">
                            <label className="block text-slate-900 dark:text-white font-semibold mb-2">Essay Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g., The Impact of Technology on Education"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                required
                            />
                        </div>

                        {/* ── Optional Timer ── */}
                        <EssayTimer onUpdate={handleTimerUpdate} />

                        <div className="mb-6">
                            <label className="block text-slate-900 dark:text-white font-semibold mb-2">Essay Content</label>
                            <EssayEditor
                                value={content}
                                onChange={setContent}
                                placeholder="Write your essay here. Minimum 250 words recommended."
                            />
                        </div>

                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                            <h3 className="text-blue-400 font-semibold mb-2">📌 What happens next?</h3>
                            <ul className="text-slate-600 dark:text-gray-300 text-sm space-y-1">
                                <li>✓ You&apos;ll receive instant AI feedback and scoring (within 10 seconds!)</li>
                                <li>✓ Your essay will be assigned to 3 classmates for peer review</li>
                                <li>✓ You&apos;ll receive comprehensive feedback within a few days</li>
                                <li>✓ Final score includes AI, peer, and teacher assessments</li>
                            </ul>
                        </div>

                        <div className="pt-4 pb-4">
                            <button
                                type="submit"
                                disabled={loading || !topicId}
                                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold text-xl py-5 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-blue-500/20"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                        Submitting &amp; Analyzing...
                                    </>
                                ) : (
                                    'Submit Essay'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>

            {/* ── EVA floating button + popup — only for groups with access ── */}
            {evaAllowed && (
                <>
                    {/* Backdrop (mobile: closes popup when tapping outside) */}
                    {evaOpen && (
                        <div
                            className="fixed inset-0 z-30 bg-black/20 sm:hidden"
                            onClick={() => setEvaOpen(false)}
                        />
                    )}

                    {/* Slide-up popup panel */}
                    <div
                        className={[
                            'fixed z-40 right-4 bottom-20 w-[calc(100vw-2rem)] sm:w-96 transition-all duration-300 ease-in-out',
                            evaOpen
                                ? 'opacity-100 translate-y-0 pointer-events-auto'
                                : 'opacity-0 translate-y-4 pointer-events-none',
                        ].join(' ')}
                    >
                        <EssayAssistant essayContent={content} />
                    </div>

                    {/* Fixed floating button */}
                    <button
                        type="button"
                        onClick={() => setEvaOpen(o => !o)}
                        className="fixed z-50 bottom-5 right-4 flex items-center gap-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold px-4 py-3 rounded-2xl shadow-lg shadow-blue-500/40 transition-all"
                    >
                        <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-blue-500 font-extrabold text-xs shrink-0">
                            EVA
                        </span>
                        <span className="text-sm">EVA Assistant</span>
                        <span className="text-xs opacity-80">{evaOpen ? '▼' : '▲'}</span>
                    </button>
                </>
            )}
        </div>
    )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, Timestamp } from 'firebase/firestore'
import { assignPeerReviewers } from '@/lib/peer-assignment'
import Header from '@/components/Header'
import Alert from '@/components/Alert'
import DeadlineBanner from '@/components/DeadlineBanner'
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
        fetchTopics()
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

            setSuccess('Essay submitted successfully! AI is analyzing your work... Redirecting...')

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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">Submit Essay</h1>
                    <p className="text-gray-400">Your essay will be reviewed by 3 peers</p>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-white/10">
                    {/* Alerts */}
                    {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                    {success && <Alert type="success" message={success} />}

                    <form onSubmit={handleSubmit}>
                        {/* Topic Dropdown */}
                        <div className="mb-6">
                            <label className="block text-white font-semibold mb-2">
                                Essay Topic <span className="text-red-400">*</span>
                            </label>
                            {loadingTopics ? (
                                <div className="w-full bg-slate-700/50 border border-white/20 rounded-lg px-4 py-3 text-gray-400 flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                                    Loading topics…
                                </div>
                            ) : topics.length === 0 ? (
                                <div className="w-full bg-slate-700/50 border border-yellow-500/40 rounded-lg px-4 py-3 text-yellow-400 text-sm">
                                    ⚠️ No topics available yet. Ask your teacher to add topics first.
                                </div>
                            ) : (
                                <>
                                    <select
                                        value={topicId}
                                        onChange={handleTopicChange}
                                        className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors mb-3"
                                        required
                                    >
                                        <option value="" disabled>Select a topic…</option>
                                        {topics.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    {/* Deadline banners shown after topic selection */}
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
                            <label className="block text-white font-semibold mb-2">Essay Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g., The Impact of Technology on Education"
                                className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                required
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-white font-semibold mb-2">Essay Content</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Paste or type your essay here (minimum 250 words recommended)..."
                                rows={15}
                                className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                required
                            />
                            <div className="mt-2 flex items-center justify-between">
                                <span className={`text-sm font-medium ${wordCount >= 250 ? 'text-green-400' : wordCount >= 150 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    📝 {wordCount} words
                                    {wordCount < 250 && wordCount > 0 && (
                                        <span className="ml-2 text-gray-400">({250 - wordCount} more to reach minimum)</span>
                                    )}
                                    {wordCount >= 250 && <span className="ml-2">✓ Minimum met</span>}
                                </span>
                            </div>
                        </div>

                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                            <h3 className="text-blue-400 font-semibold mb-2">📌 What happens next?</h3>
                            <ul className="text-gray-300 text-sm space-y-1">
                                <li>✓ You&apos;ll receive instant AI feedback and scoring (within 10 seconds!)</li>
                                <li>✓ Your essay will be assigned to 3 classmates for peer review</li>
                                <li>✓ You&apos;ll receive comprehensive feedback within a few days</li>
                                <li>✓ Final score includes AI, peer, and teacher assessments</li>
                            </ul>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={loading || !topicId}
                                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold text-xl py-5 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-blue-500/20"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                        Submitting &Analyzing...
                                    </>
                                ) : (
                                    'Submit Essay'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    )
}

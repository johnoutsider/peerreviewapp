'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { assignPeerReviewers } from '@/lib/peer-assignment'
import Header from '@/components/Header'
import Alert from '@/components/Alert'
import { getUserProfile } from '@/lib/auth'

export default function SubmitEssay() {
    const router = useRouter()
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

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

        setLoading(true)

        try {
            // Get user profile for classId
            const userProfile = await getUserProfile(auth.currentUser.uid)
            if (!userProfile) {
                setError('User profile not found. Please try signing out and back in.')
                setLoading(false)
                return
            }

            // Step 1: Create essay document (Skipping AI assessment)
            const essayRef = await addDoc(collection(db, 'essays'), {
                studentId: auth.currentUser.uid,
                studentName: auth.currentUser.displayName || 'Student',
                title,
                content,
                submittedAt: serverTimestamp(),
                status: 'under_review',
                // aiAssessment removed
                peerReviewIds: [],
            })

            // Step 2: Assign peer reviewers
            await assignPeerReviewers(essayRef.id, auth.currentUser.uid, userProfile.classId)

            setSuccess('Essay submitted successfully! Redirecting...')

            // Delay redirect to show success message
            setTimeout(() => {
                router.push('/my-essays')
            }, 1500)

        } catch (error) {
            console.error('Submission error:', error)
            setError('Submission failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
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
                                placeholder="Paste or type your IELTS essay here (minimum 250 words recommended)..."
                                rows={15}
                                className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                required
                            />
                            <div className="mt-2 text-sm text-gray-400">
                                Word count: {content.trim().split(/\s+/).filter(w => w).length}
                            </div>
                        </div>

                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
                            <h3 className="text-blue-400 font-semibold mb-2">📌 What happens next?</h3>
                            <ul className="text-gray-300 text-sm space-y-1">
                                <li>✓ Your essay will be assigned to 3 classmates for peer review</li>
                                <li>✓ You&apos;ll receive comprehensive feedback within a few days</li>
                                <li>✓ Final score depends on peer assessments</li>
                            </ul>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-4 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    Submitting & Analyzing...
                                </>
                            ) : (
                                'Submit Essay'
                            )}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    )
}

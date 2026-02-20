'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

export default function EditEssay() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [locked, setLocked] = useState(false)

    useEffect(() => {
        const fetchEssay = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                const essayDoc = await getDoc(doc(db, 'essays', essayId))

                if (!essayDoc.exists()) {
                    setError('Essay not found.')
                    setLoading(false)
                    return
                }

                const essayData = essayDoc.data()

                // Only the essay owner can edit
                if (essayData.studentId !== auth.currentUser.uid) {
                    router.push('/my-essays')
                    return
                }

                // Check if any reviews exist — if so, lock editing
                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('essayId', '==', essayId)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)

                if (!reviewsSnapshot.empty) {
                    setLocked(true)
                    setLoading(false)
                    return
                }

                setTitle(essayData.title || '')
                setContent(essayData.content || '')
            } catch (err) {
                console.error('Error loading essay:', err)
                setError('Failed to load essay.')
            } finally {
                setLoading(false)
            }
        }

        fetchEssay()
    }, [essayId, router])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!title.trim() || !content.trim()) {
            setError('Please fill in all fields.')
            return
        }

        setSaving(true)

        try {
            // Double-check: ensure still no reviews before saving
            const reviewsQuery = query(
                collection(db, 'reviews'),
                where('essayId', '==', essayId)
            )
            const reviewsSnapshot = await getDocs(reviewsQuery)

            if (!reviewsSnapshot.empty) {
                setLocked(true)
                setError('A review was just submitted — this essay can no longer be edited.')
                setSaving(false)
                return
            }

            await updateDoc(doc(db, 'essays', essayId), {
                title: title.trim(),
                content: content.trim(),
                updatedAt: serverTimestamp(),
            })

            setSuccess('Essay updated! Redirecting...')
            setTimeout(() => router.push('/my-essays'), 1500)
        } catch (err) {
            console.error('Error saving essay:', err)
            setError('Failed to save. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (locked) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
                <Header />
                <main className="container mx-auto px-4 py-8 max-w-4xl">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-12 text-center">
                        <div className="text-6xl mb-4">🔒</div>
                        <h2 className="text-2xl font-semibold text-white mb-2">Essay Locked</h2>
                        <p className="text-gray-400 mb-6">
                            This essay has already been reviewed and can no longer be edited or deleted.
                        </p>
                        <button
                            onClick={() => router.push('/my-essays')}
                            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Back to My Essays
                        </button>
                    </div>
                </main>
            </div>
        )
    }

    if (error && !title) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
                <Header />
                <main className="container mx-auto px-4 py-8 max-w-4xl text-center">
                    <p className="text-red-400 text-lg">{error}</p>
                    <button
                        onClick={() => router.push('/my-essays')}
                        className="mt-4 text-blue-400 hover:text-blue-300"
                    >
                        ← Back to My Essays
                    </button>
                </main>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-8">
                    <button
                        onClick={() => router.push('/my-essays')}
                        className="text-gray-400 hover:text-white transition-colors mb-4 flex items-center gap-2"
                    >
                        ← Back to My Essays
                    </button>
                    <h1 className="text-4xl font-bold text-white mb-2">Edit Essay</h1>
                    <p className="text-gray-400">Make your changes before any peer has reviewed your work.</p>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-white/10">
                    {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                    {success && <Alert type="success" message={success} />}

                    <form onSubmit={handleSave}>
                        <div className="mb-6">
                            <label className="block text-white font-semibold mb-2">Essay Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                required
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-white font-semibold mb-2">Essay Content</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={18}
                                className="w-full bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                required
                            />
                            <div className="mt-2 text-sm text-gray-400">
                                Word count: {content.trim().split(/\s+/).filter(w => w).length}
                            </div>
                        </div>

                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
                            <p className="text-amber-300 text-sm">
                                ⚠️ Once a peer reviews your essay, you will no longer be able to make changes.
                            </p>
                        </div>

                        <div className="flex gap-4">
                            <button
                                type="button"
                                onClick={() => router.push('/my-essays')}
                                className="flex-1 bg-slate-700/50 text-gray-300 font-semibold py-4 rounded-lg hover:bg-slate-600/50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-4 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                        Saving...
                                    </>
                                ) : (
                                    'Save Changes'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    )
}

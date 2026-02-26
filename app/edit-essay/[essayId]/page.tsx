'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

interface Topic { id: string; name: string }

export default function EditEssay() {
    const router = useRouter()
    const params = useParams()
    const essayId = params.essayId as string

    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [topicId, setTopicId] = useState('')
    const [topics, setTopics] = useState<Topic[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [savingTopic, setSavingTopic] = useState(false)
    const [isReviewed, setIsReviewed] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        const fetchEssay = async () => {
            if (!auth.currentUser) { router.push('/'); return }

            try {
                // Load topics
                const topicsSnap = await getDocs(query(collection(db, 'topics'), orderBy('createdAt', 'desc')))
                setTopics(topicsSnap.docs.map(d => ({ id: d.id, name: (d.data() as any).name })))

                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (!essayDoc.exists()) { setError('Essay not found.'); setLoading(false); return }

                const data = essayDoc.data()
                if (data.studentId !== auth.currentUser.uid) { router.push('/my-essays'); return }

                // Check reviews
                const reviewsSnap = await getDocs(query(collection(db, 'reviews'), where('essayId', '==', essayId)))
                setIsReviewed(!reviewsSnap.empty)

                setTitle(data.title || '')
                setContent(data.content || '')
                setTopicId(data.topicId || '')
            } catch (err) {
                setError('Failed to load essay.')
            } finally {
                setLoading(false)
            }
        }
        fetchEssay()
    }, [essayId, router])

    // Save content + title (only when not reviewed)
    const handleSaveContent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim() || !content.trim()) { setError('Please fill in all fields.'); return }
        setSaving(true); setError(null)
        try {
            // Double-check
            const reviewsSnap = await getDocs(query(collection(db, 'reviews'), where('essayId', '==', essayId)))
            if (!reviewsSnap.empty) { setIsReviewed(true); setError('A review was just submitted — content is now locked.'); setSaving(false); return }

            await updateDoc(doc(db, 'essays', essayId), { title: title.trim(), content: content.trim(), updatedAt: serverTimestamp() })
            setSuccess('Essay saved!')
            setTimeout(() => router.push('/my-essays'), 1500)
        } catch (err) {
            setError('Failed to save. Please try again.')
        } finally { setSaving(false) }
    }

    // Save topic only (always allowed)
    const handleSaveTopic = async () => {
        setSavingTopic(true); setError(null)
        try {
            const selectedTopic = topics.find(t => t.id === topicId)
            await updateDoc(doc(db, 'essays', essayId), {
                topicId: topicId || null,
                topicName: selectedTopic?.name || null,
                updatedAt: serverTimestamp(),
            })
            setSuccess('Topic updated!')
            setTimeout(() => setSuccess(null), 2000)
        } catch (err) {
            setError('Failed to update topic.')
        } finally { setSavingTopic(false) }
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    if (error && !title) return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8 max-w-4xl text-center">
                <p className="text-red-400 text-lg">{error}</p>
                <button onClick={() => router.push('/my-essays')} className="mt-4 text-blue-400 hover:text-blue-300">← Back to My Essays</button>
            </main>
        </div>
    )

    const wordCount = content.trim().split(/\s+/).filter(w => w).length

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-8">
                    <button onClick={() => router.push('/my-essays')} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white transition-colors mb-4 flex items-center gap-2">
                        ← Back to My Essays
                    </button>
                    <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Edit Essay</h1>
                    <p className="text-slate-500 dark:text-gray-400">
                        {isReviewed
                            ? '🔒 Content is locked after review — but you can still change the topic below.'
                            : 'Make your changes before any peer has reviewed your work.'}
                    </p>
                </div>

                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

                {/* ── Topic (always editable) ── */}
                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm mb-6">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">🏷️ Topic <span className="text-green-400 text-sm font-normal">(always editable)</span></h2>
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <select
                                value={topicId}
                                onChange={e => setTopicId(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 transition-colors"
                            >
                                <option value="">— No topic selected —</option>
                                {topics.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={handleSaveTopic}
                            disabled={savingTopic}
                            className="shrink-0 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {savingTopic ? 'Saving…' : 'Save Topic'}
                        </button>
                    </div>
                </div>

                {/* ── Content (locked if reviewed) ── */}
                <div className={`bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-8 border ${isReviewed ? 'border-yellow-500/30' : 'border-slate-200 dark:border-white/10 shadow-sm'}`}>
                    <div className="flex items-center gap-3 mb-6">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">📝 Essay Content</h2>
                        {isReviewed && (
                            <span className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                                🔒 Locked — already reviewed
                            </span>
                        )}
                    </div>

                    <form onSubmit={handleSaveContent}>
                        <div className="mb-6">
                            <label className="block text-slate-900 dark:text-white font-semibold mb-2">Essay Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                disabled={isReviewed}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                required
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-slate-900 dark:text-white font-semibold mb-2">Essay Content</label>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                rows={18}
                                disabled={isReviewed}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors resize-none disabled:opacity-40 disabled:cursor-not-allowed"
                                required
                            />
                            <div className="mt-2 text-sm text-slate-500 dark:text-gray-400">Word count: {wordCount}</div>
                        </div>

                        {isReviewed ? (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                                <p className="text-yellow-300 text-sm">🔒 This essay has been reviewed. The content and title can no longer be changed, but you can update the topic above at any time.</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
                                    <p className="text-amber-300 text-sm">⚠️ Once a peer reviews your essay, the content will be permanently locked.</p>
                                </div>
                                <div className="flex gap-4">
                                    <button type="button" onClick={() => router.push('/my-essays')} className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 font-semibold py-4 rounded-lg hover:bg-slate-600/50 transition-all">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={saving} className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-4 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                        {saving ? <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />Saving...</> : 'Save Changes'}
                                    </button>
                                </div>
                            </>
                        )}
                    </form>
                </div>
            </main>
        </div>
    )
}

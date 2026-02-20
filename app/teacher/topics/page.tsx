'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    query,
    orderBy,
} from 'firebase/firestore'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

interface Topic {
    id: string
    name: string
    createdAt: any
}

export default function ManageTopics() {
    const router = useRouter()
    const [topics, setTopics] = useState<Topic[]>([])
    const [newTopic, setNewTopic] = useState('')
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        if (!auth.currentUser) {
            router.push('/')
            return
        }

        // Real-time listener so new topics appear instantly
        const q = query(collection(db, 'topics'), orderBy('createdAt', 'desc'))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Topic[]
            setTopics(data)
            setLoading(false)
        }, (err) => {
            console.error('Error loading topics:', err)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [router])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        const name = newTopic.trim()
        if (!name) return
        if (topics.some(t => t.name.toLowerCase() === name.toLowerCase())) {
            setError('A topic with this name already exists.')
            return
        }

        setAdding(true)
        setError(null)
        try {
            await addDoc(collection(db, 'topics'), {
                name,
                createdBy: auth.currentUser!.uid,
                createdAt: serverTimestamp(),
            })
            setNewTopic('')
            setSuccess(`Topic "${name}" added successfully!`)
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            console.error('Error adding topic:', err)
            setError('Failed to add topic. Please try again.')
        } finally {
            setAdding(false)
        }
    }

    const handleDelete = async (topicId: string, topicName: string) => {
        if (!confirm(`Delete topic "${topicName}"? Essays already submitted under this topic will keep their category, but new essays cannot be submitted under it.`)) return
        try {
            await deleteDoc(doc(db, 'topics', topicId))
        } catch (err) {
            console.error('Error deleting topic:', err)
            setError('Failed to delete topic.')
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-3xl">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <button
                            onClick={() => router.push('/teacher')}
                            className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2 transition-colors"
                        >
                            ← Teacher Dashboard
                        </button>
                        <h1 className="text-4xl font-bold text-white">Manage Topics</h1>
                        <p className="text-gray-400 mt-1">Create essay topics that students choose when submitting</p>
                    </div>
                    <div className="text-5xl">🏷️</div>
                </div>

                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && <Alert type="success" message={success} />}

                {/* Add Topic Form */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 mb-8">
                    <h2 className="text-xl font-semibold text-white mb-4">Add New Topic</h2>
                    <form onSubmit={handleAdd} className="flex gap-3">
                        <input
                            type="text"
                            value={newTopic}
                            onChange={e => setNewTopic(e.target.value)}
                            placeholder="e.g. Environment & Climate, Technology, Health…"
                            className="flex-1 bg-slate-700/50 text-white border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                            maxLength={80}
                        />
                        <button
                            type="submit"
                            disabled={adding || !newTopic.trim()}
                            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold px-6 py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {adding ? 'Adding…' : '+ Add Topic'}
                        </button>
                    </form>
                </div>

                {/* Topics List */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">All Topics</h2>
                        <span className="text-sm text-gray-400">{topics.length} topic{topics.length !== 1 ? 's' : ''}</span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                        </div>
                    ) : topics.length === 0 ? (
                        <div className="py-16 text-center text-gray-500">
                            <div className="text-5xl mb-4">🗂️</div>
                            <p>No topics yet. Add your first one above!</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-white/10">
                            {topics.map(topic => (
                                <li
                                    key={topic.id}
                                    className="flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                        <span className="text-white font-medium">{topic.name}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(topic.id, topic.name)}
                                        className="text-red-400 hover:text-red-300 text-sm opacity-0 group-hover:opacity-100 transition-all px-3 py-1 rounded hover:bg-red-500/10"
                                    >
                                        Delete
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <p className="text-gray-500 text-sm mt-4 text-center">
                    💡 Deleting a topic won't affect essays already submitted under it.
                </p>
            </main>
        </div>
    )
}

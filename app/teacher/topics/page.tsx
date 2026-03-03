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
    updateDoc,
    writeBatch,
    Timestamp,
} from 'firebase/firestore'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

interface Topic {
    id: string
    name: string
    createdAt: any
    order?: number
    essayDeadline?: Timestamp | null
    reviewDeadline?: Timestamp | null
}

// Format a Firestore Timestamp (or null) to "YYYY-MM-DDTHH:MM" for <input type="datetime-local">
function tsToDateStr(ts?: Timestamp | null): string {
    if (!ts) return ''
    const d = ts.toDate()
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ManageTopics() {
    const router = useRouter()
    const [topics, setTopics] = useState<Topic[]>([])
    const [newTopic, setNewTopic] = useState('')
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [reordering, setReordering] = useState(false)

    // Per-topic deadline editing state
    const [editing, setEditing] = useState<Record<string, { essayDeadline: string; reviewDeadline: string; saving: boolean }>>({})

    // Per-topic name renaming state
    const [renaming, setRenaming] = useState<Record<string, { value: string; active: boolean; saving: boolean }>>({})

    useEffect(() => {
        if (!auth.currentUser) { router.push('/'); return }

        // Load by createdAt (guaranteed to exist), sort locally by `order` if set
        const q = query(collection(db, 'topics'), orderBy('createdAt', 'asc'))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Topic[]
            // Sort by `order` field if present, otherwise keep createdAt order
            const sorted = [...data].sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) return a.order - b.order
                if (a.order !== undefined) return -1
                if (b.order !== undefined) return 1
                return 0
            })
            setTopics(sorted)
            setEditing(prev => {
                const next = { ...prev }
                data.forEach(t => {
                    if (!next[t.id]) {
                        next[t.id] = {
                            essayDeadline: tsToDateStr(t.essayDeadline),
                            reviewDeadline: tsToDateStr(t.reviewDeadline),
                            saving: false,
                        }
                    }
                })
                return next
            })
            setLoading(false)
        }, (err) => {
            console.error('Error loading topics:', err)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [router])

    // ── Move up / down ─────────────────────────────────────────────
    const movetopic = async (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1
        if (newIndex < 0 || newIndex >= topics.length) return
        const next = [...topics]
            ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
        setTopics(next)
        setReordering(true)
        try {
            const batch = writeBatch(db)
            next.forEach((topic, idx) => {
                batch.update(doc(db, 'topics', topic.id), { order: idx })
            })
            await batch.commit()
        } catch (err) {
            console.error('Error saving order:', err)
            setError('Failed to save order.')
        } finally {
            setReordering(false)
        }
    }

    // ── CRUD handlers ──────────────────────────────────────────────
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
            // New topic goes to the end
            await addDoc(collection(db, 'topics'), {
                name,
                createdBy: auth.currentUser!.uid,
                createdAt: serverTimestamp(),
                order: topics.length,
                essayDeadline: null,
                reviewDeadline: null,
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
        if (!confirm(`Delete topic "${topicName}"? Essays already submitted under this topic will keep their category.`)) return
        try {
            await deleteDoc(doc(db, 'topics', topicId))
        } catch (err) {
            console.error('Error deleting topic:', err)
            setError('Failed to delete topic.')
        }
    }

    const handleSaveDeadlines = async (topicId: string) => {
        const state = editing[topicId]
        if (!state) return
        setEditing(prev => ({ ...prev, [topicId]: { ...prev[topicId], saving: true } }))
        try {
            const toTimestamp = (dateStr: string) =>
                dateStr ? Timestamp.fromDate(new Date(dateStr)) : null

            await updateDoc(doc(db, 'topics', topicId), {
                essayDeadline: toTimestamp(state.essayDeadline),
                reviewDeadline: toTimestamp(state.reviewDeadline),
            })
            setSuccess('Deadlines saved!')
            setTimeout(() => setSuccess(null), 2500)
        } catch (err) {
            console.error('Error saving deadlines:', err)
            setError('Failed to save deadlines.')
        } finally {
            setEditing(prev => ({ ...prev, [topicId]: { ...prev[topicId], saving: false } }))
        }
    }

    const setField = (topicId: string, field: 'essayDeadline' | 'reviewDeadline', value: string) => {
        setEditing(prev => ({ ...prev, [topicId]: { ...prev[topicId], [field]: value } }))
    }

    const startRename = (topic: Topic) => {
        setRenaming(prev => ({ ...prev, [topic.id]: { value: topic.name, active: true, saving: false } }))
    }

    const cancelRename = (topicId: string) => {
        setRenaming(prev => ({ ...prev, [topicId]: { ...prev[topicId], active: false } }))
    }

    const handleRenameTopic = async (topicId: string) => {
        const state = renaming[topicId]
        if (!state) return
        const newName = state.value.trim()
        if (!newName) { setError('Topic name cannot be empty.'); return }
        if (topics.some(t => t.id !== topicId && t.name.toLowerCase() === newName.toLowerCase())) {
            setError('A topic with this name already exists.')
            return
        }
        setRenaming(prev => ({ ...prev, [topicId]: { ...prev[topicId], saving: true } }))
        try {
            await updateDoc(doc(db, 'topics', topicId), { name: newName })
            setRenaming(prev => ({ ...prev, [topicId]: { value: newName, active: false, saving: false } }))
            setSuccess('Topic name updated!')
            setTimeout(() => setSuccess(null), 2500)
        } catch (err) {
            console.error('Error renaming topic:', err)
            setError('Failed to rename topic.')
            setRenaming(prev => ({ ...prev, [topicId]: { ...prev[topicId], saving: false } }))
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-3xl">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <button
                            onClick={() => router.push('/teacher')}
                            className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white text-sm flex items-center gap-1 mb-2 transition-colors"
                        >
                            ← Teacher Dashboard
                        </button>
                        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Manage Topics</h1>
                        <p className="text-slate-500 dark:text-gray-400 mt-1">Create topics, set deadlines, and drag to reorder</p>
                    </div>
                    <div className="text-5xl">🏷️</div>
                </div>

                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && <Alert type="success" message={success} />}

                {/* Add Topic Form */}
                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm mb-8">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Add New Topic</h2>
                    <form onSubmit={handleAdd} className="flex gap-3">
                        <input
                            type="text"
                            value={newTopic}
                            onChange={e => setNewTopic(e.target.value)}
                            placeholder="e.g. Environment & Climate, Technology, Health…"
                            className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
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
                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">All Topics</h2>
                        <div className="flex items-center gap-3">
                            {reordering && (
                                <span className="text-xs text-blue-400 flex items-center gap-1.5">
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400" />
                                    Saving order…
                                </span>
                            )}
                            <span className="text-sm text-slate-500 dark:text-gray-400">{topics.length} topic{topics.length !== 1 ? 's' : ''}</span>
                        </div>
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
                        <ul className="divide-y divide-slate-100 dark:divide-white/10">
                            {topics.map((topic, index) => {
                                const ed = editing[topic.id] || { essayDeadline: '', reviewDeadline: '', saving: false }
                                const essayD = ed.essayDeadline ? new Date(ed.essayDeadline) : null
                                const reviewD = ed.reviewDeadline ? new Date(ed.reviewDeadline) : null
                                const now = Date.now()

                                const deadlinePill = (d: Date | null, label: string, color: string) => {
                                    if (!d) return <span className={`text-xs text-gray-500`}>No {label} deadline</span>
                                    const days = Math.ceil((d.getTime() - now) / 86400000)
                                    const pastColor = 'text-red-400'
                                    const cl = days <= 0 ? pastColor : days <= 3 ? 'text-orange-400' : days <= 7 ? 'text-yellow-400' : `text-${color}-400`
                                    return <span className={`text-xs font-medium ${cl}`}>{days <= 0 ? '🔒 Expired' : `⏳ ${days}d left`} · {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                }

                                return (
                                    <li
                                        key={topic.id}
                                        className="px-6 py-5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                                    >
                                        {/* Row 1: drag handle + name + rename + delete */}
                                        {(() => {
                                            const rn = renaming[topic.id]
                                            const isRenaming = rn?.active
                                            return (
                                                <div className="flex items-center justify-between mb-3 gap-2">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <div className="flex flex-col gap-0.5 shrink-0">
                                                            <button
                                                                onClick={() => movetopic(index, 'up')}
                                                                disabled={index === 0 || reordering}
                                                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs"
                                                                title="Move up"
                                                            >▲</button>
                                                            <button
                                                                onClick={() => movetopic(index, 'down')}
                                                                disabled={index === topics.length - 1 || reordering}
                                                                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-600 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs"
                                                                title="Move down"
                                                            >▼</button>
                                                        </div>
                                                        <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                                        {isRenaming ? (
                                                            <div className="flex items-center gap-2 flex-1">
                                                                <input
                                                                    autoFocus
                                                                    value={rn.value}
                                                                    onChange={e => setRenaming(prev => ({ ...prev, [topic.id]: { ...prev[topic.id], value: e.target.value } }))}
                                                                    onKeyDown={e => { if (e.key === 'Enter') handleRenameTopic(topic.id); if (e.key === 'Escape') cancelRename(topic.id) }}
                                                                    className="flex-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-white border border-blue-500 rounded-lg px-3 py-1.5 text-base font-semibold focus:outline-none"
                                                                    maxLength={80}
                                                                />
                                                                <button
                                                                    onClick={() => handleRenameTopic(topic.id)}
                                                                    disabled={rn.saving}
                                                                    className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
                                                                >
                                                                    {rn.saving ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />Saving…</> : '✓ Save'}
                                                                </button>
                                                                <button
                                                                    onClick={() => cancelRename(topic.id)}
                                                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <span className="text-slate-900 dark:text-white font-semibold text-lg truncate">{topic.name}</span>
                                                                <button
                                                                    onClick={() => startRename(topic)}
                                                                    title="Edit topic name"
                                                                    className="text-slate-400 hover:text-blue-400 transition-colors p-1 rounded"
                                                                >
                                                                    ✏️
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                    {!isRenaming && (
                                                        <button
                                                            onClick={() => handleDelete(topic.id, topic.name)}
                                                            className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded hover:bg-red-500/10 transition-all shrink-0"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })()}

                                        {/* Row 2: deadline pickers */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
                                            <div className="bg-slate-100 dark:bg-slate-900/50/40 rounded-lg p-3 border border-slate-200 dark:border-white/10 shadow-sm">
                                                <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
                                                    📝 Essay Submission Deadline
                                                </label>
                                                {deadlinePill(essayD, 'essay', 'blue')}
                                                <input
                                                    type="datetime-local"
                                                    value={ed.essayDeadline}
                                                    onChange={e => setField(topic.id, 'essayDeadline', e.target.value)}
                                                    className="mt-2 w-full bg-slate-600/50 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            <div className="bg-slate-100 dark:bg-slate-900/50/40 rounded-lg p-3 border border-slate-200 dark:border-white/10 shadow-sm">
                                                <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
                                                    👥 Peer Review Deadline
                                                </label>
                                                {deadlinePill(reviewD, 'review', 'purple')}
                                                <input
                                                    type="datetime-local"
                                                    value={ed.reviewDeadline}
                                                    onChange={e => setField(topic.id, 'reviewDeadline', e.target.value)}
                                                    className="mt-2 w-full bg-slate-600/50 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>

                                        {/* Row 3: save button */}
                                        <div className="mt-3 flex justify-end pl-7">
                                            <button
                                                onClick={() => handleSaveDeadlines(topic.id)}
                                                disabled={ed.saving}
                                                className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {ed.saving
                                                    ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-300" />Saving…</>
                                                    : '💾 Save Deadlines'}
                                            </button>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                <p className="text-gray-500 text-sm mt-4 text-center">
                    💡 Drag topics to reorder · Deleting a topic won't affect essays already submitted under it
                </p>
            </main>
        </div>
    )
}

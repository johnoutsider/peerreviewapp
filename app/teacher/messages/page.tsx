'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
    collection, addDoc, getDocs, serverTimestamp,
    query, orderBy, onSnapshot, where, doc
} from 'firebase/firestore'
import Header from '@/components/Header'
import Alert from '@/components/Alert'

interface Message {
    id: string
    title: string
    body: string
    createdAt: any
    readBy: string[]
    recipients: string[] | null   // null = all students
    replyCount?: number
}

interface Student {
    uid: string
    displayName: string
    groupName: string
    email: string
}

interface Reply {
    id: string
    studentId: string
    studentName: string
    body: string
    createdAt: any
}

export default function TeacherMessages() {
    const router = useRouter()
    const [messages, setMessages] = useState<Message[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [sending, setSending] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Recipient targeting
    const [targetMode, setTargetMode] = useState<'all' | 'selected'>('all')
    const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())
    const [studentSearch, setStudentSearch] = useState('')

    // Expanded message + replies
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [replies, setReplies] = useState<Record<string, Reply[]>>({})
    const [loadingReplies, setLoadingReplies] = useState<string | null>(null)
    const [teacherReplyText, setTeacherReplyText] = useState<Record<string, string>>({})
    const [sendingTeacherReply, setSendingTeacherReply] = useState<string | null>(null)

    useEffect(() => {
        let msgUnsub: (() => void) | null = null
        const authUnsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/'); return }
            try {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)
                if (profile?.role !== 'teacher') { router.push('/dashboard'); return }

                // Load students
                try {
                    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
                    setStudents(snap.docs.map(d => {
                        const data = d.data() as any
                        return {
                            uid: d.id,
                            displayName: data.displayName || data.name || 'Student',
                            groupName: data.groupName || '',
                            email: data.email || '',
                        }
                    }).sort((a, b) => (a.groupName || '').localeCompare(b.groupName || '') || a.displayName.localeCompare(b.displayName)))
                } catch (e) { console.error('Could not load students:', e) }

                // Messages listener
                const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'))
                msgUnsub = onSnapshot(q,
                    snap => {
                        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Message[])
                        setLoading(false)
                    },
                    err => {
                        setError('Could not load messages. Ensure Firestore rules are deployed.')
                        setLoading(false)
                    }
                )
            } catch (e) {
                setError('Initialization error. Please refresh.')
                setLoading(false)
            }
        })
        return () => { authUnsub(); if (msgUnsub) msgUnsub() }
    }, [router])

    const toggleStudent = (uid: string) => {
        setSelectedUids(prev => {
            const next = new Set(prev)
            next.has(uid) ? next.delete(uid) : next.add(uid)
            return next
        })
    }

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim() || !body.trim()) return
        if (targetMode === 'selected' && selectedUids.size === 0) {
            setError('Please select at least one student.')
            return
        }
        setSending(true)
        setError(null)
        try {
            await addDoc(collection(db, 'messages'), {
                senderId: auth.currentUser!.uid,
                senderName: 'Teacher',
                title: title.trim(),
                body: body.trim(),
                createdAt: serverTimestamp(),
                readBy: [],
                recipients: targetMode === 'selected' ? [...selectedUids] : null,
            })
            setTitle('')
            setBody('')
            setSelectedUids(new Set())
            setTargetMode('all')
            setSuccess(`Message sent to ${targetMode === 'all' ? 'all students' : `${selectedUids.size} student(s)`}!`)
            setTimeout(() => setSuccess(null), 3500)
        } catch (e: any) {
            if (e?.code === 'permission-denied') {
                setError('Permission denied — deploy the updated Firestore rules in the Firebase Console.')
            } else {
                setError('Failed to send. Please try again.')
            }
        } finally {
            setSending(false)
        }
    }

    const loadReplies = async (msgId: string) => {
        if (replies[msgId]) return  // already loaded
        setLoadingReplies(msgId)
        try {
            const snap = await getDocs(
                query(collection(db, 'messages', msgId, 'replies'), orderBy('createdAt', 'asc'))
            )
            setReplies(prev => ({
                ...prev,
                [msgId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) as Reply[]
            }))
        } catch (e) { console.error('Failed to load replies:', e) }
        setLoadingReplies(null)
    }

    const reloadReplies = async (msgId: string) => {
        try {
            const snap = await getDocs(
                query(collection(db, 'messages', msgId, 'replies'), orderBy('createdAt', 'asc'))
            )
            setReplies(prev => ({
                ...prev,
                [msgId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) as Reply[]
            }))
        } catch (e) { console.error('Failed to reload replies:', e) }
    }

    const sendTeacherReply = async (msgId: string) => {
        const text = (teacherReplyText[msgId] || '').trim()
        if (!text || !auth.currentUser) return
        setSendingTeacherReply(msgId)
        try {
            await addDoc(collection(db, 'messages', msgId, 'replies'), {
                studentId: auth.currentUser.uid,
                studentName: '🎓 Teacher',
                role: 'teacher',
                body: text,
                createdAt: serverTimestamp(),
            })
            setTeacherReplyText(prev => ({ ...prev, [msgId]: '' }))
            await reloadReplies(msgId)
        } catch (e) {
            console.error('Teacher reply error:', e)
            setError('Failed to send reply.')
        } finally {
            setSendingTeacherReply(null)
        }
    }

    const handleExpand = (msgId: string) => {
        if (expandedId === msgId) { setExpandedId(null); return }
        setExpandedId(msgId)
        loadReplies(msgId)
    }

    const filteredStudents = students.filter(s =>
        s.displayName.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.groupName.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.email.toLowerCase().includes(studentSearch.toLowerCase())
    )

    const recipientLabel = (msg: Message) => {
        if (!msg.recipients) return `📣 All students`
        const names = msg.recipients
            .map(uid => students.find(s => s.uid === uid)?.displayName || 'Unknown')
            .join(', ')
        return `👤 ${msg.recipients.length} student${msg.recipients.length !== 1 ? 's' : ''}: ${names}`
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <button onClick={() => router.push('/teacher')} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white text-sm flex items-center gap-1 mb-2 transition-colors">
                            ← Teacher Dashboard
                        </button>
                        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Messages</h1>
                        <p className="text-slate-500 dark:text-gray-400 mt-1">Send announcements &amp; view student replies</p>
                    </div>
                    <div className="text-5xl">✉️</div>
                </div>

                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

                {/* ── Compose ── */}
                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm mb-8">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-5">📢 New Message</h2>
                    <form onSubmit={handleSend} className="space-y-4">
                        <div>
                            <label className="block text-slate-600 dark:text-gray-300 text-sm mb-1">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Week 3 Essay Deadline"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                                maxLength={120}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-slate-600 dark:text-gray-300 text-sm mb-1">Message</label>
                            <textarea
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder="Write your message here…"
                                rows={4}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                required
                            />
                        </div>

                        {/* Recipients */}
                        <div>
                            <label className="block text-slate-600 dark:text-gray-300 text-sm mb-2">Send to</label>
                            <div className="flex gap-3 mb-3">
                                <button
                                    type="button"
                                    onClick={() => setTargetMode('all')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${targetMode === 'all' ? 'bg-blue-500/30 border-blue-500 text-blue-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 border-slate-200 dark:border-white/10 shadow-sm text-slate-500 dark:text-gray-400 hover:text-white'}`}
                                >
                                    📣 All Students ({students.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetMode('selected')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${targetMode === 'selected' ? 'bg-purple-500/30 border-purple-500 text-purple-300' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 border-slate-200 dark:border-white/10 shadow-sm text-slate-500 dark:text-gray-400 hover:text-white'}`}
                                >
                                    👤 Select Students {selectedUids.size > 0 && `(${selectedUids.size} selected)`}
                                </button>
                            </div>

                            {targetMode === 'selected' && (
                                <div className="bg-slate-100 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                                    <div className="p-3 border-b border-slate-200 dark:border-white/10 shadow-sm">
                                        <input
                                            type="text"
                                            value={studentSearch}
                                            onChange={e => setStudentSearch(e.target.value)}
                                            placeholder="Search by name, group or email…"
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                                        {filteredStudents.length === 0 ? (
                                            <p className="text-gray-500 text-sm p-4 text-center">No students found</p>
                                        ) : filteredStudents.map(s => (
                                            <label key={s.uid} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white dark:bg-slate-800/5 transition-colors ${selectedUids.has(s.uid) ? 'bg-purple-500/10' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUids.has(s.uid)}
                                                    onChange={() => toggleStudent(s.uid)}
                                                    className="w-4 h-4 accent-purple-500"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-900 dark:text-white text-sm font-medium truncate">{s.displayName}</p>
                                                    <p className="text-gray-500 text-xs truncate">{s.groupName || s.email}</p>
                                                </div>
                                                {s.groupName && (
                                                    <span className="text-purple-300 text-xs bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-full shrink-0">
                                                        {s.groupName}
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                    {selectedUids.size > 0 && (
                                        <div className="p-3 border-t border-slate-200 dark:border-white/10 shadow-sm flex justify-between items-center">
                                            <span className="text-purple-300 text-sm">{selectedUids.size} selected</span>
                                            <button type="button" onClick={() => setSelectedUids(new Set())} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white text-xs transition-colors">
                                                Clear all
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={sending || !title.trim() || !body.trim() || (targetMode === 'selected' && selectedUids.size === 0)}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? 'Sending…' : targetMode === 'all' ? `Send to All ${students.length} Students` : `Send to ${selectedUids.size} Selected Student${selectedUids.size !== 1 ? 's' : ''}`}
                        </button>
                    </form>
                </div>

                {/* ── Sent Messages ── */}
                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 shadow-sm flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Sent Messages</h2>
                        <span className="text-slate-500 dark:text-gray-400 text-sm">{messages.length} sent</span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">
                            <div className="text-4xl mb-3">📭</div>
                            <p>No messages sent yet.</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-white/10">
                            {messages.map(msg => {
                                const isOpen = expandedId === msg.id
                                const msgReplies = replies[msg.id] || []
                                return (
                                    <li key={msg.id}>
                                        <button
                                            onClick={() => handleExpand(msg.id)}
                                            className="w-full text-left px-6 py-5 hover:bg-white dark:bg-slate-800/5 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-900 dark:text-white font-semibold">{msg.title}</p>
                                                    <p className="text-slate-500 dark:text-gray-400 text-sm mt-0.5 line-clamp-1">{msg.body}</p>
                                                    <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                                        <span className="text-gray-500">{msg.createdAt?.toDate?.().toLocaleString() || 'Just sent…'}</span>
                                                        <span className="text-blue-400/80">{recipientLabel(msg)}</span>
                                                        <span className="text-green-400">✓ {msg.readBy?.length || 0} read</span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-3">
                                                    {isOpen && loadingReplies === msg.id ? (
                                                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                                    ) : msgReplies.length > 0 ? (
                                                        <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                                                            💬 {msgReplies.length}
                                                        </span>
                                                    ) : null}
                                                    <span className={`text-slate-500 dark:text-gray-400 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                                                </div>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className="px-6 pb-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/20">
                                                {/* Full body */}
                                                <div className="mt-4 mb-5 bg-white dark:bg-slate-800 rounded-lg p-4">
                                                    <p className="text-slate-700 dark:text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
                                                </div>

                                                {/* Replies */}
                                                <p className="text-sm font-semibold text-slate-600 dark:text-gray-300 mb-3">
                                                    💬 Student Replies {msgReplies.length > 0 && `(${msgReplies.length})`}
                                                </p>
                                                {loadingReplies === msg.id ? (
                                                    <p className="text-gray-500 text-sm">Loading replies…</p>
                                                ) : msgReplies.length === 0 ? (
                                                    <p className="text-gray-600 text-sm italic">No replies yet.</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {msgReplies.map(r => {
                                                            const isTeacher = (r as any).role === 'teacher'
                                                            return (
                                                                <div key={r.id} className={`flex gap-3 ${isTeacher ? 'flex-row-reverse' : ''}`}>
                                                                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${isTeacher
                                                                            ? 'bg-green-600/30 text-green-100 rounded-tr-none border border-green-500/20'
                                                                            : 'bg-slate-100 dark:bg-slate-900/50/60 text-slate-700 dark:text-gray-200 rounded-tl-none'
                                                                        }`}>
                                                                        <p className="text-xs opacity-60 mb-1 font-medium">{r.studentName}</p>
                                                                        <p className="whitespace-pre-wrap">{r.body}</p>
                                                                        <p className="text-xs opacity-40 mt-1 text-right">{r.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}

                                                {/* Teacher reply box */}
                                                <div className="flex items-end gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-white/10 shadow-sm">
                                                    <textarea
                                                        value={teacherReplyText[msg.id] || ''}
                                                        onChange={e => setTeacherReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeacherReply(msg.id) }
                                                        }}
                                                        placeholder="Reply to students… (Enter to send)"
                                                        rows={2}
                                                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 transition-colors resize-none"
                                                    />
                                                    <button
                                                        onClick={() => sendTeacherReply(msg.id)}
                                                        disabled={sendingTeacherReply === msg.id || !(teacherReplyText[msg.id] || '').trim()}
                                                        className="shrink-0 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                                    >
                                                        {sendingTeacherReply === msg.id ? '…' : 'Reply ↑'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </main>
        </div>
    )
}

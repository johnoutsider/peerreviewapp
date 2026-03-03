'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
    collection, addDoc, getDocs, serverTimestamp,
    query, orderBy, onSnapshot, where
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
    telegramChatId?: string
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
    const [targetMode, setTargetMode] = useState<'all' | 'group' | 'selected'>('all')
    const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())
    const [selectedGroup, setSelectedGroup] = useState('')
    const [studentSearch, setStudentSearch] = useState('')

    // Telegram
    const [sendViaTelegram, setSendViaTelegram] = useState(false)
    const [telegramResult, setTelegramResult] = useState<{ sent: number; skipped: number } | null>(null)

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

                // Load students (including telegramChatId for badge display)
                try {
                    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
                    setStudents(snap.docs.map(d => {
                        const data = d.data() as any
                        return {
                            uid: d.id,
                            displayName: data.displayName || data.name || 'Student',
                            groupName: data.groupName || '',
                            email: data.email || '',
                            telegramChatId: data.telegramChatId || '',
                        }
                    }).sort((a, b) => (a.groupName || '').localeCompare(b.groupName || '') || a.displayName.localeCompare(b.displayName)))
                } catch (e) { console.error('Could not load students:', e) }

                const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'))
                msgUnsub = onSnapshot(q,
                    snap => {
                        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Message[])
                        setLoading(false)
                    },
                    () => {
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

    // Derived data
    const groups = [...new Set(students.map(s => s.groupName).filter(Boolean))].sort()
    const groupStudents = selectedGroup ? students.filter(s => s.groupName === selectedGroup) : []

    const getTargetUids = (): string[] | null => {
        if (targetMode === 'all') return null
        if (targetMode === 'group') return groupStudents.map(s => s.uid)
        return [...selectedUids]
    }

    const getTargetLabel = () => {
        if (targetMode === 'all') return `all ${students.length} students`
        if (targetMode === 'group') return `${groupStudents.length} students in "${selectedGroup}"`
        return `${selectedUids.size} selected student${selectedUids.size !== 1 ? 's' : ''}`
    }

    const toggleStudent = (uid: string) => {
        setSelectedUids(prev => {
            const next = new Set(prev)
            next.has(uid) ? next.delete(uid) : next.add(uid)
            return next
        })
    }

    const canSend = () => {
        if (!title.trim() || !body.trim()) return false
        if (targetMode === 'selected' && selectedUids.size === 0) return false
        if (targetMode === 'group' && !selectedGroup) return false
        return true
    }

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSend()) return

        setSending(true)
        setError(null)
        setTelegramResult(null)

        const targetUids = getTargetUids()

        try {
            // 1. Save to Firestore (in-app message)
            await addDoc(collection(db, 'messages'), {
                senderId: auth.currentUser!.uid,
                senderName: 'Teacher',
                title: title.trim(),
                body: body.trim(),
                createdAt: serverTimestamp(),
                readBy: [],
                recipients: targetUids,
                targetGroup: targetMode === 'group' ? selectedGroup : null,
            })

            // 2. Send via Telegram if enabled
            if (sendViaTelegram) {
                try {
                    const res = await fetch('/api/telegram/broadcast', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: title.trim(),
                            message: body.trim(),
                            recipientUids: targetUids,
                            groupName: targetMode === 'group' ? selectedGroup : null,
                        }),
                    })
                    if (res.ok) {
                        const data = await res.json()
                        setTelegramResult({ sent: data.sent, skipped: data.skipped })
                    }
                } catch (tgErr) {
                    console.error('Telegram broadcast error:', tgErr)
                }
            }

            setTitle('')
            setBody('')
            setSelectedUids(new Set())
            setSelectedGroup('')
            setTargetMode('all')
            setSuccess(`Message sent to ${getTargetLabel()}!`)
            setTimeout(() => { setSuccess(null); setTelegramResult(null) }, 5000)
        } catch (e: any) {
            if (e?.code === 'permission-denied') {
                setError('Permission denied — deploy the updated Firestore rules.')
            } else {
                setError('Failed to send. Please try again.')
            }
        } finally {
            setSending(false)
        }
    }

    const loadReplies = async (msgId: string) => {
        if (replies[msgId]) return
        setLoadingReplies(msgId)
        try {
            const snap = await getDocs(
                query(collection(db, 'messages', msgId, 'replies'), orderBy('createdAt', 'asc'))
            )
            setReplies(prev => ({ ...prev, [msgId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) as Reply[] }))
        } catch (e) { console.error('Failed to load replies:', e) }
        setLoadingReplies(null)
    }

    const reloadReplies = async (msgId: string) => {
        try {
            const snap = await getDocs(
                query(collection(db, 'messages', msgId, 'replies'), orderBy('createdAt', 'asc'))
            )
            setReplies(prev => ({ ...prev, [msgId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) as Reply[] }))
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

    const telegramConnectedCount = (() => {
        if (targetMode === 'all') return students.filter(s => s.telegramChatId).length
        if (targetMode === 'group') return groupStudents.filter(s => s.telegramChatId).length
        return [...selectedUids].filter(uid => students.find(s => s.uid === uid)?.telegramChatId).length
    })()

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
                        <p className="text-slate-500 dark:text-gray-400 mt-1">Send announcements & view student replies</p>
                    </div>
                    <div className="text-5xl">✉️</div>
                </div>

                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && (
                    <div className="mb-4">
                        <Alert type="success" message={success} />
                        {telegramResult && (
                            <div className="mt-2 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm text-blue-300 flex items-center gap-2">
                                📱 Telegram: <strong>{telegramResult.sent}</strong> sent
                                {telegramResult.skipped > 0 && <span className="text-slate-400">· {telegramResult.skipped} skipped (no Telegram linked)</span>}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Compose ── */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm mb-8">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-5">📢 New Message</h2>
                    <form onSubmit={handleSend} className="space-y-4">
                        <div>
                            <label className="block text-slate-600 dark:text-gray-300 text-sm mb-1">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Week 3 Essay Deadline"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
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
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                required
                            />
                        </div>

                        {/* ── Recipients ── */}
                        <div>
                            <label className="block text-slate-600 dark:text-gray-300 text-sm mb-2">Send to</label>
                            <div className="flex gap-2 mb-3 flex-wrap">
                                {/* All */}
                                <button type="button" onClick={() => setTargetMode('all')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${targetMode === 'all' ? 'bg-blue-500/30 border-blue-500 text-blue-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:text-white'}`}>
                                    📣 All Students ({students.length})
                                </button>
                                {/* By Group */}
                                <button type="button" onClick={() => { setTargetMode('group'); setSelectedGroup(groups[0] || '') }}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${targetMode === 'group' ? 'bg-green-500/30 border-green-500 text-green-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:text-white'}`}>
                                    👥 By Group {targetMode === 'group' && selectedGroup && `(${groupStudents.length})`}
                                </button>
                                {/* Select */}
                                <button type="button" onClick={() => setTargetMode('selected')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${targetMode === 'selected' ? 'bg-purple-500/30 border-purple-500 text-purple-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:text-white'}`}>
                                    👤 Select {selectedUids.size > 0 && `(${selectedUids.size})`}
                                </button>
                            </div>

                            {/* Group picker */}
                            {targetMode === 'group' && (
                                <div className="mb-2">
                                    {groups.length === 0 ? (
                                        <p className="text-slate-400 text-sm italic">No groups found. Assign students to groups first.</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {groups.map(g => (
                                                <button
                                                    key={g}
                                                    type="button"
                                                    onClick={() => setSelectedGroup(g)}
                                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedGroup === g ? 'bg-green-500 border-green-500 text-white' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-white/10 text-slate-700 dark:text-white hover:border-green-400'}`}
                                                >
                                                    {g}
                                                    <span className="ml-1.5 text-xs opacity-70">
                                                        ({students.filter(s => s.groupName === g).length})
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Student picker */}
                            {targetMode === 'selected' && (
                                <div className="bg-slate-100 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                                    <div className="p-3 border-b border-slate-200 dark:border-white/10">
                                        <input
                                            type="text"
                                            value={studentSearch}
                                            onChange={e => setStudentSearch(e.target.value)}
                                            placeholder="Search by name, group or email…"
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                                        {filteredStudents.length === 0 ? (
                                            <p className="text-gray-500 text-sm p-4 text-center">No students found</p>
                                        ) : filteredStudents.map(s => (
                                            <label key={s.uid} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors ${selectedUids.has(s.uid) ? 'bg-purple-500/10' : ''}`}>
                                                <input type="checkbox" checked={selectedUids.has(s.uid)} onChange={() => toggleStudent(s.uid)} className="w-4 h-4 accent-purple-500" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-900 dark:text-white text-sm font-medium truncate flex items-center gap-1.5">
                                                        {s.displayName}
                                                        {s.telegramChatId && <span title="Telegram connected" className="text-blue-400 text-xs">📱</span>}
                                                    </p>
                                                    <p className="text-gray-500 text-xs truncate">{s.groupName || s.email}</p>
                                                </div>
                                                {s.groupName && (
                                                    <span className="text-purple-300 text-xs bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-full shrink-0">{s.groupName}</span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                    {selectedUids.size > 0 && (
                                        <div className="p-3 border-t border-slate-200 dark:border-white/10 flex justify-between items-center">
                                            <span className="text-purple-300 text-sm">{selectedUids.size} selected</span>
                                            <button type="button" onClick={() => setSelectedUids(new Set())} className="text-slate-400 hover:text-white text-xs transition-colors">Clear all</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Telegram toggle ── */}
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                            <input
                                id="tg-toggle"
                                type="checkbox"
                                checked={sendViaTelegram}
                                onChange={e => setSendViaTelegram(e.target.checked)}
                                className="mt-0.5 w-4 h-4 accent-blue-500"
                            />
                            <label htmlFor="tg-toggle" className="cursor-pointer select-none">
                                <p className="text-slate-900 dark:text-white text-sm font-medium">📱 Also send via Telegram</p>
                                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                                    {telegramConnectedCount > 0
                                        ? `${telegramConnectedCount} of the target students have Telegram connected`
                                        : 'None of the target students have Telegram connected yet'}
                                </p>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={sending || !canSend()}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-3 rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending
                                ? 'Sending…'
                                : `Send to ${targetMode === 'all' ? `All ${students.length} Students` : targetMode === 'group' ? `${groupStudents.length} in "${selectedGroup}"` : `${selectedUids.size} Selected`}`
                            }
                        </button>
                    </form>
                </div>

                {/* ── Sent Messages ── */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
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
                                        <button onClick={() => handleExpand(msg.id)} className="w-full text-left px-6 py-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
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
                                                <div className="mt-4 mb-5 bg-white dark:bg-slate-800 rounded-lg p-4">
                                                    <p className="text-slate-700 dark:text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
                                                </div>
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
                                                                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${isTeacher ? 'bg-green-600/30 text-green-100 rounded-tr-none border border-green-500/20' : 'bg-slate-100 dark:bg-slate-900/60 text-slate-700 dark:text-gray-200 rounded-tl-none'}`}>
                                                                        <p className="text-xs opacity-60 mb-1 font-medium">{r.studentName}</p>
                                                                        <p className="whitespace-pre-wrap">{r.body}</p>
                                                                        <p className="text-xs opacity-40 mt-1 text-right">{r.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                                <div className="flex items-end gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
                                                    <textarea
                                                        value={teacherReplyText[msg.id] || ''}
                                                        onChange={e => setTeacherReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeacherReply(msg.id) } }}
                                                        placeholder="Reply to students… (Enter to send)"
                                                        rows={2}
                                                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 transition-colors resize-none"
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

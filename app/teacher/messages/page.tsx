'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
    collection, addDoc, getDocs, serverTimestamp,
    query, orderBy, onSnapshot, where
} from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'
import Alert from '@/components/Alert'

interface Message {
    id: string
    title: string
    body: string
    createdAt: any
    readBy: string[]
    recipients: string[] | null   // null = all students
    replyCount?: number
    targetGroup?: string | null
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

const MESSAGES_PER_PAGE = 8

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

    const [sentSearch, setSentSearch] = useState('')
    const [sentGroupFilter, setSentGroupFilter] = useState('')
    const [sentMessagePage, setSentMessagePage] = useState(1)

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
                    // Compute which students to send to, based on targeting mode
                    let targetStudents: Student[]
                    if (targetMode === 'all') {
                        targetStudents = students
                    } else if (targetMode === 'group') {
                        targetStudents = students.filter(s => s.groupName === selectedGroup)
                    } else {
                        targetStudents = students.filter(s => selectedUids.has(s.uid))
                    }

                    // Only send to students who have Telegram linked
                    const chatIds = targetStudents
                        .map(s => s.telegramChatId)
                        .filter(Boolean) as string[]

                    // Debug: log so we can verify in browser console
                    console.log('[Telegram] Total students loaded:', students.length)
                    console.log('[Telegram] Target students:', targetStudents.length)
                    console.log('[Telegram] Students with chatId:', chatIds.length)
                    console.log('[Telegram] chatIds:', chatIds)
                    console.log('[Telegram] All students telegramChatIds:', students.map(s => ({ name: s.displayName, chatId: s.telegramChatId })))

                    if (chatIds.length > 0) {
                        const res = await fetch('/api/telegram/broadcast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: title.trim(),
                                message: body.trim(),
                                chatIds,
                            }),
                        })
                        if (res.ok) {
                            const data = await res.json()
                            console.log('[Telegram] Broadcast result:', data)
                            setTelegramResult({
                                sent: data.sent,
                                skipped: targetStudents.length - chatIds.length,
                            })
                        } else {
                            const errText = await res.text()
                            console.error('[Telegram] Broadcast API failed:', errText)
                        }
                    } else {
                        console.warn('[Telegram] No chatIds found â€” no Telegram messages sent.')
                        setTelegramResult({ sent: 0, skipped: targetStudents.length })
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
                setError('Permission denied â€” deploy the updated Firestore rules.')
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
                studentName: 'ðŸŽ“ Teacher',
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

    const getRecipientStudents = (msg: Message) => {
        if (!msg.recipients) return students
        return students.filter(student => msg.recipients?.includes(student.uid))
    }

    const getRecipientGroups = (msg: Message) => ([...new Set(
        getRecipientStudents(msg)
            .map(student => student.groupName)
            .filter(Boolean)
    )])

    const filteredMessages = messages.filter(msg => {
        const recipientStudents = getRecipientStudents(msg)
        const recipientGroups = getRecipientGroups(msg)

        if (sentGroupFilter && !recipientGroups.includes(sentGroupFilter)) {
            return false
        }

        const query = sentSearch.trim().toLowerCase()
        if (!query) return true

        const searchableFields = [
            msg.title,
            msg.body,
            msg.targetGroup || '',
            ...recipientStudents.flatMap(student => [student.displayName, student.groupName, student.email]),
        ]

        return searchableFields.some(value => String(value || '').toLowerCase().includes(query))
    })

    const totalMessagePages = Math.max(1, Math.ceil(filteredMessages.length / MESSAGES_PER_PAGE))
    const safeMessagePage = Math.min(sentMessagePage, totalMessagePages)
    const paginatedMessages = filteredMessages.slice((safeMessagePage - 1) * MESSAGES_PER_PAGE, safeMessagePage * MESSAGES_PER_PAGE)

    const recipientLabel = (msg: Message) => {
        if (!msg.recipients) return `All students`
        const names = msg.recipients
            .map(uid => students.find(s => s.uid === uid)?.displayName || 'Unknown')
            .join(', ')
        return `${msg.recipients.length} student${msg.recipients.length !== 1 ? 's' : ''}: ${names}`
    }

    useEffect(() => {
        setSentMessagePage(1)
    }, [sentSearch, sentGroupFilter])

    useEffect(() => {
        if (sentMessagePage > totalMessagePages) {
            setSentMessagePage(totalMessagePages)
        }
    }, [sentMessagePage, totalMessagePages])
    const telegramConnectedCount = (() => {
        if (targetMode === 'all') return students.filter(s => s.telegramChatId).length
        if (targetMode === 'group') return groupStudents.filter(s => s.telegramChatId).length
        return [...selectedUids].filter(uid => students.find(s => s.uid === uid)?.telegramChatId).length
    })()

    return (
        <TeacherLayout title="Messages">
            <div className="p-6 max-w-4xl mx-auto">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <Link href="/teacher" className="text-slate-400 hover:text-slate-700 text-sm flex items-center gap-1 mb-2 transition-colors inline-block">
                            â† Teacher Dashboard
                        </Link>
                        <h1 className="text-2xl font-bold text-slate-800 mb-0.5">Messages</h1>
                        <p className="text-slate-500 dark:text-gray-400 mt-1">Send announcements & view student replies</p>
                    </div>
                    <div className="text-5xl">âœ‰ï¸</div>
                </div>

                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
                {success && (
                    <div className="mb-4">
                        <Alert type="success" message={success} />
                        {telegramResult && (
                            <div className="mt-2 px-4 py-2.5 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-700 flex items-center gap-2">
                                ðŸ“± Telegram: <strong>{telegramResult.sent}</strong> sent
                                {telegramResult.skipped > 0 && <span className="text-slate-400">Â· {telegramResult.skipped} skipped (no Telegram linked)</span>}
                            </div>
                        )}
                    </div>
                )}

                {/* â”€â”€ Compose â”€â”€ */}
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm mb-6">
                    <h2 className="text-base font-semibold text-slate-700 mb-4">New Message</h2>
                    <form onSubmit={handleSend} className="space-y-4">
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-1">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Week 3 Essay Deadline"
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-teal-500 transition-colors text-sm"
                                maxLength={120}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-1">Message</label>
                            <textarea
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder="Write your message hereâ€¦"
                                rows={4}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-teal-500 transition-colors resize-none text-sm"
                                required
                            />
                        </div>

                        {/* â”€â”€ Recipients â”€â”€ */}
                        <div>
                            <label className="block text-slate-600 text-sm font-medium mb-2">Send to</label>
                            <div className="flex gap-2 mb-3 flex-wrap">
                                {/* All */}
                                <button type="button" onClick={() => setTargetMode('all')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${targetMode === 'all' ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-400'}`}>
                                    All Students ({students.length})
                                </button>
                                {/* By Group */}
                                <button type="button" onClick={() => { setTargetMode('group'); setSelectedGroup(groups[0] || '') }}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${targetMode === 'group' ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-400'}`}>
                                    By Group {targetMode === 'group' && selectedGroup && `(${groupStudents.length})`}
                                </button>
                                {/* Select */}
                                <button type="button" onClick={() => setTargetMode('selected')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${targetMode === 'selected' ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-400'}`}>
                                    Select {selectedUids.size > 0 && `(${selectedUids.size})`}
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
                                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedGroup === g ? 'bg-teal-500 border-teal-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-teal-400'}`}
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
                                <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                                    <div className="p-3 border-b border-slate-100">
                                        <input
                                            type="text"
                                            value={studentSearch}
                                            onChange={e => setStudentSearch(e.target.value)}
                                            placeholder="Search by name, group or emailâ€¦"
                                            className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
                                        />
                                    </div>
                                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                                        {filteredStudents.length === 0 ? (
                                            <p className="text-slate-400 text-sm p-4 text-center">No students found</p>
                                        ) : filteredStudents.map(s => (
                                            <label key={s.uid} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${selectedUids.has(s.uid) ? 'bg-violet-50' : ''}`}>
                                                <input type="checkbox" checked={selectedUids.has(s.uid)} onChange={() => toggleStudent(s.uid)} className="w-4 h-4 accent-purple-500" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-800 text-sm font-medium truncate flex items-center gap-1.5">
                                                        {s.displayName}
                                                        {s.telegramChatId && <span title="Telegram connected" className="text-teal-500 text-xs">ðŸ“±</span>}
                                                    </p>
                                                    <p className="text-slate-400 text-xs truncate">{s.groupName || s.email}</p>
                                                </div>
                                                {s.groupName && (
                                                    <span className="text-violet-700 text-xs bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full shrink-0">{s.groupName}</span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                    {selectedUids.size > 0 && (
                                        <div className="p-3 border-t border-slate-100 flex justify-between items-center">
                                            <span className="text-violet-700 text-sm font-medium">{selectedUids.size} selected</span>
                                            <button type="button" onClick={() => setSelectedUids(new Set())} className="text-slate-400 hover:text-slate-600 text-xs transition-colors">Clear all</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* â”€â”€ Telegram toggle â”€â”€ */}
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-teal-50 border border-teal-100">
                            <input
                                id="tg-toggle"
                                type="checkbox"
                                checked={sendViaTelegram}
                                onChange={e => setSendViaTelegram(e.target.checked)}
                                className="mt-0.5 w-4 h-4 accent-teal-500"
                            />
                            <label htmlFor="tg-toggle" className="cursor-pointer select-none">
                                <p className="text-slate-800 text-sm font-semibold">ðŸ“± Also send via Telegram</p>
                                <p className="text-slate-500 text-xs mt-0.5">
                                    {telegramConnectedCount > 0
                                        ? `${telegramConnectedCount} of the target students have Telegram connected`
                                        : 'None of the target students have Telegram connected yet'}
                                </p>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={sending || !canSend()}
                            className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {sending
                                ? 'Sendingâ€¦'
                                : `Send to ${targetMode === 'all' ? `All ${students.length} Students` : targetMode === 'group' ? `${groupStudents.length} in "${selectedGroup}"` : `${selectedUids.size} Selected`}`
                            }
                        </button>
                    </form>
                </div>

                {/* â”€â”€ Sent Messages â”€â”€ */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-base font-semibold text-slate-700">Sent Messages</h2>
                        <span className="text-slate-400 text-sm">{filteredMessages.length} matched of {messages.length}</span>
                    </div>


                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70">
                        <div className="grid gap-3 md:grid-cols-[1fr,220px]">
                            <input
                                type="text"
                                value={sentSearch}
                                onChange={e => setSentSearch(e.target.value)}
                                placeholder="Search by title, message, student or email…"
                                className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
                            />
                            <select
                                value={sentGroupFilter}
                                onChange={e => setSentGroupFilter(e.target.value)}
                                className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-500"
                            >
                                <option value="">All groups</option>
                                {groups.map(group => (
                                    <option key={group} value={group}>{group}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                        </div>
                    ) : filteredMessages.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">
                            <div className="text-4xl mb-3">ðŸ“­</div>
                            <p>{messages.length === 0 ? 'No messages sent yet.' : 'No messages match the current filters.'}</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-50">
                            {paginatedMessages.map(msg => {
                                const isOpen = expandedId === msg.id
                                const msgReplies = replies[msg.id] || []
                                return (
                                    <li key={msg.id}>
                                        <button onClick={() => handleExpand(msg.id)} className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-slate-800 font-semibold text-sm">{msg.title}</p>
                                                    <p className="text-slate-400 text-sm mt-0.5 line-clamp-1">{msg.body}</p>
                                                    <div className="flex flex-wrap gap-3 mt-2 text-xs">
                                                        <span className="text-gray-500">{msg.createdAt?.toDate?.().toLocaleString() || 'Just sentâ€¦'}</span>
                                                        <span className="text-blue-400/80">{recipientLabel(msg)}</span>
                                                        <span className="text-green-400">âœ“ {msg.readBy?.length || 0} read</span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-3">
                                                    {isOpen && loadingReplies === msg.id ? (
                                                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                                    ) : msgReplies.length > 0 ? (
                                                        <span className="bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                                                            ðŸ’¬ {msgReplies.length}
                                                        </span>
                                                    ) : null}
                                                    <span className={`text-slate-400 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>â–¾</span>
                                                </div>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className="px-5 pb-5 border-t border-slate-100 bg-slate-50">
                                                <div className="mt-4 mb-4 bg-white rounded-lg p-4 border border-slate-100">
                                                    <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
                                                </div>
                                                <p className="text-sm font-semibold text-slate-600 mb-3">
                                                    ðŸ’¬ Student Replies {msgReplies.length > 0 && `(${msgReplies.length})`}
                                                </p>
                                                {loadingReplies === msg.id ? (
                                                    <p className="text-gray-500 text-sm">Loading repliesâ€¦</p>
                                                ) : msgReplies.length === 0 ? (
                                                    <p className="text-gray-600 text-sm italic">No replies yet.</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {msgReplies.map(r => {
                                                            const isTeacher = (r as any).role === 'teacher'
                                                            return (
                                                                <div key={r.id} className={`flex gap-3 ${isTeacher ? 'flex-row-reverse' : ''}`}>
                                                                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${isTeacher
                                                                        ? 'bg-teal-50 text-teal-800 rounded-tr-none border border-teal-100'
                                                                        : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'
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
                                                <div className="flex items-end gap-2 mt-4 pt-4 border-t border-slate-100">
                                                    <textarea
                                                        value={teacherReplyText[msg.id] || ''}
                                                        onChange={e => setTeacherReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeacherReply(msg.id) } }}
                                                        placeholder="Reply to studentsâ€¦ (Enter to send)"
                                                        rows={2}
                                                        className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-teal-500 transition-colors resize-none"
                                                    />
                                                    <button
                                                        onClick={() => sendTeacherReply(msg.id)}
                                                        disabled={sendingTeacherReply === msg.id || !(teacherReplyText[msg.id] || '').trim()}
                                                        className="shrink-0 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                                    >
                                                        {sendingTeacherReply === msg.id ? 'â€¦' : 'Reply â†‘'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                    {!loading && filteredMessages.length > MESSAGES_PER_PAGE && (
                        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-white">
                            <p className="text-sm text-slate-500">Page {safeMessagePage} of {totalMessagePages}</p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSentMessagePage(prev => Math.max(1, prev - 1))}
                                    disabled={safeMessagePage === 1}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSentMessagePage(prev => Math.min(totalMessagePages, prev + 1))}
                                    disabled={safeMessagePage === totalMessagePages}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </TeacherLayout>
    )
}

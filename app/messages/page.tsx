'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
    collection, query, orderBy, onSnapshot,
    doc, updateDoc, arrayUnion, addDoc, serverTimestamp, getDocs
} from 'firebase/firestore'
import Header from '@/components/Header'

interface Message {
    id: string
    title: string
    body: string
    createdAt: any
    readBy: string[]
    recipients: string[] | null  // null = all, array = specific UIDs
}

interface Reply {
    id: string
    studentId: string
    studentName: string
    body: string
    createdAt: any
}

export default function StudentMessages() {
    const router = useRouter()
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState(true)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [replies, setReplies] = useState<Record<string, Reply[]>>({})
    const [replyText, setReplyText] = useState<Record<string, string>>({})
    const [sendingReply, setSendingReply] = useState<string | null>(null)
    const [profile, setProfile] = useState<any>(null)

    useEffect(() => {
        let msgUnsub: (() => void) | null = null
        const authUnsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/'); return }
            setCurrentUser(user)
            const { getUserProfile } = await import('@/lib/auth')
            const p = await getUserProfile(user.uid)
            setProfile(p)

            const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'))
            msgUnsub = onSnapshot(q, snap => {
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Message[]
                // Filter: show if recipients is null (all) OR includes this student
                const visible = all.filter(m => !m.recipients || m.recipients.includes(user.uid))
                setMessages(visible)
                setLoading(false)
            })
        })
        return () => { authUnsub(); if (msgUnsub) msgUnsub() }
    }, [router])

    const markRead = async (msg: Message) => {
        if (!currentUser || msg.readBy?.includes(currentUser.uid)) return
        try {
            await updateDoc(doc(db, 'messages', msg.id), { readBy: arrayUnion(currentUser.uid) })
        } catch (e) { console.error('markRead error', e) }
    }

    const loadReplies = async (msgId: string) => {
        try {
            const snap = await getDocs(query(collection(db, 'messages', msgId, 'replies'), orderBy('createdAt', 'asc')))
            setReplies(prev => ({ ...prev, [msgId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) as Reply[] }))
        } catch (e) { console.error('load replies error', e) }
    }

    const handleExpand = (msg: Message) => {
        if (expanded === msg.id) { setExpanded(null); return }
        setExpanded(msg.id)
        markRead(msg)
        loadReplies(msg.id)
    }

    const handleReply = async (msgId: string) => {
        const text = (replyText[msgId] || '').trim()
        if (!text || !currentUser) return
        setSendingReply(msgId)
        try {
            await addDoc(collection(db, 'messages', msgId, 'replies'), {
                studentId: currentUser.uid,
                studentName: profile?.displayName || profile?.name || 'Student',
                body: text,
                createdAt: serverTimestamp(),
            })
            setReplyText(prev => ({ ...prev, [msgId]: '' }))
            // Reload replies
            await loadReplies(msgId)
        } catch (e) {
            console.error('Reply error:', e)
        } finally {
            setSendingReply(null)
        }
    }

    const unread = messages.filter(m => !m.readBy?.includes(currentUser?.uid || '')).length

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8 max-w-3xl">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold text-white">Messages</h1>
                        <p className="text-gray-400 mt-1">Announcements from your teacher</p>
                    </div>
                    {unread > 0 && (
                        <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                            {unread} unread
                        </span>
                    )}
                </div>

                {messages.length === 0 ? (
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-16 border border-white/10 text-center">
                        <div className="text-6xl mb-4">📭</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">No Messages Yet</h3>
                        <p className="text-gray-400">Your teacher hasn&apos;t sent any messages yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {messages.map(msg => {
                            const isRead = msg.readBy?.includes(currentUser?.uid || '')
                            const isOpen = expanded === msg.id
                            const msgReplies = replies[msg.id] || []
                            const myReplies = msgReplies.filter(r => r.studentId === currentUser?.uid)

                            return (
                                <div
                                    key={msg.id}
                                    className={`rounded-xl border transition-all ${isRead
                                        ? 'bg-slate-800/40 border-white/10'
                                        : 'bg-blue-900/30 border-blue-500/40'
                                        }`}
                                >
                                    {/* Header row — click to expand */}
                                    <button
                                        onClick={() => handleExpand(msg)}
                                        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors rounded-xl"
                                    >
                                        <div className="shrink-0">
                                            {isRead
                                                ? <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                                : <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-semibold truncate ${isRead ? 'text-gray-300' : 'text-white'}`}>
                                                {msg.title}
                                            </p>
                                            {!isOpen && <p className="text-gray-500 text-sm truncate">{msg.body}</p>}
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2">
                                            {!isRead && (
                                                <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">New</span>
                                            )}
                                            {myReplies.length > 0 && (
                                                <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                                                    💬 {myReplies.length}
                                                </span>
                                            )}
                                            <span className="text-gray-500 text-xs">{msg.createdAt?.toDate?.().toLocaleDateString()}</span>
                                            <span className={`text-gray-400 text-sm transition-transform inline-block ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                                        </div>
                                    </button>

                                    {/* Expanded body + replies */}
                                    {isOpen && (
                                        <div className="px-5 pb-5 border-t border-white/10 pt-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-gray-300 text-sm font-medium">🎓 Teacher</span>
                                                <span className="text-gray-500 text-xs ml-auto">{msg.createdAt?.toDate?.().toLocaleString()}</span>
                                            </div>

                                            {/* Message body */}
                                            <div className="bg-slate-900/50 rounded-lg p-4 mb-5">
                                                <p className="text-gray-200 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                                            </div>

                                            {/* Previous replies */}
                                            {msgReplies.length > 0 && (
                                                <div className="space-y-3 mb-4">
                                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Replies</p>
                                                    {msgReplies.map(r => {
                                                        const isTeacher = (r as any).role === 'teacher'
                                                        const isMe = r.studentId === currentUser?.uid && !isTeacher
                                                        return (
                                                            <div key={r.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                                                                <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${isTeacher
                                                                        ? 'bg-green-700/40 text-green-100 rounded-tl-none border border-green-500/20'
                                                                        : isMe
                                                                            ? 'bg-blue-600/40 text-blue-100 rounded-tr-none'
                                                                            : 'bg-slate-700/60 text-gray-200 rounded-tl-none'
                                                                    }`}>
                                                                    {(isTeacher || !isMe) && (
                                                                        <p className={`text-xs mb-1 font-medium ${isTeacher ? 'text-green-300' : 'text-gray-400'}`}>
                                                                            {r.studentName}
                                                                        </p>
                                                                    )}
                                                                    <p className="whitespace-pre-wrap">{r.body}</p>
                                                                    <p className="text-xs opacity-50 mt-1 text-right">{r.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}

                                            {/* Reply box */}
                                            <div className="flex items-end gap-2 mt-3">
                                                <textarea
                                                    value={replyText[msg.id] || ''}
                                                    onChange={e => setReplyText(prev => ({ ...prev, [msg.id]: e.target.value }))}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault()
                                                            handleReply(msg.id)
                                                        }
                                                    }}
                                                    placeholder="Reply to teacher… (Enter to send)"
                                                    rows={2}
                                                    className="flex-1 bg-slate-700/50 text-white border border-white/20 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                                />
                                                <button
                                                    onClick={() => handleReply(msg.id)}
                                                    disabled={sendingReply === msg.id || !(replyText[msg.id] || '').trim()}
                                                    className="shrink-0 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                                >
                                                    {sendingReply === msg.id ? '…' : 'Send ↑'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </main>
        </div>
    )
}

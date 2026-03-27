'use client'

import { useEffect, useState, useRef } from 'react'
import { auth, db } from '@/lib/firebase'
import {
    collection, addDoc, onSnapshot, orderBy, query,
    serverTimestamp, Timestamp
} from 'firebase/firestore'
import { useParams } from 'next/navigation'

interface Comment {
    id: string
    authorName: string
    authorInitials: string
    text: string
    createdAt: Timestamp | null
}

interface DiscussionForumProps {
    essayTitle?: string
    essayContent?: string
}

function timeAgo(ts: Timestamp | null): string {
    if (!ts) return 'just now'
    const diff = Math.floor((Date.now() - ts.toMillis()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

function Initials({ name }: { name: string }) {
    const initials = name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase() || '?'
    // deterministic hue from name
    const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
    return (
        <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
            style={{ background: `hsl(${hue},55%,48%)` }}
        >
            {initials}
        </div>
    )
}

export function DiscussionForum({ essayTitle, essayContent }: DiscussionForumProps) {
    const params = useParams()
    const essayId = params?.essayId as string | undefined

    const [comments, setComments] = useState<Comment[]>([])
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const bottomRef = useRef<HTMLDivElement>(null)

    // Real-time listener for discussion comments
    useEffect(() => {
        if (!essayId) return
        const q = query(
            collection(db, 'essays', essayId, 'discussion'),
            orderBy('createdAt', 'asc')
        )
        const unsub = onSnapshot(q, (snap) => {
            setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)))
        })
        return unsub
    }, [essayId])

    // Auto-scroll to latest comment
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [comments])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!text.trim() || !essayId || !auth.currentUser) return
        setSending(true)
        try {
            const user = auth.currentUser
            const name = user.displayName || user.email?.split('@')[0] || 'Student'
            await addDoc(collection(db, 'essays', essayId, 'discussion'), {
                authorName: name,
                authorInitials: name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
                text: text.trim(),
                createdAt: serverTimestamp(),
                authorId: user.uid,
            })
            setText('')
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="p-6 space-y-5">

            {/* ── Essay preview card ── */}
            {(essayTitle || essayContent) && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(26,154,170,0.12)' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#1a9aaa" strokeWidth={1.8} className="w-4 h-4">
                                <path d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                                    strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Essay</p>
                            <p className="text-sm font-semibold text-slate-800">
                                {essayTitle || 'Untitled Essay'}
                            </p>
                        </div>
                    </div>
                    {essayContent && (
                        <div className="px-5 py-5">
                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {essayContent}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── Discussion thread ── */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(26,154,170,0.12)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#1a9aaa" strokeWidth={1.8} className="w-4 h-4">
                            <path d="M17 8h2a2 2 0 012 2v8a2 2 0 01-2 2h-2v3l-4-3H9a2 2 0 01-2-2v-1M3 4h10a2 2 0 012 2v6a2 2 0 01-2 2H7l-4 3V6a2 2 0 012-2z"
                                strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-800">Peer Discussion</h2>
                        <p className="text-xs text-slate-400">
                            {comments.length === 0 ? 'No comments yet' : `${comments.length} comment${comments.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                </div>

                {/* Comment list */}
                <div className="divide-y divide-slate-50 max-h-[460px] overflow-y-auto">
                    {comments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="w-10 h-10 mb-3 opacity-40">
                                <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.852L3 20l1.18-3.54A7.957 7.957 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                    strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <p className="text-sm font-medium">Start the discussion</p>
                            <p className="text-xs mt-1">Be the first to share your thoughts</p>
                        </div>
                    ) : (
                        comments.map((c, i) => {
                            const reviewerLabel = `Reviewer ${i + 1}`
                            return (
                                <div key={c.id} className="flex gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                                    <Initials name={reviewerLabel} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-slate-800">{reviewerLabel}</span>
                                            <span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{c.text}</p>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Compose */}
                <form onSubmit={handleSubmit} className="border-t border-slate-100 px-5 py-4">
                    <div className="flex gap-3 items-start">
                        <Initials name={auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Me'} />
                        <div className="flex-1 space-y-2">
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as any)
                                }}
                                placeholder="Add a comment… (Ctrl+Enter to send)"
                                rows={3}
                                className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2.5 resize-none
                                    focus:outline-none focus:ring-2 focus:ring-[#1a9aaa]/40 focus:border-[#1a9aaa]
                                    text-slate-800 placeholder:text-slate-400 transition-colors bg-white focus:bg-white"
                            />
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={!text.trim() || sending}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white
                                        transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ background: '#1a9aaa' }}
                                >
                                    {sending ? (
                                        <>
                                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                            </svg>
                                            Sending…
                                        </>
                                    ) : (
                                        <>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                                                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            Post
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}

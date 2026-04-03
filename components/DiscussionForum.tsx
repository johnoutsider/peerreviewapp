'use client'

import { useEffect, useRef, useState } from 'react'
import { auth } from '@/lib/firebase'
import {
    LegacyEssayDiscussionComment,
    PeerReviewAlias,
    PeerReviewDiscussionComment,
    PeerReviewThreadSummary,
    getDiscussionParticipantLabel,
    postReviewDiscussionComment,
    subscribeToLegacyEssayDiscussion,
    subscribeToReviewDiscussionComments,
    subscribeToReviewThreadSummaries,
} from '@/lib/review-discussions'

interface DiscussionForumProps {
    essayId: string
    essayAuthorId: string
    essayTitle?: string
    essayContent?: string
    peerReviews: PeerReviewAlias[]
}

function timeAgo(ts: PeerReviewDiscussionComment['createdAt'] | LegacyEssayDiscussionComment['createdAt']): string {
    if (!ts) return 'just now'
    const diff = Math.floor((Date.now() - ts.toMillis()) / 1000)
    if (diff < 60) return `${Math.max(diff, 1)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

function formatDateTime(value: PeerReviewAlias['submittedAt']): string {
    if (!value?.toDate) return 'Submission time unavailable'
    return value.toDate().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

function Initials({ name }: { name: string }) {
    const initials = name
        .split(' ')
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase() || '?'

    const hue = name.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360

    return (
        <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
            style={{ background: `hsl(${hue}, 55%, 48%)` }}
        >
            {initials}
        </div>
    )
}

function ThreadSummaryBadge({ summary }: { summary?: PeerReviewThreadSummary }) {
    if (!summary) {
        return <span className="text-xs text-slate-400">No comments yet</span>
    }

    return (
        <span className="text-xs text-slate-500">
            {summary.commentCount} comment{summary.commentCount === 1 ? '' : 's'}
        </span>
    )
}

export function DiscussionForum({
    essayId,
    essayAuthorId,
    essayTitle,
    essayContent,
    peerReviews,
}: DiscussionForumProps) {
    const [selectedReviewerId, setSelectedReviewerId] = useState('')
    const [threadSummaries, setThreadSummaries] = useState<PeerReviewThreadSummary[]>([])
    const [comments, setComments] = useState<PeerReviewDiscussionComment[]>([])
    const [legacyComments, setLegacyComments] = useState<LegacyEssayDiscussionComment[]>([])
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!peerReviews.length) {
            setSelectedReviewerId('')
            return
        }

        const hasSelectedReview = peerReviews.some((review) => review.reviewerId === selectedReviewerId)
        if (!hasSelectedReview) {
            setSelectedReviewerId(peerReviews[0].reviewerId)
        }
    }, [peerReviews, selectedReviewerId])

    useEffect(() => {
        if (!essayId) return
        return subscribeToReviewThreadSummaries(essayId, setThreadSummaries)
    }, [essayId])

    useEffect(() => {
        if (!essayId || !selectedReviewerId) {
            setComments([])
            return
        }

        return subscribeToReviewDiscussionComments(essayId, selectedReviewerId, setComments)
    }, [essayId, selectedReviewerId])

    useEffect(() => {
        if (!essayId) return
        return subscribeToLegacyEssayDiscussion(essayId, setLegacyComments)
    }, [essayId])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [comments, selectedReviewerId])

    const selectedReview = peerReviews.find((review) => review.reviewerId === selectedReviewerId) ?? null
    const threadSummaryByReviewerId = new Map(threadSummaries.map((summary) => [summary.reviewerId, summary]))
    const currentUserLabel = getDiscussionParticipantLabel(
        auth.currentUser?.uid,
        essayAuthorId,
        peerReviews,
        'Participant'
    )

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()

        if (!text.trim() || !selectedReview || !auth.currentUser) return

        setSending(true)
        try {
            await postReviewDiscussionComment({
                essayId,
                reviewerId: selectedReview.reviewerId,
                authorId: auth.currentUser.uid,
                text,
            })
            setText('')
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="p-6 space-y-5">
            {(essayTitle || essayContent) && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                        <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(26,154,170,0.12)' }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="#1a9aaa" strokeWidth={1.8} className="w-4 h-4">
                                <path
                                    d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Essay</p>
                            <p className="text-sm font-semibold text-slate-800">{essayTitle || 'Untitled Essay'}</p>
                        </div>
                    </div>
                    {essayContent && (
                        <div className="px-5 py-5">
                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{essayContent}</p>
                        </div>
                    )}
                </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'rgba(26,154,170,0.12)' }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="#1a9aaa" strokeWidth={1.8} className="w-4 h-4">
                            <path
                                d="M17 8h2a2 2 0 012 2v8a2 2 0 01-2 2h-2v3l-4-3H9a2 2 0 01-2-2v-1M3 4h10a2 2 0 012 2v6a2 2 0 01-2 2H7l-4 3V6a2 2 0 012-2z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-800">Peer Discussion</h2>
                        <p className="text-xs text-slate-400">
                            {selectedReview
                                ? `Discussing ${selectedReview.label}`
                                : 'Peer reviews will appear here once they are submitted'}
                        </p>
                    </div>
                </div>

                {peerReviews.length > 0 && (
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">Select Review to Discuss</p>
                                <p className="text-xs text-slate-500">Choose a peer review and comment on that specific feedback.</p>
                            </div>
                            <span className="text-xs font-medium text-slate-400">
                                {peerReviews.length} review{peerReviews.length === 1 ? '' : 's'}
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            {peerReviews.map((review) => {
                                const isSelected = review.reviewerId === selectedReviewerId
                                const summary = threadSummaryByReviewerId.get(review.reviewerId)

                                return (
                                    <button
                                        key={review.reviewerId}
                                        type="button"
                                        onClick={() => setSelectedReviewerId(review.reviewerId)}
                                        className={`rounded-xl border px-4 py-3 text-left transition-all min-w-[170px] ${
                                            isSelected
                                                ? 'border-[#1a9aaa] bg-white shadow-sm'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-slate-800">{review.label}</span>
                                            {isSelected && (
                                                <span className="text-[11px] font-semibold text-[#1a9aaa] uppercase tracking-wide">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(review.submittedAt)}</p>
                                        <div className="mt-2">
                                            <ThreadSummaryBadge summary={summary} />
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {selectedReview && (
                    <div className="px-5 py-5 border-b border-slate-100 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected Review</p>
                                <h3 className="text-base font-semibold text-slate-900">{selectedReview.label}</h3>
                            </div>
                            <span className="text-xs text-slate-500">{formatDateTime(selectedReview.submittedAt)}</span>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Feedback</p>
                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {selectedReview.feedback || 'This review was submitted without written feedback.'}
                            </p>
                        </div>
                    </div>
                )}

                <div className="divide-y divide-slate-50 max-h-[460px] overflow-y-auto">
                    {!selectedReview ? (
                        <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="w-10 h-10 mb-3 opacity-40">
                                <path
                                    d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.852L3 20l1.18-3.54A7.957 7.957 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <p className="text-sm font-medium">No peer reviews available yet</p>
                            <p className="text-xs mt-1">The discussion will open once a peer review is submitted.</p>
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="w-10 h-10 mb-3 opacity-40">
                                <path
                                    d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.852L3 20l1.18-3.54A7.957 7.957 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <p className="text-sm font-medium">Start the discussion</p>
                            <p className="text-xs mt-1">Be the first to comment on {selectedReview.label}&apos;s feedback.</p>
                        </div>
                    ) : (
                        comments.map((comment) => {
                            const participantLabel = getDiscussionParticipantLabel(
                                comment.authorId,
                                essayAuthorId,
                                peerReviews,
                                'Participant'
                            )

                            return (
                                <div key={comment.id} className="flex gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                                    <Initials name={participantLabel} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-slate-800">{participantLabel}</span>
                                            <span className="text-xs text-slate-400">{timeAgo(comment.createdAt)}</span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={bottomRef} />
                </div>

                <form onSubmit={handleSubmit} className="border-t border-slate-100 px-5 py-4">
                    <div className="flex gap-3 items-start">
                        <Initials name={currentUserLabel} />
                        <div className="flex-1 space-y-2">
                            <textarea
                                value={text}
                                onChange={(event) => setText(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                        handleSubmit(event)
                                    }
                                }}
                                placeholder={
                                    selectedReview
                                        ? `Add a comment about ${selectedReview.label}'s feedback... (Ctrl+Enter to send)`
                                        : 'Select a review before posting.'
                                }
                                rows={3}
                                disabled={!selectedReview || sending}
                                className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2.5 resize-none
                                    focus:outline-none focus:ring-2 focus:ring-[#1a9aaa]/40 focus:border-[#1a9aaa]
                                    text-slate-800 placeholder:text-slate-400 transition-colors bg-white focus:bg-white
                                    disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                            />
                            <div className="flex justify-between items-center gap-3">
                                <p className="text-xs text-slate-400">
                                    Comments stay anonymous. Students are shown only as Essay Author or Reviewer labels.
                                </p>
                                <button
                                    type="submit"
                                    disabled={!selectedReview || !text.trim() || sending}
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
                                            Sending...
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

            {legacyComments.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
                        <div>
                            <h2 className="text-sm font-semibold text-slate-800">Legacy Essay Discussion</h2>
                            <p className="text-xs text-slate-400">Older essay-wide comments are kept here as read-only context.</p>
                        </div>
                        <span className="text-xs font-medium text-slate-400">
                            {legacyComments.length} comment{legacyComments.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    <div className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto">
                        {legacyComments.map((comment) => {
                            const participantLabel = getDiscussionParticipantLabel(
                                comment.authorId,
                                essayAuthorId,
                                peerReviews,
                                'Previous Participant'
                            )

                            return (
                                <div key={comment.id} className="flex gap-3 px-5 py-4 bg-slate-50/30">
                                    <Initials name={participantLabel} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-slate-800">{participantLabel}</span>
                                            <span className="text-xs text-slate-400">{timeAgo(comment.createdAt)}</span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{comment.text}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

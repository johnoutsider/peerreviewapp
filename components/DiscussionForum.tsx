'use client'

import { PeerReviewAlias } from '@/lib/review-discussions'

interface DiscussionForumProps {
    essayId: string
    essayAuthorId: string
    essayTitle?: string
    essayContent?: string
    peerReviews: PeerReviewAlias[]
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

export function DiscussionForum({
    essayTitle,
    essayContent,
    peerReviews,
}: DiscussionForumProps) {
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
                        <h2 className="text-sm font-semibold text-slate-800">Peer Feedback</h2>
                        <p className="text-xs text-slate-400">
                            {peerReviews.length > 0
                                ? `${peerReviews.length} anonymous review${peerReviews.length === 1 ? '' : 's'} received`
                                : 'Peer reviews will appear here once they are submitted'}
                        </p>
                    </div>
                </div>

                {peerReviews.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="w-10 h-10 mb-3 opacity-40">
                            <path
                                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.852L3 20l1.18-3.54A7.957 7.957 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <p className="text-sm font-medium">No peer reviews yet</p>
                        <p className="text-xs mt-1">Feedback will appear here once a peer submits their review.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {peerReviews.map((review) => (
                            <div key={review.reviewerId} className="px-5 py-5">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                            style={{ background: '#1a9aaa' }}
                                        >
                                            {review.label.replace('Reviewer ', '')}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-800">{review.label}</span>
                                    </div>
                                    <span className="text-xs text-slate-400 shrink-0">{formatDateTime(review.submittedAt)}</span>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-4">
                                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                        {review.feedback || 'This review was submitted without written feedback.'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

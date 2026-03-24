'use client'

import { useState } from 'react'

const MAX_CHECKS = 3

interface EvaMessage {
    role: 'user' | 'eva'
    text: string
}

export default function EvaFeedbackChat({ feedback }: { feedback: string }) {
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState<EvaMessage[]>([])
    const [loading, setLoading] = useState(false)
    const [checksUsed, setChecksUsed] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const checksLeft = MAX_CHECKS - checksUsed

    const handleCheck = async () => {
        if (checksUsed >= MAX_CHECKS) return
        if (!feedback.trim()) {
            setError('Write your feedback first before asking EVA to check it.')
            return
        }

        setError(null)
        setLoading(true)

        // Add user message showing the feedback they wrote
        const userMsg: EvaMessage = { role: 'user', text: feedback }
        setMessages(prev => [...prev, userMsg])

        try {
            const res = await fetch('/api/eva-feedback-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_comment: feedback }),
            })
            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'EVA check failed')

            const evaMsg: EvaMessage = { role: 'eva', text: data.result }
            setMessages(prev => [...prev, evaMsg])
            setChecksUsed(prev => prev + 1)
        } catch (err: any) {
            setError(err.message || 'Something went wrong.')
            // Remove the user message we just added since the check failed
            setMessages(prev => prev.slice(0, -1))
        } finally {
            setLoading(false)
        }
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors text-sm font-semibold"
            >
                <span className="w-6 h-6 rounded-md bg-teal-500 text-white flex items-center justify-center text-[10px] font-extrabold shrink-0">
                    EVA
                </span>
                Check my feedback with EVA
                <span className="text-xs text-teal-500 font-normal">({checksLeft} check{checksLeft !== 1 ? 's' : ''} left)</span>
            </button>
        )
    }

    return (
        <div className="mt-2 border border-teal-200 rounded-xl bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-teal-50 border-b border-teal-100">
                <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-teal-500 text-white flex items-center justify-center text-[10px] font-extrabold shrink-0">
                        EVA
                    </span>
                    <span className="text-sm font-bold text-teal-800">EVA Feedback Coach</span>
                    <span className="text-xs text-teal-500 bg-teal-100 px-2 py-0.5 rounded-full border border-teal-200">
                        {checksLeft}/{MAX_CHECKS} left
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-teal-400 hover:text-teal-600 text-lg leading-none"
                >
                    &times;
                </button>
            </div>

            {/* Messages */}
            <div className="max-h-64 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && !loading && (
                    <div className="text-center py-4">
                        <p className="text-sm text-slate-500 mb-1">
                            Write your feedback first, then click the button below to have EVA review it.
                        </p>
                        <p className="text-xs text-slate-400">
                            EVA will help you improve your peer review feedback. You have {checksLeft} check{checksLeft !== 1 ? 's' : ''} available.
                        </p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user'
                                ? 'bg-blue-50 border border-blue-100 text-blue-800'
                                : 'bg-teal-50 border border-teal-100 text-slate-700'
                            }`}>
                            {msg.role === 'eva' && (
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className="w-4 h-4 rounded bg-teal-500 text-white flex items-center justify-center text-[8px] font-extrabold">E</span>
                                    <span className="text-xs font-bold text-teal-700">EVA</span>
                                </div>
                            )}
                            {msg.role === 'user' && (
                                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wide mb-0.5">Your feedback</p>
                            )}
                            <p className="whitespace-pre-wrap leading-relaxed text-xs">{msg.text}</p>
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3 flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-teal-500 border-t-transparent" />
                            <span className="text-xs text-teal-600">EVA is reviewing your feedback...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="mx-3 mb-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
                    {error}
                </div>
            )}

            {/* Action area */}
            <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                {checksUsed >= MAX_CHECKS ? (
                    <div className="text-center py-2">
                        <p className="text-xs text-slate-500">
                            You've used all {MAX_CHECKS} EVA checks. Submit your feedback now!
                        </p>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={handleCheck}
                        disabled={loading || !feedback.trim()}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                Checking...
                            </>
                        ) : (
                            <>
                                <span className="w-5 h-5 rounded bg-white/20 text-white flex items-center justify-center text-[9px] font-extrabold">EVA</span>
                                Check my feedback ({checksLeft} left)
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    )
}

'use client'

import { useState, useRef, useEffect } from 'react'

interface EssayAssistantProps {
    essayContent: string
}

interface FeedbackEntry {
    id: number
    text: string
    wordCount: number
    checkedContent: string   // snapshot of essay at time of check
}

// Jaccard similarity between two strings (word-level)
function jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().trim().split(/\s+/).filter(Boolean))
    const wordsB = new Set(b.toLowerCase().trim().split(/\s+/).filter(Boolean))
    if (wordsA.size === 0 && wordsB.size === 0) return 1
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length
    const union = new Set([...wordsA, ...wordsB]).size
    return intersection / union
}

// Returns how much (%) the content changed compared to last checked
function changePercent(last: string, current: string): number {
    return (1 - jaccardSimilarity(last, current)) * 100
}

const MIN_CHANGE_PCT = 5   // student must change at least 5% between checks
const MIN_WORDS = 10

export default function EssayAssistant({ essayContent }: EssayAssistantProps) {
    const [open, setOpen] = useState(false)
    const [history, setHistory] = useState<FeedbackEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    const wordCount = essayContent.trim().split(/\s+/).filter(Boolean).length
    const hasContent = wordCount >= MIN_WORDS

    const lastEntry = history[history.length - 1]
    const changed = lastEntry
        ? changePercent(lastEntry.checkedContent, essayContent)
        : 100   // first check — always allowed

    const notChangedEnough = hasContent && history.length > 0 && changed < MIN_CHANGE_PCT
    const canCheck = hasContent && !loading && !notChangedEnough

    // Auto-scroll to bottom when new entry arrives
    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history, open, loading])

    const runCheck = async () => {
        if (!canCheck) return
        setError(null)
        setLoading(true)

        try {
            const res = await fetch('/api/essay-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    essay_content: essayContent,
                    previous_feedback: history.map(h => h.text),  // full chat context
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Request failed')
            setHistory(prev => [...prev, {
                id: Date.now(),
                text: data.result,
                wordCount,
                checkedContent: essayContent,
            }])
        } catch (e: any) {
            setError(e.message || 'Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    // Progress bar showing how much student has changed since last check
    const changePct = Math.min(changed, 100)
    const progressColor = changePct >= MIN_CHANGE_PCT ? '#22c55e' : '#3b82f6'

    return (
        <>
            {/* ── Popup panel ── */}
            {open && (
                <div
                    className="fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                    style={{
                        width: 'min(480px, calc(100vw - 3rem))',
                        maxHeight: 'min(680px, calc(100vh - 100px))',
                        background: '#ffffff',
                        border: '2px solid #3b82f6',
                    }}
                >
                    {/* Header */}
                    <div style={{ background: '#3b82f6' }} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center font-extrabold text-blue-500 text-xs">
                                EVA
                            </div>
                            <div>
                                <span className="text-white font-bold text-sm tracking-wide">EVA</span>
                                <span className="text-blue-100 text-xs ml-2">Essay Virtual Assistant</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="text-white/70 hover:text-white transition-colors text-lg leading-none"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Change progress bar (shown after first check) */}
                    {history.length > 0 && (
                        <div className="px-4 py-2 border-b border-blue-100 bg-blue-50">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-blue-700 font-medium">
                                    {notChangedEnough
                                        ? 'Apply EVA\'s feedback and make meaningful changes to your essay first'
                                        : changePct >= MIN_CHANGE_PCT
                                            ? '✅ Ready for another check!'
                                            : 'Keep improving your essay to unlock the next check'}
                                </span>
                            </div>
                            <div className="w-full bg-blue-200 rounded-full h-1.5">
                                <div
                                    className="h-1.5 rounded-full transition-all duration-500"
                                    style={{ width: `${changePct}%`, background: progressColor }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Scrollable history */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                        {history.length === 0 && !loading && !error && (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                <div className="text-4xl mb-3">🎓</div>
                                <p className="font-medium text-gray-600">Hi! I&apos;m EVA</p>
                                <p className="text-xs mt-1 text-gray-400">
                                    {hasContent
                                        ? 'Click the button below to get feedback on your essay.'
                                        : 'Write at least 10 words in your essay to get started.'}
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                                ⚠️ {error}
                            </div>
                        )}

                        {history.map((entry, idx) => (
                            <div key={entry.id} className="space-y-1.5">
                                {/* Check label */}
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                        {idx + 1}
                                    </div>
                                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                                        Check #{idx + 1}
                                        <span className="ml-2 font-normal text-gray-400 normal-case">
                                            ({entry.wordCount} words)
                                        </span>
                                    </span>
                                </div>

                                {/* Feedback bubble */}
                                <div
                                    className="ml-7 rounded-xl rounded-tl-sm p-3 text-sm text-gray-800 leading-relaxed space-y-1.5"
                                    style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
                                >
                                    {entry.text.split('\n').map((line, i) => {
                                        if (!line.trim()) return <div key={i} className="h-1" />
                                        const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        return <p key={i} className="text-gray-800" dangerouslySetInnerHTML={{ __html: html }} />
                                    })}
                                </div>

                                {idx < history.length - 1 && (
                                    <div className="ml-7 border-t border-blue-100 pt-2" />
                                )}
                            </div>
                        ))}

                        {loading && (
                            <div className="flex items-center gap-3 ml-7">
                                <div className="flex gap-1">
                                    {[0, 150, 300].map(delay => (
                                        <div
                                            key={delay}
                                            className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                                            style={{ animationDelay: `${delay}ms` }}
                                        />
                                    ))}
                                </div>
                                <span className="text-xs text-gray-400">EVA is reading your essay…</span>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {/* Action button */}
                    <div className="px-4 py-3 border-t border-blue-100 bg-white">
                        <button
                            type="button"
                            onClick={runCheck}
                            disabled={!canCheck}
                            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                            style={canCheck
                                ? { background: '#3b82f6', color: '#ffffff', cursor: 'pointer' }
                                : { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' }
                            }
                        >
                            {loading
                                ? 'Analysing…'
                                : notChangedEnough
                                    ? '✏️ Improve your essay to check again'
                                    : !hasContent
                                        ? 'Write more to check'
                                        : history.length === 0
                                            ? '🔍 Check My Essay'
                                            : '🔍 Check My Essay Again'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Floating toggle button ── */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                title="EVA – Essay Virtual Assistant"
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-full shadow-xl transition-all"
                style={{ background: open ? '#1d4ed8' : '#3b82f6', color: '#ffffff' }}
            >
                <span className="font-extrabold text-sm tracking-wide">EVA</span>
                {!open && (
                    <span className="text-sm font-semibold whitespace-nowrap">
                        {history.length === 0 ? 'Check My Essay' : 'Check My Essay Again'}
                        {notChangedEnough && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-yellow-400 text-yellow-900 font-bold">
                                Edit more
                            </span>
                        )}
                    </span>
                )}
                {open && <span className="text-sm">✕</span>}
            </button>
        </>
    )
}

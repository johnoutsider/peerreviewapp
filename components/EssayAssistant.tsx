'use client'

import { useState, useRef, useEffect } from 'react'

interface EssayAssistantProps {
    essayContent: string
}

interface FeedbackEntry {
    id: number
    text: string
    wordCount: number
    checkedContent: string
}

function jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().trim().split(/\s+/).filter(Boolean))
    const wordsB = new Set(b.toLowerCase().trim().split(/\s+/).filter(Boolean))
    if (wordsA.size === 0 && wordsB.size === 0) return 1
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length
    const union = new Set([...wordsA, ...wordsB]).size
    return intersection / union
}

function changePercent(last: string, current: string): number {
    return (1 - jaccardSimilarity(last, current)) * 100
}

const MIN_CHANGE_PCT = 5
const MIN_WORDS = 10

export default function EssayAssistant({ essayContent }: EssayAssistantProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [history, setHistory] = useState<FeedbackEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    const wordCount = essayContent.trim().split(/\s+/).filter(Boolean).length
    const hasContent = wordCount >= MIN_WORDS
    const lastEntry = history[history.length - 1]
    const changed = lastEntry ? changePercent(lastEntry.checkedContent, essayContent) : 100
    const notChangedEnough = hasContent && history.length > 0 && changed < MIN_CHANGE_PCT
    const canCheck = hasContent && !loading && !notChangedEnough
    const changePct = Math.min(changed, 100)
    const progressColor = changePct >= MIN_CHANGE_PCT ? '#22c55e' : '#3b82f6'

    useEffect(() => {
        if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history, loading, isOpen])

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
                    previous_feedback: history.map(h => h.text),
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

    return (
        <div
            className="flex flex-col rounded-2xl overflow-hidden shadow-sm"
            style={{ background: '#ffffff', border: '2px solid #3b82f6' }}
        >
            {/* ── Header (always visible, toggles panel) ── */}
            <button
                type="button"
                onClick={() => setIsOpen(o => !o)}
                className="flex items-center justify-between px-4 py-3 w-full text-left shrink-0 hover:opacity-90 transition-opacity"
                style={{ background: '#3b82f6' }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-extrabold text-blue-500 text-xs shrink-0">
                        EVA
                    </div>
                    <div>
                        <div className="text-white font-bold text-sm tracking-wide">EVA</div>
                        <div className="text-blue-100 text-xs">Essay Virtual Assistant</div>
                    </div>
                </div>
                <span className="text-white text-base">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* ── Collapsed hint ── */}
            {!isOpen && (
                <div className="px-4 py-3 text-center">
                    <p className="text-gray-500 text-sm">Click to open EVA and get feedback on your essay.</p>
                    {history.length > 0 && (
                        <p className="text-blue-500 text-xs mt-1 font-medium">
                            {history.length} check{history.length !== 1 ? 's' : ''} done
                        </p>
                    )}
                </div>
            )}

            {/* ── Expanded panel ── */}
            {isOpen && (
                <>
                    {/* Progress bar — shown after first check */}
                    {history.length > 0 && (
                        <div className="px-4 py-2 border-b border-blue-100 bg-blue-50 shrink-0">
                            <span className="text-xs text-blue-700 font-medium">
                                {notChangedEnough
                                    ? "Apply EVA's feedback and make meaningful changes first"
                                    : changePct >= MIN_CHANGE_PCT
                                        ? '✅ Ready for another check!'
                                        : 'Keep improving your essay to unlock the next check'}
                            </span>
                            <div className="w-full bg-blue-200 rounded-full h-1.5 mt-1.5">
                                <div
                                    className="h-1.5 rounded-full transition-all duration-500"
                                    style={{ width: `${changePct}%`, background: progressColor }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Scrollable history */}
                    <div
                        className="overflow-y-auto px-4 py-3 space-y-4"
                        style={{ maxHeight: '420px' }}
                    >
                        {history.length === 0 && !loading && !error && (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                <div className="text-5xl mb-3">🎓</div>
                                <p className="font-medium text-gray-600 text-base">Hi! I&apos;m EVA</p>
                                <p className="text-xs mt-2 text-gray-400 max-w-xs mx-auto">
                                    {hasContent
                                        ? 'Click the button below to get feedback on your essay before submitting.'
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
                                {idx < history.length - 1 && <div className="ml-7 border-t border-blue-100 pt-2" />}
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

                    {/* Check button */}
                    <div className="px-4 py-3 border-t border-blue-100 bg-white shrink-0">
                        <button
                            type="button"
                            onClick={runCheck}
                            disabled={!canCheck}
                            className="w-full py-3 rounded-xl text-sm font-bold transition-all"
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
                </>
            )}
        </div>
    )
}

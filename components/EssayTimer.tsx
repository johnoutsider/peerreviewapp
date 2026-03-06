'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const PRESET_MINUTES = [20, 30, 40, 45, 60]

export interface TimerResult {
    durationMinutes: number | null   // selected preset (null = not used)
    elapsedSeconds: number           // how long they actually spent writing
}

interface EssayTimerProps {
    onUpdate: (result: TimerResult) => void
}

function fmt(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

export default function EssayTimer({ onUpdate }: EssayTimerProps) {
    const [enabled, setEnabled] = useState(false)
    const [durationMin, setDurationMin] = useState(40)
    const [running, setRunning] = useState(false)
    const [started, setStarted] = useState(false)   // once started, can't reset preset
    const [remaining, setRemaining] = useState(40 * 60)
    const [elapsed, setElapsed] = useState(0)
    const [finished, setFinished] = useState(false)

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Report to parent whenever elapsed changes
    useEffect(() => {
        onUpdate({
            durationMinutes: enabled ? durationMin : null,
            elapsedSeconds: elapsed,
        })
    }, [enabled, durationMin, elapsed, onUpdate])

    const tick = useCallback(() => {
        setRemaining(r => {
            if (r <= 1) {
                setRunning(false)
                setFinished(true)
                return 0
            }
            return r - 1
        })
        setElapsed(e => e + 1)
    }, [])

    // Start / pause toggle
    const toggleRun = () => {
        if (finished) return
        if (running) {
            clearInterval(intervalRef.current!)
            intervalRef.current = null
            setRunning(false)
        } else {
            setStarted(true)
            setRunning(true)
            intervalRef.current = setInterval(tick, 1000)
        }
    }

    // Reset (only available before starting)
    const reset = () => {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setRunning(false)
        setStarted(false)
        setFinished(false)
        setElapsed(0)
        setRemaining(durationMin * 60)
    }

    // Apply preset change (only before starting)
    const changeDuration = (min: number) => {
        setDurationMin(min)
        setRemaining(min * 60)
    }

    // Cleanup on unmount
    useEffect(() => () => clearInterval(intervalRef.current!), [])

    // ── Colour coding ──────────────────────────────────────────────────────────
    const pct = remaining / (durationMin * 60)
    const urgency =
        finished ? 'red' :
            pct <= 0.1 ? 'red' :
                pct <= 0.25 ? 'orange' :
                    'green'

    const ringColour = {
        green: 'stroke-green-500',
        orange: 'stroke-orange-400',
        red: 'stroke-red-500',
    }[urgency]

    const textColour = {
        green: 'text-green-500',
        orange: 'text-orange-400',
        red: 'text-red-500',
    }[urgency]

    const radius = 36
    const circumference = 2 * Math.PI * radius
    const dashOffset = circumference * (1 - (finished ? 0 : pct))

    if (!enabled) {
        return (
            <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-dashed border-slate-300  bg-slate-50 ">
                <span className="text-2xl">⏱️</span>
                <div className="flex-1">
                    <p className="text-slate-700  font-medium text-sm">Essay Timer <span className="text-slate-400 font-normal">(optional)</span></p>
                    <p className="text-slate-400  text-xs mt-0.5">Practice writing under timed conditions</p>
                </div>
                <button
                    type="button"
                    onClick={() => setEnabled(true)}
                    className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30 rounded-lg text-sm font-medium transition-colors"
                >
                    Add Timer
                </button>
            </div>
        )
    }

    return (
        <div className={`mb-6 rounded-xl border shadow-sm overflow-hidden transition-all
            ${finished
                ? 'border-red-500/40 bg-red-500/5'
                : running
                    ? 'border-green-500/30 bg-green-500/5 '
                    : 'border-slate-200  bg-white '
            }`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200  bg-slate-50 ">
                <span className="text-sm font-semibold text-slate-700  flex items-center gap-2">
                    ⏱️ Essay Timer
                    {running && <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
                </span>
                {!started && (
                    <button
                        type="button"
                        onClick={() => { setEnabled(false); reset() }}
                        className="text-xs text-slate-400 hover:text-slate-600  transition-colors"
                    >
                        Remove
                    </button>
                )}
            </div>

            <div className="flex items-center gap-6 px-5 py-4 flex-wrap">
                {/* Circular countdown */}
                <div className="relative flex items-center justify-center shrink-0">
                    <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
                        {/* Track */}
                        <circle cx="48" cy="48" r={radius} fill="none" strokeWidth="6" className="stroke-slate-200 " />
                        {/* Progress */}
                        <circle
                            cx="48" cy="48" r={radius}
                            fill="none" strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            className={`${ringColour} transition-all duration-1000`}
                        />
                    </svg>
                    <span className={`absolute text-lg font-bold font-mono tabular-nums ${textColour} ${running ? 'animate-none' : ''}`}>
                        {fmt(remaining)}
                    </span>
                </div>

                {/* Controls */}
                <div className="flex-1 min-w-0">
                    {/* Preset picker */}
                    {!started && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {PRESET_MINUTES.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => changeDuration(m)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                                        ${durationMin === m
                                            ? 'bg-blue-500 text-white border-blue-500'
                                            : 'border-slate-300  text-slate-600  hover:border-blue-400'
                                        }`}
                                >
                                    {m} min
                                </button>
                            ))}
                        </div>
                    )}

                    {started && (
                        <p className="text-xs text-slate-500  mb-2">
                            {finished
                                ? '⏰ Time is up! You can still finish and submit.'
                                : `Elapsed: ${fmt(elapsed)}`}
                        </p>
                    )}

                    <div className="flex gap-2">
                        {!finished && (
                            <button
                                type="button"
                                onClick={toggleRun}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                                    ${running
                                        ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30'
                                        : 'bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/30'
                                    }`}
                            >
                                {running ? '⏸ Pause' : started ? '▶ Resume' : '▶ Start'}
                            </button>
                        )}
                        {!running && started && !finished && (
                            <button
                                type="button"
                                onClick={reset}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 border border-slate-300  hover:bg-slate-100  transition-colors"
                            >
                                ↺ Reset
                            </button>
                        )}
                        {finished && (
                            <span className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/10 text-red-500 border border-red-500/30">
                                ⏰ Time&apos;s up — {fmt(elapsed)} used
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Elapsed bar */}
            {started && (
                <div className="h-1 bg-slate-100 ">
                    <div
                        className={`h-1 transition-all duration-1000 ${urgency === 'red' ? 'bg-red-500' : urgency === 'orange' ? 'bg-orange-400' : 'bg-green-500'}`}
                        style={{ width: `${(1 - pct) * 100}%` }}
                    />
                </div>
            )}
        </div>
    )
}

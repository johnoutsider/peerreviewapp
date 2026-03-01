'use client'

interface AiDetectorModalProps {
    /** 'checking' = spinner, 'rejected' = AI-content message, null = hidden */
    state: 'checking' | 'rejected' | null
    onDismiss: () => void
}

export default function AiDetectorModal({ state, onDismiss }: AiDetectorModalProps) {
    if (!state) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-8 border border-slate-200 dark:border-white/10 animate-fade-in">

                {state === 'checking' && (
                    <div className="flex flex-col items-center gap-4 py-4">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full border-4 border-blue-100 dark:border-slate-700" />
                            <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Checking your essay…</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm text-center">
                            We&apos;re quickly verifying the originality of your work. This takes just a moment.
                        </p>
                    </div>
                )}

                {state === 'rejected' && (
                    <div className="flex flex-col items-center gap-5">
                        {/* Icon */}
                        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                            <span className="text-3xl">🤖</span>
                        </div>

                        {/* Heading */}
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white text-center">
                            AI Content Detected
                        </h2>

                        {/* Encouraging message */}
                        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300 text-center leading-relaxed">
                            <p className="font-semibold mb-1">✨ Your voice is your superpower!</p>
                            <p>
                                It looks like this essay may have been generated with AI. We know writing can feel daunting sometimes —
                                but <strong>your own thoughts, ideas, and words</strong> are what make your work truly shine.
                                Your teachers and peers want to hear <em>you</em>, not a machine!
                            </p>
                        </div>

                        <p className="text-slate-500 dark:text-slate-400 text-sm text-center">
                            Please go back, write your essay in your own words, and resubmit.
                            You&apos;ve got this — we believe in you! 💪
                        </p>

                        {/* Dismiss button */}
                        <button
                            onClick={onDismiss}
                            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-3 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all shadow-md hover:shadow-blue-500/30"
                        >
                            Got it — I&apos;ll rewrite it myself ✍️
                        </button>
                    </div>
                )}

            </div>
        </div>
    )
}

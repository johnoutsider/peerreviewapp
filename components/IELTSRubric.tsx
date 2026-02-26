'use client'

import { useState } from 'react'

export default function IELTSRubric() {
    const [isOpen, setIsOpen] = useState(false)

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2 z-50"
            >
                <span>📊</span>
                View Assessment Rubric
            </button>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl max-w-6xl w-full h-[90vh] flex flex-col border border-slate-300 dark:border-white/20">
                <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 shadow-sm p-4 flex justify-between items-center rounded-t-2xl">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Assessment Rubric</h2>
                    <div className="flex gap-4 items-center">
                        <a
                            href="/rubric.pdf"
                            download
                            className="text-blue-400 hover:text-blue-300 text-sm"
                        >
                            Download PDF ⬇️
                        </a>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white text-2xl"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="flex-1 bg-white dark:bg-slate-800 rounded-b-2xl overflow-hidden">
                    <iframe
                        src="/rubric.pdf"
                        className="w-full h-full"
                        title="Assessment Rubric"
                    />
                </div>
            </div>
        </div>
    )
}

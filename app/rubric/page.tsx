'use client'

import Header from '@/components/Header'

export default function RubricPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 h-[calc(100vh-80px)]">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Assessment Rubric</h1>
                        <p className="text-slate-500 dark:text-gray-400">Reference guide for grading essays</p>
                    </div>
                    <a
                        href="/rubric.pdf"
                        download
                        className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:bg-slate-900/50 text-slate-900 dark:text-white px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm transition-colors"
                    >
                        Download PDF ⬇️
                    </a>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-4 h-full shadow-2xl">
                    <iframe
                        src="/rubric.pdf"
                        className="w-full h-full rounded-lg bg-white dark:bg-slate-800"
                        title="Assessment Rubric"
                    />
                </div>
            </main>
        </div>
    )
}

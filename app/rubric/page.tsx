'use client'

import Header from '@/components/Header'

export default function RubricPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 h-[calc(100vh-80px)]">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Assessment Rubric</h1>
                        <p className="text-gray-400">Reference guide for grading essays</p>
                    </div>
                    <a
                        href="/rubric.pdf"
                        download
                        className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg border border-white/10 transition-colors"
                    >
                        Download PDF ⬇️
                    </a>
                </div>

                <div className="bg-slate-800/50 rounded-xl border border-white/10 p-4 h-full shadow-2xl">
                    <iframe
                        src="/rubric.pdf"
                        className="w-full h-full rounded-lg bg-white"
                        title="Assessment Rubric"
                    />
                </div>
            </main>
        </div>
    )
}

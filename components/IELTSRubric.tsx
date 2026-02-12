'use client'

import { useState } from 'react'

const rubricContent = {
    taskAchievement: {
        title: 'Task Achievement',
        bands: {
            9: 'Fully addresses all parts of the task with very natural and sophisticated ideas',
            7: 'Addresses all parts of the task with well-developed ideas',
            5: 'Addresses the task only partially with limited ideas',
        }
    },
    coherenceCohesion: {
        title: 'Coherence & Cohesion',
        bands: {
            9: 'Uses cohesion in such a way that it attracts no attention; skillful paragraphing',
            7: 'Logically organizes information and ideas; clear progression throughout',
            5: 'Presents information with some organization but lacks overall progression',
        }
    },
    lexicalResource: {
        title: 'Lexical Resource',
        bands: {
            9: 'Uses wide range of vocabulary with very natural and sophisticated control',
            7: 'Uses sufficient range of vocabulary with some flexibility and precision',
            5: 'Uses limited range of vocabulary; noticeable errors may cause difficulty',
        }
    },
    grammaticalRange: {
        title: 'Grammatical Range & Accuracy',
        bands: {
            9: 'Uses wide range of structures with full flexibility; rare minor errors',
            7: 'Uses variety of complex structures; frequently error-free sentences',
            5: 'Uses limited range of structures; attempts complex sentences with errors',
        }
    }
}

export default function IELTSRubric() {
    const [isOpen, setIsOpen] = useState(false)

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2 z-50"
            >
                <span>📊</span>
                View IELTS Rubric
            </button>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-white/20">
                <div className="sticky top-0 bg-slate-900 border-b border-white/10 p-6 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white">IELTS Writing Band Descriptors</h2>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-gray-400 hover:text-white text-2xl"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {Object.entries(rubricContent).map(([key, criterion]) => (
                        <div key={key} className="bg-slate-800/50 rounded-xl p-5 border border-white/10">
                            <h3 className="text-xl font-semibold text-blue-400 mb-3">{criterion.title}</h3>
                            <div className="space-y-2">
                                {Object.entries(criterion.bands).map(([band, description]) => (
                                    <div key={band} className="flex gap-3">
                                        <span className="text-green-400 font-bold min-w-[30px]">Band {band}:</span>
                                        <span className="text-gray-300">{description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

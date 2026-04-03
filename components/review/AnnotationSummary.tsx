'use client'

import { getAnnotationQuote, normalizeReviewAnnotations } from '@/lib/review-annotations'
import { ReviewAnnotation } from '@/lib/review-types'

interface AnnotationSummaryProps {
    content: string
    annotations?: ReviewAnnotation[]
    title?: string
    emptyText?: string
    tone?: 'student' | 'teacher' | 'neutral'
}

const toneClasses = {
    student: {
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        border: 'border-amber-200',
        quote: 'bg-amber-50 border-amber-100 text-slate-700',
    },
    teacher: {
        badge: 'bg-teal-50 text-teal-700 border-teal-200',
        border: 'border-teal-200',
        quote: 'bg-teal-50 border-teal-100 text-slate-700',
    },
    neutral: {
        badge: 'bg-slate-100 text-slate-700 border-slate-200',
        border: 'border-slate-200',
        quote: 'bg-slate-50 border-slate-200 text-slate-700',
    },
} as const

export default function AnnotationSummary({
    content,
    annotations = [],
    title = 'Highlighted Notes',
    emptyText = 'No highlighted notes were added to this review.',
    tone = 'neutral',
}: AnnotationSummaryProps) {
    const normalized = normalizeReviewAnnotations(content, annotations)
    const colors = toneClasses[tone]

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${colors.badge}`}>
                    {normalized.length} note{normalized.length !== 1 ? 's' : ''}
                </span>
            </div>

            {normalized.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
                    {emptyText}
                </div>
            ) : (
                <div className="space-y-3">
                    {normalized.map((annotation, index) => (
                        <div key={annotation.id} className={`rounded-xl border bg-white p-4 ${colors.border}`}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${colors.badge}`}>
                                    Note {index + 1}
                                </span>
                                <span className="text-xs text-slate-400">
                                    {annotation.endOffset - annotation.startOffset} chars
                                </span>
                            </div>

                            <div className={`mb-3 rounded-lg border px-3 py-2.5 text-sm italic ${colors.quote}`}>
                                "{getAnnotationQuote(content, annotation)}"
                            </div>

                            <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                                {annotation.note}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

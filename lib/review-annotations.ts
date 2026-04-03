import { AnnotationSelectionDraft, ReviewAnnotation } from '@/lib/review-types'

export interface AnnotationSegment {
    type: 'plain' | 'annotation'
    text: string
    annotation?: ReviewAnnotation
}

const CONTEXT_CHARS = 24

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

export function sortAnnotations(annotations: ReviewAnnotation[]) {
    return [...annotations].sort((a, b) => {
        if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
        return a.endOffset - b.endOffset
    })
}

export function normalizeReviewAnnotations(content: string, annotations: ReviewAnnotation[] | undefined | null) {
    if (!annotations?.length) return [] as ReviewAnnotation[]

    const length = content.length
    const sorted = sortAnnotations(
        annotations
            .map(annotation => {
                const startOffset = clamp(annotation.startOffset ?? 0, 0, length)
                const endOffset = clamp(annotation.endOffset ?? 0, 0, length)
                if (endOffset <= startOffset) return null

                const selectedText = content.slice(startOffset, endOffset)
                if (!selectedText) return null

                return {
                    ...annotation,
                    startOffset,
                    endOffset,
                    selectedText,
                    prefix: content.slice(Math.max(0, startOffset - CONTEXT_CHARS), startOffset),
                    suffix: content.slice(endOffset, Math.min(length, endOffset + CONTEXT_CHARS)),
                    note: annotation.note?.trim() ?? '',
                } satisfies ReviewAnnotation
            })
            .filter((annotation): annotation is ReviewAnnotation => Boolean(annotation))
    )

    const deduped: ReviewAnnotation[] = []
    let cursor = -1

    for (const annotation of sorted) {
        if (annotation.startOffset < cursor) continue
        deduped.push(annotation)
        cursor = annotation.endOffset
    }

    return deduped
}

export function buildAnnotationSegments(content: string, annotations: ReviewAnnotation[]) {
    const normalized = normalizeReviewAnnotations(content, annotations)
    if (!normalized.length) {
        return [{ type: 'plain', text: content }] as AnnotationSegment[]
    }

    const segments: AnnotationSegment[] = []
    let cursor = 0

    for (const annotation of normalized) {
        if (annotation.startOffset > cursor) {
            segments.push({
                type: 'plain',
                text: content.slice(cursor, annotation.startOffset),
            })
        }

        segments.push({
            type: 'annotation',
            text: content.slice(annotation.startOffset, annotation.endOffset),
            annotation,
        })

        cursor = annotation.endOffset
    }

    if (cursor < content.length) {
        segments.push({
            type: 'plain',
            text: content.slice(cursor),
        })
    }

    return segments
}

export function hasAnnotationOverlap(
    annotations: ReviewAnnotation[],
    startOffset: number,
    endOffset: number,
    excludeId?: string
) {
    return sortAnnotations(annotations).some(annotation => {
        if (excludeId && annotation.id === excludeId) return false
        return startOffset < annotation.endOffset && endOffset > annotation.startOffset
    })
}

export function getTextOffsetsFromRange(container: HTMLElement, range: Range) {
    const startRange = document.createRange()
    startRange.selectNodeContents(container)
    startRange.setEnd(range.startContainer, range.startOffset)

    const endRange = document.createRange()
    endRange.selectNodeContents(container)
    endRange.setEnd(range.endContainer, range.endOffset)

    return {
        startOffset: startRange.toString().length,
        endOffset: endRange.toString().length,
    }
}

export function createSelectionDraft(content: string, startOffset: number, endOffset: number): AnnotationSelectionDraft | null {
    const safeStart = clamp(startOffset, 0, content.length)
    const safeEnd = clamp(endOffset, 0, content.length)
    if (safeEnd <= safeStart) return null

    const selectedText = content.slice(safeStart, safeEnd)
    if (!selectedText.trim()) return null

    return {
        startOffset: safeStart,
        endOffset: safeEnd,
        selectedText,
        prefix: content.slice(Math.max(0, safeStart - CONTEXT_CHARS), safeStart),
        suffix: content.slice(safeEnd, Math.min(content.length, safeEnd + CONTEXT_CHARS)),
    }
}

export function getAnnotationQuote(content: string, annotation: ReviewAnnotation) {
    const exactSlice = content.slice(annotation.startOffset, annotation.endOffset)
    return exactSlice || annotation.selectedText
}

export function createAnnotationId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    return `annotation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

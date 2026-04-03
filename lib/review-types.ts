export interface ReviewAnnotation {
    id: string
    startOffset: number
    endOffset: number
    selectedText: string
    prefix: string
    suffix: string
    note: string
    essayId?: string
    authorId?: string
    authorName?: string
    authorRole?: 'student' | 'teacher' | 'ai'
    color?: 'peer' | 'teacher'
    createdAt?: unknown
    updatedAt?: unknown
}

export interface AnnotationSelectionDraft {
    startOffset: number
    endOffset: number
    selectedText: string
    prefix: string
    suffix: string
}

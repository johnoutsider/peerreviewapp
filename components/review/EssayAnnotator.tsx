'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
    createSelectionDraft,
    getAnnotationQuote,
    getTextOffsetsFromRange,
    normalizeReviewAnnotations,
} from '@/lib/review-annotations'
import { AnnotationSelectionDraft, ReviewAnnotation } from '@/lib/review-types'

interface EssayAnnotatorProps {
    content: string
    annotations?: ReviewAnnotation[]
    editable?: boolean
    onCreateAnnotation?: (draft: AnnotationSelectionDraft, note: string) => Promise<void> | void
    onUpdateAnnotation?: (annotation: ReviewAnnotation, note: string) => Promise<void> | void
    onDeleteAnnotation?: (annotation: ReviewAnnotation) => Promise<void> | void
    canEditAnnotation?: (annotation: ReviewAnnotation) => boolean
    tone?: 'student' | 'teacher'
    title?: string
    subtitle?: string
    emptyText?: string
    showAnnotationList?: boolean
}

const toneClasses = {
    student: {
        highlight: 'bg-amber-200/90 border-b-2 border-amber-400 hover:bg-amber-300/90',
        teacherHighlight: 'bg-teal-100/95 border-b-2 border-teal-400 hover:bg-teal-200/95',
        activeHighlight: 'ring-2 ring-blue-400 ring-offset-1',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        teacherBadge: 'bg-teal-50 text-teal-700 border-teal-200',
        panelBorder: 'border-blue-100',
        panelBg: 'bg-blue-50',
        action: 'bg-blue-600 hover:bg-blue-700',
        actionMuted: 'text-blue-600 hover:text-blue-700',
    },
    teacher: {
        highlight: 'bg-amber-200/90 border-b-2 border-amber-400 hover:bg-amber-300/90',
        teacherHighlight: 'bg-teal-100/95 border-b-2 border-teal-400 hover:bg-teal-200/95',
        activeHighlight: 'ring-2 ring-teal-400 ring-offset-1',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        teacherBadge: 'bg-teal-50 text-teal-700 border-teal-200',
        panelBorder: 'border-teal-100',
        panelBg: 'bg-teal-50',
        action: 'bg-teal-600 hover:bg-teal-700',
        actionMuted: 'text-teal-600 hover:text-teal-700',
    },
} as const

function clampPopoverPosition(rect: DOMRect) {
    const width = 360
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16)
    const top = Math.min(rect.bottom + 12, window.innerHeight - 260)
    return { left, top }
}

export default function EssayAnnotator({
    content,
    annotations = [],
    editable = false,
    onCreateAnnotation,
    onUpdateAnnotation,
    onDeleteAnnotation,
    canEditAnnotation,
    tone = 'student',
    title = 'Essay Notes',
    subtitle = 'Highlight a passage to add a saved note or click an existing highlight to read it.',
    emptyText = 'No highlighted notes yet.',
    showAnnotationList = true,
}: EssayAnnotatorProps) {
    const colors = toneClasses[tone]
    const essayRef = useRef<HTMLDivElement | null>(null)
    const highlightRefs = useRef<Record<string, HTMLSpanElement | null>>({})

    const normalizedAnnotations = useMemo(
        () => normalizeReviewAnnotations(content, annotations),
        [annotations, content]
    )

    const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
    const [selectionDraft, setSelectionDraft] = useState<AnnotationSelectionDraft | null>(null)
    const [draftNote, setDraftNote] = useState('')
    const [composerStyle, setComposerStyle] = useState<{ left: number; top: number } | null>(null)
    const [popupStyle, setPopupStyle] = useState<{ left: number; top: number } | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingNote, setEditingNote] = useState('')
    const [selectionError, setSelectionError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const activeAnnotation = normalizedAnnotations.find(annotation => annotation.id === activeAnnotationId) ?? null

    useEffect(() => {
        if (!activeAnnotationId && normalizedAnnotations.length) {
            setActiveAnnotationId(normalizedAnnotations[0].id)
        }

        if (activeAnnotationId && !normalizedAnnotations.some(annotation => annotation.id === activeAnnotationId)) {
            setActiveAnnotationId(normalizedAnnotations[0]?.id ?? null)
            setPopupStyle(null)
        }
    }, [activeAnnotationId, normalizedAnnotations])

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null
            if (!target) return

            const insideEssay = essayRef.current?.contains(target) ?? false
            const insideOverlay = Boolean(target.closest('[data-annotation-overlay="true"]'))
            if (insideEssay || insideOverlay) return

            setSelectionDraft(null)
            setDraftNote('')
            setComposerStyle(null)
            setPopupStyle(null)
            setEditingId(null)
            setEditingNote('')
            setSelectionError(null)
        }

        document.addEventListener('mousedown', handlePointerDown)
        return () => document.removeEventListener('mousedown', handlePointerDown)
    }, [])

    const openAnnotationPopup = (annotation: ReviewAnnotation) => {
        setActiveAnnotationId(annotation.id)
        setSelectionDraft(null)
        setComposerStyle(null)
        setEditingId(null)
        setEditingNote('')

        const rect = highlightRefs.current[annotation.id]?.getBoundingClientRect()
        if (rect) {
            setPopupStyle(clampPopoverPosition(rect))
        }
    }

    const handleSelection = () => {
        if (!editable || !essayRef.current || !onCreateAnnotation) return

        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

        const range = selection.getRangeAt(0)
        if (!essayRef.current.contains(range.commonAncestorContainer)) return

        const { startOffset, endOffset } = getTextOffsetsFromRange(essayRef.current, range)
        const draft = createSelectionDraft(content, startOffset, endOffset)

        if (!draft) {
            setSelectionDraft(null)
            setDraftNote('')
            setComposerStyle(null)
            return
        }

        const overlaps = normalizedAnnotations.some(annotation =>
            draft.startOffset < annotation.endOffset && draft.endOffset > annotation.startOffset
        )

        if (overlaps) {
            setSelectionError('This passage already has a note. Click the highlight to read the saved note.')
            setSelectionDraft(null)
            setDraftNote('')
            setComposerStyle(null)
            selection.removeAllRanges()
            return
        }

        const rect = range.getBoundingClientRect()
        setSelectionDraft(draft)
        setDraftNote('')
        setComposerStyle(clampPopoverPosition(rect))
        setPopupStyle(null)
        setSelectionError(null)
    }

    const handleCreateAnnotation = async () => {
        if (!selectionDraft || !draftNote.trim() || !onCreateAnnotation) return

        try {
            setSaving(true)
            await onCreateAnnotation(selectionDraft, draftNote.trim())
            setSelectionDraft(null)
            setDraftNote('')
            setComposerStyle(null)
            setSelectionError(null)
            window.getSelection()?.removeAllRanges()
        } finally {
            setSaving(false)
        }
    }

    const startEditing = (annotation: ReviewAnnotation) => {
        setActiveAnnotationId(annotation.id)
        setEditingId(annotation.id)
        setEditingNote(annotation.note)
        openAnnotationPopup(annotation)
    }

    const saveEditing = async () => {
        if (!activeAnnotation || !editingNote.trim() || !onUpdateAnnotation) return

        try {
            setSaving(true)
            await onUpdateAnnotation(activeAnnotation, editingNote.trim())
            setEditingId(null)
            setEditingNote('')
        } finally {
            setSaving(false)
        }
    }

    const deleteAnnotation = async (annotation: ReviewAnnotation) => {
        if (!onDeleteAnnotation) return

        try {
            setSaving(true)
            await onDeleteAnnotation(annotation)
            if (activeAnnotationId === annotation.id) {
                setActiveAnnotationId(null)
                setPopupStyle(null)
            }
            if (editingId === annotation.id) {
                setEditingId(null)
                setEditingNote('')
            }
        } finally {
            setSaving(false)
        }
    }

    const segments = useMemo(() => {
        if (!normalizedAnnotations.length) {
            return [{ id: 'plain_0', type: 'plain' as const, text: content }]
        }

        const parts: Array<{ id: string; type: 'plain' | 'annotation'; text: string; annotation?: ReviewAnnotation }> = []
        let cursor = 0

        normalizedAnnotations.forEach(annotation => {
            if (annotation.startOffset > cursor) {
                parts.push({
                    id: `plain_${cursor}`,
                    type: 'plain',
                    text: content.slice(cursor, annotation.startOffset),
                })
            }

            parts.push({
                id: annotation.id,
                type: 'annotation',
                text: content.slice(annotation.startOffset, annotation.endOffset),
                annotation,
            })

            cursor = annotation.endOffset
        })

        if (cursor < content.length) {
            parts.push({
                id: `plain_${cursor}`,
                type: 'plain',
                text: content.slice(cursor),
            })
        }

        return parts
    }, [content, normalizedAnnotations])

    return (
        <div className="space-y-4">
            <div className={`rounded-xl border bg-white p-4 ${colors.panelBorder}`}>
                <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
                        <p className="text-sm text-slate-500">{subtitle}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${colors.badge}`}>
                        {normalizedAnnotations.length} note{normalizedAnnotations.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {selectionError && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                        {selectionError}
                    </div>
                )}

                <div className="relative">
                    <div
                        ref={essayRef}
                        onMouseUp={handleSelection}
                        onKeyUp={handleSelection}
                        className={`rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap ${editable ? 'select-text' : ''}`}
                    >
                        {segments.map(segment => {
                            if (segment.type === 'plain') {
                                return <span key={segment.id}>{segment.text}</span>
                            }

                            const annotation = segment.annotation!
                            const isActive = annotation.id === activeAnnotationId
                            const highlightClass = annotation.authorRole === 'teacher'
                                ? colors.teacherHighlight
                                : colors.highlight

                            return (
                                <span
                                    key={annotation.id}
                                    ref={node => {
                                        highlightRefs.current[annotation.id] = node
                                    }}
                                    onClick={() => openAnnotationPopup(annotation)}
                                    className={`cursor-pointer rounded-sm transition-all ${highlightClass} ${isActive ? colors.activeHighlight : ''}`}
                                >
                                    {segment.text}
                                </span>
                            )
                        })}
                    </div>

                    {selectionDraft && composerStyle && (
                        <div
                            data-annotation-overlay="true"
                            className="fixed z-30 w-[360px] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
                            style={composerStyle}
                        >
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">New note</p>
                            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm italic text-slate-600">
                                "{selectionDraft.selectedText}"
                            </div>
                            <textarea
                                value={draftNote}
                                onChange={event => setDraftNote(event.target.value)}
                                rows={4}
                                placeholder="Add a specific note for this highlighted passage."
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400 resize-none"
                            />
                            <div className="mt-3 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectionDraft(null)
                                        setDraftNote('')
                                        setComposerStyle(null)
                                        window.getSelection()?.removeAllRanges()
                                    }}
                                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateAnnotation}
                                    disabled={!draftNote.trim() || saving}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 ${colors.action}`}
                                >
                                    {saving ? 'Saving…' : 'Save note'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeAnnotation && popupStyle && !selectionDraft && (
                        <div
                            data-annotation-overlay="true"
                            className="fixed z-20 w-[360px] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
                            style={popupStyle}
                        >
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <span
                                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${activeAnnotation.authorRole === 'teacher' ? colors.teacherBadge : colors.badge}`}
                                >
                                    {activeAnnotation.authorRole === 'teacher' ? 'Teacher note' : 'Peer note'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPopupStyle(null)}
                                    className="text-sm font-semibold text-slate-400 hover:text-slate-600"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm italic text-slate-600">
                                "{getAnnotationQuote(content, activeAnnotation)}"
                            </div>

                            {editingId === activeAnnotation.id ? (
                                <div className="space-y-3">
                                    <textarea
                                        value={editingNote}
                                        onChange={event => setEditingNote(event.target.value)}
                                        rows={4}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-slate-400 resize-none"
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingId(null)
                                                setEditingNote('')
                                            }}
                                            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveEditing}
                                            disabled={!editingNote.trim() || saving}
                                            className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 ${colors.action}`}
                                        >
                                            {saving ? 'Saving…' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                                    {activeAnnotation.note}
                                </p>
                            )}

                            {canEditAnnotation?.(activeAnnotation) && editingId !== activeAnnotation.id && (
                                <div className="mt-4 flex items-center justify-end gap-3">
                                    {onUpdateAnnotation && (
                                        <button
                                            type="button"
                                            onClick={() => startEditing(activeAnnotation)}
                                            className={`text-sm font-semibold ${colors.actionMuted}`}
                                        >
                                            Edit
                                        </button>
                                    )}
                                    {onDeleteAnnotation && (
                                        <button
                                            type="button"
                                            onClick={() => deleteAnnotation(activeAnnotation)}
                                            className="text-sm font-semibold text-red-500 hover:text-red-600"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showAnnotationList && (
                <div className={`rounded-xl border bg-white p-4 ${colors.panelBorder}`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Saved Notes</p>
                        {editable && (
                            <span className="text-xs text-slate-400">
                                Existing notes stay visible for everyone reviewing this essay.
                            </span>
                        )}
                    </div>

                    {normalizedAnnotations.length === 0 ? (
                        <div className={`rounded-lg border border-dashed px-4 py-3 text-sm text-slate-400 ${colors.panelBg}`}>
                            {emptyText}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {normalizedAnnotations.map((annotation, index) => (
                                <button
                                    key={annotation.id}
                                    type="button"
                                    onClick={() => {
                                        highlightRefs.current[annotation.id]?.scrollIntoView({
                                            behavior: 'smooth',
                                            block: 'center',
                                        })
                                        openAnnotationPopup(annotation)
                                    }}
                                    className={`w-full rounded-xl border p-4 text-left transition-all ${annotation.id === activeAnnotationId ? colors.panelBorder : 'border-slate-200'} ${annotation.id === activeAnnotationId ? colors.panelBg : 'bg-slate-50'}`}
                                >
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <span
                                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${annotation.authorRole === 'teacher' ? colors.teacherBadge : colors.badge}`}
                                        >
                                            {annotation.authorRole === 'teacher' ? 'Teacher note' : `Peer note ${index + 1}`}
                                        </span>
                                        {canEditAnnotation?.(annotation) && (
                                            <span className="text-xs font-semibold text-slate-400">Your note</span>
                                        )}
                                    </div>

                                    <div className="mb-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm italic text-slate-600">
                                        "{getAnnotationQuote(content, annotation)}"
                                    </div>

                                    <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap line-clamp-3">
                                        {annotation.note}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

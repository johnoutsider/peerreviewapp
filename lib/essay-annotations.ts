import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sortAnnotations } from '@/lib/review-annotations'
import { AnnotationSelectionDraft, ReviewAnnotation } from '@/lib/review-types'

interface CreateEssayAnnotationInput {
    essayId: string
    authorId: string
    authorName: string
    authorRole: 'student' | 'teacher'
    draft: AnnotationSelectionDraft
    note: string
}

export function subscribeToEssayAnnotations(
    essayId: string,
    onValue: (annotations: ReviewAnnotation[]) => void
) {
    const annotationsQuery = query(
        collection(db, 'essayAnnotations'),
        where('essayId', '==', essayId)
    )

    return onSnapshot(annotationsQuery, snapshot => {
        const annotations = sortAnnotations(
            snapshot.docs.map(annotationDoc => ({
                id: annotationDoc.id,
                ...annotationDoc.data(),
            })) as ReviewAnnotation[]
        )

        onValue(annotations)
    })
}

export async function createEssayAnnotation({
    essayId,
    authorId,
    authorName,
    authorRole,
    draft,
    note,
}: CreateEssayAnnotationInput) {
    await addDoc(collection(db, 'essayAnnotations'), {
        essayId,
        authorId,
        authorName,
        authorRole,
        startOffset: draft.startOffset,
        endOffset: draft.endOffset,
        selectedText: draft.selectedText,
        prefix: draft.prefix,
        suffix: draft.suffix,
        note,
        color: authorRole === 'teacher' ? 'teacher' : 'peer',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    })
}

export async function updateEssayAnnotation(annotationId: string, note: string) {
    await updateDoc(doc(db, 'essayAnnotations', annotationId), {
        note,
        updatedAt: serverTimestamp(),
    })
}

export async function deleteEssayAnnotation(annotationId: string) {
    await deleteDoc(doc(db, 'essayAnnotations', annotationId))
}

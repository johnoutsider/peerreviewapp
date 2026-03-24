'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'
import { getAverageScore100 } from '@/lib/score-calculator'

export default function StudentDetails() {
    const router = useRouter()
    const params = useParams()
    const studentId = params.studentId as string

    const [student, setStudent] = useState<any>(null)
    const [essays, setEssays] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false)
    const [deletingStudent, setDeletingStudent] = useState(false)

    const fetchData = async () => {
        if (!auth.currentUser) { router.push('/'); return }

        try {
            const { getUserProfile } = await import('@/lib/auth')
            const myProfile = await getUserProfile(auth.currentUser.uid)
            if (myProfile?.role !== 'teacher') { router.push('/dashboard'); return }

            const studentDoc = await getDoc(doc(db, 'users', studentId))
            if (studentDoc.exists()) setStudent({ uid: studentDoc.id, ...studentDoc.data() })

            const essaysSnap = await getDocs(query(collection(db, 'essays'), where('studentId', '==', studentId)))
            const essayList = essaysSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
            essayList.sort((a, b) => (b.submittedAt?.toMillis() || 0) - (a.submittedAt?.toMillis() || 0))

            const essayIds = essayList.map(e => e.id)
            const essayChunks = Array.from({ length: Math.ceil(essayIds.length / 10) }, (_, i) => essayIds.slice(i * 10, i * 10 + 10))
            const reviewResults = await Promise.all(essayChunks.map(chunk => getDocs(query(collection(db, 'reviews'), where('essayId', 'in', chunk)))))
            const reviewsSnapDocs: any[] = reviewResults.flatMap(s => s.docs)
            const enriched = essayList.map(essay => {
                const received = reviewsSnapDocs
                    .filter(r => r.data().essayId === essay.id)
                    .map(r => r.data())
                const avgScore = getAverageScore100(received)
                const wordCount = essay.content?.trim().split(/\s+/).filter(Boolean).length || 0
                return { ...essay, reviewCount: received.length, avgScore, wordCount }
            })

            setEssays(enriched)
        } catch (error) {
            console.error('Error fetching student details:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [studentId, router])

    const handleDeleteEssay = async (essayId: string) => {
        setDeletingId(essayId)
        try {
            // 1. Delete all reviews for this essay
            const reviewsSnap = await getDocs(query(collection(db, 'reviews'), where('essayId', '==', essayId)))
            const batch = writeBatch(db)
            reviewsSnap.docs.forEach(r => batch.delete(r.ref))
            await batch.commit()

            // 2. Delete essay itself
            await deleteDoc(doc(db, 'essays', essayId))
            setEssays(prev => prev.filter(e => e.id !== essayId))
        } catch (err) {
            console.error('Delete error:', err)
        } finally {
            setDeletingId(null)
            setConfirmDeleteId(null)
        }
    }

    const handleDeleteStudent = async () => {
        if (!studentId) return
        setDeletingStudent(true)
        try {
            const essaysSnap = await getDocs(query(collection(db, 'essays'), where('studentId', '==', studentId)))
            const essayIds = essaysSnap.docs.map(d => d.id)

            const batch = writeBatch(db)

            const allReviewsSnapDocs: any[] = []
            for (let i = 0; i < essayIds.length; i += 10) {
                const chunk = essayIds.slice(i, i + 10)
                const snap = await getDocs(query(collection(db, 'reviews'), where('essayId', 'in', chunk)))
                allReviewsSnapDocs.push(...snap.docs)
            }
            const snapWritten = await getDocs(query(collection(db, 'reviews'), where('reviewerId', '==', studentId)))
            allReviewsSnapDocs.push(...snapWritten.docs)

            allReviewsSnapDocs.forEach(r => {
                const data = r.data()
                if (essayIds.includes(data.essayId) || data.reviewerId === studentId) {
                    batch.delete(r.ref)
                }
            })

            essaysSnap.docs.forEach(e => batch.delete(e.ref))
            batch.delete(doc(db, 'users', studentId))
            await batch.commit()

            router.push('/teacher')
        } catch (err) {
            console.error('Delete student error:', err)
            setDeletingStudent(false)
            setConfirmDeleteStudent(false)
        }
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    if (!student) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-2xl font-bold text-slate-800 mb-4">Student Not Found</h1>
                <Link href="/teacher" className="text-blue-400 hover:text-blue-300">← Back to Dashboard</Link>
            </div>
        </div>
    )

    const totalReviews = essays.reduce((a, e) => a + e.reviewCount, 0)
    const allScores = essays.map(e => e.avgScore).filter((s): s is number => s !== null)
    const overallAvg = allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : null

    return (
        <TeacherLayout title="Student Detail">
            <div className="min-h-screen">
                {/* Delete Confirm Modal */}
                {confirmDeleteId && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
                        <div className="bg-white border border-red-100 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
                            <div className="text-5xl mb-4">🗑️</div>
                            <h2 className="text-xl font-bold text-slate-800 mb-2">Delete This Essay?</h2>
                            <p className="text-slate-500 mb-2">
                                {essays.find(e => e.id === confirmDeleteId)?.reviewCount > 0
                                    ? '⚠️ This essay has existing reviews. Deleting it will remove the essay but NOT the associated reviews.'
                                    : 'This action cannot be undone.'}
                            </p>
                            <p className="text-red-400 text-sm mb-6">The essay will be permanently removed.</p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="flex-1 bg-slate-100 text-slate-700 font-semibold py-3 rounded-lg hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDeleteEssay(confirmDeleteId)}
                                    disabled={deletingId === confirmDeleteId}
                                    className="flex-1 bg-red-500/80 text-white font-semibold py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {deletingId === confirmDeleteId
                                        ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Deleting...</>
                                        : 'Yes, Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Student Confirm Modal */}
                {confirmDeleteStudent && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
                        <div className="bg-white border border-red-100 rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
                            <div className="text-5xl mb-4">🚨</div>
                            <h2 className="text-xl font-bold text-slate-800 mb-2">Delete Student Account?</h2>
                            <p className="text-slate-500 mb-4">
                                You are about to permanently delete <strong className="text-slate-800">{student.displayName || student.name}</strong>.
                                This will also instantly delete <strong>all of their essays</strong> and <strong>all reviews</strong> they have ever given or received.
                            </p>
                            <p className="text-red-400 font-bold mb-6">This action cannot be undone.</p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setConfirmDeleteStudent(false)}
                                    className="flex-1 bg-slate-100 text-slate-700 font-semibold py-3 rounded-lg hover:bg-slate-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteStudent}
                                    disabled={deletingStudent}
                                    className="flex-1 bg-red-600/90 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {deletingStudent
                                        ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Deleting...</>
                                        : 'Yes, Delete Student'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="container mx-auto px-4 py-8 max-w-5xl px-6">
                    <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                        <Link href="/teacher" className="text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors text-sm">
                            ← Back to Dashboard
                        </Link>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                href={`/teacher/progress/${studentId}`}
                                className="bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 block"
                            >
                                📈 View Progress Chart
                            </Link>
                            <button
                                onClick={() => setConfirmDeleteStudent(true)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                🗑️ Delete Student
                            </button>
                        </div>
                    </div>

                    {/* Student Profile Card */}
                    <div className="mb-6 p-5 bg-white rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex items-start gap-5 flex-wrap">
                            <div className="w-14 h-14 rounded-full bg-teal-500 flex items-center justify-center text-xl font-bold text-white shrink-0">
                                {(student.displayName || student.name || '?')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap mb-0.5">
                                    <h1 className="text-2xl font-bold text-slate-800">{student.displayName || student.name}</h1>
                                    {student.groupName && (
                                        <span className="bg-violet-50 text-violet-700 border border-violet-100 px-3 py-0.5 rounded-full text-sm font-medium">
                                            {student.groupName}
                                        </span>
                                    )}
                                </div>
                                {student.displayName && student.displayName !== student.name && (
                                    <p className="text-slate-400 text-sm mb-0.5">Google: {student.name}</p>
                                )}
                                <p className="text-slate-400 text-sm">{student.email}</p>
                            </div>

                            {/* Quick stats */}
                            <div className="flex gap-3 flex-wrap">
                                {[
                                    { label: 'Essays', value: essays.length, accent: '#3b82f6' },
                                    { label: 'Reviews Received', value: totalReviews, accent: '#10b981' },
                                    { label: 'Avg Score', value: overallAvg != null ? `${overallAvg}/100` : '—', accent: overallAvg != null && overallAvg >= 80 ? '#10b981' : '#f59e0b' },
                                ].map(({ label, value, accent }) => (
                                    <div key={label} className="bg-white rounded-lg px-4 py-2.5 text-center border border-slate-100 shadow-sm" style={{ borderLeft: `3px solid ${accent}` }}>
                                        <span className="text-slate-400 text-xs block">{label}</span>
                                        <span className="text-slate-800 text-xl font-bold" style={{ color: accent }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <h2 className="text-lg font-bold text-slate-700 mb-4">Submitted Essays</h2>

                    {essays.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-slate-100">
                            <p className="text-slate-400 text-sm">No essays submitted yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {essays.map(essay => (
                                <div
                                    key={essay.id}
                                    className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm hover:shadow transition-shadow"
                                >
                                    <div className="flex justify-between items-start gap-4 flex-wrap">
                                        <Link
                                            href={`/teacher/essays/${essay.id}`}
                                            className="flex-1 min-w-0 cursor-pointer block"
                                        >
                                            <div className="flex items-center gap-3 flex-wrap mb-2">
                                                <h3 className="text-base font-semibold text-slate-800 hover:text-teal-600 transition-colors">
                                                    {essay.title}
                                                </h3>
                                                {essay.topicName && (
                                                    <span className="bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full text-xs font-medium">
                                                        {essay.topicName}
                                                    </span>
                                                )}
                                                {essay.reviewCount > 0 && (
                                                    <span className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-2 py-0.5 rounded-full text-xs">
                                                        🔒 Reviewed
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-400 text-sm line-clamp-2 mb-3">{essay.content}</p>
                                            <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                                                <span>📅 {essay.submittedAt?.toDate().toLocaleDateString()}</span>
                                                <span>📝 {essay.wordCount} words</span>
                                                <span>👥 {essay.reviewCount} review{essay.reviewCount !== 1 ? 's' : ''}</span>
                                                {essay.timerUsed && essay.timerElapsedSeconds > 0 && (() => {
                                                    const m = Math.floor(essay.timerElapsedSeconds / 60)
                                                    const s = essay.timerElapsedSeconds % 60
                                                    const elapsed = `${m}m ${s}s`
                                                    return (
                                                        <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full text-xs font-medium">
                                                            ⏱ {essay.timerDurationMinutes}min preset · {elapsed} used
                                                        </span>
                                                    )
                                                })()}
                                                {essay.avgScore != null && (
                                                    <span className={`font-semibold ${essay.avgScore >= 80 ? 'text-green-400' : essay.avgScore >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                        {essay.avgScore}/100
                                                    </span>
                                                )}
                                            </div>
                                        </Link>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Link
                                                href={`/teacher/essays/${essay.id}`}
                                                className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-sm font-medium border border-teal-100 hover:bg-teal-100 transition-colors inline-block"
                                            >
                                                View &amp; Give Feedback →
                                            </Link>
                                            <button
                                                onClick={() => setConfirmDeleteId(essay.id)}
                                                className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full text-sm font-medium border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                                title="Delete this essay"
                                            >
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </TeacherLayout>
    )
}

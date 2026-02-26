'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore'
import Header from '@/components/Header'

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

            // Attach review count + avg band
            const reviewsSnap = await getDocs(collection(db, 'reviews'))
            const enriched = essayList.map(essay => {
                const received = reviewsSnap.docs
                    .filter(r => r.data().essayId === essay.id)
                    .map(r => r.data())
                const bands = received.map(r => r.overallBand).filter(Boolean)
                const avgBand = bands.length > 0
                    ? Math.round(bands.reduce((a: number, b: number) => a + b, 0) / bands.length * 10) / 10
                    : null
                const wordCount = essay.content?.trim().split(/\s+/).filter(Boolean).length || 0
                return { ...essay, reviewCount: received.length, avgBand, wordCount }
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

            const allReviewsSnap = await getDocs(collection(db, 'reviews'))
            allReviewsSnap.docs.forEach(r => {
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
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    if (!student) return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">Student Not Found</h1>
                <button onClick={() => router.push('/teacher')} className="text-blue-400 hover:text-blue-300">← Back to Dashboard</button>
            </div>
        </div>
    )

    const totalReviews = essays.reduce((a, e) => a + e.reviewCount, 0)
    const allBands = essays.map(e => e.avgBand).filter(Boolean) as number[]
    const overallAvg = allBands.length > 0
        ? Math.round(allBands.reduce((a, b) => a + b, 0) / allBands.length * 10) / 10
        : null

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />

            {/* Delete Confirm Modal */}
            {confirmDeleteId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
                    <div className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
                        <div className="text-5xl mb-4">🗑️</div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Delete This Essay?</h2>
                        <p className="text-slate-500 dark:text-gray-400 mb-2">
                            {essays.find(e => e.id === confirmDeleteId)?.reviewCount > 0
                                ? '⚠️ This essay has existing reviews. Deleting it will remove the essay but NOT the associated reviews.'
                                : 'This action cannot be undone.'}
                        </p>
                        <p className="text-red-400 text-sm mb-6">The essay will be permanently removed.</p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex-1 bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-gray-300 font-semibold py-3 rounded-lg hover:bg-slate-600 transition-colors"
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
                    <div className="bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
                        <div className="text-5xl mb-4">🚨</div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Delete Student Account?</h2>
                        <p className="text-slate-500 dark:text-gray-400 mb-4">
                            You are about to permanently delete <strong className="text-slate-900 dark:text-white">{student.displayName || student.name}</strong>.
                            This will also instantly delete <strong>all of their essays</strong> and <strong>all reviews</strong> they have ever given or received.
                        </p>
                        <p className="text-red-400 font-bold mb-6">This action cannot be undone.</p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setConfirmDeleteStudent(false)}
                                className="flex-1 bg-slate-100 dark:bg-slate-900/50 text-slate-600 dark:text-gray-300 font-semibold py-3 rounded-lg hover:bg-slate-600 transition-colors"
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

            <main className="container mx-auto px-4 py-8 max-w-5xl">
                <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                    <button onClick={() => router.push('/teacher')} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white flex items-center gap-2 transition-colors text-sm">
                        ← Back to Dashboard
                    </button>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => router.push(`/teacher/progress/${studentId}`)}
                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            📈 View Progress Chart
                        </button>
                        <button
                            onClick={() => setConfirmDeleteStudent(true)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            🗑️ Delete Student
                        </button>
                    </div>
                </div>

                {/* Student Profile Card */}
                <div className="mb-8 p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
                    <div className="flex items-start gap-6 flex-wrap">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shrink-0">
                            {(student.displayName || student.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap mb-1">
                                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{student.displayName || student.name}</h1>
                                {student.groupName && (
                                    <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full text-sm font-medium">
                                        {student.groupName}
                                    </span>
                                )}
                            </div>
                            {student.displayName && student.displayName !== student.name && (
                                <p className="text-gray-500 text-sm mb-1">Google: {student.name}</p>
                            )}
                            <p className="text-slate-500 dark:text-gray-400 text-sm">{student.email}</p>
                        </div>

                        {/* Quick stats */}
                        <div className="flex gap-4 flex-wrap">
                            {[
                                { label: 'Essays', value: essays.length, color: 'blue' },
                                { label: 'Reviews Received', value: totalReviews, color: 'green' },
                                { label: 'Avg Band', value: overallAvg ?? '—', color: overallAvg != null && overallAvg >= 7 ? 'green' : 'yellow' },
                            ].map(({ label, value }) => (
                                <div key={label} className="bg-slate-100 dark:bg-slate-900/50 px-5 py-3 rounded-lg text-center">
                                    <span className="text-slate-500 dark:text-gray-400 text-xs block">{label}</span>
                                    <span className="text-slate-900 dark:text-white text-xl font-bold">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Submitted Essays</h2>

                {essays.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10">
                        <p className="text-gray-500">No essays submitted yet.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {essays.map(essay => (
                            <div
                                key={essay.id}
                                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm transition-all group"
                            >
                                <div className="flex justify-between items-start gap-4 flex-wrap">
                                    <div
                                        className="flex-1 min-w-0 cursor-pointer"
                                        onClick={() => router.push(`/feedback/${essay.id}`)}
                                    >
                                        <div className="flex items-center gap-3 flex-wrap mb-2">
                                            <h3 className="text-xl font-semibold text-slate-900 dark:text-white hover:text-blue-400 transition-colors">
                                                {essay.title}
                                            </h3>
                                            {essay.topicName && (
                                                <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                                                    🏷️ {essay.topicName}
                                                </span>
                                            )}
                                            {essay.reviewCount > 0 && (
                                                <span className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 px-2 py-0.5 rounded-full text-xs">
                                                    🔒 Reviewed
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-slate-500 dark:text-gray-400 text-sm line-clamp-2 mb-3">{essay.content}</p>
                                        <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                                            <span>📅 {essay.submittedAt?.toDate().toLocaleDateString()}</span>
                                            <span>📝 {essay.wordCount} words</span>
                                            <span>👥 {essay.reviewCount} review{essay.reviewCount !== 1 ? 's' : ''}</span>
                                            {essay.avgBand != null && (
                                                <span className={`font-semibold ${essay.avgBand >= 7 ? 'text-green-400' : essay.avgBand >= 5.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                    Band {essay.avgBand}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => router.push(`/feedback/${essay.id}`)}
                                            className="bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm font-medium border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                                        >
                                            View & Grade →
                                        </button>
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
            </main>
        </div>
    )
}

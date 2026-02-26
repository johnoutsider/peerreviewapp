'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Header from '@/components/Header'
import { calculateFinalScores } from '@/lib/score-calculator'

interface StudentData {
    uid: string
    email: string
    name: string
    displayName?: string
    groupName?: string
    role: string
    submittedCount: number
    reviewsGiven: number
    requiredReviews: number
    avgBand: number | null
}

export default function TeacherDashboard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [students, setStudents] = useState<StudentData[]>([])
    const [groupFilter, setGroupFilter] = useState('')

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) { router.push('/'); return }

            try {
                const studentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
                const essaysSnap = await getDocs(collection(db, 'essays'))
                const reviewsSnap = await getDocs(collection(db, 'reviews'))

                const studentStats = await Promise.all(studentsSnap.docs.map(async (sDoc) => {
                    const s = sDoc.data() as any
                    const uid = sDoc.id

                    const myEssays = essaysSnap.docs.filter(e => e.data().studentId === uid)
                    const myReviews = reviewsSnap.docs.filter(r =>
                        r.data().reviewerId === uid && r.data().reviewerRole !== 'ai'
                    )

                    // Average band from reviews received on their essays
                    let avgBand: number | null = null
                    const essayIds = myEssays.map(e => e.id)
                    const receivedReviewsRaw = reviewsSnap.docs.filter(r => essayIds.includes(r.data().essayId))

                    if (receivedReviewsRaw.length > 0) {
                        const receivedReviews = receivedReviewsRaw.map(r => ({ id: r.id, ...r.data() } as any))
                        let totalBand = 0
                        let essaysWithReviews = 0

                        // Calculate each essay's final overall band based on its peer reviews
                        for (const essayId of essayIds) {
                            const reviewsForEssay = receivedReviews.filter(r => r.essayId === essayId)
                            if (reviewsForEssay.length > 0) {
                                const { overallBand } = calculateFinalScores(reviewsForEssay)
                                totalBand += overallBand
                                essaysWithReviews++
                            }
                        }

                        if (essaysWithReviews > 0) {
                            avgBand = +(totalBand / essaysWithReviews).toFixed(1)
                        }
                    }

                    return {
                        uid,
                        email: s.email || '',
                        name: s.name || '',
                        displayName: s.displayName || s.name || '',
                        groupName: s.groupName || '',
                        role: s.role,
                        submittedCount: myEssays.length,
                        reviewsGiven: myReviews.length,
                        requiredReviews: myEssays.length * 3 || 3, // Each essay requires 3 reviews
                        avgBand,
                    } as StudentData
                }))

                // Sort: by group then by name
                studentStats.sort((a, b) => {
                    const g = (a.groupName || '').localeCompare(b.groupName || '')
                    return g !== 0 ? g : (a.displayName || '').localeCompare(b.displayName || '')
                })

                setStudents(studentStats)
            } catch (error) {
                console.error('Error fetching teacher data:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [router])

    const groups = [...new Set(students.map(s => s.groupName).filter(Boolean))]
    const filtered = groupFilter ? students.filter(s => s.groupName === groupFilter) : students

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8">
                <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-1">Teacher Dashboard</h1>
                        <p className="text-slate-500 dark:text-gray-400">Monitor student progress and peer review activity</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {groups.length > 0 && (
                            <select
                                value={groupFilter}
                                onChange={e => setGroupFilter(e.target.value)}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            >
                                <option value="">All Groups</option>
                                {groups.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        )}
                        <button
                            onClick={() => router.push('/teacher/reviews')}
                            className="flex items-center gap-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                        >
                            👥 Review Activity
                        </button>
                        <button
                            onClick={() => router.push('/teacher/messages')}
                            className="flex items-center gap-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                        >
                            ✉️ Messages
                        </button>
                        <button
                            onClick={() => router.push('/teacher/topics')}
                            className="flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                        >
                            🏷️ Topics
                        </button>
                        <button
                            onClick={() => router.push('/teacher/assistant')}
                            className="flex items-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                        >
                            🤖 AI Assistant
                        </button>
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total Students', value: students.length, color: 'blue' },
                        { label: 'Groups', value: groups.length || '—', color: 'purple' },
                        { label: 'Essays Submitted', value: students.reduce((a, s) => a + s.submittedCount, 0), color: 'green' },
                        { label: 'Reviews Given', value: students.reduce((a, s) => a + s.reviewsGiven, 0), color: 'yellow' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className={`bg-${color}-500/10 border border-${color}-500/30 rounded-xl p-4 text-center`}>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
                            <div className={`text-${color}-300 text-sm mt-1`}>{label}</div>
                        </div>
                    ))}
                </div>

                <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-100 dark:bg-slate-900/50">
                                <tr>
                                    <th className="py-4 px-6 text-slate-600 dark:text-gray-300 font-semibold">Student</th>
                                    <th className="py-4 px-6 text-slate-600 dark:text-gray-300 font-semibold">Group</th>
                                    <th className="py-4 px-6 text-slate-600 dark:text-gray-300 font-semibold">Email</th>
                                    <th className="py-4 px-6 text-center text-slate-600 dark:text-gray-300 font-semibold">Essays</th>
                                    <th className="py-4 px-6 text-center text-slate-600 dark:text-gray-300 font-semibold">Reviews Given</th>
                                    <th className="py-4 px-6 text-center text-slate-600 dark:text-gray-300 font-semibold">Avg Band</th>
                                    <th className="py-4 px-6 text-right text-slate-600 dark:text-gray-300 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {filtered.map((student) => (
                                    <tr key={student.uid} className="hover:bg-white dark:bg-slate-800/5 transition-colors">
                                        <td className="py-4 px-6">
                                            <div className="text-slate-900 dark:text-white font-medium">{student.displayName || student.name}</div>
                                            {student.displayName && student.displayName !== student.name && (
                                                <div className="text-gray-500 text-xs">{student.name}</div>
                                            )}
                                        </td>
                                        <td className="py-4 px-6">
                                            {student.groupName ? (
                                                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                                                    {student.groupName}
                                                </span>
                                            ) : (
                                                <span className="text-gray-600 text-sm">—</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-slate-500 dark:text-gray-400 text-sm">{student.email}</td>
                                        <td className="py-4 px-6 text-center">
                                            <span className={`inline-block px-3 py-1 rounded-full text-sm ${student.submittedCount > 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-slate-500 dark:text-gray-400'}`}>
                                                {student.submittedCount}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            <span className={`inline-block px-3 py-1 rounded-full text-sm ${student.reviewsGiven >= student.requiredReviews ? 'bg-green-500/20 text-green-400' :
                                                student.reviewsGiven > 0 ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-gray-700 text-slate-500 dark:text-gray-400'
                                                }`}>
                                                {student.reviewsGiven} / {student.requiredReviews}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            {student.avgBand != null ? (
                                                <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${student.avgBand >= 7 ? 'bg-green-500/20 text-green-400' :
                                                    student.avgBand >= 5.5 ? 'bg-yellow-500/20 text-yellow-400' :
                                                        'bg-red-500/20 text-red-400'
                                                    }`}>
                                                    {student.avgBand}
                                                </span>
                                            ) : (
                                                <span className="text-gray-600 text-sm">—</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <button
                                                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                                                onClick={() => router.push(`/teacher/${student.uid}`)}
                                            >
                                                View Details →
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="py-8 text-center text-gray-500">
                                            No students found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    )
}

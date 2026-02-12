'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import Header from '@/components/Header'
import { UserProfile } from '@/lib/auth'

interface StudentData extends UserProfile {
    submittedCount: number
    reviewsCount: number
    essays: any[]
}

export default function TeacherDashboard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [students, setStudents] = useState<StudentData[]>([])

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            // Verify teacher role (simple client-side check, robust check should be server-side or by rules)
            // For now, we assume if they can access this data (per rules), they are a teacher.

            try {
                // 1. Get all students
                const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'))
                const studentsSnapshot = await getDocs(studentsQuery)
                const studentsData = studentsSnapshot.docs.map(doc => doc.data() as UserProfile)

                // 2. Get all essays and reviews to aggregate counts
                // In a production app, we would use counters or aggregation queries.
                // For this scale, client-side aggregation is acceptable.
                const essaysSnapshot = await getDocs(collection(db, 'essays'))
                const reviewsSnapshot = await getDocs(collection(db, 'reviews'))

                const studentStats = studentsData.map(student => {
                    const studentEssays = essaysSnapshot.docs.filter(doc => doc.data().studentId === student.uid)
                    const studentReviews = reviewsSnapshot.docs.filter(doc => doc.data().reviewerId === student.uid)

                    return {
                        ...student,
                        submittedCount: studentEssays.length,
                        reviewsCount: studentReviews.length,
                        essays: studentEssays.map(doc => ({ id: doc.id, ...doc.data() }))
                    }
                })

                setStudents(studentStats)
            } catch (error) {
                console.error('Error fetching teacher data:', error)
                // If permission-denied, it means they aren't a teacher or rules are wrong
                // We'll handle this UI-wise
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">Teacher Dashboard</h1>
                    <p className="text-gray-400">Monitor student progress and peer review activity</p>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50">
                                <tr>
                                    <th className="py-4 px-6 text-gray-300 font-semibold">Student Name</th>
                                    <th className="py-4 px-6 text-gray-300 font-semibold">Email</th>
                                    <th className="py-4 px-6 text-center text-gray-300 font-semibold">Essays Submitted</th>
                                    <th className="py-4 px-6 text-center text-gray-300 font-semibold">Reviews Given</th>
                                    <th className="py-4 px-6 text-right text-gray-300 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {students.map((student) => (
                                    <tr key={student.uid} className="hover:bg-white/5 transition-colors">
                                        <td className="py-4 px-6 text-white font-medium">{student.name}</td>
                                        <td className="py-4 px-6 text-gray-400">{student.email}</td>
                                        <td className="py-4 px-6 text-center">
                                            <span className={`inline-block px-3 py-1 rounded-full text-sm ${student.submittedCount > 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'
                                                }`}>
                                                {student.submittedCount}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            <span className={`inline-block px-3 py-1 rounded-full text-sm ${student.reviewsCount >= 3 ? 'bg-green-500/20 text-green-400' :
                                                student.reviewsCount > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400'
                                                }`}>
                                                {student.reviewsCount} / 3
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <button
                                                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                                                onClick={() => router.push(`/teacher/${student.uid}`)}
                                            >
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {students.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-500">
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

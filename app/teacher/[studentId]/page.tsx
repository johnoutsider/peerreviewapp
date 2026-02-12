'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import Header from '@/components/Header'
import { UserProfile } from '@/lib/auth'

export default function StudentDetails() {
    const router = useRouter()
    const params = useParams()
    const studentId = params.studentId as string

    const [student, setStudent] = useState<UserProfile | null>(null)
    const [essays, setEssays] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                // Check if current user is teacher (simple check)
                const { getUserProfile } = await import('@/lib/auth')
                const myProfile = await getUserProfile(auth.currentUser.uid)
                if (myProfile?.role !== 'teacher') {
                    router.push('/dashboard')
                    return
                }

                // Get student profile
                const studentDoc = await getDoc(doc(db, 'users', studentId))
                if (studentDoc.exists()) {
                    setStudent(studentDoc.data() as UserProfile)
                }

                // Get student essays
                const essaysQuery = query(
                    collection(db, 'essays'),
                    where('studentId', '==', studentId)
                    // limit 20
                )
                const essaysSnapshot = await getDocs(essaysQuery)
                const essaysData = essaysSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))

                // Client-side sort
                essaysData.sort((a: any, b: any) => {
                    return (b.submittedAt?.toMillis() || 0) - (a.submittedAt?.toMillis() || 0)
                })

                setEssays(essaysData)
            } catch (error) {
                console.error('Error fetching student details:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [studentId, router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (!student) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-white mb-4">Student Not Found</h1>
                    <button onClick={() => router.push('/teacher')} className="text-blue-400 hover:text-blue-300">
                        &larr; Back to Dashboard
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <button
                    onClick={() => router.push('/teacher')}
                    className="mb-6 text-gray-400 hover:text-white flex items-center transition-colors"
                >
                    &larr; Back to Dashboard
                </button>

                <div className="mb-8 p-6 bg-slate-800/50 rounded-xl border border-white/10">
                    <h1 className="text-3xl font-bold text-white mb-2">{student.name}</h1>
                    <p className="text-gray-400">{student.email}</p>
                    <div className="flex gap-4 mt-4">
                        <div className="bg-slate-900/50 px-4 py-2 rounded-lg">
                            <span className="text-gray-400 text-sm block">Essays Submitted</span>
                            <span className="text-white text-xl font-bold">{essays.length}</span>
                        </div>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-6">Submitted Essays</h2>

                {essays.length === 0 ? (
                    <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-white/5">
                        <p className="text-gray-500">No essays submitted yet.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {essays.map(essay => (
                            <div
                                key={essay.id}
                                onClick={() => router.push(`/feedback/${essay.id}`)}
                                className="bg-slate-800/50 hover:bg-slate-700/50 rounded-xl p-6 border border-white/10 cursor-pointer transition-all group"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                                            {essay.title}
                                        </h3>
                                        <p className="text-gray-400 text-sm line-clamp-2 mb-3">
                                            {essay.content}
                                        </p>
                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                            <span>📅 {essay.submittedAt?.toDate().toLocaleDateString()}</span>
                                            <span>
                                                {essay.peerReviewIds?.length || 0} / 3 Reviews
                                            </span>
                                        </div>
                                    </div>
                                    <div className="bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm font-medium border border-purple-500/20">
                                        View & Grade &rarr;
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

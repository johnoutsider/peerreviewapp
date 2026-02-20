'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import Header from '@/components/Header'

export default function StudentDetails() {
    const router = useRouter()
    const params = useParams()
    const studentId = params.studentId as string

    const [student, setStudent] = useState<any>(null)
    const [essays, setEssays] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
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

                // Attach review count + avg band to each essay
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
        fetchData()
    }, [studentId, router])

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
    )

    if (!student) return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-white mb-4">Student Not Found</h1>
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <Header />
            <main className="container mx-auto px-4 py-8 max-w-5xl">
                <button onClick={() => router.push('/teacher')} className="mb-6 text-gray-400 hover:text-white flex items-center gap-2 transition-colors text-sm">
                    ← Back to Dashboard
                </button>

                {/* Student Profile Card */}
                <div className="mb-8 p-6 bg-slate-800/50 rounded-xl border border-white/10">
                    <div className="flex items-start gap-6 flex-wrap">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shrink-0">
                            {(student.displayName || student.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap mb-1">
                                <h1 className="text-3xl font-bold text-white">{student.displayName || student.name}</h1>
                                {student.groupName && (
                                    <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-full text-sm font-medium">
                                        {student.groupName}
                                    </span>
                                )}
                            </div>
                            {student.displayName && student.displayName !== student.name && (
                                <p className="text-gray-500 text-sm mb-1">Google: {student.name}</p>
                            )}
                            <p className="text-gray-400 text-sm">{student.email}</p>
                        </div>

                        {/* Quick stats */}
                        <div className="flex gap-4 flex-wrap">
                            {[
                                { label: 'Essays', value: essays.length, color: 'blue' },
                                { label: 'Reviews Received', value: totalReviews, color: 'green' },
                                { label: 'Avg Band', value: overallAvg ?? '—', color: overallAvg != null && overallAvg >= 7 ? 'green' : 'yellow' },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="bg-slate-900/50 px-5 py-3 rounded-lg text-center">
                                    <span className="text-gray-400 text-xs block">{label}</span>
                                    <span className="text-white text-xl font-bold">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-4">Submitted Essays</h2>

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
                                <div className="flex justify-between items-start gap-4 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 flex-wrap mb-2">
                                            <h3 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                                                {essay.title}
                                            </h3>
                                            {essay.topicName && (
                                                <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                                                    🏷️ {essay.topicName}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-gray-400 text-sm line-clamp-2 mb-3">{essay.content}</p>
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
                                    <div className="bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-sm font-medium border border-purple-500/20 shrink-0">
                                        View &amp; Grade →
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

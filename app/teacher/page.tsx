'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy, onSnapshot, limit } from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'
import { calculateFinalScores } from '@/lib/score-calculator'

interface StudentData {
    uid: string
    email: string
    name: string
    displayName?: string
    groupName?: string
    role: string
    submittedCount: number       // total essays (all topics)
    filteredCount: number        // essays matching the selected topic filter
    reviewsGiven: number
    requiredReviews: number
    avgBand: number | null
}

interface Topic {
    id: string
    name: string
}

export default function TeacherDashboard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [students, setStudents] = useState<StudentData[]>([])
    const [groupFilter, setGroupFilter] = useState('')
    const [topicFilter, setTopicFilter] = useState('')
    const [topics, setTopics] = useState<Topic[]>([])

    // Map of topicId -> topicName for quick lookup
    const topicMap = Object.fromEntries(topics.map(t => [t.id, t.name]))

    // Live topic listener — updates instantly when teacher adds/removes topics
    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, 'topics'), orderBy('createdAt', 'desc')),
            snap => setTopics(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name as string })))
        )
        return () => unsub()
    }, [])

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) { router.push('/'); return }

            try {
                const studentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), limit(20)))
                const studentIds = studentsSnap.docs.map(d => d.id)

                const essaysSnapDocs: any[] = []
                for (let i = 0; i < studentIds.length; i += 10) {
                    const chunk = studentIds.slice(i, i + 10)
                    const snap = await getDocs(query(collection(db, 'essays'), where('studentId', 'in', chunk)))
                    essaysSnapDocs.push(...snap.docs)
                }

                const reviewsSnapDocs: any[] = []
                // Fetch reviews written by them
                for (let i = 0; i < studentIds.length; i += 10) {
                    const chunk = studentIds.slice(i, i + 10)
                    const snap = await getDocs(query(collection(db, 'reviews'), where('reviewerId', 'in', chunk)))
                    reviewsSnapDocs.push(...snap.docs)
                }
                // Fetch reviews received on their essays
                const essayIds = essaysSnapDocs.map(e => e.id)
                for (let i = 0; i < essayIds.length; i += 10) {
                    const chunk = essayIds.slice(i, i + 10)
                    const snap = await getDocs(query(collection(db, 'reviews'), where('essayId', 'in', chunk)))
                    reviewsSnapDocs.push(...snap.docs)
                }

                // Polyfill for the previous map/filter code which expected QueryDocumentSnapshot arrays
                const essaysSnap = { docs: essaysSnapDocs }
                const reviewsSnap = { docs: reviewsSnapDocs }

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
                        filteredCount: myEssays.length, // placeholder, computed below
                        reviewsGiven: myReviews.length,
                        requiredReviews: myEssays.length * 3 || 3,
                        avgBand,
                        // carry essays for filtering
                        _essays: myEssays,
                    } as StudentData & { _essays: typeof myEssays }
                }))

                const finalStats: StudentData[] = studentStats.map(({ _essays, ...rest }: any) => ({
                    ...rest,
                    // filteredCount updated dynamically by computed variable below
                }))

                // Sort: by group then by name
                finalStats.sort((a, b) => {
                    const g = (a.groupName || '').localeCompare(b.groupName || '')
                    return g !== 0 ? g : (a.displayName || '').localeCompare(b.displayName || '')
                })

                // Store raw essays per student in a side map for filtering
                const essaysByStudent: Record<string, typeof essaysSnap.docs> = {}
                studentsSnap.docs.forEach(sDoc => {
                    essaysByStudent[sDoc.id] = essaysSnap.docs.filter(e => e.data().studentId === sDoc.id)
                })

                // We attach essaysByStudent to state via a ref trick—store it alongside students
                setStudents(finalStats.map(s => ({
                    ...s,
                    _essayTopics: essaysByStudent[s.uid]?.map(e => e.data().topicId || '') ?? [],
                } as any)))
            } catch (error) {
                console.error('Error fetching teacher data:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [router])

    const groups = Array.from(new Set(
        students.map(s => s.groupName).filter((g): g is string => typeof g === 'string' && g.trim() !== '')
    ))

    // Compute filtered list and per-student essay counts
    const filtered = students
        .map((student: any) => {
            const essayTopics: string[] = student._essayTopics ?? []
            const filteredCount = topicFilter
                ? essayTopics.filter(t => t === topicFilter).length
                : student.submittedCount
            return { ...student, filteredCount }
        })
        .filter(student => {
            const groupMatch = groupFilter ? student.groupName === groupFilter : true
            // When topic filtered, only show students who submitted for that topic
            const topicMatch = topicFilter ? student.filteredCount > 0 : true
            return groupMatch && topicMatch
        })

    // Global totals (always unfiltered — for consistency in the stat cards)
    const totalEssaysAll = students.reduce((a, s) => a + s.submittedCount, 0)
    const totalReviewsAll = students.reduce((a, s) => a + s.reviewsGiven, 0)

    // Topic-specific counts (only meaningful when a topic filter is active)
    const topicEssayCount = topicFilter ? filtered.reduce((a, s) => a + s.filteredCount, 0) : 0
    const topicStudentCount = topicFilter ? filtered.length : 0

    if (loading) return (
        <TeacherLayout title="Dashboard">
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500" />
            </div>
        </TeacherLayout>
    )

    return (
        <TeacherLayout title="Dashboard">
            <div className="p-6 max-w-screen-xl mx-auto">
                {/* Page header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 mb-0.5">Teacher Dashboard</h1>
                    <p className="text-slate-400 text-sm">Monitor student progress and peer review activity</p>
                </div>
                {/* Group filter pill */}
                {groups.length > 0 && (
                    <div className="mb-6 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Group:</span>
                        <button
                            onClick={() => setGroupFilter('')}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${!groupFilter
                                ? 'bg-teal-500 text-white border-teal-500'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-teal-400 hover:text-teal-600'
                                }`}
                        >All</button>
                        {groups.map(g => (
                            <button
                                key={g}
                                onClick={() => setGroupFilter(g)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${groupFilter === g
                                    ? 'bg-teal-500 text-white border-teal-500'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-teal-400 hover:text-teal-600'
                                    }`}
                            >{g}</button>
                        ))}
                    </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Total Students', value: students.length, accent: '#3b82f6' },
                        { label: 'Groups', value: groups.length || '—', accent: '#8b5cf6' },
                        { label: 'Essays Submitted', value: totalEssaysAll, accent: '#10b981' },
                        { label: 'Reviews Given', value: totalReviewsAll, accent: '#f59e0b' },
                    ].map(({ label, value, accent }) => (
                        <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100" style={{ borderLeft: `4px solid ${accent}` }}>
                            <div className="text-3xl font-bold text-slate-800" style={{ color: accent }}>{value}</div>
                            <div className="text-slate-500 text-sm mt-1">{label}</div>
                        </div>
                    ))}
                </div>

                {/* Topic filter summary banner */}
                {topicFilter && (
                    <div className="mb-4 px-4 py-3 rounded-lg bg-teal-50 border border-teal-200 flex items-center gap-3 flex-wrap">
                        <span className="text-teal-700 font-semibold text-sm">🏷️ {topicMap[topicFilter]}</span>
                        <span className="text-teal-600 text-sm">{topicEssayCount} essay{topicEssayCount !== 1 ? 's' : ''} · {topicStudentCount} student{topicStudentCount !== 1 ? 's' : ''}</span>
                        <button onClick={() => setTopicFilter('')} className="ml-auto text-xs text-teal-500 hover:text-teal-700 transition-colors">✕ Clear</button>
                    </div>
                )}

                {/* Student table */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Table toolbar */}
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                        <span className="text-slate-500 text-sm font-medium">Filter by topic:</span>
                        <select
                            value={topicFilter}
                            onChange={e => setTopicFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-500 transition-colors"
                        >
                            <option value="">All Topics</option>
                            {topics.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                        {topicFilter && (
                            <span className="text-xs text-teal-600 font-medium">
                                {filtered.length} student{filtered.length !== 1 ? 's' : ''} · &quot;{topicMap[topicFilter]}&quot;
                            </span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide w-12">#</th>
                                    <th className="py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Student</th>
                                    <th className="py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Group</th>
                                    <th className="py-3 px-5 text-slate-400 font-semibold text-xs uppercase tracking-wide">Email</th>
                                    <th className="py-3 px-5 text-center text-slate-400 font-semibold text-xs uppercase tracking-wide">Essays</th>
                                    <th className="py-3 px-5 text-center text-slate-400 font-semibold text-xs uppercase tracking-wide">Reviews</th>
                                    <th className="py-3 px-5 text-center text-slate-400 font-semibold text-xs uppercase tracking-wide">Avg Band</th>
                                    <th className="py-3 px-5 text-right text-slate-400 font-semibold text-xs uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map((student, index) => (
                                    <tr key={student.uid} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-3.5 px-5 text-slate-300 text-sm">{index + 1}</td>
                                        <td className="py-3.5 px-5">
                                            <div className="text-slate-800 font-medium text-sm">{student.displayName || student.name}</div>
                                            {student.displayName && student.displayName !== student.name && (
                                                <div className="text-slate-400 text-xs">{student.name}</div>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-5">
                                            {student.groupName ? (
                                                <span className="bg-violet-50 text-violet-600 border border-violet-100 px-2.5 py-0.5 rounded-full text-xs font-medium">
                                                    {student.groupName}
                                                </span>
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="py-3.5 px-5 text-slate-400 text-sm">{student.email}</td>
                                        <td className="py-3.5 px-5 text-center">
                                            {topicFilter ? (
                                                <span className="text-sm">
                                                    <span className={`font-bold ${student.filteredCount > 0 ? 'text-teal-600' : 'text-slate-300'}`}>{student.filteredCount}</span>
                                                    <span className="text-slate-300 text-xs"> / {student.submittedCount}</span>
                                                </span>
                                            ) : (
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-sm font-semibold ${student.submittedCount > 0 ? 'bg-teal-50 text-teal-600' : 'text-slate-300'
                                                    }`}>{student.submittedCount}</span>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-5 text-center">
                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${student.reviewsGiven >= student.requiredReviews
                                                ? 'bg-green-50 text-green-600'
                                                : student.reviewsGiven > 0
                                                    ? 'bg-amber-50 text-amber-600'
                                                    : 'text-slate-300'
                                                }`}>
                                                {student.reviewsGiven} / {student.requiredReviews}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-5 text-center">
                                            {student.avgBand != null ? (
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${student.avgBand >= 7 ? 'bg-green-50 text-green-600'
                                                    : student.avgBand >= 5.5 ? 'bg-amber-50 text-amber-600'
                                                        : 'bg-red-50 text-red-500'
                                                    }`}>{student.avgBand}</span>
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="py-3.5 px-5 text-right">
                                            <Link
                                                href={`/teacher/${student.uid}`}
                                                className="text-teal-600 hover:text-teal-700 text-sm font-medium transition-colors inline-block"
                                            >
                                                View →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-10 text-center text-slate-400 text-sm">
                                            {topicFilter
                                                ? `No students submitted for "${topicMap[topicFilter]}" yet.`
                                                : 'No students found.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </TeacherLayout>
    )
}

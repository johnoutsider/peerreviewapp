'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import Header from '@/components/Header'
import { calculateFinalScores, isNewRubric, getScore100 } from '@/lib/score-calculator'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts'

interface EssayProgress {
    essayId: string
    title: string
    topicName: string
    date: Date
    score100?: number
    overallBand?: number
    isNew: boolean
    aspects: { subject: string; score: number; fullMark: number }[]
}

export default function StudentProgressForTeacher() {
    const router = useRouter()
    const params = useParams()
    const studentId = params.studentId as string

    const [loading, setLoading] = useState(true)
    const [studentName, setStudentName] = useState('Student')
    const [progressData, setProgressData] = useState<EssayProgress[]>([])
    const [averageCriteria, setAverageCriteria] = useState<any[]>([])
    const [stats, setStats] = useState({
        strongestSkill: { name: '-', score: 0 },
        weakestSkill: { name: '-', score: 0 },
        averageBand: 0,
        totalReviewed: 0
    })

    useEffect(() => {
        const fetchProgress = async () => {
            if (!auth.currentUser) {
                router.push('/')
                return
            }

            try {
                // Verify teacher role
                const { getUserProfile } = await import('@/lib/auth')
                const myProfile = await getUserProfile(auth.currentUser.uid)
                if (myProfile?.role !== 'teacher') {
                    router.push('/dashboard')
                    return
                }

                // Fetch student details
                const studentDoc = await getDoc(doc(db, 'users', studentId))
                if (studentDoc.exists()) {
                    const data = studentDoc.data()
                    setStudentName(data.displayName || data.name || 'Unknown Student')
                }

                // 1. Fetch all essays by the student
                const essaysQuery = query(
                    collection(db, 'essays'),
                    where('studentId', '==', studentId)
                )
                const essaysSnap = await getDocs(essaysQuery)

                if (essaysSnap.empty) {
                    setLoading(false)
                    return
                }

                const essays = essaysSnap.docs.map(d => ({ id: d.id, ...d.data() as any }))

                // 2. Fetch all reviews
                // To avoid individual queries, we'll fetch all reviews and filter. (Suitable for small/medium DB scale)
                const reviewsSnap = await getDocs(collection(db, 'reviews'))
                const allReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }))

                // 3. Process each essay
                const processed: EssayProgress[] = []

                for (const essay of essays) {
                    const essayReviews = allReviews.filter(r => r.essayId === essay.id)

                    // Deduplicate reviews by reviewerId
                    const uniqueReviewsMap = new Map()
                    essayReviews.forEach(r => {
                        if (!uniqueReviewsMap.has(r.reviewerId) ||
                            r.completedAt?.toMillis() > uniqueReviewsMap.get(r.reviewerId).completedAt?.toMillis()) {
                            uniqueReviewsMap.set(r.reviewerId, r)
                        }
                    })
                    const validReviews = Array.from(uniqueReviewsMap.values())

                    if (validReviews.length > 0) {
                        const usingNew = isNewRubric(validReviews[0].scores ?? {})

                        let date = new Date()
                        if (essay.submittedAt) {
                            date = essay.submittedAt.toDate ? essay.submittedAt.toDate() : new Date(essay.submittedAt)
                        }

                        if (usingNew) {
                            const avg100 = Math.round(
                                validReviews.reduce((s: number, r: any) => s + getScore100(r.scores ?? {}), 0) / validReviews.length
                            )
                            const aspectKeys = [
                                { key: 'content', label: 'Content', max: 30 },
                                { key: 'organization', label: 'Organization', max: 20 },
                                { key: 'vocabulary', label: 'Vocabulary', max: 20 },
                                { key: 'languageUse', label: 'Lang. Use', max: 25 },
                                { key: 'mechanics', label: 'Mechanics', max: 5 },
                            ]
                            const aspects = aspectKeys.map(({ key, label, max }) => {
                                const avg = Math.round(validReviews.reduce((s: number, r: any) => {
                                    const raw = r.scores?.[key]
                                    if (typeof raw === 'number') return s + raw
                                    const nums = String(raw ?? '').split('\u2013').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n))
                                    return s + (nums.length ? Math.max(...nums) : 0)
                                }, 0) / validReviews.length)
                                return { subject: label, score: Math.round((avg / max) * 100), fullMark: 100 }
                            })
                            processed.push({ essayId: essay.id, title: essay.title || 'Untitled', topicName: essay.topicName || 'Custom Topic', date, score100: avg100, isNew: true, aspects })
                        } else {
                            const { finalScores, overallBand } = calculateFinalScores(validReviews as any)
                            const aspects = [
                                { subject: 'Task Ach.', score: finalScores.taskAchievement, fullMark: 9 },
                                { subject: 'Coherence', score: finalScores.coherenceCohesion, fullMark: 9 },
                                { subject: 'Lexical', score: finalScores.lexicalResource, fullMark: 9 },
                                { subject: 'Grammar', score: finalScores.grammaticalRange, fullMark: 9 },
                            ]
                            processed.push({ essayId: essay.id, title: essay.title || 'Untitled', topicName: essay.topicName || 'Custom Topic', date, overallBand, isNew: false, aspects })
                        }
                    }
                }

                // 4. Sort chronologically
                processed.sort((a, b) => a.date.getTime() - b.date.getTime())

                if (processed.length > 0) {
                    const newEssays = processed.filter(p => p.isNew)
                    const oldEssays = processed.filter(p => !p.isNew)
                    const allNorm = processed.map(p => p.isNew ? p.score100! : Math.round((p.overallBand! / 9) * 100))
                    const overallAvg = Math.round(allNorm.reduce((a, b) => a + b, 0) / allNorm.length)

                    const radarData = newEssays.length > 0
                        ? newEssays[newEssays.length - 1].aspects
                        : oldEssays.length > 0 ? oldEssays[oldEssays.length - 1].aspects : []

                    setAverageCriteria(radarData)
                    setStats({
                        strongestSkill: { name: radarData.length ? radarData.reduce((a, b) => a.score > b.score ? a : b).subject : '-', score: radarData.length ? radarData.reduce((a, b) => a.score > b.score ? a : b).score : 0 },
                        weakestSkill: { name: radarData.length ? radarData.reduce((a, b) => a.score < b.score ? a : b).subject : '-', score: radarData.length ? radarData.reduce((a, b) => a.score < b.score ? a : b).score : 0 },
                        averageBand: overallAvg,
                        totalReviewed: processed.length,
                    })
                }

                setProgressData(processed)

            } catch (error) {
                console.error('Error fetching progress:', error)
            } finally {
                setLoading(false)
            }
        }

        fetchProgress()
    }, [studentId, router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <button
                            onClick={() => router.push(`/teacher/${studentId}`)}
                            className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white transition-colors flex items-center gap-2 text-sm mb-3"
                        >
                            &larr; Back to Student Profile
                        </button>
                        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                            <span className="text-4xl text-blue-400">📈</span> {studentName}&apos;s Progress
                        </h1>
                        <p className="text-slate-500 dark:text-gray-400">Detailed IELTS writing assessment history</p>
                    </div>
                </div>

                {progressData.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-2xl p-12 border border-slate-200 dark:border-white/10 shadow-sm text-center">
                        <div className="text-6xl mb-4">🌱</div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No Data Yet</h3>
                        <p className="text-slate-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                            This student has not received any reviews on their essays yet. Progress tracking will appear automatically once reviews are completed.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* Top Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-blue-50 border-blue-200 dark:bg-blue-900/40 backdrop-blur-sm border dark:border-blue-500/30 rounded-xl p-5">
                                <div className="text-blue-700 dark:text-blue-300 text-sm mb-1 font-medium">Average Score</div>
                                <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats.averageBand}<span className="text-base font-normal text-blue-400">/100</span></div>
                            </div>
                            <div className="bg-purple-50 border-purple-200 dark:bg-purple-900/40 backdrop-blur-sm border dark:border-purple-500/30 rounded-xl p-5">
                                <div className="text-purple-700 dark:text-purple-300 text-sm mb-1 font-medium">Assessed Essays</div>
                                <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats.totalReviewed}</div>
                            </div>
                            <div className="bg-green-50 border-green-200 dark:bg-green-900/40 backdrop-blur-sm border dark:border-green-500/30 rounded-xl p-5">
                                <div className="text-green-700 dark:text-green-300 text-sm mb-1 font-medium">Strongest Skill</div>
                                <div className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate" title={stats.strongestSkill.name}>
                                    {stats.strongestSkill.name}
                                </div>
                                <div className="text-sm text-green-600 dark:text-gray-400 mt-1">Avg: {stats.strongestSkill.score}</div>
                            </div>
                            <div className="bg-orange-50 border-orange-200 dark:bg-orange-900/40 backdrop-blur-sm border dark:border-orange-500/30 rounded-xl p-5">
                                <div className="text-orange-700 dark:text-orange-300 text-sm mb-1 font-medium">Needs Focus</div>
                                <div className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate" title={stats.weakestSkill.name}>
                                    {stats.weakestSkill.name}
                                </div>
                                <div className="text-sm text-orange-600 dark:text-gray-400 mt-1">Avg: {stats.weakestSkill.score}</div>
                            </div>
                        </div>

                        {/* Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Line Chart */}
                            <div className="lg:col-span-2 bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm h-[400px] flex flex-col">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Score Trajectory</h3>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={progressData.map(p => ({ ...p, displayScore: p.isNew ? p.score100 : p.overallBand }))} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                tickFormatter={(date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                stroke="rgba(255,255,255,0.5)"
                                                tick={{ fill: 'rgba(255,255,255,0.5)' }}
                                                dy={10}
                                            />
                                            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.5)' }} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }}
                                                itemStyle={{ color: '#60A5FA', fontWeight: 'bold' }}
                                                labelFormatter={(val, items) => {
                                                    const item = items[0]?.payload
                                                    return item ? `Topic: ${item.topicName}` : ''
                                                }}
                                                formatter={(value: any, _name: any, props: any) => [
                                                    props.payload.isNew ? `${value}/100` : `Band ${value}`,
                                                    'Score'
                                                ]}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="displayScore"
                                                stroke="#3B82F6"
                                                strokeWidth={4}
                                                dot={{ r: 6, fill: '#3B82F6', strokeWidth: 2, stroke: '#1E293B' }}
                                                activeDot={{ r: 8, fill: '#60A5FA' }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Radar Chart */}
                            <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm h-[400px] flex flex-col">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Skill Profile</h3>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={averageCriteria}>
                                            <PolarGrid stroke="rgba(255,255,255,0.2)" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
                                            <PolarRadiusAxis angle={30} domain={[0, averageCriteria[0]?.fullMark ?? 100]} tick={{ fill: 'rgba(255,255,255,0.5)' }} />
                                            <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }} />
                                            <Radar name="Average" dataKey="score" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.5} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

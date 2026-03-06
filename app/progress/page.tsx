'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import { calculateFinalScores, isNewRubric, getScore100 } from '@/lib/score-calculator'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'

interface EssayProgress {
    essayId: string
    title: string
    topicName: string
    date: Date
    // New rubric: score /100
    score100?: number
    // Old IELTS rubric: band 0-9
    overallBand?: number
    isNew: boolean
    // For radar chart (adapts per format)
    aspects: { subject: string; score: number; fullMark: number }[]
}

export default function Progress() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
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
                // 1. Fetch all essays by the student
                const essaysQuery = query(
                    collection(db, 'essays'),
                    where('studentId', '==', auth.currentUser.uid)
                )
                const essaysSnap = await getDocs(essaysQuery)

                // If no essays, we're done
                if (essaysSnap.empty) {
                    setLoading(false)
                    return
                }

                const essays = essaysSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }))

                // 2. Fetch all reviews for these essays
                const essayIds = essays.map(e => e.id)
                // Firestore 'in' query supports max 10 items. We instead fetch reviews per essay or all where reviewer isn't them, but easier is to just fetch reviews that match these essayIds in chunks, but we can also just fetch all reviews where reviewerName != null and filter.
                // Better: fetch all reviews, then filter in memory (assuming manageable size for a student)
                const reviewsSnap = await getDocs(collection(db, 'reviews'))
                const allReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }))

                // 3. Process each essay
                const processed: EssayProgress[] = []

                for (const essay of essays) {
                    // Get reviews for this specific essay
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

                    // Only track essays that have actual reviews and scores
                    if (validReviews.length > 0) {
                        const usingNew = isNewRubric(validReviews[0].scores ?? {})

                        let date = new Date()
                        if (essay.submittedAt) {
                            date = essay.submittedAt.toDate ? essay.submittedAt.toDate() : new Date(essay.submittedAt)
                        }

                        if (usingNew) {
                            // Average /100 score across peer reviews
                            const avg100 = Math.round(
                                validReviews.reduce((s, r) => s + getScore100(r.scores ?? {}), 0) / validReviews.length
                            )
                            // Per-aspect averages for radar
                            const aspectKeys = [
                                { key: 'content', label: 'Content', max: 30 },
                                { key: 'organization', label: 'Organization', max: 20 },
                                { key: 'vocabulary', label: 'Vocabulary', max: 20 },
                                { key: 'languageUse', label: 'Lang. Use', max: 25 },
                                { key: 'mechanics', label: 'Mechanics', max: 5 },
                            ]
                            const aspects = aspectKeys.map(({ key, label, max }) => {
                                const avg = Math.round(
                                    validReviews.reduce((s, r) => {
                                        const raw = r.scores?.[key]
                                        if (typeof raw === 'number') return s + raw
                                        const nums = String(raw ?? '').split('\u2013').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n))
                                        return s + (nums.length ? Math.max(...nums) : 0)
                                    }, 0) / validReviews.length
                                )
                                // Normalise to /100 for radar
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

                // 4. Sort chronologically by date
                processed.sort((a, b) => a.date.getTime() - b.date.getTime())

                if (processed.length > 0) {
                    // Separate new vs old essays
                    const newEssays = processed.filter(p => p.isNew)
                    const oldEssays = processed.filter(p => !p.isNew)

                    // Compute stats across all essays (normalise old band to /100 for comparison)
                    const allNorm = processed.map(p => p.isNew ? p.score100! : Math.round((p.overallBand! / 9) * 100))
                    const overallAvg = Math.round(allNorm.reduce((a, b) => a + b, 0) / allNorm.length)

                    // For radar: use new rubric aspects if we have any new essays, else use IELTS
                    const radarData = newEssays.length > 0
                        ? newEssays[newEssays.length - 1].aspects  // latest new essay aspects
                        : oldEssays.length > 0
                            ? oldEssays[oldEssays.length - 1].aspects
                            : []

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
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
            </div>
        )
    }

    return (
        <StudentLayout title="Progress">

            <main className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900  mb-2">📈 Your Writing Progress</h1>
                        <p className="text-slate-500 ">Track your IELTS scores across all reviewed essays</p>
                    </div>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-slate-500  hover:text-slate-900  transition-colors"
                    >
                        &larr; Back
                    </button>
                </div>

                {progressData.length === 0 ? (
                    <div className="bg-white  backdrop-blur-sm rounded-2xl p-12 border border-slate-200  shadow-sm text-center">
                        <div className="text-6xl mb-4">🌱</div>
                        <h3 className="text-2xl font-bold text-slate-900  mb-2">No Data Yet</h3>
                        <p className="text-slate-500  mb-6 max-w-md mx-auto">
                            Progress tracking will appear here once your submitted essays receive peer or AI reviews.
                        </p>
                        <button
                            onClick={() => router.push('/submit-essay')}
                            className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            Submit an Essay
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* Top Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-blue-50 border-blue-200  backdrop-blur-sm border  rounded-xl p-5">
                                <div className="text-blue-700  text-sm mb-1 font-medium">Average Score</div>
                                <div className="text-3xl font-bold text-slate-900 ">{stats.averageBand}<span className="text-base font-normal text-blue-400">/100</span></div>
                            </div>
                            <div className="bg-purple-50 border-purple-200  backdrop-blur-sm border  rounded-xl p-5">
                                <div className="text-purple-700  text-sm mb-1 font-medium">Reviewed Essays</div>
                                <div className="text-3xl font-bold text-slate-900 ">{stats.totalReviewed}</div>
                            </div>
                            <div className="bg-green-50 border-green-200  backdrop-blur-sm border  rounded-xl p-5">
                                <div className="text-green-700  text-sm mb-1 font-medium">Strongest Skill</div>
                                <div className="text-xl font-bold text-slate-900  leading-tight truncate" title={stats.strongestSkill.name}>
                                    {stats.strongestSkill.name}
                                </div>
                                <div className="text-sm text-green-600  mt-1">Avg: {stats.strongestSkill.score}</div>
                            </div>
                            <div className="bg-orange-50 border-orange-200  backdrop-blur-sm border  rounded-xl p-5">
                                <div className="text-orange-700  text-sm mb-1 font-medium">Needs Focus</div>
                                <div className="text-xl font-bold text-slate-900  leading-tight truncate" title={stats.weakestSkill.name}>
                                    {stats.weakestSkill.name}
                                </div>
                                <div className="text-sm text-orange-600  mt-1">Avg: {stats.weakestSkill.score}</div>
                            </div>
                        </div>

                        {/* Main Charts area */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Line Chart: Overall Trend */}
                            <div className="lg:col-span-2 bg-white  backdrop-blur-sm rounded-xl p-6 border border-slate-200  shadow-sm h-[400px] flex flex-col">
                                <h3 className="text-lg font-semibold text-slate-900  mb-4">Score Trend</h3>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                            data={progressData.map(p => ({ ...p, displayScore: p.isNew ? p.score100 : p.overallBand }))}
                                            margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                tickFormatter={(date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                stroke="rgba(255,255,255,0.5)"
                                                tick={{ fill: 'rgba(255,255,255,0.5)' }}
                                                dy={10}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                ticks={[0, 25, 50, 75, 100]}
                                                stroke="rgba(255,255,255,0.5)"
                                                tick={{ fill: 'rgba(255,255,255,0.5)' }}
                                            />
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
                                                stroke="#8B5CF6"
                                                strokeWidth={4}
                                                dot={{ r: 6, fill: '#8B5CF6', strokeWidth: 2, stroke: '#1E293B' }}
                                                activeDot={{ r: 8, fill: '#A78BFA' }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Radar Chart: Skill Profile */}
                            <div className="bg-white  backdrop-blur-sm rounded-xl p-6 border border-slate-200  shadow-sm h-[400px] flex flex-col">
                                <h3 className="text-lg font-semibold text-slate-900  mb-4">Skill Profile</h3>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={averageCriteria}>
                                            <PolarGrid stroke="rgba(255,255,255,0.2)" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
                                            <PolarRadiusAxis angle={30} domain={[0, averageCriteria[0]?.fullMark ?? 100]} tick={{ fill: 'rgba(255,255,255,0.5)' }} />
                                            <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: '8px', color: '#fff' }} formatter={(value) => [value, 'Score']} />
                                            <Radar name="Score" dataKey="score" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.5} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                        </div>

                        {/* Recent Essays History List */}
                        <div className="bg-white  backdrop-blur-sm rounded-xl p-6 border border-slate-200  shadow-sm">
                            <h3 className="text-xl font-semibold text-slate-900  mb-6">Assessed Essays History</h3>
                            <div className="space-y-4">
                                {[...progressData].reverse().map(essay => (
                                    <div
                                        key={essay.essayId}
                                        onClick={() => router.push(`/feedback/${essay.essayId}`)}
                                        className="bg-slate-50  hover:bg-white :bg-slate-800 border border-slate-200  transition-colors rounded-lg p-4 cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                                    >
                                        <div className="flex-1">
                                            <h4 className="text-slate-900  font-medium mb-1 line-clamp-1">{essay.title}</h4>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="bg-purple-100 text-purple-700   px-2 py-0.5 rounded-full border border-purple-200 ">
                                                    {essay.topicName}
                                                </span>
                                                <span className="text-gray-500">{essay.date.toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="text-right pl-4 sm:border-l border-slate-200  text-center sm:text-right w-[90px]">
                                            {essay.isNew ? (
                                                <>
                                                    <div className="text-xs text-gray-500 uppercase font-semibold mb-0.5">Score</div>
                                                    <div className="text-xl font-bold text-blue-700  bg-blue-100  px-2 rounded">{essay.score100}<span className="text-xs font-normal">/100</span></div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-xs text-gray-500 uppercase font-semibold mb-0.5">Band</div>
                                                    <div className="text-xl font-bold text-blue-700  bg-blue-100  px-2 rounded">{essay.overallBand}</div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                )}
            </main>
        </StudentLayout>
    )
}

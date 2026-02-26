'use client'

import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from 'recharts'

interface ScoreChartProps {
    scores: {
        taskAchievement: number
        coherenceCohesion: number
        lexicalResource: number
        grammaticalRange: number
    }
    title?: string
}

export default function ScoreChart({ scores, title = 'IELTS Criteria Breakdown' }: ScoreChartProps) {
    const data = [
        { criterion: 'Task Achievement', score: scores.taskAchievement, fullMark: 9 },
        { criterion: 'Coherence & Cohesion', score: scores.coherenceCohesion, fullMark: 9 },
        { criterion: 'Lexical Resource', score: scores.lexicalResource, fullMark: 9 },
        { criterion: 'Grammar', score: scores.grammaticalRange, fullMark: 9 },
    ]

    return (
        <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
            <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={data}>
                    <PolarGrid stroke="#475569" />
                    <PolarAngleAxis dataKey="criterion" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 9]} tick={{ fill: '#94a3b8' }} />
                    <Radar name="Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    <Legend wrapperStyle={{ color: '#94a3b8' }} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    )
}

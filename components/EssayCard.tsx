interface EssayCardProps {
    id: string
    title: string
    content: string
    studentName: string
    submittedAt: Date
    status: 'submitted' | 'under_review' | 'completed'
    overallScore?: number
    onClick?: () => void
}

export default function EssayCard({
    id,
    title,
    content,
    studentName,
    submittedAt,
    status,
    overallScore,
    onClick,
}: EssayCardProps) {
    const statusColors = {
        submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        under_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    }

    const statusLabels = {
        submitted: 'Submitted',
        under_review: 'Under Review',
        completed: 'Completed',
    }

    const getScoreColor = (score: number) => {
        if (score >= 7.0) return 'text-green-400 border-green-500/30 bg-green-500/20'
        if (score >= 6.0) return 'text-blue-400 border-blue-500/30 bg-blue-500/20'
        if (score >= 5.0) return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/20'
        return 'text-red-400 border-red-500/30 bg-red-500/20'
    }

    return (
        <div
            onClick={onClick}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-blue-500/50 transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                    {title}
                </h3>
                {overallScore ? (
                    <span className={`px-3 py-1 rounded-full text-sm font-bold border ${getScoreColor(overallScore)}`}>
                        Band {overallScore}
                    </span>
                ) : (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[status]}`}>
                        {statusLabels[status]}
                    </span>
                )}
            </div>

            <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                {content}
            </p>

            <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">By {studentName}</span>
                <span className="text-gray-500">
                    {new Date(submittedAt).toLocaleDateString()}
                </span>
            </div>
        </div>
    )
}

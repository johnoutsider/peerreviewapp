interface EssayCardProps {
    id: string
    title: string
    content: string
    studentName: string
    submittedAt: Date
    status: 'submitted' | 'under_review' | 'completed'
    overallScore?: number
    reviewCount?: number
    onClick?: () => void
    onEdit?: (e: React.MouseEvent) => void
    onDelete?: (e: React.MouseEvent) => void
}

export default function EssayCard({
    id,
    title,
    content,
    studentName,
    submittedAt,
    status,
    overallScore,
    reviewCount = 0,
    onClick,
    onEdit,
    onDelete,
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
        if (score >= 7.0) return 'text-white border-green-500/30 bg-green-500/20'
        if (score >= 6.0) return 'text-white border-blue-500/30 bg-blue-500/20'
        if (score >= 5.0) return 'text-white border-yellow-500/30 bg-yellow-500/20'
        return 'text-white border-red-500/30 bg-red-500/20'
    }

    const isLocked = reviewCount > 0

    return (
        <div
            onClick={onClick}
            className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl p-6 border border-slate-200 dark:border-white/10 shadow-sm hover:border-blue-500/50 transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white group-hover:text-blue-400 transition-colors">
                    {title}
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {isLocked ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
                            🔒 Locked
                        </span>
                    ) : (
                        <>
                            {onEdit && (
                                <button
                                    onClick={onEdit}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                                >
                                    ✏️ Edit
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    onClick={onDelete}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                                >
                                    🗑 Delete
                                </button>
                            )}
                        </>
                    )}
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
            </div>

            <p className="text-slate-500 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                {content}
            </p>

            <div className="flex justify-end items-center text-sm">
                <span className="text-gray-500">
                    {new Date(submittedAt).toLocaleDateString()}
                </span>
            </div>
        </div>
    )
}

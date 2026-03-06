interface EssayCardProps {
    id: string
    title: string
    content: string
    studentName: string
    submittedAt: Date
    status: 'submitted' | 'under_review' | 'completed'
    overallScore?: number
    reviewCount?: number
    topicName?: string
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
    topicName,
    onClick,
    onEdit,
    onDelete,
}: EssayCardProps) {
    const statusColors = {
        submitted: 'bg-blue-100 text-blue-700 border-blue-200',
        under_review: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        completed: 'bg-green-100 text-green-700 border-green-200',
    }

    const statusLabels = {
        submitted: 'Submitted',
        under_review: 'Under Review',
        completed: 'Completed',
    }

    const getScoreColor = (score: number) => {
        if (score >= 7.0) return 'text-green-800 border-green-200 bg-green-100'
        if (score >= 6.0) return 'text-blue-800 border-blue-200 bg-blue-100'
        if (score >= 5.0) return 'text-yellow-800 border-yellow-200 bg-yellow-100'
        return 'text-red-800 border-red-200 bg-red-100'
    }

    const isLocked = reviewCount > 0

    return (
        <div
            onClick={onClick}
            className="bg-white  backdrop-blur-sm rounded-xl p-6 border border-slate-200  shadow-sm hover:border-blue-500/50 transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-3 gap-6">
                <div className="flex-1 min-w-0">
                    {topicName && (
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] items-center inline-flex">🏷️</span>
                            {topicName}
                        </p>
                    )}
                    <h3 className="text-xl font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                        {title}
                    </h3>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {isLocked ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200 flex items-center gap-1">
                            🔒 Locked
                        </span>
                    ) : (
                        <>
                            {onEdit && (
                                <button
                                    onClick={onEdit}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 transition-colors"
                                >
                                    ✏️ Edit
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    onClick={onDelete}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors"
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

            <p className="text-slate-500  text-sm mb-3 line-clamp-2">
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

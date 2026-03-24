'use client'

interface DeadlineBannerProps {
    label: string                    // e.g. "Essay Submission"
    deadline: Date | null            // null = no deadline set
    lateSubmissionDays?: number      // grace period days after deadline (0 = none)
    emoji?: string
}

export default function DeadlineBanner({
    label,
    deadline,
    lateSubmissionDays = 0,
    emoji = '📅',
}: DeadlineBannerProps) {
    if (!deadline) return null

    const now = Date.now()
    const diff = deadline.getTime() - now
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const expired = diff <= 0

    // After deadline — check if we're still inside the late window
    const lateWindowMs = (lateSubmissionDays ?? 0) * 24 * 60 * 60 * 1000
    const lateDeadline = deadline.getTime() + lateWindowMs
    const inLateWindow = expired && lateSubmissionDays > 0 && now < lateDeadline
    const fullyClosed = expired && (lateSubmissionDays === 0 || now >= lateDeadline)

    let bg = 'bg-green-100 border-green-200 text-green-800'
    let rightLabel = ''

    if (fullyClosed) {
        bg = 'bg-red-100 border-red-200 text-red-800'
        rightLabel = '🔒 Closed'
    } else if (inLateWindow) {
        bg = 'bg-amber-100 border-amber-200 text-amber-800'
        const daysOverdue = Math.ceil(-diff / (1000 * 60 * 60 * 24))
        const graceLeft = Math.ceil((lateDeadline - now) / (1000 * 60 * 60 * 24))
        rightLabel = `⏰ Late (${daysOverdue}d overdue · ${graceLeft}d grace left)`
    } else if (days === 0) {
        bg = 'bg-red-100 border-red-200 text-red-800'
        rightLabel = `⚠️ Due in ${hours}h`
    } else if (days <= 2) {
        bg = 'bg-orange-100 border-orange-200 text-orange-800'
        rightLabel = `${days}d ${hours}h left`
    } else if (days <= 5) {
        bg = 'bg-yellow-100 border-yellow-200 text-yellow-800'
        rightLabel = `${days} days left`
    } else {
        rightLabel = `${days} days left`
    }

    return (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium ${bg}`}>
            <span>{emoji} <span className="font-semibold">{label} deadline:</span>{' '}
                {deadline.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                {' at '}
                {deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {inLateWindow && lateSubmissionDays > 0 && (
                    <span className="ml-2 text-xs font-bold text-amber-700">
                        · Late submissions open
                    </span>
                )}
            </span>
            <span className={`ml-4 whitespace-nowrap font-bold ${fullyClosed ? 'text-red-700' : inLateWindow ? 'text-amber-700' : ''}`}>
                {fullyClosed ? '🔒 Closed' : `⏳ ${rightLabel}`}
            </span>
        </div>
    )
}

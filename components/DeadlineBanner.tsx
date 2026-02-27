'use client'

interface DeadlineBannerProps {
    label: string          // e.g. "Essay Submission"
    deadline: Date | null  // null = no deadline set
    emoji?: string
}

function daysLeft(deadline: Date): number {
    return Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function DeadlineBanner({ label, deadline, emoji = '📅' }: DeadlineBannerProps) {
    if (!deadline) return null

    const diff = deadline.getTime() - Date.now()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const expired = diff <= 0

    let bg = 'bg-green-500/10 border-green-500/30 text-green-300'
    let urgency = ''
    if (expired) {
        bg = 'bg-red-500/10 border-red-500/30 text-red-400'
        urgency = 'Deadline passed'
    } else if (days === 0) {
        bg = 'bg-red-500/15 border-red-500/40 text-red-300'
        urgency = `⚠️ Due in ${hours}h`
    } else if (days <= 2) {
        bg = 'bg-orange-500/10 border-orange-500/30 text-orange-300'
        urgency = `${days}d ${hours}h left`
    } else if (days <= 5) {
        bg = 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
        urgency = `${days} days left`
    } else {
        urgency = `${days} days left`
    }

    return (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium ${bg}`}>
            <span>{emoji} <span className="font-semibold">{label} deadline:</span>{' '}
                {deadline.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                {' at '}
                {deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className={`ml-4 whitespace-nowrap font-bold ${expired ? 'text-red-400' : ''}`}>
                {expired ? '🔒 Closed' : `⏳ ${urgency}`}
            </span>
        </div>
    )
}

interface AlertProps {
    type: 'success' | 'error' | 'info' | 'warning'
    message: string
    onClose?: () => void
}

export default function Alert({ type, message, onClose }: AlertProps) {
    const bgColors = {
        success: 'bg-green-500/10 border-green-500/50 text-green-400',
        error: 'bg-red-500/10 border-red-500/50 text-red-400',
        info: 'bg-blue-500/10 border-blue-500/50 text-blue-400',
        warning: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400',
    }

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️',
    }

    if (!message) return null

    return (
        <div className={`${bgColors[type]} border rounded-lg p-4 mb-6 flex items-start gap-3 animate-fade-in`}>
            <span className="text-xl">{icons[type]}</span>
            <div className="flex-1">
                <p className="font-medium">{message}</p>
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    className="text-white/50 hover:text-white transition-colors"
                >
                    ✕
                </button>
            )}
        </div>
    )
}

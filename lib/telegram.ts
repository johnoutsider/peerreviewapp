export async function sendTelegramBroadcast(chatIds: string[], title: string | undefined | null, message: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN not configured')
        return { error: 'TELEGRAM_BOT_TOKEN not configured', sent: 0 }
    }

    if (!message?.trim()) {
        console.error('Telegram broadcast: message is required')
        return { error: 'message is required', sent: 0 }
    }

    if (!Array.isArray(chatIds) || chatIds.length === 0) {
        return { status: 'done', sent: 0, skipped: 0, total: 0 }
    }

    // Build the Telegram message text
    const text = [
        `📚 *Peer Feedback App*`,
        ``,
        title ? `📌 *${escapeMarkdown(title)}*` : null,
        ``,
        message,
    ].filter(line => line !== null).join('\n')

    // Send to each chatId, respecting Telegram rate limits
    let sent = 0
    let skipped = 0

    for (const chatId of chatIds) {
        if (!chatId) continue
        try {
            const res = await fetch(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text,
                        parse_mode: 'Markdown',
                    }),
                }
            )
            if (res.ok) {
                sent++
            } else {
                const errBody = await res.text()
                console.error(`Failed to send to chatId ${chatId}:`, errBody)
                skipped++
            }
        } catch (err) {
            console.error(`Error sending telegram to chatId ${chatId}:`, err)
            skipped++
        }
    }

    return {
        status: 'done',
        sent,
        skipped,
        total: chatIds.length,
    }
}

// Escape special Markdown characters in user-provided text to prevent parse errors
function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

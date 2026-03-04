import { NextResponse } from 'next/server'

// The teacher's browser already has the full student list (with telegramChatId) loaded.
// We receive the target chatIds directly from the client — no server-side Firestore needed.
export async function POST(req: Request) {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN
        if (!botToken) {
            return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
        }

        const body = await req.json()
        const {
            title,
            message,
            chatIds,   // string[] — the Telegram chat IDs to send to (filtered by client)
        } = body

        if (!message?.trim()) {
            return NextResponse.json({ error: 'message is required' }, { status: 400 })
        }

        if (!Array.isArray(chatIds) || chatIds.length === 0) {
            return NextResponse.json({ status: 'done', sent: 0, skipped: 0, total: 0 })
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
        const skipped = 0

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
                }
            } catch (err) {
                console.error(`Error sending to chatId ${chatId}:`, err)
            }
        }

        return NextResponse.json({
            status: 'done',
            sent,
            skipped,
            total: chatIds.length,
        })
    } catch (error) {
        console.error('Broadcast error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// Escape special Markdown characters in user-provided text to prevent parse errors
function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

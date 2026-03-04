import { NextResponse } from 'next/server'

// No Firestore access needed here — the client (reviewer's browser) reads the
// essay author's telegramChatId with its own authenticated Firebase session,
// then passes it directly to this endpoint. This route only calls Telegram.

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { chatId, essayTitle } = body

        if (!chatId) {
            return NextResponse.json({ status: 'ignored', reason: 'no_telegram_linked' })
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://essaypeerreviewapp.web.app'
        const title = essayTitle ? `"${essayTitle}"` : 'your essay'
        const message =
            `🎉 *Your essay has been reviewed!*\n\n` +
            `One of your peers has completed a review of ${title}.\n\n` +
            `Head over to the app to read the full feedback, see your scores, and find out what you did well and what you can improve. Your progress is waiting for you! 📈\n\n` +
            `👉 Visit: ${appUrl}`


        await sendTelegramMessage(chatId, message)
        return NextResponse.json({ status: 'success' })

    } catch (error) {
        console.error('Notification error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

async function sendTelegramMessage(chatId: string | number, text: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
        console.error('TELEGRAM_BOT_TOKEN is not configured!')
        return
    }
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
    if (!res.ok) console.error('Telegram sendMessage error:', await res.text())
}

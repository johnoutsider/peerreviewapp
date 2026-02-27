import { NextResponse } from 'next/server'

// This route is called by the profile page every 3 seconds while waiting for the user to
// link their Telegram account. It uses Telegram's getUpdates API (polling mode) instead
// of requiring a webhook — so it works in local dev with zero setup.
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')

    if (!code) {
        return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken || botToken === 'YOUR_BOT_TOKEN_HERE') {
        return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
    }

    try {
        // Fetch the last 100 unprocessed updates from Telegram
        const res = await fetch(
            `https://api.telegram.org/bot${botToken}/getUpdates?limit=100&timeout=0`,
            { cache: 'no-store' }
        )

        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            // 409 = a webhook is currently set on the bot (polling and webhooks can't coexist).
            // In that case, the webhook route will handle linking instead.
            if (res.status === 409) {
                return NextResponse.json({ found: false, webhookActive: true })
            }
            console.error('getUpdates error:', body)
            return NextResponse.json({ found: false })
        }

        const data = await res.json()
        const updates: any[] = data.result || []

        for (const update of updates) {
            const msg = update.message
            if (!msg?.text) continue

            // Look for the deep-link payload: "/start link_xxxxxxxx"
            if (msg.text.trim() === `/start ${code}`) {
                const chatId: string = msg.chat.id.toString()
                const username: string | undefined = msg.chat.username

                // Acknowledge this specific update so Telegram doesn't keep sending it
                await fetch(
                    `https://api.telegram.org/bot${botToken}/getUpdates?offset=${update.update_id + 1}&limit=1`,
                    { cache: 'no-store' }
                )

                // Send confirmation message to the user on Telegram
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: `✅ *Account Linked Successfully!*\n\nYou'll now receive a notification here whenever a peer reviews your essay. 🎉`,
                        parse_mode: 'Markdown',
                    }),
                })

                return NextResponse.json({ found: true, chatId, username })
            }
        }

        return NextResponse.json({ found: false })

    } catch (error) {
        console.error('check-link error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

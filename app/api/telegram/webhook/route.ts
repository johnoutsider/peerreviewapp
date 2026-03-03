import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'

// The Firebase client SDK works fine in Next.js server-side routes.
// The telegram_links and telegram_verified collections use open Firestore rules,
// so no user auth token is needed here.

export async function POST(req: Request) {
    try {
        const body = await req.json()

        const message = body.message
        if (!message || !message.text) {
            return NextResponse.json({ status: 'ignored' })
        }

        const text: string = message.text
        const chatId: number = message.chat.id
        const username: string | undefined = message.chat.username
        const firstName: string | undefined = message.from?.first_name

        if (text === '/start') {
            await sendTelegramMessage(chatId, `👋 Hi${firstName ? ` ${firstName}` : ''}! Welcome to the *Peer Feedback App*.\n\nPlease go to your Profile in the app and click "Connect Telegram" to link your account.`)
            return NextResponse.json({ status: 'plain_start' })
        }

        if (text.startsWith('/start ')) {
            const linkCode = text.replace('/start ', '').trim()

            // Look up the link code (telegram_links has open read rules)
            const linksSnap = await getDocs(
                query(collection(db, 'telegram_links'), where('code', '==', linkCode))
            )

            if (linksSnap.empty) {
                await sendTelegramMessage(chatId, '❌ This link is invalid or has already been used. Please go to your Profile and click "Connect Telegram" again.')
                return NextResponse.json({ status: 'invalid_code' })
            }

            const { createdAt } = linksSnap.docs[0].data()

            // Expire codes older than 30 minutes
            const ageMs = Date.now() - createdAt.toMillis()
            if (ageMs > 30 * 60 * 1000) {
                await sendTelegramMessage(chatId, '⏰ This link has expired (30 minute limit). Please generate a new one from your Profile.')
                return NextResponse.json({ status: 'expired' })
            }

            // Write to telegram_verified — the client profile page listens for this
            // and completes the link by writing to its own user profile (with auth)
            await addDoc(collection(db, 'telegram_verified'), {
                code: linkCode,
                chatId: chatId.toString(),
                ...(username ? { telegramUsername: username } : {}),
                verifiedAt: serverTimestamp(),
            })

            await sendTelegramMessage(
                chatId,
                `✅ *Almost there!*\n\nSwitch back to the *Peer Feedback App* — it will finish linking your account automatically. You'll then receive Telegram notifications every time a peer reviews your essay! 🎉`
            )

            return NextResponse.json({ status: 'success' })
        }

        return NextResponse.json({ status: 'ok' })

    } catch (error) {
        console.error('Webhook error:', error)
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
    if (!res.ok) console.error('Telegram API error:', await res.text())
}

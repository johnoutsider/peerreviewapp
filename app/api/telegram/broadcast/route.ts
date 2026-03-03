import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'

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
            recipientUids,   // string[] | null — null means all students
            groupName,       // string | null — if set, filter by group
        } = body

        if (!message?.trim()) {
            return NextResponse.json({ error: 'message is required' }, { status: 400 })
        }

        // Build Firestore query for students
        let studentsQuery
        if (groupName) {
            studentsQuery = query(
                collection(db, 'users'),
                where('role', '==', 'student'),
                where('groupName', '==', groupName)
            )
        } else {
            studentsQuery = query(
                collection(db, 'users'),
                where('role', '==', 'student')
            )
        }

        const snap = await getDocs(studentsQuery)
        const allStudents = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }))

        // Filter to specific uids if provided
        const targets = recipientUids
            ? allStudents.filter(s => recipientUids.includes(s.uid))
            : allStudents

        // Only send to those with Telegram linked
        const connected = targets.filter(s => s.telegramChatId)
        const skipped = targets.length - connected.length

        // Build the Telegram message text
        const text = [
            `📚 *Peer Feedback App*`,
            ``,
            title ? `📌 *${title}*` : null,
            ``,
            message,
        ].filter(line => line !== null).join('\n')

        // Send concurrently (with a small delay between to respect Telegram rate limits)
        let sent = 0
        for (const student of connected) {
            try {
                const res = await fetch(
                    `https://api.telegram.org/bot${botToken}/sendMessage`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: student.telegramChatId,
                            text,
                            parse_mode: 'Markdown',
                        }),
                    }
                )
                if (res.ok) sent++
                else console.error(`Failed to send to ${student.uid}:`, await res.text())
            } catch (err) {
                console.error(`Error sending to ${student.uid}:`, err)
            }
        }

        return NextResponse.json({
            status: 'done',
            sent,
            skipped,
            total: targets.length,
        })
    } catch (error) {
        console.error('Broadcast error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

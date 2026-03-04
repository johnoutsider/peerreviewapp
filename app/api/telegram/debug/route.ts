import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

// DEBUG ONLY — remove after fixing
export async function GET() {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN

        // 1. Check bot token
        const botCheck = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
        const botData = await botCheck.json()

        // 2. Try to fetch students
        let students: any[] = []
        let firestoreError = null
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
            students = snap.docs.map(d => {
                const data = d.data() as any
                return {
                    uid: d.id,
                    displayName: data.displayName || data.name,
                    telegramChatId: data.telegramChatId || null,
                    telegramUsername: data.telegramUsername || null,
                }
            })
        } catch (e: any) {
            firestoreError = e?.message || String(e)
        }

        return NextResponse.json({
            botOk: botData.ok,
            botUsername: botData.result?.username,
            totalStudents: students.length,
            studentsWithTelegram: students.filter(s => s.telegramChatId).length,
            students,
            firestoreError,
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

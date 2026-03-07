import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

export async function GET(req: Request) {
    try {
        const now = Date.now()
        const snap = await adminDb.collection('scheduledTasks').where('status', '==', 'scheduled').get()
        const dueTasks = snap.docs.filter(doc => {
            const runAt = doc.data().runAt?.toDate?.()
            return runAt instanceof Date && runAt.getTime() <= now
        })

        if (dueTasks.length === 0) {
            return NextResponse.json({ triggered: 0, succeeded: 0, failed: 0 })
        }

        const base = new URL(req.url)
        const origin = `${base.protocol}//${base.host}`

        const results = await Promise.allSettled(
            dueTasks.map(doc =>
                fetch(`${origin}/api/scheduler/run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: doc.id }),
                })
            )
        )

        return NextResponse.json({
            triggered: dueTasks.length,
            succeeded: results.filter(result => result.status === 'fulfilled').length,
            failed: results.filter(result => result.status === 'rejected').length,
        })
    } catch (error: any) {
        console.error('Scheduler cron failed:', error)
        return NextResponse.json({ error: error.message || 'Scheduler cron failed' }, { status: 500 })
    }
}

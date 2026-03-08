import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

/**
 * Called by Vercel Cron (vercel.json) every hour as a safety net,
 * AND by the scheduler page via client-side polling every 30 seconds.
 *
 * Finds all tasks with status='scheduled' and runAt <= now, then
 * calls /api/scheduler/run for each one.
 */
export async function GET(req: Request) {
    try {
        const now = new Date()

        // Find all due tasks
        const snap = await adminDb
            .collection('scheduledTasks')
            .where('status', '==', 'scheduled')
            .where('runAt', '<=', now)
            .get()

        if (snap.empty) {
            return NextResponse.json({ triggered: 0 })
        }

        const base = new URL(req.url)
        const origin = `${base.protocol}//${base.host}`

        const results = await Promise.allSettled(
            snap.docs.map(doc =>
                fetch(`${origin}/api/scheduler/run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: doc.id }),
                })
            )
        )

        const succeeded = results.filter(r => r.status === 'fulfilled').length
        const failed = results.filter(r => r.status === 'rejected').length

        return NextResponse.json({ triggered: snap.size, succeeded, failed })
    } catch (err: any) {
        console.error('Scheduler cron error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

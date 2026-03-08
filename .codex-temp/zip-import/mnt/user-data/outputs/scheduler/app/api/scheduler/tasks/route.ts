import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

// ── GET: list all scheduled tasks ─────────────────────────────────────────────
export async function GET() {
    try {
        const snap = await adminDb.collection('scheduledTasks').orderBy('createdAt', 'desc').get()
        const tasks = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            runAt: d.data().runAt?.toDate?.()?.toISOString() ?? null,
            lastRunAt: d.data().lastRunAt?.toDate?.()?.toISOString() ?? null,
            createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? null,
        }))
        return NextResponse.json({ tasks })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

// ── POST: create a new scheduled task ─────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const {
            taskType,
            scheduleType,   // 'once' | 'daily' | 'weekly'
            runAt,          // ISO string — exact time (once) or first run (recurring)
            recurringDay,   // 0-6, for weekly only
            recurringTime,  // 'HH:MM', for daily/weekly
            config,
            createdBy,
        } = body

        if (!taskType || !scheduleType || !runAt || !createdBy) {
            return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
        }

        const validTypes = ['reminders', 'bulk-approve', 'progress-reports', 'export-csv']
        if (!validTypes.includes(taskType)) {
            return NextResponse.json({ error: 'Invalid taskType.' }, { status: 400 })
        }

        const ref = await adminDb.collection('scheduledTasks').add({
            taskType,
            scheduleType,
            runAt: new Date(runAt),
            recurringDay: recurringDay ?? null,
            recurringTime: recurringTime ?? null,
            config: config ?? {},
            status: 'scheduled',
            createdBy,
            createdAt: new Date(),
            lastResult: null,
            lastRunAt: null,
        })

        return NextResponse.json({ id: ref.id })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

// ── DELETE: remove a task by id ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const taskId = searchParams.get('id')
        if (!taskId) return NextResponse.json({ error: 'Task id is required.' }, { status: 400 })

        await adminDb.collection('scheduledTasks').doc(taskId).delete()
        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

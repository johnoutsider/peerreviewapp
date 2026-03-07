import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

export async function GET() {
    try {
        const [tasksSnap, exportsSnap] = await Promise.all([
            adminDb.collection('scheduledTasks').orderBy('createdAt', 'desc').get(),
            adminDb.collection('schedulerExports').orderBy('createdAt', 'desc').limit(10).get(),
        ])

        const tasks = tasksSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            runAt: doc.data().runAt?.toDate?.()?.toISOString() ?? null,
            lastRunAt: doc.data().lastRunAt?.toDate?.()?.toISOString() ?? null,
            createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
        }))

        const exportsList = exportsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? null,
        }))

        return NextResponse.json({ tasks, exports: exportsList })
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to load scheduler data' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { taskType, scheduleType, runAt, recurringDay, recurringTime, config, createdBy, scheduleTimezone } = body

        if (!taskType || !scheduleType || !runAt || !createdBy) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const validTypes = ['reminders', 'bulk-approve', 'progress-reports', 'export-csv']
        const validSchedules = ['once', 'daily', 'weekly']
        if (!validTypes.includes(taskType)) {
            return NextResponse.json({ error: 'Invalid task type' }, { status: 400 })
        }
        if (!validSchedules.includes(scheduleType)) {
            return NextResponse.json({ error: 'Invalid schedule type' }, { status: 400 })
        }

        if (taskType === 'reminders' && !String(config?.topicId || '').trim()) {
            return NextResponse.json({ error: 'A topic is required for reminder tasks' }, { status: 400 })
        }

        const normalizedTimeZone = String(scheduleTimezone || '').trim() || 'Asia/Tashkent'

        const ref = await adminDb.collection('scheduledTasks').add({
            taskType,
            scheduleType,
            runAt: new Date(runAt),
            recurringDay: recurringDay ?? null,
            recurringTime: recurringTime ?? null,
            scheduleTimezone: normalizedTimeZone,
            config: config ?? {},
            createdBy,
            status: 'scheduled',
            createdAt: new Date(),
            lastRunAt: null,
            lastResult: null,
        })

        return NextResponse.json({ id: ref.id })
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to create task' }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const taskId = searchParams.get('id')
        if (!taskId) {
            return NextResponse.json({ error: 'Task id is required' }, { status: 400 })
        }

        await adminDb.collection('scheduledTasks').doc(taskId).delete()
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to delete task' }, { status: 500 })
    }
}

import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

type ScheduleType = 'once' | 'daily' | 'weekly'

type ScheduledTaskDoc = {
    scheduleType?: ScheduleType
    runAt?: { toDate?: () => Date } | Date | null
    recurringDay?: number | null
    lastRunAt?: { toDate?: () => Date } | Date | null
    scheduleTimezone?: string | null
}

const WEEKDAY_INDEX: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
}

function toDate(value: ScheduledTaskDoc['runAt']) {
    if (!value) return null
    if (value instanceof Date) return value
    const date = value.toDate?.()
    return date instanceof Date ? date : null
}

function getDateKey(date: Date, timeZone: string) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date)
}

function getWeekday(date: Date, timeZone: string) {
    const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date)
    return WEEKDAY_INDEX[label] ?? date.getDay()
}

function hasRunToday(lastRunAt: Date | null, now: Date, timeZone: string) {
    if (!lastRunAt) return false
    return getDateKey(lastRunAt, timeZone) === getDateKey(now, timeZone)
}

function shouldRunTask(data: ScheduledTaskDoc, now: Date) {
    const scheduleType = data.scheduleType || 'once'
    const runAt = toDate(data.runAt)
    if (!runAt) return false

    const timeZone = String(data.scheduleTimezone || 'Asia/Tashkent')
    const lastRunAt = toDate(data.lastRunAt)
    const todayKey = getDateKey(now, timeZone)
    const runDayKey = getDateKey(runAt, timeZone)

    if (runDayKey > todayKey) return false
    if (scheduleType !== 'once' && hasRunToday(lastRunAt, now, timeZone)) return false

    if (scheduleType === 'weekly') {
        const targetDay = data.recurringDay ?? runAt.getDay()
        return getWeekday(now, timeZone) === targetDay
    }

    return true
}

export async function GET(req: Request) {
    try {
        const now = new Date()
        const snap = await adminDb.collection('scheduledTasks').where('status', '==', 'scheduled').get()
        const dueTasks = snap.docs.filter(doc => shouldRunTask(doc.data() as ScheduledTaskDoc, now))

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

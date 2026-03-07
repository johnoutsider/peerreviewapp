import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { sendTelegramBroadcast } from '@/lib/telegram'

export const maxDuration = 60

type TaskType = 'reminders' | 'bulk-approve' | 'progress-reports' | 'export-csv'
type ScheduleType = 'once' | 'daily' | 'weekly'

type ScheduledTask = {
    id: string
    taskType: TaskType
    scheduleType: ScheduleType
    runAt: any
    recurringDay?: number | null
    recurringTime?: string | null
    status: 'scheduled' | 'running' | 'completed' | 'failed'
    config: Record<string, any>
    createdBy: string
}

const NON_SUBMITTED_STATUSES = new Set(['draft', 'not_started'])

export async function POST(req: NextRequest) {
    try {
        const { taskId } = await req.json()
        if (!taskId) {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
        }

        const taskRef = adminDb.collection('scheduledTasks').doc(taskId)
        const taskSnap = await taskRef.get()
        if (!taskSnap.exists) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 })
        }

        const task = { id: taskSnap.id, ...taskSnap.data() } as ScheduledTask
        await taskRef.update({ status: 'running', lastRunAt: new Date() })

        let result: Record<string, any>
        try {
            switch (task.taskType) {
                case 'reminders':
                    result = await runReminders(task)
                    break
                case 'bulk-approve':
                    result = await runBulkApprove(task)
                    break
                case 'progress-reports':
                    result = await runProgressReports(task)
                    break
                case 'export-csv':
                    result = await runExportCsv(task)
                    break
                default:
                    throw new Error(`Unsupported task type: ${task.taskType}`)
            }

            const nextRunAt = computeNextRun(task)
            await taskRef.update({
                status: nextRunAt ? 'scheduled' : 'completed',
                runAt: nextRunAt || task.runAt,
                lastRunAt: new Date(),
                lastResult: result,
            })

            return NextResponse.json({ success: true, result })
        } catch (error: any) {
            await taskRef.update({
                status: 'failed',
                lastRunAt: new Date(),
                lastResult: { error: error.message || 'Task failed' },
            })
            throw error
        }
    } catch (error: any) {
        console.error('Scheduler task run failed:', error)
        return NextResponse.json({ error: error.message || 'Task failed' }, { status: 500 })
    }
}

function computeNextRun(task: ScheduledTask): Date | null {
    if (task.scheduleType === 'once') return null

    const [hours, minutes] = (task.recurringTime || '09:00').split(':').map(Number)
    const next = new Date()
    next.setSeconds(0, 0)
    next.setHours(hours, minutes)

    if (task.scheduleType === 'daily') {
        if (next <= new Date()) next.setDate(next.getDate() + 1)
        return next
    }

    if (task.scheduleType === 'weekly') {
        const targetDay = task.recurringDay ?? 1
        let daysUntil = (targetDay - next.getDay() + 7) % 7
        if (daysUntil === 0 && next <= new Date()) daysUntil = 7
        next.setDate(next.getDate() + daysUntil)
        return next
    }

    return null
}

async function addSystemMessage(studentId: string, title: string, body: string) {
    await adminDb.collection('messages').add({
        fromId: 'system',
        fromName: 'Teacher Scheduler',
        recipients: [studentId],
        title,
        body,
        createdAt: new Date(),
        readBy: [],
        type: 'system',
    })
}

async function getTelegramChatId(studentId: string): Promise<string | null> {
    const docSnap = await adminDb.collection('users').doc(studentId).get()
    return docSnap.exists ? docSnap.data()?.telegramChatId || null : null
}

async function maybeSendTelegram(studentId: string, title: string, body: string) {
    const chatId = await getTelegramChatId(studentId)
    if (!chatId) return 0
    const result = await sendTelegramBroadcast([chatId], title, body)
    return result.sent || 0
}

function isEssaySubmitted(essay: Record<string, any> | undefined) {
    if (!essay) return false
    if (essay.submittedAt) return true

    const status = String(essay.status || '').trim().toLowerCase()
    if (!status) return false

    return !NON_SUBMITTED_STATUSES.has(status)
}

function matchesGroupFilter(student: Record<string, any>, groupFilter: string) {
    if (!groupFilter) return true

    const normalized = groupFilter.toLowerCase()
    const fields = [student.groupName, student.classId, student.group]
        .filter(Boolean)
        .map(value => String(value).trim().toLowerCase())

    return fields.includes(normalized)
}

async function runReminders(task: ScheduledTask) {
    const topicId = String(task.config.topicId || '').trim()
    if (!topicId) {
        throw new Error('Reminder task is missing a topic')
    }

    const topicName = task.config.topicName || 'the current topic'
    const customMessage = String(task.config.customMessage || '').trim()
    const groupFilter = String(task.config.groupFilter || '').trim()

    const studentsSnap = await adminDb.collection('users').where('role', '==', 'student').get()
    const essaysSnap = await adminDb.collection('essays').where('topicId', '==', topicId).get()

    const submittedIds = new Set(
        essaysSnap.docs
            .map(doc => doc.data() as Record<string, any>)
            .filter(isEssaySubmitted)
            .map(essay => String(essay.studentId || '').trim())
            .filter(Boolean)
    )
    const pendingStudents = studentsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(student => matchesGroupFilter(student, groupFilter))
        .filter(student => !submittedIds.has(student.id))

    if (pendingStudents.length === 0) {
        return { studentsNotified: 0, telegramSent: 0, topicName, groupFilter: groupFilter || 'All groups' }
    }

    const message = customMessage || `You have not submitted your essay for "${topicName}" yet. Please submit it as soon as possible.`

    let telegramSent = 0
    for (const student of pendingStudents) {
        await addSystemMessage(student.id, 'Essay Submission Reminder', message)
        telegramSent += await maybeSendTelegram(student.id, 'Essay Submission Reminder', message)
    }

    return {
        studentsNotified: pendingStudents.length,
        telegramSent,
        topicName,
        groupFilter: groupFilter || 'All groups',
        pendingStudents: pendingStudents.map(student => student.displayName || student.name || 'Student'),
    }
}
async function pickPeerReviewers(studentId: string, classId?: string | null) {
    if (!classId) return [] as string[]

    const usersSnapshot = await adminDb.collection('users')
        .where('classId', '==', classId)
        .where('role', '==', 'student')
        .get()

    const candidateIds = usersSnapshot.docs
        .map(doc => doc.id)
        .filter(id => id !== studentId)

    const shuffled = [...candidateIds].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(3, shuffled.length))
}

async function runBulkApprove(task: ScheduledTask) {
    const action = task.config.action === 'reject' ? 'reject' : 'approve'
    const essaysSnap = await adminDb.collection('essays').where('status', '==', 'pending_teacher_approval').get()

    if (essaysSnap.empty) {
        return { processed: 0, action }
    }

    let processed = 0
    let telegramSent = 0

    for (const essayDoc of essaysSnap.docs) {
        const essay = essayDoc.data() as any
        if (action === 'approve') {
            const studentSnap = await adminDb.collection('users').doc(essay.studentId).get()
            const peerReviewIds = await pickPeerReviewers(essay.studentId, studentSnap.data()?.classId)
            await essayDoc.ref.update({
                status: 'under_review',
                approvedBy: task.createdBy,
                approvedAt: new Date(),
                peerReviewIds,
                requiresTeacherApproval: false,
            })
            const body = `Your essay "${essay.title}" was approved and has moved into peer review.`
            await addSystemMessage(essay.studentId, 'Essay Approved', body)
            telegramSent += await maybeSendTelegram(essay.studentId, 'Essay Approved', body)
        } else {
            await essayDoc.ref.update({
                status: 'rejected',
                rejectedBy: task.createdBy,
                rejectedAt: new Date(),
                rejectionReason: 'Rejected by scheduled bulk action.',
            })
            const body = `Your essay "${essay.title}" was not approved. Please review it and submit an updated version.`
            await addSystemMessage(essay.studentId, 'Essay Rejected', body)
            telegramSent += await maybeSendTelegram(essay.studentId, 'Essay Rejected', body)
        }
        processed += 1
    }

    return { processed, action, telegramSent }
}

function averageBandFromScores(scores: any) {
    if (!scores) return null
    const values = [
        Number(scores.taskAchievement || 0),
        Number(scores.coherenceCohesion || 0),
        Number(scores.lexicalResource || 0),
        Number(scores.grammaticalRange || 0),
    ].filter(value => !Number.isNaN(value))

    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

async function runProgressReports(task: ScheduledTask) {
    const groupFilter = String(task.config.groupFilter || '').trim().toLowerCase()
    const studentsSnap = await adminDb.collection('users').where('role', '==', 'student').get()
    const essaysSnap = await adminDb.collection('essays').get()
    const reviewsSnap = await adminDb.collection('reviews').get()

    let students = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
    if (groupFilter) {
        students = students.filter(student => {
            const fields = [student.groupName, student.classId, student.group]
                .filter(Boolean)
                .map((value: string) => String(value).toLowerCase())
            return fields.includes(groupFilter)
        })
    }

    let telegramSent = 0
    for (const student of students) {
        const essays = essaysSnap.docs.filter(doc => doc.data().studentId === student.id)
        const essayIds = new Set(essays.map(doc => doc.id))
        const reviewsGiven = reviewsSnap.docs.filter(doc => doc.data().reviewerId === student.id && doc.data().reviewerRole !== 'ai')
        const receivedReviews = reviewsSnap.docs.filter(doc => essayIds.has(doc.data().essayId) && doc.data().reviewerRole !== 'ai')
        const bands = receivedReviews
            .map(doc => averageBandFromScores(doc.data().scores))
            .filter((value): value is number => value !== null)
        const avgBand = bands.length > 0 ? (bands.reduce((sum, value) => sum + value, 0) / bands.length).toFixed(1) : 'N/A'

        await adminDb.collection('progressReports').doc(`${student.id}_latest`).set({
            studentId: student.id,
            studentName: student.displayName || student.name || 'Student',
            groupName: student.groupName || student.classId || '',
            essaysSubmitted: essays.length,
            reviewsGiven: reviewsGiven.length,
            avgBand,
            generatedAt: new Date(),
        })

        const body = `Essays submitted: ${essays.length}. Reviews given: ${reviewsGiven.length}. Average band: ${avgBand}.`
        await addSystemMessage(student.id, 'Progress Report Ready', body)
        telegramSent += await maybeSendTelegram(student.id, 'Progress Report Ready', body)
    }

    return { reportsGenerated: students.length, telegramSent }
}

async function runExportCsv(task: ScheduledTask) {
    const topicId = task.config.topicId || null
    const topicName = task.config.topicName || 'all_topics'

    const [studentsSnap, essaysSnap, reviewsSnap] = await Promise.all([
        adminDb.collection('users').where('role', '==', 'student').get(),
        adminDb.collection('essays').get(),
        adminDb.collection('reviews').get(),
    ])

    const studentsById = Object.fromEntries(studentsSnap.docs.map(doc => [doc.id, doc.data()]))
    const essays = essaysSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(essay => !topicId || essay.topicId === topicId)

    const header = [
        'Student Name',
        'Email',
        'Group',
        'Essay Title',
        'Topic',
        'Status',
        'Submitted At',
        'Word Count',
        'Peer Reviews',
        'Average Band',
    ]

    const rows = essays.map(essay => {
        const student = studentsById[essay.studentId] || {}
        const relatedReviews = reviewsSnap.docs.filter(doc => doc.data().essayId === essay.id && doc.data().reviewerRole !== 'ai')
        const bands = relatedReviews
            .map(doc => averageBandFromScores(doc.data().scores))
            .filter((value): value is number => value !== null)
        const averageBand = bands.length > 0 ? (bands.reduce((sum, value) => sum + value, 0) / bands.length).toFixed(1) : 'N/A'
        const wordCount = String(essay.content || '').trim().split(/\s+/).filter(Boolean).length
        const submittedAt = essay.submittedAt?.toDate?.()?.toISOString?.() || ''

        return [
            student.displayName || student.name || 'Unknown',
            student.email || '',
            student.groupName || student.classId || '',
            essay.title || 'Untitled',
            essay.topicName || '',
            essay.status || '',
            submittedAt,
            String(wordCount),
            String(relatedReviews.length),
            averageBand,
        ]
    })

    const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`
    const csvContent = [header, ...rows].map(row => row.map(escape).join(',')).join('\n')
    const filename = `scores_${String(topicName).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`

    const exportRef = await adminDb.collection('schedulerExports').add({
        taskId: task.id,
        filename,
        csvContent,
        rowCount: rows.length,
        createdAt: new Date(),
    })

    return { rowCount: rows.length, exportId: exportRef.id, filename }
}


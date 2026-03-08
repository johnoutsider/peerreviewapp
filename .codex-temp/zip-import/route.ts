import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { sendTelegramBroadcast } from '@/lib/telegram'
import { FieldValue } from 'firebase-admin/firestore'

export const maxDuration = 60

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduledTask {
    id: string
    taskType: 'reminders' | 'bulk-approve' | 'progress-reports' | 'export-csv'
    scheduleType: 'once' | 'daily' | 'weekly'
    runAt: any // Firestore Timestamp
    recurringDay?: number   // 0=Sun … 6=Sat (weekly only)
    recurringTime?: string  // "HH:MM" (daily / weekly)
    status: 'scheduled' | 'running' | 'completed' | 'failed'
    config: Record<string, any>
    createdBy: string
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const { taskId } = await req.json()
        if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 })

        const taskRef = adminDb.collection('scheduledTasks').doc(taskId)
        const taskSnap = await taskRef.get()
        if (!taskSnap.exists) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

        const task = { id: taskSnap.id, ...taskSnap.data() } as ScheduledTask

        // Mark as running
        await taskRef.update({ status: 'running', lastRunAt: new Date() })

        let result: Record<string, any>

        try {
            switch (task.taskType) {
                case 'reminders':        result = await runReminders(task);        break
                case 'bulk-approve':     result = await runBulkApprove(task);      break
                case 'progress-reports': result = await runProgressReports(task);  break
                case 'export-csv':       result = await runExportCsv(task);        break
                default:
                    throw new Error(`Unknown task type: ${task.taskType}`)
            }

            // Compute next run time for recurring tasks
            const nextRunAt = computeNextRun(task)

            await taskRef.update({
                status: nextRunAt ? 'scheduled' : 'completed',
                lastResult: result,
                lastRunAt: new Date(),
                ...(nextRunAt ? { runAt: nextRunAt } : {}),
            })

            return NextResponse.json({ success: true, result })

        } catch (execError: any) {
            await taskRef.update({ status: 'failed', lastError: execError.message })
            throw execError
        }

    } catch (err: any) {
        console.error('Scheduler run error:', err)
        return NextResponse.json({ error: err.message || 'Task execution failed' }, { status: 500 })
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNextRun(task: ScheduledTask): Date | null {
    if (task.scheduleType === 'once') return null

    const [hh, mm] = (task.recurringTime || '09:00').split(':').map(Number)
    const next = new Date()
    next.setSeconds(0, 0)
    next.setHours(hh, mm)

    if (task.scheduleType === 'daily') {
        // advance by 1 day if the time today already passed
        if (next <= new Date()) next.setDate(next.getDate() + 1)
        return next
    }

    if (task.scheduleType === 'weekly') {
        const targetDay = task.recurringDay ?? 1 // Monday default
        const today = next.getDay()
        let daysUntil = (targetDay - today + 7) % 7
        if (daysUntil === 0 && next <= new Date()) daysUntil = 7
        next.setDate(next.getDate() + daysUntil)
        return next
    }

    return null
}

// ─── Task: Send Reminders ─────────────────────────────────────────────────────

async function runReminders(task: ScheduledTask) {
    const { topicId, topicName, customMessage } = task.config

    // 1. All students
    const studentsSnap = await adminDb.collection('users').where('role', '==', 'student').get()
    const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // 2. Who already submitted for this topic?
    const essaysSnap = topicId
        ? await adminDb.collection('essays').where('topicId', '==', topicId).get()
        : await adminDb.collection('essays').get()

    const submittedIds = new Set(essaysSnap.docs.map(d => d.data().studentId as string))

    // 3. Students who haven't submitted
    const pending = students.filter((s: any) => !submittedIds.has(s.id))
    if (pending.length === 0) return { studentsNotified: 0, telegramSent: 0, message: 'All students have submitted!' }

    // 4. In-app notifications (batched)
    const msgBody = customMessage?.trim() ||
        `You haven't submitted your essay for "${topicName || 'the current topic'}" yet. Please submit as soon as possible! ✍️`

    const batch = adminDb.batch()
    for (const student of pending) {
        const ref = adminDb.collection('notifications').doc()
        batch.set(ref, {
            userId: student.id,
            title: '📝 Essay Submission Reminder',
            message: msgBody,
            type: 'reminder',
            read: false,
            createdAt: new Date(),
        })
    }
    await batch.commit()

    // 5. Telegram
    const chatIds: string[] = pending.filter((s: any) => s.telegramChatId).map((s: any) => s.telegramChatId)
    let telegramSent = 0
    if (chatIds.length > 0) {
        const result = await sendTelegramBroadcast(chatIds, '📝 Essay Submission Reminder', msgBody)
        telegramSent = result.sent
    }

    return { studentsNotified: pending.length, telegramSent }
}

// ─── Task: Bulk Approve / Reject ──────────────────────────────────────────────

async function runBulkApprove(task: ScheduledTask) {
    const { action } = task.config // 'approve' | 'reject'

    const essaysSnap = await adminDb.collection('essays')
        .where('status', '==', 'pending_teacher_approval').get()

    if (essaysSnap.empty) return { processed: 0, action, message: 'No pending essays found.' }

    const batch = adminDb.batch()

    for (const essayDoc of essaysSnap.docs) {
        batch.update(essayDoc.ref, {
            status: action === 'approve' ? 'under_review' : 'rejected',
            teacherApprovedAt: new Date(),
            requiresTeacherApproval: false,
        })

        // In-app notification for each student
        const essay = essayDoc.data() as any
        const notifRef = adminDb.collection('notifications').doc()
        batch.set(notifRef, {
            userId: essay.studentId,
            title: action === 'approve' ? '✅ Essay Approved' : '❌ Essay Rejected',
            message: action === 'approve'
                ? `Your essay "${essay.title}" has been approved and is now open for peer review.`
                : `Your essay "${essay.title}" was not approved. Please contact your teacher for more details.`,
            type: 'approval',
            read: false,
            createdAt: new Date(),
        })
    }

    await batch.commit()

    // If approving — assign peer reviewers for each essay using admin SDK
    if (action === 'approve') {
        for (const essayDoc of essaysSnap.docs) {
            try {
                const essay = essayDoc.data() as any
                await assignPeerReviewersAdmin(essayDoc.id, essay.studentId, essay.classId, essay.topicId)
            } catch (e) {
                console.error('Peer assignment failed for', essayDoc.id, e)
            }
        }
    }

    // Telegram notifications
    const studentIds: string[] = essaysSnap.docs.map(d => (d.data() as any).studentId)
    const usersSnap = await adminDb.collection('users')
        .where(FieldValue.documentId() as any, 'in', studentIds.slice(0, 10)).get()
    const chatIds = usersSnap.docs.filter(d => d.data().telegramChatId).map(d => d.data().telegramChatId as string)

    if (chatIds.length > 0) {
        const msg = action === 'approve'
            ? 'Your submitted essay has been approved by your teacher and is now open for peer review. 🎉'
            : 'Your submitted essay was not approved by your teacher. Please check the app for more details.'
        await sendTelegramBroadcast(chatIds, action === 'approve' ? '✅ Essay Approved' : '❌ Essay Rejected', msg)
    }

    return { processed: essaysSnap.size, action }
}

// Server-side peer assignment using Admin SDK (mirrors lib/peer-assignment.ts)
async function assignPeerReviewersAdmin(
    essayId: string, authorId: string, classId: string, topicId: string
): Promise<void> {
    if (!classId || !topicId) return

    const usersSnap = await adminDb.collection('users')
        .where('classId', '==', classId)
        .where('role', '==', 'student').get()

    const essaysSnap = await adminDb.collection('essays').where('topicId', '==', topicId).get()
    const topicSubmitters = new Set(essaysSnap.docs.map(d => d.data().studentId as string))

    const potential = usersSnap.docs
        .filter(d => d.id !== authorId && topicSubmitters.has(d.id))
        .map(d => d.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)

    if (potential.length > 0) {
        await adminDb.collection('essays').doc(essayId).update({ peerReviewIds: potential })
    }
}

// ─── Task: Progress Reports ───────────────────────────────────────────────────

async function runProgressReports(task: ScheduledTask) {
    const { groupFilter } = task.config

    // Fetch students
    let q = adminDb.collection('users').where('role', '==', 'student')
    const studentsSnap = await q.get()
    let students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    if (groupFilter) students = students.filter((s: any) => s.groupName === groupFilter)

    if (students.length === 0) return { reportsGenerated: 0, message: 'No students found.' }

    const [essaysSnap, reviewsSnap] = await Promise.all([
        adminDb.collection('essays').get(),
        adminDb.collection('reviews').get(),
    ])

    const allEssays = essaysSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    const allReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const batch = adminDb.batch()
    const telegramMessages: Array<{ chatId: string; text: string }> = []

    for (const student of students) {
        const essays = allEssays.filter((e: any) => e.studentId === student.id)
        const reviewsGiven = allReviews.filter((r: any) => r.reviewerId === student.id && r.reviewerRole !== 'ai')

        // Compute avg band from peer reviews received
        let totalBand = 0, bandCount = 0
        for (const essay of essays) {
            const received = allReviews.filter((r: any) => r.essayId === essay.id && r.reviewerRole !== 'ai')
            for (const rev of received) {
                if (rev.scores) {
                    const avg = (Object.values(rev.scores) as number[]).reduce((a, b) => a + b, 0) / 4
                    totalBand += avg
                    bandCount++
                }
            }
        }
        const avgBand = bandCount > 0 ? (totalBand / bandCount).toFixed(1) : 'N/A'
        const pendingReviews = Math.max(0, (essays.length * 3) - reviewsGiven.length)

        const name = student.displayName || student.name || 'Student'

        // Store report in Firestore
        const reportRef = adminDb.collection('progressReports').doc(`${student.id}_latest`)
        batch.set(reportRef, {
            studentId: student.id,
            studentName: name,
            groupName: student.groupName || 'Unassigned',
            essaysSubmitted: essays.length,
            reviewsGiven: reviewsGiven.length,
            pendingReviews,
            avgBand,
            generatedAt: new Date(),
        })

        // In-app notification
        const notifRef = adminDb.collection('notifications').doc()
        batch.set(notifRef, {
            userId: student.id,
            title: '📊 Progress Report Ready',
            message: `Essays: ${essays.length} | Reviews given: ${reviewsGiven.length} | Avg band: ${avgBand}`,
            type: 'progress-report',
            read: false,
            createdAt: new Date(),
        })

        // Telegram
        if (student.telegramChatId) {
            const statusLine = pendingReviews > 0
                ? `\n⏳ You still have ${pendingReviews} peer review(s) pending.`
                : '\n✅ You are up to date with all peer reviews!'
            telegramMessages.push({
                chatId: student.telegramChatId,
                text: `Hello ${name}! Here's your latest progress:\n\n📝 Essays submitted: *${essays.length}*\n✅ Peer reviews given: *${reviewsGiven.length}*\n⭐ Avg band score: *${avgBand}*${statusLine}`,
            })
        }
    }

    await batch.commit()

    // Send individual Telegram messages
    let telegramSent = 0
    for (const { chatId, text } of telegramMessages) {
        const r = await sendTelegramBroadcast([chatId], '📊 Your Progress Report', text)
        telegramSent += r.sent
    }

    return { reportsGenerated: students.length, telegramSent }
}

// ─── Task: Export CSV ─────────────────────────────────────────────────────────

async function runExportCsv(task: ScheduledTask) {
    const { topicFilter, topicName: filterTopicName } = task.config

    const [studentsSnap, essaysSnap, reviewsSnap] = await Promise.all([
        adminDb.collection('users').where('role', '==', 'student').get(),
        adminDb.collection('essays').get(),
        adminDb.collection('reviews').get(),
    ])

    const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    let essays = essaysSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    const reviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    if (topicFilter) essays = essays.filter((e: any) => e.topicId === topicFilter)

    const studentMap = Object.fromEntries(students.map((s: any) => [s.id, s]))

    const header = [
        'Student Name', 'Group', 'Email',
        'Essay Title', 'Topic', 'Status', 'Submitted At', 'Word Count',
        'Peer Reviews Received', 'Task Achievement', 'Coherence & Cohesion',
        'Lexical Resource', 'Grammatical Range', 'Average Band',
    ]

    const rows = essays.map((essay: any) => {
        const student = studentMap[essay.studentId] || {}
        const peerReviews = reviews.filter((r: any) =>
            r.essayId === essay.id && r.reviewerId !== 'ai-examiner' && r.reviewerRole !== 'ai'
        )

        let sumTA = 0, sumCC = 0, sumLR = 0, sumGR = 0
        let count = 0
        for (const rev of peerReviews) {
            if (rev.scores) {
                sumTA += rev.scores.taskAchievement || 0
                sumCC += rev.scores.coherenceCohesion || 0
                sumLR += rev.scores.lexicalResource || 0
                sumGR += rev.scores.grammaticalRange || 0
                count++
            }
        }

        const fmt = (n: number) => count > 0 ? (n / count).toFixed(1) : 'N/A'
        const avgBand = count > 0
            ? ((sumTA + sumCC + sumLR + sumGR) / (count * 4)).toFixed(1)
            : 'N/A'

        const wordCount = essay.content?.trim().split(/\s+/).filter(Boolean).length || 0
        const submittedAt = essay.submittedAt?.toDate?.()?.toLocaleDateString('en-GB') || ''

        return [
            student.displayName || student.name || 'Unknown',
            student.groupName || 'Unassigned',
            student.email || '',
            essay.title || 'Untitled',
            essay.topicName || '',
            essay.status || '',
            submittedAt,
            wordCount.toString(),
            peerReviews.length.toString(),
            fmt(sumTA), fmt(sumCC), fmt(sumLR), fmt(sumGR),
            avgBand,
        ]
    })

    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const csvContent = [header, ...rows].map(row => row.map(escape).join(',')).join('\n')
    const filename = `scores_${filterTopicName?.replace(/\s+/g, '_') || 'all'}_${new Date().toISOString().split('T')[0]}.csv`

    // Store in Firestore so the teacher can download it from the page
    const exportRef = adminDb.collection('schedulerExports').doc()
    await exportRef.set({
        taskId: task.id,
        csvContent,
        filename,
        rowCount: rows.length,
        topicFilter: topicFilter || null,
        createdAt: new Date(),
    })

    return { rowCount: rows.length, exportId: exportRef.id, filename }
}

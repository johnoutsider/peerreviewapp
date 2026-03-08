import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { sendTelegramBroadcast } from '@/lib/telegram'
import OpenAI from 'openai'

export const maxDuration = 60

/**
 * Phase 2 of Progress Reports.
 *
 * Called by the Vercel hourly cron (/api/cron/collect-batch).
 * Also called by the scheduler page client polling every 5 minutes
 * when it detects an in_progress batchJob in Firestore.
 *
 * Flow:
 * 1. Find all batchJobs with status = 'in_progress'
 * 2. Check each one with OpenAI Batch API
 * 3. If completed → download results → save reports + send Telegram
 * 4. If still running → skip until next poll
 * 5. If expired/failed → mark and notify teacher
 */
export async function GET() {
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        // 1. Find pending batch jobs
        const jobsSnap = await adminDb
            .collection('batchJobs')
            .where('status', '==', 'in_progress')
            .get()

        if (jobsSnap.empty) return NextResponse.json({ collected: 0 })

        let collected = 0

        for (const jobDoc of jobsSnap.docs) {
            const job = { id: jobDoc.id, ...jobDoc.data() } as any

            try {
                // 2. Check batch status with OpenAI
                const batch = await openai.batches.retrieve(job.batchId)

                if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
                    // Not ready yet — skip
                    continue
                }

                if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
                    await jobDoc.ref.update({ status: batch.status, completedAt: new Date() })

                    // Notify teacher in-app
                    const teachersSnap = await adminDb.collection('users').where('role', '==', 'teacher').get()
                    const firestoreBatch = adminDb.batch()
                    for (const teacher of teachersSnap.docs) {
                        const ref = adminDb.collection('notifications').doc()
                        firestoreBatch.set(ref, {
                            userId: teacher.id,
                            title: '⚠️ Progress Report Batch Failed',
                            message: `The batch job for progress reports ${batch.status}. Please reschedule the task.`,
                            type: 'batch-error',
                            read: false,
                            createdAt: new Date(),
                        })
                    }
                    await firestoreBatch.commit()
                    continue
                }

                if (batch.status !== 'completed') continue

                // 3. Download results
                if (!batch.output_file_id) continue
                const fileResponse = await openai.files.content(batch.output_file_id)
                const fileText = await fileResponse.text()

                // Parse each line of the output .jsonl
                const resultMap: Record<string, string> = {}
                for (const line of fileText.split('\n').filter(Boolean)) {
                    try {
                        const result = JSON.parse(line)
                        const studentId = result.custom_id
                        const aiMessage = result.response?.body?.choices?.[0]?.message?.content || ''
                        if (studentId && aiMessage) resultMap[studentId] = aiMessage
                    } catch { /* skip malformed lines */ }
                }

                // 4. Save reports + notifications + Telegram
                const studentStats: Record<string, any> = job.studentStats || {}
                const firestoreBatch = adminDb.batch()
                const telegramMessages: Array<{ chatId: string; name: string; stats: any; aiMessage: string }> = []

                for (const studentId of (job.studentIds || [])) {
                    const s = studentStats[studentId]
                    if (!s) continue

                    const aiMessage = resultMap[studentId] || ''
                    const pendingLine = s.pendingReviews > 0
                        ? `You still have ${s.pendingReviews} peer review(s) pending.`
                        : 'You are up to date with all your peer reviews!'

                    // Progress report doc
                    const reportRef = adminDb.collection('progressReports').doc(`${studentId}_latest`)
                    firestoreBatch.set(reportRef, {
                        studentId,
                        studentName: s.name,
                        groupName: s.groupName,
                        essaysSubmitted: s.essaysSubmitted,
                        reviewsGiven: s.reviewsGiven,
                        pendingReviews: s.pendingReviews,
                        avgBand: s.avgBand,
                        aiEncouragement: aiMessage,
                        generatedAt: new Date(),
                    })

                    // In-app notification
                    const notifRef = adminDb.collection('notifications').doc()
                    firestoreBatch.set(notifRef, {
                        userId: studentId,
                        title: '📊 Progress Report Ready',
                        message: `Essays: ${s.essaysSubmitted} | Reviews given: ${s.reviewsGiven} | Avg band: ${s.avgBand}. ${pendingLine}`,
                        type: 'progress-report',
                        read: false,
                        createdAt: new Date(),
                    })

                    if (s.telegramChatId) {
                        telegramMessages.push({ chatId: s.telegramChatId, name: s.name, stats: s, aiMessage })
                    }
                }

                await firestoreBatch.commit()

                // Send Telegram messages individually (personalised)
                let telegramSent = 0
                for (const { chatId, name, stats, aiMessage } of telegramMessages) {
                    const statusLine = stats.pendingReviews > 0
                        ? `⏳ You still have *${stats.pendingReviews}* peer review(s) pending.`
                        : '✅ You are up to date with all your peer reviews!'

                    const text = [
                        `Hello ${name}! Here is your latest progress:`,
                        '',
                        `📝 Essays submitted: *${stats.essaysSubmitted}*`,
                        `✅ Peer reviews given: *${stats.reviewsGiven}*`,
                        `⭐ Avg band score: *${stats.avgBand}*`,
                        statusLine,
                        aiMessage ? `\n💬 _${aiMessage}_` : '',
                    ].filter(Boolean).join('\n')

                    const r = await sendTelegramBroadcast([chatId], '📊 Your Progress Report', text)
                    telegramSent += r.sent
                }

                // 5. Mark batch job as completed
                await jobDoc.ref.update({
                    status: 'completed',
                    completedAt: new Date(),
                    reportsGenerated: job.studentIds?.length || 0,
                    telegramSent,
                    outputFileId: batch.output_file_id,
                })

                // Clean up the uploaded input file from OpenAI to save storage
                try { await openai.files.del(job.inputFileId) } catch { /* non-critical */ }

                collected++

            } catch (jobErr: any) {
                console.error(`Failed to collect batch ${job.batchId}:`, jobErr)
                await jobDoc.ref.update({ status: 'failed', lastError: jobErr.message })
            }
        }

        return NextResponse.json({ collected })

    } catch (err: any) {
        console.error('collect-batch error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

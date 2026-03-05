import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

export async function POST(req: Request) {
    try {
        const { essayId, teacherId, reason } = await req.json()

        if (!essayId || !teacherId || !reason) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        const essayRef = adminDb.collection('essays').doc(essayId)
        const essayDoc = await essayRef.get()

        if (!essayDoc.exists) {
            return NextResponse.json({ error: 'Essay not found' }, { status: 404 })
        }

        const essayData = essayDoc.data()!

        if (essayData.status !== 'pending_teacher_approval') {
            return NextResponse.json({ error: 'Essay is not pending approval' }, { status: 400 })
        }

        // 1. Update status to rejected
        await essayRef.update({
            status: 'rejected',
            rejectedBy: teacherId,
            rejectedAt: new Date(),
            rejectionReason: reason
        })

        // 2. Send In-App Message
        await adminDb.collection('messages').add({
            fromId: 'system',
            fromName: 'Teacher (Review)',
            recipients: [essayData.studentId],
            title: `Your essay "${essayData.title}" was not approved`,
            body: `Your essay has been reviewed by your teacher and was NOT approved for peer review.\n\nReason: ${reason}\n\nPlease check your My Essays tab, rewrite your essay from scratch using your own words, and submit it again.`,
            createdAt: new Date(),
            readBy: [],
            type: 'system'
        })

        // 3. Send Telegram Message
        const telDoc = await adminDb.collection('telegram_links').doc(essayData.studentId).get()
        if (telDoc.exists) {
            const chatId = telDoc.data()?.chatId
            if (chatId) {
                const messageText = `❌ *Essay Not Approved*\n\nYour essay "${essayData.title}" was reviewed by your teacher and was NOT approved.\n\n*Reason:* ${reason}\n\nPlease revisit the site to rewrite your essay.`

                try {
                    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/telegram/broadcast`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chatIds: [chatId],
                            message: messageText,
                        })
                    })
                } catch (tErr) {
                    console.error("Failed to trigger telegram ping:", tErr)
                }
            }
        }

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error('Reject essay error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

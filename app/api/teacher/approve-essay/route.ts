import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

export async function POST(req: Request) {
    try {
        const { essayId, teacherId } = await req.json()

        if (!essayId || !teacherId) {
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

        // Get student's classId for peer assignment
        const studentDoc = await adminDb.collection('users').doc(essayData.studentId).get()
        const classId = studentDoc.data()?.classId

        let selectedPeers: string[] = []

        if (classId) {
            // Assign peers
            const usersSnapshot = await adminDb.collection('users')
                .where('classId', '==', classId)
                .where('role', '==', 'student')
                .get()

            const potentialReviewers = usersSnapshot.docs
                .map(d => d.id)
                .filter(id => id !== essayData.studentId)

            if (potentialReviewers.length > 0) {
                const shuffled = potentialReviewers.sort(() => Math.random() - 0.5)
                selectedPeers = shuffled.slice(0, Math.min(3, shuffled.length))
            }
        }

        // 1. Update status to under_review and assign peers
        await essayRef.update({
            status: 'under_review',
            approvedBy: teacherId,
            approvedAt: new Date(),
            peerReviewIds: selectedPeers,
            requiresTeacherApproval: false // marking it as resolved
        })

        // 2. Send In-App Message
        await adminDb.collection('messages').add({
            fromId: 'system',
            fromName: 'Teacher (Approval)',
            recipients: [essayData.studentId],
            title: `Your essay "${essayData.title}" was approved!`,
            body: `Your essay has been reviewed and APPROVED by your teacher! It has now been assigned to peers for review.`,
            createdAt: new Date(),
            readBy: [],
            type: 'system'
        })

        // 3. Send Telegram Message
        const telDoc = await adminDb.collection('telegram_links').doc(essayData.studentId).get()
        if (telDoc.exists) {
            const chatId = telDoc.data()?.chatId
            if (chatId) {
                const messageText = `✅ *Essay Approved*\n\nYour essay "${essayData.title}" was reviewed and *APPROVED* by your teacher!\n\nIt is now entering the peer review stage.`

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

        return NextResponse.json({ success: true, peerReviewIds: selectedPeers })
    } catch (e: any) {
        console.error('Approve essay error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

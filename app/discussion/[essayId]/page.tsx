'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import { DiscussionForum } from '@/components/DiscussionForum'

export default function DiscussionPage() {
    const params = useParams()
    const router = useRouter()
    const essayId = params.essayId as string

    const [essay, setEssay] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchEssay = async () => {
            if (!auth.currentUser) { router.push('/'); return }
            try {
                const essayDoc = await getDoc(doc(db, 'essays', essayId))
                if (essayDoc.exists()) {
                    setEssay({ id: essayDoc.id, ...essayDoc.data() })
                }
            } catch (err) {
                console.error('Error fetching essay:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchEssay()
    }, [essayId, router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-11 w-11 border-b-2 border-blue-500" />
            </div>
        )
    }

    return (
        <StudentLayout title="Peer Discussion">
            <DiscussionForum
                essayTitle={essay?.title}
                essayContent={essay?.content}
            />
        </StudentLayout>
    )
}

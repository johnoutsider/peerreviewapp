'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TeacherLayout from '@/components/TeacherLayout'
import { auth, db } from '@/lib/firebase'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'

interface PendingEssay {
    id: string
    title: string
    topicName: string
    studentName: string
    studentId: string
    content: string
    submittedAt: any
}

export default function TeacherApprovalsPage() {
    const router = useRouter()
    const [essays, setEssays] = useState<PendingEssay[]>([])
    const [loading, setLoading] = useState(true)

    // Modal state
    const [selectedEssay, setSelectedEssay] = useState<PendingEssay | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [rejecting, setRejecting] = useState(false)
    const [approving, setApproving] = useState(false)

    // Load essays pending approval
    useEffect(() => {
        const loadPending = async () => {
            try {
                const q = query(collection(db, 'essays'), where('status', '==', 'pending_teacher_approval'))
                const snap = await getDocs(q)
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingEssay))

                // Sort by newest first
                data.sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0))
                setEssays(data)
            } catch (err) {
                console.error("Failed to load approvals:", err)
            } finally {
                setLoading(false)
            }
        }
        loadPending()
    }, [])

    const handleApprove = async () => {
        if (!selectedEssay || !auth.currentUser) return
        setApproving(true)
        try {
            const res = await fetch('/api/teacher/approve-essay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    essayId: selectedEssay.id,
                    teacherId: auth.currentUser.uid
                })
            })

            if (!res.ok) throw new Error("Approval failed")

            // Remove from list
            setEssays(prev => prev.filter(e => e.id !== selectedEssay.id))
            setSelectedEssay(null)
        } catch (err) {
            console.error(err)
            alert("Error approving essay. Check console.")
        } finally {
            setApproving(false)
        }
    }

    const handleReject = async () => {
        if (!selectedEssay || !auth.currentUser || !rejectReason.trim()) return
        setRejecting(true)
        try {
            const res = await fetch('/api/teacher/reject-essay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    essayId: selectedEssay.id,
                    teacherId: auth.currentUser.uid,
                    reason: rejectReason
                })
            })

            if (!res.ok) throw new Error("Rejection failed")

            // Remove from list
            setEssays(prev => prev.filter(e => e.id !== selectedEssay.id))
            setSelectedEssay(null)
            setRejectReason('')
        } catch (err) {
            console.error(err)
            alert("Error rejecting essay. Check console.")
        } finally {
            setRejecting(false)
        }
    }

    return (
        <TeacherLayout title="Approvals">
            <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
                <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">
                            Pending Approvals
                        </h1>
                        <p className="text-slate-500 text-sm">
                            Essays flagged by the AI Detector awaiting your review
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                    </div>
                ) : essays.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
                        <span className="text-4xl mb-4 block">✅</span>
                        <p className="font-medium text-slate-700">All caught up!</p>
                        <p className="text-sm">There are no essays pending approval right now.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th className="px-6 py-4">Student</th>
                                        <th className="px-6 py-4">Essay Title</th>
                                        <th className="px-6 py-4">Topic</th>
                                        <th className="px-6 py-4">Submitted</th>
                                        <th className="px-6 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {essays.map(essay => (
                                        <tr key={essay.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-900">
                                                {essay.studentName}
                                            </td>
                                            <td className="px-6 py-4 max-w-[200px] truncate text-slate-700">
                                                {essay.title}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">
                                                {essay.topicName}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">
                                                {essay.submittedAt?.toDate ? essay.submittedAt.toDate().toLocaleDateString() : 'Unknown'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => setSelectedEssay(essay)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 font-semibold rounded-lg hover:bg-blue-100 transition-colors"
                                                >
                                                    Review
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* MODAL / DETAILED VIEW */}
                {selectedEssay && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-fade-in relative">
                            {/* Header */}
                            <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-2.5 py-0.5 rounded-full">AI Flagged</span>
                                        <span className="text-sm font-semibold text-slate-500">{selectedEssay.topicName}</span>
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-900">{selectedEssay.title}</h2>
                                    <p className="text-xs text-slate-500 mt-1">By {selectedEssay.studentName}</p>
                                </div>
                                <button
                                    onClick={() => { setSelectedEssay(null); setRejectReason(''); }}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 shadow-inner">
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-slate-800 text-sm md:text-base leading-relaxed whitespace-pre-wrap font-serif">
                                    {selectedEssay.content}
                                </div>
                            </div>

                            {/* Rejection input area */}
                            <div className="px-6 pt-4 border-t border-slate-200 bg-white">
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Reject Reason (Required if rejecting)</label>
                                <textarea
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    placeholder="Explain why this essay is being rejected (e.g., Please rewrite in your own words...)"
                                    className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:ring-red-500 focus:border-red-500"
                                    rows={2}
                                />
                            </div>

                            {/* Actions / Footer */}
                            <div className="p-6 bg-white rounded-b-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                <button
                                    onClick={() => { setSelectedEssay(null); setRejectReason(''); }}
                                    className="px-4 py-2 font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors order-3 sm:order-1"
                                >
                                    Cancel
                                </button>

                                <div className="flex gap-3 w-full sm:w-auto order-1 sm:order-2">
                                    <button
                                        onClick={handleReject}
                                        disabled={rejecting || approving || !rejectReason.trim()}
                                        className="flex-1 sm:flex-none px-6 py-2.5 bg-red-100 text-red-700 font-bold rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50"
                                    >
                                        {rejecting ? 'Rejecting...' : 'Reject Essay'}
                                    </button>
                                    <button
                                        onClick={handleApprove}
                                        disabled={rejecting || approving}
                                        className="flex-1 sm:flex-none px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-md shadow-green-500/20 transition-all disabled:opacity-50"
                                    >
                                        {approving ? 'Approving...' : 'Approve & Assign'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </TeacherLayout>
    )
}

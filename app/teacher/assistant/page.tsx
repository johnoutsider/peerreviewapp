'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import Header from '@/components/Header'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

export default function TeacherAssistant() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [loadingData, setLoadingData] = useState(true)
    const [isTeacher, setIsTeacher] = useState(false)
    const [classData, setClassData] = useState<any>(null)

    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: "Hello! I'm your AI Teaching Assistant. I have analyzed your current class data, including all student profiles, submitted essays, and peer reviews. \n\nHow can I help you? For example, ask me:\n- Who hasn't submitted an essay yet?\n- Are there any students writing very short peer reviews?\n- Which students haven't completed their peer reviews?" }
    ])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                router.push('/auth/signin?redirect=/teacher/assistant')
                return
            }
            try {
                // Check if user is teacher
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)
                if (profile?.role !== 'teacher') {
                    router.push('/dashboard')
                    return
                }
                setIsTeacher(true)
                setLoading(false)

                // Fetch full class context for the AI
                await fetchClassData()

            } catch (error) {
                console.error('Error in auth state:', error)
                router.push('/dashboard')
            }
        })
        return () => unsubscribe()
    }, [router])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const fetchClassData = async () => {
        try {
            setLoadingData(true)

            // 1. Fetch Students
            const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
            const students = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))

            // 2. Fetch Essays
            const essaysSnap = await getDocs(collection(db, 'essays'))
            const essays = essaysSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))

            // 3. Fetch Reviews
            const reviewsSnap = await getDocs(collection(db, 'reviews'))
            const reviews = reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))

            // Construct an efficient JSON structure for the AI
            const contextData = {
                summary: "This is a snapshot of the current class state.",
                students: students.map((s: any) => ({
                    uid: s.id,
                    name: s.displayName || s.name,
                    group: s.groupName || 'Unassigned',
                    email: s.email
                })),
                essays: essays.map((e: any) => ({
                    essayId: e.id,
                    studentId: e.studentId,
                    status: e.status,
                    submittedAt: e.submittedAt?.toDate?.()?.toISOString() || e.submittedAt || null,
                    wordCount: e.content?.split(' ').length || 0,
                    topicName: e.topicName || 'Unknown'
                })),
                reviews: reviews.map((r: any) => {
                    const wordCount = r.feedback?.trim() ? r.feedback.trim().split(/\s+/).length : 0
                    const avgScore = r.scores ? (Object.values(r.scores) as number[]).reduce((a: number, b: number) => a + b, 0) / 4 : 0
                    return {
                        reviewId: r.id,
                        reviewerId: r.reviewerId,
                        reviewerName: r.reviewerName || 'Unknown Student',
                        essayId: r.essayId,
                        feedbackText: r.feedback,
                        feedbackWordCount: wordCount,
                        feedbackLength: wordCount < 15 ? 'Very Short' : wordCount < 40 ? 'Short' : 'Good',
                        completedAt: r.completedAt?.toDate?.()?.toISOString() || r.completedAt || null,
                        avgScoreGiven: avgScore,
                        isTeacherReview: r.reviewerRole === 'teacher'
                    }
                })
            }

            setClassData(contextData)
        } catch (error: any) {
            console.error('Error fetching class data:', error)
        } finally {
            setLoadingData(false)
        }
    }

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || sending || loadingData || !classData) return

        const userMsg = input.trim()
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMsg }])
        setSending(true)

        try {
            const res = await fetch('/api/teacher-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: userMsg,
                    classData,
                    currentDate: new Date().toISOString()
                })
            })

            const data = await res.json()

            if (!res.ok) throw new Error(data.error || 'Failed to get response')

            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])

        } catch (error: any) {
            console.error('Agent error:', error)
            setMessages(prev => [...prev, { role: 'assistant', content: "⚠️ Error: Unable to fetch response from the AI assistant." }])
        } finally {
            setSending(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
        )
    }

    if (!isTeacher) return null

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 flex flex-col">
            <Header />

            <main className="container mx-auto px-4 py-8 max-w-4xl flex-1 flex flex-col h-[calc(100vh-80px)]">
                <div className="mb-6 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                            🤖 AI Teaching Assistant
                        </h1>
                        <p className="text-gray-400">Ask questions about student participation and review quality.</p>
                    </div>
                    {loadingData ? (
                        <div className="text-sm text-yellow-400 animate-pulse flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin"></div>
                            Syncing class data...
                        </div>
                    ) : (
                        <div className="text-sm text-green-400 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400"></div>
                            Class Data Synced
                        </div>
                    )}
                </div>

                {/* Chat Box */}
                <div className="flex-1 bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-2xl flex flex-col overflow-hidden mb-4 shadow-2xl">

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user'
                                    ? 'bg-purple-600 text-white rounded-br-none'
                                    : 'bg-slate-700/60 text-gray-200 border border-white/5 rounded-bl-none'
                                    }`}>
                                    <p className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        {sending && (
                            <div className="flex justify-start">
                                <div className="bg-slate-700/60 text-gray-200 border border-white/5 rounded-2xl rounded-bl-none p-4 flex gap-2 items-center">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-slate-900/50 border-t border-white/10">
                        <form onSubmit={handleSendMessage} className="flex gap-4">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={loadingData ? "Syncing data, please wait..." : "Ask the assistant e.g. 'Who hasn't submitted an essay?'"}
                                disabled={sending || loadingData}
                                className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || sending || loadingData}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
                            >
                                {sending ? '...' : 'Send'}
                            </button>
                        </form>
                    </div>
                </div>

            </main>
        </div>
    )
}

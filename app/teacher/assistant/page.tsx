'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import TeacherLayout from '@/components/TeacherLayout'
import { collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface ChatSession {
    id: string
    title: string
    messages: ChatMessage[]
    updatedAt: any
}

export default function TeacherAssistant() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [loadingData, setLoadingData] = useState(true)
    const [isTeacher, setIsTeacher] = useState(false)
    const [classData, setClassData] = useState<any>(null)
    const [userId, setUserId] = useState<string | null>(null)

    // Chat History State
    const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
    const [activeChatId, setActiveChatId] = useState<string | null>(null)
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)

    const defaultMessage: ChatMessage = {
        role: 'assistant',
        content: "Hello! I'm your AI Teaching Assistant. I have analyzed your current class data, including all student profiles, submitted essays, and peer reviews. \n\nHow can I help you? For example, ask me:\n- Who hasn't submitted an essay yet?\n- Are there any students writing very short peer reviews?\n- Which students haven't completed their peer reviews?"
    }

    const [messages, setMessages] = useState<ChatMessage[]>([defaultMessage])
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
                setUserId(user.uid)
                setLoading(false)

                // Fetch full class context for the AI
                await fetchClassData()
                await fetchChatSessions(user.uid)

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

    const fetchChatSessions = async (uid: string) => {
        try {
            const q = query(
                collection(db, 'assistantChats'),
                where('userId', '==', uid)
            )
            const snap = await getDocs(q)
            const sessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession))

            // Sort manually to avoid requiring a composite index in Firestore
            sessions.sort((a, b) => {
                const timeA = (a.updatedAt as any)?.toMillis?.() || (a.updatedAt as any)?.getTime?.() || 0
                const timeB = (b.updatedAt as any)?.toMillis?.() || (b.updatedAt as any)?.getTime?.() || 0
                return timeB - timeA
            })

            setChatSessions(sessions)
        } catch (error) {
            console.error('Error fetching chat sessions:', error)
        }
    }

    const startNewChat = () => {
        setActiveChatId(null)
        setMessages([defaultMessage])
        if (window.innerWidth < 768) setIsSidebarOpen(false)
    }

    const loadChat = (session: ChatSession) => {
        setActiveChatId(session.id)
        setMessages(session.messages)
        if (window.innerWidth < 768) setIsSidebarOpen(false)
    }

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
                    essayText: e.content ? e.content.substring(0, 500) + (e.content.length > 500 ? '...' : '') : '',
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

            const aiReply: ChatMessage = { role: 'assistant', content: data.reply }
            const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }, aiReply]
            setMessages(newMessages)

            // Save to Firestore
            if (activeChatId) {
                await updateDoc(doc(db, 'assistantChats', activeChatId), {
                    messages: newMessages,
                    updatedAt: serverTimestamp()
                })
                // Update local sidebar
                setChatSessions(prev => prev.map(s => s.id === activeChatId ? { ...s, messages: newMessages, updatedAt: new Date() } : s))
            } else {
                const title = userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : userMsg
                const newDoc = await addDoc(collection(db, 'assistantChats'), {
                    userId,
                    title,
                    messages: newMessages,
                    updatedAt: serverTimestamp()
                })
                setActiveChatId(newDoc.id)
                setChatSessions(prev => [{
                    id: newDoc.id,
                    title,
                    messages: newMessages,
                    updatedAt: new Date()
                }, ...prev])
            }

        } catch (error: any) {
            console.error('Agent error:', error)
            setMessages(prev => [...prev, { role: 'assistant', content: `âš ï¸ Error: ${error.message || 'Unable to fetch response from the AI assistant.'}` }])
        } finally {
            setSending(false)
        }
    }

    if (loading) {
        return (
            <TeacherLayout title="AI Assistant">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500" />
                </div>
            </TeacherLayout>
        )
    }

    if (!isTeacher) return null

    return (
        <TeacherLayout title="AI Assistant">
            <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>

                {/* â”€â”€ Chat History Sidebar â”€â”€ */}
                <div className={`
                    absolute md:static inset-y-0 left-0 z-20 flex flex-col w-64 shrink-0
                    bg-white border-r border-slate-100 transition-transform duration-300
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:flex hidden'}
                `}>
                    <div className="p-3 border-b border-slate-100">
                        <button
                            onClick={startNewChat}
                            className="w-full bg-teal-500 hover:bg-teal-600 text-white rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors font-semibold text-sm"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Chat
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Chat History</div>
                        {chatSessions.length === 0 ? (
                            <div className="text-sm text-slate-400 pl-2 italic">No past sessions.</div>
                        ) : (
                            <div className="space-y-0.5">
                                {chatSessions.map(session => (
                                    <button
                                        key={session.id}
                                        onClick={() => loadChat(session)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all truncate flex items-center gap-2 ${activeChatId === session.id
                                            ? 'bg-teal-50 text-teal-700 font-medium'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                            }`}
                                    >
                                        <svg className="w-3.5 h-3.5 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                        </svg>
                                        {session.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* â”€â”€ Main Chat Area â”€â”€ */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50">

                    {/* Inner header bar */}
                    <div className="h-14 border-b border-slate-100 bg-white flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="text-slate-400 hover:text-slate-700 transition-colors md:hidden"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <span className="text-slate-700 font-semibold text-sm">AI Assistant</span>
                        </div>
                        {loadingData ? (
                            <div className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full flex items-center gap-1.5 border border-amber-100">
                                <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                                Syncing dataâ€¦
                            </div>
                        ) : (
                            <div className="text-xs text-teal-600 bg-teal-50 px-3 py-1 rounded-full flex items-center gap-1.5 border border-teal-100">
                                <div className="w-2 h-2 rounded-full bg-teal-500" />
                                Connected
                            </div>
                        )}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="max-w-3xl mx-auto space-y-4 pb-4">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-teal-500 text-white rounded-br-sm'
                                        : 'bg-white text-slate-700 rounded-bl-sm border border-slate-100 shadow-sm'
                                        }`}>
                                        {msg.content.split('\n').map((line, i) => (
                                            <p key={i} className="mb-1 last:mb-0 min-h-[1em]">{line}</p>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {sending && (
                                <div className="flex justify-start">
                                    <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center shadow-sm">
                                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" />
                                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Input */}
                    <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                        <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto relative flex items-center">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={loadingData ? 'Syncing data, please waitâ€¦' : 'Ask your assistantâ€¦'}
                                disabled={sending || loadingData}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl pl-4 pr-14 py-3 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-50 transition-all text-sm"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || sending || loadingData}
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-teal-500 text-white hover:bg-teal-600 w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
                            >
                                {sending ? (
                                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                ) : (
                                    <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                )}
                            </button>
                        </form>
                        <p className="text-center text-xs text-slate-400 mt-2">
                            AI may make mistakes. Verify important information from the dashboard.
                        </p>
                    </div>

                </div>
            </div>
        </TeacherLayout>
    )
}




'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import Header from '@/components/Header'
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
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${error.message || 'Unable to fetch response from the AI assistant.'}` }])
        } finally {
            setSending(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
        )
    }

    if (!isTeacher) return null

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-900 flex flex-col overflow-hidden">
            <Header />

            <main className="flex-1 flex overflow-hidden bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10">
                {/* Sidebar Area */}
                <div className={`
                    absolute md:static top-0 left-0 h-full w-72 shrink-0
                    bg-slate-50 dark:bg-slate-900 z-30 transition-transform duration-300
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}
                    flex flex-col border-r border-slate-700 shadow-2xl md:shadow-none
                `}>
                    <div className="p-4 border-b border-slate-700">
                        <button
                            onClick={startNewChat}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-3 flex items-center justify-center gap-2 transition-colors font-semibold"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Chat
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                        <div className="text-[11px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-widest mb-3 px-2">Chat History</div>
                        {chatSessions.length === 0 ? (
                            <div className="text-sm text-slate-500 dark:text-gray-400 pl-2 italic">No past sessions found.</div>
                        ) : (
                            <div className="space-y-1">
                                {chatSessions.map(session => (
                                    <button
                                        key={session.id}
                                        onClick={() => loadChat(session)}
                                        className={`w-full text-left p-3 rounded-lg text-sm transition-all truncate flex items-center gap-3 ${activeChatId === session.id
                                            ? 'bg-slate-100 dark:bg-slate-900/50 text-slate-900 dark:text-white font-medium shadow-sm'
                                            : 'text-slate-400 hover:bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10 hover:text-slate-200'
                                            }`}
                                    >
                                        <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                        </svg>
                                        {session.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Chat Layout Container */}
                <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10 relative">

                    {/* Header bar */}
                    <div className="h-16 border-b border-slate-700 flex items-center justify-between px-4 lg:px-6 shrink-0 bg-slate-50 dark:bg-slate-900/40">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="text-slate-400 hover:text-slate-900 dark:text-white transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
                                AI Assistant
                            </h1>
                        </div>
                        {loadingData ? (
                            <div className="text-xs text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-full flex items-center gap-2 font-medium border border-amber-500/20">
                                <div className="w-3 h-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></div>
                                Syncing database...
                            </div>
                        ) : (
                            <div className="text-xs text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full flex items-center gap-2 font-medium border border-emerald-500/20">
                                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                Data Connected
                            </div>
                        )}
                    </div>

                    {/* Scrolling Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                        <div className="max-w-4xl mx-auto space-y-6 pb-4">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[90%] md:max-w-[75%] rounded-2xl p-5 shadow-sm ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-slate-100 dark:bg-slate-900/50 text-slate-100 rounded-bl-sm border border-slate-600'
                                        }`}>
                                        <div className="prose prose-invert max-w-none text-[15px] leading-relaxed">
                                            {msg.content.split('\n').map((line, i) => (
                                                <p key={i} className="mb-2 last:mb-0 min-h-[1em]">{line}</p>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {sending && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-100 dark:bg-slate-900/50 text-slate-200 border border-slate-600 rounded-2xl rounded-bl-sm p-5 flex gap-2 items-center shadow-sm">
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Static Input Area Fixed at Bottom */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 shrink-0 border-t border-slate-700">
                        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative flex items-center">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={loadingData ? "Syncing data, please wait..." : "Ask your assistant..."}
                                disabled={sending || loadingData}
                                className="w-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10 border border-slate-600 hover:border-slate-500 rounded-2xl pl-6 pr-16 py-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 transition-all text-[15px] shadow-inner font-medium"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || sending || loadingData}
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 text-white hover:bg-blue-500 w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:hover:bg-blue-600"
                            >
                                {sending ? (
                                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                                ) : (
                                    <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                )}
                            </button>
                        </form>
                        <p className="text-center text-xs text-slate-500 dark:text-gray-400 mt-3 font-medium">
                            AI may make mistakes. Verify important information securely from the dashboard.
                        </p>
                    </div>

                </div>

            </main>
        </div>
    )
}

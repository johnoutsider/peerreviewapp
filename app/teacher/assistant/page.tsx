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
                where('userId', '==', uid),
                orderBy('updatedAt', 'desc')
            )
            const snap = await getDocs(q)
            const sessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession))
            setChatSessions(sessions)
        } catch (error) {
            console.error('Error fetching chat sessions:', error)
            // Note: If index is missing, this might fail initially
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
            const newMessages = [...messages, aiReply]
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

            <main className="container mx-auto px-4 py-8 max-w-[1400px] flex-1 flex flex-col h-[calc(100vh-80px)]">
                <div className="mb-6 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="md:hidden text-gray-400 hover:text-white"
                            >
                                ☰
                            </button>
                            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                                🤖 AI Assistant
                            </h1>
                        </div>
                        <p className="text-gray-400 text-sm hidden md:block">Ask questions about student participation and review quality.</p>
                    </div>
                    {loadingData ? (
                        <div className="text-xs text-yellow-500 bg-yellow-500/10 px-3 py-1.5 rounded-full flex items-center gap-2 font-medium">
                            <div className="w-3 h-3 rounded-full border-2 border-yellow-500 border-t-transparent animate-spin"></div>
                            Syncing data...
                        </div>
                    ) : (
                        <div className="text-xs text-green-400 bg-green-400/10 px-3 py-1.5 rounded-full flex items-center gap-2 font-medium">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                            Data Synced
                        </div>
                    )}
                </div>

                <div className="flex-1 flex gap-6 overflow-hidden relative">
                    {/* Sidebar Area */}
                    <div className={`
                        absolute md:static top-0 left-0 h-full w-72 
                        bg-slate-900/95 md:bg-slate-900/50 backdrop-blur-md rounded-2xl z-20 transition-transform duration-300
                        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                        flex flex-col border border-white/5 shadow-xl md:shadow-none
                    `}>
                        <div className="p-4 border-b border-white/5">
                            <button
                                onClick={startNewChat}
                                className="w-full bg-white text-slate-900 hover:bg-gray-200 rounded-xl p-3 flex items-center justify-center gap-2 transition-colors font-semibold shadow-sm"
                            >
                                <span>+</span> New Chat
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-1 p-3">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">Recent Chats</div>
                            {chatSessions.length === 0 ? (
                                <div className="text-sm text-gray-500 pl-2 italic">No previous chats</div>
                            ) : (
                                chatSessions.map(session => (
                                    <button
                                        key={session.id}
                                        onClick={() => loadChat(session)}
                                        className={`w-full text-left p-3 rounded-lg text-sm transition-all truncate flex items-center gap-2 ${activeChatId === session.id
                                            ? 'bg-slate-800 text-white font-medium'
                                            : 'text-gray-400 hover:bg-slate-800/50 hover:text-gray-200'
                                            }`}
                                    >
                                        <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                        </svg>
                                        {session.title}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Chat Box */}
                    <div className="flex-1 bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[90%] md:max-w-[75%] rounded-3xl p-5 ${msg.role === 'user'
                                        ? 'bg-white text-slate-900 rounded-br-sm shadow-sm'
                                        : 'bg-slate-800 text-gray-100 rounded-bl-sm border border-white/5 shadow-sm'
                                        }`}>
                                        <div className="prose prose-invert max-w-none text-[15px] leading-relaxed">
                                            {msg.content.split('\n').map((line, i) => (
                                                <p key={i} className="mb-2 last:mb-0">{line}</p>
                                            ))}
                                        </div>
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
                        <div className="p-4 md:p-6 bg-slate-900/80 backdrop-blur-xl border-t border-white/5">
                            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative flex items-center">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={loadingData ? "Syncing data, please wait..." : "Message AI Assistant..."}
                                    disabled={sending || loadingData}
                                    className="w-full bg-slate-800 border border-white/10 rounded-full pl-6 pr-16 py-4 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 disabled:opacity-50 transition-all shadow-inner text-[15px]"
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || sending || loadingData}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white text-slate-900 hover:bg-gray-200 w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-white"
                                >
                                    {sending ? (
                                        <div className="w-4 h-4 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
                                    ) : (
                                        <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    )}
                                </button>
                            </form>
                            <p className="text-center text-xs text-gray-500 mt-3 hidden md:block">
                                AI Teaching Assistant can read essays and reviews but may occasionally output inaccurate answers.
                            </p>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    )
}

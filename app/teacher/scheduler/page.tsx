'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskType = 'reminders' | 'bulk-approve' | 'progress-reports' | 'export-csv'
type ScheduleType = 'once' | 'daily' | 'weekly'

interface ScheduledTask {
    id: string
    taskType: TaskType
    scheduleType: ScheduleType
    runAt: string          // ISO string
    recurringDay?: number
    recurringTime?: string
    status: 'scheduled' | 'running' | 'completed' | 'failed'
    config: Record<string, any>
    lastRunAt?: string
    lastResult?: Record<string, any>
    createdAt: string
}

interface Topic {
    id: string
    name: string
}

// ─── Task metadata ────────────────────────────────────────────────────────────

const TASK_META: Record<TaskType, { label: string; icon: string; color: string; desc: string }> = {
    'reminders': {
        label: 'Send Reminders',
        icon: '📬',
        color: 'blue',
        desc: 'Notify students who haven\'t submitted via Telegram & in-app',
    },
    'bulk-approve': {
        label: 'Bulk Approve / Reject',
        icon: '✅',
        color: 'green',
        desc: 'Approve or reject all AI-flagged essays pending your review',
    },
    'progress-reports': {
        label: 'Progress Reports',
        icon: '📊',
        color: 'purple',
        desc: 'Generate & send each student\'s progress summary',
    },
    'export-csv': {
        label: 'Export Scores CSV',
        icon: '📥',
        color: 'amber',
        desc: 'Compile all scores into a downloadable CSV file',
    },
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const STATUS_BADGE: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    running:   'bg-amber-100 text-amber-700 animate-pulse',
    completed: 'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}

function localIsoNow(offsetMinutes = 5) {
    const d = new Date(Date.now() + offsetMinutes * 60000)
    // Format as datetime-local value (YYYY-MM-DDTHH:MM)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
    const router = useRouter()

    // Auth
    const [authReady, setAuthReady] = useState(false)
    const [userId, setUserId] = useState('')

    // Data
    const [tasks, setTasks] = useState<ScheduledTask[]>([])
    const [topics, setTopics] = useState<Topic[]>([])
    const [exports, setExports] = useState<any[]>([])
    const [batchJobs, setBatchJobs] = useState<any[]>([])
    const [loadingTasks, setLoadingTasks] = useState(true)

    // UI
    const [activeForm, setActiveForm] = useState<TaskType | null>(null)
    const [saving, setSaving] = useState(false)
    const [runningId, setRunningId] = useState<string | null>(null)
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

    // Form state
    const [scheduleType, setScheduleType] = useState<ScheduleType>('once')
    const [runAt, setRunAt] = useState(localIsoNow())
    const [recurringTime, setRecurringTime] = useState('09:00')
    const [recurringDay, setRecurringDay] = useState(1)
    // Task-specific config
    const [selectedTopic, setSelectedTopic] = useState('')
    const [customMessage, setCustomMessage] = useState('')
    const [bulkAction, setBulkAction] = useState<'approve' | 'reject'>('approve')
    const [groupFilter, setGroupFilter] = useState('')

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // ── Auth check ────────────────────────────────────────────────────────────

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/auth/signin'); return }
            const { getUserProfile } = await import('@/lib/auth')
            const profile = await getUserProfile(user.uid)
            if (profile?.role !== 'teacher') { router.push('/dashboard'); return }
            setUserId(user.uid)
            setAuthReady(true)
        })
        return () => unsub()
    }, [router])

    // ── Load data ─────────────────────────────────────────────────────────────

    const loadTasks = useCallback(async () => {
        try {
            const res = await fetch('/api/scheduler/tasks')
            const data = await res.json()
            if (data.tasks) setTasks(data.tasks)
        } catch (e) {
            console.error('Failed to load tasks', e)
        } finally {
            setLoadingTasks(false)
        }
    }, [])

    const loadTopics = useCallback(async () => {
        const snap = await getDocs(query(collection(db, 'topics'), orderBy('createdAt', 'desc')))
        setTopics(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name })))
    }, [])

    const loadExports = useCallback(async () => {
        const snap = await getDocs(query(collection(db, 'schedulerExports'), orderBy('createdAt', 'desc')))
        setExports(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 10))
    }, [])

    const loadBatchJobs = useCallback(async () => {
        const snap = await getDocs(query(collection(db, 'batchJobs'), orderBy('submittedAt', 'desc')))
        setBatchJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 10))
    }, [])

    useEffect(() => {
        if (!authReady) return
        loadTasks()
        loadTopics()
        loadExports()
        loadBatchJobs()
    }, [authReady, loadTasks, loadTopics, loadExports, loadBatchJobs])

    // ── Poll every 30 s: trigger cron endpoint which runs due tasks ───────────

    const pollDueTasks = useCallback(async () => {
        try {
            const res = await fetch('/api/cron/scheduler')
            const data = await res.json()
            if (data.triggered > 0) {
                await loadTasks()
                await loadExports()
            }
            // Also trigger batch collection if there are in-progress batch jobs
            const hasPendingBatch = batchJobs.some((j: any) => j.status === 'in_progress')
            if (hasPendingBatch) {
                await fetch('/api/scheduler/collect-batch')
                await loadBatchJobs()
            }
        } catch (e) {
            // silent
        }
    }, [loadTasks, loadExports, loadBatchJobs, batchJobs])

    useEffect(() => {
        if (!authReady) return
        pollDueTasks()
        pollRef.current = setInterval(pollDueTasks, 30_000)
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [authReady, pollDueTasks])

    // ── Show toast ────────────────────────────────────────────────────────────

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok })
        setTimeout(() => setToast(null), 4000)
    }

    // ── Schedule a task ───────────────────────────────────────────────────────

    const handleSchedule = async () => {
        if (!activeForm) return
        setSaving(true)
        try {
            // Build config based on task type
            let config: Record<string, any> = {}
            if (activeForm === 'reminders') {
                if (!selectedTopic) { showToast('Please select a topic.', false); setSaving(false); return }
                const topic = topics.find(t => t.id === selectedTopic)
                config = { topicId: selectedTopic, topicName: topic?.name || '', customMessage }
            } else if (activeForm === 'bulk-approve') {
                config = { action: bulkAction }
            } else if (activeForm === 'progress-reports') {
                config = { groupFilter }
            } else if (activeForm === 'export-csv') {
                const topic = topics.find(t => t.id === selectedTopic)
                config = { topicFilter: selectedTopic || null, topicName: topic?.name || 'All Topics' }
            }

            // Compute first runAt
            let firstRunAt: string
            if (scheduleType === 'once') {
                firstRunAt = new Date(runAt).toISOString()
            } else {
                // daily/weekly: use today's date + recurringTime
                const [hh, mm] = recurringTime.split(':').map(Number)
                const d = new Date()
                d.setHours(hh, mm, 0, 0)
                if (scheduleType === 'weekly') {
                    const today = d.getDay()
                    let daysUntil = (recurringDay - today + 7) % 7
                    if (daysUntil === 0 && d <= new Date()) daysUntil = 7
                    d.setDate(d.getDate() + daysUntil)
                } else if (d <= new Date()) {
                    d.setDate(d.getDate() + 1)
                }
                firstRunAt = d.toISOString()
            }

            const res = await fetch('/api/scheduler/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskType: activeForm,
                    scheduleType,
                    runAt: firstRunAt,
                    recurringDay: scheduleType === 'weekly' ? recurringDay : null,
                    recurringTime: scheduleType !== 'once' ? recurringTime : null,
                    config,
                    createdBy: userId,
                }),
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to schedule task')

            showToast(`Task scheduled successfully! ✅`)
            setActiveForm(null)
            await loadTasks()
        } catch (e: any) {
            showToast(e.message || 'Failed to schedule task', false)
        } finally {
            setSaving(false)
        }
    }

    // ── Run a task immediately ────────────────────────────────────────────────

    const handleRunNow = async (taskId: string) => {
        setRunningId(taskId)
        try {
            const res = await fetch('/api/scheduler/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            showToast('Task executed successfully! ✅')
            await loadTasks()
            await loadExports()
        } catch (e: any) {
            showToast(e.message || 'Task failed', false)
        } finally {
            setRunningId(null)
        }
    }

    // ── Delete a task ─────────────────────────────────────────────────────────

    const handleDelete = async (taskId: string) => {
        if (!confirm('Delete this scheduled task?')) return
        await fetch(`/api/scheduler/tasks?id=${taskId}`, { method: 'DELETE' })
        setTasks(prev => prev.filter(t => t.id !== taskId))
    }

    // ── Download CSV ──────────────────────────────────────────────────────────

    const handleDownloadCsv = (exp: any) => {
        const blob = new Blob([exp.csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = exp.filename || 'scores.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    // ─────────────────────────────────────────────────────────────────────────

    if (!authReady) return (
        <TeacherLayout title="Task Scheduler">
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500" />
            </div>
        </TeacherLayout>
    )

    const scheduledTasks = tasks.filter(t => t.status === 'scheduled' || t.status === 'running')
    const historyTasks   = tasks.filter(t => t.status === 'completed'  || t.status === 'failed')

    return (
        <TeacherLayout title="Task Scheduler">

            {/* ── Toast ── */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-semibold transition-all ${toast.ok ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.msg}
                </div>
            )}

            <main className="container mx-auto px-4 py-8 max-w-5xl space-y-8">

                {/* ── Header ── */}
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">📅 Task Scheduler</h1>
                    <p className="text-slate-500 mt-1">Schedule repetitive classroom tasks to run automatically at any time.</p>
                </div>

                {/* ── 4 Task Cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(Object.keys(TASK_META) as TaskType[]).map(type => {
                        const meta = TASK_META[type]
                        const isActive = activeForm === type
                        const colorMap: Record<string, string> = {
                            blue:   'border-blue-400 bg-blue-50',
                            green:  'border-green-400 bg-green-50',
                            purple: 'border-purple-400 bg-purple-50',
                            amber:  'border-amber-400 bg-amber-50',
                        }
                        const btnMap: Record<string, string> = {
                            blue:   'bg-blue-500 hover:bg-blue-600',
                            green:  'bg-green-500 hover:bg-green-600',
                            purple: 'bg-purple-500 hover:bg-purple-600',
                            amber:  'bg-amber-500 hover:bg-amber-600',
                        }
                        return (
                            <div
                                key={type}
                                className={`rounded-xl border-2 p-5 transition-all ${isActive ? colorMap[meta.color] : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-2xl mb-1">{meta.icon}</div>
                                        <h3 className="font-bold text-slate-800">{meta.label}</h3>
                                        <p className="text-slate-500 text-xs mt-0.5">{meta.desc}</p>
                                    </div>
                                    <button
                                        onClick={() => setActiveForm(isActive ? null : type)}
                                        className={`shrink-0 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${btnMap[meta.color]}`}
                                    >
                                        {isActive ? 'Cancel' : 'Schedule'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* ── Scheduling Form (appears below selected card) ── */}
                {activeForm && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
                        <h2 className="font-bold text-slate-800 text-lg">
                            {TASK_META[activeForm].icon} Schedule: {TASK_META[activeForm].label}
                        </h2>

                        {/* Schedule Type */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Schedule Type</label>
                            <div className="flex gap-2">
                                {(['once', 'daily', 'weekly'] as ScheduleType[]).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setScheduleType(s)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${scheduleType === s ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Time picker */}
                        {scheduleType === 'once' && (
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Run At (date & time)</label>
                                <input
                                    type="datetime-local"
                                    value={runAt}
                                    onChange={e => setRunAt(e.target.value)}
                                    className="bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-teal-500"
                                />
                            </div>
                        )}

                        {(scheduleType === 'daily' || scheduleType === 'weekly') && (
                            <div className="flex flex-wrap gap-4">
                                {scheduleType === 'weekly' && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Day of Week</label>
                                        <select
                                            value={recurringDay}
                                            onChange={e => setRecurringDay(Number(e.target.value))}
                                            className="bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-teal-500"
                                        >
                                            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Time</label>
                                    <input
                                        type="time"
                                        value={recurringTime}
                                        onChange={e => setRecurringTime(e.target.value)}
                                        className="bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-teal-500"
                                    />
                                </div>
                            </div>
                        )}

                        <hr className="border-slate-100" />

                        {/* Task-specific config */}
                        {activeForm === 'reminders' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Topic <span className="text-red-400">*</span></label>
                                    <select
                                        value={selectedTopic}
                                        onChange={e => setSelectedTopic(e.target.value)}
                                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-teal-500"
                                    >
                                        <option value="">Select a topic…</option>
                                        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Custom Message (optional)</label>
                                    <textarea
                                        value={customMessage}
                                        onChange={e => setCustomMessage(e.target.value)}
                                        placeholder="Leave blank to use the default reminder message."
                                        rows={3}
                                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-teal-500 resize-none"
                                    />
                                </div>
                            </div>
                        )}

                        {activeForm === 'bulk-approve' && (
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Action</label>
                                <div className="flex gap-3">
                                    {(['approve', 'reject'] as const).map(a => (
                                        <button
                                            key={a}
                                            onClick={() => setBulkAction(a)}
                                            className={`px-5 py-2 rounded-lg text-sm font-semibold border transition-colors capitalize ${bulkAction === a
                                                ? a === 'approve' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                                                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                                            }`}
                                        >
                                            {a === 'approve' ? '✅ Approve All' : '❌ Reject All'}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-400 mt-2">
                                    This will process all essays currently in "pending teacher approval" status.
                                </p>
                            </div>
                        )}

                        {activeForm === 'progress-reports' && (
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Filter by Group (optional)</label>
                                <input
                                    type="text"
                                    value={groupFilter}
                                    onChange={e => setGroupFilter(e.target.value)}
                                    placeholder="e.g. Group A — leave blank for all students"
                                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-teal-500"
                                />
                            </div>
                        )}

                        {activeForm === 'export-csv' && (
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Filter by Topic (optional)</label>
                                <select
                                    value={selectedTopic}
                                    onChange={e => setSelectedTopic(e.target.value)}
                                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-teal-500"
                                >
                                    <option value="">All Topics</option>
                                    {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            onClick={handleSchedule}
                            disabled={saving}
                            className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            {saving ? (
                                <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Scheduling…</>
                            ) : (
                                `⏱ Schedule Task`
                            )}
                        </button>
                    </div>
                )}

                {/* ── Upcoming Tasks ── */}
                <section>
                    <h2 className="text-lg font-bold text-slate-800 mb-3">⏰ Upcoming & Running Tasks</h2>
                    {loadingTasks ? (
                        <div className="h-20 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500" />
                        </div>
                    ) : scheduledTasks.length === 0 ? (
                        <div className="bg-white border border-dashed border-slate-300 rounded-xl py-10 text-center text-slate-400 text-sm">
                            No upcoming tasks. Schedule one above! 👆
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Task</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Schedule</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Next Run</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Status</th>
                                        <th className="text-right px-4 py-3 text-slate-500 font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {scheduledTasks.map(task => {
                                        const meta = TASK_META[task.taskType]
                                        return (
                                            <tr key={task.id} className="hover:bg-slate-50/50">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{meta.icon}</span>
                                                        <div>
                                                            <div className="font-semibold text-slate-800">{meta.label}</div>
                                                            <div className="text-xs text-slate-400">{taskConfigSummary(task)}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 capitalize">{task.scheduleType}</td>
                                                <td className="px-4 py-3 text-slate-600">{fmtDate(task.runAt)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[task.status]}`}>
                                                        {task.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleRunNow(task.id)}
                                                            disabled={runningId === task.id}
                                                            className="text-teal-600 hover:text-teal-800 text-xs font-semibold border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
                                                        >
                                                            {runningId === task.id ? '⏳' : '▶ Run Now'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(task.id)}
                                                            className="text-red-400 hover:text-red-600 text-xs font-semibold border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* ── Batch Jobs Status ── */}
                {batchJobs.length > 0 && (
                    <section>
                        <h2 className="text-lg font-bold text-slate-800 mb-3">🤖 Progress Report Batches</h2>
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Submitted</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Students</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Status</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Completed</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Telegram Sent</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {batchJobs.map((job: any) => (
                                        <tr key={job.id} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-3 text-slate-600">
                                                {job.submittedAt?.toDate ? fmtDate(job.submittedAt.toDate().toISOString()) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{job.studentIds?.length ?? '—'}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                    job.status === 'completed'   ? 'bg-green-100 text-green-700' :
                                                    job.status === 'in_progress' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                                    job.status === 'failed' || job.status === 'expired' ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {job.status === 'in_progress' ? '⏳ processing…' : job.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {job.completedAt?.toDate ? fmtDate(job.completedAt.toDate().toISOString()) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{job.telegramSent ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                            Batches are processed by OpenAI within 24 hours. Reports and Telegram messages are sent automatically when complete.
                        </p>
                    </section>
                )}

                {/* ── CSV Downloads ── */}
                {exports.length > 0 && (
                    <section>
                        <h2 className="text-lg font-bold text-slate-800 mb-3">📥 Recent CSV Exports</h2>
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">File</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Rows</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Generated</th>
                                        <th className="text-right px-4 py-3 text-slate-500 font-semibold">Download</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {exports.map(exp => (
                                        <tr key={exp.id} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-3 font-medium text-slate-700">{exp.filename}</td>
                                            <td className="px-4 py-3 text-slate-500">{exp.rowCount} rows</td>
                                            <td className="px-4 py-3 text-slate-500">
                                                {exp.createdAt?.toDate ? fmtDate(exp.createdAt.toDate().toISOString()) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleDownloadCsv(exp)}
                                                    className="text-teal-600 hover:text-teal-800 font-semibold text-xs border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
                                                >
                                                    ⬇ Download
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* ── Task History ── */}
                {historyTasks.length > 0 && (
                    <section>
                        <h2 className="text-lg font-bold text-slate-800 mb-3">🕓 Task History</h2>
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Task</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Last Run</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Result</th>
                                        <th className="text-left px-4 py-3 text-slate-500 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {historyTasks.slice(0, 20).map(task => {
                                        const meta = TASK_META[task.taskType]
                                        return (
                                            <tr key={task.id} className="hover:bg-slate-50/50">
                                                <td className="px-4 py-3">
                                                    <span className="mr-1.5">{meta.icon}</span>
                                                    <span className="font-medium text-slate-700">{meta.label}</span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500">{fmtDate(task.lastRunAt)}</td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">
                                                    {task.lastResult ? formatResult(task.taskType, task.lastResult) : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[task.status]}`}>
                                                        {task.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

            </main>
        </TeacherLayout>
    )
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function taskConfigSummary(task: ScheduledTask): string {
    const c = task.config
    switch (task.taskType) {
        case 'reminders':        return c.topicName ? `Topic: ${c.topicName}` : 'All topics'
        case 'bulk-approve':     return c.action === 'approve' ? 'Approve all pending' : 'Reject all pending'
        case 'progress-reports': return c.groupFilter ? `Group: ${c.groupFilter}` : 'All students'
        case 'export-csv':       return c.topicName ? `Topic: ${c.topicName}` : 'All topics'
        default: return ''
    }
}

function formatResult(type: TaskType, result: Record<string, any>): string {
    switch (type) {
        case 'reminders':
            return `${result.studentsNotified ?? 0} notified, ${result.telegramSent ?? 0} via Telegram`
        case 'bulk-approve':
            return `${result.processed ?? 0} essays ${result.action === 'approve' ? 'approved' : 'rejected'}`
        case 'progress-reports':
            return `${result.reportsGenerated ?? 0} reports, ${result.telegramSent ?? 0} via Telegram`
        case 'export-csv':
            return `${result.rowCount ?? 0} rows exported`
        default: return JSON.stringify(result)
    }
}

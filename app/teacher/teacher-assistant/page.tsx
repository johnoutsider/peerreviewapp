'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import TeacherLayout from '@/components/TeacherLayout'
import { auth, db } from '@/lib/firebase'

type TaskType = 'reminders' | 'bulk-approve' | 'progress-reports' | 'export-csv'
type ScheduleType = 'once' | 'daily' | 'weekly'

type ScheduledTask = {
    id: string
    taskType: TaskType
    scheduleType: ScheduleType
    runAt: string | null
    recurringDay?: number | null
    recurringTime?: string | null
    status: 'scheduled' | 'running' | 'completed' | 'failed'
    config: Record<string, any>
    lastRunAt?: string | null
    lastResult?: Record<string, any> | null
    createdAt?: string | null
}

type ExportFile = {
    id: string
    filename: string
    rowCount: number
    csvContent: string
    createdAt?: string | null
}

type Topic = {
    id: string
    name: string
}

type StudentGroup = string

const TASK_META: Record<TaskType, { label: string; description: string }> = {
    reminders: {
        label: 'Send Reminders',
        description: 'Send Telegram reminders to students who still have not submitted for a topic.',
    },
    'bulk-approve': {
        label: 'Bulk Approve / Reject',
        description: 'Process all essays waiting for teacher approval.',
    },
    'progress-reports': {
        label: 'Progress Reports',
        description: 'Generate student progress summaries and notify them.',
    },
    'export-csv': {
        label: 'Export Scores CSV',
        description: 'Build a CSV export for topic scores and review data.',
    },
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function localDateTimeValue(minutesAhead = 5) {
    const date = new Date(Date.now() + minutesAhead * 60_000)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(value?: string | null) {
    if (!value) return '-'
    return new Date(value).toLocaleString()
}

function summarizeResult(task: ScheduledTask) {
    const result = task.lastResult
    if (!result) return '-'

    switch (task.taskType) {
        case 'reminders':
            return `${result.studentsNotified ?? 0} students notified, ${result.telegramSent ?? 0} Telegram sent`
        case 'bulk-approve':
            return `${result.processed ?? 0} essays processed`
        case 'progress-reports':
            return `${result.reportsGenerated ?? 0} reports generated`
        case 'export-csv':
            return `${result.rowCount ?? 0} rows exported`
        default:
            return '-'
    }
}

function taskSummary(task: ScheduledTask) {
    switch (task.taskType) {
        case 'reminders':
            return `Missing submission reminder for ${task.config.topicName || 'selected topic'} (${task.config.groupFilter || 'all groups'})`
        case 'bulk-approve':
            return task.config.action === 'reject' ? 'Reject all pending essays' : 'Approve all pending essays'
        case 'progress-reports':
            return task.config.groupFilter || 'All students'
        case 'export-csv':
            return task.config.topicName || 'All topics'
        default:
            return ''
    }
}

export default function TeacherAssistantPage() {
    const router = useRouter()
    const [ready, setReady] = useState(false)
    const [teacherId, setTeacherId] = useState('')
    const [tasks, setTasks] = useState<ScheduledTask[]>([])
    const [exportsList, setExportsList] = useState<ExportFile[]>([])
    const [topics, setTopics] = useState<Topic[]>([])
    const [availableGroups, setAvailableGroups] = useState<StudentGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
    const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)

    const [taskType, setTaskType] = useState<TaskType>('reminders')
    const [scheduleType, setScheduleType] = useState<ScheduleType>('once')
    const [runAt, setRunAt] = useState(localDateTimeValue())
    const [recurringDay, setRecurringDay] = useState(1)
    const [recurringTime, setRecurringTime] = useState('09:00')
    const [selectedTopic, setSelectedTopic] = useState('')
    const [customMessage, setCustomMessage] = useState('')
    const [bulkAction, setBulkAction] = useState<'approve' | 'reject'>('approve')
    const [groupFilter, setGroupFilter] = useState('')

    const showToast = useCallback((text: string, error = false) => {
        setToast({ text, error })
        setTimeout(() => setToast(null), 4000)
    }, [])

    const loadSchedulerData = useCallback(async () => {
        const res = await fetch('/api/scheduler/tasks', { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load scheduler data')
        setTasks(data.tasks || [])
        setExportsList(data.exports || [])
    }, [])

    const loadTopics = useCallback(async () => {
        const snap = await getDocs(query(collection(db, 'topics'), orderBy('createdAt', 'desc')))
        setTopics(snap.docs.map(doc => ({ id: doc.id, name: (doc.data() as any).name || 'Untitled Topic' })))
    }, [])

    const loadGroups = useCallback(async () => {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
        const groups = [...new Set(
            snap.docs
                .map(doc => {
                    const data = doc.data() as any
                    return data.groupName || data.classId || data.group || ''
                })
                .map(value => String(value).trim())
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b))
        setAvailableGroups(groups)
    }, [])

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async user => {
            if (!user) {
                router.push('/auth/signin')
                return
            }

            const { getUserProfile } = await import('@/lib/auth')
            const profile = await getUserProfile(user.uid)
            if (profile?.role !== 'teacher') {
                router.push('/dashboard')
                return
            }

            setTeacherId(user.uid)
            setReady(true)
        })

        return () => unsubscribe()
    }, [router])

    useEffect(() => {
        if (!ready) return
        ;(async () => {
            try {
                await Promise.all([loadSchedulerData(), loadTopics(), loadGroups()])
            } catch (error: any) {
                showToast(error.message || 'Failed to load scheduler', true)
            } finally {
                setLoading(false)
            }
        })()
    }, [ready, loadSchedulerData, loadTopics, loadGroups, showToast])

    useEffect(() => {
        if (!ready) return
        const interval = setInterval(async () => {
            try {
                await fetch('/api/cron/scheduler', { cache: 'no-store' })
                await loadSchedulerData()
            } catch {
                // ignore background poll errors
            }
        }, 30_000)

        return () => clearInterval(interval)
    }, [ready, loadSchedulerData])

    const activeTopicName = useMemo(() => topics.find(topic => topic.id === selectedTopic)?.name || '', [topics, selectedTopic])

    const upcomingTasks = tasks.filter(task => task.status === 'scheduled' || task.status === 'running')
    const historyTasks = tasks.filter(task => task.status === 'completed' || task.status === 'failed')

    const resetTaskFields = () => {
        setSelectedTopic('')
        setCustomMessage('')
        setBulkAction('approve')
        setGroupFilter('')
    }

    const handleTaskTypeChange = (nextType: TaskType) => {
        setTaskType(nextType)
        resetTaskFields()
    }

    const handleCreateTask = async () => {
        setSaving(true)
        try {
            const config: Record<string, any> = {}

            if (taskType === 'reminders') {
                if (!selectedTopic) throw new Error('Select a topic for reminders')
                config.topicId = selectedTopic
                config.topicName = activeTopicName
                config.customMessage = customMessage.trim()
                config.groupFilter = groupFilter.trim()
            }

            if (taskType === 'bulk-approve') {
                config.action = bulkAction
            }

            if (taskType === 'progress-reports' && groupFilter.trim()) {
                config.groupFilter = groupFilter.trim()
            }

            if (taskType === 'export-csv') {
                config.topicId = selectedTopic || null
                config.topicName = activeTopicName || 'All topics'
            }

            let normalizedRunAt = new Date(runAt).toISOString()
            if (scheduleType !== 'once') {
                const [hours, minutes] = recurringTime.split(':').map(Number)
                const next = new Date()
                next.setSeconds(0, 0)
                next.setHours(hours, minutes)

                if (scheduleType === 'daily') {
                    if (next <= new Date()) next.setDate(next.getDate() + 1)
                }

                if (scheduleType === 'weekly') {
                    let daysUntil = (recurringDay - next.getDay() + 7) % 7
                    if (daysUntil === 0 && next <= new Date()) daysUntil = 7
                    next.setDate(next.getDate() + daysUntil)
                }

                normalizedRunAt = next.toISOString()
            }

            const res = await fetch('/api/scheduler/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskType,
                    scheduleType,
                    runAt: normalizedRunAt,
                    recurringDay: scheduleType === 'weekly' ? recurringDay : null,
                    recurringTime: scheduleType === 'once' ? null : recurringTime,
                    config,
                    createdBy: teacherId,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to create task')

            await loadSchedulerData()
            showToast('Task scheduled successfully')
        } catch (error: any) {
            showToast(error.message || 'Failed to schedule task', true)
        } finally {
            setSaving(false)
        }
    }

    const handleRunNow = async (taskId: string) => {
        setRunningTaskId(taskId)
        try {
            const res = await fetch('/api/scheduler/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Task execution failed')
            await loadSchedulerData()
            showToast('Task executed successfully')
        } catch (error: any) {
            showToast(error.message || 'Task execution failed', true)
        } finally {
            setRunningTaskId(null)
        }
    }

    const handleDelete = async (taskId: string) => {
        if (!confirm('Delete this scheduled task?')) return
        try {
            const res = await fetch(`/api/scheduler/tasks?id=${taskId}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Delete failed')
            setTasks(prev => prev.filter(task => task.id !== taskId))
            showToast('Task deleted')
        } catch (error: any) {
            showToast(error.message || 'Delete failed', true)
        }
    }

    const handleDownload = (file: ExportFile) => {
        const blob = new Blob([file.csvContent], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.filename
        link.click()
        URL.revokeObjectURL(url)
    }

    if (!ready || loading) {
        return (
            <TeacherLayout title="Teacher Assistant">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500" />
                </div>
            </TeacherLayout>
        )
    }

    return (
        <TeacherLayout title="Teacher Assistant">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.error ? 'bg-red-500' : 'bg-emerald-500'}`}>
                    {toast.text}
                </div>
            )}

            <div className="max-w-6xl mx-auto p-6 space-y-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Teacher Assistant</h1>
                    <p className="mt-1 text-sm text-slate-500">Manage scheduled classroom tasks from a dedicated teacher assistant page.</p>
                </div>

                <section className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Create Task</h2>
                            <p className="text-sm text-slate-500">Pick a task type, schedule, and configuration.</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {(Object.keys(TASK_META) as TaskType[]).map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => handleTaskTypeChange(type)}
                                    className={`rounded-xl border p-4 text-left transition ${taskType === type ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'}`}
                                >
                                    <div className="font-semibold text-slate-900">{TASK_META[type].label}</div>
                                    <div className="mt-1 text-sm text-slate-500">{TASK_META[type].description}</div>
                                </button>
                            ))}
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Schedule Type</span>
                                <select value={scheduleType} onChange={event => setScheduleType(event.target.value as ScheduleType)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                                    <option value="once">Once</option>
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                </select>
                            </label>

                            {scheduleType === 'once' ? (
                                <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                                    <span>Run At</span>
                                    <input type="datetime-local" value={runAt} onChange={event => setRunAt(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                </label>
                            ) : (
                                <>
                                    {scheduleType === 'weekly' && (
                                        <label className="space-y-2 text-sm font-medium text-slate-700">
                                            <span>Day</span>
                                            <select value={recurringDay} onChange={event => setRecurringDay(Number(event.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                                                {DAYS.map((day, index) => (
                                                    <option key={day} value={index}>{day}</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                    <label className="space-y-2 text-sm font-medium text-slate-700">
                                        <span>Time</span>
                                        <input type="time" value={recurringTime} onChange={event => setRecurringTime(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                                    </label>
                                </>
                            )}
                        </div>

                        {taskType === 'reminders' && (
                            <div className="grid gap-4">
                                <label className="space-y-2 text-sm font-medium text-slate-700">
                                    <span>Topic</span>
                                    <select value={selectedTopic} onChange={event => setSelectedTopic(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                                        <option value="">Select a topic</option>
                                        {topics.map(topic => (
                                            <option key={topic.id} value={topic.id}>{topic.name}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-2 text-sm font-medium text-slate-700">
                                    <span>Group</span>
                                    <select value={groupFilter} onChange={event => setGroupFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                                        <option value="">All groups</option>
                                        {availableGroups.map(group => (
                                            <option key={group} value={group}>{group}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-2 text-sm font-medium text-slate-700">
                                    <span>Custom Message</span>
                                    <textarea value={customMessage} onChange={event => setCustomMessage(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Optional reminder message" />
                                </label>
                                <p className="text-xs text-slate-500">
                                    At the scheduled time, the app checks the selected topic and selected group. If you leave the group as All groups, it reminds every student who still does not have a submitted essay. Telegram messages are sent when the student has linked their bot chat.
                                </p>
                            </div>
                        )}

                        {taskType === 'bulk-approve' && (
                            <div className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Action</span>
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => setBulkAction('approve')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${bulkAction === 'approve' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                                        Approve All
                                    </button>
                                    <button type="button" onClick={() => setBulkAction('reject')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${bulkAction === 'reject' ? 'bg-red-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                                        Reject All
                                    </button>
                                </div>
                            </div>
                        )}

                        {taskType === 'progress-reports' && (
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Group Filter</span>
                                <input value={groupFilter} onChange={event => setGroupFilter(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Optional group name or class ID" />
                            </label>
                        )}

                        {taskType === 'export-csv' && (
                            <label className="space-y-2 text-sm font-medium text-slate-700">
                                <span>Topic Filter</span>
                                <select value={selectedTopic} onChange={event => setSelectedTopic(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                                    <option value="">All topics</option>
                                    {topics.map(topic => (
                                        <option key={topic.id} value={topic.id}>{topic.name}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <button type="button" disabled={saving} onClick={handleCreateTask} className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-60">
                            {saving ? 'Scheduling...' : 'Schedule Task'}
                        </button>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-semibold text-slate-900">Recent CSV Exports</h2>
                        {exportsList.length === 0 ? (
                            <p className="text-sm text-slate-500">No exports yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {exportsList.map(file => (
                                    <div key={file.id} className="rounded-xl border border-slate-200 p-4">
                                        <div className="font-medium text-slate-900">{file.filename}</div>
                                        <div className="mt-1 text-xs text-slate-500">{file.rowCount} rows • {formatDate(file.createdAt)}</div>
                                        <button type="button" onClick={() => handleDownload(file)} className="mt-3 rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                                            Download CSV
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">Upcoming Tasks</h2>
                        <p className="text-sm text-slate-500">Scheduled and currently running tasks.</p>
                    </div>
                    {upcomingTasks.length === 0 ? (
                        <p className="text-sm text-slate-500">No upcoming tasks.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-slate-500">
                                        <th className="px-3 py-2">Task</th>
                                        <th className="px-3 py-2">Summary</th>
                                        <th className="px-3 py-2">Next Run</th>
                                        <th className="px-3 py-2">Status</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {upcomingTasks.map(task => (
                                        <tr key={task.id} className="border-b border-slate-100">
                                            <td className="px-3 py-3 font-medium text-slate-900">{TASK_META[task.taskType].label}</td>
                                            <td className="px-3 py-3 text-slate-600">{taskSummary(task)}</td>
                                            <td className="px-3 py-3 text-slate-600">{formatDate(task.runAt)}</td>
                                            <td className="px-3 py-3">
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${task.status === 'running' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {task.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button type="button" onClick={() => handleRunNow(task.id)} disabled={runningTaskId === task.id} className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60">
                                                        {runningTaskId === task.id ? 'Running...' : 'Run Now'}
                                                    </button>
                                                    <button type="button" onClick={() => handleDelete(task.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">Task History</h2>
                        <p className="text-sm text-slate-500">Completed and failed runs.</p>
                    </div>
                    {historyTasks.length === 0 ? (
                        <p className="text-sm text-slate-500">No history yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-slate-500">
                                        <th className="px-3 py-2">Task</th>
                                        <th className="px-3 py-2">Last Run</th>
                                        <th className="px-3 py-2">Result</th>
                                        <th className="px-3 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyTasks.map(task => (
                                        <tr key={task.id} className="border-b border-slate-100">
                                            <td className="px-3 py-3 font-medium text-slate-900">{TASK_META[task.taskType].label}</td>
                                            <td className="px-3 py-3 text-slate-600">{formatDate(task.lastRunAt)}</td>
                                            <td className="px-3 py-3 text-slate-600">{summarizeResult(task)}</td>
                                            <td className="px-3 py-3">
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${task.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {task.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </TeacherLayout>
    )
}



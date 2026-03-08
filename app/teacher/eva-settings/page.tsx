'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/firebase'
import {
    collection, getDocs, query, where,
    doc, getDoc, setDoc
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import TeacherLayout from '@/components/TeacherLayout'
import Alert from '@/components/Alert'

// ─── Default prompt (mirrors the API fallback) ────────────────────────────────
const DEFAULT_SYSTEM_PROMPT = `You are EVA (Essay Virtual Assistant), an expert IELTS writing coach helping students improve their Task 2 essays.

Your role is to give clear, structured, and encouraging feedback. Always respond in this exact format:

**📊 Quick Score Estimate**
Give a brief IELTS band estimate (e.g. Band 5.5–6.0) with one sentence of justification.

**✅ What's Working**
List 2–3 specific strengths in the current essay. Be precise — reference actual sentences or phrases from their essay.

**⚠️ Key Areas to Improve**
List the 3 most important issues to fix, in priority order. For each one:
- Name the issue (e.g. "Weak topic sentence in paragraph 2")
- Quote the problematic part
- Explain why it's a problem
- Give a concrete suggestion or rewrite example

**🎯 One Priority Action**
Give ONE clear, specific thing the student should do next before their next check.

**💬 Encouragement**
End with a short, genuine motivating sentence.

Rules:
- Never rewrite the whole essay for the student
- Keep feedback focused and actionable
- If previous feedback was provided, acknowledge what improved and focus on new issues
- Use British English spelling
- Keep your total response under 400 words`

type Tab = 'access' | 'prompt'

export default function EvaSettings() {
    const router = useRouter()
    const [tab, setTab] = useState<Tab>('access')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // ── Access control state ──────────────────────────────────────────────────
    const [groups, setGroups] = useState<string[]>([])
    const [allowedGroups, setAllowedGroups] = useState<Set<string>>(new Set())

    // ── System prompt state ───────────────────────────────────────────────────
    const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
    const [savedPrompt, setSavedPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
    const [promptDirty, setPromptDirty] = useState(false)

    // ─────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/'); return }
            try {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)
                if (profile?.role !== 'teacher') { router.push('/dashboard'); return }

                const [usersSnap, evaDoc] = await Promise.all([
                    getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
                    getDoc(doc(db, 'settings', 'eva')),
                ])

                const allGroups = [...new Set(
                    usersSnap.docs.map(d => (d.data().groupName as string || '')).filter(Boolean)
                )].sort()
                setGroups(allGroups)

                if (evaDoc.exists()) {
                    const data = evaDoc.data()
                    setAllowedGroups(new Set<string>(data.allowedGroups || []))
                    if (data.systemPrompt?.trim()) {
                        setSystemPrompt(data.systemPrompt)
                        setSavedPrompt(data.systemPrompt)
                    }
                }
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        })
        return () => unsub()
    }, [router])

    // ── Access control helpers ────────────────────────────────────────────────
    const toggle = (group: string) => {
        setAllowedGroups(prev => {
            const next = new Set(prev)
            if (next.has(group)) next.delete(group); else next.add(group)
            return next
        })
    }
    const enableAll = () => setAllowedGroups(new Set(groups))
    const disableAll = () => setAllowedGroups(new Set())

    // ── Save access control ───────────────────────────────────────────────────
    const saveAccess = async () => {
        setSaving(true); setError(null)
        try {
            const evaDoc = await getDoc(doc(db, 'settings', 'eva'))
            const existing = evaDoc.exists() ? evaDoc.data() : {}
            await setDoc(doc(db, 'settings', 'eva'), {
                ...existing,
                allowedGroups: [...allowedGroups],
                updatedAt: new Date().toISOString(),
            })
            setSuccess('Access settings saved!')
            setTimeout(() => setSuccess(null), 3000)
        } catch {
            setError('Failed to save settings.')
        } finally {
            setSaving(false)
        }
    }

    // ── Save prompt ───────────────────────────────────────────────────────────
    const savePrompt = async () => {
        setSaving(true); setError(null)
        try {
            const evaDoc = await getDoc(doc(db, 'settings', 'eva'))
            const existing = evaDoc.exists() ? evaDoc.data() : {}
            await setDoc(doc(db, 'settings', 'eva'), {
                ...existing,
                systemPrompt: systemPrompt.trim(),
                promptUpdatedAt: new Date().toISOString(),
            })
            setSavedPrompt(systemPrompt.trim())
            setPromptDirty(false)
            setSuccess('System prompt saved! EVA will use this prompt immediately.')
            setTimeout(() => setSuccess(null), 4000)
        } catch {
            setError('Failed to save prompt.')
        } finally {
            setSaving(false)
        }
    }

    const resetToDefault = () => {
        setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
        setPromptDirty(DEFAULT_SYSTEM_PROMPT !== savedPrompt)
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500" />
        </div>
    )

    return (
        <TeacherLayout title="EVA Settings">
            <div className="p-6 max-w-4xl mx-auto">

                {/* Header */}
                <div className="mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center font-extrabold text-white text-xs shrink-0">
                        EVA
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 leading-tight">EVA Settings</h1>
                        <p className="text-slate-400 text-sm">Configure access and customise EVA's behaviour</p>
                    </div>
                </div>

                {success && <Alert type="success" message={success} />}
                {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6 w-fit">
                    {([
                        { id: 'access', label: '👥 Access Control' },
                        { id: 'prompt', label: '🧠 System Prompt' },
                    ] as { id: Tab; label: string }[]).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                                tab === t.id
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {t.label}
                            {t.id === 'prompt' && promptDirty && (
                                <span className="ml-2 w-2 h-2 rounded-full bg-amber-400 inline-block" />
                            )}
                        </button>
                    ))}
                </div>

                {/* ── TAB: Access Control ── */}
                {tab === 'access' && (
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                            <div>
                                <span className="text-slate-700 font-semibold text-sm">Student Groups</span>
                                <span className="ml-2 text-slate-400 text-xs">{allowedGroups.size} / {groups.length} enabled</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={enableAll} className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 font-medium transition-colors">
                                    Enable All
                                </button>
                                <button onClick={disableAll} className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 font-medium transition-colors">
                                    Disable All
                                </button>
                            </div>
                        </div>

                        {groups.length === 0 ? (
                            <div className="px-6 py-12 text-center text-slate-400">
                                <div className="text-4xl mb-3">👥</div>
                                <p className="text-sm">No student groups found.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-50">
                                {groups.map(group => {
                                    const enabled = allowedGroups.has(group)
                                    return (
                                        <li key={group} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${enabled ? 'bg-green-500' : 'bg-slate-300'}`} />
                                                <span className="text-slate-800 font-semibold text-sm">{group}</span>
                                                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${enabled ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                                    {enabled ? 'EVA Enabled' : 'No Access'}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => toggle(group)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-teal-500' : 'bg-slate-200'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}

                        <div className="px-5 py-4 border-t border-slate-100 flex justify-end">
                            <button onClick={saveAccess} disabled={saving}
                                className="bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm">
                                {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</> : '💾 Save Settings'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── TAB: System Prompt ── */}
                {tab === 'prompt' && (
                    <div className="space-y-4">

                        {/* Info banner */}
                        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex gap-3">
                            <div className="text-blue-400 text-lg shrink-0">💡</div>
                            <div>
                                <p className="text-sm font-semibold text-blue-800 mb-0.5">How this works</p>
                                <p className="text-xs text-blue-600 leading-relaxed">
                                    This is the exact instruction EVA receives before reading any student essay. Edit it to change how EVA gives feedback — its tone, structure, scoring criteria, language focus, or anything else. Changes take effect immediately for all new checks.
                                </p>
                            </div>
                        </div>

                        {/* Prompt editor card */}
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">

                            {/* Card header */}
                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-700 font-semibold text-sm">EVA System Prompt</span>
                                    {promptDirty ? (
                                        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Unsaved changes</span>
                                    ) : (
                                        <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full font-medium">✓ Saved</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">{systemPrompt.length} chars · {systemPrompt.trim().split(/\s+/).length} words</span>
                                    <button
                                        onClick={resetToDefault}
                                        className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                                    >
                                        ↺ Reset to default
                                    </button>
                                </div>
                            </div>

                            {/* Textarea */}
                            <div className="p-4">
                                <textarea
                                    value={systemPrompt}
                                    onChange={e => {
                                        setSystemPrompt(e.target.value)
                                        setPromptDirty(e.target.value.trim() !== savedPrompt.trim())
                                    }}
                                    rows={24}
                                    spellCheck={false}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-mono leading-relaxed focus:outline-none focus:border-teal-400 focus:bg-white transition-colors resize-y"
                                    placeholder="Enter EVA's system prompt here…"
                                />
                            </div>

                            {/* Quick-insert chips */}
                            <div className="px-4 pb-4">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Quick insert</p>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { label: 'IELTS Band Scale',    text: '\n\nUse the official IELTS 0–9 band scale. Reference Task Achievement, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.' },
                                        { label: 'Be Strict',           text: '\n\nBe strict and critical. Do not inflate band scores. Point out every major weakness clearly.' },
                                        { label: 'Be Encouraging',      text: '\n\nAlways be warm, positive, and encouraging. Focus on progress and potential, not just problems.' },
                                        { label: 'Uzbek Learner',       text: '\n\nThese students are Uzbek learners of English. Be aware of common errors made by Uzbek speakers such as article misuse, preposition errors, and subject-verb agreement.' },
                                        { label: 'No Score',            text: '\n\nDo NOT give a band score estimate. Focus only on qualitative feedback.' },
                                        { label: 'Short Feedback',      text: '\n\nKeep your entire response under 200 words. Be concise and prioritise the single most important point.' },
                                    ].map(chip => (
                                        <button
                                            key={chip.label}
                                            onClick={() => {
                                                setSystemPrompt(p => p + chip.text)
                                                setPromptDirty(true)
                                            }}
                                            className="text-xs bg-slate-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-full transition-colors font-medium"
                                        >
                                            + {chip.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Save button */}
                            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                                <p className="text-xs text-slate-400">
                                    Saved prompts are stored in Firestore and used immediately by EVA for all new essay checks.
                                </p>
                                <button
                                    onClick={savePrompt}
                                    disabled={saving || !promptDirty}
                                    className="bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2 text-sm shrink-0"
                                >
                                    {saving
                                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                                        : '💾 Save Prompt'
                                    }
                                </button>
                            </div>
                        </div>

                        {/* Preview section */}
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-slate-100">
                                <span className="text-slate-700 font-semibold text-sm">👁 Prompt Preview</span>
                                <span className="ml-2 text-slate-400 text-xs">Exactly as EVA will receive it</span>
                            </div>
                            <div className="px-5 py-4 bg-slate-50">
                                <div className="flex items-start gap-3 mb-3">
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400 bg-slate-200 px-2 py-0.5 rounded mt-0.5">system</span>
                                    <div className="text-xs text-slate-500 font-mono leading-relaxed whitespace-pre-wrap break-words flex-1 max-h-48 overflow-y-auto">
                                        {systemPrompt || '(empty)'}
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-xs font-bold uppercase tracking-widest text-teal-500 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded mt-0.5">user</span>
                                    <div className="text-xs text-slate-400 font-mono italic">
                                        Please review this essay: [student's essay text here]
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                )}

                <p className="text-xs text-slate-400 text-center mt-6">
                    Changes take effect immediately for all new essay checks.
                </p>
            </div>
        </TeacherLayout>
    )
}

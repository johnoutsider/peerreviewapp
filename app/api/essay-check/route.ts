import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { adminDb } from '@/lib/firebase-admin'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Default system prompt — used if teacher has not saved a custom one yet
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

export async function POST(req: NextRequest) {
    try {
        const { essay_content, previous_feedback } = await req.json()

        if (!essay_content?.trim()) {
            return NextResponse.json({ error: 'Essay content is required.' }, { status: 400 })
        }

        // Fetch custom system prompt from Firestore (falls back to default)
        let systemPrompt = DEFAULT_SYSTEM_PROMPT
        try {
            const evaDoc = await adminDb.collection('settings').doc('eva').get()
            if (evaDoc.exists) {
                const data = evaDoc.data()
                if (data?.systemPrompt?.trim()) {
                    systemPrompt = data.systemPrompt.trim()
                }
            }
        } catch (e) {
            console.warn('Could not fetch EVA prompt from Firestore, using default:', e)
        }

        // Build context-aware user message including prior EVA feedback
        let userMessage = `Please review this essay:\n\n${essay_content}`
        if (Array.isArray(previous_feedback) && previous_feedback.length > 0) {
            const historyBlock = previous_feedback
                .map((fb: string, i: number) => `[EVA Feedback #${i + 1}]\n${fb}`)
                .join('\n\n---\n\n')
            userMessage =
                `Please review this revised essay and give progressive feedback based on your previous advice:\n\n` +
                `${essay_content}\n\n` +
                `=== Your Previous Feedback (reference this to highlight what improved) ===\n\n` +
                historyBlock
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            max_tokens: 800,
            temperature: 0.7,
        })

        const text = response.choices[0]?.message?.content ?? ''
        return NextResponse.json({ result: text })

    } catch (err: any) {
        console.error('Essay check error:', err)
        return NextResponse.json(
            { error: err?.message || 'AI check failed. Please try again.' },
            { status: 500 }
        )
    }
}

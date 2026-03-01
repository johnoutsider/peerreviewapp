import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PROMPT_ID = 'pmpt_69a1bc5e243081909ee8b62b295b28fb0d3a1c5963939838'
const PROMPT_VERSION = '8'

export async function POST(req: NextRequest) {
    try {
        const { essay_content, previous_feedback } = await req.json()

        if (!essay_content?.trim()) {
            return NextResponse.json({ error: 'Essay content is required.' }, { status: 400 })
        }

        // Build context-aware content: include prior EVA feedback so the AI
        // can give progressive, referenced advice on what changed.
        let contextualContent = essay_content
        if (Array.isArray(previous_feedback) && previous_feedback.length > 0) {
            const historyBlock = previous_feedback
                .map((fb: string, i: number) => `[EVA Feedback #${i + 1}]\n${fb}`)
                .join('\n\n---\n\n')
            contextualContent =
                `${essay_content}\n\n` +
                `=== EVA\'s Previous Feedback (use this as context to give progressive advice) ===\n\n` +
                historyBlock
        }

        const response = await (openai as any).responses.create({
            prompt: {
                id: PROMPT_ID,
                version: PROMPT_VERSION,
                variables: { essay_content: contextualContent },
            },
        })

        // The response text lives in output_text (Responses API)
        const text: string =
            response.output_text ??
            response.choices?.[0]?.message?.content ??
            ''

        return NextResponse.json({ result: text })
    } catch (err: any) {
        console.error('Essay check error:', err)
        return NextResponse.json(
            { error: err?.message || 'AI check failed. Please try again.' },
            { status: 500 }
        )
    }
}

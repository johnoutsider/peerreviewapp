import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
    try {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
        }

        const { student_comment } = await req.json()

        if (!student_comment?.trim()) {
            return NextResponse.json({ error: 'Feedback text is required.' }, { status: 400 })
        }

        const openai = new OpenAI({ apiKey })

        const response = await openai.responses.create({
            prompt: {
                id: 'pmpt_69bd2c3a50dc8193aeb7bba412ab5bfd01046d2b28d33f9e',
                version: '4',
                variables: {
                    student_comment: student_comment,
                },
            },
        } as any)

        // Extract text from the response
        const text = typeof response === 'object' && 'output_text' in response
            ? (response as any).output_text
            : typeof response === 'string'
                ? response
                : JSON.stringify(response)

        return NextResponse.json({ result: text })
    } catch (err: any) {
        console.error('EVA feedback check error:', err)
        return NextResponse.json(
            { error: err?.message || 'EVA check failed. Please try again.' },
            { status: 500 }
        )
    }
}

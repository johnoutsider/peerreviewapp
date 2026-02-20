import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function GET() {
    try {
        const apiKey = process.env.OPENAI_API_KEY

        if (!apiKey) {
            return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
        }

        const openai = new OpenAI({ apiKey })

        const completion = await openai.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [{ role: 'user', content: 'Say hello in one word' }],
        })

        return NextResponse.json({
            success: true,
            response: completion.choices[0]?.message?.content,
        })
    } catch (error: any) {
        return NextResponse.json({
            error: error.message,
            name: error.name,
        }, { status: 500 })
    }
}

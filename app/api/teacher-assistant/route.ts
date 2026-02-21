import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            console.error('OPENAI_API_KEY is not set')
            return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
        }

        const body = await request.json()
        const { query, classData, currentDate } = body

        if (!query || !classData) {
            return NextResponse.json({ error: 'Missing query or class data' }, { status: 400 })
        }

        const openai = new OpenAI({ apiKey })

        // 1. We construct a system prompt giving the AI its persona and constraints.
        const systemPrompt = `You are an expert AI Teaching Assistant for an essay-writing class. 
Your primary job is to help the teacher monitor student participation, find out who hasn't submitted work, and evaluate the quality of peer reviews given by students. 
You will be provided with a JSON string containing the current snapshot of the class: 
- Students (users)
- Essays submitted
- Peer Reviews given by students (including the written feedback and scores)

TODAY'S DATE: ${currentDate || new Date().toISOString()}

When the teacher asks a question, carefully analyze the JSON data provided below. 
- Identify students who are falling behind (no essays, no reviews).
- Identify students giving poor reviews (e.g., reviews under 10 words, reviews with no constructive feedback, reviews consisting only of praise).
- Answer the teacher's query accurately using ONLY the provided data.
- NEVER display raw database IDs (e.g., student UIDs, essay IDs, review IDs). Always refer to students by their names only.
- If you don't know the answer based on the data, say so.
- Keep your answers concise, professional, and directly actionable for the teacher.

CLASS DATA SNAPSHOT:
${JSON.stringify(classData, null, 2)}`

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            temperature: 0.3, // Low temperature for factual analysis of the JSON data
        })

        const reply = completion.choices[0]?.message?.content || 'I could not generate an answer.'

        return NextResponse.json({ success: true, reply })
    } catch (error: any) {
        console.error('Teacher Assistant API Error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to process assistant query.' },
            { status: 500 }
        )
    }
}

import { NextRequest, NextResponse } from 'next/server'
import { assessEssay } from '@/lib/openai'

export async function POST(request: NextRequest) {
    try {
        console.log('=== AI ASSESS ESSAY API CALLED ===')
        const body = await request.json()
        console.log('Request body keys:', Object.keys(body))
        const { essayTitle, essayContent } = body

        if (!essayTitle || !essayContent) {
            console.log('Missing data - title:', !!essayTitle, 'content:', !!essayContent)
            return NextResponse.json(
                { error: 'Missing essay title or content' },
                { status: 400 }
            )
        }

        console.log('Calling Gemini with title:', essayTitle.substring(0, 30))
        console.log('API Key exists:', !!process.env.GOOGLE_GEMINI_API_KEY)

        // Call Gemini AI to assess the essay
        const assessment = await assessEssay(essayTitle, essayContent)

        console.log('Assessment received successfully')

        // Return the assessment to the client
        return NextResponse.json({
            success: true,
            assessment,
        })
    } catch (error: any) {
        console.error('=== AI ASSESS ERROR ===')
        console.error('Error name:', error?.name)
        console.error('Error message:', error?.message)
        console.error('Full error:', error)
        return NextResponse.json(
            { error: 'Failed to assess essay. Please try again.' },
            { status: 500 }
        )
    }
}

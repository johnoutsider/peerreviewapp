import { GoogleGenerativeAI } from '@google/generative-ai'

export interface EssayAssessment {
    scores: {
        taskAchievement: number
        coherenceCohesion: number
        lexicalResource: number
        grammaticalRange: number
    }
    feedback: string
    overallBand: number
}

export async function assessEssay(essayTitle: string, essayContent: string): Promise<EssayAssessment> {
    try {
        // Check if API key exists
        const apiKey = process.env.GOOGLE_GEMINI_API_KEY
        if (!apiKey) {
            console.error('GOOGLE_GEMINI_API_KEY is not set')
            throw new Error('AI service not configured')
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

        const prompt = `You are an experienced IELTS Writing Task 2 examiner. Assess the following essay based on the official IELTS band descriptors and provide CLEAR, SPECIFIC, and ACTIONABLE feedback.

Essay Title: ${essayTitle}

Essay Content:
${essayContent}

Provide a comprehensive assessment with:
1. Task Achievement score (0-9, use 0.5 increments)
2. Coherence and Cohesion score (0-9, use 0.5 increments)
3. Lexical Resource score (0-9, use 0.5 increments)
4. Grammatical Range and Accuracy score (0-9, use 0.5 increments)
5. Overall band score (average of the four scores, rounded to nearest 0.5)
6. CLEAR and DETAILED feedback

Your feedback MUST follow this structure:

**STRENGTHS:**
- List 2-3 specific things the student did well (mention exact phrases or techniques from the essay)

**TASK ACHIEVEMENT:**
- Explain how well the essay addresses the prompt
- Mention if ideas are well-developed and supported

**COHERENCE & COHESION:**
- Comment on paragraph structure and logical flow
- Note use of linking words and cohesive devices

**VOCABULARY (Lexical Resource):**
- Highlight good vocabulary choices (quote examples)
- Point out any repetition or inappropriate word choices

**GRAMMAR:**
- Note range of sentence structures used
- Identify any recurring grammatical errors (give specific examples)

**KEY AREAS FOR IMPROVEMENT:**
- List 3-4 concrete, actionable suggestions
- Be specific: "Instead of X, try Y" or "Add more examples in paragraph 2"

Format your response as JSON with this exact structure:
{
    "taskAchievement": <score>,
    "coherenceCohesion": <score>,
    "lexicalResource": <score>,
    "grammaticalRange": <score>,
    "overallBand": <score>,
    "feedback": "<your detailed feedback following the structure above, 300-400 words>"
}

Be encouraging but honest. Quote specific examples from the essay to support your feedback.`

        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        // Extract JSON from response (handle markdown code blocks)
        let jsonText = text.trim()
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '')
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '')
        }

        const assessment = JSON.parse(jsonText)

        return {
            scores: {
                taskAchievement: assessment.taskAchievement,
                coherenceCohesion: assessment.coherenceCohesion,
                lexicalResource: assessment.lexicalResource,
                grammaticalRange: assessment.grammaticalRange,
            },
            feedback: assessment.feedback,
            overallBand: assessment.overallBand,
        }
    } catch (error) {
        console.error('Error assessing essay with Gemini:', error)
        throw new Error('Failed to assess essay. Please try again later.')
    }
}

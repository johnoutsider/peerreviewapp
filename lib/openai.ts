import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'

// Use require to avoid TS "no default export" error for pdf-parse
const pdfParse = require('pdf-parse')

let cachedRubricText: string | null = null

async function getRubricText(): Promise<string> {
  if (cachedRubricText) return cachedRubricText

  try {
    const rubricPath = path.join(process.cwd(), 'public', 'rubric.pdf')
    const dataBuffer = fs.readFileSync(rubricPath)
    const data = await pdfParse(dataBuffer)
    cachedRubricText = data.text
    return cachedRubricText || ''
  } catch (error) {
    console.error('Failed to read and parse rubric.pdf:', error)
    return ''
  }
}

export interface DimensionDescriptor {
  band: number
  text: string
}

export interface DimensionAssessment {
  band: number
  good: string
  focus: string
  descriptors: DimensionDescriptor[]
}

export interface EssayAssessment {
  scores: {
    taskAchievement: number
    coherenceCohesion: number
    lexicalResource: number
    grammaticalRange: number
  }
  feedback: string
  overallBand: number
  dimensions: {
    task_response: DimensionAssessment
    coherence_cohesion: DimensionAssessment
    lexical_resource: DimensionAssessment
    grammatical_range_accuracy: DimensionAssessment
  }
  topActions: string[]
}

export async function assessEssay(essayTitle: string, essayContent: string): Promise<EssayAssessment> {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not set')
      throw new Error('AI service not configured')
    }

    const openai = new OpenAI({ apiKey })
    const rubricText = await getRubricText()

    const prompt = `You are an expert Writing examiner simulator trained to assess essays.
You MUST strictly evaluate writing across the FOUR OFFICIAL DIMENSIONS defined in the provided official rubric text.

------------------------------------------------------------
OFFICIAL RUBRIC TEXT (from rubric.pdf)
------------------------------------------------------------
${rubricText ? rubricText : 'Use standard IELTS Academic Writing Task 2 criteria if no rubric text is available.'}

------------------------------------------------------------
NOW ASSESS THIS ESSAY USING THE OFFICIAL RUBRIC ABOVE:
------------------------------------------------------------

Essay Title: ${essayTitle}

Essay Content:
${essayContent}

------------------------------------------------------------
OUTPUT FORMAT (JSON only):
------------------------------------------------------------

Return a JSON object with this EXACT shape:

{
  "task_type": "Academic Task 2",
  "word_count": <actual word count>,
  "overall_band": <number, average of four dimension bands rounded to nearest 0.5>,
  "dimensions": {
    "task_response": {
      "band": <number 0-9, 0.5 increments>,
      "good": "<one sentence praising the main strength, max 20 words>",
      "focus": "<one sentence with the single most important improvement, max 20 words>",
      "descriptors": [
        {"band": <number>, "text": "<official descriptor text that exactly matches the awarded band>"},
        {"band": <number>, "text": "<descriptor from one band higher showing what is needed to improve>"}
      ]
    },
    "coherence_cohesion": {
      "band": <number>,
      "good": "<strength sentence>",
      "focus": "<improvement sentence>",
      "descriptors": [
        {"band": <number>, "text": "<matching descriptor>"},
        {"band": <number>, "text": "<adjacent band descriptor>"}
      ]
    },
    "lexical_resource": {
      "band": <number>,
      "good": "<strength sentence>",
      "focus": "<improvement sentence>",
      "descriptors": [
        {"band": <number>, "text": "<matching descriptor>"},
        {"band": <number>, "text": "<adjacent band descriptor>"}
      ]
    },
    "grammatical_range_accuracy": {
      "band": <number>,
      "good": "<strength sentence>",
      "focus": "<improvement sentence>",
      "descriptors": [
        {"band": <number>, "text": "<matching descriptor>"},
        {"band": <number>, "text": "<adjacent band descriptor>"}
      ]
    }
  },
  "top_actions": [
    "<action 1, max 10 words>",
    "<action 2, max 10 words>",
    "<action 3, max 10 words>"
  ],
  "summary": "<one sentence overall performance summary>"
}`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert essay examiner. Use rubric-based scoring ONLY. Base scores strictly on descriptor criteria found in the attached rubric text. Provide evidence from student text. Never skip any dimension. Never guess band scores. Always respond with valid JSON only, no markdown code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2, // lower temperature for more consistent constraint adherence
      response_format: { type: 'json_object' },
    })

    const text = completion.choices[0]?.message?.content || ''
    const result = JSON.parse(text)

    return {
      scores: {
        taskAchievement: result.dimensions.task_response.band,
        coherenceCohesion: result.dimensions.coherence_cohesion.band,
        lexicalResource: result.dimensions.lexical_resource.band,
        grammaticalRange: result.dimensions.grammatical_range_accuracy.band,
      },
      feedback: result.summary || '',
      overallBand: result.overall_band,
      dimensions: result.dimensions,
      topActions: result.top_actions || [],
    }
  } catch (error) {
    console.error('Error assessing essay with OpenAI:', error)
    throw new Error('Failed to assess essay. Please try again later.')
  }
}

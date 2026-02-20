import OpenAI from 'openai'

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

    const prompt = `You are an IELTS Academic Writing examiner simulator trained to assess IELTS Academic Writing Task 2 using the official IELTS Academic Writing Band Descriptors as a strict rubric.

You MUST evaluate writing across FOUR OFFICIAL DIMENSIONS:

1. Task Response
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

------------------------------------------------------------
TASK RESPONSE RUBRIC
------------------------------------------------------------

Evaluate:
- CRITERION A: Answer Completeness — answers all parts of the question
- CRITERION B: Position Clarity — presents a clear position throughout
- CRITERION C: Idea Development — develops ideas sufficiently and clearly
- CRITERION D: Support and Examples — provides relevant examples and supports arguments
- CRITERION E: Relevance and Focus — avoids irrelevant ideas

Band Logic:
Band 9: Fully developed response; clear position; fully supported ideas
Band 8: Well developed response; minor weaknesses
Band 7: Clear position; ideas developed but uneven
Band 6: Position present but development limited
Band 5: Position unclear or insufficiently developed
Band 4 or below: Fails to respond to question properly

------------------------------------------------------------
COHERENCE AND COHESION RUBRIC
------------------------------------------------------------

Evaluate:
- CRITERION A: Logical Organization — clear structure, logical progression
- CRITERION B: Paragraph Structure — proper separation and grouping
- CRITERION C: Cohesive Devices — appropriate linking words, no overuse
- CRITERION D: Referencing — clear referencing, no unclear pronouns

Band Logic:
Band 9: Fully logical, seamless cohesion
Band 7: Clear progression with minor issues
Band 5: Some organization but weak cohesion
Band 4 or below: Disorganized

------------------------------------------------------------
LEXICAL RESOURCE RUBRIC
------------------------------------------------------------

Evaluate:
- CRITERION A: Vocabulary Range
- CRITERION B: Vocabulary Precision
- CRITERION C: Paraphrasing ability
- CRITERION D: Collocation accuracy
- CRITERION E: Spelling accuracy

Band Logic:
Band 9: Wide range, precise use
Band 7: Good range, minor errors
Band 5: Limited range, noticeable repetition
Band 4 or below: Very limited vocabulary

------------------------------------------------------------
GRAMMATICAL RANGE AND ACCURACY RUBRIC
------------------------------------------------------------

Evaluate:
- CRITERION A: Sentence variety
- CRITERION B: Complex sentence use
- CRITERION C: Grammar accuracy
- CRITERION D: Error frequency
- CRITERION E: Error severity

Band Logic:
Band 9: Wide range, rare errors
Band 7: Good range, some errors
Band 5: Limited range, frequent errors
Band 4 or below: Very frequent errors

------------------------------------------------------------
NOW ASSESS THIS ESSAY:
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
        {"band": <number>, "text": "<official descriptor text that matches the awarded band>"},
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
      model: 'gpt-5-nano',
      messages: [
        {
          role: 'system',
          content: 'You are an expert IELTS Academic Writing examiner. Use rubric-based scoring ONLY. Base scores strictly on descriptor criteria. Provide evidence from student text. Never skip any dimension. Never guess band scores. Always respond with valid JSON only, no markdown code blocks.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
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

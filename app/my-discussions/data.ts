export interface ReviewedEssay {
  essayId: string;
  essayTitle: string;
  essayContent: string;
  reviewedAt: Date;
  wordCount: number;
  discussionCount: number;
  newReplies: number;
}

export const MOCK_REVIEWED_ESSAYS: ReviewedEssay[] = [
  {
    essayId: 'essay-001',
    essayTitle: 'The Role of Artificial Intelligence in Modern Education',
    essayContent: `Artificial intelligence is rapidly transforming the landscape of education, offering new opportunities for personalized learning, instant feedback, and adaptive curricula. As classrooms evolve from traditional lecture-based environments to dynamic, technology-driven spaces, educators and students alike must grapple with both the promises and the challenges that AI presents.\n\nOne of the most significant advantages of AI in education is its ability to tailor learning experiences to individual students. Intelligent tutoring systems can identify knowledge gaps in real time and adjust content difficulty accordingly, ensuring that no student is left behind. This level of personalization was previously achievable only through one-on-one tutoring, making it an extraordinary democratization of high-quality instruction.\n\nHowever, the integration of AI is not without concerns. Questions around data privacy, algorithmic bias, and the erosion of critical thinking skills demand careful consideration. If students increasingly rely on AI tools to generate answers rather than develop reasoning skills, we risk undermining the very foundations of education — the cultivation of independent, analytical minds.\n\nUltimately, the effectiveness of AI in education hinges on how thoughtfully it is implemented. When used as a complement to human instruction rather than a replacement, AI has the potential to enrich learning environments and empower students to reach their full potential. The challenge for educators is to harness these tools responsibly while preserving the human connection at the heart of teaching.`,
    reviewedAt: new Date('2026-03-25T10:30:00'),
    wordCount: 214,
    discussionCount: 5,
    newReplies: 2,
  },
  {
    essayId: 'essay-002',
    essayTitle: 'Climate Change and Its Effect on Global Food Security',
    essayContent: `Climate change poses one of the most severe threats to global food security in the twenty-first century. Rising temperatures, erratic rainfall patterns, and the increasing frequency of extreme weather events are disrupting agricultural systems that billions of people depend upon for their survival.\n\nIn many developing regions, subsistence farmers who rely on seasonal rains are among the most vulnerable. A single failed monsoon or an unexpected frost can devastate an entire year's harvest, pushing already marginalized communities deeper into poverty and hunger. The compounding effects of soil degradation, water scarcity, and heat stress on crops further reduce yields and narrow the window for viable agriculture.\n\nYet climate change is not only a rural crisis. Urban food systems are equally susceptible. Supply chains that transport food across continents can be disrupted by floods, droughts, or storms, causing price volatility that hits low-income urban households hardest. As food becomes less affordable or less available, malnutrition and its associated health consequences rise.\n\nAddressing this crisis requires both mitigation and adaptation strategies. Reducing greenhouse gas emissions remains essential to limiting long-term damage. At the same time, investments in drought-resistant crop varieties, efficient irrigation, and local food storage infrastructure can help communities adapt to the changes already underway. International cooperation and equitable resource distribution will be critical to ensuring that food security becomes a shared global priority.`,
    reviewedAt: new Date('2026-03-23T14:15:00'),
    wordCount: 228,
    discussionCount: 3,
    newReplies: 0,
  },
  {
    essayId: 'essay-003',
    essayTitle: 'Social Media and Mental Health in Adolescents',
    essayContent: `The proliferation of social media platforms over the past decade has fundamentally altered the social landscape for adolescents worldwide. While these platforms offer unprecedented opportunities for connection, self-expression, and community building, a growing body of research raises serious concerns about their impact on the mental health of young people.\n\nStudies consistently link heavy social media use to increased rates of anxiety, depression, and loneliness among teenagers. The curated nature of social media feeds — where users share idealized versions of their lives — creates unrealistic social comparisons that can erode self-esteem, particularly among adolescent girls. Cyberbullying, which follows young people into their homes and across all hours of the day, amplifies these psychological harms.\n\nNevertheless, the relationship between social media and mental health is complex and not uniformly negative. For LGBTQ+ youth and those in geographically isolated communities, online spaces can provide vital support networks and a sense of belonging that may be unavailable in their immediate environments. Moderated online communities can foster constructive dialogue and peer support.\n\nA balanced approach is necessary. Parents, educators, and platform designers all bear responsibility for creating healthier digital environments. Establishing screen-time boundaries, promoting media literacy, and designing platforms that prioritize wellbeing over engagement metrics are essential steps toward protecting adolescent mental health in an increasingly digital world.`,
    reviewedAt: new Date('2026-03-20T09:00:00'),
    wordCount: 221,
    discussionCount: 7,
    newReplies: 4,
  },
  {
    essayId: 'essay-004',
    essayTitle: 'The Importance of Financial Literacy in Secondary Education',
    essayContent: `Despite living in a world shaped by economic forces, most young people graduate from secondary school with little understanding of personal finance. The absence of mandatory financial literacy education leaves adolescents ill-equipped to navigate decisions about budgeting, credit, savings, and investment — decisions that will profoundly shape their financial futures.\n\nThe consequences of this gap are tangible. Young adults who lack foundational financial knowledge are more likely to accumulate credit card debt, fall victim to predatory lending, and reach retirement age with inadequate savings. The resulting financial stress has well-documented effects on mental and physical health, as well as on broader economic productivity.\n\nIntroducing financial literacy as a required subject in secondary schools can address these deficiencies. Age-appropriate curricula can teach students how compound interest works, how to read a pay stub, how to evaluate a loan offer, and how to build an emergency fund. These are not abstract skills — they are tools students will use for the rest of their lives.\n\nCritics argue that financial literacy education has limited impact if structural inequalities remain unaddressed. This concern is valid, but it should not preclude action. Providing students with knowledge and skills is a necessary, if insufficient, step toward greater financial equity. When combined with systemic reform, financial education can empower the next generation to make informed, confident decisions about their economic lives.`,
    reviewedAt: new Date('2026-03-18T11:45:00'),
    wordCount: 218,
    discussionCount: 2,
    newReplies: 1,
  },
  {
    essayId: 'essay-005',
    essayTitle: 'Urban Green Spaces and Community Well-Being',
    essayContent: `As cities continue to expand, the preservation and creation of green spaces — parks, community gardens, tree-lined streets, and urban forests — has become an increasingly urgent public health priority. Research demonstrates that access to nature within urban environments is closely associated with improved physical health, reduced psychological stress, and stronger community cohesion.\n\nFor residents in dense urban neighborhoods, a nearby park can serve as a vital outlet for exercise, relaxation, and social interaction. Studies have shown that people who live within walking distance of green spaces report higher levels of life satisfaction and lower rates of depression and anxiety. Children who regularly play in natural settings develop stronger motor skills and greater capacity for creative thinking.\n\nYet access to green space is not equitably distributed. In many cities, wealthier neighborhoods enjoy well-maintained parks and tree canopy cover, while lower-income communities — often home to communities of color — face environmental inequity in the form of heat islands, noise pollution, and scarce public recreational space. This disparity compounds existing health inequalities.\n\nCity planners and policymakers must prioritize green space investment in underserved areas as a matter of environmental justice. Community-led initiatives — such as converting vacant lots into gardens or advocating for park upgrades — demonstrate the transformative power of grassroots action. Ultimately, a commitment to green urban infrastructure is a commitment to the health and dignity of all city residents.`,
    reviewedAt: new Date('2026-03-15T16:20:00'),
    wordCount: 224,
    discussionCount: 4,
    newReplies: 0,
  },
];

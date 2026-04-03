'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, FileText, ArrowUpRight, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { ReviewedEssay, MOCK_REVIEWED_ESSAYS } from './data';

// ─── Mock data (mirrors what would be fetched from Firestore reviews + essays) ─

const PLACEHOLDER_REVIEWED_ESSAYS: ReviewedEssay[] = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type SortKey = 'reviewedAt' | 'discussionCount' | 'essayTitle';
type SortDir = 'asc' | 'desc';

// ─── Component ────────────────────────────────────────────────────────────────

export default function MyDiscussions() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('reviewedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = MOCK_REVIEWED_ESSAYS
    .filter((e) =>
      e.essayTitle.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'reviewedAt') {
        cmp = a.reviewedAt.getTime() - b.reviewedAt.getTime();
      } else if (sortKey === 'discussionCount') {
        cmp = a.discussionCount - b.discussionCount;
      } else if (sortKey === 'essayTitle') {
        cmp = a.essayTitle.localeCompare(b.essayTitle);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const totalNew = MOCK_REVIEWED_ESSAYS.reduce((s, e) => s + e.newReplies, 0);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ChevronUp className="w-3 h-3 ml-1 text-slate-300 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-blue-500 inline" />
      : <ChevronDown className="w-3 h-3 ml-1 text-blue-500 inline" />;
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-slate-900">My Discussions</h1>
            <p className="text-xs text-slate-500">Essays you reviewed — join the peer discussion</p>
          </div>
        </div>
        {totalNew > 0 && (
          <Badge className="bg-blue-600 text-white px-3 py-1">
            {totalNew} new {totalNew === 1 ? 'reply' : 'replies'}
          </Badge>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 px-3 sm:px-5 py-3 sm:py-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1 leading-tight">Reviews Given</p>
            <p className="text-xl sm:text-2xl text-slate-900">{MOCK_REVIEWED_ESSAYS.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-3 sm:px-5 py-3 sm:py-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1 leading-tight">Discussions</p>
            <p className="text-xl sm:text-2xl text-slate-900">
              {MOCK_REVIEWED_ESSAYS.reduce((s, e) => s + e.discussionCount, 0)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-3 sm:px-5 py-3 sm:py-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-1 leading-tight">Unread</p>
            <p className={`text-xl sm:text-2xl ${totalNew > 0 ? 'text-blue-600' : 'text-slate-900'}`}>
              {totalNew}
            </p>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search essay titles…"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9 bg-white border-slate-200"
          />
        </div>

        {/* ── Mobile card list (hidden on md+) ── */}
        <div className="md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
              <FileText className="w-8 h-8 mx-auto mb-3 text-slate-300" />
              No essays found
            </div>
          ) : (
            filtered.map((essay, idx) => (
              <div
                key={essay.essayId}
                className="bg-white rounded-xl border border-slate-200 p-4 active:bg-slate-50 transition-colors"
                onClick={() =>
                  router.push(`/discussion/${essay.essayId}`)
                }
              >
                {/* Title row */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-800 leading-snug line-clamp-2">
                      {essay.essayTitle}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(essay.reviewedAt)}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">#{idx + 1}</span>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {essay.wordCount} words
                  </span>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-600">{essay.discussionCount} discussions</span>
                    {essay.newReplies > 0 && (
                      <span className="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                        +{essay.newReplies}
                      </span>
                    )}
                  </div>
                  {essay.newReplies > 0 ? (
                    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs ml-auto">
                      New Replies
                    </Badge>
                  ) : (
                    <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs ml-auto">
                      Up to date
                    </Badge>
                  )}
                </div>

                {/* CTA */}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-slate-200 text-slate-600"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    router.push(`/discussion/${essay.essayId}`);
                  }}
                >
                  View Discussion
                  <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* ── Desktop table (hidden on mobile) ── */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="w-10 text-slate-500 pl-4">#</TableHead>
                <TableHead
                  className="text-slate-500 cursor-pointer select-none"
                  onClick={() => handleSort('essayTitle')}
                >
                  Essay Title <SortIcon col="essayTitle" />
                </TableHead>
                <TableHead
                  className="text-slate-500 cursor-pointer select-none"
                  onClick={() => handleSort('reviewedAt')}
                >
                  Reviewed On <SortIcon col="reviewedAt" />
                </TableHead>
                <TableHead className="text-slate-500 text-center">Word Count</TableHead>
                <TableHead
                  className="text-slate-500 cursor-pointer select-none text-center"
                  onClick={() => handleSort('discussionCount')}
                >
                  Discussions <SortIcon col="discussionCount" />
                </TableHead>
                <TableHead className="text-slate-500 text-center">Status</TableHead>
                <TableHead className="text-slate-500 text-right pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                    No essays found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((essay, idx) => (
                  <TableRow
                    key={essay.essayId}
                    className="cursor-pointer group"
                    onClick={() => router.push(`/discussion/${essay.essayId}`)}
                  >
                    {/* # */}
                    <TableCell className="pl-4 text-slate-400 text-sm">{idx + 1}</TableCell>

                    {/* Title */}
                    <TableCell className="max-w-xs">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                        <span className="text-slate-800 text-sm leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                          {essay.essayTitle}
                        </span>
                      </div>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-slate-500 text-sm">
                      {formatDate(essay.reviewedAt)}
                    </TableCell>

                    {/* Word count */}
                    <TableCell className="text-center">
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {essay.wordCount} words
                      </span>
                    </TableCell>

                    {/* Discussions */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-sm text-slate-700">{essay.discussionCount}</span>
                        {essay.newReplies > 0 && (
                          <span className="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 leading-none">
                            +{essay.newReplies}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      {essay.newReplies > 0 ? (
                        <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                          New Replies
                        </Badge>
                      ) : (
                        <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs">
                          Up to date
                        </Badge>
                      )}
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right pr-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-slate-200 group-hover:border-blue-400 group-hover:text-blue-600 transition-colors"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          router.push(`/discussion/${essay.essayId}`);
                        }}
                      >
                        View Discussion
                        <ArrowUpRight className="w-3 h-3 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-slate-400 mt-3 text-right">
            Showing {filtered.length} of {MOCK_REVIEWED_ESSAYS.length} reviewed essays
          </p>
        )}
      </div>
    </div>
  );
}

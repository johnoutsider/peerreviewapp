# IELTS Peer Assessment System

A comprehensive web application for collaborative IELTS essay grading with AI-powered feedback and peer review. Students submit essays, receive instant AI assessments, and get reviewed by 3 classmates using official IELTS criteria.

## 🌟 Features

- ✍️ **Essay Submission**: Students upload IELTS essays (text format)
- 🤖 **AI Assessment**: Instant Google Gemini-powered evaluation using IELTS rubric
- 🤝 **Peer Review**: Automated assignment of 3 peers per essay
- 📊 **Comprehensive Feedback**: Combined AI + peer scores with detailed breakdown
- 📈 **Score Visualization**: Interactive radar charts for criteria analysis
- 🔐 **Google Authentication**: Easy sign-in with school Google accounts
- 🎨 **Modern UI**: Beautiful, responsive interface with dark mode

## 🏗️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Firestore + Authentication)
- **AI**: Google Gemini API (free tier)
- **Charts**: Recharts
- **Deployment**: Vercel (free tier)

## 🚀 Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- Google account
- Firebase account (free)
- Google AI Studio account (free)

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Authentication** → Google provider
4. Create **Firestore Database** (Start in production mode)
5. Get your Firebase config from Project Settings

### 3. Google Gemini API

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key (free tier: 1,500 requests/day)

### 4. Install Dependencies

```bash
npm install
```

### 5. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage Guide

### For Students

1. **Sign In**: Use your school Google account
2. **Submit Essay**: Go to "Submit Essay" and paste your IELTS essay
3. **Wait for Reviews**: AI assesses immediately, peers review within days
4. **View Feedback**: Check "My Essays" for comprehensive feedback

### For Teachers

1. **Manage Roster**: Import student emails from Google Classroom
2. **Monitor Progress**: View submission and review completion rates
3. **Export Results**: Download scores as CSV

## 🗂️ Database Structure

### Collections

**users**
- uid, email, name, role (teacher/student), classId

**essays**
- studentId, title, content, aiAssessment, peerReviewIds, status

**reviews**
- essayId, reviewerId, scores (4 criteria), feedback

## 🎯 IELTS Criteria

1. **Task Achievement** (0-9)
2. **Coherence & Cohesion** (0-9)
3. **Lexical Resource** (0-9)
4. **Grammatical Range & Accuracy** (0-9)

Final score = 25% AI + 75% Peer Average (rounded to 0.5)

## 🔧 Configuration

### Peer Assignment

Edit `lib/peer-assignment.ts` to customize:
- Number of reviewers per essay (default: 3)
- Assignment algorithm

### Score Weighting

Edit `lib/score-calculator.ts` to adjust:
- AI vs Peer weight (default: 25% AI, 75% Peers)

## 🌐 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy (automatic)

### Other Platforms

Works on Netlify, Cloudflare Pages, or any Node.js host.

## 💰 Cost Breakdown (Free Tier)

| Service | Free Tier | Expected Usage | Cost |
|---------|-----------|----------------|------|
| Firebase Auth | Unlimited | 50 students | $0 |
| Firestore | 50K reads/day | ~500/day | $0 |
| Gemini API | 1,500 req/day | ~50/week | $0 |
| Vercel | 100GB bandwidth | ~5GB/month | $0 |

**Total: $0/month** for up to 50 students ✅

## 🛠️ Troubleshooting

### AI Assessment Fails
- Check Gemini API key is correct
- Verify API quota (1,500/day free tier)
- Check essay content is valid text

### Peer Assignment Issues
- Ensure class has at least 4 students
- Check `classId` matches for all students

### Firebase Errors
- Verify Firestore security rules allow read/write
- Check authentication is enabled

## 📚 Future Enhancements

- Google Classroom API integration
- Writing progress tracking over time
- Rubric customization
- Mobile app (React Native)
- Email notifications

## 📝 License

MIT License - Free for educational use

## 🤝 Support

For issues or questions, create a GitHub issue or contact your system administrator.

---

Built with ❤️ for IELTS educators and students

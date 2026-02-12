# Quick Setup Guide

## 🚀 Get Started in 10 Minutes

### Step 1: Create Firebase Project (3 min)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter name: "ielts-peer-assessment"
4. Disable Google Analytics (optional)
5. Click "Create project"

### Step 2: Enable Authentication (1 min)

1. In Firebase Console, go to **Authentication** → **Get started**
2. Click **Google** provider
3. Enable it and click **Save**

### Step 3: Create Firestore Database (2 min)

1. Go to **Firestore Database** → **Create database**
2. Select **Start in production mode**
3. Choose location (closest to your students)
4. Click **Enable**

### Step 4: Set Firestore Rules (1 min)

1. In Firestore, go to **Rules** tab
2. Copy contents from `firestore.rules` file in project
3. Click **Publish**

### Step 5: Get Firebase Config (1 min)

1. Go to Project Settings (gear icon)
2. Scroll to "Your apps" → Click web icon
3. Register app
4. Copy the config values

### Step 6: Get Gemini API Key (1 min)

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API key"
3. Copy the key

### Step 7: Configure Project (1 min)

Create `.env.local` file in project root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
GOOGLE_GEMINI_API_KEY=AIza...
```

### Step 8: Run the App

```bash
npm run dev
```

Open http://localhost:3000

## ✅ You're Done!

### Testing Checklist

- [ ] Sign in with Google account works
- [ ] Submit a test essay
- [ ] AI assessment appears (check console for errors if not)
- [ ] Check Firestore for created documents
- [ ] Add 3 more test accounts to test peer review

## 🔧 Troubleshooting

### "Firebase: Error (auth/unauthorized-domain)"
→ In Firebase Console → Authentication → Settings → Authorized domains
→ Add `localhost`

### "AI assessment failed"
→ Check Gemini API key in `.env.local`
→ Verify key has quota (check AI Studio)

### "No peers assigned"
→ Need at least 4 users in same class
→ All users must have same `classId` in Firestore

## 📱 Deploy to Vercel

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import repository
4. Add all environment variables
5. Deploy!

Your app will be live at `your-app.vercel.app`

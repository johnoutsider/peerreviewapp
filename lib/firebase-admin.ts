import * as admin from 'firebase-admin';

// Initialize Firebase Admin if it hasn't been initialized yet
if (!admin.apps.length) {
    try {
        if (
            process.env.FIREBASE_PRIVATE_KEY &&
            process.env.FIREBASE_CLIENT_EMAIL &&
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        ) {
            // Priority: Explicit Service Account Credentials
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
            console.log("Firebase Admin initialized with explicitly provided credentials");
        } else {
            console.warn("⚠️ Firebase Admin initialized WITHOUT explicit service account credentials. Make sure you are using Google Application Default Credentials or running locally in an emulator.");

            // Fallback for Vercel / ADC setups
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project',
            });
        }
    } catch (error: any) {
        console.error('Firebase admin initialization error:', error);
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();

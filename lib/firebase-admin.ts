import * as admin from 'firebase-admin';

function readFirstEnv(...keys: string[]) {
    for (const key of keys) {
        const value = process.env[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function normalizeEnvValue(value: string) {
    const trimmed = value.trim();
    const unquoted = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
    return unquoted.replace(/\\n/g, '\n');
}

function getServiceAccount() {
    const serviceAccountJson = readFirstEnv(
        'FIREBASE_SERVICE_ACCOUNT_JSON',
        'FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON',
        'GOOGLE_SERVICE_ACCOUNT_JSON'
    );

    if (serviceAccountJson) {
        const parsed = JSON.parse(normalizeEnvValue(serviceAccountJson));
        return {
            projectId: String(parsed.project_id || parsed.projectId || ''),
            clientEmail: String(parsed.client_email || parsed.clientEmail || ''),
            privateKey: normalizeEnvValue(String(parsed.private_key || parsed.privateKey || '')),
        };
    }

    return {
        projectId: readFirstEnv(
            'FIREBASE_PROJECT_ID',
            'FIREBASE_ADMIN_PROJECT_ID',
            'GOOGLE_CLOUD_PROJECT',
            'GCLOUD_PROJECT',
            'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
        ),
        clientEmail: readFirstEnv('FIREBASE_CLIENT_EMAIL', 'FIREBASE_ADMIN_CLIENT_EMAIL'),
        privateKey: normalizeEnvValue(readFirstEnv('FIREBASE_PRIVATE_KEY', 'FIREBASE_ADMIN_PRIVATE_KEY')),
    };
}

function missingFields(serviceAccount: { projectId: string; clientEmail: string; privateKey: string }) {
    return Object.entries(serviceAccount)
        .filter(([, value]) => !value)
        .map(([key]) => key);
}

if (!admin.apps.length) {
    try {
        const serviceAccount = getServiceAccount();
        const missing = missingFields(serviceAccount);

        if (missing.length > 0) {
            throw new Error(
                'Firebase Admin credentials are not configured. Missing: ' + missing.join(', ') + '. ' +
                'Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY in Vercel.'
            );
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: serviceAccount.projectId,
                clientEmail: serviceAccount.clientEmail,
                privateKey: serviceAccount.privateKey,
            }),
            projectId: serviceAccount.projectId,
        });
        console.log('Firebase Admin initialized with explicit credentials');
    } catch (error: any) {
        console.error('Firebase admin initialization error:', error);
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();

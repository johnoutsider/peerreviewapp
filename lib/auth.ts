import { auth, db } from './firebase'
import {
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    User
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'

export interface UserProfile {
    uid: string
    email: string
    name: string
    role: 'teacher' | 'student'
    classId: string
    telegramChatId?: string
    telegramUsername?: string
    createdAt: Date
}

export async function signInWithGoogle(): Promise<UserProfile | null> {
    try {
        const provider = new GoogleAuthProvider()
        provider.setCustomParameters({
            prompt: 'select_account'
        })

        const result = await signInWithPopup(auth, provider)
        const user = result.user

        // Check if user exists in Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid))

        if (!userDoc.exists()) {
            // Create new user profile (default role: student)
            const newProfile: UserProfile = {
                uid: user.uid,
                email: user.email || '',
                name: user.displayName || 'Student',
                role: 'student',
                classId: 'default-class',
                createdAt: new Date(),
            }

            await setDoc(doc(db, 'users', user.uid), newProfile)
            return newProfile
        }

        return userDoc.data() as UserProfile
    } catch (error: any) {
        console.error('Sign in error:', error)

        // Log specific Firebase error details
        if (error.code) {
            console.error('Firebase Error Code:', error.code)
            console.error('Firebase Error Message:', error.message)
        }

        // Show user-friendly error message based on error code
        if (error.code === 'auth/popup-closed-by-user') {
            console.log('User closed the popup')
        } else if (error.code === 'auth/unauthorized-domain') {
            alert('ERROR: This domain is not authorized. Please add it to Firebase Console > Authentication > Settings > Authorized domains')
        } else if (error.code === 'auth/configuration-not-found') {
            alert('ERROR: Google Sign-In is not properly configured in Firebase Console')
        } else if (error.code === 'auth/operation-not-allowed') {
            alert('ERROR: Google Sign-In is not enabled in Firebase Console. Go to Authentication > Sign-in method and enable Google')
        }

        return null
    }
}

export async function signInWithEmailPassword(email: string, password: string): Promise<UserProfile | null> {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password)
        const user = result.user
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
            return userDoc.data() as UserProfile
        }
        return null
    } catch (error: any) {
        console.error('Email sign in error:', error)
        throw error
    }
}

export async function registerWithEmailPassword(email: string, password: string, name: string): Promise<UserProfile | null> {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password)
        const user = result.user

        await updateProfile(user, { displayName: name })

        const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            name,
            role: 'student',
            classId: 'default-class',
            createdAt: new Date(),
        }

        await setDoc(doc(db, 'users', user.uid), newProfile)
        return newProfile
    } catch (error: any) {
        console.error('Registration error:', error)
        throw error
    }
}

export async function signOut(): Promise<void> {
    try {
        await firebaseSignOut(auth)
    } catch (error) {
        console.error('Sign out error:', error)
    }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid))
        if (userDoc.exists()) {
            return userDoc.data() as UserProfile
        }
        return null
    } catch (error) {
        console.error('Get user profile error:', error)
        return null
    }
}

export async function updateUserRole(uid: string, role: 'teacher' | 'student'): Promise<void> {
    try {
        await setDoc(doc(db, 'users', uid), { role }, { merge: true })
    } catch (error) {
        console.error('Update user role error:', error)
    }
}

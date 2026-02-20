'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, isFirebaseConfigured } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'

export default function Home() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [showConfigWarning, setShowConfigWarning] = useState(false)

    useEffect(() => {
        // Check if Firebase is configured
        if (!isFirebaseConfigured()) {
            setShowConfigWarning(true)
            setLoading(false)
            return
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // User is signed in, check role and redirect
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)

                if (profile?.role === 'teacher') {
                    router.push('/teacher')
                } else {
                    router.push('/dashboard')
                }
            } else {
                // User is not signed in
                setLoading(false)
            }
        })

        return () => unsubscribe()
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
            <div className="container mx-auto px-4 py-16">
                <div className="max-w-4xl mx-auto">
                    {/* Configuration Warning */}
                    {showConfigWarning && (
                        <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-xl p-6 mb-8">
                            <h3 className="text-xl font-bold text-yellow-400 mb-2">⚙️ Configuration Required</h3>
                            <p className="text-yellow-200 mb-4">
                                Firebase is not configured yet. Please set up your environment variables to enable authentication and database features.
                            </p>
                            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
                                <p className="text-sm text-gray-300 mb-2">Follow these steps:</p>
                                <ol className="text-sm text-gray-400 list-decimal list-inside space-y-1">
                                    <li>Create a Firebase project at console.firebase.google.com</li>
                                    <li>Enable Google Authentication</li>
                                    <li>Create a Firestore database</li>
                                    <li>Get your Gemini API key from ai.google.dev</li>
                                    <li>Update the .env.local file with your keys</li>
                                </ol>
                            </div>
                            <p className="text-xs text-yellow-300">
                                See <code className="bg-slate-900/50 px-2 py-1 rounded">SETUP.md</code> for detailed instructions
                            </p>
                        </div>
                    )}

                    {/* Hero Section */}
                    <div className="text-center mb-12">
                        <h1 className="text-6xl font-bold text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                            IELTS Peer Assessment
                        </h1>
                        <p className="text-xl text-gray-300 mb-8">
                            Collaborative essay grading powered by AI and peer review
                        </p>
                    </div>

                    {/* Features */}
                    <div className="grid md:grid-cols-3 gap-6 mb-12">
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                            <div className="text-4xl mb-4">✍️</div>
                            <h3 className="text-xl font-semibold text-white mb-2">Submit Essays</h3>
                            <p className="text-gray-300">Upload your IELTS essays and receive comprehensive feedback</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                            <div className="text-4xl mb-4">🤝</div>
                            <h3 className="text-xl font-semibold text-white mb-2">Peer Review</h3>
                            <p className="text-gray-300">Review 3 classmates&apos; essays using IELTS criteria</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                            <div className="text-4xl mb-4">🤖</div>
                            <h3 className="text-xl font-semibold text-white mb-2">AI Feedback</h3>
                            <p className="text-gray-300">Get instant AI-powered analysis and suggestions</p>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="text-center">
                        {showConfigWarning ? (
                            <button
                                disabled
                                className="inline-block bg-gray-600 text-gray-400 font-semibold px-8 py-4 rounded-lg text-lg cursor-not-allowed shadow-lg"
                            >
                                Configure Firebase First
                            </button>
                        ) : (
                            <a
                                href="/auth/signin"
                                className="inline-block bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold px-8 py-4 rounded-lg text-lg hover:from-blue-600 hover:to-purple-700 transition-all transform hover:scale-105 shadow-lg"
                            >
                                Sign In with Google
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </main>
    )
}

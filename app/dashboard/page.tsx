'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, getDocs } from 'firebase/firestore'
import StudentLayout from '@/components/StudentLayout'
import IELTSRubric from '@/components/IELTSRubric'

function DashboardHeader() {
    return (
        <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Welcome Back!</h1>
            <p className="text-slate-500">Here&apos;s your writing progress</p>
        </div>
    )
}

function DashboardHeaderSkeleton() {
    return (
        <div className="mb-8 animate-pulse">
            <div className="h-10 w-72 rounded-lg bg-slate-200" />
            <div className="mt-3 h-5 w-52 rounded-lg bg-slate-200" />
        </div>
    )
}

function StatsSection({ stats }: { stats: { submittedEssays: number; reviewsCompleted: number; reviewsPending: number } }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="text-5xl mb-3">????</div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{stats.submittedEssays}</div>
                <div className="text-slate-700 font-medium">Essays Submitted</div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="text-5xl mb-3">???</div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{stats.reviewsCompleted}</div>
                <div className="text-slate-700 font-medium">Reviews Completed</div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="text-5xl mb-3">???</div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{stats.reviewsPending}</div>
                <div className="text-slate-700 font-medium">Pending Reviews</div>
            </div>
        </div>
    )
}

function StatsSectionSkeleton() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-8 animate-pulse">
            {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="h-12 w-12 rounded-xl bg-slate-200" />
                    <div className="mt-4 h-9 w-16 rounded-lg bg-slate-200" />
                    <div className="mt-3 h-5 w-32 rounded-lg bg-slate-200" />
                </div>
            ))}
        </div>
    )
}

function QuickActionsSection() {
    return (
        <div className="bg-white backdrop-blur-sm rounded-xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Quick Actions</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Link
                    href="/submit-essay"
                    className="bg-white border border-slate-200 text-slate-900 p-6 rounded-lg hover:border-blue-500 hover:shadow-md transition-all text-left flex flex-col justify-center block"
                >
                    <div className="text-3xl mb-2">??????</div>
                    <h3 className="text-xl font-bold mb-1">Submit New Essay</h3>
                    <p className="text-slate-600 font-medium text-sm">Upload your essay and get AI feedback</p>
                </Link>

                <Link
                    href="/review"
                    className="bg-white border border-slate-200 text-slate-900 p-6 rounded-lg hover:border-green-500 hover:shadow-md transition-all text-left flex flex-col justify-center block"
                >
                    <div className="text-3xl mb-2">????</div>
                    <h3 className="text-xl font-bold mb-1">Review Peers</h3>
                    <p className="text-slate-600 font-medium text-sm">Help your classmates by reviewing their essays</p>
                </Link>

                <Link
                    href="/my-essays"
                    className="bg-white border border-slate-200 text-slate-900 p-6 rounded-lg hover:border-purple-500 hover:shadow-md transition-all text-left flex flex-col justify-center block"
                >
                    <div className="text-3xl mb-2">????</div>
                    <h3 className="text-xl font-bold mb-1">View My Essays</h3>
                    <p className="text-slate-600 font-medium text-sm">See your submissions and feedback</p>
                </Link>

                <Link
                    href="/progress"
                    className="bg-white border border-slate-200 text-slate-900 p-6 rounded-lg hover:border-orange-500 hover:shadow-md transition-all text-left flex flex-col justify-center block"
                >
                    <div className="text-3xl mb-2">????</div>
                    <h3 className="text-xl font-bold mb-1">Track Progress</h3>
                    <p className="text-slate-600 font-medium text-sm">Monitor your improvement over time</p>
                </Link>
            </div>
        </div>
    )
}

function QuickActionsSectionSkeleton() {
    return (
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm animate-pulse">
            <div className="h-8 w-40 rounded-lg bg-slate-200" />
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-lg border border-slate-200 bg-white p-6">
                        <div className="h-8 w-8 rounded-lg bg-slate-200" />
                        <div className="mt-4 h-6 w-40 rounded-lg bg-slate-200" />
                        <div className="mt-3 h-4 w-full rounded-lg bg-slate-200" />
                        <div className="mt-2 h-4 w-4/5 rounded-lg bg-slate-200" />
                    </div>
                ))}
            </div>
        </div>
    )
}

function RubricSection() {
    return <IELTSRubric />
}

function RubricSectionSkeleton() {
    return (
        <div className="fixed bottom-6 right-6 z-50 animate-pulse">
            <div className="h-12 w-56 rounded-full bg-slate-300" />
        </div>
    )
}

export default function Dashboard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        submittedEssays: 0,
        reviewsCompleted: 0,
        reviewsPending: 0,
    })

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                router.push('/')
                return
            }

            try {
                const { getUserProfile } = await import('@/lib/auth')
                const profile = await getUserProfile(user.uid)
                if (profile?.role === 'teacher') {
                    router.replace('/teacher')
                    return
                }

                const essaysQuery = query(
                    collection(db, 'essays'),
                    where('studentId', '==', user.uid)
                )
                const essaysSnapshot = await getDocs(essaysQuery)

                const reviewsQuery = query(
                    collection(db, 'reviews'),
                    where('reviewerId', '==', user.uid)
                )
                const reviewsSnapshot = await getDocs(reviewsQuery)

                const assignedQuery = query(
                    collection(db, 'essays'),
                    where('peerReviewIds', 'array-contains', user.uid)
                )
                const assignedSnapshot = await getDocs(assignedQuery)

                setStats({
                    submittedEssays: essaysSnapshot.size,
                    reviewsCompleted: reviewsSnapshot.size,
                    reviewsPending: assignedSnapshot.size - reviewsSnapshot.size,
                })
            } catch (error) {
                console.error('Error fetching stats:', error)
            }

            setLoading(false)
        })

        return () => unsubscribe()
    }, [router])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 ">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    return (
        <StudentLayout title="Dashboard">
            <main className="container mx-auto px-4 py-8">
                <Suspense fallback={<DashboardHeaderSkeleton />}>
                    <DashboardHeader />
                </Suspense>

                <Suspense fallback={<StatsSectionSkeleton />}>
                    <StatsSection stats={stats} />
                </Suspense>

                <Suspense fallback={<QuickActionsSectionSkeleton />}>
                    <QuickActionsSection />
                </Suspense>
            </main>

            <Suspense fallback={<RubricSectionSkeleton />}>
                <RubricSection />
            </Suspense>
        </StudentLayout>
    )
}

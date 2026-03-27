'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MyDiscussionsRedirect() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/discussions')
    }, [router])

    return null
}

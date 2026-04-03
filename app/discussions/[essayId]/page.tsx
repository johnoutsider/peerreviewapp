import { redirect } from 'next/navigation'

export default async function DiscussionsEssayRedirect({
    params,
}: {
    params: Promise<{ essayId: string }>
}) {
    const { essayId } = await params
    redirect(`/discussion/${essayId}`)
}

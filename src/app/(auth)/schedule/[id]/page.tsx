export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server"
import { ScheduleForm } from "@/components/schedule/schedule-form"
import { notFound, redirect } from "next/navigation"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function EditSchedulePage({ params }: PageProps) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        redirect("/login")
    }

    const { data: schedule } = await supabase
        .from("schedules")
        .select("*")
        .eq("id", id)
        .single()

    if (!schedule) {
        notFound()
    }

    return (
        <div className="container mx-auto p-4 space-y-4">
            <h1 className="text-2xl font-bold">スケジュール編集</h1>
            <ScheduleForm
                scheduleId={schedule.id}
                initialData={schedule}
            />
        </div>
    )
}

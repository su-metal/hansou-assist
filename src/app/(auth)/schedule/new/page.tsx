
import { ScheduleForm } from "@/components/schedule/schedule-form"

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function NewSchedulePage({ searchParams }: PageProps) {
    const params = await searchParams
    const initialData = {
        date: typeof params.date === 'string' ? params.date : undefined,
        hall_id: typeof params.hall_id === 'string' ? params.hall_id : undefined,
        ceremony_time: typeof params.time === 'string' ? params.time : undefined,
        // Default values for other required fields to satisfy the type if needed, 
        // asking ScheduleForm to handle partials would be better but for now:
        slot_type: "葬儀" as const,
        status: "occupied" as const,
        family_name: "",
    }

    // Filter out undefined values to let ScheduleForm defaults take over where missing
    const cleanInitialData = Object.fromEntries(
        Object.entries(initialData).filter(([_, v]) => v !== undefined)
    ) as any

    return (
        <div className="container mx-auto p-4 space-y-4">
            <h1 className="text-2xl font-bold">新規スケジュール登録</h1>
            <ScheduleForm initialData={cleanInitialData} />
        </div>
    )
}


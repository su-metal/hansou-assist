
import { ScheduleForm } from "@/components/schedule/schedule-form"

export default function NewSchedulePage() {
    return (
        <div className="container mx-auto p-4 space-y-4">
            <h1 className="text-2xl font-bold">新規スケジュール登録</h1>
            <ScheduleForm />
        </div>
    )
}


import { CalendarView } from '@/components/schedule/CalendarView'

export default async function CalendarPage() {
    return (
        <div className="container mx-auto p-4 space-y-4">
            <h1 className="text-2xl font-bold">カレンダー</h1>
            <CalendarView />
        </div>
    )
}

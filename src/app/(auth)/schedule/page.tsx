
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { ScheduleList } from '@/components/schedule/schedule-list'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Camera } from 'lucide-react'

export default function SchedulePage() {
    return (
        <div className="space-y-6 px-4 sm:px-0">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">スケジュール一覧</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        各ホールの稼働状況を確認できます。
                    </p>
                </div>
                {/* 
                <div className="flex gap-2">
                    <Button asChild variant="outline">
                        <Link href="/camera">
                            <Camera className="mr-2 h-4 w-4" />
                            OCR登録
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/schedule/new">
                            <Plus className="mr-2 h-4 w-4" />
                            新規登録
                        </Link>
                    </Button>
                </div>
                */}
            </div>
            <ScheduleList />
        </div>
    )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Suspense } from 'react'
import { RefreshCw } from 'lucide-react'
import { syncCremationVacancies } from '@/lib/actions/cremation-vacancy'
import { toast } from 'sonner'

type Facility = {
    id: string
    name: string
    halls: Hall[]
    start_hour: number
    end_hour: number
    funeral_conditional_time?: string
    wake_required_time?: string
    funeral_block_time?: string
}

type Hall = {
    id: string
    name: string
    schedules: Schedule[]
    max_count?: number
}

type Schedule = {
    id: string
    date: string
    family_name?: string
    slot_type: string
    status: string
    ceremony_time?: string
    hall_id?: string
    remarks?: string
}

type CremationVacancy = {
    date: string
    time: string
    available_count: number
}

const GAMAGORI_FACILITY_IDS = [
    '838d0498-14fa-41e6-b950-438fd220d9fe', // JA蒲郡市やすらぎセンター
    '74e44fcc-03c3-4a13-b89a-ef4e9726d116'  // 家族葬の結家 蒲郡宝町
]

export function ScheduleList() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <ScheduleListContent />
        </Suspense>
    )
}

function ScheduleListContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    const [currentDate, setCurrentDate] = useState<Date>(new Date())
    const [isInitialDateSet, setIsInitialDateSet] = useState(false)
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    const [isTomobiki, setIsTomobiki] = useState(false)
    const [activeFacilityIndex, setActiveFacilityIndex] = useState(0)
    const [isInitialFacilitySet, setIsInitialFacilitySet] = useState(false)
    const [cremationVacancies, setCremationVacancies] = useState<CremationVacancy[]>([])
    const [isSyncing, setIsSyncing] = useState(false)

    // Touch state for swipe navigation
    const [touchStart, setTouchStart] = useState<number | null>(null)
    const [touchEnd, setTouchEnd] = useState<number | null>(null)
    const minSwipeDistance = 50

    // Match initial state from URL or LocalStorage synchronously (effect-like)
    useEffect(() => {
        if (!isInitialDateSet) {
            let initialDate = new Date()
            const dateParam = searchParams.get('date')
            if (dateParam) {
                const parsed = new Date(dateParam)
                if (!isNaN(parsed.getTime())) {
                    initialDate = parsed
                }
            } else {
                const storedDate = localStorage.getItem('hansou_schedule_date')
                if (storedDate) {
                    const parsed = new Date(storedDate)
                    if (!isNaN(parsed.getTime())) {
                        initialDate = parsed
                    }
                }
            }
            setCurrentDate(initialDate)
            setIsInitialDateSet(true)
        }
    }, [searchParams, isInitialDateSet])

    // Fetch schedules with race condition prevention
    const fetchSchedules = useCallback(async (targetDate: Date, signal?: { ignore: boolean }, silent: boolean = false) => {
        if (!silent) setLoading(true)
        const dateStr = format(targetDate, 'yyyy-MM-dd')

        try {
            // Fetch facilities with halls
            const { data: facilitiesData, error: facilitiesError } = await supabase
                .from('facilities')
                .select(`
                    id,
                    name,
                    start_hour,
                    end_hour,
                    funeral_conditional_time,
                    wake_required_time,
                    funeral_block_time,
                    halls (
                        id,
                        name
                    )
                `)
                .eq('is_active', true)
                .order('created_at')

            if (signal?.ignore) return
            if (facilitiesError) throw facilitiesError

            // Fetch Rokuyo
            const { data: rokuyoData } = await supabase
                .from('rokuyo')
                .select('is_tomobiki')
                .eq('date', dateStr)
                .maybeSingle()

            if (signal?.ignore) return
            setIsTomobiki(!!rokuyoData?.is_tomobiki)

            // Fetch schedules for the target date
            const { data: schedulesData, error: schedulesError } = await supabase
                .from('schedules')
                .select('*')
                .eq('date', dateStr)

            if (signal?.ignore) return
            if (schedulesError) throw schedulesError

            // Fetch daily capacities for the target date
            const { data: capacitiesData } = await supabase
                .from('daily_capacities')
                .select('hall_id, max_count')
                .eq('date', dateStr)

            if (signal?.ignore) return

            const capacityMap: Record<string, number> = {}
            capacitiesData?.forEach((c: { hall_id: string, max_count: number }) => {
                capacityMap[c.hall_id] = c.max_count
            })

            const formattedFacilities = (facilitiesData as unknown as Facility[]).map(facility => ({
                ...facility,
                start_hour: facility.start_hour ?? 9,
                end_hour: 22,
                halls: facility.halls.map(hall => ({
                    ...hall,
                    schedules: (schedulesData as unknown as Schedule[])?.filter(s => s.hall_id === hall.id) || [],
                    max_count: capacityMap[hall.id]
                }))
            }))

            setFacilities(formattedFacilities)

            // Fetch Cremation Vacancies if there's any Gamagori facility
            const hasGamagori = formattedFacilities.some(f => GAMAGORI_FACILITY_IDS.includes(f.id))
            if (hasGamagori) {
                const { data: cremationData } = await supabase
                    .from('cremation_vacancies')
                    .select('*')
                    .eq('date', dateStr)
                    .order('time')

                if (!signal?.ignore) {
                    setCremationVacancies(cremationData || [])
                }
            } else {
                if (!signal?.ignore) {
                    setCremationVacancies([])
                }
            }
        } catch (err) {
            console.error('Fetch error:', err)
        } finally {
            if (!signal?.ignore) setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        if (!isInitialDateSet) return

        let ignore = false
        const signal = { ignore }

        fetchSchedules(currentDate, signal)

        const channel = supabase
            .channel(`schedule-list-${format(currentDate, 'yyyy-MM-dd')}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
                fetchSchedules(currentDate, signal, true)
            })
            .subscribe()

        return () => {
            signal.ignore = true
            supabase.removeChannel(channel)
        }
    }, [fetchSchedules, currentDate, isInitialDateSet, supabase])

    // Sync state to URL and localStorage
    useEffect(() => {
        if (!isInitialDateSet || !isInitialFacilitySet || loading) return;

        const currentParamsStr = searchParams.toString()
        const params = new URLSearchParams(currentParamsStr)
        const dateStr = format(currentDate, 'yyyy-MM-dd')

        params.set('date', dateStr)
        localStorage.setItem('hansou_schedule_date', dateStr)

        if (facilities[activeFacilityIndex]) {
            const facId = facilities[activeFacilityIndex].id
            params.set('facility_id', facId)
            localStorage.setItem('hansou_schedule_facility', facId)
        }

        const newParamsStr = params.toString()
        if (currentParamsStr !== newParamsStr) {
            const newUrl = `${pathname}?${newParamsStr}`
            router.replace(newUrl, { scroll: false })
        }
    }, [currentDate, activeFacilityIndex, facilities, pathname, router, searchParams, isInitialDateSet, isInitialFacilitySet, loading])

    // Match initial facility from URL or localStorage
    useEffect(() => {
        if (!isInitialFacilitySet && facilities.length > 0) {
            let initialId = searchParams.get('facility_id')

            // Fallback to local storage if no URL params
            const hasParams = searchParams.has('date') || searchParams.has('facility_id')
            if (!hasParams && !initialId) {
                const storedId = localStorage.getItem('hansou_schedule_facility')
                if (storedId) initialId = storedId
            }

            if (initialId) {
                const index = facilities.findIndex(f => f.id === initialId)
                if (index !== -1) {
                    setActiveFacilityIndex(index)
                }
            }
            setIsInitialFacilitySet(true)
        }
    }, [facilities, searchParams, isInitialFacilitySet])

    // ... touch handlers ...
    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null)
        setTouchStart(e.targetTouches[0].clientX)
    }

    const handleSyncCremation = async () => {
        setIsSyncing(true)
        try {
            const result = await syncCremationVacancies()
            if (result.success) {
                toast.success('火葬場の空き状況を更新しました')
                fetchSchedules(currentDate, undefined, true)
            } else {
                toast.error(`更新に失敗しました: ${result.error}`)
            }
        } catch (err) {
            toast.error('通信エラーが発生しました')
        } finally {
            setIsSyncing(false)
        }
    }

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX)
    }

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return
        const distance = touchStart - touchEnd
        const isLeftSwipe = distance > minSwipeDistance
        const isRightSwipe = distance < -minSwipeDistance

        if (isLeftSwipe && activeFacilityIndex < facilities.length - 1) {
            setActiveFacilityIndex(prev => prev + 1)
        }
        if (isRightSwipe && activeFacilityIndex > 0) {
            setActiveFacilityIndex(prev => prev - 1)
        }
    }

    // Reset active index when facilities change or date changes
    useEffect(() => {
        if (facilities.length > 0 && activeFacilityIndex >= facilities.length) {
            setActiveFacilityIndex(0)
        }
    }, [facilities, activeFacilityIndex])


    const handlePrevDay = () => setCurrentDate(subDays(currentDate, 1))
    const handleNextDay = () => setCurrentDate(addDays(currentDate, 1))
    const handleToday = () => setCurrentDate(new Date())

    const activeFacility = facilities[activeFacilityIndex]

    // Generate time slots based on facility hours
    const timeSlots = activeFacility ? Array.from(
        { length: (activeFacility.end_hour - activeFacility.start_hour) + 1 },
        (_, i) => activeFacility.start_hour + i
    ) : []

    return (
        <div className="space-y-4">
            {/* Header Controls */}
            <div className="flex flex-col gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={handlePrevDay}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" className="text-lg font-bold hover:bg-slate-100 flex items-center gap-2">
                                    <CalendarIcon className="h-5 w-5 text-primary" />
                                    {format(currentDate, 'M月d日(E)', { locale: ja })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="center">
                                <Calendar
                                    mode="single"
                                    selected={currentDate}
                                    onSelect={(date) => {
                                        if (date) setCurrentDate(date)
                                    }}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        <Button variant="outline" size="icon" onClick={handleNextDay}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleToday}>
                        今日
                    </Button>
                </div>

                {!loading && facilities.length > 0 && (
                    <Select
                        value={activeFacilityIndex.toString()}
                        onValueChange={(val) => setActiveFacilityIndex(parseInt(val))}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="斎場を選択" />
                        </SelectTrigger>
                        <SelectContent>
                            {facilities.map((f, idx) => (
                                <SelectItem key={f.id} value={idx.toString()}>
                                    {f.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* 全体告知: 友引 */}
            {isTomobiki && !loading && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm">
                    <span className="font-bold bg-amber-200 dark:bg-amber-800 px-1.5 rounded">友引</span>
                    <span>本日は友引のため、葬儀の予約は制限されています。</span>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : !activeFacility ? (
                <div className="text-center p-8 text-gray-500">
                    施設が見つかりません
                </div>
            ) : (
                <div
                    className="touch-pan-y"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <Card key={activeFacility.id} className="overflow-hidden min-h-[50vh]">
                        <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3 flex flex-row justify-between items-center">
                            <CardTitle className="text-lg font-medium">{activeFacility.name}</CardTitle>
                            <span className="text-xs text-muted-foreground">
                                {activeFacilityIndex + 1} / {facilities.length}
                            </span>
                        </CardHeader>
                        <CardContent className="p-0">
                            {GAMAGORI_FACILITY_IDS.includes(activeFacility.id) && (
                                <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-4 bg-primary rounded-full"></div>
                                        <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300">火葬場（とぼね）</h3>
                                    </div>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-8 gap-1 border-primary/20 hover:bg-primary/5">
                                                空き状況を確認
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="w-[95vw] max-w-lg rounded-xl">
                                            <DialogHeader>
                                                <DialogTitle className="text-left flex items-center justify-between">
                                                    <span>とぼね空き状況</span>
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        className="h-8 gap-1.5"
                                                        onClick={handleSyncCremation}
                                                        disabled={isSyncing}
                                                    >
                                                        <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                                        更新
                                                    </Button>
                                                </DialogTitle>
                                            </DialogHeader>

                                            <div className="py-2">
                                                {cremationVacancies.length > 0 ? (
                                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                                        {cremationVacancies.map((v) => (
                                                            <div key={v.time} className="flex flex-col items-center py-2 px-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                                                                <span className="text-[11px] text-slate-500 font-medium mb-1">{v.time}</span>
                                                                <span className={`text-sm font-bold ${v.available_count > 0 ? 'text-primary' : 'text-slate-400'}`}>
                                                                    {v.available_count > 0 ? `${v.available_count}件` : '×'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center py-10 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                                        <span className="text-sm text-slate-500 mb-2 font-medium">この日の空き枠データはありません</span>
                                                        <span className="text-xs text-slate-400 text-center leading-relaxed">
                                                            ※公式予約システムでは当日から2日後以降の枠のみ表示される場合があります。<br />
                                                            情報が古い場合は右上の「更新」をタップしてください。
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="text-right border-t border-slate-100 dark:border-slate-800 pt-3 mt-2">
                                                <a
                                                    href="https://saijyo6.seagulloffice.com/tobone/user/cremationvacancy?172872981&c=1&f=1&__SANE_MI__=v1-1"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium"
                                                >
                                                    公式の予約システムを開く
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            )}

                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {activeFacility.halls.map((hall) => (
                                    <div key={hall.id} className="p-4 flex flex-col hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <div className="mb-2 font-medium text-slate-900 dark:text-slate-100 border-l-4 border-primary pl-2 flex justify-between items-center">
                                            <span>{hall.name}</span>
                                            <span className={`text-sm font-bold ${hall.schedules.length >= (hall.max_count ?? 1)
                                                ? 'text-red-500'
                                                : 'text-muted-foreground'
                                                }`}>
                                                ({hall.schedules.length} / {hall.max_count !== undefined ? hall.max_count : '-'})
                                            </span>
                                        </div>

                                        {/* ホール単位の制約告知 */}
                                        {(() => {
                                            const hasFuneral = hall.schedules.some(s => s.slot_type === '葬儀');
                                            const hasWake = hall.schedules.some(s => s.slot_type === '通夜');
                                            if (hasFuneral) {
                                                return (
                                                    <div className="mb-3 px-2 py-1 bg-slate-50 dark:bg-slate-900/40 rounded text-[11px] text-slate-500 flex items-center gap-1.5 ring-1 ring-slate-200 dark:ring-slate-800">
                                                        <span className="text-orange-500">●</span>
                                                        葬儀予約があるため、一部の時間帯で通夜の登録が制限されています
                                                    </div>
                                                );
                                            }
                                            if (hasWake) {
                                                return (
                                                    <div className="mb-3 px-2 py-1 bg-slate-50 dark:bg-slate-900/40 rounded text-[11px] text-slate-500 flex items-center gap-1.5 ring-1 ring-slate-200 dark:ring-slate-800">
                                                        <span className="text-purple-500">●</span>
                                                        通夜予約があるため、一部の時間帯で葬儀の登録が制限されています
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        <div className="space-y-2">
                                            {hall.max_count === undefined && (
                                                <div className="block border border-dashed border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10 rounded-md p-3 mb-2">
                                                    <div className="flex items-center justify-between text-slate-400 mb-2">
                                                        <span className="font-medium text-lg">全時間帯</span>
                                                        <span className="text-sm text-red-500 font-bold">予約不可</span>
                                                    </div>
                                                    <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                                                        受け入れ枠が未設定のため登録できません。<br />
                                                        先に<Link href={`/capacities?date=${format(currentDate, 'yyyy-MM-dd')}&hall_id=${hall.id}`} className="underline font-bold hover:text-red-800 transition-colors">受け入れ枠設定</Link>を行ってください。
                                                    </p>
                                                </div>
                                            )}
                                            {timeSlots.map(hour => {
                                                const timeStr = `${hour}:00`;
                                                // Find schedule for this hour
                                                // Assuming ceremony_time is string "HH:mm"
                                                const schedule = hall.schedules.find(s => {
                                                    // Loose matching: "10:00" matches "10:00" or start with "10:"
                                                    return s.ceremony_time === timeStr || s.ceremony_time?.startsWith(`${hour}:`)
                                                })

                                                if (schedule) {
                                                    if (schedule.status === 'external') {
                                                        return (
                                                            <div
                                                                key={`slot-${hall.id}-${hour}`}
                                                                className="block relative bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-md p-3 mb-2 opacity-80"
                                                                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)' }}
                                                            >
                                                                <Link
                                                                    href={`/schedule/${schedule.id}?back_facility_id=${activeFacility.id}&back_date=${format(currentDate, 'yyyy-MM-dd')}`}
                                                                    className="absolute inset-0 z-10 bg-transparent hover:bg-slate-400/10 transition-colors rounded-md"
                                                                />
                                                                <div className="flex justify-between items-start mb-1 relative z-0">
                                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                                        他社予約
                                                                    </span>
                                                                    <span className="font-bold text-lg text-slate-500 dark:text-slate-400">
                                                                        {schedule.ceremony_time}
                                                                    </span>
                                                                </div>
                                                                <div className="font-bold text-lg text-slate-500 dark:text-slate-400 mt-1 relative z-0">
                                                                    （斎場ブロック枠）
                                                                </div>
                                                            </div>
                                                        )
                                                    }

                                                    return (
                                                        <Link
                                                            href={`/schedule/${schedule.id}?back_facility_id=${activeFacility.id}&back_date=${format(currentDate, 'yyyy-MM-dd')}`}
                                                            key={`slot-${hall.id}-${hour}`}
                                                            className="block bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-3 shadow-sm hover:border-primary transition-colors mb-2"
                                                        >
                                                            <div className="flex justify-between items-start mb-1">
                                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${schedule.slot_type === '葬儀'
                                                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                                                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                                                    }`}>
                                                                    {schedule.slot_type}
                                                                </span>
                                                                <span className="font-bold text-lg text-slate-900 dark:text-slate-100">
                                                                    {schedule.ceremony_time}
                                                                </span>
                                                            </div>
                                                            <div className="font-bold text-xl text-slate-900 dark:text-slate-100 mt-1">
                                                                {schedule.family_name} 様
                                                            </div>
                                                            {schedule.remarks && (
                                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                                                    {schedule.remarks}
                                                                </div>
                                                            )}
                                                            {schedule.status === 'preparing' && (
                                                                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                                    ※仮予約
                                                                </div>
                                                            )}
                                                        </Link>
                                                    )
                                                } else {
                                                    // Empty slot
                                                    if (hall.max_count === undefined) return null;
                                                    const dateStr = format(currentDate, 'yyyy-MM-dd')

                                                    // Determine if slot is usable for at least one type
                                                    const testTimeStr = `${hour}:00`
                                                    const testMin = hour * 60

                                                    // Use rules from hall's facility
                                                    const {
                                                        funeral_conditional_time,
                                                        wake_required_time,
                                                        funeral_block_time
                                                    } = activeFacility

                                                    const timeToMin = (t: string | null) => {
                                                        if (!t) return null
                                                        const [h, m] = t.split(':').map(Number)
                                                        return h * 60 + m
                                                    }

                                                    const condMin = timeToMin(funeral_conditional_time || null)
                                                    const reqMin = timeToMin(wake_required_time || null)
                                                    const blockMin = timeToMin(funeral_block_time || null)

                                                    // Check Funeral possibility: Not Tomobiki AND <= 12:00 AND no existing funeral
                                                    const hasFuneral = hall.schedules.some(s => s.slot_type === '葬儀')
                                                    const canFuneral = !isTomobiki && testMin <= 12 * 60 && !hasFuneral

                                                    // Check Wake possibility: Swap rules & 1 count limit
                                                    const hasWake = hall.schedules.some(s => s.slot_type === '通夜')
                                                    let canWake = !hasWake
                                                    const existingFuneral = hall.schedules.find(s => s.slot_type === '葬儀')
                                                    if (existingFuneral) {
                                                        const fMin = timeToMin(existingFuneral.ceremony_time || null)
                                                        if (fMin !== null) {
                                                            if (blockMin !== null && fMin >= blockMin) canWake = false
                                                            if (canWake && condMin !== null && reqMin !== null && fMin >= condMin && testMin < reqMin) {
                                                                canWake = false
                                                            }
                                                        }
                                                    }

                                                    // Also check if slot is blocked by an existing wake (Swap rule for Funeral)
                                                    let canFuneralWithExistingWake = canFuneral
                                                    const existingWake = hall.schedules.find(s => s.slot_type === '通夜')
                                                    if (existingWake) {
                                                        const wMin = timeToMin(existingWake.ceremony_time || null)
                                                        if (wMin !== null) {
                                                            if (blockMin !== null && testMin >= blockMin) canFuneralWithExistingWake = false
                                                            if (canFuneralWithExistingWake && condMin !== null && reqMin !== null && testMin >= condMin && wMin < reqMin) {
                                                                canFuneralWithExistingWake = false
                                                            }
                                                        }
                                                    }

                                                    const isRestricted = !canWake && !canFuneralWithExistingWake

                                                    if (isRestricted) {
                                                        return (
                                                            <div
                                                                key={`slot-${hall.id}-${hour}`}
                                                                className="block border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 rounded-md p-3 flex items-center justify-between text-slate-300 dark:text-slate-700 mb-2 cursor-not-allowed opacity-60"
                                                            >
                                                                <span className="font-medium text-lg">{timeStr}</span>
                                                                <span className="text-[10px]">予約不可</span>
                                                            </div>
                                                        )
                                                    }

                                                    // いずれかが不可な場合は少し透過させる
                                                    const isPartiallyRestricted = !canWake || !canFuneralWithExistingWake

                                                    // ラベルの決定
                                                    let statusLabel: React.ReactNode = "空き"
                                                    if (!canFuneralWithExistingWake && canWake) {
                                                        statusLabel = (
                                                            <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                                通夜のみ
                                                            </span>
                                                        )
                                                    } else if (canFuneralWithExistingWake && !canWake) {
                                                        statusLabel = (
                                                            <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                                葬儀のみ
                                                            </span>
                                                        )
                                                    }

                                                    return (
                                                        <Link
                                                            key={`slot-${hall.id}-${hour}`}
                                                            href={`/schedule/new?date=${dateStr}&hall_id=${hall.id}&time=${timeStr}&back_facility_id=${activeFacility.id}&back_date=${dateStr}`}
                                                            className={`block border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-3 flex items-center justify-between text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-primary hover:border-primary transition-colors mb-2 ${isPartiallyRestricted ? 'opacity-70 grayscale-[0.5]' : ''
                                                                }`}
                                                        >
                                                            <span className="font-medium text-lg">{timeStr}</span>
                                                            <span className="text-sm font-medium">{statusLabel}</span>
                                                        </Link>
                                                    )
                                                }
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                    <div className="flex justify-center mt-2 gap-1">
                        {facilities.map((_, idx) => (
                            <div
                                key={idx}
                                className={`h-1.5 w-1.5 rounded-full ${idx === activeFacilityIndex ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}


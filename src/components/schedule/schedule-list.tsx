'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2, ExternalLink, Edit2, X, Ban, PlusCircle } from 'lucide-react'
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

interface TurnoverRule {
    funeral_time: string
    min_wake_time?: string
    is_forbidden?: boolean
}

type Facility = {
    id: string
    name: string
    halls: Hall[]
    start_hour: number
    end_hour: number
    funeral_block_time?: string
    turnover_interval_hours?: number
    turnover_rules?: TurnoverRule[]
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

    const [tomobikiDates, setTomobikiDates] = useState<string[]>([])
    const [activeFacilityIndex, setActiveFacilityIndex] = useState(0)
    const [isInitialFacilitySet, setIsInitialFacilitySet] = useState(false)
    const [cremationVacancies, setCremationVacancies] = useState<CremationVacancy[]>([])
    const [isSyncing, setIsSyncing] = useState(false)

    // Touch state for swipe navigation
    const [touchStart, setTouchStart] = useState<{ x: number, y: number } | null>(null)

    // State for the slot selection menu
    const [selectedSlot, setSelectedSlot] = useState<{
        date: string;
        hallId: string;
        hallName: string;
        slotType: '葬儀' | '通夜';
        currentSchedule?: Schedule;
    } | null>(null)
    const [isSlotMenuOpen, setIsSlotMenuOpen] = useState(false)
    const [touchEnd, setTouchEnd] = useState<{ x: number, y: number } | null>(null)
    const minSwipeDistance = 100

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
        const startDateStr = format(targetDate, 'yyyy-MM-dd')
        const endDateStr = format(addDays(targetDate, 1), 'yyyy-MM-dd')

        try {
            // Fetch facilities with halls
            const { data: facilitiesData, error: facilitiesError } = await supabase
                .from('facilities')
                .select(`
                    id,
                    name,
                    start_hour,
                    end_hour,
                    funeral_block_time,
                    turnover_interval_hours,
                    turnover_rules,
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
                .select('date, is_tomobiki')
                .gte('date', startDateStr)
                .lte('date', endDateStr)

            if (signal?.ignore) return
            const tomobikiList = rokuyoData?.filter((r: any) => r.is_tomobiki).map((r: any) => r.date) || []
            setTomobikiDates(tomobikiList)

            // Fetch schedules for the target date
            const { data: schedulesData, error: schedulesError } = await supabase
                .from('schedules')
                .select('*')
                .gte('date', startDateStr)
                .lte('date', endDateStr)

            if (signal?.ignore) return
            if (schedulesError) throw schedulesError



            const formattedFacilities = (facilitiesData as unknown as Facility[]).map(facility => ({
                ...facility,
                start_hour: facility.start_hour ?? 9,
                end_hour: 22,
                halls: facility.halls.map(hall => {
                    const hallSchedules = (schedulesData as unknown as Schedule[])?.filter(s => s.hall_id === hall.id) || [];
                    return {
                        ...hall,
                        schedules: hallSchedules
                    };
                })
            }))

            setFacilities(formattedFacilities)

            // Fetch Cremation Vacancies if there's any Gamagori facility
            const hasGamagori = formattedFacilities.some(f => GAMAGORI_FACILITY_IDS.includes(f.id))
            if (hasGamagori) {
                const { data: cremationData } = await supabase
                    .from('cremation_vacancies')
                    .select('*')
                    .gte('date', startDateStr)
                    .lte('date', endDateStr)
                    .order('time')

                if (!signal?.ignore) {
                    // Sort data to ensure 9:30 comes before 10:00 (string sorting issue)
                    const sortedData = (cremationData || []).sort((a: CremationVacancy, b: CremationVacancy) => {
                        const pad = (s: string) => s.length === 4 ? '0' + s : s
                        return pad(a.time).localeCompare(pad(b.time))
                    })
                    setCremationVacancies(sortedData)
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
        setTouchStart({
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        })
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

    const handleToggleUnavailable = async (slot: {
        date: string;
        hallId: string;
        slotType: '葬儀' | '通夜';
        currentSchedule?: Schedule;
    }) => {
        if (slot.currentSchedule) {
            // Delete if unavailable
            if (slot.currentSchedule.status === 'unavailable') {
                try {
                    const { error } = await supabase
                        .from('schedules')
                        .delete()
                        .eq('id', slot.currentSchedule.id)

                    if (error) throw error
                    toast.success(`${slot.slotType}の枠を解放しました`)
                    fetchSchedules(currentDate, undefined, true)
                } catch (err) {
                    console.error(err)
                    toast.error("解放に失敗しました")
                }
            }
        } else {
            // Create unavailable
            try {
                const { error } = await supabase
                    .from('schedules')
                    .insert({
                        date: slot.date,
                        hall_id: slot.hallId,
                        slot_type: slot.slotType,
                        status: 'unavailable',
                        family_name: '（予約不可）',
                        ceremony_time: '00:00'
                    })

                if (error) throw error
                toast.success(`${slot.slotType}を予約不可に設定しました`)
                fetchSchedules(currentDate, undefined, true)
            } catch (err) {
                console.error(err)
                toast.error("設定に失敗しました")
            }
        }
        setIsSlotMenuOpen(false)
    }

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd({
            x: e.targetTouches[0].clientX,
            y: e.targetTouches[0].clientY
        })
    }

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return

        const dx = touchStart.x - touchEnd.x
        const dy = touchStart.y - touchEnd.y

        // 水平方向の移動が垂直方向の1.5倍以上あり、かつ一定距離以上移動した場合のみスワイプと判定
        if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > minSwipeDistance) {
            if (dx > 0) {
                // 左スワイプ (次へ)
                setActiveFacilityIndex(prev => (prev + 1) % facilities.length)
            } else if (dx < 0) {
                // 右スワイプ (前へ)
                setActiveFacilityIndex(prev => (prev - 1 + facilities.length) % facilities.length)
            }
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
                                    {format(currentDate, 'M月d日', { locale: ja })}〜{format(addDays(currentDate, 1), 'd日', { locale: ja })}
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
            {tomobikiDates.includes(format(currentDate, 'yyyy-MM-dd')) && !loading && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm">
                    <span className="font-bold bg-amber-200 dark:bg-amber-800 px-1.5 rounded">{format(currentDate, 'M/d')} 友引</span>
                    <span>本日は友引のため、葬儀の予約は制限されています。</span>
                </div>
            )}
            {tomobikiDates.includes(format(addDays(currentDate, 1), 'yyyy-MM-dd')) && !loading && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2 text-amber-800 dark:text-amber-300 text-sm mt-2">
                    <span className="font-bold bg-amber-200 dark:bg-amber-800 px-1.5 rounded">{format(addDays(currentDate, 1), 'M/d')} 友引</span>
                    <span>明日は友引のため、葬儀の予約は制限されています。</span>
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
                                                <DialogTitle className="text-left flex items-center gap-4">
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
                                                        {cremationVacancies.map((v, i) => (
                                                            <div key={`${v.date}-${v.time}-${i}`} className="flex flex-col items-center py-2 px-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                                                                <span className="text-[10px] text-slate-500 font-medium mb-1">{format(new Date(v.date), 'M/d')}</span>
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
                                        <div className="mb-4 font-bold text-lg text-slate-900 dark:text-slate-100 border-l-4 border-primary pl-2 flex items-center">
                                            <span>{hall.name}</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {[currentDate, addDays(currentDate, 1)].map((displayDate, index) => {
                                                const dateStr = format(displayDate, 'yyyy-MM-dd')
                                                const isTomobikiDay = tomobikiDates.includes(dateStr)
                                                const daySchedules = hall.schedules.filter(s => s.date === dateStr)

                                                const existingFuneral = daySchedules.find(s => s.slot_type === '葬儀')
                                                const existingWake = daySchedules.find(s => s.slot_type === '通夜')

                                                const hasFuneral = !!existingFuneral;
                                                const hasWake = !!existingWake;

                                                const timeToMin = (t: string | null) => {
                                                    if (!t) return null
                                                    const [h, m] = t.split(':').map(Number)
                                                    return h * 60 + m
                                                }

                                                // Determine the turnover constraint based on rules
                                                const getTurnoverConstraint = (fac: Facility, fTime: string | null) => {
                                                    if (!fTime) return { minWakeMin: null, isForbidden: false };
                                                    const fMin = timeToMin(fTime);
                                                    if (fMin === null) return { minWakeMin: null, isForbidden: false };

                                                    const rules = Array.isArray(fac.turnover_rules) ? fac.turnover_rules : [];
                                                    const exactRule = rules.find(r => r.funeral_time === fTime);
                                                    if (exactRule) {
                                                        return {
                                                            minWakeMin: exactRule.is_forbidden ? null : timeToMin(exactRule.min_wake_time || null),
                                                            isForbidden: !!exactRule.is_forbidden,
                                                            matchedRule: exactRule
                                                        };
                                                    }

                                                    const bMin = timeToMin(fac.funeral_block_time || null);
                                                    if (bMin !== null && fMin >= bMin) {
                                                        return { minWakeMin: null, isForbidden: true };
                                                    }

                                                    const iMin = (fac.turnover_interval_hours ?? 8) * 60;
                                                    return { minWakeMin: fMin + iMin, isForbidden: false };
                                                };

                                                // --- Funeral Logic ---
                                                let canAddFuneral = !isTomobikiDay && !existingFuneral;
                                                let funeralRestrictionDetail = "";
                                                if (isTomobikiDay && !existingFuneral) {
                                                    funeralRestrictionDetail = "友引のため不可";
                                                }

                                                // --- Wake Logic ---
                                                let canAddWake = !existingWake;
                                                let wakeRestrictionDetail = "";
                                                if (!existingWake && existingFuneral) {
                                                    const { minWakeMin, isForbidden, matchedRule } = getTurnoverConstraint(activeFacility, existingFuneral.ceremony_time || null);
                                                    if (isForbidden) {
                                                        canAddWake = false;
                                                        wakeRestrictionDetail = "ルールの設定により予約できません";
                                                    } else if (minWakeMin !== null) {
                                                        const h = Math.floor(minWakeMin / 60);
                                                        const m = minWakeMin % 60;
                                                        wakeRestrictionDetail = `${h}:${m.toString().padStart(2, '0')}以降で可能`;
                                                    }
                                                }

                                                const renderScheduleBlock = (slotType: '葬儀' | '通夜', schedule: Schedule | undefined, canAdd: boolean, restrictionDetail: string) => {
                                                    if (schedule) {
                                                        if (schedule.status === 'unavailable') {
                                                            return (
                                                                <div
                                                                    className="block border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 mb-2 flex flex-col relative overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                                                                    onClick={() => {
                                                                        setSelectedSlot({
                                                                            date: dateStr,
                                                                            hallId: hall.id,
                                                                            hallName: hall.name,
                                                                            slotType: slotType,
                                                                            currentSchedule: schedule
                                                                        })
                                                                        setIsSlotMenuOpen(true)
                                                                    }}
                                                                >
                                                                    <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(0,0,0,0.02) 15px, rgba(0,0,0,0.02) 16px)' }}></div>
                                                                    <div className="flex justify-between items-start mb-1 z-10">
                                                                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                                            {slotType}（不可）
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex flex-col items-center justify-center py-4 relative z-10">
                                                                        <div className="relative w-12 h-12 flex items-center justify-center text-slate-300 dark:text-slate-700">
                                                                            <div className="absolute w-full h-[2.5px] bg-current rotate-45 rounded-full"></div>
                                                                            <div className="absolute w-full h-[2.5px] bg-current -rotate-45 rounded-full"></div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        if (schedule.status === 'external') {
                                                            return (
                                                                <div className="block relative bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl p-3 mb-2 opacity-80" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)' }}>
                                                                    <Link href={`/schedule/${schedule.id}?back_facility_id=${activeFacility.id}&back_date=${dateStr}`} className="absolute inset-0 z-10 bg-transparent hover:bg-slate-400/10 transition-colors rounded-xl" />
                                                                    <div className="flex justify-between items-start mb-2 relative z-0">
                                                                        <span className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${slotType === '葬儀' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                                                                                {slotType}
                                                                            </span>
                                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                                                他社予約
                                                                            </span>
                                                                        </span>
                                                                        <span className="font-bold text-lg leading-none text-slate-500 dark:text-slate-400">{schedule.ceremony_time}</span>
                                                                    </div>
                                                                    <div className="font-bold text-sm text-slate-500 dark:text-slate-400 mt-2 relative z-0 flex items-center justify-between">
                                                                        <span>（斎場ブロック枠）</span>
                                                                        <span className="text-[10px] font-bold text-primary flex items-center gap-0.5 bg-primary/5 px-1.5 py-0.5 rounded-full border border-primary/10">
                                                                            変更する
                                                                            <ChevronRight className="h-2 w-2" />
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <Link href={`/schedule/${schedule.id}?back_facility_id=${activeFacility.id}&back_date=${dateStr}`} className="block bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm hover:border-primary transition-colors mb-2 group relative overflow-hidden">
                                                                <div className={`absolute top-0 left-0 bottom-0 w-1 ${slotType === '葬儀' ? 'bg-purple-500' : 'bg-orange-500'}`} />
                                                                <div className="flex justify-between items-start mb-1 pl-1.5">
                                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${slotType === '葬儀' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300' : 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'}`}>
                                                                        {slotType}
                                                                    </span>
                                                                    <span className="font-bold text-xl leading-none tracking-tight text-slate-900 dark:text-slate-100">{schedule.ceremony_time}</span>
                                                                </div>
                                                                <div className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-1.5 flex items-center justify-between pl-1.5">
                                                                    <span className="truncate pr-1">{schedule.family_name} 様</span>
                                                                    <span className="text-[10px] whitespace-nowrap font-bold text-primary flex items-center gap-0.5 bg-primary/5 px-1.5 py-0.5 rounded-full border border-primary/10">
                                                                        変更する
                                                                        <ChevronRight className="h-2 w-2" />
                                                                    </span>
                                                                </div>
                                                                {schedule.remarks && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-md ml-1.5">{schedule.remarks}</div>}
                                                                {schedule.status === 'preparing' && <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-900/20 inline-block px-1.5 py-0.5 rounded ml-1.5">※仮予約</div>}
                                                            </Link>
                                                        );
                                                    }

                                                    // Empty state
                                                    if (!canAdd) {
                                                        const reason = restrictionDetail || '予約不可';
                                                        return (
                                                            <div className="block border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 rounded-xl p-3 mb-2 flex flex-col opacity-60 relative overflow-hidden">
                                                                <div className={`absolute top-0 left-0 bottom-0 w-1 ${slotType === '葬儀' ? 'bg-slate-300 dark:bg-slate-700' : 'bg-slate-300 dark:bg-slate-700'}`} />
                                                                <div className="flex justify-between items-start mb-1 pl-1.5">
                                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${slotType === '葬儀' ? 'bg-purple-100/50 text-purple-700/50 dark:bg-purple-900/10 dark:text-purple-300/50' : 'bg-orange-100/50 text-orange-700/50 dark:bg-orange-900/10 dark:text-orange-300/50'}`}>
                                                                        {slotType}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-col items-center justify-center py-3 text-center px-2">
                                                                    <span className="text-sm font-bold text-red-500 mb-0.5">予約不可</span>
                                                                    <span className="text-[11px] font-medium text-slate-500 leading-tight">{reason}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            className="block border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-primary/50 transition-colors flex flex-col mb-2 group relative overflow-hidden cursor-pointer"
                                                            onClick={() => {
                                                                setSelectedSlot({
                                                                    date: dateStr,
                                                                    hallId: hall.id,
                                                                    hallName: hall.name,
                                                                    slotType: slotType
                                                                })
                                                                setIsSlotMenuOpen(true)
                                                            }}
                                                        >
                                                            <div className={`absolute top-0 left-0 bottom-0 w-1 opacity-30 group-hover:opacity-100 transition-opacity ${slotType === '葬儀' ? 'bg-purple-400' : 'bg-orange-400'}`} />
                                                            <div className="flex justify-between items-start mb-1 pl-1.5">
                                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold opacity-60 group-hover:opacity-100 transition-opacity ${slotType === '葬儀' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                                                                    {slotType}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col items-center justify-center py-3 pl-1.5">
                                                                <span className="text-sm font-bold text-slate-400 group-hover:text-primary transition-colors">＋ 登録</span>
                                                                {restrictionDetail && <span className="text-[11px] font-medium text-blue-500 dark:text-blue-400 mt-0.5">{restrictionDetail}</span>}
                                                            </div>
                                                        </div>
                                                    );
                                                };

                                                return (
                                                    <div key={dateStr} className={`border border-slate-200 dark:border-slate-800 rounded-lg p-3 ${isTomobikiDay ? 'bg-amber-50/30 dark:bg-amber-900/5' : 'bg-white dark:bg-slate-900'} relative`}>
                                                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-[15px]">{format(displayDate, 'M/d(E)', { locale: ja })}</span>
                                                                {isTomobikiDay && <span className="text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1 rounded font-bold">友引</span>}
                                                            </div>
                                                        </div>

                                                        {/* ホール・日単位の制約告知 */}
                                                        {(() => {
                                                            if (hasFuneral) {
                                                                return (
                                                                    <div className="mb-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-900/40 rounded text-[10px] text-slate-500 flex items-start gap-1.5 ring-1 ring-slate-200 dark:ring-slate-800 leading-tight">
                                                                        <span className="text-orange-500 mt-0.5">●</span>
                                                                        <div>葬儀予約があるため、一部の時間帯で通夜の登録が制限されています</div>
                                                                    </div>
                                                                );
                                                            }
                                                            if (hasWake) {
                                                                return (
                                                                    <div className="mb-3 px-2 py-1.5 bg-slate-50 dark:bg-slate-900/40 rounded text-[10px] text-slate-500 flex items-start gap-1.5 ring-1 ring-slate-200 dark:ring-slate-800 leading-tight">
                                                                        <span className="text-purple-500 mt-0.5">●</span>
                                                                        <div>通夜予約があるため、一部の時間帯で葬儀の登録が制限されています</div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}

                                                        <div className="space-y-1.5">
                                                            <div className="flex flex-col gap-2">
                                                                {renderScheduleBlock('葬儀', existingFuneral, canAddFuneral, funeralRestrictionDetail)}
                                                                {renderScheduleBlock('通夜', existingWake, canAddWake, wakeRestrictionDetail)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
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
            {/* スロット操作メニュー */}
            {selectedSlot && (
                <Dialog open={isSlotMenuOpen} onOpenChange={setIsSlotMenuOpen}>
                    <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none shadow-2xl">
                        <DialogHeader className="p-6 pb-4 bg-slate-50 dark:bg-slate-900/50">
                            <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-primary" />
                                {format(new Date(selectedSlot.date), 'M月d日(E)', { locale: ja })} - {selectedSlot.hallName}
                            </DialogTitle>
                            <p className="text-sm text-slate-500 mt-1">{selectedSlot.slotType}枠の操作を選択してください</p>
                        </DialogHeader>
                        <div className="p-4 space-y-3">
                            {selectedSlot.currentSchedule?.status === 'unavailable' ? (
                                <Button
                                    className="w-full h-14 text-base font-bold flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 shadow-sm transition-all"
                                    onClick={() => handleToggleUnavailable(selectedSlot)}
                                >
                                    <PlusCircle className="h-6 w-6 text-emerald-500" />
                                    予約受付を再開する（解放）
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        className="w-full h-14 text-base font-bold flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 shadow-sm transition-all"
                                        asChild
                                    >
                                        <Link href={`/schedule/new?date=${selectedSlot.date}&hall_id=${selectedSlot.hallId}&slot_type=${selectedSlot.slotType}&back_facility_id=${activeFacility.id}&back_date=${selectedSlot.date}`}>
                                            <Edit2 className="h-5 w-5 text-primary" />
                                            予約を登録する
                                        </Link>
                                    </Button>

                                    <Button
                                        variant="outline"
                                        className="w-full h-14 text-base font-bold flex items-center justify-center gap-3 border-2 border-amber-100 bg-amber-50/30 hover:bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-950/40 transition-all"
                                        onClick={() => handleToggleUnavailable(selectedSlot)}
                                    >
                                        <Ban className="h-5 w-5" />
                                        この枠を予約不可にする
                                    </Button>
                                </>
                            )}

                            <Button
                                variant="ghost"
                                className="w-full h-12 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                onClick={() => setIsSlotMenuOpen(false)}
                            >
                                キャンセル
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}



'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, startOfMonth, endOfMonth, addDays, startOfDay, isToday } from 'date-fns'
import { ja } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import Link from 'next/link'
import { FAMILY_COLORS, getFamilyColorIndex } from '@/lib/constants'

type Rokuyo = {
    date: string
    rokuyo: string
    is_tomobiki: boolean
}

type Hall = {
    id: string
    name: string
    facility_id: string
}

type Facility = {
    id: string
    name: string
    halls: Hall[]
}

type Schedule = {
    id: string
    hall_id: string
    date: string
    slot_type: '葬儀' | '通夜'
    status: 'available' | 'occupied' | 'preparing' | 'external'
    ceremony_time?: string
    family_name?: string
    color_index?: number
}

type CalendarMode = 'week' | 'month'

export function CalendarView() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [mode, setMode] = useState<CalendarMode>('week')
    const [rokuyoData, setRokuyoData] = useState<Record<string, Rokuyo>>({})
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()
    const scrollContainerRef = React.useRef<HTMLDivElement>(null)
    const todayRef = React.useRef<HTMLTableCellElement>(null)

    const days = React.useMemo(() => {
        let start: Date
        let end: Date

        if (mode === 'week') {
            start = startOfWeek(currentDate, { weekStartsOn: 0 }) // Sunday start
            end = endOfWeek(currentDate, { weekStartsOn: 0 })
        } else {
            start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 })
            end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
        }

        return eachDayOfInterval({ start, end })
    }, [currentDate, mode])

    const fetchData = useCallback(async (signal?: { ignore: boolean }) => {
        if (days.length === 0) return
        setLoading(true)
        const startDateStr = format(days[0], 'yyyy-MM-dd')
        const endDateStr = format(days[days.length - 1], 'yyyy-MM-dd')

        try {
            // Fetch Facilities & Halls (Master Data)
            const { data: facilitiesRes } = await supabase
                .from('facilities')
                .select(`
            id,
            name,
            halls (
            id,
            name,
            facility_id
            )
        `)
                .order('name');

            if (signal?.ignore) return
            if (facilitiesRes) {
                setFacilities(facilitiesRes as unknown as Facility[])
            }

            // Fetch Rokuyo
            const { data: rokuyoRes } = await supabase
                .from('rokuyo')
                .select('*')
                .gte('date', startDateStr)
                .lte('date', endDateStr)

            if (signal?.ignore) return
            if (rokuyoRes) {
                const map: Record<string, Rokuyo> = {}
                rokuyoRes.forEach((r: Rokuyo) => {
                    map[r.date] = r
                })
                setRokuyoData(map)
            }

            // Fetch Schedules
            const { data: scheduleRes } = await supabase
                .from('schedules')
                .select(`
            id,
            hall_id,
            date,
            slot_type,
            status,
            ceremony_time,
            family_name,
            color_index
        `)
                .gte('date', startDateStr)
                .lte('date', endDateStr)

            if (signal?.ignore) return
            if (scheduleRes) {
                setSchedules(scheduleRes as unknown as Schedule[])
            }
        } catch (error) {
            console.error("Error fetching data:", error)
        } finally {
            if (!signal?.ignore) setLoading(false)
        }
    }, [days, supabase])

    useEffect(() => {
        if (!loading && todayRef.current && scrollContainerRef.current) {
            const container = scrollContainerRef.current
            const todayElement = todayRef.current
            const scrollLeft = todayElement.offsetLeft - container.offsetWidth / 2 + todayElement.offsetWidth / 2
            container.scrollTo({ left: scrollLeft, behavior: 'smooth' })
        }
    }, [loading, mode])

    useEffect(() => {
        let ignore = false
        const signal = { ignore }

        fetchData(signal)

        // Subscribe to real-time updates
        const channel = supabase
            .channel('calendar-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
                fetchData(signal)
            })
            .subscribe()

        return () => {
            signal.ignore = true
            supabase.removeChannel(channel)
        }
    }, [fetchData, supabase])
    // Refetch on fetchData change

    const handlePrev = () => {
        if (mode === 'week') {
            setCurrentDate(subWeeks(currentDate, 1))
        } else {
            const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
            setCurrentDate(prevMonth)
        }
    }

    const handleNext = () => {
        if (mode === 'week') {
            setCurrentDate(addWeeks(currentDate, 1))
        } else {
            const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
            setCurrentDate(nextMonth)
        }
    }

    const handleToday = () => {
        setCurrentDate(new Date())
    }

    const getSchedules = (hallId: string, dateStr: string) => {
        return schedules
            .filter(s => s.hall_id === hallId && s.date === dateStr)
            .sort((a, b) => (a.ceremony_time || '').localeCompare(b.ceremony_time || ''));
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-row flex-wrap items-center justify-between gap-1 sm:gap-4 bg-muted p-1 sm:p-2 rounded-lg">
                <div className="flex items-center gap-1 sm:gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrev} className="h-8 w-8 sm:h-9 sm:w-9">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm sm:text-lg font-bold min-w-[100px] sm:min-w-[140px] text-center">
                        {format(currentDate, 'yyyy年 M月', { locale: ja })}
                    </span>
                    <Button variant="outline" size="icon" onClick={handleNext} className="h-8 w-8 sm:h-9 sm:w-9">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" onClick={handleToday} className="text-xs sm:text-sm px-2 sm:px-4">
                        今日
                    </Button>
                </div>

                <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as CalendarMode)} className="bg-background/50 p-0.5 rounded-md">
                    <ToggleGroupItem value="week" className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3">週</ToggleGroupItem>
                    <ToggleGroupItem value="month" className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3">月</ToggleGroupItem>
                </ToggleGroup>
            </div>

            <div ref={scrollContainerRef} className="relative overflow-auto border rounded-md max-h-[75vh] shadow-inner">
                <table className="w-full text-sm text-left border-separate border-spacing-0">
                    <thead className="bg-muted text-muted-foreground">
                        <tr>
                            <th className="p-2 border-b border-r sticky left-0 top-0 bg-muted z-50 font-medium min-w-[120px] sm:min-w-[150px] max-w-[120px] sm:max-w-[150px] text-center shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                                ホール / 日付
                            </th>
                            {days.map((day) => {
                                const dateStr = format(day, 'yyyy-MM-dd')
                                const rokuyo = rokuyoData[dateStr]
                                const isTomobiki = rokuyo?.is_tomobiki
                                const dayName = ['日', '月', '火', '水', '木', '金', '土'][day.getDay()]
                                const isSun = day.getDay() === 0
                                const isSat = day.getDay() === 6

                                return (
                                    <th
                                        key={dateStr}
                                        ref={isToday(day) ? todayRef : null}
                                        className={`p-0 border font-medium text-center min-w-[80px] sticky top-0 z-40 bg-muted ${isTomobiki ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                                    >
                                        <Link
                                            href={`/schedule?date=${dateStr}`}
                                            className="block p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            <div className={`${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : ''}`}>
                                                {format(day, 'd')} ({dayName})
                                            </div>
                                            {rokuyo && (
                                                <div className={`text-xs mt-1 ${isTomobiki ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                                    {rokuyo.rokuyo}
                                                </div>
                                            )}
                                        </Link>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={days.length + 1} className="p-8 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                </td>
                            </tr>
                        ) : (
                            facilities.map((facility: Facility) => (
                                <React.Fragment key={facility.id}>
                                    <tr className="bg-secondary/50">
                                        <td colSpan={days.length + 1} className="border-b bg-secondary/80 p-0">
                                            <div className="sticky left-0 w-max px-3 py-2 font-bold z-10 text-left">
                                                {facility.name}
                                            </div>
                                        </td>
                                    </tr>
                                    {facility.halls.map((hall: Hall) => (
                                        <tr key={hall.id}>
                                            <td className="p-2 border-b border-r sticky left-0 bg-white dark:bg-slate-900 z-20 font-medium whitespace-normal break-words text-gray-700 dark:text-gray-300 min-w-[120px] sm:min-w-[150px] max-w-[120px] sm:max-w-[150px] shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                                                {hall.name}
                                            </td>
                                            {days.map(day => {
                                                const dateStr = format(day, 'yyyy-MM-dd')
                                                const daySchedules = getSchedules(hall.id, dateStr)
                                                const rokuyo = rokuyoData[dateStr]
                                                const isTomobiki = rokuyo?.is_tomobiki
                                                return (
                                                    <td key={dateStr} className={`p-1 border relative min-h-[80px] align-middle ${isTomobiki ? 'bg-gray-50 dark:bg-gray-900/30' : ''
                                                        } group`}>
                                                        {/* Cell Background Link to List View */}
                                                        <Link
                                                            href={`/schedule?date=${dateStr}&facility_id=${facility.id}`}
                                                            className="absolute inset-0 z-0 bg-transparent hover:bg-slate-400/5 transition-colors"
                                                        />

                                                        {isTomobiki && (
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none z-0">
                                                                <span className="text-xl font-bold text-red-500 -rotate-12 whitespace-nowrap">友引</span>
                                                            </div>
                                                        )}

                                                        <div className="relative flex flex-col gap-1 z-10 pointer-events-none">
                                                            {daySchedules.map(schedule => {
                                                                const colorIndex = schedule.color_index ?? getFamilyColorIndex(schedule.family_name);
                                                                const colorMap = FAMILY_COLORS[colorIndex] || FAMILY_COLORS[0];

                                                                return (
                                                                    <Link
                                                                        href={`/schedule?date=${dateStr}&facility_id=${facility.id}`}
                                                                        key={schedule.id}
                                                                        className={`
                                                                            block rounded px-1.5 py-1 text-[10px] sm:text-[11px] font-medium text-white pointer-events-auto transition-colors
                                                                            ${schedule.status === 'external' ? 'bg-slate-400 hover:bg-slate-500' : colorMap.border + ' hover:brightness-110'}
                                                                        `}
                                                                        title={`${schedule.ceremony_time} ${schedule.slot_type} ${schedule.family_name || ''}`}
                                                                        style={schedule.status === 'external' ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.1) 4px, rgba(0,0,0,0.1) 8px)' } : undefined}
                                                                    >
                                                                        {schedule.status === 'external' ? (
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="opacity-90">{schedule.ceremony_time}</span>
                                                                                <span>他</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex flex-col leading-tight">
                                                                                <div className="flex items-center gap-1 opacity-90">
                                                                                    <span>{schedule.ceremony_time}</span>
                                                                                    <span>{schedule.slot_type === '通夜' ? '通' : '葬'}</span>
                                                                                </div>
                                                                                <div className="truncate font-bold">
                                                                                    {schedule.family_name} 様
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </Link>
                                                                );
                                                            })}

                                                            {/* New Reservation Link */}
                                                            <Link
                                                                href={`/schedule?date=${dateStr}&facility_id=${facility.id}`}
                                                                className="opacity-0 group-hover:opacity-100 flex items-center justify-center py-1 mt-1 text-xs text-muted-foreground border border-dashed border-transparent hover:border-slate-300 dark:hover:border-slate-700 rounded transition-all pointer-events-auto bg-white/80 dark:bg-slate-900/80"
                                                            >
                                                                ＋ 予約
                                                            </Link>
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div >
    )
}

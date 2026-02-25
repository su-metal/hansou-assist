'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import Link from 'next/link'

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
}

type CalendarMode = 'week' | 'month'

export function CalendarView() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [mode, setMode] = useState<CalendarMode>('week')
    const [rokuyoData, setRokuyoData] = useState<Record<string, Rokuyo>>({})
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [capacities, setCapacities] = useState<Record<string, number>>({}) // Key: "date_hallId"
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

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
            ceremony_time
        `)
                .gte('date', startDateStr)
                .lte('date', endDateStr)

            if (signal?.ignore) return
            if (scheduleRes) {
                setSchedules(scheduleRes as unknown as Schedule[])
            }
            // Fetch Capacities
            const { data: capacityRes } = await supabase
                .from('daily_capacities')
                .select('date, hall_id, max_count')
                .gte('date', startDateStr)
                .lte('date', endDateStr)

            if (signal?.ignore) return
            if (capacityRes) {
                const map: Record<string, number> = {}
                capacityRes.forEach((c: { date: string, hall_id: string, max_count: number }) => {
                    map[`${c.date}_${c.hall_id}`] = c.max_count
                })
                setCapacities(map)
            }
        } catch (error) {
            console.error("Error fetching data:", error)
        } finally {
            if (!signal?.ignore) setLoading(false)
        }
    }, [days, supabase])

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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_capacities' }, () => {
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
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-muted p-2 rounded-lg">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrev}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-lg font-bold min-w-[140px] text-center">
                        {format(currentDate, 'yyyy年 M月', { locale: ja })}
                    </span>
                    <Button variant="outline" size="icon" onClick={handleNext}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" onClick={handleToday}>
                        今日
                    </Button>
                </div>

                <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as CalendarMode)}>
                    <ToggleGroupItem value="week">週</ToggleGroupItem>
                    <ToggleGroupItem value="month">月</ToggleGroupItem>
                </ToggleGroup>
            </div>

            <div className="relative overflow-x-auto border rounded-md">
                <table className="w-full text-sm text-left border-separate border-spacing-0">
                    <thead className="bg-muted text-muted-foreground">
                        <tr>
                            <th className="p-2 border-b border-r sticky left-0 bg-muted z-30 font-medium min-w-[120px] sm:min-w-[150px] max-w-[120px] sm:max-w-[150px] text-center shadow-[1px_0_0_rgba(0,0,0,0.1)]">
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
                                    <th key={dateStr} className={`p-0 border font-medium text-center min-w-[80px] ${isTomobiki ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
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
                                            <div className="sticky left-0 w-max px-3 py-2 font-bold z-20 text-left">
                                                {facility.name}
                                            </div>
                                        </td>
                                    </tr>
                                    {facility.halls.map((hall: Hall) => (
                                        <tr key={hall.id}>
                                            <td className="p-2 border-b border-r sticky left-0 bg-white dark:bg-slate-900 z-20 font-medium truncate text-gray-700 dark:text-gray-300 min-w-[120px] sm:min-w-[150px] max-w-[120px] sm:max-w-[150px] shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                                                {hall.name}
                                            </td>
                                            {days.map(day => {
                                                const dateStr = format(day, 'yyyy-MM-dd')
                                                const daySchedules = getSchedules(hall.id, dateStr)
                                                const rokuyo = rokuyoData[dateStr]
                                                const isTomobiki = rokuyo?.is_tomobiki
                                                const maxCount = capacities[`${dateStr}_${hall.id}`]
                                                const isFull = maxCount !== undefined && daySchedules.length >= maxCount

                                                return (
                                                    <td key={dateStr} className={`p-1 border relative min-h-[80px] vertical-top ${isTomobiki ? 'bg-gray-50 dark:bg-gray-900/30' : ''
                                                        } ${isFull ? 'bg-red-50 dark:bg-red-900/20' : ''} group`}>
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
                                                            <div className="flex justify-end pr-1 pt-0.5">
                                                                {maxCount !== undefined ? (
                                                                    <span className={`text-[9px] font-bold px-1 rounded-sm ${isFull ? 'bg-red-500 text-white' : 'text-muted-foreground'}`}>
                                                                        {daySchedules.length} / {maxCount}
                                                                    </span>
                                                                ) : daySchedules.length > 0 ? (
                                                                    <span className="text-[9px] font-bold px-1 rounded-sm text-yellow-600 dark:text-yellow-400">
                                                                        {daySchedules.length}件
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            {daySchedules.map(schedule => (
                                                                <Link
                                                                    href={`/schedule?date=${dateStr}&facility_id=${facility.id}`}
                                                                    key={schedule.id}
                                                                    className={`
                                                                        block rounded px-1.5 py-0.5 text-[11px] font-medium text-white truncate pointer-events-auto
                                                                        ${schedule.status === 'external' ? 'bg-slate-400 hover:bg-slate-500' :
                                                                            schedule.status === 'occupied' ? 'bg-red-500 hover:bg-red-600' :
                                                                                schedule.status === 'preparing' ? 'bg-amber-500 hover:bg-amber-600' :
                                                                                    'bg-emerald-500 hover:bg-emerald-600'}
                                                                        transition-colors
                                                                    `}
                                                                    title={`${schedule.ceremony_time} ${schedule.slot_type}`}
                                                                    style={schedule.status === 'external' ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.1) 4px, rgba(0,0,0,0.1) 8px)' } : undefined}
                                                                >
                                                                    {schedule.status === 'external' ? (
                                                                        <>
                                                                            <span className="mr-1 opacity-90">{schedule.ceremony_time}</span>他
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <span className="mr-1 opacity-90">{schedule.ceremony_time}</span>
                                                                            {schedule.slot_type === '通夜' ? '通' : '葬'}
                                                                        </>
                                                                    )}
                                                                </Link>
                                                            ))}

                                                            {/* New Reservation Link */}
                                                            {maxCount === undefined ? (
                                                                <Link
                                                                    href={`/schedule?date=${dateStr}&facility_id=${facility.id}`}
                                                                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center py-1 mt-1 text-xs text-red-500 border border-dashed border-transparent hover:border-red-300 dark:hover:border-red-700 rounded transition-all pointer-events-auto bg-white/80 dark:bg-slate-900/80"
                                                                >
                                                                    枠未設定
                                                                </Link>
                                                            ) : (
                                                                <Link
                                                                    href={`/schedule?date=${dateStr}&facility_id=${facility.id}`}
                                                                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center py-1 mt-1 text-xs text-muted-foreground border border-dashed border-transparent hover:border-slate-300 dark:hover:border-slate-700 rounded transition-all pointer-events-auto bg-white/80 dark:bg-slate-900/80"
                                                                >
                                                                    ＋ 予約
                                                                </Link>
                                                            )}
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

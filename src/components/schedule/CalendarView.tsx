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
    status: 'available' | 'occupied' | 'preparing'
    ceremony_time?: string
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

    const fetchData = useCallback(async () => {
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

            if (facilitiesRes) {
                setFacilities(facilitiesRes as unknown as Facility[])
            }

            // Fetch Rokuyo
            const { data: rokuyoRes } = await supabase
                .from('rokuyo')
                .select('*')
                .gte('date', startDateStr)
                .lte('date', endDateStr)

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

            if (scheduleRes) {
                setSchedules(scheduleRes as unknown as Schedule[])
            }
        } catch (error) {
            console.error("Error fetching data:", error)
        } finally {
            setLoading(false)
        }
    }, [days, supabase])

    useEffect(() => {
        const init = async () => {
            await fetchData()
        }
        init()

        // Subscribe to real-time updates
        const channel = supabase
            .channel('calendar-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
                fetchData()
            })
            .subscribe()

        return () => {
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
                                    <th key={dateStr} className={`p-2 border font-medium text-center min-w-[80px] ${isTomobiki ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                                        <div className={`${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : ''}`}>
                                            {format(day, 'd')} ({dayName})
                                        </div>
                                        {rokuyo && (
                                            <div className={`text-xs mt-1 ${isTomobiki ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                                {rokuyo.rokuyo}
                                            </div>
                                        )}
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
                            facilities.map(facility => (
                                <React.Fragment key={facility.id}>
                                    <tr className="bg-secondary/50">
                                        <td colSpan={days.length + 1} className="border-b bg-secondary/80 p-0">
                                            <div className="sticky left-0 w-max px-3 py-2 font-bold z-20 text-left">
                                                {facility.name}
                                            </div>
                                        </td>
                                    </tr>
                                    {facility.halls.map(hall => (
                                        <tr key={hall.id}>
                                            <td className="p-2 border-b border-r sticky left-0 bg-white dark:bg-slate-900 z-20 font-medium truncate text-gray-700 dark:text-gray-300 min-w-[120px] sm:min-w-[150px] max-w-[120px] sm:max-w-[150px] shadow-[1px_0_0_rgba(0,0,0,0.1)]">
                                                {hall.name}
                                            </td>
                                            {days.map(day => {
                                                const dateStr = format(day, 'yyyy-MM-dd')
                                                const daySchedules = getSchedules(hall.id, dateStr)
                                                const rokuyo = rokuyoData[dateStr]
                                                const isTomobiki = rokuyo?.is_tomobiki

                                                return (
                                                    <td key={dateStr} className={`p-1 border relative min-h-[80px] vertical-top ${isTomobiki ? 'bg-gray-50 dark:bg-gray-900/30' : ''}`}>
                                                        {isTomobiki && (
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">
                                                                <span className="text-xl font-bold text-red-500 -rotate-12 whitespace-nowrap">友引</span>
                                                            </div>
                                                        )}

                                                        <div className="flex flex-col gap-1">
                                                            {daySchedules.map(schedule => (
                                                                <Link
                                                                    href={`/schedule/${schedule.id}`}
                                                                    key={schedule.id}
                                                                    className={`
                                                                        block rounded px-1.5 py-0.5 text-[11px] font-medium text-white truncate
                                                                        ${schedule.status === 'occupied' ? 'bg-red-500 hover:bg-red-600' :
                                                                            schedule.status === 'preparing' ? 'bg-amber-500 hover:bg-amber-600' :
                                                                                'bg-emerald-500 hover:bg-emerald-600'}
                                                                        transition-colors
                                                                    `}
                                                                    title={`${schedule.ceremony_time} ${schedule.slot_type}`}
                                                                >
                                                                    <span className="mr-1 opacity-90">{schedule.ceremony_time}</span>
                                                                    {schedule.slot_type === '通夜' ? '通' : '葬'}
                                                                </Link>
                                                            ))}

                                                            {/* New Reservation Link */}
                                                            <Link
                                                                href={`/schedule/new?date=${dateStr}&hall_id=${hall.id}`}
                                                                className="opacity-0 hover:opacity-100 flex items-center justify-center py-1 mt-1 text-xs text-muted-foreground border border-dashed border-transparent hover:border-slate-300 rounded transition-all"
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
        </div>
    )
}

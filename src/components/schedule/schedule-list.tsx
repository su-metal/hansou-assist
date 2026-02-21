'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
// ... imports

type Facility = {
    id: string
    name: string
    halls: Hall[]
    start_hour: number
    end_hour: number
}

type Hall = {
    id: string
    name: string
    schedules: Schedule[]
}

type Schedule = {
    id: string
    date: string
    family_name?: string
    slot_type: string
    status: string
    ceremony_time?: string
    hall_id?: string
}

export function ScheduleList() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    const [activeFacilityIndex, setActiveFacilityIndex] = useState(0)
    // ... touch state ...
    const [touchStart, setTouchStart] = useState<number | null>(null)
    const [touchEnd, setTouchEnd] = useState<number | null>(null)

    // Minimum swipe distance (in px)
    const minSwipeDistance = 50

    const fetchSchedules = useCallback(async () => {
        setLoading(true)
        const targetDate = format(currentDate, 'yyyy-MM-dd')

        // Fetch facilities with halls
        const { data: facilitiesData, error: facilitiesError } = await supabase
            .from('facilities')
            .select(`
                id,
                name,
                start_hour,
                end_hour,
                halls (
                    id,
                    name
                )
            `)
            .eq('is_active', true)
            .order('created_at')

        if (facilitiesError) {
            console.error('Error fetching facilities:', facilitiesError)
            setLoading(false)
            return
        }

        if (!facilitiesData) return

        // Fetch schedules for the target date
        const { data: schedulesData, error: schedulesError } = await supabase
            .from('schedules')
            .select('*')
            .eq('date', targetDate)

        if (schedulesError) {
            console.error('Error fetching schedules:', schedulesError)
            setLoading(false)
            return
        }

        // Map schedules to halls
        const formattedFacilities = (facilitiesData as unknown as Facility[]).map(facility => ({
            ...facility,
            // Ensure defaults if null (though DB has defaults)
            start_hour: facility.start_hour ?? 9,
            end_hour: facility.end_hour ?? 18,
            halls: facility.halls.map(hall => ({
                ...hall,
                schedules: (schedulesData as unknown as Schedule[])?.filter(s => s.hall_id === hall.id) || []
            }))
        }))

        setFacilities(formattedFacilities)
        setLoading(false)
    }, [currentDate, supabase])

    useEffect(() => {
        const initSchedules = async () => {
            await fetchSchedules()
        }
        initSchedules()

        // Subscribe to realtime changes
        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'schedules',
                },
                () => {
                    fetchSchedules()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [fetchSchedules, supabase])

    // ... touch handlers ...
    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null)
        setTouchStart(e.targetTouches[0].clientX)
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
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {activeFacility.halls.map((hall) => (
                                    <div key={hall.id} className="p-4 flex flex-col hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <div className="mb-2 font-medium text-slate-900 dark:text-slate-100 border-l-4 border-primary pl-2">
                                            {hall.name}
                                        </div>
                                        <div className="space-y-2">
                                            {timeSlots.map(hour => {
                                                const timeStr = `${hour}:00`;
                                                // Find schedule for this hour
                                                // Assuming ceremony_time is string "HH:mm"
                                                const schedule = hall.schedules.find(s => {
                                                    // Loose matching: "10:00" matches "10:00" or start with "10:"
                                                    return s.ceremony_time === timeStr || s.ceremony_time?.startsWith(`${hour}:`)
                                                })

                                                if (schedule) {
                                                    return (
                                                        <Link
                                                            href={`/schedule/${schedule.id}`}
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
                                                            {schedule.status === 'preparing' && (
                                                                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                                    ※仮予約
                                                                </div>
                                                            )}
                                                        </Link>
                                                    )
                                                } else {
                                                    // Empty slot
                                                    const dateStr = format(currentDate, 'yyyy-MM-dd')
                                                    return (
                                                        <Link
                                                            key={`slot-${hall.id}-${hour}`}
                                                            href={`/schedule/new?date=${dateStr}&hall_id=${hall.id}&time=${timeStr}`}
                                                            className="block border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-3 flex items-center justify-between text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-primary hover:border-primary transition-colors mb-2"
                                                        >
                                                            <span className="font-medium text-lg">{timeStr}</span>
                                                            <span className="text-sm">空き</span>
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


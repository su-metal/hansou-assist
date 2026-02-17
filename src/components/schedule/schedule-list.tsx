'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

type Facility = {
    id: string
    name: string
    halls: Hall[]
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

    const fetchSchedules = useCallback(async () => {
        setLoading(true)
        const targetDate = format(currentDate, 'yyyy-MM-dd')

        // Fetch facilities with halls
        const { data: facilitiesData, error: facilitiesError } = await supabase
            .from('facilities')
            .select(`
                id,
                name,
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

    const handlePrevDay = () => setCurrentDate(subDays(currentDate, 1))
    const handleNextDay = () => setCurrentDate(addDays(currentDate, 1))
    const handleToday = () => setCurrentDate(new Date())

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                <div className="flex items-center space-x-4">
                    <Button variant="outline" size="icon" onClick={handlePrevDay}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-xl font-bold">
                        {format(currentDate, 'yyyy年 M月 d日 (E)', { locale: ja })}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleNextDay}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <Button variant="outline" onClick={handleToday}>
                    今日に戻る
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid gap-6">
                    {facilities.map((facility) => (
                        <Card key={facility.id} className="overflow-hidden">
                            <CardHeader className="bg-slate-50 dark:bg-slate-900 py-3">
                                <CardTitle className="text-lg font-medium">{facility.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {facility.halls.map((hall) => (
                                        <div key={hall.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <div className="md:w-1/4 mb-2 md:mb-0">
                                                <div className="font-medium text-slate-900 dark:text-slate-100">{hall.name}</div>
                                            </div>
                                            <div className="flex-1">
                                                {hall.schedules.length > 0 ? (
                                                    hall.schedules.map((schedule) => (
                                                        <div key={schedule.id} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded p-3 text-sm">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${schedule.slot_type === '葬儀' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                                                    }`}>
                                                                    {schedule.slot_type}
                                                                </span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-200">{schedule.ceremony_time}</span>
                                                            </div>
                                                            <div className="font-bold text-lg text-slate-900 dark:text-slate-100">
                                                                {schedule.family_name} 様
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-slate-400 text-sm italic py-2">
                                                        予定なし (空き)
                                                    </div>
                                                )}
                                            </div>
                                            <div className="md:w-1/6 mt-2 md:mt-0 flex justify-end">
                                                {/* Action buttons will go here */}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}

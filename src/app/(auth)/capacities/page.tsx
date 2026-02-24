"use client"

import { createClient } from '@/lib/supabase/client'
import { format, addDays, subDays, eachDayOfInterval, startOfDay, isToday } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import * as React from "react" // Keep React import for React.useState, React.useEffect etc.
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
interface Hall {
    id: string;
    name: string;
}

interface Facility {
    id: string;
    name: string;
    halls: Hall[];
}

interface DailyCapacity {
    id?: string;
    date: string;
    hall_id: string;
    max_count?: number;
}

export default function CapacitiesPage() {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <CapacitiesPageContent />
        </Suspense>
    )
}

function CapacitiesPageContent() {
    const supabase = createClient()
    const searchParams = useSearchParams()

    // Parse URL parameters for initial state
    const initialDateParam = searchParams.get('date')
    const initialHallId = searchParams.get('hall_id')
    const initialDate = initialDateParam ? startOfDay(new Date(initialDateParam)) : startOfDay(new Date())

    const [startDate, setStartDate] = React.useState(initialDate)
    const [facilities, setFacilities] = React.useState<Facility[]>([])
    const [selectedHallId, setSelectedHallId] = React.useState<string>(initialHallId || "")
    const [capacities, setCapacities] = React.useState<Record<string, DailyCapacity>>({})
    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)

    // Load available facilities and their halls
    React.useEffect(() => {
        async function loadFacilities() {
            const { data, error } = await supabase
                .from('facilities')
                .select(`
                    id, 
                    name,
                    halls(id, name)
                `)
                .eq('is_active', true)
                .order('name')

            if (data && data.length > 0) {
                // @ts-ignore
                setFacilities(data)

                if (!initialHallId) {
                    for (const fac of data) {
                        // @ts-ignore
                        if (fac.halls && fac.halls.length > 0) {
                            // @ts-ignore
                            setSelectedHallId(fac.halls[0].id)
                            break
                        }
                    }
                }
            }
            setLoading(false)
        }
        loadFacilities()
    }, [supabase, initialHallId])

    const selectedHallDisplay = React.useMemo(() => {
        for (const fac of facilities) {
            const hall = fac.halls.find(h => h.id === selectedHallId)
            if (hall) return `${fac.name} - ${hall.name}`
        }
        return ""
    }, [facilities, selectedHallId])

    // Load capacities for the selected month and hall
    React.useEffect(() => {
        async function loadCapacities() {
            if (!selectedHallId) return
            setLoading(true)

            const startStr = format(startDate, "yyyy-MM-dd")
            const endStr = format(addDays(startDate, 6), "yyyy-MM-dd")

            const { data, error } = await supabase
                .from('daily_capacities')
                .select('*')
                .eq('hall_id', selectedHallId)
                .gte('date', startStr)
                .lte('date', endStr)

            if (data) {
                const capacityMap: Record<string, DailyCapacity> = {}
                data.forEach((c: DailyCapacity) => {
                    capacityMap[c.date] = c
                })
                setCapacities(capacityMap)
            }
            setLoading(false)
        }

        loadCapacities()
    }, [startDate, selectedHallId, supabase])

    const handlePreviousWeek = () => setStartDate(subDays(startDate, 7))
    const handleNextWeek = () => setStartDate(addDays(startDate, 7))

    const handleCapacityChange = (date: string, value: string) => {
        if (value === "") {
            setCapacities(prev => ({
                ...prev,
                [date]: {
                    ...(prev[date] || { date, hall_id: selectedHallId }),
                    max_count: undefined
                }
            }))
            return
        }

        const parsed = parseInt(value, 10)
        const count = isNaN(parsed) ? 0 : Math.max(0, Math.min(9, parsed))

        setCapacities(prev => ({
            ...prev,
            [date]: {
                ...(prev[date] || { date, hall_id: selectedHallId }),
                max_count: count
            }
        }))
    }

    const saveChanges = async () => {
        if (!selectedHallId) return
        setSaving(true)

        const valuesToSave = Object.values(capacities).filter(c => c.hall_id === selectedHallId)

        // Validate reductions against existing schedules
        const datesToCheck = valuesToSave.map(c => c.date);
        if (datesToCheck.length > 0) {
            const { data: existingSchedules, error: checkError } = await supabase
                .from('schedules')
                .select('date')
                .eq('hall_id', selectedHallId)
                .in('date', datesToCheck);

            if (checkError) {
                console.error("予約件数の確認に失敗しました:", checkError);
                toast.error("予約件数の確認中にエラーが発生しました");
                setSaving(false);
                return;
            }

            // Count existing schedules per date
            const scheduleCounts: Record<string, number> = {};
            existingSchedules?.forEach((s: { date: string }) => {
                scheduleCounts[s.date] = (scheduleCounts[s.date] || 0) + 1;
            });

            // Check if any reduction violates existing bookings
            for (const cap of valuesToSave) {
                const currentCount = scheduleCounts[cap.date] || 0;
                if (currentCount > 0) {
                    if (cap.max_count === undefined) {
                        toast.error(`${format(new Date(cap.date), 'M月d日', { locale: ja })}は既に${currentCount}件の予約があるため、未設定（0本）にすることはできません。`);
                        setSaving(false);
                        return;
                    } else if (cap.max_count < currentCount) {
                        toast.error(`${format(new Date(cap.date), 'M月d日', { locale: ja })}は既に${currentCount}件の予約があるため、上限を${cap.max_count}本に減らすことはできません。先に予約を変更・削除してください。`);
                        setSaving(false);
                        return;
                    }
                }
            }
        }

        let hasError = false
        for (const cap of valuesToSave) {
            if (cap.max_count === undefined) {
                // If it was an existing record and is now cleared, delete it.
                // If it's a new record and is cleared, just skip it.
                if (cap.id) {
                    const { error } = await supabase
                        .from('daily_capacities')
                        .delete()
                        .eq('id', cap.id)
                    if (error) {
                        console.error(error)
                        hasError = true
                    }
                }
                continue
            }

            const { error } = await supabase
                .from('daily_capacities')
                .upsert({
                    id: cap.id,
                    date: cap.date,
                    hall_id: cap.hall_id,
                    max_count: cap.max_count
                }, { onConflict: 'date, hall_id' })

            if (error) {
                console.error(error)
                hasError = true
            }
        }

        if (hasError) {
            toast.error("保存中にエラーが発生しました")
        } else {
            toast.success("受け入れ枠を保存しました")
        }
        setSaving(false)
    }

    const days = eachDayOfInterval({
        start: startDate,
        end: addDays(startDate, 6)
    })

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold">日別受け入れ枠設定</h1>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex-1 min-w-0">
                        <Select value={selectedHallId} onValueChange={setSelectedHallId}>
                            <SelectTrigger className="w-full sm:w-[300px] bg-card">
                                <SelectValue placeholder="ホールを選択">
                                    {selectedHallDisplay}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {facilities.map(facility => (
                                    <SelectGroup key={facility.id}>
                                        <SelectLabel className="font-bold bg-muted opacity-100 text-muted-foreground pl-2 py-1">
                                            {facility.name}
                                        </SelectLabel>
                                        {facility.halls.map(hall => (
                                            <SelectItem key={hall.id} value={hall.id} className="pl-6">
                                                {hall.name}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={saveChanges} disabled={saving || loading} className="shrink-0">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        保存
                    </Button>
                </div>
            </div>

            <div className="flex items-center justify-between bg-card p-4 rounded-lg shadow-sm">
                <Button variant="outline" size="icon" onClick={handlePreviousWeek}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-xl font-semibold sm:hidden text-center">
                    {format(startDate, 'M/d')} - {format(addDays(startDate, 6), 'M/d')}
                </h2>
                <h2 className="hidden sm:block text-xl font-semibold">
                    {format(startDate, 'yyyy年 M月 d日')} 〜 {format(addDays(startDate, 6), 'M月 d日')}
                </h2>
                <Button variant="outline" size="icon" onClick={handleNextWeek}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="space-y-3">
                {days.map(day => {
                    const dateStr = format(day, "yyyy-MM-dd")
                    const capacityValue = capacities[dateStr]?.max_count
                    const isTodayNow = isToday(day)

                    return (
                        <div
                            key={dateStr}
                            className={`flex items-center justify-between bg-card p-4 rounded-lg border shadow-sm ${isTodayNow ? 'ring-2 ring-primary ring-inset' : ''
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-full border ${isTodayNow ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30'
                                    }`}>
                                    <span className="text-xs">{format(day, 'E', { locale: ja })}</span>
                                    <span className="text-lg font-bold leading-none">{format(day, 'd')}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium">
                                        {format(day, 'M月 d日')}
                                    </span>
                                    {isTodayNow && <span className="text-[10px] text-primary font-bold">TODAY</span>}
                                </div>
                            </div>

                            {selectedHallId && (
                                <div className="flex items-center gap-3">
                                    <label className="text-sm font-medium text-muted-foreground">上限数:</label>
                                    <div className="flex items-center gap-1">
                                        <Select
                                            value={capacityValue !== undefined ? String(capacityValue) : "unset"}
                                            onValueChange={(val) => handleCapacityChange(dateStr, val === "unset" ? "" : val)}
                                        >
                                            <SelectTrigger className="w-20 h-10 text-center text-lg font-bold focus:ring-0">
                                                <SelectValue placeholder="-" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="unset">-</SelectItem>
                                                <SelectItem value="0">0</SelectItem>
                                                <SelectItem value="1">1</SelectItem>
                                                <SelectItem value="2">2</SelectItem>
                                                <SelectItem value="3">3</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-sm font-medium">本</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="mt-8 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground space-y-2">
                <p>※ 上限を 0 に設定すると、その日は予約不可になります。</p>
                <p>※ 未設定（-）の日付はスケジュール登録ができません。必ず受け入れ可能数を入力して保存してください。</p>
            </div>
        </div>
    )
}

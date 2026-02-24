
"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Loader2, X } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectLabel,
    SelectGroup,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// ... imports

interface Hall {
    id: string;
    name: string;
}

interface TurnoverRule {
    funeral_time: string
    min_wake_time?: string
    is_forbidden?: boolean
}

interface Facility {
    id: string;
    name: string;
    funeral_block_time: string | null;
    turnover_interval_hours: number | null;
    turnover_rules: TurnoverRule[] | null;
    halls: Hall[];
}

interface ScheduleFormProps {
    scheduleId?: string
    initialData?: {
        date?: string
        ceremony_time?: string
        hall_id?: string
        slot_type?: "葬儀" | "通夜"
        status?: "available" | "occupied" | "preparing" | "external"
        family_name?: string
        remarks?: string
    }
}

const formSchema = z.object({
    date: z.string().min(1, "日付を選択してください"),
    ceremony_time: z.string().min(1, "開始時刻を入力してください"),
    hall_id: z.string().min(1, "ホールを選択してください"),
    slot_type: z.enum(["葬儀", "通夜"]),
    status: z.enum(["available", "occupied", "preparing", "external"]),
    family_name: z.string().optional(),
    remarks: z.string().optional(),
}).refine(data => data.status === "external" || (data.family_name && data.family_name.trim().length > 0), {
    message: "喪家名を入力してください",
    path: ["family_name"],
})

export function ScheduleForm(props: ScheduleFormProps) {
    return (
        <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <ScheduleFormContent {...props} />
        </Suspense>
    )
}

function ScheduleFormContent({ scheduleId, initialData }: ScheduleFormProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const [loading, setLoading] = React.useState(false)
    const [facilities, setFacilities] = React.useState<Facility[]>([])
    const [tomobikiWarning, setTomobikiWarning] = React.useState(false)
    const [existingSchedules, setExistingSchedules] = React.useState<any[]>([])
    const [step, setStep] = React.useState<1 | 2>(initialData?.hall_id || scheduleId ? 2 : 1)

    // Context from URL to return to same view
    const backFacilityId = searchParams.get('back_facility_id') || searchParams.get('facility_id')
    const backDate = searchParams.get('back_date') || searchParams.get('date')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            date: initialData?.date || backDate || format(new Date(), "yyyy-MM-dd"),
            ceremony_time: initialData?.ceremony_time || "10:00",
            hall_id: initialData?.hall_id || searchParams.get('hall_id') || "",
            slot_type: initialData?.slot_type || (searchParams.get('slot_type') as any) || "葬儀",
            status: initialData?.status || "occupied",
            family_name: initialData?.family_name || "",
            remarks: initialData?.remarks || "",
        },
    })

    React.useEffect(() => {
        const fetchFacilities = async () => {
            const { data } = await supabase
                .from("facilities")
                .select(`
                    id,
                    name,
                    funeral_block_time,
                    turnover_interval_hours,
                    turnover_rules,
                    halls (
                        id,
                        name
                    )
                `)
                .order("name")

            if (data) {
                setFacilities(data)
            }
        }

        fetchFacilities()
    }, [supabase])

    const watchDate = form.watch("date")
    const watchHallId = form.watch("hall_id")
    const watchTime = form.watch("ceremony_time")
    const watchStatus = form.watch("status")

    // 以前は external の際に備考をクリアしていましたが、入力できるように変更しました

    const selectedHallDisplay = React.useMemo(() => {
        for (const fac of facilities) {
            const hall = fac.halls.find(h => h.id === watchHallId)
            if (hall) return `${fac.name} - ${hall.name}`
        }
        return ""
    }, [facilities, watchHallId])

    React.useEffect(() => {
        const checkRokuyo = async () => {
            if (!watchDate) {
                setTomobikiWarning(false)
                return
            }
            const dateStr = format(watchDate, "yyyy-MM-dd")
            const { data } = await supabase
                .from("rokuyo")
                .select("is_tomobiki")
                .eq("date", dateStr)
                .maybeSingle()

            const isTomobiki = !!data?.is_tomobiki
            setTomobikiWarning(isTomobiki)

            // 友引なのに「葬儀」が選択されている場合は「通夜」に強制変更
            if (isTomobiki && form.getValues("slot_type") === "葬儀") {
                form.setValue("slot_type", "通夜")
                toast.info("友引の日のため、種別を「通夜」に変更しました。")
            }
        }
        checkRokuyo()
    }, [watchDate, supabase, form])

    // 同じ日・同じホールの他予約を取得
    React.useEffect(() => {
        const fetchConflictSchedules = async () => {
            if (!watchDate || !watchHallId) {
                setExistingSchedules([])
                return
            }
            const dateStr = format(watchDate, "yyyy-MM-dd")
            let query = supabase
                .from('schedules')
                .select('id, slot_type, ceremony_time')
                .eq('date', dateStr)
                .eq('hall_id', watchHallId)

            if (scheduleId) {
                query = query.neq('id', scheduleId)
            }

            const { data } = await query
            setExistingSchedules(data || [])
        }
        fetchConflictSchedules()
    }, [watchDate, watchHallId, scheduleId, supabase])

    // 時間による種別の自動切り替え（廃止: ユーザーが手動で選べるようにするため削除）

    // 時間文字列（HH:mm または HH:mm:ss）を分単位の数値に変換
    const timeToMinutes = (timeStr: string | null): number | null => {
        if (!timeStr) return null;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    // 葬儀時間に基づき、通夜の最短時間または禁止設定を取得する
    const getTurnoverConstraint = (facility: Facility, funeralTimeStr: string | null) => {
        if (!funeralTimeStr) return { minWakeMin: null, isForbidden: false };

        const fMin = timeToMinutes(funeralTimeStr);
        if (fMin === null) return { minWakeMin: null, isForbidden: false };

        // 1. 個別マッピングルールのチェック（完全一致を優先し、なければその時間以降の最初のルールを探す）
        const rules = Array.isArray(facility.turnover_rules) ? facility.turnover_rules : [];
        const sortedRules = [...rules].sort((a, b) => (timeToMinutes(a.funeral_time) || 0) - (timeToMinutes(b.funeral_time) || 0));

        // 葬儀時間と完全に一致するルールがあるか確認
        const exactRule = sortedRules.find(r => timeToMinutes(r.funeral_time) === fMin);
        if (exactRule) {
            return {
                minWakeMin: exactRule.is_forbidden ? null : timeToMinutes(exactRule.min_wake_time || null),
                isForbidden: !!exactRule.is_forbidden,
                matchedRule: exactRule
            };
        }

        // 2. 「入替不可となる葬儀時間」のチェック
        const blockMin = timeToMinutes(facility.funeral_block_time);
        if (blockMin !== null && fMin >= blockMin) {
            return { minWakeMin: null, isForbidden: true, isByBlockTime: true };
        }

        // 3. インターバル時間の適用
        const intervalMin = (facility.turnover_interval_hours ?? 8) * 60;
        return { minWakeMin: fMin + intervalMin, isForbidden: false };
    };

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)

        // --- 友引の葬儀登録ブロック ---
        if (values.slot_type === '葬儀' && tomobikiWarning) {
            toast.error("友引の日のため、葬儀は登録できません。")
            setLoading(false)
            return
        }

        // --- 葬儀 12:00 制限 & 1件制限 ---
        if (values.slot_type === '葬儀') {
            if (values.ceremony_time > "12:00") {
                toast.error("葬儀の開始時間は12:00までです。")
                setLoading(false)
                return
            }
            const otherFuneral = existingSchedules.find(s => s.slot_type === '葬儀' && s.id !== scheduleId);
            if (otherFuneral) {
                toast.error("このホールには既に葬儀が登録されています。葬儀は1日1件までです。")
                setLoading(false)
                return
            }
        }

        // --- 通夜 1件制限 ---
        if (values.slot_type === '通夜') {
            const otherWake = existingSchedules.find(s => s.slot_type === '通夜' && s.id !== scheduleId);
            if (otherWake) {
                toast.error("このホールには既に通夜が登録されています。通夜は1日1件までです。")
                setLoading(false)
                return
            }
        }

        // --- 営業時間（22:00）制限 ---
        if (values.ceremony_time > "22:00") {
            toast.error("営業時間は22:00までです。それ以降の時間は登録できません。")
            setLoading(false)
            return
        }

        // 該当日・ホールの受け入れ枠（max_count）を取得
        const { data: capacityData, error: capacityError } = await supabase
            .from("daily_capacities")
            .select("max_count")
            .eq("date", values.date)
            .eq("hall_id", values.hall_id)
            .maybeSingle()

        if (capacityError) {
            console.error("受け入れ枠の取得に失敗しました:", capacityError)
            toast.error("受け入れ枠の取得時にエラーが発生しました。")
            setLoading(false)
            return
        }

        if (!capacityData) {
            toast.error("該当日の受け入れ枠が設定されていません。先に枠を設定してください。")
            setLoading(false)
            return
        }

        const maxCount = capacityData.max_count

        // --- 当日通夜受入・葬儀入替制限チェック ---
        const selectedFacility = facilities.find(f => f.halls.some(h => h.id === values.hall_id))

        // 既存データの編集で、開式時間もホールも変更されていない場合は、
        // 斎場設定の変更（例：インターバル時間の変更）によって既存予約が保存できなくなるのを防ぐためチェックをスキップする
        const isContextChanged = !initialData ||
            initialData.ceremony_time !== values.ceremony_time ||
            initialData.hall_id !== values.hall_id;

        if (selectedFacility && isContextChanged) {
            let existingQuery = supabase
                .from('schedules')
                .select('id, slot_type, ceremony_time')
                .eq('date', values.date)
                .eq('hall_id', values.hall_id)

            if (scheduleId) {
                existingQuery = existingQuery.neq('id', scheduleId)
            }

            const { data: existingSchedulesData, error: existingError } = await existingQuery

            if (!existingError && existingSchedulesData) {
                if (values.slot_type === '通夜') {
                    const existingFuneral = existingSchedulesData.find((s: any) => s.slot_type === '葬儀' && s.ceremony_time)
                    if (existingFuneral) {
                        const { minWakeMin, isForbidden, matchedRule } = getTurnoverConstraint(selectedFacility, existingFuneral.ceremony_time);
                        const wMin = timeToMinutes(values.ceremony_time);

                        if (isForbidden) {
                            toast.error(`同ホールで ${existingFuneral.ceremony_time} 開式の葬儀が予定されているため、この日の通夜は受け入れできません。`)
                            setLoading(false)
                            return
                        }

                        if (minWakeMin !== null && wMin !== null && wMin < minWakeMin) {
                            const minWakeTimeHour = Math.floor(minWakeMin / 60);
                            const minWakeTimeMin = minWakeMin % 60;
                            const formattedAllowedTime = `${minWakeTimeHour.toString().padStart(2, '0')}:${minWakeTimeMin.toString().padStart(2, '0')}`;
                            const reason = matchedRule ? "個別ルール" : `${selectedFacility.turnover_interval_hours ?? 8}時間ルール`;
                            toast.error(`同ホールの葬儀が ${existingFuneral.ceremony_time} 開式のため、通夜は ${formattedAllowedTime} 以降にする必要があります。(${reason})`)
                            setLoading(false)
                            return
                        }
                    }
                } else if (values.slot_type === '葬儀' && values.ceremony_time) {
                    const existingWake = existingSchedulesData.find((s: any) => s.slot_type === '通夜' && s.ceremony_time)
                    if (existingWake) {
                        const { minWakeMin, isForbidden } = getTurnoverConstraint(selectedFacility, values.ceremony_time);
                        const wMin = timeToMinutes(existingWake.ceremony_time);

                        if (isForbidden) {
                            toast.error(`すでに通夜の予約が入っているため、この時間の葬儀は登録できません。（斎場の制限により入替が禁止されています）`)
                            setLoading(false)
                            return
                        }

                        if (minWakeMin !== null && wMin !== null && minWakeMin > wMin) {
                            // 通夜の開始時間 wMin よりも、設定上の最短可能時間 minWakeMin の方が後になっている場合は、この葬儀は不可
                            toast.error(`すでに ${existingWake.ceremony_time} 開式の通夜が予約されているため、葬儀を ${values.ceremony_time} とすることはできません。（入替制限に抵触します）`)
                            setLoading(false)
                            return
                        }
                    }
                }
            }
        }

        // 既存の登録件数を取得 (更新の場合は自身を除外)
        let query = supabase
            .from("schedules")
            .select("*", { count: 'exact', head: true })
            .eq("date", values.date)
            .eq("hall_id", values.hall_id)

        if (scheduleId) {
            query = query.neq("id", scheduleId)
        }

        const { count, error: countError } = await query

        if (countError) {
            console.error("登録件数の取得に失敗しました:", countError)
            toast.error("登録件数の取得時にエラーが発生しました。")
            setLoading(false)
            return
        } else if (count !== null && count >= maxCount) {
            toast.error(`受け入れ可能本数（${maxCount}件）を超えています。現在の登録件数: ${count}件`)
            setLoading(false)
            return
        }

        // Supabase AuthのセッションからユーザーIDを取得
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            toast.error("ログインセッションが切れました。再ログインしてください。")
            router.push("/login")
            setLoading(false)
            return
        }

        let error;

        if (scheduleId) {
            // Update existing schedule
            const { error: updateError } = await supabase
                .from("schedules")
                .update({
                    date: values.date,
                    ceremony_time: values.ceremony_time,
                    hall_id: values.hall_id,
                    slot_type: values.slot_type,
                    status: values.status,
                    family_name: values.family_name,
                    remarks: values.remarks,
                })
                .eq('id', scheduleId)
            error = updateError;
        } else {
            // Insert new schedule
            const { error: insertError } = await supabase.from("schedules").insert({
                date: values.date,
                ceremony_time: values.ceremony_time,
                hall_id: values.hall_id,
                slot_type: values.slot_type,
                status: values.status,
                family_name: values.family_name,
                remarks: values.remarks,
                registered_by: session.user.id,
                source: 'manual'
            })
            error = insertError;
        }

        if (error) {
            console.error(error)
            toast.error(scheduleId ? "スケジュールの更新に失敗しました。" : "スケジュールの登録に失敗しました。")
        } else {
            toast.success(scheduleId ? "スケジュールを更新しました" : "スケジュールを登録しました")

            // Redirect with context
            const params = new URLSearchParams()
            if (backFacilityId) params.set('facility_id', backFacilityId)
            const redirectDate = values.date || backDate
            if (redirectDate) params.set('date', redirectDate)

            const redirectUrl = `/schedule${params.toString() ? `?${params.toString()}` : ''}`
            router.push(redirectUrl)
            router.refresh()
        }

        setLoading(false)
    }

    const handleDelete = async () => {
        if (!scheduleId) return

        const confirmDelete = window.confirm("このスケジュールを削除してもよろしいですか？")
        if (!confirmDelete) return

        setLoading(true)
        try {
            const { error } = await supabase
                .from("schedules")
                .delete()
                .eq("id", scheduleId)

            if (error) {
                console.error("Delete error:", error)
                toast.error("スケジュールの削除に失敗しました。")
            } else {
                toast.success("スケジュールを削除しました")

                const params = new URLSearchParams()
                if (backFacilityId) params.set('facility_id', backFacilityId)
                if (backDate) params.set('date', backDate)

                const redirectUrl = `/schedule${params.toString() ? `?${params.toString()}` : ''}`
                router.push(redirectUrl)
                router.refresh()
            }
        } catch (err) {
            console.error("Unexpected error during delete:", err)
            toast.error("予期せぬエラーが発生しました。")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-md mx-auto p-6 border rounded-lg bg-card text-card-foreground shadow-sm relative">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                        const params = new URLSearchParams()
                        if (backFacilityId) params.set('facility_id', backFacilityId)
                        if (backDate) params.set('date', backDate)
                        const redirectUrl = `/schedule${params.toString() ? `?${params.toString()}` : ''}`
                        router.push(redirectUrl)
                    }}
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">閉じる</span>
                </Button>

                <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>日付</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="ceremony_time"
                    render={({ field }) => {
                        const [hour, minute] = (field.value || "10:00").split(":");
                        const slotType = form.watch("slot_type");
                        const selectedFacility = facilities.find(f => f.halls.some(h => h.id === watchHallId));

                        const isTimeDisabled = (h: string, m: string) => {
                            if (!selectedFacility) return false;
                            const timeStr = `${h}:${m}`;
                            const testMin = timeToMinutes(timeStr);
                            if (testMin === null) return false;

                            // 葬儀・通夜は1日各1件まで
                            if (slotType === '葬儀') {
                                const otherFuneral = existingSchedules.find(s => s.slot_type === '葬儀' && s.id !== scheduleId);
                                if (otherFuneral) return true;
                            } else if (slotType === '通夜') {
                                const otherWake = existingSchedules.find(s => s.slot_type === '通夜' && s.id !== scheduleId);
                                if (otherWake) return true;
                            }

                            // 葬儀は12:00まで、通夜は12:00以降
                            if (slotType === '葬儀' && testMin > 12 * 60) return true;
                            if (slotType === '通夜' && testMin <= 12 * 60) return true;

                            if (slotType === '通夜') {
                                const funeral = existingSchedules.find(s => s.slot_type === '葬儀' && s.id !== scheduleId);
                                if (funeral) {
                                    const { minWakeMin, isForbidden } = getTurnoverConstraint(selectedFacility, funeral.ceremony_time);
                                    if (isForbidden) return true;
                                    if (minWakeMin !== null && testMin < minWakeMin) return true;
                                }
                            } else if (slotType === '葬儀') {
                                const wake = existingSchedules.find(s => s.slot_type === '通夜' && s.id !== scheduleId);
                                if (wake) {
                                    const { minWakeMin, isForbidden } = getTurnoverConstraint(selectedFacility, timeStr);
                                    if (isForbidden) return true;
                                    const wMin = timeToMinutes(wake.ceremony_time);
                                    if (minWakeMin !== null && wMin !== null && minWakeMin > wMin) return true;
                                }
                            }
                            return false;
                        };

                        return (
                            <FormItem>
                                <FormLabel>開始時刻</FormLabel>
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={hour}
                                        onValueChange={(h) => {
                                            const m = h === "22" ? "00" : minute;
                                            field.onChange(`${h}:${m}`);
                                        }}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-[120px]">
                                                <SelectValue placeholder="時" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {Array.from({ length: 14 }, (_, i) => {
                                                const h = (i + 9).toString().padStart(2, '0');
                                                // 00分も30分も両方ダメな時だけ時を無効化
                                                const disabled = isTimeDisabled(h, "00") && (h === "22" ? true : isTimeDisabled(h, "30"));
                                                return (
                                                    <SelectItem key={h} value={h} disabled={disabled}>
                                                        {h}時 {disabled && "(不可)"}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={minute}
                                        onValueChange={(m) => field.onChange(`${hour}:${m}`)}
                                        disabled={hour === "22"}
                                    >
                                        <FormControl>
                                            <SelectTrigger className="w-[120px]">
                                                <SelectValue placeholder="分" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {["00", "30"].map(m => {
                                                const disabled = isTimeDisabled(hour, m);
                                                return (
                                                    <SelectItem key={m} value={m} disabled={disabled}>
                                                        {m}分 {disabled && "(不可)"}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {(() => {
                                    if (!selectedFacility) return null;

                                    if (slotType === '通夜') {
                                        const funeral = existingSchedules.find(s => s.slot_type === '葬儀');
                                        if (funeral && funeral.ceremony_time) {
                                            const { minWakeMin, isForbidden, matchedRule } = getTurnoverConstraint(selectedFacility, funeral.ceremony_time);

                                            if (isForbidden) {
                                                return (
                                                    <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                                                        同ホールに{funeral.ceremony_time}開式の葬儀があるため、本日の通夜は受入不可です。
                                                    </p>
                                                );
                                            }

                                            if (minWakeMin !== null) {
                                                const minWakeTimeHour = Math.floor(minWakeMin / 60);
                                                const minWakeTimeMin = minWakeMin % 60;
                                                const formattedTime = `${minWakeTimeHour.toString().padStart(2, '0')}:${minWakeTimeMin.toString().padStart(2, '0')}`;
                                                const ruleInfo = matchedRule ? "個別ルール" : `${selectedFacility.turnover_interval_hours ?? 8}時間ルール`;

                                                return (
                                                    <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                                                        同ホールの葬儀(${funeral.ceremony_time})に基づき、通夜は{formattedTime}以降のみ選択可能です。({ruleInfo})
                                                    </p>
                                                );
                                            }
                                        }
                                    } else if (slotType === '葬儀') {
                                        const wake = existingSchedules.find(s => s.slot_type === '通夜');
                                        if (wake && wake.ceremony_time) {
                                            const wMin = timeToMinutes(wake.ceremony_time);
                                            if (wMin !== null) {
                                                // 葬儀時間の選択肢ごとにヒントを出すのは難しいため、現在の選択時間に基づいた判定を表示
                                                const { minWakeMin, isForbidden } = getTurnoverConstraint(selectedFacility, watchTime);

                                                if (isForbidden) {
                                                    return (
                                                        <p className="text-xs mt-1 text-red-500">
                                                            現在の葬儀時間({watchTime})は、斎場の制限により入替不可設定となっています。
                                                        </p>
                                                    );
                                                }

                                                if (minWakeMin !== null && minWakeMin > wMin) {
                                                    return (
                                                        <p className="text-xs mt-1 text-red-500">
                                                            現在の葬儀時間({watchTime})では、後続の通夜(${wake.ceremony_time})との入替時間が不足しています。
                                                        </p>
                                                    );
                                                }
                                            }
                                        }
                                    }
                                    return null;
                                })()}
                                <FormMessage />
                            </FormItem>
                        );
                    }}
                />

                {tomobikiWarning && (
                    <Alert variant="destructive">
                        <AlertTitle>注意：友引です</AlertTitle>
                        <AlertDescription>
                            この日は友引のため、葬儀の執り行いは避けるのが一般的です。
                        </AlertDescription>
                    </Alert>
                )}

                <FormField
                    control={form.control}
                    name="hall_id"
                    render={() => (
                        <FormItem>
                            <FormLabel>会場 (ホール)</FormLabel>
                            <div className="flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                                <span className="truncate">{selectedHallDisplay || "会場未選択"}</span>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {step === 1 ? (
                    <div className="flex flex-col gap-4 pt-4 border-t mt-4">
                        <Button
                            type="button"
                            className="w-full"
                            onClick={() => setStep(2)}
                            disabled={!watchDate || !watchTime || !watchHallId}
                        >
                            次へ (詳細入力)
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4 pt-4 border-t mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">詳細入力</h3>
                            {!scheduleId && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)} className="text-muted-foreground">
                                    戻る
                                </Button>
                            )}
                        </div>

                        <FormField
                            control={form.control}
                            name="family_name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>喪家名</FormLabel>
                                    <FormControl>
                                        <div className="flex items-center gap-2">
                                            <Input placeholder="例: 佐藤" {...field} />
                                            <span className="font-medium whitespace-nowrap">家 様</span>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="remarks"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>備考</FormLabel>
                                    <FormControl>
                                        <Input placeholder="自由入力" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="slot_type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>種別</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="種別を選択" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem
                                                value="葬儀"
                                                disabled={tomobikiWarning}
                                            >
                                                葬儀 {tomobikiWarning ? "(友引不可)" : ""}
                                            </SelectItem>
                                            <SelectItem
                                                value="通夜"
                                            >
                                                通夜
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="status"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>ステータス</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="ステータスを選択" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="occupied">自社予約 (確定)</SelectItem>
                                            <SelectItem value="preparing">自社予約 (仮)</SelectItem>
                                            <SelectItem value="external">他社利用 (斎場ブロック枠)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex flex-col gap-4 mt-6">
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {scheduleId ? "更新する" : "登録する"}
                            </Button>

                            {scheduleId && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    className="w-full"
                                    onClick={handleDelete}
                                    disabled={loading}
                                >
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    削除する
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </form>
        </Form>
    )
}

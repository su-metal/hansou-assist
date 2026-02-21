
"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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

interface Facility {
    id: string;
    name: string;
    halls: Hall[];
}

interface ScheduleFormProps {
    scheduleId?: string
    initialData?: {
        date?: string
        ceremony_time?: string
        hall_id?: string
        slot_type?: "葬儀" | "通夜"
        status?: "available" | "occupied" | "preparing"
        family_name?: string
        remarks?: string
    }
}

const formSchema = z.object({
    date: z.string().min(1, "日付を選択してください"),
    ceremony_time: z.string().min(1, "開始時刻を入力してください"),
    hall_id: z.string().min(1, "ホールを選択してください"),
    slot_type: z.enum(["葬儀", "通夜"]),
    status: z.enum(["available", "occupied", "preparing"]),
    family_name: z.string().min(1, "喪家名を入力してください"),
    remarks: z.string().optional(),
})

export function ScheduleForm({ scheduleId, initialData }: ScheduleFormProps) {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = React.useState(false)
    const [facilities, setFacilities] = React.useState<Facility[]>([])
    const [tomobikiWarning, setTomobikiWarning] = React.useState(false)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            date: initialData?.date || format(new Date(), "yyyy-MM-dd"),
            ceremony_time: initialData?.ceremony_time || "10:00",
            hall_id: initialData?.hall_id || "",
            slot_type: initialData?.slot_type || "葬儀",
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

            setTomobikiWarning(data?.is_tomobiki || false)
        }
        checkRokuyo()
    }, [watchDate, supabase])

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)

        // Supabase AuthのセッションからユーザーIDを取得
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            toast.error("ログインセッションが切れました。再ログインしてください。")
            router.push("/login")
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
                    // updated_by: session.user.id, // TODO: Add updated_by column if needed
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
            router.push("/schedule")
            router.refresh()
        }

        setLoading(false)
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-md mx-auto p-6 border rounded-lg bg-card text-card-foreground shadow-sm relative">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => router.push("/schedule")}
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
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>開始時刻</FormLabel>
                            <FormControl>
                                <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
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
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>会場 (ホール)</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="ホールを選択" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {facilities.map((facility) => (
                                        <SelectGroup key={facility.id}>
                                            <SelectLabel className="font-bold bg-muted opacity-100 text-muted-foreground pl-2 py-1">
                                                {facility.name}
                                            </SelectLabel>
                                            {facility.halls.map((hall) => (
                                                <SelectItem key={hall.id} value={hall.id} className="pl-6">
                                                    {hall.name}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

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
                                    <SelectItem value="葬儀">葬儀</SelectItem>
                                    <SelectItem value="通夜">通夜</SelectItem>
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
                                    <SelectItem value="occupied">使用中 (確定)</SelectItem>
                                    <SelectItem value="preparing">準備中 (仮予約)</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    登録する
                </Button>
            </form>
        </Form>
    )
}

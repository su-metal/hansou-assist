
"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

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
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface Hall {
    id: string;
    name: string;
}

interface Facility {
    id: string;
    name: string;
    halls: Hall[];
}

const formSchema = z.object({
    date: z.string().min(1, "日付を選択してください"),
    hall_id: z.string().min(1, "ホールを選択してください"),
    slot_type: z.enum(["葬儀", "通夜"]),
    status: z.enum(["available", "occupied", "preparing"]),
})

export function ScheduleForm() {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = React.useState(false)
    const [facilities, setFacilities] = React.useState<Facility[]>([])
    const [tomobikiWarning, setTomobikiWarning] = React.useState(false)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            date: format(new Date(), "yyyy-MM-dd"),
            slot_type: "葬儀",
            status: "occupied",
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

        const { error } = await supabase.from("schedules").insert({
            date: values.date,
            hall_id: values.hall_id,
            slot_type: values.slot_type,
            status: values.status,
        })

        if (error) {
            console.error(error)
            alert("登録に失敗しました")
        } else {
            router.push("/schedule")
            router.refresh()
        }

        setLoading(false)
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-md mx-auto p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
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
                                        <React.Fragment key={facility.id}>
                                            <SelectLabel className="font-bold bg-muted opacity-100 text-muted-foreground pl-2 py-1">
                                                {facility.name}
                                            </SelectLabel>
                                            {facility.halls.map((hall) => (
                                                <SelectItem key={hall.id} value={hall.id} className="pl-6">
                                                    {hall.name}
                                                </SelectItem>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </SelectContent>
                            </Select>
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

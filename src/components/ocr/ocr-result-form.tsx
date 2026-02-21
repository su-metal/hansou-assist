
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { CalendarIcon, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { ja } from "date-fns/locale"

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
} from "@/components/ui/select"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

// Define schema for a single schedule item
const scheduleItemSchema = z.object({
    date: z.string().min(1, "日付は必須です"),
    facility_name: z.string().optional(),
    hall_name: z.string().min(1, "ホール名は必須です"),
    slot_type: z.enum(["葬儀", "通夜", "その他"]),
    ceremony_time: z.string().optional(),
    family_name: z.string().optional(),
    status: z.enum(["available", "occupied", "preparing"]),
})

// Define schema for the form (array of items)
const formSchema = z.object({
    schedules: z.array(scheduleItemSchema),
})

interface OcrResultFormProps {
    initialData: z.infer<typeof scheduleItemSchema>[]
}

export function OcrResultForm({ initialData }: OcrResultFormProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            schedules: initialData,
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)

        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            toast.error("セッションが切れました。再ログインしてください。")
            setLoading(false)
            return
        }

        // In a real app, you'd map facility_name/hall_name to IDs here.
        // For this prototype, we'll try to find a matching hall by name text search or just fail gracefully.
        // Since we don't have a reliable name-to-id mapping yet, we'll just log what we WOULD do.

        // TODO: Implement fuzzy matching for Facility/Hall IDs based on names.
        // For now, let's just insert one by one and if hall_id is missing, we skip or error.
        // However, the current DB schemas REQUIRES hall_id.
        // So for the prototype, let's just simulate the success or fetch *a* hall for demo purposes?

        // Strategy for Phase 2:
        // Fetch all halls and try to match name. If no match, maybe use a "Default Hall" or just alert user.

        const { data: halls } = await supabase.from('halls').select('id, name, facilities(name)');

        let successes = 0;
        let errors = 0;

        for (const item of values.schedules) {
            // Simple exact match logic for prototype
            const matchedHall = halls?.find((h: any) =>
                h.name === item.hall_name ||
                (item.facility_name && h.facilities && !Array.isArray(h.facilities) && (h.facilities as any)?.name === item.facility_name && h.name.includes(item.hall_name))
            );

            if (!matchedHall) {
                console.warn(`No matching hall found for ${item.facility_name} - ${item.hall_name}`);
                errors++;
                continue; // Skip for now
            }

            const { error } = await supabase.from('schedules').insert({
                date: item.date,
                hall_id: matchedHall.id,
                slot_type: item.slot_type === "その他" ? "葬儀" : item.slot_type, // Fallback
                status: item.status,
                family_name: item.family_name,
                ceremony_time: item.ceremony_time,
                registered_by: session.user.id,
                source: 'ocr'
            });

            if (error) {
                console.error(error);
                errors++;
            } else {
                successes++;
            }
        }

        setLoading(false)
        if (successes > 0) {
            toast.success(`${successes}件のスケジュールを登録しました`);
            router.push("/schedule");
        }
        if (errors > 0) {
            toast.error(`${errors}件の登録に失敗しました（ホール名不一致など）`);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {form.watch("schedules").map((_, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-4 bg-card">
                        <h3 className="font-bold">予定 {index + 1}</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name={`schedules.${index}.date`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>日付</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="date" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name={`schedules.${index}.status`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>状態</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="状態を選択" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="available">空き</SelectItem>
                                                <SelectItem value="occupied">使用中</SelectItem>
                                                <SelectItem value="preparing">仮押さえ</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Facility Name (Read only / Suggestion) */}
                            <FormField
                                control={form.control}
                                name={`schedules.${index}.facility_name`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>施設名（検出）</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="施設名" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {/* Hall Name (Critical for matching) */}
                            <FormField
                                control={form.control}
                                name={`schedules.${index}.hall_name`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>ホール名</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="ホール名" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name={`schedules.${index}.family_name`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>喪家名</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="〇〇家" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name={`schedules.${index}.ceremony_time`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>開式時間</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="11:00" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                ))}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    すべて登録する
                </Button>
            </form>
        </Form>
    )
}

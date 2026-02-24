"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

interface Facility {
    id: string
    name: string
    funeral_conditional_time: string | null
    wake_required_time: string | null
    funeral_block_time: string | null
}

export default function AdminPage() {
    const supabase = createClient()
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const [savingId, setSavingId] = useState<string | null>(null)

    // Local state to hold changes before saving
    type EditedFacility = {
        funeral_conditional_time: string | null
        wake_required_time: string | null
        funeral_block_time: string | null
    }
    const [editedFacilities, setEditedFacilities] = useState<Record<string, EditedFacility>>({})

    useEffect(() => {
        const fetchFacilities = async () => {
            const { data, error } = await supabase
                .from("facilities")
                .select("id, name, funeral_conditional_time, wake_required_time, funeral_block_time")
                .order("name")

            if (error) {
                console.error("施設の取得に失敗しました:", error)
                toast.error("施設の取得時にエラーが発生しました。")
            } else if (data) {
                setFacilities(data)

                // Initialize edited state
                const initialEditedState: Record<string, EditedFacility> = {}
                data.forEach((f: any) => {
                    initialEditedState[f.id] = {
                        funeral_conditional_time: f.funeral_conditional_time,
                        wake_required_time: f.wake_required_time,
                        funeral_block_time: f.funeral_block_time,
                    }
                })
                setEditedFacilities(initialEditedState)
            }
            setLoading(false)
        }

        fetchFacilities()
    }, [supabase])

    const handleTimeChange = (id: string, field: keyof EditedFacility, time: string) => {
        setEditedFacilities(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: time === "" ? null : time
            }
        }))
    }

    const handleSave = async (facilityId: string) => {
        setSavingId(facilityId)
        const newSettings = editedFacilities[facilityId]

        const { error } = await supabase
            .from("facilities")
            .update({
                funeral_conditional_time: newSettings.funeral_conditional_time,
                wake_required_time: newSettings.wake_required_time,
                funeral_block_time: newSettings.funeral_block_time
            })
            .eq("id", facilityId)

        if (error) {
            console.error("設定の保存に失敗しました:", error)
            toast.error("設定の保存時にエラーが発生しました。")
        } else {
            toast.success("設定を保存しました。")
            // Update the main state to reflect saved changes
            setFacilities(prev =>
                prev.map(f => f.id === facilityId ? { ...f, ...newSettings } : f)
            )
        }
        setSavingId(null)
    }

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">設定 (マスタ管理)</h1>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 mb-6">
                <h2 className="text-lg font-semibold mb-2 border-b pb-2">斎場ごとの葬儀・通夜 入替制限</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    同日の同じホールにおける「葬儀の開式時間」と「後続の通夜」の制御ルールを設定します。未設定の項目は制限なしとして扱われます。
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
                    <li><strong>条件付き葬儀時間</strong>: この時間以降の葬儀の場合、通夜の時間に制限をかけます。</li>
                    <li><strong>通夜必須時間</strong>: 上記の条件に引っかかった場合、通夜はこの時間以降に設定する必要があります。</li>
                    <li><strong>入替不可となる葬儀時間</strong>: この時間以降の葬儀の場合は、同日の通夜の受け入れを完全にブロックします。</li>
                </ul>
            </div>

            <div className="space-y-4">
                {facilities.map((facility) => {
                    const currentValues = editedFacilities[facility.id] || {
                        funeral_conditional_time: null,
                        wake_required_time: null,
                        funeral_block_time: null
                    }

                    const isDirty =
                        currentValues.funeral_conditional_time !== facility.funeral_conditional_time ||
                        currentValues.wake_required_time !== facility.wake_required_time ||
                        currentValues.funeral_block_time !== facility.funeral_block_time

                    const isSaving = savingId === facility.id

                    return (
                        <div key={facility.id} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-2 border-b sm:border-0 border-gray-100 dark:border-gray-700">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 sm:mb-0">
                                    {facility.name}
                                </h3>
                                <Button
                                    size="sm"
                                    onClick={() => handleSave(facility.id)}
                                    disabled={!isDirty || isSaving}
                                    className="self-end sm:self-auto"
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                    <span>保存</span>
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        条件付き葬儀時間 <span className="text-xs text-gray-400 font-normal">(以降)</span>
                                    </label>
                                    <Input
                                        type="time"
                                        value={currentValues.funeral_conditional_time || ""}
                                        onChange={(e) => handleTimeChange(facility.id, "funeral_conditional_time", e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        通夜必須時間 <span className="text-xs text-gray-400 font-normal">(以降)</span>
                                    </label>
                                    <Input
                                        type="time"
                                        value={currentValues.wake_required_time || ""}
                                        onChange={(e) => handleTimeChange(facility.id, "wake_required_time", e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        入替不可葬儀時間 <span className="text-xs text-gray-400 font-normal">(以降)</span>
                                    </label>
                                    <Input
                                        type="time"
                                        value={currentValues.funeral_block_time || ""}
                                        onChange={(e) => handleTimeChange(facility.id, "funeral_block_time", e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

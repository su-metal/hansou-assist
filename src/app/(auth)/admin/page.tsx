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

interface TurnoverRule {
    funeral_time: string
    min_wake_time?: string
    is_forbidden?: boolean
}

interface Facility {
    id: string
    name: string
    funeral_block_time: string | null
    turnover_interval_hours: number | null
    turnover_rules: TurnoverRule[] | null
}

export default function AdminPage() {
    const supabase = createClient()
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const [savingId, setSavingId] = useState<string | null>(null)

    // Local state to hold changes before saving
    type EditedFacility = {
        funeral_block_time: string | null
        turnover_interval_hours: number | null
        turnover_rules: TurnoverRule[]
    }
    const [editedFacilities, setEditedFacilities] = useState<Record<string, EditedFacility>>({})
    const [isRulesExpanded, setIsRulesExpanded] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const fetchFacilities = async () => {
            const { data, error } = await supabase
                .from("facilities")
                .select("id, name, funeral_block_time, turnover_interval_hours, turnover_rules")
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
                        funeral_block_time: f.funeral_block_time,
                        turnover_interval_hours: f.turnover_interval_hours,
                        turnover_rules: Array.isArray(f.turnover_rules) ? f.turnover_rules : [],
                    }
                })
                setEditedFacilities(initialEditedState)
            }
            setLoading(false)
        }

        fetchFacilities()
    }, [supabase])

    const handleTimeChange = (id: string, field: keyof EditedFacility, value: string | number | null) => {
        setEditedFacilities(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value === "" ? null : value
            }
        }))
    }

    const handleSave = async (facilityId: string) => {
        setSavingId(facilityId)
        const newSettings = editedFacilities[facilityId]

        const { error } = await supabase
            .from("facilities")
            .update({
                funeral_block_time: newSettings.funeral_block_time,
                turnover_interval_hours: newSettings.turnover_interval_hours,
                turnover_rules: newSettings.turnover_rules
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

    const addRule = (facilityId: string) => {
        setEditedFacilities(prev => ({
            ...prev,
            [facilityId]: {
                ...prev[facilityId],
                turnover_rules: [
                    ...prev[facilityId].turnover_rules,
                    { funeral_time: "11:00", min_wake_time: "19:00" }
                ]
            }
        }))
    }

    const removeRule = (facilityId: string, index: number) => {
        setEditedFacilities(prev => ({
            ...prev,
            [facilityId]: {
                ...prev[facilityId],
                turnover_rules: prev[facilityId].turnover_rules.filter((_, i) => i !== index)
            }
        }))
    }

    const updateRule = (facilityId: string, index: number, field: keyof TurnoverRule, value: any) => {
        setEditedFacilities(prev => {
            const newRules = [...prev[facilityId].turnover_rules]
            newRules[index] = { ...newRules[index], [field]: value }
            // If forbidden is checked, remove min_wake_time
            if (field === "is_forbidden" && value === true) {
                delete newRules[index].min_wake_time
            }
            // If forbidden is unchecked, add default min_wake_time
            if (field === "is_forbidden" && value === false) {
                newRules[index].min_wake_time = "18:00"
            }
            return {
                ...prev,
                [facilityId]: {
                    ...prev[facilityId],
                    turnover_rules: newRules
                }
            }
        })
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
                    同日の同じホールにおける「葬儀の開式時間」と「後続の通夜」の制御ルールを設定します。
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 mt-2 space-y-1">
                    <li><strong>個別マッピングルール</strong>: 特定の葬儀時間に対して、通夜の最短開始時間や予約不可を個別に指定します。（例: 葬儀11:00なら通夜19:00以降）</li>
                    <li><strong>入替インターバル (時間)</strong>: 個別ルールに該当しない場合の基本ルールです。葬儀の開式時間から通夜までにあけるべき時間（単位：時間）を設定します。</li>
                    <li><strong>入替不可となる葬儀時間</strong>: 指定した時間以降の葬儀の場合は、同日の通夜の受け入れを完全にブロックします。</li>
                </ul>
            </div>

            <div className="space-y-4">
                {facilities.map((facility) => {
                    const currentValues = editedFacilities[facility.id] || {
                        funeral_block_time: null,
                        turnover_interval_hours: null,
                        turnover_rules: []
                    }

                    const isRulesDirty = JSON.stringify(currentValues.turnover_rules) !== JSON.stringify(facility.turnover_rules || [])

                    const isDirty =
                        currentValues.funeral_block_time !== facility.funeral_block_time ||
                        currentValues.turnover_interval_hours !== facility.turnover_interval_hours ||
                        isRulesDirty

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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        入替インターバル <span className="text-xs text-gray-400 font-normal">(時間)</span>
                                    </label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="24"
                                        placeholder="未設定時は8時間"
                                        value={currentValues.turnover_interval_hours ?? ""}
                                        onChange={(e) => handleTimeChange(facility.id, "turnover_interval_hours", e.target.value === "" ? null : Number(e.target.value))}
                                        className="w-full"
                                    />
                                    {currentValues.turnover_interval_hours !== null && (
                                        <p className="text-xs text-gray-500 mt-1 italic">
                                            個別ルールがない時間帯は、このインターバルが適用されます。
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Turnover Rules Mapping */}
                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                        個別マッピングルール
                                        <span className="text-[10px] font-normal px-1.5 py-0.5 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 rounded">優先適用</span>
                                    </label>
                                    <Button
                                        variant="outline"
                                        size="xs"
                                        onClick={() => addRule(facility.id)}
                                        className="h-7 text-[11px]"
                                    >
                                        ルール追加
                                    </Button>
                                </div>

                                {currentValues.turnover_rules.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-slate-50/50 dark:bg-slate-900/20">
                                                    <TableHead className="w-1/3 py-2 h-8 text-xs">葬儀開始時間</TableHead>
                                                    <TableHead className="w-1/3 py-2 h-8 text-xs">通夜可能時間 (以降)</TableHead>
                                                    <TableHead className="w-20 py-2 h-8 text-xs">入替不可</TableHead>
                                                    <TableHead className="w-12 py-2 h-8"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {currentValues.turnover_rules.map((rule, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell className="py-2">
                                                            <Input
                                                                type="time"
                                                                value={rule.funeral_time}
                                                                onChange={(e) => updateRule(facility.id, idx, "funeral_time", e.target.value)}
                                                                className="h-8 text-sm py-1"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            {!rule.is_forbidden && (
                                                                <Input
                                                                    type="time"
                                                                    value={rule.min_wake_time || ""}
                                                                    onChange={(e) => updateRule(facility.id, idx, "min_wake_time", e.target.value)}
                                                                    className="h-8 text-sm py-1"
                                                                />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="py-2 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={rule.is_forbidden || false}
                                                                onChange={(e) => updateRule(facility.id, idx, "is_forbidden", e.target.checked)}
                                                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="xs"
                                                                onClick={() => removeRule(facility.id, idx)}
                                                                className="h-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                            >
                                                                削除
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="text-center py-4 bg-slate-50/50 dark:bg-slate-900/10 rounded border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                                        個別ルールは設定されていません（インターバルが適用されます）
                                    </div>
                                )}
                            </div>

                            {/* Calculation Preview Section */}
                            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <span className="w-1 h-3 bg-blue-500 rounded-full" />
                                    現在のルールによる計算結果（プレビュー）
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {["10:00", "11:00", "12:00", "13:00"].map(fTime => {
                                        const timeToMin = (t: string | null) => {
                                            if (!t) return null;
                                            const [h, m] = t.split(':').map(Number);
                                            return h * 60 + m;
                                        };

                                        const fMin = timeToMin(fTime)!;
                                        const rules = currentValues.turnover_rules;
                                        const exactRule = rules.find(r => r.funeral_time === fTime);

                                        let resultText = "";
                                        let isForbidden = false;
                                        let source = "インターバル";

                                        if (exactRule) {
                                            source = "個別ルール";
                                            if (exactRule.is_forbidden) {
                                                isForbidden = true;
                                            } else {
                                                resultText = `${exactRule.min_wake_time} 以降`;
                                            }
                                        } else {
                                            const blockMin = timeToMin(currentValues.funeral_block_time);
                                            if (blockMin !== null && fMin >= blockMin) {
                                                isForbidden = true;
                                                source = "入替不可設定";
                                            } else {
                                                const interval = currentValues.turnover_interval_hours ?? 8;
                                                const resMin = fMin + interval * 60;
                                                const h = Math.floor(resMin / 60);
                                                const m = resMin % 60;
                                                resultText = `${h}:${m.toString().padStart(2, '0')} 以降`;
                                            }
                                        }

                                        return (
                                            <div key={fTime} className="bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
                                                <div className="text-[10px] text-slate-400 font-medium mb-1">葬儀 {fTime} の場合</div>
                                                <div className={`text-sm font-bold ${isForbidden ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`}>
                                                    {isForbidden ? "予約不可" : resultText}
                                                </div>
                                                <div className="mt-1 text-[9px] text-blue-500 font-medium">適用: {source}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

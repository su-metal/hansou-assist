"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Loader2, Save, Trash2, Plus, ArrowRight, Clock, Info, AlertCircle, Zap, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"

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

const TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
    const hour = Math.floor(i / 2) + 8;
    const minute = i % 2 === 0 ? "00" : "30";
    return `${hour.toString().padStart(2, "0")}:${minute}`;
});

export default function AdminPage() {
    const supabase = createClient()
    const [facilities, setFacilities] = useState<Facility[]>([])
    const [loading, setLoading] = useState(true)
    const [savingId, setSavingId] = useState<string | null>(null)

    const [expandedFacilityId, setExpandedFacilityId] = useState<string | null>(null)

    // Local state to hold changes before saving
    type EditedFacility = {
        funeral_block_time: string | null
        turnover_interval_hours: number | null
        turnover_rules: TurnoverRule[]
    }
    const [editedFacilities, setEditedFacilities] = useState<Record<string, EditedFacility>>({})

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

                // Expand first one by default if there's only one, or none if many
                if (data.length === 1) {
                    setExpandedFacilityId(data[0].id)
                }
            }
            setLoading(false)
        }

        fetchFacilities()
    }, [supabase])

    const handleFieldChange = (id: string, field: keyof EditedFacility, value: string | number | null) => {
        setEditedFacilities(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value === "none" ? null : value
            }
        }))
    }

    const toggleExpand = (id: string) => {
        setExpandedFacilityId(prev => prev === id ? null : id)
    }

    const handleSave = async (e: React.MouseEvent, facilityId: string) => {
        e.stopPropagation() // Prevent accordion toggle when clicking Save
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

            if (field === "is_forbidden" && value === true) {
                const updatedRule = { ...newRules[index], is_forbidden: true }
                delete updatedRule.min_wake_time
                newRules[index] = updatedRule
            }

            if (field === "is_forbidden" && value === false) {
                newRules[index] = { ...newRules[index], is_forbidden: false, min_wake_time: "18:00" }
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
        <div className="container mx-auto p-4 space-y-6 max-w-5xl">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">設定 (マスタ管理)</h1>
            </div>

            <Card className="bg-slate-50 dark:bg-slate-900 shadow-sm border-slate-200 dark:border-slate-800">
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div className="space-y-1">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Info className="h-5 w-5 text-blue-500" />
                                制限ルールの優先順位
                            </h2>
                            <p className="text-sm text-slate-500">上にあるものほど優先して適用されます。</p>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute left-6 top-8 bottom-8 w-0.5 border-l-2 border-dotted border-slate-200 dark:border-slate-700 hidden md:block" />

                        <div className="space-y-4">
                            {[
                                {
                                    step: "1",
                                    title: "個別マッピングルール",
                                    desc: "特定の時間帯をピンポイントで制限（例: 11時なら19時半まで空ける）",
                                    color: "bg-amber-100 text-amber-700 border-amber-200",
                                    badge: "最優先"
                                },
                                {
                                    step: "2",
                                    title: "強制ブロック（入替不可）",
                                    desc: "遅い時間の葬儀の後に通夜を一律で禁止（例: 13時半以降は通夜不可）",
                                    color: "bg-red-100 text-red-700 border-red-200",
                                    badge: "高い"
                                },
                                {
                                    step: "3",
                                    title: "基本インターバル",
                                    desc: "上記以外の場合に、葬儀開始から指定された時間数以上を空ける",
                                    color: "bg-blue-100 text-blue-700 border-blue-200",
                                    badge: "標準"
                                }
                            ].map((item, idx) => (
                                <div key={idx} className="flex items-start gap-4 relative">
                                    <div className={`w-12 h-12 rounded-full ${item.color} border flex items-center justify-center font-bold text-lg shrink-0 z-10 shadow-sm`}>
                                        {item.step}
                                    </div>
                                    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex-1 shadow-sm">
                                        <div className="flex items-center justify-between mb-1">
                                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                {item.title}
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${item.color} border-0`}>{item.badge}</span>
                                            </h3>
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {facilities.map((facility) => {
                    const currentValues = editedFacilities[facility.id] || {
                        funeral_block_time: null,
                        turnover_interval_hours: null,
                        turnover_rules: []
                    }

                    const isRulesDirty = JSON.stringify(currentValues.turnover_rules) !== JSON.stringify(facility.turnover_rules || [])
                    const isDirty = currentValues.funeral_block_time !== facility.funeral_block_time ||
                        currentValues.turnover_interval_hours !== facility.turnover_interval_hours ||
                        isRulesDirty

                    const isSaving = savingId === facility.id
                    const isExpanded = expandedFacilityId === facility.id

                    return (
                        <div key={facility.id} className={`bg-white dark:bg-slate-900 shadow-sm rounded-xl border transition-all duration-200 ${isExpanded ? 'border-primary shadow-md' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                            {/* Expandable Header */}
                            <div
                                onClick={() => toggleExpand(facility.id)}
                                className="px-6 py-4 flex items-center justify-between cursor-pointer select-none group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg border transition-colors ${isExpanded ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 group-hover:text-slate-600'}`}>
                                        <Clock className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                            {facility.name}
                                            {isDirty && <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" title="未保存の変更あり" />}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                                            <span className="flex items-center gap-1">
                                                <span className="text-slate-400">基本:</span> {currentValues.turnover_interval_hours ?? 8}時間
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="text-slate-400">制限:</span> {currentValues.funeral_block_time ? `${currentValues.funeral_block_time}以降` : 'なし'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="text-slate-400">ルール:</span> {currentValues.turnover_rules.length}件
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {isDirty && !isExpanded && (
                                        <Button
                                            size="sm"
                                            onClick={(e) => handleSave(e, facility.id)}
                                            disabled={isSaving}
                                            className="h-8 shadow-sm"
                                        >
                                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Save className="h-3 w-3 mr-2" />}
                                            保存
                                        </Button>
                                    )}
                                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                        <ChevronDown className="h-5 w-5 text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            {/* Details (Collapsible Content) */}
                            {isExpanded && (
                                <div className="p-6 pt-2 space-y-8 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="h-px bg-slate-100 dark:bg-slate-800 mb-6" />

                                    {/* Action Header inside expanded area */}
                                    <div className="flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 mb-6">
                                        <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                            詳細な条件設定と動作確認
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={(e) => handleSave(e, facility.id)}
                                            disabled={!isDirty || isSaving}
                                            className="shadow-md px-6"
                                        >
                                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                            設定を保存する
                                        </Button>
                                    </div>

                                    {/* Basic Settings */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                入替インターバル (時間)
                                                <span className="text-[10px] font-normal px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">優先 3</span>
                                            </label>
                                            <div className="flex items-center gap-3">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="24"
                                                    placeholder="例: 8"
                                                    value={currentValues.turnover_interval_hours ?? ""}
                                                    onChange={(e) => handleFieldChange(facility.id, "turnover_interval_hours", e.target.value === "" ? null : Number(e.target.value))}
                                                    className="w-24 text-lg font-bold"
                                                />
                                                <span className="text-slate-500 font-medium">時間あける</span>
                                            </div>
                                            <p className="text-xs text-slate-400">
                                                個別ルールがない時間帯は、葬儀開始からこの時間数が経過するまで通夜をブロックします。
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                入替不可となる葬儀時間
                                                <span className="text-[10px] font-normal px-1.5 py-0.5 bg-red-50 text-red-600 rounded">優先 2</span>
                                            </label>
                                            <Select
                                                value={currentValues.funeral_block_time || "none"}
                                                onValueChange={(val) => handleFieldChange(facility.id, "funeral_block_time", val)}
                                            >
                                                <SelectTrigger className="w-full sm:w-[200px] h-10 font-medium">
                                                    <SelectValue placeholder="未設定 (制限なし)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">未設定 (制限なし)</SelectItem>
                                                    {TIME_OPTIONS.map(time => (
                                                        <SelectItem key={time} value={time}>{time} 以降</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-slate-400">
                                                指定した時間以降の葬儀がある場合、同日の通夜は一切予約できません。
                                            </p>
                                        </div>
                                    </div>

                                    {/* Mapping Rules */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                個別マッピングルール
                                                <span className="text-[10px] font-normal px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">優先 1</span>
                                            </h4>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => addRule(facility.id)}
                                                className="h-8 text-xs border-dashed border-blue-200 text-blue-600 hover:bg-blue-50"
                                            >
                                                <Plus className="h-3 w-3 mr-1" /> ルールを追加
                                            </Button>
                                        </div>

                                        <div className="space-y-3">
                                            {currentValues.turnover_rules.map((rule, idx) => (
                                                <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-700 group transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                                        <span className="text-xs font-bold text-slate-400 uppercase">葬儀</span>
                                                        <Select
                                                            value={rule.funeral_time}
                                                            onValueChange={(val) => updateRule(facility.id, idx, "funeral_time", val)}
                                                        >
                                                            <SelectTrigger className="w-[100px] h-9 bg-white dark:bg-slate-900 border-slate-200">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {TIME_OPTIONS.map(time => (
                                                                    <SelectItem key={time} value={time}>{time}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <span className="text-xs font-bold text-slate-400">開始なら</span>
                                                    </div>

                                                    <ArrowRight className="hidden sm:block h-4 w-4 text-slate-300" />

                                                    <div className="flex flex-1 items-center gap-4 w-full sm:w-auto">
                                                        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                                                            <input
                                                                type="checkbox"
                                                                id={`forbid-${facility.id}-${idx}`}
                                                                checked={rule.is_forbidden || false}
                                                                onChange={(e) => updateRule(facility.id, idx, "is_forbidden", e.target.checked)}
                                                                className="w-4 h-4 rounded border-slate-300 text-red-500 focus:ring-red-500"
                                                            />
                                                            <label htmlFor={`forbid-${facility.id}-${idx}`} className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
                                                                入替不可
                                                            </label>
                                                        </div>

                                                        {!rule.is_forbidden && (
                                                            <div className="flex items-center gap-2 flex-1 justify-end sm:justify-start">
                                                                <span className="text-xs font-bold text-slate-400">通夜は</span>
                                                                <Select
                                                                    value={rule.min_wake_time || "18:00"}
                                                                    onValueChange={(val) => updateRule(facility.id, idx, "min_wake_time", val)}
                                                                >
                                                                    <SelectTrigger className="w-[100px] h-9 bg-white dark:bg-slate-900 border-slate-200">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {TIME_OPTIONS.map(time => (
                                                                            <SelectItem key={time} value={time}>{time}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <span className="text-xs font-bold text-slate-400">以降</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => removeRule(facility.id, idx)}
                                                        className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 sm:ml-auto"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}

                                            {currentValues.turnover_rules.length === 0 && (
                                                <div className="text-center py-6 bg-slate-50/30 dark:bg-slate-900/10 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                                    <p className="text-xs text-slate-400">個別マッピングルールは設定されていません。</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Preview Section */}
                                    <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Zap className="h-3 w-3 text-amber-500" />
                                                判定プロセスのシミュレーション
                                            </h4>
                                            <span className="text-[10px] text-slate-400">設置したルールが正しく動作するか確認</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                            {["10:00", "11:00", "12:00", "13:00", "14:00"].map(fTime => {
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
                                                let source = "インターバル適用";
                                                let reason = "個別ルール・ブロック設定のどちらにも該当しなかったため、基本設定を使用しました。";
                                                let badgeColor = "bg-blue-50 text-blue-600 border-blue-100";
                                                let icon = <Clock className="h-3 w-3" />;

                                                if (exactRule) {
                                                    source = "個別ルール優先";
                                                    reason = `この葬儀時間に対して個別に定義された特別な制限を優先適用しています。`;
                                                    badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
                                                    icon = <Zap className="h-3 w-3" />;
                                                    if (exactRule.is_forbidden) {
                                                        isForbidden = true;
                                                    } else {
                                                        resultText = `${exactRule.min_wake_time}〜`;
                                                    }
                                                } else {
                                                    const blockMin = timeToMin(currentValues.funeral_block_time);
                                                    if (blockMin !== null && fMin >= blockMin) {
                                                        isForbidden = true;
                                                        source = "ブロック時間適用";
                                                        reason = `${currentValues.funeral_block_time}以降の葬儀であるため、一律で予約不可となっています。`;
                                                        badgeColor = "bg-red-50 text-red-600 border-red-100";
                                                        icon = <AlertCircle className="h-3 w-3" />;
                                                    } else {
                                                        const interval = currentValues.turnover_interval_hours ?? 8;
                                                        const resMin = fMin + interval * 60;
                                                        const h = Math.floor(resMin / 60);
                                                        const m = resMin % 60;
                                                        resultText = `${h}:${m.toString().padStart(2, '0')}〜`;
                                                    }
                                                }

                                                return (
                                                    <Card key={fTime} className="overflow-hidden border-slate-100 dark:border-slate-800 shadow-sm">
                                                        <div className="bg-slate-50/80 dark:bg-slate-800/50 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                                                            <div className="text-[10px] font-bold text-slate-400">葬儀開式 {fTime}</div>
                                                        </div>
                                                        <CardContent className="p-3 space-y-3">
                                                            <div className={`text-sm font-black ${isForbidden ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                                                {isForbidden ? "同日の通夜予約不可" : <span className="flex items-center gap-1">通夜は {resultText}</span>}
                                                            </div>

                                                            <div className="space-y-1.5">
                                                                <div className={`text-[9px] font-bold border inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${badgeColor}`}>
                                                                    {icon}
                                                                    {source}
                                                                </div>
                                                                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                                                                    {reason}
                                                                </p>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

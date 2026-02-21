
"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Camera, Upload, Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { OcrResultForm } from "@/components/ocr/ocr-result-form"

// Define the type for OCR results to match what OcrResultForm expects
type OcrResult = {
    date: string;
    facility_name?: string;
    hall_name: string;
    slot_type: "葬儀" | "通夜" | "その他";
    ceremony_time?: string;
    family_name?: string;
    status: "available" | "occupied" | "preparing";
};

export default function CameraPage() {
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [ocrResults, setOcrResults] = useState<OcrResult[] | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setSelectedImage(reader.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const handleAnalyze = async () => {
        if (!fileInputRef.current?.files?.[0]) return

        setAnalyzing(true)
        const formData = new FormData()
        formData.append("file", fileInputRef.current.files[0])

        try {
            const res = await fetch("/api/ocr", {
                method: "POST",
                body: formData,
            })

            if (!res.ok) {
                throw new Error("解析に失敗しました")
            }

            const data = await res.json()
            if (Array.isArray(data) && data.length === 0) {
                toast.warning("情報を読み取れませんでした。別の画像を試してください。")
            } else {
                setOcrResults(data as OcrResult[])
                toast.success("解析完了！内容を確認してください")
            }
        } catch (error) {
            console.error(error)
            toast.error("サーバーエラーが発生しました")
        } finally {
            setAnalyzing(false)
        }
    }

    const handleReset = () => {
        setSelectedImage(null)
        setOcrResults(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    return (
        <div className="container mx-auto max-w-md p-4 space-y-6">
            <div className="flex items-center space-x-2">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <h1 className="text-xl font-bold">カメラで読み取る</h1>
            </div>

            {!ocrResults ? (
                <Card>
                    <CardHeader>
                        <CardTitle>画像をアップロード</CardTitle>
                        <CardDescription>
                            受付状況表の写真を撮影または選択してください。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div
                            className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center space-y-4 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {selectedImage ? (
                                <img src={selectedImage} alt="Preview" className="max-h-64 object-contain rounded-md" />
                            ) : (
                                <>
                                    <Camera className="h-12 w-12 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground text-center">
                                        ここをタップしてカメラを起動<br />または画像を選択
                                    </p>
                                </>
                            )}
                        </div>

                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            capture="environment"
                        />

                        <div className="flex space-x-2">
                            <Button
                                className="flex-1"
                                disabled={!selectedImage || analyzing}
                                onClick={handleAnalyze}
                            >
                                {analyzing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        解析中...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="mr-2 h-4 w-4" />
                                        解析を実行
                                    </>
                                )}
                            </Button>
                            {selectedImage && (
                                <Button variant="outline" onClick={handleReset} disabled={analyzing}>
                                    リセット
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>解析結果の確認</CardTitle>
                            <CardDescription>
                                内容が正しいか確認し、必要があれば修正して登録してください。
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <OcrResultForm initialData={ocrResults} />
                        </CardContent>
                    </Card>
                    <Button variant="outline" className="w-full" onClick={handleReset}>
                        画像を撮り直す
                    </Button>
                </div>
            )}
        </div>
    )
}

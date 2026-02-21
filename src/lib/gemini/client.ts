
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

export interface OcrResult {
    date: string | null;
    facility_name: string | null;
    hall_name: string | null;
    slot_type: "葬儀" | "通夜" | "その他" | null;
    ceremony_time: string | null;
    family_name: string | null;
    status: "available" | "occupied" | "preparing";
}

export async function analyzeImage(imageBase64: string, mimeType: string): Promise<OcrResult[]> {
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  // Use a model that supports vision
  const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", // Reverted to 2.5-flash per user request
      generationConfig: {
          responseMimeType: "application/json"
      }
  });

  const prompt = `
  あなたは葬儀搬送業務のアシスタントです。
  提供された画像は、葬儀社の「葬儀受付状況表」です。
  この画像はマトリクス（表）形式になっており、横軸が日付、縦軸が施設・ホール名です。
  以下のルールに従って、スケジュール情報を抽出し、JSON形式で出力してください。

  ### 読み取りルール:
  1. **表の構造**:
     - 横軸: 「1月6日(火)」のような日付。
     - 縦軸: 「セレモニーホール田原」「やすらぎ苑」などの施設名。
     - 各施設の中に「喪家名」「開式時間」「控室安置」「担当者」の行があります。
  2. **予定の抽出**:
     - 「喪家名」の行に名前（例：木村家）が書き込まれている場合、その列の日付の予定として抽出してください。
     - 「開式時間」の行にある時刻（例：11:30）を抽出し、HH:MM形式に変換してください。
  3. **ステータスの判断**:
     - 喪家名が記入されている、または「×」印がある場合 -> "occupied"
     - 大きな丸（○）で複数学日が囲まれている場合 -> その期間すべてを "occupied"
     - 「仮」という文字がある場合 -> "preparing"
     - 空白、または斜線（/）のみの場合 -> "available"
  4. **スロットの判断**:
     - 表の列が「葬儀」「通夜」に分かれている場合、それに応じて slot_type を設定してください。

  出力フォーマット (JSON Array):
  [
    {
      "date": "YYYY-MM-DD", // 画像内の日付（例：1月6日なら現在の年を補完して 2026-01-06）
      "facility_name": "施設名", // 例: JA愛知みなみ
      "hall_name": "ホール名", // 例: セレモニーホール渥美
      "slot_type": "葬儀" | "通夜" | "その他",
      "ceremony_time": "HH:MM" | null,
      "family_name": "喪家名" | null, // 「〇〇家」など
      "status": "available" | "occupied" | "preparing"
    }
  ]
  
  注意:
  - 画像内の「令和8年1月6日」などの日付情報を元に、正確な日付（YYYY-MM-DD）を生成してください。
  - 複数の予定がある場合はすべて抽出してください。
  - 手書き文字を注意深く読み取ってください。
  `;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: mimeType,
    },
  };

  try {
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    console.log("Gemini raw response:", text); 
    const data = JSON.parse(text);
    
    // Ensure it's an array
    if (Array.isArray(data)) {
        return data;
    } else if (typeof data === 'object' && data !== null) {
        // sometimes it returns an object wrapping the array
        // try to find an array property
        const values = Object.values(data);
        for (const val of values) {
            if (Array.isArray(val)) return val;
        }
        return [data as OcrResult];
    }
    return [];

  } catch (error) {
    console.error("Gemini analysis error:", error);
    throw new Error("Failed to analyze image.");
  }
}

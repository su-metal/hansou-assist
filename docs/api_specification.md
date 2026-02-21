# API仕様書：搬送アシスト

---

## 1. 共通仕様

### ベースURL
```
https://hansou-assist.vercel.app/api
```

### 認証
- 全APIエンドポイントに Supabase Auth の JWT トークンが必要
- ヘッダー: `Authorization: Bearer <token>`

### レスポンス形式
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

### エラーレスポンス
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "認証が必要です"
  }
}
```

### エラーコード一覧

| コード | HTTPステータス | 説明 |
|--------|:---:|------|
| UNAUTHORIZED | 401 | 認証トークンが無効 |
| FORBIDDEN | 403 | 権限不足 |
| NOT_FOUND | 404 | リソースが見つからない |
| VALIDATION_ERROR | 400 | 入力値が不正 |
| TOMOBIKI_WARNING | 400 | 友引の日に登録を試みた |
| OCR_FAILED | 500 | OCR解析に失敗 |
| RATE_LIMIT | 429 | API呼び出し制限超過 |

---

## 2. スケジュール API

### GET /api/schedules

スケジュール一覧を取得

**クエリパラメータ：**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| date | string | - | 対象日付（YYYY-MM-DD）デフォルト: 今日 |
| date_from | string | - | 期間開始日 |
| date_to | string | - | 期間終了日 |
| facility_id | string | - | 施設でフィルター |
| area | string | - | エリアでフィルター |
| status | string | - | ステータスでフィルター |

**レスポンス：**
```json
{
  "success": true,
  "data": {
    "date": "2026-02-18",
    "rokuyo": "大安",
    "is_tomobiki": false,
    "facilities": [
      {
        "id": "uuid",
        "name": "セレモニー会館田原",
        "area": "田原",
        "phone": "0531-XX-XXXX",
        "halls": [
          {
            "id": "uuid",
            "name": "第1ホール",
            "capacity": 50,
            "has_waiting_room": true,
            "schedule": {
              "id": "uuid",
              "status": "occupied",
              "slot_type": "葬儀",
              "family_name": "田中",
              "ceremony_time": "11:30",
              "registered_by": "山田太郎",
              "source": "ocr",
              "updated_at": "2026-02-17T10:30:00Z"
            }
          },
          {
            "id": "uuid",
            "name": "第2ホール",
            "capacity": 30,
            "has_waiting_room": false,
            "schedule": null
          }
        ]
      }
    ]
  }
}
```

---

### POST /api/schedules

スケジュールを登録

**権限:** admin, dispatcher

**リクエストボディ：**
```json
{
  "hall_id": "uuid",
  "date": "2026-02-18",
  "slot_type": "葬儀",
  "status": "occupied",
  "family_name": "田中",
  "ceremony_time": "11:30"
}
```

**バリデーション：**
- hall_id: 存在する有効なホールであること
- date: YYYY-MM-DD形式、過去日は不可
- slot_type: "葬儀" | "通夜" のいずれか
- status: "available" | "occupied" | "preparing" のいずれか
- family_name: 20文字以内（任意）
- ceremony_time: HH:MM形式（任意）
- 友引の日にstatusがoccupiedの場合 → TOMOBIKI_WARNING を返す（force=trueで上書き可能）

---

### PUT /api/schedules/[id]

スケジュールを更新

**権限:** admin, dispatcher

**リクエストボディ：** POST と同じフィールド（部分更新可）

---

### DELETE /api/schedules/[id]

スケジュールを削除

**権限:** admin, dispatcher

---

## 3. OCR API

### POST /api/ocr

画像からスケジュールデータを解析

**権限:** admin, dispatcher

**リクエストボディ：**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "facility_id": "uuid (任意: 事前に施設を指定)"
}
```

**レスポンス：**
```json
{
  "success": true,
  "data": {
    "facility_name": "セレモニー会館田原",
    "matched_facility_id": "uuid (名前マッチした場合)",
    "date": "2026-02-18",
    "halls": [
      {
        "hall_name": "第1ホール",
        "matched_hall_id": "uuid",
        "status": "occupied",
        "family_name": "田中",
        "ceremony_time": "11:30",
        "slot_type": "葬儀",
        "confidence": 0.95
      },
      {
        "hall_name": "花の間",
        "matched_hall_id": "uuid",
        "status": "occupied",
        "family_name": null,
        "ceremony_time": "18:00",
        "slot_type": "通夜",
        "confidence": 0.72
      }
    ]
  }
}
```

- `confidence`: AI解析の確信度（0.0〜1.0）
- `confidence < 0.8` の項目は画面上で⚠️表示
- `matched_facility_id` / `matched_hall_id`: 既存マスターとの自動マッチング結果

---

### POST /api/ocr/bulk-register

OCR解析結果を一括登録

**権限:** admin, dispatcher

**リクエストボディ：**
```json
{
  "entries": [
    {
      "hall_id": "uuid",
      "date": "2026-02-18",
      "slot_type": "葬儀",
      "status": "occupied",
      "family_name": "田中",
      "ceremony_time": "11:30"
    }
  ]
}
```

---

## 4. チャット API

### POST /api/chat

AIチャットメッセージを送信

**リクエストボディ：**
```json
{
  "message": "セレモニー会館田原の第1ホールは明日空いてる？",
  "conversation_id": "uuid (継続会話の場合)"
}
```

**レスポンス：**
```json
{
  "success": true,
  "data": {
    "conversation_id": "uuid",
    "reply": "はい、セレモニー会館田原の第1ホールは明日（2/19）空いています。収容人数は50名、控室もご利用可能です。",
    "sources": [
      {
        "type": "schedule",
        "id": "uuid",
        "label": "セレモニー会館田原 - 第1ホール 2/19のスケジュール"
      }
    ]
  }
}
```

---

## 5. 施設マスター API

### GET /api/facilities

施設一覧を取得（ホール情報含む）

### POST /api/facilities

施設を登録 **権限:** admin

### PUT /api/facilities/[id]

施設を更新 **権限:** admin

### POST /api/facilities/[id]/halls

ホールを追加 **権限:** admin

### PUT /api/halls/[id]

ホールを更新 **権限:** admin

---

## 6. ユーザー API

### GET /api/users

ユーザー一覧を取得 **権限:** admin

### POST /api/users/invite

招待リンクを発行 **権限:** admin

```json
{
  "email": "user@example.com",
  "role": "dispatcher",
  "name": "田中太郎"
}
```

### PUT /api/users/[id]/role

ロールを変更 **権限:** admin

---

## 7. ナレッジ API

### GET /api/knowledge

ナレッジ記事一覧（検索・フィルター付き）

### GET /api/knowledge/[id]

個別記事を取得

### POST /api/knowledge

記事を作成 **権限:** 全ロール

### PUT /api/knowledge/[id]

記事を更新 **権限:** 全ロール

---

## 8. 六曜 API

### GET /api/rokuyo

指定期間の六曜データを取得

**クエリパラメータ：**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|:---:|------|
| date_from | string | ✓ | 開始日（YYYY-MM-DD） |
| date_to | string | ✓ | 終了日（YYYY-MM-DD） |

**レスポンス：**
```json
{
  "success": true,
  "data": [
    { "date": "2026-02-18", "rokuyo": "大安", "is_tomobiki": false },
    { "date": "2026-02-19", "rokuyo": "赤口", "is_tomobiki": false },
    { "date": "2026-02-20", "rokuyo": "先勝", "is_tomobiki": false },
    { "date": "2026-02-21", "rokuyo": "友引", "is_tomobiki": true }
  ]
}
```

---

## 9. API利用量制限

| エンドポイント | 制限 | 理由 |
|-------------|------|------|
| /api/ocr | 100回/日 | Gemini APIコスト制御 |
| /api/chat | 200回/日 | Gemini APIコスト制御 |
| その他 | 1000回/分 | 一般的なレート制限 |

# 開発ガイド：搬送アシスト

---

## 1. 環境構築

### 1.1 前提条件

| ツール | バージョン | 用途 |
|-------|-----------|------|
| Node.js | 20.x LTS | ランタイム |
| npm | 10.x | パッケージ管理 |
| Git | 最新 | バージョン管理 |
| VS Code | 最新 | エディタ（推奨） |

### 1.2 セットアップ手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/your-org/hansou-assist.git
cd hansou-assist

# 2. 依存パッケージをインストール
npm install

# 3. 環境変数を設定
cp .env.example .env.local
# .env.local を編集（※ 下記「環境変数」参照）

# 4. 開発サーバーを起動
npm run dev
# → http://localhost:3000 でアクセス
```

### 1.3 環境変数

`.env.local` に以下を設定：

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Gemini API
GEMINI_API_KEY=AIza...

# Firebase Cloud Messaging
NEXT_PUBLIC_FCM_VAPID_KEY=BPf...
FCM_SERVER_KEY=AAAA...

# アプリ設定
NEXT_PUBLIC_APP_NAME=搬送アシスト
OCR_DAILY_LIMIT=100
CHAT_DAILY_LIMIT=200
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` と `GEMINI_API_KEY` は **サーバーサイドのみ** で使用。`NEXT_PUBLIC_` プレフィックスを付けないこと。

---

## 2. 開発ルール

### 2.1 ブランチ運用

```
main            ← 本番環境（Vercelで自動デプロイ）
├── develop     ← 開発統合ブランチ
│   ├── feature/schedule-list    ← 機能開発
│   ├── feature/ocr-camera       ← 機能開発
│   ├── fix/dark-mode-color      ← バグ修正
│   └── hotfix/auth-error        ← 緊急修正（mainから分岐）
```

| ブランチ | 用途 | マージ先 |
|---------|------|---------|
| `main` | 本番環境 | - |
| `develop` | 開発統合 | main |
| `feature/*` | 新機能開発 | develop |
| `fix/*` | バグ修正 | develop |
| `hotfix/*` | 緊急修正 | main + develop |

### 2.2 コミットメッセージ規約

```
<種別>: <変更内容の概要>

種別:
  feat:     新機能
  fix:      バグ修正
  docs:     ドキュメント
  style:    フォーマット変更（コード動作に影響なし）
  refactor: リファクタリング
  test:     テスト追加・修正
  chore:    ビルド・設定変更
```

**例：**
```
feat: スケジュール一覧画面の日付切り替え機能を追加
fix: 友引判定が1日ずれるバグを修正
docs: API仕様書にOCRエンドポイントを追加
```

### 2.3 コーディング規約

| 項目 | ルール |
|------|-------|
| 言語 | TypeScript 必須（any 使用禁止） |
| フォーマッター | Prettier（保存時自動フォーマット） |
| リンター | ESLint（Next.js推奨設定） |
| コンポーネント | 関数コンポーネント + React Hooks |
| スタイリング | Tailwind CSS（インラインスタイル禁止） |
| 命名（変数） | camelCase |
| 命名（コンポーネント） | PascalCase |
| 命名（ファイル） | kebab-case |
| 命名（DB） | snake_case |

### 2.4 VS Code 推奨拡張

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma"
  ]
}
```

---

## 3. プロジェクト構成ガイド

### 3.1 コンポーネント設計方針

```
components/
├── ui/                # 汎用UIパーツ（shadcn/ui）
│   ├── button.tsx
│   ├── card.tsx
│   └── dialog.tsx
├── schedule/          # スケジュール関連
│   ├── schedule-card.tsx      # 施設カード
│   ├── hall-status.tsx        # ホールステータス表示
│   ├── schedule-filter.tsx    # フィルター
│   └── date-selector.tsx      # 日付セレクタ + 六曜
├── camera/            # カメラ・OCR関連
│   ├── camera-viewfinder.tsx  # カメラプレビュー
│   └── ocr-result-form.tsx    # 解析結果フォーム
└── chat/              # AIチャット関連
    ├── chat-message.tsx       # メッセージバブル
    └── chat-input.tsx         # 入力欄 + マイクボタン
```

### 3.2 APIルート設計方針

- `/api/` 配下に RESTful なエンドポイントを配置
- サーバーサイドでのみ `SUPABASE_SERVICE_ROLE_KEY` を使用
- Gemini API の呼び出しは必ずサーバーサイドで行う（APIキー漏洩防止）
- レート制限は Vercel Edge Middleware で実装

---

## 4. テスト

### 4.1 テスト方針

| テスト種別 | ツール | 対象 |
|-----------|-------|------|
| E2E | Playwright | 主要業務フロー |
| ユニット | Vitest | ユーティリティ関数・六曜計算 |
| APIテスト | Vitest + supertest | APIエンドポイント |

### 4.2 E2Eテストシナリオ（優先度順）

1. **ログイン → スケジュール一覧表示**
2. **スケジュール手動登録 → 一覧に反映**
3. **日付切り替え → カレンダービューで六曜表示**
4. **友引の日にスケジュール登録 → 警告表示**
5. **OCR撮影 → 解析結果確認 → 一括登録**
6. **AIチャットで質問 → 回答表示**

### 4.3 テスト実行

```bash
# ユニットテスト
npm run test

# E2Eテスト
npm run test:e2e

# テストカバレッジ
npm run test:coverage
```

---

## 5. デプロイ

### 5.1 デプロイフロー

```
feature/* → develop → main
              ↓          ↓
          プレビュー    本番
          (Vercel)    (Vercel)
```

- `develop` へのマージ → Vercel プレビューデプロイ（自動）
- `main` へのマージ → Vercel 本番デプロイ（自動）
- DBマイグレーション → Supabase CLI で手動実行

### 5.2 DBマイグレーション

```bash
# マイグレーション作成
npx supabase migration new <migration_name>

# ローカルで適用
npx supabase db reset

# 本番に適用
npx supabase db push
```

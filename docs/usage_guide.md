# NotebookLM MCP & CLI Usage Guide

## 1. 準備 (Prerequisite)

**重要**: Antigravity (このAIクライアント) 上で MCP ツールを使用するには、**アプリケーションの再起動**が必要です。
再起動するまでは、以下の **CLI コマンド** のみターミナルで使用可能です。

## 2. CLI コマンド (ターミナルで使用)

ターミナルから直接 `nlm` コマンドで NotebookLM を操作できます。

### 基本コマンド
- **ヘルプ表示**: `nlm --help`
- **ログイン状態確認**: `nlm login --check`

### ノートブック操作
- **一覧表示**: `nlm notebook list`
- **新規作成**: `nlm notebook create "My Project Name"`
- **ソース追加**: `nlm source add --notebook "My Project Name" --url "https://example.com"`
- **クエリ (チャット)**: `nlm notebook query --notebook "My Project Name" "この論文の要約は？"`
- **オーディオ作成**: `nlm studio create --notebook "My Project Name" --format audio`

## 3. MCP ツール (AI チャットで使用)

再起動後、AI (私) に対して自然言語で依頼することで、NotebookLM を操作できます。

### 依頼の例

- **ノートブックを見る**:
  > "私の NotebookLM にあるノートブックの一覧を表示して"
  > (ツール: `notebook_list`)

- **新しい調査を開始する**:
  > "「量子コンピューティング」という名前で新しいノートブックを作って"
  > (ツール: `notebook_create`)

- **資料を追加する**:
  > "この URL を「量子コンピューティング」ノートブックに追加して: https://ja.wikipedia.org/wiki/量子コンピュータ"
  > (ツール: `source_add`)

- **内容について質問する**:
  > "「量子コンピューティング」ノートブックの内容に基づいて、主要な課題を教えて"
  > (ツール: `notebook_query`)

- **ポッドキャスト(音声)を作成する**:
  > "「量子コンピューティング」ノートブックから音声概説（ポッドキャスト）を作成して"
  > (ツール: `studio_create`)

## トラブルシューティング

もしうまくいかない場合は、ターミナルで診断コマンドを実行してください。
```powershell
nlm doctor
```

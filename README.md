# Echo-Todo 🎤

> しゃべるだけでタスクを記録する、ゆるくて楽しいChrome拡張機能

## コンセプト

タスクは **忘れてもいいもの**。本当に大切なことは覚えているし、厳密な管理はJiraやClickUpに任せる。

Echo-Todoは「気軽に吐き出す場所」です。やりたいけど気が乗らないタスクを声に出して記録し、消化する短いサイクルを通じた **自己分析** がゴール。

## 機能

- 🎤 **音声入力** — popup のマイクボタンから、そのまま話して追加
- 🤖 **任意のAI分割** — 必要なときだけGemini NanoまたはGemini APIでTodoリストに整理
- ⏳ **自動削除 (TTL)** — デフォルト72時間で自動消滅。消えてもOK
- 📊 **自己分析** — 生み出した数・クローズした数・平均クローズ時間を記録
- 🔒 **完全ローカル** — バックエンド不要。データはIndexedDBに保存

## 技術スタック

| 要素 | 技術 |
|---|---|
| プラットフォーム | Chrome Extension (Manifest V3) |
| ストレージ | IndexedDB (バックエンド不要) |
| 音声入力 / 音声認識 | Web Speech API |
| LLM (ローカル) | Chrome Prompt API (Gemini Nano) |
| LLM (フォールバック) | Gemini API |
| UI | HTML/CSS/TypeScript |
| ビルドツール | Vite |

### 音声入力の前提

1. 必要なら設定タブで `Gemini API` キーを保存する
2. popup の `🎤` を押す
3. Chrome のマイク許可が出たら許可する
4. 話し終わると文字起こし結果がタスクとして追加される
5. popup を閉じると音声入力は止まる

### 入力の扱い

1. `入力のみ` - 文字起こし結果をそのまま1件追加
2. `Gemini Nano` - ローカルLLMで分割し、使えなければGemini API、さらにだめならルールベースで分割
3. `Gemini API` - 外部APIで分割し、だめならルールベースで分割

## セットアップ

```bash
npm install
npm run build
```

ビルド後、`dist/` フォルダをChromeに読み込む:

1. `chrome://extensions` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` を選択
4. Echo-Todo の popup を開く
5. 必要なら設定タブで Gemini API キーを保存
6. タスクタブに戻って `🎤` を押し、マイクを許可する

## プロジェクト構成

```
src/
├── popup/          # メインUI
├── background/     # Service Worker (TTL自動削除)
├── tasks/          # タスク追加処理
├── storage/        # IndexedDBラッパー
├── llm/            # タスク分割
├── voice/          # popup内の音声入力ラッパー
└── styles/         # CSS / アニメーション
```

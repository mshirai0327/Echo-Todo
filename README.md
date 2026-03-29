# Echo-Todo 🎤

> しゃべるだけでタスクを記録する、ゆるくて楽しいChrome拡張機能

## コンセプト

タスクは **忘れてもいいもの**。本当に大切なことは覚えているし、厳密な管理はJiraやClickUpに任せる。

Echo-Todoは「気軽に吐き出す場所」です。やりたいけど気が乗らないタスクを声に出して記録し、消化する短いサイクルを通じた **自己分析** がゴール。

## 機能

- 🎤 **音声入力** — マイクボタンを押してしゃべるだけ。複数タスクを一度に登録できる
- 🤖 **AI自動分割** — 発話テキストをGemini NanoがTodoリストに変換
- ⏳ **自動削除 (TTL)** — デフォルト72時間で自動消滅。消えてもOK
- 📊 **自己分析** — 生み出した数・クローズした数・平均クローズ時間を記録
- 🔒 **完全ローカル** — バックエンド不要。データはIndexedDBに保存

## 技術スタック

| 要素 | 技術 |
|---|---|
| プラットフォーム | Chrome Extension (Manifest V3) |
| ストレージ | IndexedDB (バックエンド不要) |
| 音声入力 | Web Speech API |
| LLM (ローカル) | Chrome Prompt API (Gemini Nano) |
| LLM (フォールバック) | Gemini API / OpenAI API |
| UI | HTML/CSS/TypeScript |
| ビルドツール | Vite |

### LLMフォールバック順

1. **Gemini Nano** (Chrome内蔵・無料) — デフォルト
2. **Gemini API** (gemini-2.0-flash、APIキー必要)
3. **OpenAI API** (gpt-4o-mini、APIキー必要)
4. 発話テキストをそのまま1件のタスクとして登録

## セットアップ

```bash
npm install
npm run build
```

ビルド後、`dist/` フォルダをChromeに読み込む:

1. `chrome://extensions` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` を選択

## プロジェクト構成

```
src/
├── popup/        # メインUI (popup.html + popup.ts)
├── background/   # Service Worker (TTL自動削除)
├── storage/      # IndexedDBラッパー
├── llm/          # LLM連携 (Gemini Nano / APIフォールバック)
├── voice/        # Web Speech APIラッパー
└── styles/       # CSS / アニメーション
```

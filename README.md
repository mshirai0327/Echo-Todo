# Echo-Todo 🎤

> しゃべるだけでタスクを記録する、ゆるくて楽しいChrome拡張機能

## コンセプト

タスクは **忘れてもいいもの**。本当に大切なことは覚えているし、厳密な管理はJiraやClickUpに任せる。

Echo-Todoは「気軽に吐き出す場所」です。やりたいけど気が乗らないタスクを声に出して記録し、消化する短いサイクルを通じた **自己分析** がゴール。

## 機能

- 🎤 **音声入力** — popup のマイクボタンから、そのまま話して追加
- ⏳ **自動削除 (TTL)** — デフォルト72時間で自動消滅。消えてもOK
- ⏱️ **残り時間表示** — 各タスクに削除までの残り時間を時間・分単位で表示
- 💫 **心機一転！** — TTL切れのタスクは popup を開いたとき演出付きで消えていく
- 📊 **自己分析** — 生み出した数・クローズした数・平均クローズ時間を記録
- 🔒 **完全ローカル** — バックエンド不要。データはIndexedDBに保存

## 技術スタック

| 要素 | 技術 |
|---|---|
| プラットフォーム | Chrome Extension (Manifest V3) |
| ストレージ | IndexedDB (バックエンド不要) |
| 音声入力 / 音声認識 | Web Speech API |
| UI | HTML/CSS/TypeScript |
| ビルドツール | Vite |

### 音声入力の前提

1. popup の `🎤` を押す
2. Chrome のマイク許可ダイアログが出たら許可する（初回のみ）
3. 話し終わると文字起こし結果がタスクとして追加される
4. popup を閉じると音声入力は止まる

### 入力の扱い

「それと」「あと」「そして」などの接続詞で区切り、複数タスクとして登録する。

## セットアップ

### 方法1: CI artifactをダウンロードして使う（推奨）

mainブランチへのpushや、Releaseの作成時に自動でZIPがビルドされます。

1. GitHub の [Actions タブ](../../actions) を開き、最新の `Build Extension` ワークフローを選択
2. ページ下部の `Artifacts` セクションから `echo-todo-extension` をダウンロード
3. ダウンロードしたZIPを1回だけ解凍する
4. `chrome://extensions` を開く
5. 「デベロッパーモード」をオン
6. 「パッケージ化されていない拡張機能を読み込む」→ 解凍したフォルダを選択
7. Echo-Todo の popup を開く
8. タスクタブの `🎤` を押し、マイクを許可する

> **Releaseに添付されたZIPを使う場合**
> [Releases ページ](../../releases) から最新バージョンの `echo-todo-extension.zip` をダウンロードし、解凍してから手順4以降を実行してください。

### 方法2: ローカルでビルドして使う

```bash
npm install
npm run build
```

ビルド後、`dist/` フォルダをChromeに読み込む:

1. `chrome://extensions` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` を選択
4. Echo-Todo の popup を開く
5. タスクタブの `🎤` を押し、マイクを許可する

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

## 開発メモ

### コミットメッセージ規約

コミットメッセージは Conventional Commits ベースの `<type>: <summary>` 形式を使います。

- 例: `fix: zip importでのマイク許可`
- 例: `feat: add TTL countdown to task cards`
- よく使う type: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`
- `Update README` や `Refine popup flow` のような曖昧なタイトルは避ける

AIエージェント向けの詳細ルールは `AGENTS.md` と `CLAUDE.md` を参照してください。

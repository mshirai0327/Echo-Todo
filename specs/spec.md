# Echo-Todo 実装方針

## コンセプト

「しゃべるだけでタスクを記録する、ゆるくて楽しいChrome拡張機能」

### 思想
- タスクは **忘れてもいいもの**。本当に大切なことは覚えているし、厳密な管理はJiraやClickUpに任せる
- ClickUp/Jiraのような「厳密な管理ツール」ではなく、「気軽に吐き出す場所」
- タスクを生み出し・解消する短いスパンを通じた **自己分析** がゴール
- やりたいけど気が乗らないタスクを、負担なく記録・消化する

---

## 技術スタック

| 要素 | 技術 |
|---|---|
| プラットフォーム | Chrome Extension (Manifest V3) |
| ストレージ | IndexedDB (バックエンド不要) |
| 音声入力 / 音声認識 | popup 上の Web Speech API |
| LLM (ローカル) | Chrome Prompt API (Gemini Nano, タスク分割用) |
| LLM (フォールバック) | Gemini API (ユーザー入力のAPIキーを利用, タスク分割用) |
| UI | HTML/CSS/TypeScript (またはVanilla JS) |
| ビルドツール | Vite |

---

## プロジェクト構成

```
Echo-Todo/
├── manifest.json
├── public/
│   └── icons/
├── src/
│   ├── popup/           # メインUI (popup.html + popup.ts)
│   ├── background/      # Service Worker (TTL監視)
│   ├── storage/         # IndexedDB操作ラッパー
│   ├── llm/             # タスク分割 (Gemini Nano / API fallback)
│   ├── voice/           # popup上の音声入力
│   └── styles/          # CSS / アニメーション
├── specs/
└── package.json
```

---

## データモデル

```ts
interface Task {
  id: string;           // UUID
  text: string;         // タスク本文
  createdAt: number;    // Unix timestamp (ms)
  expireAt: number;     // createdAt + TTL (デフォルト72時間)
}

interface Settings {
  ttlHours: number;     // デフォルト: 72
  apiKey?: string;      // Gemini API使用時。ユーザーが入力
  llmMode: 'input' | 'nano' | 'gemini';
}

interface Stats {
  totalCreated: number;
  totalExpired: number; // 未完了のまま消えた数
  totalClosed: number;
  sumCloseDurationMs: number;
  avgCloseDurationMs: number;
}
```

---

## コア機能

### 1. 音声入力 → 文字起こし → タスク分割

1. popupのマイクボタン押下で Web Speech API を開始する
2. 初回利用時は Chrome のマイク許可ダイアログを表示する
3. 音声認識が完了したら、認識テキストをタスク分割に渡す
4. `llmMode === 'input'` なら、そのまま1件のタスクとして登録する
5. `llmMode === 'nano'` なら Gemini Nano (Prompt API) で分割し、使えなければ Gemini API にフォールバックする
6. `llmMode === 'gemini'` なら Gemini API で分割する
7. Gemini API が使えない、または分割に失敗した場合は、ルールベース分割へフォールバックする
8. popupを閉じると音声入力は停止する

### 2. タスクのライフサイクル

- IndexedDB に保持するのは **Openタスクのみ**
- タスクを閉じたとき:
  - `Stats.totalClosed` を加算
  - `Stats.sumCloseDurationMs` に `Date.now() - createdAt` を加算
  - `Stats.avgCloseDurationMs` を更新
  - タスク本体は IndexedDB から即時削除
- 作成日時は通常UIでは非表示（短命なメモであることを優先）
- タスクを閉じたとき: お祝いアニメーション表示

### 3. 自動削除 (TTL)

- Background Service Worker が `chrome.alarms` を使って定期的に期限切れタスクをチェック
- `expireAt < Date.now()` のタスクを削除
- 削除は取り消し不可
- TTLはSettings画面でカスタマイズ可能（デフォルト: 72時間）
- 削除されたタスクは `Stats.totalExpired` にカウント
- TTL変更は新規作成タスクにのみ適用し、既存タスクの `expireAt` は変更しない

### 4. 音声入力アーキテクチャ

- 音声取得の責務はウェブページではなく拡張側に置く
- `chrome.scripting.executeScript` によるページ注入は使わない
- 通常の http/https ページを開いていなくても、拡張UIから音声入力を開始できる
- 音声入力は popup 上で完結する
- popup を閉じると録音・音声認識は停止する

---

## UI/UX

### 画面構成
1. **メイン画面**: Openタスク一覧 + テキスト入力 + マイクボタン + 録音状態表示
2. **設定画面**: TTL設定 / Gemini APIキー / 入力の扱い
3. **統計画面**: 生み出した数・消えた数・クローズした数・平均クローズ時間

### デザイン方針
- 可愛らしく、でも派手すぎない
- 絵文字を積極的に使う
- タスク完了時: ふわっと消えるアニメーション + 「お疲れ様！」メッセージ
- タスクが自動削除されたとき: さらっと静かに消える（責めない）
- フォント: 丸みのある日本語フォント推奨 (例: Noto Sans JP)

### マイクUI
- 大きくて押しやすいマイクボタン (中央 or 下部固定)
- 録音中: 波形アニメーション or パルスアニメーション
- タスク追加完了時: ポップイン表示
- 実装場所は Chrome 拡張 popup
- 通常のウェブページを開いていなくても使える
- popup を閉じると音声入力は止まる
- V1は短い音声メモを素早く残せることを重視する

---

## 音声認識 / LLM統合詳細

### 音声認識

- 初期実装では Web Speech API による音声認識を採用する
- APIキー未設定でも音声入力は開始できる
- マイク許可が拒否された場合は、再試行またはテキスト入力を促す

### Gemini Nano (Chrome Prompt API, タスク分割用)
```ts
// 利用可能チェック
const { available } = await window.ai.languageModel.capabilities();
if (available !== 'no') {
  // ローカルLLMでタスク分割
}
```

### 入力の扱い
1. `llmMode = 'input'`: 分割せず1件登録
2. `llmMode = 'nano'`: Gemini Nano を優先し、使えなければ Gemini API にフォールバック
3. `llmMode = 'gemini'`: Gemini API で分割

### プロンプト設計
```
あなたはTodo管理アシスタントです。
ユーザーの音声認識結果からTodoタスクを抽出し、JSON配列で返してください。
タスクは簡潔な日本語にしてください。

テキスト: "{{transcript}}"

出力形式: ["タスク1", "タスク2", ...]
```

### エラーハンドリング
- 音声認識APIの失敗時は、ユーザーに再録音またはテキスト入力を促す
- LLMレスポンスは必ずJSON.parse前にバリデーションする
- 配列以外のレスポンスは失敗扱いにする
- 分割失敗時は、ルールベース分割へフォールバックする
- APIキーは `chrome.storage.local` に保存し、設定UIではマスク表示する

---

## 実装フェーズ

### Phase 1: 基盤
- [ ] Chrome Extension の雛形 (Manifest V3)
- [ ] IndexedDB ラッパー (CRUD)
- [ ] Openタスク一覧UI + テキスト追加UI
- [ ] popup内の音声入力基盤

### Phase 2: コア機能
- [ ] popup上の Web Speech API 連携
- [ ] Gemini Nano または Gemini API によるタスク分割
- [ ] `chrome.alarms` を使った TTL 削除

### Phase 3: UX・統計
- [ ] アニメーション・お祝いUI
- [ ] 統計画面
- [ ] 設定画面 (TTL / Gemini APIキー / 入力の扱い)

### Phase 4: 仕上げ
- [ ] アイコン・デザイン
- [ ] Chrome Web Store 公開準備

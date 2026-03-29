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
| 音声入力 | Web Speech API |
| LLM (ローカル) | Chrome Prompt API (Gemini Nano) |
| LLM (フォールバック) | OpenAI API / Gemini API (ユーザー入力のAPIキーを利用) |
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
│   ├── background/      # Service Worker (タイマー監視・自動削除)
│   ├── storage/         # IndexedDB操作ラッパー
│   ├── llm/             # LLM連携 (Gemini Nano / API fallback)
│   ├── voice/           # Web Speech API ラッパー
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
  llmMode: 'nano' | 'openai' | 'gemini';
  apiProvider?: 'openai' | 'gemini';
  apiKey?: string;      // 外部API使用時。ユーザーが入力
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

### 1. 音声入力 → タスク分割

1. マイクボタン押下 → Web Speech API で音声録音開始
2. 発話終了を検知 → テキスト化
3. テキストを Gemini Nano (Prompt API) に渡す
4. プロンプト: 「以下の発話から、Todoタスクのリストを日本語で抽出し、JSON配列で返してください: {発話テキスト}」
5. 返ってきたJSON配列をタスクとして一括登録
6. Gemini Nano が使えない環境では、ユーザーが設定した外部API (OpenAI / Gemini) にフォールバック
7. JSON配列のパースに失敗した場合は、テキスト全体を1件のタスクとして登録する

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

---

## UI/UX

### 画面構成
1. **メイン画面**: Openタスク一覧 + テキスト入力 + マイクボタン
2. **設定画面**: TTL設定 / API設定
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
- 想定ユースケースは短い一発話の入力で、popupが閉じたら録音・解析も終了する

---

## LLM統合詳細

### Gemini Nano (Chrome Prompt API)
```ts
// 利用可能チェック
const { available } = await window.ai.languageModel.capabilities();
if (available !== 'no') {
  // ローカルLLM使用
}
```

### フォールバック優先順位
1. Gemini Nano (Chrome Prompt API) ← デフォルト・無料
2. Gemini API (gemini-2.0-flash, ユーザー入力のAPIキー)
3. OpenAI API (gpt-4o-mini, ユーザー入力のAPIキー)

### プロンプト設計
```
あなたはTodo管理アシスタントです。
ユーザーの発話からTodoタスクを抽出し、JSON配列で返してください。
タスクは簡潔な日本語にしてください。

発話: "{{speech}}"

出力形式: ["タスク1", "タスク2", ...]
```

### エラーハンドリング
- LLMレスポンスは必ずJSON.parse前にバリデーションする
- 配列以外のレスポンスは失敗扱いにする
- Gemini Nano が使えず、外部APIキーも未設定なら、発話テキストをそのまま1件のタスクとして登録する

---

## 実装フェーズ

### Phase 1: 基盤
- [ ] Chrome Extension の雛形 (Manifest V3)
- [ ] IndexedDB ラッパー (CRUD)
- [ ] Openタスク一覧UI + テキスト追加UI

### Phase 2: コア機能
- [ ] Web Speech API による音声入力
- [ ] Gemini Nano でタスク分割
- [ ] 外部API フォールバック
- [ ] `chrome.alarms` を使った TTL 削除

### Phase 3: UX・統計
- [ ] アニメーション・お祝いUI
- [ ] 統計画面
- [ ] 設定画面 (TTL / APIキー)

### Phase 4: 仕上げ
- [ ] アイコン・デザイン
- [ ] Chrome Web Store 公開準備

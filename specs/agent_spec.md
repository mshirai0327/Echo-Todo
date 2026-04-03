# Echo-Todo 追加仕様

## 1. 拡張機能アイコン（SVG）

### 概要
「しゃべる人」をモチーフにしたアイコン。既存の紫/ピンク系カラースキームに合わせる。

### デザイン方針
- シンプルな人物シルエット + 吹き出し（音声・言葉を発している感）
- 現在のアイコン（紫丸 + 🎤 絵文字）から、より意味のある造形へ
- 3サイズ対応: `icon16.svg`, `icon48.svg`, `icon128.svg`（ただし基本は同一 SVG でスケーリング）

### SVG 仕様
```
カラー:
  - 背景円: グラデーション #a78bfa → #7c3aed（既存の primary）
  - 人物シルエット: #ffffff（白）
  - 吹き出し: #f9a8d4（既存の accent pink）
  - 吹き出しドット（...）: #7c3aed

構成要素:
  1. 背景: 円形（viewBox 基準）
  2. 人物: 丸い頭部 + 肩ライン（シンプルなパス）
  3. 吹き出し: 右上に配置、角丸の四角 + しっぽ
  4. ドット: 吹き出し内に 3 つの円（しゃべっている表現）

viewBox: "0 0 128 128"
```

### 実装ファイル
- `public/icons/icon16.svg`
- `public/icons/icon48.svg`
- `public/icons/icon128.svg`
- `public/manifest.json` の icons フィールドはそのまま流用

---

## 2. 強制削除「心機一転！」

### 概要
タスクを完全削除する機能。復元不可。ただし「黙って消えない」—— 削除前に一瞬だけ、そのタスクの存在を認める演出を入れる。

### UX フロー

```
[ユーザー操作]
  タスクの削除ボタンを長押し（600ms）または Shift+クリック
    ↓
[フェーズ1: 確認演出（1.2秒）]
  タスクカードがぷるぷる震える（shiver アニメーション）
  カードの上に半透明オーバーレイで文字表示:
    「本当に消す？」
    （手書き風のフォントで、ゆるく）
    ↓（自動で移行 or ユーザーが離さなければ継続）
[フェーズ2: 心機一転！演出（0.8秒）]
  オーバーレイが「心機一転！」に切り替わる（紫 → ピンクグラデーション）
  カードが上方向へ吹き飛ぶ（flyAway アニメーション）
  ✦ きらっとしたパーティクル（CSS only、::before / ::after 擬似要素で）
    ↓
[フェーズ3: データ削除]
  IndexedDB から完全削除（db.ts の deleteTask を呼ぶ）
  undo / 復元ナシ
  トースト: 「心機一転！ 忘れて前へ進もう ✦」（既存の toast システム）
```

→これは認識違い
消すボタンは不要だ。72時間強制削除時に、こんな風に消えるようにしたい。ユーザを置いていく


### ボタン仕様
- 既存の削除ボタン（`×` ボタン）を拡張
  - 通常クリック: 既存の通常削除（完了/期限切れ扱い）
  - 長押し 600ms: 心機一転モード開始
  - Shift+クリック: 即心機一転モード（演出短縮版）
- ボタン長押し中: ボタン自体にプログレスリング（CSS border-radius アニメーション）

### データ仕様
- 呼び出し: `db.deleteTask(id)` を直接実行（TTL や完了フラグなし）
- ログ: 残さない
- 同期: なし（ローカル完結）

### テキスト一覧
| フェーズ | テキスト |
|---------|---------|
| 長押し中（進行） | 「本当に消す？」 |
| 実行時 | 「心機一転！」 |
| トースト | 「心機一転！ 忘れて前へ進もう ✦」 |

---

## 3. CSS アニメーション

### 基本方針
- **ぬるぬる = easing にこだわる**。`ease-out` より `cubic-bezier(0.34, 1.56, 0.64, 1)`（spring 感）を多用
- **ゆるく = 少しだけ大げさ**。scale や translate を 5〜15% 余分に動かす
- **楽しく = インタラクションに即レスポンス**。クリック・ホバーはすべて `< 100ms` で反応開始

### タスク作成アニメーション

```css
/* 既存の slideIn を置き換え */
@keyframes taskEnter {
  0%   { opacity: 0; transform: translateY(-16px) scale(0.92); }
  60%  { opacity: 1; transform: translateY(4px) scale(1.02); }   /* バウンス */
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.task-item {
  animation: taskEnter 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

### タスク削除アニメーション（通常）

```css
/* 既存の fadeOut を置き換え */
@keyframes taskExit {
  0%   { opacity: 1; transform: scale(1); max-height: 80px; margin-bottom: 8px; }
  40%  { opacity: 0.5; transform: scale(0.96) translateX(8px); }
  100% { opacity: 0; transform: scale(0.9) translateX(-4px); max-height: 0; margin-bottom: 0; }
}
.task-item.removing {
  animation: taskExit 0.35s cubic-bezier(0.55, 0, 1, 0.45) forwards;
  pointer-events: none;
}
```

### 心機一転！削除アニメーション

```css
/* カードが上に吹き飛ぶ */
@keyframes flyAway {
  0%   { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
  30%  { opacity: 1; transform: scale(1.05) rotate(-2deg) translateY(-8px); }
  100% { opacity: 0; transform: scale(0.8) rotate(8deg) translateY(-120px); }
}
.task-item.shinki-itten {
  animation: flyAway 0.7s cubic-bezier(0.55, 0, 0.85, 0.1) forwards;
}

/* ぷるぷる（確認フェーズ） */
@keyframes shiver {
  0%, 100% { transform: translateX(0); }
  20%  { transform: translateX(-4px) rotate(-1deg); }
  40%  { transform: translateX(4px) rotate(1deg); }
  60%  { transform: translateX(-3px) rotate(-0.5deg); }
  80%  { transform: translateX(3px) rotate(0.5deg); }
}
.task-item.confirm-delete {
  animation: shiver 0.4s ease-in-out infinite;
}

/* キラっとパーティクル（::before ::after で2粒） */
@keyframes sparkle {
  0%   { opacity: 1; transform: scale(0) translate(0, 0); }
  50%  { opacity: 1; transform: scale(1.2) translate(var(--dx), var(--dy)); }
  100% { opacity: 0; transform: scale(0) translate(calc(var(--dx) * 2), calc(var(--dy) * 2)); }
}
.task-item.shinki-itten::before,
.task-item.shinki-itten::after {
  content: '✦';
  position: absolute;
  color: #f9a8d4;
  font-size: 14px;
  animation: sparkle 0.6s ease-out forwards;
}
.task-item.shinki-itten::before { --dx: -20px; --dy: -30px; top: 10px; left: 10px; }
.task-item.shinki-itten::after  { --dx: 20px;  --dy: -20px; top: 10px; right: 10px; }
```

### 長押しプログレスリング

```css
@keyframes pressProgress {
  from { stroke-dashoffset: 100; }
  to   { stroke-dashoffset: 0; }
}
/* SVG で小さなリングを delete ボタン周囲に重ねて表示 */
.delete-ring circle {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: pressProgress 0.6s linear forwards;
}
```

### ボタンインタラクション

```css
/* 全ボタン共通: クリック時のぷにっとした押し込み感 */
button {
  transition: transform 0.1s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.15s ease;
}
button:hover  { transform: scale(1.06) translateY(-1px); }
button:active { transform: scale(0.94); }

/* マイクボタン専用: ふわっと浮く */
.mic-button:hover {
  transform: scale(1.1) translateY(-2px);
  box-shadow: 0 8px 20px rgba(167, 139, 250, 0.5);
}

/* 追加ボタン（テキスト送信）: 右へずれる感じ */
.add-button:hover { transform: scale(1.06) translateX(2px); }
.add-button:active { transform: scale(0.93) translateX(0); }

/* タブボタン: 下にアンダーラインがにゅっと出る（既存の active 表示を補強） */
.tab-button { position: relative; overflow: hidden; }
.tab-button::after {
  content: '';
  position: absolute;
  bottom: 0; left: 50%;
  width: 0; height: 2px;
  background: #a78bfa;
  transition: width 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tab-button.active::after,
.tab-button:hover::after {
  width: 80%; left: 10%;
}
```

### チェックボックス（タスク完了）

```css
@keyframes checkPop {
  0%   { transform: scale(0) rotate(-30deg); }
  60%  { transform: scale(1.3) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); }
}
.task-checkbox:checked + .checkmark {
  animation: checkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## 実装優先度

| 項目 | 優先度 | 依存 |
|------|--------|------|
| アイコン SVG 作成 | 高 | なし |
| ボタンアニメーション | 高 | なし |
| タスク作成/削除アニメーション更新 | 高 | popup.ts のクラス付与ロジック |
| 心機一転 UI / 長押し検出 | 中 | popup.ts, db.ts |
| 心機一転 flyAway + パーティクル | 中 | 上記 |
| 長押しプログレスリング | 低 | SVG 追加が必要 |

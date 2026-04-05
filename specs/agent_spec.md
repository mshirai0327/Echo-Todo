# Echo-Todo 実装仕様

## Issue #4 - 削除ボタン廃止 ＆ 心機一転！TTL自動削除

### 現状

- `deleteBtn`（×ボタン）が各タスクカードに存在
- 長押し600msで `startShinkiDelete()` が発火 → 心機一転アニメーション → DB削除
- TTL切れタスクは `background.ts` の `performTTLCheck()` が5分おきにサイレント削除
- popup を開いても期限切れタスクはアニメーションなしで消えている（再描画時に単純に表示されない）

### 変更方針

削除ボタンを UI から廃止する。タスクを消す手段は TTL のみ。  
popup を開いたとき、期限切れタスクがすでに存在していたら、心機一転アニメーションで順番に消えていく演出を入れる。

### 実装詳細

#### 1. 削除ボタン廃止（popup.ts / popup.html）

- `deleteBtn` の生成・イベント登録コードを削除
- `popup.html` の削除ボタン用 HTML テンプレートも削除
- `LONG_PRESS_DURATION_MS`, `SHINKI_CONFIRM_DURATION_MS` 定数は不要になるので削除
- `startShinkiDelete` の「本当に消す？」確認フェーズ（`confirm-delete` クラス付与）も不要になる

#### 2. TTL切れタスクの心機一転演出（popup.ts）

`renderTasks()` 内、または popup 表示直後の初期化処理に追加する。

```
[popup 表示時フロー]
  renderTasks() が呼ばれる
    ↓
  通常タスクを描画
    ↓
  expireAt < now のタスクを抽出（expiredTasks）
    ↓
  expiredTasks.length > 0 なら:
    各タスクを DOM に描画（通常と同じカード）
    短い delay（200ms）後に順番に startShinkiAutoDelete() を呼ぶ
      ↓
    心機一転！アニメーション（flyAway、0.7s）
      ↓
    db.deleteTask(id) → item.remove()
    ↓
  すべて完了後 updateEmptyState()
```

#### 3. startShinkiAutoDelete（新関数）

`startShinkiDelete` から「本当に消す？」確認フェーズを取り除いたもの。

```typescript
// 確認フェーズなしで即 flyAway → 削除
const startShinkiAutoDelete = async (task: Task, item: HTMLElement) => {
  if (item.classList.contains('task-busy')) return
  setTaskButtonsDisabled(item, true)
  item.classList.add('task-busy', 'shinki-itten')
  setOverlayState('心機一転！', true)          // accent（ピンク）オーバーレイ
  await waitForAnimation(item, 'flyAway', 900)
  await deleteTask(task.id)
  item.remove()
}
```

複数タスクが同時に期限切れの場合、300ms ずつずらして順番に発火する（一斉に消えると混乱するため）。

#### 4. background.ts との整合

`performTTLCheck()` は引き続き動かす（popup が閉じている間に溜まった期限切れを DB から消すため）。  
popup が開いているときは popup 側で削除するため、background の削除と二重にならないよう、`renderTasks()` 内で `expireAt < now` をチェックしてから UI 側で削除する流れは変わらない（DB に存在しなければ `deleteTask` がエラーを出さないことを確認済み）。

---

## Issue #8 - 音声許可ページ表示前の告知

### 現状

- マイク許可エラー（`not-allowed` / `service-not-allowed`）時に `showMicPermissionHelp(autoOpen=true)` が呼ばれる
- `autoOpen=true` のとき `window.open('./mic-permission.html', '_blank')` を即時実行
- ユーザーの操作なしで別タブが開く → 詐欺ページのような印象を与える

### 変更方針

「許可ページを開く前に、ユーザーが自分でボタンを押す」フローにする。  
`autoOpen` を廃止し、インラインの告知 UI から明示的に開かせる。

### 実装詳細

#### 1. showMicPermissionHelp の変更（popup.ts）

`autoOpen` 引数を削除。`window.open` の自動呼び出しを廃止。

変更前:
```typescript
function showMicPermissionHelp(autoOpen = false): void {
  ...
  if (autoOpen && !hasOpenedMicPermissionHelper) {
    hasOpenedMicPermissionHelper = true
    openMicPermissionPage()
  }
}
```

変更後:
```typescript
function showMicPermissionHelp(): void {
  // autoOpen ロジックを完全削除
  // インライン UI のみ表示
}
```

#### 2. インライン告知 UI の変更

現在の `voice-permission-help` の表示内容に、目的を説明する一文を追加する。

```
┌─────────────────────────────────────────────┐
│ マイクを使うには許可が必要です              │
│ 専用ページでブラウザの許可をオンにすると   │
│ 音声でタスクを追加できます                 │
│                                             │
│          [許可ページを開く]                 │
└─────────────────────────────────────────────┘
```

- メッセージを `message.textContent` で2行に分ける（または `<p>` タグに変更）
- ボタンラベルは「許可ページを開く」のまま
- ボタンクリックで `openMicPermissionPage()` → これは既存のまま

#### 3. hasOpenedMicPermissionHelper の扱い

`autoOpen` 廃止により `hasOpenedMicPermissionHelper` フラグが不要になる。削除する。

#### 4. 呼び出し側の修正

```typescript
// 変更前
showMicPermissionHelp(true)

// 変更後
showMicPermissionHelp()
```

2箇所（484行目、503行目付近）を修正する。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/popup/popup.ts` | 削除ボタン廃止、`startShinkiAutoDelete` 追加、`renderTasks` に TTL 演出追加、`showMicPermissionHelp` の `autoOpen` 廃止 |
| `src/popup/popup.html` | 削除ボタン HTML 削除 |
| `src/styles/` | `confirm-delete` クラス（長押し用）は不要なら削除。`shinki-itten` は引き続き使用 |

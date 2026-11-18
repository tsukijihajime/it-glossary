# IT用語辞書サイト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Pages で公開する、非技術者向け IT 用語辞書の静的サイトを作る。

**Architecture:** ビルドなしの素の HTML/CSS/JS。純粋関数（正規化・検索・CSV・マージ）を `lib.js` に分離し Node の `node:test` で単体テスト。DOM 操作は `app.js`。データは `data/terms.json`。

**Tech Stack:** HTML / CSS / ES2020 JavaScript（ライブラリなし）、Node 24 `node:test`（テストのみ）

**Spec:** `docs/specs/2026-11-18-it-glossary-design.md`

## Global Constraints

- 外部ライブラリ・CDN・ビルド工程を使わない。
- 解説文は通常の日本語（です・ます調）、非技術者向け。
- 社内固有情報を掲載しない（一般用語のみ）。
- 分野は 8 種固定: ネットワーク／セキュリティ／クラウド／開発・プログラミング／データ・AI／ハードウェア・組込み／プロジェクト・業務／よく聞く略語
- localStorage アクセスはすべて try/catch（使えなくても閲覧は動く）。
- CSV は UTF-8 BOM 付き、RFC 4180 準拠のクォート。

## Review Focus

1. CSV にカンマ・改行・ダブルクォートを含む解説 → 往復（export→import）で内容が変わらない。
2. 必須項目（id/term/category）欠落や不正 JSON のインポート → 該当行をスキップし件数を通知、既存データは壊れない。
3. 「ＡＰＩ」「えーぴーあい」「api」等表記ゆれ検索 → 同じ用語がヒット。
4. 関連用語に存在しない id → リンクを出さずに無視。
5. `file://` で開いた場合や localStorage 無効 → fetch 失敗時にメッセージ表示、お気に入りは無効でも閲覧可能。

各項目は Task 1 のテストで固定する（5 は手動確認、Task 3）。

---

### Task 1: lib.js（純粋関数）とテスト

**Files:**
- Create: `lib.js`（ブラウザでは `window.GlossaryLib`、Node では `module.exports`）
- Test: `tests/lib.test.js`

**Interfaces (Produces):**
- `normalize(s: string): string` — NFKC、小文字化、カタカナ→ひらがな、空白除去
- `searchTerms(terms: Term[], query: string): Term[]` — term/reading/fullName/summary/description を正規化して部分一致。term 前方一致を先頭に並べる
- `toCSV(terms: Term[]): string` — BOM 付き、ヘッダは Term のキー順、related は `|` 区切り
- `parseCSV(text: string): Term[]`
- `validateTerms(raw: any[]): { valid: Term[], skipped: number }` — id/term/category 必須、level は 1〜3 に丸め（既定 1）
- `mergeTerms(base: Term[], local: Term[]): Term[]` — 同 id は local が上書きし `_local: true` を付与
- `termOfTheDay(terms: Term[], date: Date): Term` — `YYYYMMDD` 数値 mod 件数
- `initialOf(term: Term): string` — 英字は `A`〜`Z`、かなは あかさたなはまやらわ の行、その他 `#`

- [ ] Step 1: テストを書く（`node:test`）
  - `normalize("ＡＰＩ") === normalize("api")`、`normalize("エーピーアイ") === "えーぴーあい"`
  - `searchTerms` で `"ｸﾗｳﾄﾞ"` が term `クラウド` にヒット
  - `parseCSV(toCSV(x))` が x と deepEqual（description に `,` `"` `\n` を含むケース）
  - `validateTerms([{id:"a",term:"A",category:"ネットワーク"},{term:"no id"}])` → valid 1件 skipped 1
  - `mergeTerms` で同 id 上書き＋`_local` 付与
  - `initialOf({reading:"くらうど"}) === "か"`、`initialOf({term:"API",reading:"えーぴーあい"}) === "A"`
- [ ] Step 2: `node --test tests/` → FAIL
- [ ] Step 3: `lib.js` 実装
- [ ] Step 4: `node --test tests/` → PASS
- [ ] Step 5: Commit `feat: 検索・CSV・マージ等の純粋関数を追加`

### Task 2: 初期データ data/terms.json

**Files:** Create `data/terms.json`、Test: `tests/data.test.js`

- [ ] Step 1: テスト — 全件 `validateTerms` で skipped 0、id 重複なし、category が 8 種のいずれか、related の id がすべて存在、件数 ≥ 100、各分野 ≥ 10
- [ ] Step 2: 約 120 語を作成（です・ます調、例え話・使用例付き）
- [ ] Step 3: `node --test tests/` → PASS
- [ ] Step 4: Commit `feat: 初期用語データを追加`

### Task 3: 画面（index.html / style.css / app.js）

**Files:** Create `index.html`, `style.css`, `app.js`

**Interfaces (Consumes):** Task 1 の全関数、`data/terms.json`

localStorage キー: `glossary.favorites`（id 配列）、`glossary.localTerms`（Term 配列）

- [ ] Step 1: 実装 — ヘッダ検索欄、今日の用語、分野タブ、難易度/お気に入りフィルタ、頭文字索引、カード一覧、詳細ダイアログ（関連用語リンク・`#term=<id>` 同期）、インポート（JSON/CSV、結果件数トースト）、エクスポート（全件/表示中 × JSON/CSV）、ローカル用語の削除、ライト/ダーク
- [ ] Step 2: `npx http-server` 相当でローカル配信しブラウザ確認：検索・タブ・索引・詳細・ハッシュ直リンク・お気に入り・インポート/エクスポート往復・スマホ幅 375px
- [ ] Step 3: Commit `feat: 用語辞書の画面を追加`

### Task 4: README と公開手順

**Files:** Create `README.md`, `.nojekyll`

- [ ] Step 1: README — 概要、GitHub Pages 有効化手順、Teams Web サイトタブ追加手順、用語の追加方法（直接編集 / CSV エクスポート→変換→コミット）、テスト実行方法、掲載ルール（社内固有情報禁止）
- [ ] Step 2: Commit `docs: README と公開手順を追加`

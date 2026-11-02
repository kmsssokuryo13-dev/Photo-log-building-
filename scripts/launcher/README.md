# photo-log-building local production launcher

建物写真整理アプリを Windows で `http://localhost:5177/` に起動するための script 群です
（doc-make・doc-make-land の `scripts/launcher` と同じ仕組み）。

## セットアップ（PC ごとに1回）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launcher\setup-shortcuts.ps1
```

current user の Desktop に `建物写真整理`（起動）と `建物写真整理 終了（推奨）`（停止）を作ります。

## SURVIA から

SURVIA の設定「建物写真整理」でこのフォルダを選ぶと、

- SURVIA を起動したときに、止まっていれば裏で起動しておきます（`-NoBrowser`）。
- 案件の「写真台帳」→「建物写真整理で開く」で、案件のフォルダの写真と建物の種類（グループ名）を入れた状態で開きます。
- 「案件へ保存」で、写真.pdf を案件のフォルダへ保存します。

## 動作の要点

- 利用 URL は常に `http://localhost:5177/`。5177 が建物写真整理以外に使われていれば、明示エラーで止まります。
- 建物写真整理かどうかは `index.html` の `<meta name="app-id" content="photo-log-building">` で確かめます。
- `node_modules` が `package-lock.json` より古ければ build の前に `npm install`、`dist` が build 入力より新しければ build を省きます。
- server は `vite preview --host localhost --port 5177 --strictPort` を `node` から直接起動し、状態は `%LOCALAPPDATA%\photo-log-building-launcher\state.json` に残します。

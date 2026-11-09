# THE BACKROOMS: ENDLESS

無限に続く「バックルーム」を探索する一人称視点の探索・サバイバルホラー。
すべてのテクスチャ・音はコードで生成しています(外部アセット不使用)。

仕様書: [SPEC_v0.3.md](SPEC_v0.3.md) / 進捗: [PROGRESS.md](PROGRESS.md)

## いちばん簡単な遊び方(Windows・常に最新版)
Node.js と Git を入れて `git clone` した後は、フォルダ内の **`起動.bat` をダブルクリック**するだけです。
自動で「最新版の取得 → 部品の更新 → ゲームウィンドウで起動」を行います。

## 遊び方(ブラウザ・開発用)
```
npm install
npm run dev
```
ブラウザで http://localhost:5173/ を開き、クリックで開始。

- `?debug=1` … デバッグ表示
- `?seed=任意の文字列` … ワールドシード固定
- `?level=0` … 開始レベル

## 操作
| 入力 | 動作 |
|---|---|
| WASD | 移動 |
| マウス | 視点 |
| Shift | 走る |
| Ctrl / C | しゃがむ |
| Esc | ポーズ・設定 |

## クレジット
Inspired by the Backrooms Wiki community (backrooms.fandom.com)

## exe(Windows)の入手方法
1. GitHub リポジトリの **Actions** タブを開く
2. 「build」ワークフローの最新の実行(緑のチェック)を開く
   - main ブランチ以外で試す場合は「Run workflow」から手動実行できます
3. ページ下部の **Artifacts** から `BackroomsEndless-windows` をダウンロードして解凍
4. `BackroomsEndless-x.y.z-portable.exe` をダブルクリック(インストール不要)。`-setup.exe` はインストーラ版

`v*` タグ(例 `v0.1.0`)を push すると、GitHub Releases にも exe が添付されます。

> **注意**: コード署名をしていないため、初回起動時に Windows SmartScreen の警告が出ます。「詳細情報」→「実行」で起動できます。

exe 版の起動引数: `--level=<id>` `--seed=<seed>` `--dev`(デバッグ表示)。F11 でフルスクリーン切り替え。
設定とセーブは `%APPDATA%/backrooms-endless/` に保存されます。

## 自分の PC でビルドする場合
```
npm install
npm run electron   # Electron で起動
npm run dist       # release/ に exe を出力(Windows 上で実行)
```

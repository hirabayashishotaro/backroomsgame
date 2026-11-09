# PROGRESS

## Phase 1 — 雛形・一人称移動 ✅
- Vite + TypeScript(strict) + three.js の雛形、ゲームループ(`src/game.ts`)
- 一人称移動(WASD / マウス / Shift 走る / Ctrl・C しゃがむ)、円柱 vs AABB の衝突(サブステップでトンネリング防止)
- シード付き RNG(mulberry32、整数ハッシュ)`src/core/rng.ts`
- デバッグオーバーレイ `?debug=1`(FPS・レベル・座標・チャンク・ロード数・原点・歩行距離)
- 設定の保存(感度XY・Y反転・FOV・描画距離・音量・ハム音・揺れ・フルスクリーン)。ブラウザは localStorage、Electron は userData/settings.json
- 起動パラメータ: `?level=<id>` `?seed=<seed>` `?debug=1`(exe 版は `--level=` `--seed=` `--debug`)

## Phase 3(前倒しで実装)— チャンク管理・Level 0 ✅
- `ChunkManager`: 半径 R 内を時間予算(4ms/フレーム)付きキューで生成、進行方向を優先、R+1 外を破棄(geometry dispose)
- `FloatingOrigin`: 原点から 1000m 離れたらチャンク境界に揃えて原点を移動
- Level 0: エッジハッシュ迷路(セル 4m、1 チャンク 32m)。領域タイプ(迷路/通常/広間+柱)、出入口付きの壁、コンセント、天井の蛍光灯(点灯/切れ/点滅)
- 頂点ベイクの照明(蛍光灯からの光だまり)、Canvas 生成テクスチャ(壁紙・湿ったカーペット・天井ボード)、指数フォグ
- Web Audio のハム音(60Hz+倍音、ゆらぎ)、室内ノイズ、足音
- テスト: 決定性、チャンク境界の壁の一致、50km 移動でチャンク数上限を超えない/build と dispose の数が一致、フローティングオリジン、衝突、設定のクランプ

## 動作確認
```
npm install
npm run dev        # http://localhost:5173/?debug=1
npm test
npm run build
```

## 未解決 / 次にやること
- Phase 2: Electron 化 + GitHub Actions で exe 出力
- Phase 4: ステータス・インベントリ・アイテム・HUD・Level 0 のセットピース・幻覚
- 照明: 壁による遮蔽を考慮していない(光が壁越しに床へ漏れる)。必要なら後で改善

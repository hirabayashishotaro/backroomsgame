import { Game, readLaunchOptions } from './game';

const app = document.getElementById('app')!;
try {
  new Game(app, readLaunchOptions());
} catch (e) {
  console.error(e);
  app.innerHTML =
    '<div style="padding:32px;line-height:1.8;color:#e9dfae">' +
    '<h2>ゲームを起動できませんでした</h2>' +
    '<p>3D 描画(WebGL)が使えない可能性があります。グラフィックドライバを更新するか、Chrome / Edge の最新版でお試しください。</p>' +
    '<pre style="opacity:.6;white-space:pre-wrap"></pre></div>';
  app.querySelector('pre')!.textContent = String(e);
}

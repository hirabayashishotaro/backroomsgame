import { Game, readLaunchOptions } from './game';

const app = document.getElementById('app')!;
new Game(app, readLaunchOptions());

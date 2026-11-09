/**
 * Procedural audio via Web Audio (no audio files). Phase 3: electrical hum +
 * room noise + footsteps.
 */
import type { AmbienceDef } from '../levels/levelDefinition';
import type { Settings } from '../core/settings';

export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambienceBus!: GainNode;
  private sfxBus!: GainNode;
  private entityBus!: GainNode;
  private humGain!: GainNode;
  private noiseGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;
  private humOscs: OscillatorNode[] = [];
  private lfo!: OscillatorNode;
  private noiseBuffer!: AudioBuffer;
  private ambience: AmbienceDef | null = null;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.entityBus = ctx.createGain();
    this.entityBus.connect(this.master);

    // Noise buffer (seeded LCG; audio is not world generation but keep it deterministic).
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = s / 2147483648 - 1;
    }

    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 700;
    this.humGain.connect(humFilter).connect(this.ambienceBus);
    // Slow wobble on the hum level.
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    this.lfo.connect(lfoGain).connect(this.humGain.gain);
    this.lfo.start();

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'lowpass';
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.ambienceBus);
    noise.start();

    if (this.ambience) this.setAmbience(this.ambience);
  }

  applySettings(s: Settings): void {
    if (!this.ctx) return;
    this.master.gain.value = s.masterVolume;
    this.ambienceBus.gain.value = s.ambienceVolume;
    this.sfxBus.gain.value = s.sfxVolume;
    this.entityBus.gain.value = s.entityVolume;
    this.humStrength = s.humStrength;
    if (this.ambience) this.setAmbience(this.ambience);
  }

  private humStrength = 0.6;

  setAmbience(a: AmbienceDef): void {
    this.ambience = a;
    const ctx = this.ctx;
    if (!ctx) return;
    for (const o of this.humOscs) o.stop();
    this.humOscs = [];
    const t = ctx.currentTime;
    if (a.humFreq > 0) {
      // Fundamental + harmonics, slightly detuned for a buzzy fluorescent hum.
      const partials: Array<[number, number, OscillatorType]> = [
        [1, 0.5, 'sine'],
        [2, 0.35, 'sawtooth'],
        [3, 0.12, 'square'],
        [4.01, 0.08, 'sine'],
      ];
      for (const [mul, g, type] of partials) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = a.humFreq * mul;
        const og = ctx.createGain();
        og.gain.value = g * 0.25;
        o.connect(og).connect(this.humGain);
        o.start();
        this.humOscs.push(o);
      }
    }
    this.humGain.gain.setTargetAtTime(a.humGain * this.humStrength, t, 0.5);
    this.noiseGain.gain.setTargetAtTime(a.noiseGain, t, 0.5);
    this.noiseFilter.frequency.value = a.noiseCutoff;
  }

  /** Short tonal blip (UI / pickup). */
  blip(freq = 880, dur = 0.08, gain = 0.12): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  pickup(): void {
    this.blip(660, 0.06, 0.08);
    setTimeout(() => this.blip(990, 0.08, 0.06), 60);
  }

  click(): void {
    this.noiseBurst(2500, 0.03, 0.15, 'highpass');
  }

  // ---------------------------------------------------------------- weapons --

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, out: AudioNode, gain: GainNode): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(gain).connect(out);
    src.start(t, (t * 0.71) % 1.4, dur + 0.05);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: GainNode, out: AudioNode): void {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(gain).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Gunshot: crack + body + room tail. */
  gunshot(kind: 'pistol' | 'magnum'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const big = kind === 'magnum';
    this.noise(t, 0.05, 'highpass', 1800, 0.7, this.sfxBus, this.env(t, big ? 0.9 : 0.6, 0.002, 0.05));
    this.noise(t, big ? 0.35 : 0.18, 'lowpass', big ? 900 : 1500, 0.8, this.sfxBus, this.env(t, big ? 1.0 : 0.6, 0.003, big ? 0.35 : 0.18));
    this.tone(t, 'sine', big ? 120 : 180, 40, big ? 0.25 : 0.12, this.env(t, big ? 0.8 : 0.4, 0.002, big ? 0.25 : 0.12), this.sfxBus);
    // Reverberant tail (the empty rooms answer)
    this.noise(t + 0.03, big ? 1.2 : 0.7, 'bandpass', 600, 0.6, this.sfxBus, this.env(t + 0.03, big ? 0.18 : 0.1, 0.05, big ? 1.1 : 0.6));
  }

  /** Rocket launch: a thump and a hissing whoosh. */
  rocketLaunch(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'sine', 110, 45, 0.3, this.env(t, 0.9, 0.003, 0.3), this.sfxBus);
    this.noise(t, 0.9, 'bandpass', 1800, 0.6, this.sfxBus, this.env(t, 0.5, 0.01, 0.85));
  }

  dryFire(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noise(t, 0.03, 'bandpass', 3500, 4, this.sfxBus, this.env(t, 0.25, 0.001, 0.03));
  }

  /** Magazine out / in / slide. */
  reloadSound(kind: 'pistol' | 'magnum', duration: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const marks = kind === 'magnum' ? [0.15, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, duration - 0.2] : [0.2, duration * 0.6, duration - 0.15];
    marks.forEach((m, i) => {
      const f = kind === 'magnum' && i > 0 && i < marks.length - 1 ? 2600 : 1600 + i * 300;
      this.noise(t + m, 0.04, 'bandpass', f, 5, this.sfxBus, this.env(t + m, 0.3, 0.002, 0.05));
    });
  }

  throwWhoosh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noise(t, 0.25, 'bandpass', 1400, 1.5, this.sfxBus, this.env(t, 0.2, 0.05, 0.2));
  }

  swing(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noise(t + 0.1, 0.2, 'bandpass', 900, 1.2, this.sfxBus, this.env(t + 0.1, 0.28, 0.06, 0.15));
  }

  /** Impact on a surface or a body. */
  impact(onFlesh: boolean, pan = 0, dist = 5): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    const v = Math.min(1, 6 / (dist + 1));
    if (onFlesh) this.noise(t, 0.12, 'lowpass', 500, 1, p, this.env(t, 0.5 * v, 0.003, 0.12));
    else this.noise(t, 0.06, 'bandpass', 2400, 2, p, this.env(t, 0.35 * v, 0.002, 0.06));
  }

  /** Hit marker tick (head = higher). */
  hitTick(head: boolean, kill: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'square', head ? 2200 : 1500, head ? 2100 : 1400, 0.04, this.env(t, 0.08, 0.001, 0.04), this.sfxBus);
    if (kill) this.tone(t + 0.05, 'triangle', 900, 500, 0.18, this.env(t + 0.05, 0.12, 0.005, 0.18), this.sfxBus);
  }

  /** Positional entity voice: growl, giggle, whisper "help", hum. */
  entityVoice(kind: 'growl' | 'giggle' | 'help' | 'hum' | 'step' | 'hiss' | 'boom' | 'stomp' | 'groan' | 'shot' | 'zap' | 'thunder', pan: number, dist: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.entityBus);
    const v = Math.min(1, 10 / (dist + 2));
    switch (kind) {
      case 'growl': {
        const g = this.env(t, 0.35 * v, 0.1, 0.9);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 55;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 23;
        const lg = ctx.createGain();
        lg.gain.value = 18;
        lfo.connect(lg).connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 400;
        o.connect(f).connect(g).connect(p);
        o.start(t);
        lfo.start(t);
        o.stop(t + 1.1);
        lfo.stop(t + 1.1);
        break;
      }
      case 'giggle':
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.13, 'triangle', 700 - i * 40, 560 - i * 40, 0.09, this.env(t + i * 0.13, 0.12 * v, 0.01, 0.09), p);
        break;
      case 'help':
        // Two formant "syllables": ta-su-ke-te
        for (let i = 0; i < 4; i++) this.noise(t + i * 0.18, 0.14, 'bandpass', [900, 1400, 1100, 1300][i], 8, p, this.env(t + i * 0.18, 0.28 * v, 0.02, 0.13));
        break;
      case 'hum':
        this.tone(t, 'sine', 70, 66, 1.5, this.env(t, 0.25 * v, 0.4, 1.0), p);
        break;
      case 'step':
        this.noise(t, 0.08, 'lowpass', 300, 1, p, this.env(t, 0.25 * v, 0.004, 0.08));
        break;
      case 'hiss':
        // Rising hiss of something about to burst.
        this.noise(t, 1.4, 'bandpass', 3200, 2, p, this.env(t, 0.35 * v, 1.1, 0.3));
        this.tone(t, 'sine', 180, 520, 1.4, this.env(t, 0.12 * v, 1.2, 0.2), p);
        break;
      case 'boom': {
        const vv = Math.min(1, 20 / (dist + 4));
        this.noise(t, 1.2, 'lowpass', 900, 0.7, p, this.env(t, 0.9 * vv, 0.003, 1.1));
        this.tone(t, 'sine', 90, 28, 0.9, this.env(t, 0.8 * vv, 0.003, 0.9), p);
        break;
      }
      case 'stomp': {
        const vv = Math.min(1, 30 / (dist + 6));
        this.tone(t, 'sine', 55, 24, 0.5, this.env(t, 0.7 * vv, 0.004, 0.5), p);
        this.noise(t, 0.3, 'lowpass', 220, 1, p, this.env(t, 0.5 * vv, 0.004, 0.3));
        break;
      }
      case 'shot': {
        // Distant revolver crack.
        const vv = Math.min(1, 25 / (dist + 5));
        this.noise(t, 0.25, 'bandpass', 1400, 0.8, p, this.env(t, 0.55 * vv, 0.002, 0.22));
        this.tone(t, 'sine', 140, 50, 0.2, this.env(t, 0.45 * vv, 0.002, 0.2), p);
        break;
      }
      case 'zap':
        // Crackle as the spell is cast.
        for (let i = 0; i < 6; i++) this.noise(t + i * 0.07, 0.05, 'highpass', 3000 + i * 300, 1, p, this.env(t + i * 0.07, 0.18, 0.003, 0.05));
        this.tone(t, 'sawtooth', 220, 880, 0.9, this.env(t, 0.08, 0.6, 0.3), p);
        break;
      case 'thunder': {
        const vv = Math.min(1, 25 / (dist + 3));
        this.noise(t, 0.15, 'highpass', 2000, 0.5, p, this.env(t, 0.9 * vv, 0.001, 0.15));
        this.noise(t + 0.03, 1.6, 'lowpass', 500, 0.7, p, this.env(t + 0.03, 0.8 * vv, 0.01, 1.5));
        this.tone(t, 'sine', 70, 30, 1.2, this.env(t, 0.6 * vv, 0.005, 1.1), p);
        break;
      }
      case 'groan':
        this.tone(t, 'sawtooth', 48, 40, 2.2, this.env(t, 0.22 * Math.min(1, 30 / (dist + 6)), 0.5, 1.6), p);
        this.tone(t, 'sine', 72, 60, 2.2, this.env(t, 0.2 * Math.min(1, 30 / (dist + 6)), 0.5, 1.6), p);
        break;
    }
  }

  /** Jump-scare sting (0..1 strength). */
  sting(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || strength <= 0) return;
    const t = ctx.currentTime;
    for (const f of [311, 330, 466, 622]) this.tone(t, 'sawtooth', f, f * 0.97, 0.9, this.env(t, 0.12 * strength, 0.005, 0.9), this.sfxBus);
    this.noise(t, 0.6, 'highpass', 1200, 0.5, this.sfxBus, this.env(t, 0.4 * strength, 0.003, 0.6));
  }

  /** Low thud when the player is hurt. */
  hurt(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'sine', 90, 40, 0.3, this.env(t, 0.6, 0.005, 0.3), this.sfxBus);
  }

  /** Low whoosh for level transitions. */
  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const g = ctx.createGain();
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.8);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, 0, 1.8);
  }

  /** Door handle and creak. */
  door(): void {
    this.noiseBurst(1800, 0.05, 0.2, 'bandpass');
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 6;
    const t = ctx.currentTime + 0.08;
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(95, t + 0.7);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.1);
    g.gain.linearRampToValueAtTime(0, t + 0.75);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.8);
  }

  /** Chalk scratching on a wall. */
  noiseScratch(): void {
    for (let i = 0; i < 4; i++) setTimeout(() => this.noiseBurst(3200 + i * 300, 0.07, 0.06, 'bandpass'), i * 70);
  }

  /** A few low gulps. */
  drink(): void {
    for (let i = 0; i < 3; i++) setTimeout(() => this.noiseBurst(300 + i * 40, 0.12, 0.25, 'lowpass'), i * 260);
  }

  private noiseBurst(freq: number, dur: number, gain: number, type: BiquadFilterType, pan = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(p).connect(this.sfxBus);
    src.start(t, (t * 0.37) % 1.5, dur + 0.05);
  }

  /** Hallucinated whisper: breathy formant noise with syllable-like modulation. */
  whisper(pan: number, gain = 0.06): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 1.2 + (t % 1);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const out = ctx.createGain();
    out.gain.value = 0;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    for (const [f, q] of [[700, 6], [1200, 8], [2600, 10]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      src.connect(bp).connect(out);
    }
    // Syllables
    const syll = 5 + Math.floor((t * 7) % 4);
    for (let i = 0; i < syll; i++) {
      const st = t + (i / syll) * dur;
      out.gain.setValueAtTime(0, st);
      out.gain.linearRampToValueAtTime(gain, st + 0.04);
      out.gain.linearRampToValueAtTime(0, st + (dur / syll) * 0.8);
    }
    out.connect(p).connect(this.entityBus);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  /** Distant footsteps that are not yours. */
  distantSteps(pan: number, count = 5): void {
    for (let i = 0; i < count; i++) setTimeout(() => this.noiseBurst(260, 0.12, 0.07 * (1 - i * 0.1), 'lowpass', pan), i * 520);
  }

  /** Brief dip of the hum (used as an omen / hallucination). */
  humDip(seconds = 1.5): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambience) return;
    const t = ctx.currentTime;
    const g = this.humGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.0, t, 0.05);
    g.setTargetAtTime(this.ambience.humGain * this.humStrength, t + seconds, 0.3);
  }

  /** Footstep; the surface changes the filter (carpet is soft, concrete clicks). */
  footstep(intensity = 1, surface: 'carpet' | 'concrete' | 'tile' | 'water' | 'metal' = 'carpet'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const base = surface === 'carpet' ? 380 : surface === 'concrete' ? 1100 : surface === 'tile' ? 1600 : 700;
    f.frequency.value = base + Math.random() * 120; // cosmetic only, not world gen
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * intensity, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + (surface === 'carpet' ? 0.16 : 0.09));
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5, 0.2);
  }
}

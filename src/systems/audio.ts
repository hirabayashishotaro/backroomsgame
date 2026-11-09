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

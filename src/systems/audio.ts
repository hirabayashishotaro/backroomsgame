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

  /** Soft carpet footstep. */
  footstep(intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380 + Math.random() * 120; // cosmetic only, not world gen
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * intensity, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 1.5, 0.2);
  }
}

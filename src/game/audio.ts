import { WeaponId } from './types';

const BO2_AUDIO_URLS = {
  roundEnd: '/audio/bo2_round_end.mp3',
  roundStart: '/audio/bo2_round_start.mp3',
  an94Shot: '/assets/aistudio/wpn_an94_shot_plr.LN65.pc.snd_cfc4316f.wav',
  hamrShot: '/assets/aistudio/wpn_hamr_shot_plr.LN65.pc.snd_8b92f9e7.wav',
  menuTheme: '/assets/aistudio/Call_of_Duty_Black_Ops_Zombies_Main_Menu_Theme_d550d518.mp3',
} as const;

const MENU_THEME_VOLUME = 0.48;

/**
 * Horror Soundscape, Looping Black Ops Zombies Main Menu Theme ("Damned"),
 * Decoded Real BO2 Weapon Audio (AN-94 & HAMR WAVs),
 * Ray Gun Plasma Synth, and Full Uncut BO2 Zombies Round-Change Audio Player.
 */
export class HorrorAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private ambienceGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private ambienceStarted = false;
  private dripTimer = 0;
  private crackleTimer = 0;

  // Looping Main Menu Theme (HTMLAudioElement starts instantly without decoding 3 minutes of PCM)
  private menuAudio: HTMLAudioElement | null = null;
  private menuThemeDesired = false;
  private menuFadeTimer: number | null = null;

  // Decoded uncut BO2 round-change clips & real BO2 weapon shot WAVs
  private roundEndBuffer: AudioBuffer | null = null;
  private roundStartBuffer: AudioBuffer | null = null;
  private an94ShotBuffer: AudioBuffer | null = null;
  private hamrShotBuffer: AudioBuffer | null = null;
  private rawAudioPromises: Promise<ArrayBuffer | null>[] | null = null;
  private decodePromise: Promise<void> | null = null;

  private activeRoundSource: AudioBufferSourceNode | null = null;
  private activeRoundGain: GainNode | null = null;
  private roundPlayNonce = 0;

  constructor() {
    this.prefetchRawClips();
    this.initMenuAudio();
  }

  private initMenuAudio(): void {
    if (typeof Audio === 'undefined') return;
    const el = new Audio(BO2_AUDIO_URLS.menuTheme);
    el.loop = true;
    el.preload = 'auto';
    el.volume = MENU_THEME_VOLUME;
    el.muted = this.muted;
    this.menuAudio = el;
  }

  private clearMenuFade(): void {
    if (this.menuFadeTimer !== null) {
      window.clearInterval(this.menuFadeTimer);
      this.menuFadeTimer = null;
    }
  }

  /** Starts or resumes the iconic Black Ops Zombies Main Menu Theme */
  public startMenuTheme(): void {
    this.menuThemeDesired = true;
    if (!this.menuAudio) return;
    this.clearMenuFade();
    this.menuAudio.muted = this.muted;
    this.menuAudio.volume = MENU_THEME_VOLUME;
    if (this.menuAudio.paused) {
      this.menuAudio.play().catch(() => {
        // Browser blocked autoplay prior to first user gesture; will retry on first click/key
      });
    }
  }

  /** Smoothly fades out and pauses the Main Menu Theme when entering gameplay */
  public stopMenuTheme(fadeSeconds = 0.85): void {
    this.menuThemeDesired = false;
    if (!this.menuAudio) return;
    this.clearMenuFade();
    if (this.menuAudio.paused) return;

    const el = this.menuAudio;
    const startVol = el.volume;
    const steps = Math.max(1, Math.round((fadeSeconds * 1000) / 30));
    let step = 0;

    this.menuFadeTimer = window.setInterval(() => {
      step += 1;
      const frac = Math.max(0, 1 - step / steps);
      el.volume = startVol * frac;
      if (step >= steps) {
        this.clearMenuFade();
        el.pause();
        el.currentTime = 0;
        el.volume = MENU_THEME_VOLUME;
      }
    }, 30);
  }

  public destroy(): void {
    this.clearMenuFade();
    this.stopActiveRoundAudio();
    if (this.menuAudio) {
      this.menuAudio.pause();
      this.menuAudio.src = '';
      this.menuAudio = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  /** Exact duration (seconds) of the uncut BO2 round-end audio clip */
  public getRoundEndDuration(): number {
    return this.roundEndBuffer ? this.roundEndBuffer.duration : 8.18;
  }

  /** Exact duration (seconds) of the uncut BO2 round-start audio clip */
  public getRoundStartDuration(): number {
    return this.roundStartBuffer ? this.roundStartBuffer.duration : 11.15;
  }

  private prefetchRawClips(): void {
    if (this.rawAudioPromises || typeof fetch === 'undefined') return;
    const urls = [
      BO2_AUDIO_URLS.roundEnd,
      BO2_AUDIO_URLS.roundStart,
      BO2_AUDIO_URLS.an94Shot,
      BO2_AUDIO_URLS.hamrShot,
    ];
    this.rawAudioPromises = urls.map((url) =>
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .catch(() => null)
    );
  }

  private decodeAudioClips(): void {
    if (this.decodePromise || !this.ctx || !this.rawAudioPromises) return;
    const ctx = this.ctx;

    this.decodePromise = Promise.all(this.rawAudioPromises).then(async (rawList) => {
      const [endRaw, startRaw, an94Raw, hamrRaw] = rawList;
      const tryDecode = async (raw: ArrayBuffer | null): Promise<AudioBuffer | null> => {
        if (!raw) return null;
        try {
          return await ctx.decodeAudioData(raw.slice(0));
        } catch {
          return null;
        }
      };

      const [endBuf, startBuf, an94Buf, hamrBuf] = await Promise.all([
        tryDecode(endRaw),
        tryDecode(startRaw),
        tryDecode(an94Raw),
        tryDecode(hamrRaw),
      ]);

      this.roundEndBuffer = endBuf;
      this.roundStartBuffer = startBuf;
      this.an94ShotBuffer = an94Buf;
      this.hamrShotBuffer = hamrBuf;
    });
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.82, this.ctx.currentTime, 0.03);
    }
    if (this.menuAudio) {
      this.menuAudio.muted = m;
      if (!m && this.menuThemeDesired && this.menuAudio.paused) {
        this.menuAudio.play().catch(() => {});
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      // Master soft limiter prevents overlapping rapid-fire WAV gunshots from clipping
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.knee.value = 14;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.12;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.82;
      this.masterGain.connect(this.compressor).connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 2.0);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.decodeAudioClips();
    if (!this.ambienceStarted) {
      this.startPrisonAmbience();
    }
  }

  public setPaused(paused: boolean): void {
    if (!this.ambienceGain || !this.ctx) return;
    this.ambienceGain.gain.setTargetAtTime(paused ? 0.035 : 0.16, this.ctx.currentTime, 0.12);
    if (this.activeRoundGain) {
      this.activeRoundGain.gain.setTargetAtTime(paused ? 0.14 : 0.92, this.ctx.currentTime, 0.12);
    }
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private startPrisonAmbience(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    this.ambienceStarted = true;

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.16;
    this.ambienceGain.connect(this.masterGain);

    // Low-frequency industrial ventilation drone
    const drone1 = this.ctx.createOscillator();
    drone1.type = 'sawtooth';
    drone1.frequency.value = 44;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 110;
    const d1Gain = this.ctx.createGain();
    d1Gain.gain.value = 0.22;
    drone1.connect(droneFilter).connect(d1Gain).connect(this.ambienceGain);
    drone1.start();

    // Sub-harmonic unsettling hum
    const drone2 = this.ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 58.2;
    const d2Gain = this.ctx.createGain();
    d2Gain.gain.value = 0.16;
    drone2.connect(d2Gain).connect(this.ambienceGain);
    drone2.start();

    // Smoky prison air & distant fire rumble
    const air = this.ctx.createBufferSource();
    air.buffer = this.noiseBuffer;
    air.loop = true;
    const airFilter = this.ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 280;
    airFilter.Q.value = 1.4;
    const airGain = this.ctx.createGain();
    airGain.gain.value = 0.11;
    air.connect(airFilter).connect(airGain).connect(this.ambienceGain);
    air.start();
  }

  /** Schedules sparse echoing water drips, distant pipe clanks, and subtle burning barrel crackles */
  public updateAmbience(dt: number, active: boolean): void {
    if (!active || !this.ctx || !this.masterGain || this.muted) return;

    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 3.8 + Math.random() * 6.5;
      if (Math.random() < 0.62) {
        this.playWaterDrip();
      } else {
        this.playDistantPipeClank();
      }
    }

    this.crackleTimer -= dt;
    if (this.crackleTimer <= 0) {
      this.crackleTimer = 0.35 + Math.random() * 1.15;
      this.playFireCrackle();
    }
  }

  private playFireCrackle(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2600 + Math.random() * 2400;
    hp.Q.value = 2.4;
    const g = this.ctx.createGain();
    const peak = 0.014 + Math.random() * 0.022;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028 + Math.random() * 0.025);
    src.connect(hp).connect(g).connect(this.masterGain);
    src.start(t, Math.random() * 1.5, 0.06);
  }

  private playWaterDrip(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    const base = 780 + Math.random() * 420;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.9, t + 0.055);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.032, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private playDistantPipeClank(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const freqs = [184, 297, 462];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f * (0.94 + Math.random() * 0.12), t);
      g.gain.setValueAtTime(0.024, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      osc.connect(g).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.7);
    }
  }

  private playOverlappingShotBuffer(buffer: AudioBuffer, gainLevel: number): void {
    if (!this.ctx || !this.masterGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const g = this.ctx.createGain();
    g.gain.value = gainLevel;
    src.connect(g).connect(this.masterGain);
    src.start();
  }

  public playGunshot(weaponId: WeaponId): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    if (weaponId === 'AN_94' && this.an94ShotBuffer) {
      this.playOverlappingShotBuffer(this.an94ShotBuffer, 0.86);
      return;
    }
    if (weaponId === 'HAMR' && this.hamrShotBuffer) {
      this.playOverlappingShotBuffer(this.hamrShotBuffer, 0.92);
      return;
    }

    const t = this.ctx.currentTime;

    if (weaponId === 'AN_94') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1650 + Math.random() * 250, t);
      bp.Q.value = 0.85;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.56, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      noise.connect(bp).connect(ng).connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.12);

      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.085);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.42, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(og).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.095);
    } else if (weaponId === 'HAMR') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(340, t + 0.18);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.75, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      noise.connect(lp).connect(ng).connect(this.masterGain);
      noise.start(t);
      noise.stop(t + 0.2);

      const bass = this.ctx.createOscillator();
      bass.type = 'sawtooth';
      bass.frequency.setValueAtTime(140, t);
      bass.frequency.exponentialRampToValueAtTime(32, t + 0.14);
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.55, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      bass.connect(bg).connect(this.masterGain);
      bass.start(t);
      bass.stop(t + 0.16);
    } else if (weaponId === 'RAY_GUN') {
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(1240, t);
      osc1.frequency.exponentialRampToValueAtTime(185, t + 0.24);
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(1600, t);
      filt.frequency.exponentialRampToValueAtTime(320, t + 0.24);
      filt.Q.value = 3.2;
      const g1 = this.ctx.createGain();
      g1.gain.setValueAtTime(0.45, t);
      g1.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc1.connect(filt).connect(g1).connect(this.masterGain);
      osc1.start(t);
      osc1.stop(t + 0.27);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, t);
      osc2.frequency.exponentialRampToValueAtTime(110, t + 0.22);
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.38, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.23);
      osc2.connect(g2).connect(this.masterGain);
      osc2.start(t);
      osc2.stop(t + 0.24);
    }
  }

  public playPlasmaExplosion(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + 0.36);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.62, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    sub.connect(sg).connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.4);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(760, t);
    bp.frequency.exponentialRampToValueAtTime(180, t + 0.32);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.48, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    noise.connect(bp).connect(ng).connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.35);
  }

  public playDryFire(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.025);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.035);
  }

  public playReloadStart(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.06);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  public playReloadComplete(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    for (const [offset, freq] of [
      [0, 480],
      [0.075, 860],
    ]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + offset);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.45, t + offset + 0.045);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.22, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.055);
      osc.connect(g).connect(this.masterGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.06);
    }
  }

  public playFleshHit(gibbed = false): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(gibbed ? 920 : 540, t);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(gibbed ? 0.42 : 0.22, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (gibbed ? 0.16 : 0.07));
    noise.connect(lp).connect(ng).connect(this.masterGain);
    noise.start(t);
    noise.stop(t + (gibbed ? 0.17 : 0.08));
  }

  public playZombieGroan(highPitch = false): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const base = highPitch ? 250 + Math.random() * 90 : 88 + Math.random() * 35;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * (highPitch ? 1.25 : 0.72), t + 0.34);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = highPitch ? 680 : 280;
    filter.Q.value = 3.0;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(highPitch ? 0.13 : 0.11, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(filter).connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  public playPlayerHurt(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  public playCratePurchase(isWonderWeapon = false): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const notes = isWonderWeapon ? [330, 440, 659, 880] : [260, 390, 520];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = isWonderWeapon ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(f, t + idx * 0.07);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.16, t + idx * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.07 + 0.22);
      osc.connect(g).connect(this.masterGain);
      osc.start(t + idx * 0.07);
      osc.stop(t + idx * 0.07 + 0.24);
    });
  }

  public stopActiveRoundAudio(): void {
    this.roundPlayNonce += 1;
    if (this.activeRoundSource && this.activeRoundGain && this.ctx) {
      const t = this.ctx.currentTime;
      const src = this.activeRoundSource;
      const g = this.activeRoundGain;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0.0001, t, 0.04);
        src.stop(t + 0.16);
      } catch {
        // already stopped
      }
    }
    this.activeRoundSource = null;
    this.activeRoundGain = null;
  }

  private playRoundBuffer(buffer: AudioBuffer, volume = 0.92): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.activeRoundSource && this.activeRoundGain) {
      const t = this.ctx.currentTime;
      try {
        this.activeRoundGain.gain.cancelScheduledValues(t);
        this.activeRoundGain.gain.setTargetAtTime(0.0001, t, 0.04);
        this.activeRoundSource.stop(t + 0.16);
      } catch {
        // already stopped
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.masterGain);

    this.activeRoundSource = source;
    this.activeRoundGain = gain;
    source.onended = () => {
      if (this.activeRoundSource === source) {
        this.activeRoundSource = null;
        this.activeRoundGain = null;
      }
    };
    source.start(0);
  }

  /** Plays the full uncut BO2 Zombies Round-End sting (0.00s–8.15s) */
  public playRoundEnd(): void {
    if (!this.ctx || !this.masterGain) return;
    const nonce = ++this.roundPlayNonce;
    if (this.roundEndBuffer) {
      this.playRoundBuffer(this.roundEndBuffer, 0.92);
      return;
    }
    if (this.decodePromise) {
      this.decodePromise.then(() => {
        if (this.roundPlayNonce !== nonce) return;
        if (this.roundEndBuffer) this.playRoundBuffer(this.roundEndBuffer, 0.92);
        else this.playWaveBell();
      });
    } else {
      this.playWaveBell();
    }
  }

  /** Plays the full uncut BO2 Zombies Round-Start choir + thunder slam (9.50s–20.62s) */
  public playRoundStart(): void {
    if (!this.ctx || !this.masterGain) return;
    const nonce = ++this.roundPlayNonce;
    if (this.roundStartBuffer) {
      this.playRoundBuffer(this.roundStartBuffer, 0.94);
      return;
    }
    if (this.decodePromise) {
      this.decodePromise.then(() => {
        if (this.roundPlayNonce !== nonce) return;
        if (this.roundStartBuffer) this.playRoundBuffer(this.roundStartBuffer, 0.94);
        else this.playWaveBell();
      });
    } else {
      this.playWaveBell();
    }
  }

  public playWaveBell(): void {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const partials = [
      [146.8, 0.28, 2.2],
      [293.6, 0.16, 1.8],
      [349.2, 0.12, 1.6],
      [518.0, 0.07, 1.1],
    ];
    for (const [freq, amp, dur] of partials) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}

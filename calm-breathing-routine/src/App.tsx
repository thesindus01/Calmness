import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Moon,
  Music4,
  Pause,
  Play,
  RotateCcw,
  TimerReset,
  Volume2,
  VolumeX,
  Waves,
  Wind,
} from 'lucide-react';

type Step = {
  key: string;
  label: string;
  duration: number;
  text: string;
  bullets?: string[];
};

type SoundMode = 'bowls' | 'stream' | 'ocean' | 'rain' | 'forest';

const DEFAULT_SETTINGS = {
  settleSeconds: 20,
  inhaleSeconds: 4,
  exhaleSeconds: 6,
  breathCycles: 6,
  observeSeconds: 30,
  wordSeconds: 30,
  groundSeconds: 10,
  repetitions: 1,
  soundMode: 'bowls' as SoundMode,
  anchorWord: 'calm',
};

const soundOptions: { value: SoundMode; label: string; description: string }[] = [
  { value: 'bowls', label: 'Tibetan bowls', description: 'Soft resonant bowl tones' },
  { value: 'stream', label: 'Flowing stream', description: 'Gentle moving water' },
  { value: 'ocean', label: 'Slow ocean waves', description: 'Wide slow wave wash' },
  { value: 'rain', label: 'Gentle rain', description: 'Light steady rainfall' },
  { value: 'forest', label: 'Quiet forest', description: 'Soft air with occasional birds' },
];

function formatSeconds(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function createNoiseBuffer(ctx: AudioContext, duration = 2, tint: 'white' | 'pink' | 'brown' = 'white') {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
  const output = buffer.getChannelData(0);

  let lastOut = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let i = 0; i < output.length; i++) {
    const white = Math.random() * 2 - 1;

    if (tint === 'white') {
      output[i] = white;
    } else if (tint === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      output[i] = pink * 0.11;
    } else {
      lastOut = (lastOut + 0.02 * white) / 1.02;
      output[i] = lastOut * 3.5;
    }
  }

  return buffer;
}

function useAmbientSound(enabled: boolean, running: boolean, mode: SoundMode, volume = 0.06) {
  const ctxRef = useRef<AudioContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const noiseCacheRef = useRef<Record<string, AudioBuffer>>({});

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!enabled || !running) return;

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!ctxRef.current) ctxRef.current = new AudioCtx();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);

    const getNoise = (key: string, tint: 'white' | 'pink' | 'brown') => {
      if (!noiseCacheRef.current[key]) {
        noiseCacheRef.current[key] = createNoiseBuffer(ctx, 2, tint);
      }
      return noiseCacheRef.current[key];
    };

    const startLoopedNoise = ({
      tint,
      filterType,
      frequency,
      q = 0,
      gainValue,
      lfoDepth = 0,
      lfoRate = 0.1,
    }: {
      tint: 'white' | 'pink' | 'brown';
      filterType: BiquadFilterType;
      frequency: number;
      q?: number;
      gainValue: number;
      lfoDepth?: number;
      lfoRate?: number;
    }) => {
      const source = ctx.createBufferSource();
      source.buffer = getNoise(`${tint}-${filterType}`, tint);
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = q;

      const gain = ctx.createGain();
      gain.gain.value = gainValue;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      let lfo: OscillatorNode | null = null;
      let lfoGain: GainNode | null = null;

      if (lfoDepth > 0) {
        lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = lfoRate;
        lfoGain = ctx.createGain();
        lfoGain.gain.value = lfoDepth;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start();
      }

      return () => {
        source.stop();
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        if (lfo) {
          lfo.stop();
          lfo.disconnect();
        }
        if (lfoGain) lfoGain.disconnect();
      };
    };

    const startBowls = () => {
      const intervals: number[] = [];
      const strike = () => {
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(volume, now + 0.02);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);
        master.connect(ctx.destination);

        const freqs = [196, 293.66, 392, 587.33];
        freqs.forEach((f, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = index % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.06 / (index + 1), now + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.8 + index * 0.25);
          osc.connect(gain);
          gain.connect(master);
          osc.start(now);
          osc.stop(now + 5.2 + index * 0.25);
        });
      };

      strike();
      intervals.push(window.setInterval(strike, 10000));
      return () => intervals.forEach((id) => window.clearInterval(id));
    };

    const startStream = () => {
      const stop1 = startLoopedNoise({ tint: 'brown', filterType: 'highpass', frequency: 350, gainValue: volume * 0.9, lfoDepth: volume * 0.12, lfoRate: 0.22 });
      const stop2 = startLoopedNoise({ tint: 'white', filterType: 'bandpass', frequency: 1400, q: 0.8, gainValue: volume * 0.25, lfoDepth: volume * 0.08, lfoRate: 0.31 });
      return () => {
        stop1();
        stop2();
      };
    };

    const startOcean = () => {
      const stop1 = startLoopedNoise({ tint: 'brown', filterType: 'lowpass', frequency: 700, gainValue: volume * 0.8, lfoDepth: volume * 0.25, lfoRate: 0.06 });
      const stop2 = startLoopedNoise({ tint: 'pink', filterType: 'bandpass', frequency: 500, q: 0.6, gainValue: volume * 0.22, lfoDepth: volume * 0.08, lfoRate: 0.09 });
      return () => {
        stop1();
        stop2();
      };
    };

    const startRain = () => {
      const stop1 = startLoopedNoise({ tint: 'pink', filterType: 'highpass', frequency: 900, gainValue: volume * 0.55, lfoDepth: volume * 0.06, lfoRate: 0.28 });
      const stop2 = startLoopedNoise({ tint: 'white', filterType: 'bandpass', frequency: 2600, q: 1.2, gainValue: volume * 0.1, lfoDepth: volume * 0.04, lfoRate: 0.37 });
      return () => {
        stop1();
        stop2();
      };
    };

    const startForest = () => {
      const stopBed = startLoopedNoise({ tint: 'brown', filterType: 'lowpass', frequency: 900, gainValue: volume * 0.42, lfoDepth: volume * 0.04, lfoRate: 0.12 });
      const birds: number[] = [];
      const chirp = () => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900 + Math.random() * 700, now);
        osc.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 1200, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume * 0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      };
      birds.push(window.setInterval(chirp, 7000));
      return () => {
        stopBed();
        birds.forEach((id) => window.clearInterval(id));
      };
    };

    const cleanup = {
      bowls: startBowls,
      stream: startStream,
      ocean: startOcean,
      rain: startRain,
      forest: startForest,
    }[mode]();

    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      cleanupRef.current = null;
    };
  }, [enabled, running, mode, volume]);
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  colorClass,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  colorClass: string;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="control-group">
      <div className="row-between">
        <label className="control-label">{label}</label>
        <span className={`pill ${colorClass}`}>{value}{suffix}</span>
      </div>
      <input
        className={`slider ${colorClass}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  );
}

export default function App() {
  const [settleSeconds, setSettleSeconds] = useState(DEFAULT_SETTINGS.settleSeconds);
  const [inhaleSeconds, setInhaleSeconds] = useState(DEFAULT_SETTINGS.inhaleSeconds);
  const [exhaleSeconds, setExhaleSeconds] = useState(DEFAULT_SETTINGS.exhaleSeconds);
  const [breathCycles, setBreathCycles] = useState(DEFAULT_SETTINGS.breathCycles);
  const [observeSeconds, setObserveSeconds] = useState(DEFAULT_SETTINGS.observeSeconds);
  const [wordSeconds, setWordSeconds] = useState(DEFAULT_SETTINGS.wordSeconds);
  const [groundSeconds, setGroundSeconds] = useState(DEFAULT_SETTINGS.groundSeconds);
  const [repetitions, setRepetitions] = useState(DEFAULT_SETTINGS.repetitions);
  const [currentRep, setCurrentRep] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [soundMode, setSoundMode] = useState<SoundMode>(DEFAULT_SETTINGS.soundMode);
  const [anchorWord, setAnchorWord] = useState(DEFAULT_SETTINGS.anchorWord);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepSecondsLeft, setStepSecondsLeft] = useState(0);

  useAmbientSound(isSoundOn, isRunning, soundMode);

  const selectedSound = soundOptions.find((option) => option.value === soundMode) ?? soundOptions[0];

  const routineSteps = useMemo<Step[]>(() => {
    const steps: Step[] = [
      {
        key: 'settle',
        label: 'Settle',
        duration: settleSeconds,
        text: 'Settle into your body.',
        bullets: ['Drop your shoulders', 'Unclench your jaw', 'Put both feet flat'],
      },
    ];

    for (let i = 0; i < breathCycles; i++) {
      steps.push({
        key: `inhale-${i + 1}`,
        label: `Inhale ${i + 1}/${breathCycles}`,
        duration: inhaleSeconds,
        text: 'Breathe in softly through your nose.',
        bullets: [`Inhale for ${inhaleSeconds} seconds`, 'Let your chest stay easy', 'Keep your face soft'],
      });
      steps.push({
        key: `exhale-${i + 1}`,
        label: `Exhale ${i + 1}/${breathCycles}`,
        duration: exhaleSeconds,
        text: 'Breathe out slowly and release tension.',
        bullets: [`Exhale for ${exhaleSeconds} seconds`, 'Relax your shoulders more', 'Let the body get heavier'],
      });
    }

    steps.push(
      {
        key: 'observe',
        label: 'Observe',
        duration: observeSeconds,
        text: 'Close your eyes if that feels comfortable, and gently watch your breath.',
        bullets: ['Notice the air moving in', 'Notice the air moving out', 'Let the breath stay natural'],
      },
      {
        key: 'word',
        label: 'Anchor Word',
        duration: wordSeconds,
        text: 'Use your anchor word gently.',
        bullets: [`Repeat "${anchorWord}" on each exhale`, 'Keep the word soft', 'Let the breath lead'],
      },
      {
        key: 'ground',
        label: 'Ground',
        duration: groundSeconds,
        text: 'Return to the present moment.',
        bullets: ['Notice one thing you see', 'Notice one thing you hear', 'Notice one thing you feel'],
      }
    );

    return steps;
  }, [settleSeconds, inhaleSeconds, exhaleSeconds, breathCycles, observeSeconds, wordSeconds, groundSeconds, anchorWord]);

  const totalRoutineSeconds = useMemo(() => routineSteps.reduce((sum, step) => sum + step.duration, 0), [routineSteps]);
  const totalSessionSeconds = totalRoutineSeconds * repetitions;
  const completedRoutineSeconds = useMemo(() => routineSteps.slice(0, stepIndex).reduce((sum, step) => sum + step.duration, 0), [routineSteps, stepIndex]);

  const elapsedThisRoutine = useMemo(() => {
    const currentDuration = routineSteps[stepIndex]?.duration ?? 0;
    return completedRoutineSeconds + Math.max(currentDuration - stepSecondsLeft, 0);
  }, [completedRoutineSeconds, routineSteps, stepIndex, stepSecondsLeft]);

  const sessionCompleted = (currentRep - 1) * totalRoutineSeconds + elapsedThisRoutine;
  const routineProgress = totalRoutineSeconds === 0 ? 0 : (elapsedThisRoutine / totalRoutineSeconds) * 100;
  const sessionProgress = totalSessionSeconds === 0 ? 0 : (sessionCompleted / totalSessionSeconds) * 100;
  const activeStep = routineSteps[stepIndex] ?? routineSteps[0];

  const resetSession = () => {
    setIsRunning(false);
    setCurrentRep(1);
    setStepIndex(0);
    setStepSecondsLeft(routineSteps[0]?.duration ?? 0);
  };

  useEffect(() => {
    if (!isRunning) {
      setCurrentRep(1);
      setStepIndex(0);
      setStepSecondsLeft(routineSteps[0]?.duration ?? 0);
    }
  }, [routineSteps, isRunning]);

  useEffect(() => {
    if (!isRunning) return;

    const id = window.setInterval(() => {
      setStepSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        const nextIndex = stepIndex + 1;

        if (nextIndex < routineSteps.length) {
          setStepIndex(nextIndex);
          return routineSteps[nextIndex].duration;
        }

        if (currentRep < repetitions) {
          setCurrentRep((r) => r + 1);
          setStepIndex(0);
          return routineSteps[0]?.duration ?? 0;
        }

        setIsRunning(false);
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [isRunning, stepIndex, routineSteps, currentRep, repetitions]);

  const restoreDefaults = () => {
    setIsRunning(false);
    setSettleSeconds(DEFAULT_SETTINGS.settleSeconds);
    setInhaleSeconds(DEFAULT_SETTINGS.inhaleSeconds);
    setExhaleSeconds(DEFAULT_SETTINGS.exhaleSeconds);
    setBreathCycles(DEFAULT_SETTINGS.breathCycles);
    setObserveSeconds(DEFAULT_SETTINGS.observeSeconds);
    setWordSeconds(DEFAULT_SETTINGS.wordSeconds);
    setGroundSeconds(DEFAULT_SETTINGS.groundSeconds);
    setRepetitions(DEFAULT_SETTINGS.repetitions);
    setSoundMode(DEFAULT_SETTINGS.soundMode);
    setAnchorWord(DEFAULT_SETTINGS.anchorWord);
    setCurrentRep(1);
    setStepIndex(0);
    setStepSecondsLeft(DEFAULT_SETTINGS.settleSeconds);
  };

  const quickPreset = (config: { settle: number; inhale: number; exhale: number; cycles: number; observe: number; word: number; ground: number; reps: number; }) => {
    setIsRunning(false);
    setSettleSeconds(config.settle);
    setInhaleSeconds(config.inhale);
    setExhaleSeconds(config.exhale);
    setBreathCycles(config.cycles);
    setObserveSeconds(config.observe);
    setWordSeconds(config.word);
    setGroundSeconds(config.ground);
    setRepetitions(config.reps);
  };

  const start = () => {
    if (stepSecondsLeft === 0) {
      setStepIndex(0);
      setCurrentRep(1);
      setStepSecondsLeft(routineSteps[0]?.duration ?? 0);
    }
    setIsRunning(true);
  };

  const pause = () => setIsRunning(false);

  return (
    <div className="page">
      <div className="app-grid">
        <section className="panel main-panel">
          <header className="panel-header">
            <div>
              <h1 className="title"><Moon size={36} /> Calm Breathing Routine</h1>
              <p className="subtext">Every event has its own timer now. Inhale means inhale. Exhale means exhale. Much calmer, less cave mode.</p>
            </div>
            <span className="pill teal">Rep {currentRep} of {repetitions}</span>
          </header>

          <div className="event-card">
            <div className="event-top">
              <div>
                <div className="eyebrow">Current Event</div>
                <div className="event-title">{activeStep.label}</div>
                <div className="guidance-box">
                  <p className="guidance-title">{activeStep.text}</p>
                  <div className="guidance-list">
                    {(activeStep.bullets ?? []).map((bullet, idx) => (
                      <div key={`${activeStep.key}-${idx}`} className="guidance-item" style={{ animationDelay: `${idx * 0.6}s` }}>
                        <span className="guidance-dot" />
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="time-box">
                <div className="label-small">Event time left</div>
                <div className="countdown">{formatSeconds(stepSecondsLeft)}</div>
                <div className="label-small">Total routine: {formatSeconds(totalRoutineSeconds)}</div>
                <div className="sound-badge-box">
                  <div className="eyebrow small">Ambient Sound</div>
                  <strong>{selectedSound.label}</strong>
                  <div className="small-text">{selectedSound.description}</div>
                </div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-box"><span>Inhale</span><strong>{inhaleSeconds}s</strong></div>
              <div className="stat-box"><span>Exhale</span><strong>{exhaleSeconds}s</strong></div>
              <div className="stat-box"><span>Breath cycles</span><strong>{breathCycles}</strong></div>
            </div>

            <div className="progress-group">
              <div className="row-between"><span>Routine progress</span><span>{Math.round(routineProgress)}%</span></div>
              <progress max={100} value={routineProgress} />
            </div>
            <div className="progress-group">
              <div className="row-between"><span>Total session progress</span><span>{Math.round(sessionProgress)}%</span></div>
              <progress max={100} value={sessionProgress} />
            </div>

            <div className="button-row">
              <button className="btn primary" onClick={isRunning ? pause : start}>{isRunning ? <Pause size={16} /> : <Play size={16} />}{isRunning ? 'Pause' : 'Start'}</button>
              <button className="btn secondary" onClick={resetSession}><RotateCcw size={16} />Reset</button>
              <button className="btn secondary" onClick={() => setIsSoundOn((v) => !v)}>{isSoundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}{isSoundOn ? 'Sound On' : 'Sound Off'}</button>
            </div>
          </div>

          <section className="panel nested-panel">
            <h3 className="nested-title"><Wind size={18} /> Routine steps</h3>
            <div className="steps-grid">
              {routineSteps.map((step, index) => (
                <div key={step.key} className={`step-card ${index === stepIndex ? 'active' : ''}`}>
                  <div className="row-between"><strong>{step.label}</strong><span className="pill teal">{step.duration}s</span></div>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
          </section>
        </section>

        <div className="side-column">
          <section className="panel">
            <h3 className="section-title"><TimerReset size={18} /> Event timings</h3>
            <p className="subtext">Tune each part of the routine instead of using one big timer blob.</p>

            <div className="restore-box">
              <div>
                <div className="restore-title">Changed a few settings?</div>
                <div className="small-text">You can jump back to the original routine anytime.</div>
              </div>
              <button className="btn primary small" onClick={restoreDefaults}>Restore defaults</button>
            </div>

            <SliderControl label="Settle time" value={settleSeconds} min={5} max={60} step={5} colorClass="teal" suffix="s" onChange={setSettleSeconds} />
            <SliderControl label="Inhale time" value={inhaleSeconds} min={2} max={10} step={1} colorClass="cyan" suffix="s" onChange={setInhaleSeconds} />
            <SliderControl label="Exhale time" value={exhaleSeconds} min={2} max={12} step={1} colorClass="emerald" suffix="s" onChange={setExhaleSeconds} />
            <SliderControl label="Breath cycles" value={breathCycles} min={1} max={15} step={1} colorClass="teal" onChange={setBreathCycles} />
            <SliderControl label="Observe time" value={observeSeconds} min={5} max={90} step={5} colorClass="lime" suffix="s" onChange={setObserveSeconds} />
            <SliderControl label="Anchor word time" value={wordSeconds} min={5} max={90} step={5} colorClass="teal" suffix="s" onChange={setWordSeconds} />
            <SliderControl label="Ground time" value={groundSeconds} min={5} max={60} step={5} colorClass="emerald" suffix="s" onChange={setGroundSeconds} />
            <SliderControl label="Repetitions" value={repetitions} min={1} max={10} step={1} colorClass="teal" suffix="x" onChange={setRepetitions} />

            <div className="control-group">
              <label className="control-label">Anchor word</label>
              <div className="anchor-grid">
                {['calm', 'peace', 'relax'].map((word) => (
                  <button key={word} className={`btn ${anchorWord === word ? 'primary' : 'secondary'} grow`} onClick={() => setAnchorWord(word)}>{word}</button>
                ))}
              </div>
            </div>

            <div className="sound-library">
              <div>
                <div className="restore-title"><Music4 size={16} /> Ambient sound library</div>
                <div className="small-text">Choose the background sound that feels best for this session.</div>
              </div>

              <div className="control-group">
                <label className="control-label">Sound type</label>
                <select className="select" value={soundMode} onChange={(e) => setSoundMode(e.target.value as SoundMode)}>
                  {soundOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <div className="small-text">{selectedSound.description}</div>
              </div>

              <div className="switch-row">
                <div>
                  <div className="restore-title"><Waves size={16} /> Sound playback</div>
                  <div className="small-text">Background ambience starts when the routine is running.</div>
                </div>
                <button className={`toggle ${isSoundOn ? 'on' : 'off'}`} onClick={() => setIsSoundOn((v) => !v)} aria-label="Toggle sound">
                  <span />
                </button>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3 className="section-title">Quick presets</h3>
            <div className="preset-list">
              <button className="btn secondary full" onClick={() => quickPreset({ settle: 20, inhale: 4, exhale: 6, cycles: 6, observe: 30, word: 30, ground: 10, reps: 1 })}>Default · 4 in / 6 out</button>
              <button className="btn secondary full" onClick={() => quickPreset({ settle: 20, inhale: 4, exhale: 8, cycles: 8, observe: 45, word: 45, ground: 15, reps: 1 })}>Deep calm · 4 in / 8 out</button>
              <button className="btn secondary full" onClick={() => quickPreset({ settle: 15, inhale: 3, exhale: 5, cycles: 5, observe: 20, word: 20, ground: 10, reps: 2 })}>Quick reset · shorter rounds</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

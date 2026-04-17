import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Moon,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  TimerReset,
  Waves,
  Wind,
  Music4,
  Download,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ListChecks,
} from "lucide-react";

type Step = {
  key: string;
  label: string;
  duration: number;
  text: string;
  bullets?: string[];
};

type SoundMode = "bowls" | "stream" | "ocean" | "rain" | "forest";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function formatSeconds(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createNoiseBuffer(
  ctx: AudioContext,
  duration = 2,
  tint: "white" | "pink" | "brown" = "white"
) {
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

    if (tint === "white") {
      output[i] = white;
    } else if (tint === "pink") {
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

function useAmbientSound(
  enabled: boolean,
  running: boolean,
  mode: SoundMode,
  volume = 0.06
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const noiseCacheRef = useRef<Record<string, AudioBuffer>>({});

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!enabled || !running) return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!ctxRef.current) ctxRef.current = new AudioCtx();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const getNoise = (key: string, tint: "white" | "pink" | "brown") => {
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
      tint: "white" | "pink" | "brown";
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
        lfo.type = "sine";
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
          osc.type = index % 2 === 0 ? "sine" : "triangle";
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
      const stop1 = startLoopedNoise({
        tint: "brown",
        filterType: "highpass",
        frequency: 350,
        gainValue: volume * 0.9,
        lfoDepth: volume * 0.12,
        lfoRate: 0.22,
      });
      const stop2 = startLoopedNoise({
        tint: "white",
        filterType: "bandpass",
        frequency: 1400,
        q: 0.8,
        gainValue: volume * 0.25,
        lfoDepth: volume * 0.08,
        lfoRate: 0.31,
      });
      return () => {
        stop1();
        stop2();
      };
    };

    const startOcean = () => {
      const stop1 = startLoopedNoise({
        tint: "brown",
        filterType: "lowpass",
        frequency: 700,
        gainValue: volume * 0.8,
        lfoDepth: volume * 0.25,
        lfoRate: 0.06,
      });
      const stop2 = startLoopedNoise({
        tint: "pink",
        filterType: "bandpass",
        frequency: 500,
        q: 0.6,
        gainValue: volume * 0.22,
        lfoDepth: volume * 0.08,
        lfoRate: 0.09,
      });
      return () => {
        stop1();
        stop2();
      };
    };

    const startRain = () => {
      const stop1 = startLoopedNoise({
        tint: "pink",
        filterType: "highpass",
        frequency: 900,
        gainValue: volume * 0.55,
        lfoDepth: volume * 0.06,
        lfoRate: 0.28,
      });
      const stop2 = startLoopedNoise({
        tint: "white",
        filterType: "bandpass",
        frequency: 2600,
        q: 1.2,
        gainValue: volume * 0.1,
        lfoDepth: volume * 0.04,
        lfoRate: 0.37,
      });
      return () => {
        stop1();
        stop2();
      };
    };

    const startForest = () => {
      const stopBed = startLoopedNoise({
        tint: "brown",
        filterType: "lowpass",
        frequency: 900,
        gainValue: volume * 0.42,
        lfoDepth: volume * 0.04,
        lfoRate: 0.12,
      });
      const birds: number[] = [];
      const chirp = () => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(900 + Math.random() * 700, now);
        osc.frequency.exponentialRampToValueAtTime(
          1500 + Math.random() * 1200,
          now + 0.08
        );
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

const DEFAULT_SETTINGS = {
  settleSeconds: 20,
  inhaleSeconds: 4,
  exhaleSeconds: 6,
  breathCycles: 6,
  observeSeconds: 30,
  wordSeconds: 30,
  groundSeconds: 10,
  repetitions: 1,
  soundMode: "bowls" as SoundMode,
  anchorWord: "calm",
};

const soundOptions: { value: SoundMode; label: string; description: string }[] = [
  { value: "bowls", label: "Tibetan bowls", description: "Soft resonant bowl tones" },
  { value: "stream", label: "Flowing stream", description: "Gentle moving water" },
  { value: "ocean", label: "Slow ocean waves", description: "Wide slow wave wash" },
  { value: "rain", label: "Gentle rain", description: "Light steady rainfall" },
  { value: "forest", label: "Quiet forest", description: "Soft air with occasional birds" },
];

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #dcfce7 100%)",
    color: "#334155",
    padding: "12px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  } as React.CSSProperties,
  shell: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "grid",
    gap: "16px",
  } as React.CSSProperties,
  card: {
    background: "rgba(236, 253, 245, 0.9)",
    border: "1px solid #bbf7d0",
    borderRadius: "32px",
    boxShadow: "0 12px 30px rgba(15, 118, 110, 0.08)",
    overflow: "hidden",
  } as React.CSSProperties,
  section: {
    background: "rgba(236, 253, 245, 0.95)",
    border: "1px solid #bbf7d0",
    borderRadius: "28px",
    padding: "16px",
  } as React.CSSProperties,
  softBox: {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid #bbf7d0",
    borderRadius: "20px",
    padding: "14px",
  } as React.CSSProperties,
  buttonPrimary: {
    width: "100%",
    height: "56px",
    borderRadius: "18px",
    border: "none",
    background: "#14b8a6",
    color: "white",
    fontSize: "20px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  buttonSecondary: {
    width: "100%",
    height: "48px",
    borderRadius: "18px",
    border: "1px solid #a7f3d0",
    background: "rgba(236,253,245,0.95)",
    color: "#065f46",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
};

export default function App() {
  const softFontClass = {
    fontFamily: 'Georgia, "Times New Roman", serif',
    letterSpacing: "0.01em",
  } as React.CSSProperties;

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
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installStatus, setInstallStatus] = useState<"idle" | "installed">("idle");
  const [showSettings, setShowSettings] = useState(false);
  const [showSounds, setShowSounds] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useAmbientSound(isSoundOn, isRunning, soundMode);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };

    const handleInstalled = () => {
      setInstallStatus("installed");
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const selectedSound =
    soundOptions.find((option) => option.value === soundMode) ?? soundOptions[0];

  const routineSteps = useMemo<Step[]>(() => {
    const steps: Step[] = [
      {
        key: "settle",
        label: "Settle",
        duration: settleSeconds,
        text: "Settle into your body.",
        bullets: ["Drop your shoulders", "Unclench your jaw", "Put both feet flat"],
      },
    ];

    for (let i = 0; i < breathCycles; i++) {
      steps.push({
        key: `inhale-${i + 1}`,
        label: `Inhale ${i + 1}/${breathCycles}`,
        duration: inhaleSeconds,
        text: "Breathe in softly through your nose.",
        bullets: [
          `Inhale for ${inhaleSeconds} seconds`,
          "Let your chest stay easy",
          "Keep your face soft",
        ],
      });
      steps.push({
        key: `exhale-${i + 1}`,
        label: `Exhale ${i + 1}/${breathCycles}`,
        duration: exhaleSeconds,
        text: "Breathe out slowly and release tension.",
        bullets: [
          `Exhale for ${exhaleSeconds} seconds`,
          "Relax your shoulders more",
          "Let the body get heavier",
        ],
      });
    }

    steps.push(
      {
        key: "observe",
        label: "Observe",
        duration: observeSeconds,
        text: "Close your eyes if that feels comfortable, and gently watch your breath.",
        bullets: [
          "Notice the air moving in",
          "Notice the air moving out",
          "Let the breath stay natural",
        ],
      },
      {
        key: "word",
        label: "Anchor Word",
        duration: wordSeconds,
        text: "Use your anchor word gently.",
        bullets: [
          `Repeat "${anchorWord}" on each exhale`,
          "Keep the word soft",
          "Let the breath lead",
        ],
      },
      {
        key: "ground",
        label: "Ground",
        duration: groundSeconds,
        text: "Return to the present moment.",
        bullets: [
          "Notice one thing you see",
          "Notice one thing you hear",
          "Notice one thing you feel",
        ],
      }
    );

    return steps;
  }, [
    settleSeconds,
    inhaleSeconds,
    exhaleSeconds,
    breathCycles,
    observeSeconds,
    wordSeconds,
    groundSeconds,
    anchorWord,
  ]);

  const totalRoutineSeconds = useMemo(
    () => routineSteps.reduce((sum, step) => sum + step.duration, 0),
    [routineSteps]
  );

  const totalSessionSeconds = totalRoutineSeconds * repetitions;
  const completedRoutineSeconds = useMemo(
    () => routineSteps.slice(0, stepIndex).reduce((sum, step) => sum + step.duration, 0),
    [routineSteps, stepIndex]
  );

  const elapsedThisRoutine = useMemo(() => {
    const currentDuration = routineSteps[stepIndex]?.duration ?? 0;
    return completedRoutineSeconds + Math.max(currentDuration - stepSecondsLeft, 0);
  }, [completedRoutineSeconds, routineSteps, stepIndex, stepSecondsLeft]);

  const sessionCompleted = (currentRep - 1) * totalRoutineSeconds + elapsedThisRoutine;
  const routineProgress =
    totalRoutineSeconds === 0 ? 0 : (elapsedThisRoutine / totalRoutineSeconds) * 100;
  const sessionProgress =
    totalSessionSeconds === 0 ? 0 : (sessionCompleted / totalSessionSeconds) * 100;

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

  const start = () => {
    if (stepSecondsLeft === 0) {
      setStepIndex(0);
      setCurrentRep(1);
      setStepSecondsLeft(routineSteps[0]?.duration ?? 0);
    }
    setIsRunning(true);
  };

  const pause = () => setIsRunning(false);

  const quickPreset = (config: {
    settle: number;
    inhale: number;
    exhale: number;
    cycles: number;
    observe: number;
    word: number;
    ground: number;
    reps: number;
  }) => {
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

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      setShowInstallHelp(true);
      return;
    }

    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setInstallStatus("installed");
    }
    setDeferredPrompt(null);
  };

  const inputRangeStyle: React.CSSProperties = {
    width: "100%",
    accentColor: "#14b8a6",
  };

  const SectionButton = ({
    open,
    onClick,
    icon,
    label,
  }: {
    open: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.buttonSecondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        {label}
      </span>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
  );

  return (
    <>
      <style>{`
        @keyframes calmPulse {
          0%, 100% { opacity: 0.72; transform: scale(1); box-shadow: 0 0 0 rgba(45,212,191,0); }
          50% { opacity: 1; transform: scale(1.015); box-shadow: 0 0 18px rgba(45,212,191,0.14); }
        }
      `}</style>

      <div style={styles.page}>
        <div
          style={{
            ...styles.shell,
            gridTemplateColumns: isMobile ? "1fr" : "1.15fr 0.85fr",
          }}
        >
          <div style={styles.card}>
            <div style={{ padding: "20px 16px 8px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      color: "#0f766e",
                      fontWeight: 700,
                      fontSize: isMobile ? 40 : 32,
                      lineHeight: 0.95,
                    }}
                  >
                    <Moon size={isMobile ? 28 : 32} style={{ marginTop: 6, flexShrink: 0 }} />
                    <span>Calm Breathing Routine</span>
                  </div>
                  <p style={{ marginTop: 12, fontSize: 16, color: "#64748b", maxWidth: 560 }}>
                    A calm, guided breathing reset with simple steps and soothing sounds.
                  </p>
                </div>

                <div
                  style={{
                    background: "#ccfbf1",
                    color: "#115e59",
                    border: "1px solid #99f6e4",
                    borderRadius: 999,
                    padding: "10px 12px",
                    fontSize: 14,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  Rep {currentRep}/{repetitions}
                </div>
              </div>
            </div>

            <div style={{ padding: "0 16px 96px", display: "grid", gap: 16 }}>
              {isMobile && (
                <div style={{ ...styles.softBox, padding: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          color: "#0f766e",
                          fontWeight: 600,
                          fontSize: 14,
                        }}
                      >
                        <Download size={16} /> Install on iPhone
                      </div>
                      <p style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                        Use Safari, then Share → Add to Home Screen.
                      </p>
                      {showInstallHelp && (
                        <p style={{ marginTop: 8, fontSize: 12, color: "#0f766e" }}>
                          If install does nothing on iPhone, Safari Home Screen is the path.
                        </p>
                      )}
                      {installStatus === "installed" && (
                        <p style={{ marginTop: 8, fontSize: 12, color: "#047857" }}>
                          Installed or ready from Home Screen.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleInstallApp}
                      style={{
                        border: "none",
                        borderRadius: 16,
                        background: "#14b8a6",
                        color: "white",
                        padding: "10px 14px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Install
                    </button>
                  </div>
                </div>
              )}

              <div style={styles.section}>
                <div
                  style={{
                    display: "grid",
                    gap: 20,
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 220px",
                    alignItems: "start",
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: isMobile ? 12 : 14,
                        textTransform: "uppercase",
                        letterSpacing: "0.25em",
                        color: "#0f766e",
                        marginBottom: 8,
                      }}
                    >
                      Current Event
                    </p>

                    <h2
                      style={{
                        fontSize: isMobile ? 64 : 72,
                        lineHeight: 1,
                        margin: 0,
                        color: "#14b8a6",
                        fontWeight: 700,
                      }}
                    >
                      {activeStep?.label}
                    </h2>

                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 20,
                        border: "1px solid #99f6e4",
                        background: "rgba(204,251,241,0.45)",
                        padding: 16,
                      }}
                    >
                      <p
                        style={{
                          ...softFontClass,
                          fontSize: isMobile ? 28 : 32,
                          lineHeight: 1.2,
                          color: "#0f766e",
                          margin: 0,
                        }}
                      >
                        {activeStep?.text}
                      </p>

                      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                        {(activeStep?.bullets ?? []).map((bullet, idx) => (
                          <div
                            key={`${activeStep?.key}-${idx}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              borderRadius: 18,
                              background: "rgba(255,255,255,0.6)",
                              padding: "14px 16px",
                              animation: `calmPulse 3.6s ease-in-out ${idx * 0.6}s infinite`,
                            }}
                          >
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: "#2dd4bf",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                ...softFontClass,
                                fontSize: isMobile ? 18 : 20,
                                color: "#155e75",
                              }}
                            >
                              {bullet}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr",
                    }}
                  >
                    <div
                      style={{
                        ...styles.softBox,
                        gridColumn: isMobile ? "1 / -1" : undefined,
                        textAlign: isMobile ? "center" : "left",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>Event time left</p>
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: isMobile ? 84 : 72,
                          lineHeight: 1,
                          fontWeight: 800,
                          color: "#0891b2",
                        }}
                      >
                        {formatSeconds(stepSecondsLeft)}
                      </div>
                      <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, color: "#64748b" }}>
                        Total routine: {formatSeconds(totalRoutineSeconds)}
                      </p>
                    </div>

                    <div style={styles.softBox}>
                      <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#0f766e" }}>
                        Ambient
                      </p>
                      <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600, color: "#0f766e" }}>
                        {selectedSound.label}
                      </p>
                    </div>

                    <div style={styles.softBox}>
                      <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#0f766e" }}>
                        Rhythm
                      </p>
                      <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 600, color: "#0f766e" }}>
                        {inhaleSeconds}s in · {exhaleSeconds}s out
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                    marginTop: 16,
                  }}
                >
                  {[
                    { label: "Inhale", value: `${inhaleSeconds}s`, color: "#0f766e" },
                    { label: "Exhale", value: `${exhaleSeconds}s`, color: "#0284c7" },
                    { label: "Cycles", value: `${breathCycles}`, color: "#059669" },
                  ].map((item) => (
                    <div key={item.label} style={styles.softBox}>
                      <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{item.label}</p>
                      <p style={{ margin: "8px 0 0", fontSize: isMobile ? 40 : 32, fontWeight: 700, color: item.color }}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", marginBottom: 8 }}>
                      <span>Routine progress</span>
                      <span>{Math.round(routineProgress)}%</span>
                    </div>
                    <div style={{ height: 12, background: "#d1fae5", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${routineProgress}%`, height: "100%", background: "#14b8a6" }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", marginBottom: 8 }}>
                      <span>Total session progress</span>
                      <span>{Math.round(sessionProgress)}%</span>
                    </div>
                    <div style={{ height: 12, background: "#d1fae5", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${sessionProgress}%`, height: "100%", background: "#14b8a6" }} />
                    </div>
                  </div>
                </div>
              </div>

              {isMobile ? (
                <>
                  <div
                    style={{
                      position: "sticky",
                      bottom: 12,
                      zIndex: 20,
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {!isRunning ? (
                      <button onClick={start} style={styles.buttonPrimary}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Play size={20} /> Start
                        </span>
                      </button>
                    ) : (
                      <button onClick={pause} style={styles.buttonPrimary}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Pause size={20} /> Pause
                        </span>
                      </button>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <button onClick={resetSession} style={styles.buttonSecondary}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <RotateCcw size={18} /> Reset
                        </span>
                      </button>
                      <button
                        onClick={() => setIsSoundOn((v) => !v)}
                        style={styles.buttonSecondary}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          {isSoundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
                          {isSoundOn ? "Sound" : "Muted"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <SectionButton
                      open={showSettings}
                      onClick={() => setShowSettings((v) => !v)}
                      icon={<SlidersHorizontal size={16} />}
                      label="Adjust routine"
                    />
                    <SectionButton
                      open={showSounds}
                      onClick={() => setShowSounds((v) => !v)}
                      icon={<Music4 size={16} />}
                      label="Sounds"
                    />
                    <SectionButton
                      open={showSteps}
                      onClick={() => setShowSteps((v) => !v)}
                      icon={<ListChecks size={16} />}
                      label="Routine steps"
                    />
                  </div>

                  {showSteps && (
                    <div style={{ ...styles.section, padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                        <Wind size={18} color="#0f766e" />
                        <h3 style={{ margin: 0, color: "#0f766e" }}>Routine steps</h3>
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {routineSteps.map((step, index) => (
                          <div
                            key={step.key}
                            style={{
                              border: "1px solid " + (index === stepIndex ? "#5eead4" : "#bbf7d0"),
                              background: index === stepIndex ? "rgba(204,251,241,0.65)" : "rgba(236,253,245,0.8)",
                              borderRadius: 20,
                              padding: 14,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: "#0f766e" }}>{step.label}</p>
                              <span
                                style={{
                                  background: "#ccfbf1",
                                  color: "#115e59",
                                  borderRadius: 999,
                                  padding: "6px 10px",
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {step.duration}s
                              </span>
                            </div>
                            <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 14 }}>{step.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {!isRunning ? (
                      <button onClick={start} style={{ ...styles.buttonPrimary, height: 48, fontSize: 16 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Play size={16} /> Start
                        </span>
                      </button>
                    ) : (
                      <button onClick={pause} style={{ ...styles.buttonPrimary, height: 48, fontSize: 16 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Pause size={16} /> Pause
                        </span>
                      </button>
                    )}
                    <button onClick={resetSession} style={styles.buttonSecondary}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <RotateCcw size={16} /> Reset
                      </span>
                    </button>
                    <button
                      onClick={() => setIsSoundOn((v) => !v)}
                      style={styles.buttonSecondary}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {isSoundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        {isSoundOn ? "Sound On" : "Sound Off"}
                      </span>
                    </button>
                  </div>

                  <div style={{ ...styles.section, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <Wind size={20} color="#0f766e" />
                      <h3 style={{ margin: 0, color: "#0f766e" }}>Routine steps</h3>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: "1fr 1fr",
                      }}
                    >
                      {routineSteps.map((step, index) => (
                        <div
                          key={step.key}
                          style={{
                            border: "1px solid " + (index === stepIndex ? "#5eead4" : "#bbf7d0"),
                            background: index === stepIndex ? "rgba(204,251,241,0.65)" : "rgba(236,253,245,0.8)",
                            borderRadius: 20,
                            padding: 14,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <p style={{ margin: 0, fontWeight: 600, color: "#0f766e" }}>{step.label}</p>
                            <span
                              style={{
                                background: "#ccfbf1",
                                color: "#115e59",
                                borderRadius: 999,
                                padding: "6px 10px",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {step.duration}s
                            </span>
                          </div>
                          <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 14 }}>{step.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {(!isMobile || showSettings) && (
              <div style={styles.card}>
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#0f766e" }}>
                    <TimerReset size={20} />
                    <h3 style={{ margin: 0 }}>Event timings</h3>
                  </div>
                  <p style={{ marginTop: 8, color: "#64748b" }}>
                    Tune each part of the routine without crowding the main timer.
                  </p>

                  <div
                    style={{
                      ...styles.softBox,
                      marginTop: 16,
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      alignItems: isMobile ? "stretch" : "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, color: "#0f766e", fontSize: 14, fontWeight: 600 }}>
                        Changed a few settings?
                      </p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                        Jump back to the original routine anytime.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={restoreDefaults}
                      style={{
                        border: "none",
                        borderRadius: 16,
                        background: "#14b8a6",
                        color: "white",
                        padding: "12px 16px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Restore defaults
                    </button>
                  </div>

                  <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
                    {[
                      ["Settle time", settleSeconds, setSettleSeconds, 5, 60, 5, "#14b8a6"],
                      ["Inhale time", inhaleSeconds, setInhaleSeconds, 2, 10, 1, "#06b6d4"],
                      ["Exhale time", exhaleSeconds, setExhaleSeconds, 2, 12, 1, "#10b981"],
                      ["Breath cycles", breathCycles, setBreathCycles, 1, 15, 1, "#14b8a6"],
                      ["Observe time", observeSeconds, setObserveSeconds, 5, 90, 5, "#84cc16"],
                      ["Anchor word time", wordSeconds, setWordSeconds, 5, 90, 5, "#14b8a6"],
                      ["Ground time", groundSeconds, setGroundSeconds, 5, 60, 5, "#10b981"],
                      ["Repetitions", repetitions, setRepetitions, 1, 10, 1, "#14b8a6"],
                    ].map(([label, value, setter, min, max, step, color]) => (
                      <div key={label as string}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 10,
                          }}
                        >
                          <label style={{ fontSize: 16, color: "#334155", fontWeight: 500 }}>
                            {label as string}
                          </label>
                          <span
                            style={{
                              background: "#ccfbf1",
                              color: "#115e59",
                              borderRadius: 999,
                              padding: "6px 10px",
                              fontSize: 14,
                              fontWeight: 600,
                            }}
                          >
                            {value as number}
                            {label === "Breath cycles" || label === "Repetitions" ? "" : "s"}
                            {label === "Repetitions" ? "x" : ""}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={min as number}
                          max={max as number}
                          step={step as number}
                          value={value as number}
                          onChange={(e) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(e.target.value))}
                          style={{ ...inputRangeStyle, accentColor: color as string }}
                        />
                      </div>
                    ))}

                    <div>
                      <label style={{ fontSize: 16, color: "#334155", fontWeight: 500 }}>Anchor word</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                        {["calm", "peace", "relax"].map((word) => (
                          <button
                            key={word}
                            type="button"
                            onClick={() => setAnchorWord(word)}
                            style={{
                              height: 44,
                              borderRadius: 16,
                              cursor: "pointer",
                              border: anchorWord === word ? "none" : "1px solid #a7f3d0",
                              background: anchorWord === word ? "#14b8a6" : "rgba(236,253,245,0.95)",
                              color: anchorWord === word ? "white" : "#065f46",
                              fontWeight: 600,
                              textTransform: "capitalize",
                            }}
                          >
                            {word}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(!isMobile || showSounds) && (
              <div style={styles.card}>
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#0f766e" }}>
                    <Music4 size={20} />
                    <h3 style={{ margin: 0 }}>Sounds</h3>
                  </div>
                  <p style={{ marginTop: 8, color: "#64748b" }}>
                    Choose the background sound that feels best for this session.
                  </p>

                  {isMobile && (
                    <div style={{ ...styles.softBox, marginTop: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, color: "#0f766e", fontSize: 14, fontWeight: 600 }}>
                            Install on your phone
                          </p>
                          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                            Add this to your Home Screen for a more app-like feel.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleInstallApp}
                          style={{
                            border: "none",
                            borderRadius: 16,
                            background: "#14b8a6",
                            color: "white",
                            padding: "10px 14px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Install
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: "block", fontSize: 14, color: "#334155", marginBottom: 8 }}>
                      Sound type
                    </label>
                    <select
                      value={soundMode}
                      onChange={(e) => setSoundMode(e.target.value as SoundMode)}
                      style={{
                        width: "100%",
                        height: 48,
                        borderRadius: 16,
                        border: "1px solid #a7f3d0",
                        background: "rgba(255,255,255,0.8)",
                        color: "#065f46",
                        padding: "0 14px",
                        fontSize: 16,
                      }}
                    >
                      {soundOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>
                      {selectedSound.description}
                    </p>
                  </div>

                  <div
                    style={{
                      ...styles.softBox,
                      marginTop: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, color: "#0f766e", fontWeight: 600, fontSize: 14 }}>
                        Sound playback
                      </p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
                        Background ambience starts when the routine is running.
                      </p>
                    </div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={isSoundOn}
                        onChange={(e) => setIsSoundOn(e.target.checked)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {isMobile ? (
              <div style={styles.card}>
                <div style={{ padding: 16 }}>
                  <h3 style={{ margin: 0, color: "#0f766e" }}>Quick presets</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() =>
                        quickPreset({
                          settle: 20,
                          inhale: 4,
                          exhale: 6,
                          cycles: 6,
                          observe: 30,
                          word: 30,
                          ground: 10,
                          reps: 1,
                        })
                      }
                      style={{ ...styles.buttonSecondary, width: "auto", padding: "0 16px", height: 40 }}
                    >
                      Default
                    </button>
                    <button
                      onClick={() =>
                        quickPreset({
                          settle: 20,
                          inhale: 4,
                          exhale: 8,
                          cycles: 8,
                          observe: 45,
                          word: 45,
                          ground: 15,
                          reps: 1,
                        })
                      }
                      style={{ ...styles.buttonSecondary, width: "auto", padding: "0 16px", height: 40 }}
                    >
                      Deep calm
                    </button>
                    <button
                      onClick={() =>
                        quickPreset({
                          settle: 15,
                          inhale: 3,
                          exhale: 5,
                          cycles: 5,
                          observe: 20,
                          word: 20,
                          ground: 10,
                          reps: 2,
                        })
                      }
                      style={{ ...styles.buttonSecondary, width: "auto", padding: "0 16px", height: 40 }}
                    >
                      Quick reset
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={styles.card}>
                <div style={{ padding: 20 }}>
                  <h3 style={{ margin: 0, color: "#0f766e" }}>Quick presets</h3>
                  <p style={{ marginTop: 8, color: "#64748b" }}>
                    Pick a structure and go breathe like a professional.
                  </p>
                  <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                    <button
                      onClick={() =>
                        quickPreset({
                          settle: 20,
                          inhale: 4,
                          exhale: 6,
                          cycles: 6,
                          observe: 30,
                          word: 30,
                          ground: 10,
                          reps: 1,
                        })
                      }
                      style={styles.buttonSecondary}
                    >
                      Default · 4 in / 6 out
                    </button>
                    <button
                      onClick={() =>
                        quickPreset({
                          settle: 20,
                          inhale: 4,
                          exhale: 8,
                          cycles: 8,
                          observe: 45,
                          word: 45,
                          ground: 15,
                          reps: 1,
                        })
                      }
                      style={styles.buttonSecondary}
                    >
                      Deep calm · 4 in / 8 out
                    </button>
                    <button
                      onClick={() =>
                        quickPreset({
                          settle: 15,
                          inhale: 3,
                          exhale: 5,
                          cycles: 5,
                          observe: 20,
                          word: 20,
                          ground: 10,
                          reps: 2,
                        })
                      }
                      style={styles.buttonSecondary}
                    >
                      Quick reset · shorter rounds
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
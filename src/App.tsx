import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Moon, Play, Pause, RotateCcw, Volume2, VolumeX, TimerReset, Waves, Wind, Music4, Download, ChevronDown, ChevronUp, SlidersHorizontal, ListChecks } from "lucide-react";

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

function createNoiseBuffer(ctx: AudioContext, duration = 2, tint: "white" | "pink" | "brown" = "white") {
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
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
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
      const stop1 = startLoopedNoise({ tint: "brown", filterType: "highpass", frequency: 350, gainValue: volume * 0.9, lfoDepth: volume * 0.12, lfoRate: 0.22 });
      const stop2 = startLoopedNoise({ tint: "white", filterType: "bandpass", frequency: 1400, q: 0.8, gainValue: volume * 0.25, lfoDepth: volume * 0.08, lfoRate: 0.31 });
      return () => {
        stop1();
        stop2();
      };
    };

    const startOcean = () => {
      const stop1 = startLoopedNoise({ tint: "brown", filterType: "lowpass", frequency: 700, gainValue: volume * 0.8, lfoDepth: volume * 0.25, lfoRate: 0.06 });
      const stop2 = startLoopedNoise({ tint: "pink", filterType: "bandpass", frequency: 500, q: 0.6, gainValue: volume * 0.22, lfoDepth: volume * 0.08, lfoRate: 0.09 });
      return () => {
        stop1();
        stop2();
      };
    };

    const startRain = () => {
      const stop1 = startLoopedNoise({ tint: "pink", filterType: "highpass", frequency: 900, gainValue: volume * 0.55, lfoDepth: volume * 0.06, lfoRate: 0.28 });
      const stop2 = startLoopedNoise({ tint: "white", filterType: "bandpass", frequency: 2600, q: 1.2, gainValue: volume * 0.1, lfoDepth: volume * 0.04, lfoRate: 0.37 });
      return () => {
        stop1();
        stop2();
      };
    };

    const startForest = () => {
      const stopBed = startLoopedNoise({ tint: "brown", filterType: "lowpass", frequency: 900, gainValue: volume * 0.42, lfoDepth: volume * 0.04, lfoRate: 0.12 });
      const birds: number[] = [];
      const chirp = () => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
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

const sliderBase =
  "[&>span:first-child]:bg-emerald-100 [&>span:first-child_span]:bg-teal-500 [&_[role=slider]]:bg-white [&_[role=slider]]:border-2 [&_[role=slider]]:border-teal-500 [&_[role=slider]]:shadow-[0_0_0_4px_rgba(20,184,166,0.14)]";

const sliderCyan =
  "[&>span:first-child]:bg-cyan-100 [&>span:first-child_span]:bg-cyan-500 [&_[role=slider]]:border-cyan-500 [&_[role=slider]]:shadow-[0_0_0_4px_rgba(34,211,238,0.14)]";

const sliderEmerald =
  "[&>span:first-child]:bg-emerald-100 [&>span:first-child_span]:bg-emerald-500 [&_[role=slider]]:border-emerald-500 [&_[role=slider]]:shadow-[0_0_0_4px_rgba(16,185,129,0.14)]";

const sliderLime =
  "[&>span:first-child]:bg-lime-100 [&>span:first-child_span]:bg-lime-500 [&_[role=slider]]:border-lime-500 [&_[role=slider]]:shadow-[0_0_0_4px_rgba(132,204,22,0.12)]";

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

export default function TwoMinuteRoutineApp() {
  const softFontClass = "font-['Georgia'] tracking-[0.01em]";
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

  useAmbientSound(isSoundOn, isRunning, soundMode);

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

  const selectedSound = soundOptions.find((option) => option.value === soundMode) ?? soundOptions[0];

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
        text: `Breathe in softly through your nose.`,
        bullets: [`Inhale for ${inhaleSeconds} seconds`, "Let your chest stay easy", "Keep your face soft"],
      });
      steps.push({
        key: `exhale-${i + 1}`,
        label: `Exhale ${i + 1}/${breathCycles}`,
        duration: exhaleSeconds,
        text: `Breathe out slowly and release tension.`,
        bullets: [`Exhale for ${exhaleSeconds} seconds`, "Relax your shoulders more", "Let the body get heavier"],
      });
    }

    steps.push(
      {
        key: "observe",
        label: "Observe",
        duration: observeSeconds,
        text: "Close your eyes if that feels comfortable, and gently watch your breath.",
        bullets: ["Notice the air moving in", "Notice the air moving out", "Let the breath stay natural"],
      },
      {
        key: "word",
        label: "Anchor Word",
        duration: wordSeconds,
        text: `Use your anchor word gently.`,
        bullets: [`Repeat "${anchorWord}" on each exhale`, "Keep the word soft", "Let the breath lead"],
      },
      {
        key: "ground",
        label: "Ground",
        duration: groundSeconds,
        text: "Return to the present moment.",
        bullets: ["Notice one thing you see", "Notice one thing you hear", "Notice one thing you feel"],
      }
    );

    return steps;
  }, [settleSeconds, inhaleSeconds, exhaleSeconds, breathCycles, observeSeconds, wordSeconds, groundSeconds, anchorWord]);

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

  return (
    <>
      <style>{`
        @keyframes calmPulse {
          0%, 100% { opacity: 0.72; transform: scale(1); box-shadow: 0 0 0 rgba(45,212,191,0); }
          50% { opacity: 1; transform: scale(1.015); box-shadow: 0 0 18px rgba(45,212,191,0.14); }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-green-100 text-slate-800 px-3 py-4 sm:p-6 md:p-10">
        <div className="max-w-6xl mx-auto grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="bg-emerald-50/90 border-emerald-100 backdrop-blur-xl rounded-[2rem] shadow-xl overflow-hidden">
            <CardHeader className="pb-2 px-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-[2rem] leading-[0.95] sm:text-3xl flex items-start gap-3 text-teal-700">
                    <Moon className="w-7 h-7 sm:w-8 sm:h-8 text-teal-600 mt-1 shrink-0" />
                    <span>Calm Breathing Routine</span>
                  </CardTitle>
                  <CardDescription className="text-slate-600 mt-3 text-base sm:text-base max-w-xl">
                    A calm, guided breathing reset with simple steps and soothing sounds.
                  </CardDescription>
                </div>
                <Badge className="bg-teal-100 text-teal-800 border border-teal-200 px-3 py-2 rounded-full text-sm shrink-0 self-center sm:self-start">
                  Rep {currentRep}/{repetitions}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 px-4 pb-24 sm:pb-6 sm:px-6">
              <div className="sm:hidden rounded-2xl border border-emerald-100 bg-white/45 px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-teal-700 flex items-center gap-2">
                      <Download className="w-4 h-4" /> Install on iPhone
                    </p>
                    <p className="text-xs text-slate-600 mt-1">Use Safari, then Share → Add to Home Screen.</p>
                    {showInstallHelp && <p className="text-xs text-teal-700 mt-2">If the install button does nothing on iPhone, Safari Home Screen is the path.</p>}
                    {installStatus === "installed" && <p className="text-xs text-emerald-700 mt-2">Installed or ready from Home Screen.</p>}
                  </div>
                  <Button type="button" onClick={handleInstallApp} className="rounded-2xl bg-teal-500 text-white hover:bg-teal-600 text-sm px-4 py-2 h-auto shrink-0">
                    Install
                  </Button>
                </div>
              </div>

              <div className="rounded-[1.75rem] bg-emerald-50/95 border border-emerald-100 p-4 sm:p-6 shadow-sm">
                <div className="grid gap-5 lg:grid-cols-[1fr_220px] items-start">
                  <div>
                    <p className="text-teal-700 text-xs sm:text-sm uppercase tracking-[0.25em] mb-2">Current Event</p>
                    <h2 className="text-5xl sm:text-6xl font-semibold text-teal-600 drop-shadow-[0_0_12px_rgba(45,212,191,0.18)] leading-none">{activeStep?.label}</h2>
                    <div className="mt-4 rounded-2xl border border-teal-100/80 bg-teal-50/70 p-4 sm:p-5">
                      <p className={`text-2xl sm:text-3xl text-teal-700 leading-tight drop-shadow-[0_0_10px_rgba(45,212,191,0.10)] ${softFontClass}`}>
                        {activeStep?.text}
                      </p>
                      <div className="mt-4 space-y-3">
                        {(activeStep?.bullets ?? []).map((bullet, idx) => (
                          <div
                            key={`${activeStep?.key}-${idx}`}
                            className="flex items-center gap-3 rounded-xl bg-white/55 px-3 py-3"
                            style={{ animation: `calmPulse 3.6s ease-in-out ${idx * 0.6}s infinite` }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.45)] shrink-0" />
                            <span className={`text-base sm:text-lg text-cyan-700 ${softFontClass}`}>{bullet}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:text-left">
                    <div className="col-span-2 rounded-2xl border border-emerald-100 bg-white/55 px-4 py-4 text-center lg:text-left">
                      <p className="text-slate-500 text-sm">Event time left</p>
                      <div className="text-6xl sm:text-7xl lg:text-6xl font-bold tabular-nums text-cyan-600 drop-shadow-[0_0_16px_rgba(34,211,238,0.22)] leading-none mt-2">
                        {formatSeconds(stepSecondsLeft)}
                      </div>
                      <p className="text-slate-500 text-sm mt-3">Total routine: {formatSeconds(totalRoutineSeconds)}</p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white/55 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-teal-600 mb-1">Ambient</p>
                      <p className="text-sm font-medium text-teal-700">{selectedSound.label}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-white/55 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-teal-600 mb-1">Rhythm</p>
                      <p className="text-sm font-medium text-teal-700">{inhaleSeconds}s in · {exhaleSeconds}s out</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4 sm:mt-5">
                  <div className="rounded-2xl border border-emerald-100 bg-white/55 p-3 sm:p-4">
                    <p className="text-xs sm:text-sm text-slate-500 mb-1">Inhale</p>
                    <p className="text-2xl sm:text-3xl font-semibold text-teal-600">{inhaleSeconds}s</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white/55 p-3 sm:p-4">
                    <p className="text-xs sm:text-sm text-slate-500 mb-1">Exhale</p>
                    <p className="text-2xl sm:text-3xl font-semibold text-sky-600">{exhaleSeconds}s</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white/55 p-3 sm:p-4">
                    <p className="text-xs sm:text-sm text-slate-500 mb-1">Cycles</p>
                    <p className="text-2xl sm:text-3xl font-semibold text-emerald-600">{breathCycles}</p>
                  </div>
                </div>

                <div className="space-y-3 mt-4 sm:mt-5">
                  <div>
                    <div className="flex justify-between text-sm text-slate-600 mb-2">
                      <span>Routine progress</span>
                      <span>{Math.round(routineProgress)}%</span>
                    </div>
                    <Progress value={routineProgress} className="h-3 bg-emerald-100" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-slate-600 mb-2">
                      <span>Total session progress</span>
                      <span>{Math.round(sessionProgress)}%</span>
                    </div>
                    <Progress value={sessionProgress} className="h-3 bg-emerald-100" />
                  </div>
                </div>
              </div>

              <div className="sm:hidden grid grid-cols-1 gap-3 sticky bottom-3 z-20">
                {!isRunning ? (
                  <Button onClick={start} className="rounded-2xl h-14 text-lg bg-teal-600 text-white hover:bg-teal-700 shadow-lg">
                    <Play className="mr-2 h-5 w-5" /> Start
                  </Button>
                ) : (
                  <Button onClick={pause} className="rounded-2xl h-14 text-lg bg-teal-600 text-white hover:bg-teal-700 shadow-lg">
                    <Pause className="mr-2 h-5 w-5" /> Pause
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={resetSession} variant="secondary" className="rounded-2xl h-12 bg-emerald-50/95 text-emerald-800 border border-emerald-200">
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset
                  </Button>
                  <Button onClick={() => setIsSoundOn((v) => !v)} variant="secondary" className="rounded-2xl h-12 bg-emerald-50/95 text-emerald-800 border border-emerald-200">
                    {isSoundOn ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
                    {isSoundOn ? "Sound" : "Muted"}
                  </Button>
                </div>
              </div>

              <div className="hidden sm:grid grid-cols-1 sm:grid-cols-3 gap-3">
                {!isRunning ? (
                  <Button onClick={start} className="rounded-2xl h-12 text-base bg-teal-600 text-white hover:bg-teal-700">
                    <Play className="mr-2 h-4 w-4" /> Start
                  </Button>
                ) : (
                  <Button onClick={pause} className="rounded-2xl h-12 text-base bg-teal-600 text-white hover:bg-teal-700">
                    <Pause className="mr-2 h-4 w-4" /> Pause
                  </Button>
                )}
                <Button onClick={resetSession} variant="secondary" className="rounded-2xl h-12 text-base bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.08)]">
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
                <Button onClick={() => setIsSoundOn((v) => !v)} variant="secondary" className="rounded-2xl h-12 text-base bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.08)]">
                  {isSoundOn ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
                  {isSoundOn ? "Sound On" : "Sound Off"}
                </Button>
              </div>

              <div className="sm:hidden space-y-3">
                <Button type="button" variant="secondary" onClick={() => setShowSettings((v) => !v)} className="w-full rounded-2xl h-12 bg-emerald-50/95 text-emerald-800 border border-emerald-200 justify-between">
                  <span className="flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" /> Adjust routine</span>
                  {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowSounds((v) => !v)} className="w-full rounded-2xl h-12 bg-emerald-50/95 text-emerald-800 border border-emerald-200 justify-between">
                  <span className="flex items-center gap-2"><Music4 className="w-4 h-4" /> Sounds</span>
                  {showSounds ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowSteps((v) => !v)} className="w-full rounded-2xl h-12 bg-emerald-50/95 text-emerald-800 border border-emerald-200 justify-between">
                  <span className="flex items-center gap-2"><ListChecks className="w-4 h-4" /> Routine steps</span>
                  {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>

              {(showSteps || false) && (
                <div className="sm:hidden rounded-3xl border border-emerald-100 bg-emerald-50/85 p-4">
                  <div className="flex items-center gap-2 mb-4 text-slate-700">
                    <Wind className="w-5 h-5 text-teal-600" />
                    <h3 className="text-lg font-semibold">Routine steps</h3>
                  </div>
                  <div className="grid gap-2">
                    {routineSteps.map((step, index) => (
                      <div key={step.key} className={`rounded-2xl border p-3 ${index === stepIndex ? "border-teal-300 bg-teal-50/90" : "border-emerald-100 bg-emerald-50/80"}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-teal-700">{step.label}</p>
                          <Badge variant="secondary" className="rounded-full bg-teal-100 text-teal-800">{step.duration}s</Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">{step.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="hidden sm:block rounded-3xl border border-emerald-100 bg-emerald-50/85 p-5">
                <div className="flex items-center gap-2 mb-4 text-slate-700">
                  <Wind className="w-5 h-5 text-teal-600" />
                  <h3 className="text-lg font-semibold">Routine steps</h3>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {routineSteps.map((step, index) => (
                    <div key={step.key} className={`rounded-2xl border p-3 ${index === stepIndex ? "border-teal-300 bg-teal-50/90" : "border-emerald-100 bg-emerald-50/80"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-teal-700">{step.label}</p>
                        <Badge variant="secondary" className="rounded-full bg-teal-100 text-teal-800">{step.duration}s</Badge>
                      </div>
                      <p className="text-sm text-slate-600 mt-2">{step.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className={`${showSettings ? "block" : "hidden"} sm:block`}>
              <Card className="bg-emerald-50/85 border-emerald-100 backdrop-blur-xl rounded-[2rem] shadow-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl flex items-center gap-2 text-teal-700">
                    <TimerReset className="w-5 h-5 text-teal-600" /> Event timings
                  </CardTitle>
                  <CardDescription className="text-slate-600">
                    Tune each part of the routine without crowding the main timer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-emerald-100 bg-white/40 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-teal-700">Changed a few settings?</p>
                      <p className="text-xs text-slate-500 mt-1">Jump back to the original routine anytime.</p>
                    </div>
                    <Button type="button" onClick={restoreDefaults} className="rounded-2xl bg-teal-500 text-white hover:bg-teal-600 sm:w-auto w-full">
                      Restore defaults
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Settle time</Label>
                      <Badge variant="secondary" className="rounded-full bg-teal-100 text-teal-800">{settleSeconds}s</Badge>
                    </div>
                    <Slider className={sliderBase} value={[settleSeconds]} min={5} max={60} step={5} onValueChange={(v) => setSettleSeconds(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Inhale time</Label>
                      <Badge variant="secondary" className="rounded-full bg-sky-100 text-sky-800">{inhaleSeconds}s</Badge>
                    </div>
                    <Slider className={`${sliderBase} ${sliderCyan}`} value={[inhaleSeconds]} min={2} max={10} step={1} onValueChange={(v) => setInhaleSeconds(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Exhale time</Label>
                      <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">{exhaleSeconds}s</Badge>
                    </div>
                    <Slider className={`${sliderBase} ${sliderEmerald}`} value={[exhaleSeconds]} min={2} max={12} step={1} onValueChange={(v) => setExhaleSeconds(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Breath cycles</Label>
                      <Badge variant="secondary" className="rounded-full bg-teal-100 text-teal-800">{breathCycles}</Badge>
                    </div>
                    <Slider className={sliderBase} value={[breathCycles]} min={1} max={15} step={1} onValueChange={(v) => setBreathCycles(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Observe time</Label>
                      <Badge variant="secondary" className="rounded-full bg-lime-100 text-lime-800">{observeSeconds}s</Badge>
                    </div>
                    <Slider className={`${sliderBase} ${sliderLime}`} value={[observeSeconds]} min={5} max={90} step={5} onValueChange={(v) => setObserveSeconds(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Anchor word time</Label>
                      <Badge variant="secondary" className="rounded-full bg-teal-100 text-teal-800">{wordSeconds}s</Badge>
                    </div>
                    <Slider className={sliderBase} value={[wordSeconds]} min={5} max={90} step={5} onValueChange={(v) => setWordSeconds(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Ground time</Label>
                      <Badge variant="secondary" className="rounded-full bg-emerald-100 text-emerald-800">{groundSeconds}s</Badge>
                    </div>
                    <Slider className={`${sliderBase} ${sliderEmerald}`} value={[groundSeconds]} min={5} max={60} step={5} onValueChange={(v) => setGroundSeconds(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base text-slate-700">Repetitions</Label>
                      <Badge variant="secondary" className="rounded-full bg-teal-100 text-teal-800">{repetitions}x</Badge>
                    </div>
                    <Slider className={sliderBase} value={[repetitions]} min={1} max={10} step={1} onValueChange={(v) => setRepetitions(v[0])} />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base text-slate-700">Anchor word</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {["calm", "peace", "relax"].map((word) => (
                        <Button
                          key={word}
                          type="button"
                          onClick={() => setAnchorWord(word)}
                          className={`rounded-2xl capitalize ${anchorWord === word ? "bg-teal-500 text-white hover:bg-teal-600 shadow-[0_0_18px_rgba(45,212,191,0.18)]" : "bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.08)]"}`}
                        >
                          {word}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className={`${showSounds ? "block" : "hidden"} sm:block`}>
              <Card className="bg-emerald-50/85 border-emerald-100 backdrop-blur-xl rounded-[2rem] shadow-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl flex items-center gap-2 text-teal-700">
                    <Music4 className="w-5 h-5 text-teal-600" /> Sounds
                  </CardTitle>
                  <CardDescription className="text-slate-600">Choose the background sound that feels best for this session.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="sm:hidden rounded-2xl border border-emerald-100 bg-white/45 px-4 py-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-teal-700 flex items-center gap-2"><Download className="w-4 h-4" /> Install on your phone</p>
                        <p className="text-xs text-slate-600 mt-1">Add this to your Home Screen for a more app-like feel.</p>
                      </div>
                      <Button type="button" onClick={handleInstallApp} className="rounded-2xl bg-teal-500 text-white hover:bg-teal-600 text-sm px-4 py-2 h-auto shrink-0">Install</Button>
                    </div>
                    {showInstallHelp && <p className="text-xs text-teal-700 mt-2">On iPhone: Safari → Share → Add to Home Screen.</p>}
                    {installStatus === "installed" && <p className="text-xs text-emerald-700 mt-2">Installed or ready from Home Screen.</p>}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-slate-700">Sound type</Label>
                    <Select value={soundMode} onValueChange={(value: SoundMode) => setSoundMode(value)}>
                      <SelectTrigger className="bg-white/80 border-emerald-200 text-emerald-800 rounded-2xl h-12 text-base">
                        <SelectValue placeholder="Choose a sound" />
                      </SelectTrigger>
                      <SelectContent>
                        {soundOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-slate-500">{selectedSound.description}</p>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-white/45 p-4">
                    <div>
                      <p className="font-medium flex items-center gap-2 text-teal-700">
                        <Waves className="w-4 h-4 text-teal-500" /> Sound playback
                      </p>
                      <p className="text-sm text-slate-600">Background ambience starts when the routine is running.</p>
                    </div>
                    <Switch checked={isSoundOn} onCheckedChange={setIsSoundOn} className="data-[state=checked]:bg-teal-500 data-[state=unchecked]:bg-emerald-200 border border-emerald-300" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="sm:hidden rounded-[2rem] border border-emerald-100 bg-emerald-50/85 p-4 shadow-xl">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-lg font-semibold text-teal-700">Quick presets</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => quickPreset({ settle: 20, inhale: 4, exhale: 6, cycles: 6, observe: 30, word: 30, ground: 10, reps: 1 })} className="rounded-full bg-white/70 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 h-10 px-4">Default</Button>
                <Button onClick={() => quickPreset({ settle: 20, inhale: 4, exhale: 8, cycles: 8, observe: 45, word: 45, ground: 15, reps: 1 })} className="rounded-full bg-white/70 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 h-10 px-4">Deep calm</Button>
                <Button onClick={() => quickPreset({ settle: 15, inhale: 3, exhale: 5, cycles: 5, observe: 20, word: 20, ground: 10, reps: 2 })} className="rounded-full bg-white/70 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 h-10 px-4">Quick reset</Button>
              </div>
            </div>

            <div className="hidden sm:block">
              <Card className="bg-emerald-50/85 border-emerald-100 backdrop-blur-xl rounded-[2rem] shadow-xl">
                <CardHeader>
                  <CardTitle className="text-xl text-teal-700">Quick presets</CardTitle>
                  <CardDescription className="text-slate-600">Pick a structure and go breathe like a professional.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Button onClick={() => quickPreset({ settle: 20, inhale: 4, exhale: 6, cycles: 6, observe: 30, word: 30, ground: 10, reps: 1 })} className="justify-start rounded-2xl bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.08)]">Default · 4 in / 6 out</Button>
                  <Button onClick={() => quickPreset({ settle: 20, inhale: 4, exhale: 8, cycles: 8, observe: 45, word: 45, ground: 15, reps: 1 })} className="justify-start rounded-2xl bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.08)]">Deep calm · 4 in / 8 out</Button>
                  <Button onClick={() => quickPreset({ settle: 15, inhale: 3, exhale: 5, cycles: 5, observe: 20, word: 20, ground: 10, reps: 2 })} className="justify-start rounded-2xl bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.08)]">Quick reset · shorter rounds</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Moon,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  SlidersHorizontal,
  Music4,
  ListChecks,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type SoundMode = "bowls" | "stream" | "ocean" | "rain" | "forest";

type Step = {
  key: string;
  label: string;
  duration: number;
  text: string;
  bullets?: string[];
};

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DEFAULTS = {
  settle: 20,
  inhale: 4,
  exhale: 6,
  cycles: 6,
  observe: 30,
  anchor: 30,
  ground: 10,
  reps: 1,
  anchorWord: "calm",
  sound: "bowls" as SoundMode,
};

const SOUNDS: Record<SoundMode, string> = {
  bowls: "Tibetan bowls",
  stream: "Flowing stream",
  ocean: "Slow ocean waves",
  rain: "Gentle rain",
  forest: "Quiet forest",
};

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
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

function useAmbientSound(enabled: boolean, running: boolean, mode: SoundMode) {
  const ctxRef = useRef<AudioContext | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const noiseRef = useRef<Record<string, AudioBuffer>>({});

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
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
      if (!noiseRef.current[key]) noiseRef.current[key] = createNoiseBuffer(ctx, 2, tint);
      return noiseRef.current[key];
    };

    const loopNoise = (
      tint: "white" | "pink" | "brown",
      type: BiquadFilterType,
      freq: number,
      gainValue: number,
      q = 0
    ) => {
      const source = ctx.createBufferSource();
      source.buffer = getNoise(`${tint}-${type}`, tint);
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;

      const gain = ctx.createGain();
      gain.gain.value = gainValue;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      return () => {
        source.stop();
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    };

    const startBowls = () => {
      const ids: number[] = [];
      const strike = () => {
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
        master.connect(ctx.destination);

        [196, 293.66, 392].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = i % 2 === 0 ? "sine" : "triangle";
          osc.frequency.setValueAtTime(f, now);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.05 / (i + 1), now + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 4 + i * 0.2);
          osc.connect(g);
          g.connect(master);
          osc.start(now);
          osc.stop(now + 4.2 + i * 0.2);
        });
      };

      strike();
      ids.push(window.setInterval(strike, 9000));
      return () => ids.forEach((id) => window.clearInterval(id));
    };

    const cleanup =
      mode === "bowls"
        ? startBowls()
        : mode === "stream"
        ? (() => {
            const a = loopNoise("brown", "highpass", 350, 0.045);
            const b = loopNoise("white", "bandpass", 1400, 0.014, 0.8);
            return () => {
              a();
              b();
            };
          })()
        : mode === "ocean"
        ? (() => {
            const a = loopNoise("brown", "lowpass", 700, 0.04);
            const b = loopNoise("pink", "bandpass", 500, 0.012, 0.6);
            return () => {
              a();
              b();
            };
          })()
        : mode === "rain"
        ? (() => {
            const a = loopNoise("pink", "highpass", 900, 0.03);
            const b = loopNoise("white", "bandpass", 2600, 0.008, 1.2);
            return () => {
              a();
              b();
            };
          })()
        : (() => {
            const a = loopNoise("brown", "lowpass", 900, 0.025);
            return () => a();
          })();

    cleanupRef.current = cleanup;
    return () => cleanup();
  }, [enabled, running, mode]);
}

function App() {
  const [settle, setSettle] = useState(DEFAULTS.settle);
  const [inhale, setInhale] = useState(DEFAULTS.inhale);
  const [exhale, setExhale] = useState(DEFAULTS.exhale);
  const [cycles, setCycles] = useState(DEFAULTS.cycles);
  const [observe, setObserve] = useState(DEFAULTS.observe);
  const [anchor, setAnchor] = useState(DEFAULTS.anchor);
  const [ground, setGround] = useState(DEFAULTS.ground);
  const [reps, setReps] = useState(DEFAULTS.reps);
  const [anchorWord, setAnchorWord] = useState(DEFAULTS.anchorWord);
  const [soundMode, setSoundMode] = useState<SoundMode>(DEFAULTS.sound);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRep, setCurrentRep] = useState(1);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepSecondsLeft, setStepSecondsLeft] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showSounds, setShowSounds] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showInstallCard, setShowInstallCard] = useState(true);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [installStatus, setInstallStatus] = useState<"idle" | "installed">("idle");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useAmbientSound(isSoundOn, isRunning, soundMode);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as DeferredInstallPrompt);
    };

    const onInstalled = () => {
      setInstallStatus("installed");
      setDeferredPrompt(null);
      setShowInstallCard(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [
      {
        key: "settle",
        label: "Settle",
        duration: settle,
        text: "Settle into your body.",
        bullets: ["Drop your shoulders", "Unclench your jaw", "Put both feet flat"],
      },
    ];

    for (let i = 0; i < cycles; i++) {
      list.push({
        key: `inhale-${i}`,
        label: `Inhale ${i + 1}/${cycles}`,
        duration: inhale,
        text: "Breathe in softly through your nose.",
        bullets: [`Inhale for ${inhale} seconds`, "Let your chest stay easy", "Keep your face soft"],
      });
      list.push({
        key: `exhale-${i}`,
        label: `Exhale ${i + 1}/${cycles}`,
        duration: exhale,
        text: "Breathe out slowly and release tension.",
        bullets: [`Exhale for ${exhale} seconds`, "Relax your shoulders more", "Let the body get heavier"],
      });
    }

    list.push(
      {
        key: "observe",
        label: "Observe",
        duration: observe,
        text: "Close your eyes if that feels comfortable, and gently watch your breath.",
        bullets: ["Notice the air moving in", "Notice the air moving out", "Let the breath stay natural"],
      },
      {
        key: "anchor",
        label: "Anchor Word",
        duration: anchor,
        text: "Use your anchor word gently.",
        bullets: [`Repeat "${anchorWord}" on each exhale`, "Keep the word soft", "Let the breath lead"],
      },
      {
        key: "ground",
        label: "Ground",
        duration: ground,
        text: "Return to the present moment.",
        bullets: ["Notice one thing you see", "Notice one thing you hear", "Notice one thing you feel"],
      }
    );

    return list;
  }, [settle, inhale, exhale, cycles, observe, anchor, ground, anchorWord]);

  const totalRoutineSeconds = useMemo(() => steps.reduce((sum, s) => sum + s.duration, 0), [steps]);
  const totalSessionSeconds = totalRoutineSeconds * reps;
  const activeStep = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (!isRunning) {
      setCurrentRep(1);
      setStepIndex(0);
      setStepSecondsLeft(steps[0]?.duration ?? 0);
    }
  }, [steps, isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      setStepSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        const nextIndex = stepIndex + 1;
        if (nextIndex < steps.length) {
          setStepIndex(nextIndex);
          return steps[nextIndex].duration;
        }
        if (currentRep < reps) {
          setCurrentRep((r) => r + 1);
          setStepIndex(0);
          return steps[0]?.duration ?? 0;
        }
        setIsRunning(false);
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRunning, stepIndex, steps, currentRep, reps]);

  const completedBeforeCurrent = steps.slice(0, stepIndex).reduce((sum, s) => sum + s.duration, 0);
  const elapsedThisRoutine = completedBeforeCurrent + Math.max(activeStep.duration - stepSecondsLeft, 0);
  const routineProgress = totalRoutineSeconds ? (elapsedThisRoutine / totalRoutineSeconds) * 100 : 0;
  const sessionProgress = totalSessionSeconds
    ? (((currentRep - 1) * totalRoutineSeconds + elapsedThisRoutine) / totalSessionSeconds) * 100
    : 0;

  const start = () => {
    if (stepSecondsLeft === 0) {
      setStepIndex(0);
      setCurrentRep(1);
      setStepSecondsLeft(steps[0]?.duration ?? 0);
    }
    setIsRunning(true);
  };

  const pause = () => setIsRunning(false);

  const resetSession = () => {
    setIsRunning(false);
    setCurrentRep(1);
    setStepIndex(0);
    setStepSecondsLeft(steps[0]?.duration ?? 0);
  };

  const restoreDefaults = () => {
    setIsRunning(false);
    setSettle(DEFAULTS.settle);
    setInhale(DEFAULTS.inhale);
    setExhale(DEFAULTS.exhale);
    setCycles(DEFAULTS.cycles);
    setObserve(DEFAULTS.observe);
    setAnchor(DEFAULTS.anchor);
    setGround(DEFAULTS.ground);
    setReps(DEFAULTS.reps);
    setAnchorWord(DEFAULTS.anchorWord);
    setSoundMode(DEFAULTS.sound);
    setCurrentRep(1);
    setStepIndex(0);
    setStepSecondsLeft(DEFAULTS.settle);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setShowInstallHelp(true);
      return;
    }
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setInstallStatus("installed");
      setShowInstallCard(false);
    }
    setDeferredPrompt(null);
  };

  const quickPreset = (s: number, i: number, e: number, c: number, o: number, a: number, g: number, r: number) => {
    setIsRunning(false);
    setSettle(s);
    setInhale(i);
    setExhale(e);
    setCycles(c);
    setObserve(o);
    setAnchor(a);
    setGround(g);
    setReps(r);
  };

  const card: React.CSSProperties = {
    background: "rgba(236,253,245,0.92)",
    border: "1px solid #bbf7d0",
    borderRadius: 28,
    boxShadow: "0 10px 28px rgba(15,118,110,0.08)",
  };

  const sectionBtn: React.CSSProperties = {
    width: "100%",
    border: "1px solid #a7f3d0",
    background: "rgba(236,253,245,0.95)",
    color: "#065f46",
    borderRadius: 18,
    padding: "14px 16px",
    fontWeight: 600,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
  };

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    border: "none",
    background: "#14b8a6",
    color: "white",
    borderRadius: 20,
    height: 56,
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
  };

  const secondaryBtn: React.CSSProperties = {
    width: "100%",
    border: "1px solid #a7f3d0",
    background: "rgba(236,253,245,0.95)",
    color: "#065f46",
    borderRadius: 18,
    height: 48,
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 50%, #dcfce7 100%)",
        color: "#334155",
        padding: 12,
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <style>{`
        @keyframes calmPulse {
          0%, 100% { opacity: 0.78; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.01); }
        }
        .soft-bullet { animation: calmPulse 3.6s ease-in-out infinite; }
      `}</style>

      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "grid",
          gap: 16,
          gridTemplateColumns: isMobile ? "1fr" : "1.15fr 0.85fr",
        }}
      >
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "#0f766e" }}>
                  <Moon size={isMobile ? 28 : 32} style={{ marginTop: 6, flexShrink: 0 }} />
                  <div style={{ fontWeight: 800, fontSize: isMobile ? 36 : 32, lineHeight: 0.95 }}>
                    Calm Breathing Routine
                  </div>
                </div>
                <p style={{ marginTop: 12, color: "#64748b", fontSize: 16 }}>
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
                  fontWeight: 700,
                  fontSize: 14,
                  height: "fit-content",
                  whiteSpace: "nowrap",
                }}
              >
                Rep {currentRep}/{reps}
              </div>
            </div>
          </div>

          <div style={{ padding: "0 16px 96px", display: "grid", gap: 16 }}>
            {isMobile && showInstallCard && (
              <div style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #bbf7d0", borderRadius: 20, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#0f766e", fontWeight: 700 }}>
                      <Download size={16} /> Install on iPhone
                    </div>
                    <p style={{ marginTop: 6, color: "#64748b", fontSize: 12 }}>Safari → Share → Add to Home Screen.</p>
                    {showInstallHelp && (
                      <p style={{ marginTop: 8, color: "#0f766e", fontSize: 12 }}>
                        If the button does nothing on iPhone, use the Safari Share menu.
                      </p>
                    )}
                    {installStatus === "installed" && (
                      <p style={{ marginTop: 8, color: "#047857", fontSize: 12 }}>Installed or ready from Home Screen.</p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={handleInstall} style={{ border: "none", borderRadius: 16, background: "#14b8a6", color: "white", padding: "10px 14px", fontWeight: 700, cursor: "pointer", height: "fit-content" }}>Install</button>
                    <button type="button" onClick={() => setShowInstallCard(false)} style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 22, cursor: "pointer", height: "fit-content" }}>×</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: "rgba(236,253,245,0.95)", border: "1px solid #bbf7d0", borderRadius: 26, padding: 16 }}>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: isMobile ? "1fr" : "1fr 220px" }}>
                <div>
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.25em", color: "#0f766e", marginBottom: 8 }}>
                    Current Event
                  </div>

                  <h1 style={{ margin: 0, fontSize: isMobile ? 64 : 72, lineHeight: 1, color: "#14b8a6" }}>
                    {activeStep.label}
                  </h1>

                  <div style={{ marginTop: 16, background: "rgba(204,251,241,0.42)", border: "1px solid #99f6e4", borderRadius: 22, padding: 16 }}>
                    <p style={{ margin: 0, color: "#0f766e", fontSize: isMobile ? 28 : 32, lineHeight: 1.2, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                      {activeStep.text}
                    </p>

                    <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                      {(activeStep.bullets ?? []).map((bullet, idx) => (
                        <div key={`${activeStep.key}-${idx}`} className="soft-bullet" style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.65)", borderRadius: 18, padding: "14px 16px", animationDelay: `${idx * 0.6}s` }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2dd4bf", flexShrink: 0 }} />
                          <span style={{ color: "#155e75", fontSize: isMobile ? 18 : 20, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                            {bullet}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr" }}>
                  <div style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #bbf7d0", borderRadius: 20, padding: 16, gridColumn: isMobile ? "1 / -1" : undefined, textAlign: isMobile ? "center" : "left" }}>
                    <div style={{ color: "#64748b", fontSize: 14 }}>Event time left</div>
                    <div style={{ marginTop: 8, fontSize: isMobile ? 84 : 72, lineHeight: 1, fontWeight: 800, color: "#0891b2" }}>
                      {formatSeconds(stepSecondsLeft)}
                    </div>
                    <div style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>Total routine: {formatSeconds(totalRoutineSeconds)}</div>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #bbf7d0", borderRadius: 18, padding: 12 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", color: "#0f766e" }}>Ambient</div>
                    <div style={{ marginTop: 6, color: "#0f766e", fontWeight: 700, fontSize: 14 }}>{SOUNDS[soundMode]}</div>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #bbf7d0", borderRadius: 18, padding: 12 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", color: "#0f766e" }}>Rhythm</div>
                    <div style={{ marginTop: 6, color: "#0f766e", fontWeight: 700, fontSize: 14 }}>{inhale}s in · {exhale}s out</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
                {[
                  { label: "Inhale", value: `${inhale}s`, color: "#0f766e" },
                  { label: "Exhale", value: `${exhale}s`, color: "#0284c7" },
                  { label: "Cycles", value: `${cycles}`, color: "#059669" },
                ].map((item) => (
                  <div key={item.label} style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #bbf7d0", borderRadius: 18, padding: 14 }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{item.label}</div>
                    <div style={{ marginTop: 8, fontSize: isMobile ? 36 : 32, fontWeight: 800, color: item.color }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
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
                <div style={card}>
                  <div style={{ padding: 16 }}>
                    <div style={{ color: "#0f766e", fontWeight: 800, fontSize: 22 }}>Quick presets</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      <button onClick={() => quickPreset(20, 4, 6, 6, 30, 30, 10, 1)} style={{ ...secondaryBtn, width: "auto", height: 40, padding: "0 16px" }}>Default</button>
                      <button onClick={() => quickPreset(20, 4, 8, 8, 45, 45, 15, 1)} style={{ ...secondaryBtn, width: "auto", height: 40, padding: "0 16px" }}>Deep calm</button>
                      <button onClick={() => quickPreset(15, 3, 5, 5, 20, 20, 10, 2)} style={{ ...secondaryBtn, width: "auto", height: 40, padding: "0 16px" }}>Quick reset</button>
                    </div>
                  </div>
                </div>

                <div style={{ position: "sticky", bottom: 12, zIndex: 20, display: "grid", gap: 12 }}>
                  {!isRunning ? (
                    <button onClick={start} style={primaryBtn}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Play size={20} /> Start
                      </span>
                    </button>
                  ) : (
                    <button onClick={pause} style={primaryBtn}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Pause size={20} /> Pause
                      </span>
                    </button>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button onClick={resetSession} style={secondaryBtn}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <RotateCcw size={18} /> Reset
                      </span>
                    </button>
                    <button onClick={() => setIsSoundOn((v) => !v)} style={secondaryBtn}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {isSoundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        {isSoundOn ? "Sound" : "Muted"}
                      </span>
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  <button type="button" onClick={() => setShowSettings((v) => !v)} style={sectionBtn}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <SlidersHorizontal size={16} /> Adjust routine
                    </span>
                    {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  <button type="button" onClick={() => setShowSounds((v) => !v)} style={sectionBtn}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Music4 size={16} /> Sounds
                    </span>
                    {showSounds ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  <button type="button" onClick={() => setShowSteps((v) => !v)} style={sectionBtn}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ListChecks size={16} /> Routine steps
                    </span>
                    {showSteps ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {showSteps && (
                  <div style={{ background: "rgba(236,253,245,0.95)", border: "1px solid #bbf7d0", borderRadius: 24, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: "#0f766e", fontWeight: 800 }}>
                      <ListChecks size={18} /> Routine steps
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {steps.map((step, index) => (
                        <div key={step.key} style={{ border: `1px solid ${index === stepIndex ? "#5eead4" : "#bbf7d0"}`, background: index === stepIndex ? "rgba(204,251,241,0.65)" : "rgba(236,253,245,0.8)", borderRadius: 18, padding: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ color: "#0f766e", fontWeight: 700 }}>{step.label}</div>
                            <span style={{ background: "#ccfbf1", color: "#115e59", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>{step.duration}s</span>
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
                    <button onClick={start} style={{ ...primaryBtn, height: 48, fontSize: 16 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Play size={16} /> Start
                      </span>
                    </button>
                  ) : (
                    <button onClick={pause} style={{ ...primaryBtn, height: 48, fontSize: 16 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <Pause size={16} /> Pause
                      </span>
                    </button>
                  )}
                  <button onClick={resetSession} style={secondaryBtn}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <RotateCcw size={16} /> Reset
                    </span>
                  </button>
                  <button onClick={() => setIsSoundOn((v) => !v)} style={secondaryBtn}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {isSoundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                      {isSoundOn ? "Sound On" : "Sound Off"}
                    </span>
                  </button>
                </div>

                <div style={{ background: "rgba(236,253,245,0.95)", border: "1px solid #bbf7d0", borderRadius: 24, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: "#0f766e", fontWeight: 800 }}>
                    <ListChecks size={20} /> Routine steps
                  </div>
                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                    {steps.map((step, index) => (
                      <div key={step.key} style={{ border: `1px solid ${index === stepIndex ? "#5eead4" : "#bbf7d0"}`, background: index === stepIndex ? "rgba(204,251,241,0.65)" : "rgba(236,253,245,0.8)", borderRadius: 18, padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ color: "#0f766e", fontWeight: 700 }}>{step.label}</div>
                          <span style={{ background: "#ccfbf1", color: "#115e59", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>{step.duration}s</span>
                        </div>
                        <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: 14 }}>{step.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {(!isMobile || showSettings) && (
              <div style={card}>
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#0f766e", fontWeight: 800 }}>
                    <SlidersHorizontal size={20} /> Event timings
                  </div>
                  <p style={{ marginTop: 8, color: "#64748b" }}>
                    Tune each part of the routine without crowding the main timer.
                  </p>

                  <div style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #bbf7d0", borderRadius: 18, padding: 14, marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
                      <div>
                        <div style={{ color: "#0f766e", fontWeight: 700, fontSize: 14 }}>Changed a few settings?</div>
                        <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>Jump back to the original routine anytime.</div>
                      </div>
                      <button type="button" onClick={restoreDefaults} style={{ border: "none", borderRadius: 16, background: "#14b8a6", color: "white", padding: "12px 16px", fontWeight: 700, cursor: "pointer" }}>
                        Restore defaults
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
                    {[
                      ["Settle time", settle, setSettle, 5, 60, 5],
                      ["Inhale time", inhale, setInhale, 2, 10, 1],
                      ["Exhale time", exhale, setExhale, 2, 12, 1],
                      ["Breath cycles", cycles, setCycles, 1, 15, 1],
                      ["Observe time", observe, setObserve, 5, 90, 5],
                      ["Anchor word time", anchor, setAnchor, 5, 90, 5],
                      ["Ground time", ground, setGround, 5, 60, 5],
                      ["Repetitions", reps, setReps, 1, 10, 1],
                    ].map(([label, value, setter, min, max, step]) => (
                      <div key={label as string}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <label style={{ fontSize: 16, color: "#334155", fontWeight: 500 }}>{label as string}</label>
                          <span style={{ background: "#ccfbf1", color: "#115e59", borderRadius: 999, padding: "6px 10px", fontSize: 14, fontWeight: 700 }}>
                            {value as number}
                            {label === "Breath cycles" || label === "Repetitions" ? "" : "s"}
                            {label === "Repetitions" ? "x" : ""}
                          </span>
                        </div>
                        <input type="range" min={min as number} max={max as number} step={step as number} value={value as number} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(e.target.value))} style={{ width: "100%", accentColor: "#14b8a6" }} />
                      </div>
                    ))}

                    <div>
                      <label style={{ fontSize: 16, color: "#334155", fontWeight: 500 }}>Anchor word</label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                        {["calm", "peace", "relax"].map((word) => (
                          <button key={word} type="button" onClick={() => setAnchorWord(word)} style={{ height: 44, borderRadius: 16, cursor: "pointer", border: anchorWord === word ? "none" : "1px solid #a7f3d0", background: anchorWord === word ? "#14b8a6" : "rgba(236,253,245,0.95)", color: anchorWord === word ? "white" : "#065f46", fontWeight: 700, textTransform: "capitalize" }}>
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
              <div style={card}>
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#0f766e", fontWeight: 800 }}>
                    <Music4 size={20} /> Sounds
                  </div>
                  <p style={{ marginTop: 8, color: "#64748b" }}>
                    Choose the background sound that feels best for this session.
                  </p>

                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: "block", fontSize: 14, color: "#334155", marginBottom: 8 }}>
                      Sound type
                    </label>
                    <select value={soundMode} onChange={(e) => setSoundMode(e.target.value as SoundMode)} style={{ width: "100%", height: 48, borderRadius: 16, border: "1px solid #a7f3d0", background: "rgba(255,255,255,0.8)", color: "#065f46", padding: "0 14px", fontSize: 16 }}>
                      {Object.entries(SOUNDS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #bbf7d0", borderRadius: 18, padding: 14, marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#0f766e", fontWeight: 700, fontSize: 14 }}>Sound playback</div>
                      <div style={{ marginTop: 4, color: "#64748b", fontSize: 14 }}>
                        Background ambience starts when the routine is running.
                      </div>
                    </div>
                    <input type="checkbox" checked={isSoundOn} onChange={(e) => setIsSoundOn(e.target.checked)} />
                  </div>
                </div>
              </div>
            )}

            {!isMobile && (
              <div style={card}>
                <div style={{ padding: 20 }}>
                  <div style={{ color: "#0f766e", fontWeight: 800, fontSize: 22 }}>Quick presets</div>
                  <p style={{ marginTop: 8, color: "#64748b" }}>
                    Pick a structure and go breathe like a professional.
                  </p>
                  <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                    <button onClick={() => quickPreset(20, 4, 6, 6, 30, 30, 10, 1)} style={secondaryBtn}>Default · 4 in / 6 out</button>
                    <button onClick={() => quickPreset(20, 4, 8, 8, 45, 45, 15, 1)} style={secondaryBtn}>Deep calm · 4 in / 8 out</button>
                    <button onClick={() => quickPreset(15, 3, 5, 5, 20, 20, 10, 2)} style={secondaryBtn}>Quick reset · shorter rounds</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

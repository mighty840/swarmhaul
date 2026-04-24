import { useCallback, useEffect, useRef, useState } from "react";

const TRACKS = [
  { id: "Eixb-_ir3W0", label: "VEIL & SCORE" },
  { id: "3qoXAP2eqMk", label: "WAREHOUSE SIGNAL" },
  { id: "xNloHt9f2tk", label: "RAGA SIGNAL" },
];

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  loadVideoById(id: string): void;
  destroy(): void;
}

declare global {
  interface Window {
    YT: {
      Player: new (el: string | HTMLElement, opts: Record<string, unknown>) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function BgmPlayer() {
  const playerRef = useRef<YTPlayer | null>(null);
  const initialised = useRef(false);
  const containerId = useRef(`yt-bgm-${Math.random().toString(36).slice(2)}`);

  const [apiReady, setApiReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TRACKS.length));

  // Load YouTube IFrame API once
  useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true);
      return;
    }
    if (!document.getElementById("yt-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      setApiReady(true);
    };
  }, []);

  // Init player once API is ready
  useEffect(() => {
    if (!apiReady || initialised.current) return;
    initialised.current = true;

    playerRef.current = new window.YT.Player(containerId.current, {
      videoId: TRACKS[idx].id,
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        origin: window.location.origin,
      },
      events: {
        onReady: (e: { target: YTPlayer }) => {
          e.target.playVideo();
          setPlaying(true);
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === window.YT.PlayerState.ENDED) {
            setIdx((i) => (i + 1) % TRACKS.length);
          }
          setPlaying(e.data === window.YT.PlayerState.PLAYING);
        },
      },
    });

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      initialised.current = false;
    };
  }, [apiReady]);

  // Change track
  useEffect(() => {
    if (!playerRef.current || !apiReady) return;
    playerRef.current.loadVideoById(TRACKS[idx].id);
    if (muted) playerRef.current.mute();
    else playerRef.current.unMute();
  }, [idx]);

  const toggleMute = useCallback(() => {
    if (!playerRef.current) return;
    if (muted) {
      playerRef.current.unMute();
      setMuted(false);
    } else {
      playerRef.current.mute();
      setMuted(true);
    }
  }, [muted]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, [playing]);

  const skip = useCallback(() => {
    setIdx((i) => (i + 1) % TRACKS.length);
  }, []);

  return (
    <>
      {/* 1×1 off-screen container — keeps iframe in DOM so browser won't throttle */}
      <div
        style={{
          position: "fixed",
          bottom: -2,
          left: -2,
          width: 1,
          height: 1,
          overflow: "hidden",
          pointerEvents: "none",
          opacity: 0,
        }}
      >
        <div id={containerId.current} />
      </div>

      {/* Floating BGM widget */}
      <div
        style={{ position: "fixed", bottom: "2.25rem", left: "1rem", zIndex: 50 }}
        className="bg-[var(--color-graphite)] border border-[var(--color-line)] flex items-center gap-2.5 px-3 py-1.5 select-none"
      >
        <span
          className={`text-[11px] leading-none transition-colors ${
            playing && !muted ? "text-[var(--color-phosphor)]" : "text-[var(--color-dim)]"
          }`}
        >
          ♪
        </span>

        <span className="text-[8px] tracking-[0.14em] font-semibold uppercase text-[var(--color-ash)] w-[9.5rem] truncate">
          {TRACKS[idx].label}
        </span>

        <button
          onClick={togglePlay}
          className="text-[10px] leading-none text-[var(--color-steel)] hover:text-[var(--color-bone)] transition-colors"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸" : "⏵"}
        </button>

        <button
          onClick={skip}
          className="text-[10px] leading-none text-[var(--color-steel)] hover:text-[var(--color-bone)] transition-colors"
          title="Next track"
        >
          ⏭
        </button>

        <button
          onClick={toggleMute}
          className={`text-[8px] tracking-[0.12em] font-semibold uppercase leading-none transition-colors ${
            muted
              ? "text-[var(--color-dim)] hover:text-[var(--color-steel)]"
              : "text-[var(--color-phosphor)] hover:text-[var(--color-phosphor)]"
          }`}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? "MUTED" : "LIVE"}
        </button>
      </div>
    </>
  );
}

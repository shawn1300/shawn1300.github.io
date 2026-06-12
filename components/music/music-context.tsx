"use client";

import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { TRACKS } from "./tracks";

// ── Types ──

export type Track = {
  id: string;
  title: string;
  artist: string;
  src: string;
  coverUrl?: string;
};

type MusicState = {
  isPlaying: boolean;
  currentTrackIndex: number;
  currentTime: number;
  duration: number;
};

type MusicActions = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  selectTrack: (index: number) => void;
};

type MusicContextValue = MusicState & MusicActions & { tracks: Track[] };

// ── Reducer ──

type Action =
  | { type: "SET_PLAYING" }
  | { type: "SET_PAUSED" }
  | { type: "SET_TIME"; time: number }
  | { type: "SET_DURATION"; duration: number }
  | { type: "SET_TRACK"; index: number };

const initialState: MusicState = {
  isPlaying: false,
  currentTrackIndex: 0,
  currentTime: 0,
  duration: 0,
};

function reducer(state: MusicState, action: Action): MusicState {
  switch (action.type) {
    case "SET_PLAYING":
      return { ...state, isPlaying: true };
    case "SET_PAUSED":
      return { ...state, isPlaying: false };
    case "SET_TIME":
      return { ...state, currentTime: action.time };
    case "SET_DURATION":
      return { ...state, duration: action.duration };
    case "SET_TRACK":
      return { ...state, currentTrackIndex: action.index, currentTime: 0, duration: 0 };
    default:
      return state;
  }
}

// ── Context ──

const MusicContext = createContext<MusicContextValue | null>(null);

export function useMusic(): MusicContextValue {
  const ctx = useContext(MusicContext);
  if (!ctx) {
    throw new Error("useMusic must be used within <MusicProvider>");
  }
  return ctx;
}

// ── Provider ──

export function MusicProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Create audio element on mount
  useEffect(() => {
    if (!mounted) return;

    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onPlay = () => dispatch({ type: "SET_PLAYING" });
    const onPause = () => dispatch({ type: "SET_PAUSED" });
    const onEnded = () => {
      // auto-advance to next track, or stop after last
      const nextIndex = state.currentTrackIndex + 1;
      if (nextIndex < TRACKS.length) {
        dispatch({ type: "SET_TRACK", index: nextIndex });
        // src change triggers re-render which loads new track in the effect below
      } else {
        dispatch({ type: "SET_PAUSED" });
      }
    };
    const onTimeUpdate = () => {
      if (!audio) return;
      const now = audio.currentTime;
      // throttle: only dispatch every 250ms
      if (Math.abs(now - lastTimeRef.current) > 0.25) {
        lastTimeRef.current = now;
        dispatch({ type: "SET_TIME", time: now });
      }
    };
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        dispatch({ type: "SET_DURATION", duration: audio.duration });
      }
    };
    const onError = () => {
      console.error("Audio playback error for:", audio.src);
      dispatch({ type: "SET_PAUSED" });
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Sync audio src with current track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const track = TRACKS[state.currentTrackIndex];
    const encodedSrc = encodeURI(track.src);
    if (audio.src !== encodedSrc && !audio.src.endsWith(encodeURI(track.src))) {
      audio.src = encodedSrc;
      audio.load();
    }
  }, [state.currentTrackIndex]);

  // ── Actions ──

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // load track on first play if not loaded
    if (!audio.src || audio.src === window.location.origin + "/") {
      const track = TRACKS[state.currentTrackIndex];
      audio.src = encodeURI(track.src);
      audio.load();
    }
    audio.play().catch((err) => {
      console.error("Failed to play:", err);
    });
  }, [state.currentTrackIndex]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused || audio.ended) {
      play();
    } else {
      pause();
    }
  }, [play, pause]);

  const next = useCallback(() => {
    const nextIndex = (state.currentTrackIndex + 1) % TRACKS.length;
    dispatch({ type: "SET_TRACK", index: nextIndex });
    // after dispatch, src effect runs, then we play
    setTimeout(() => {
      audioRef.current?.play().catch(() => {});
    }, 0);
  }, [state.currentTrackIndex]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    // if > 3s in, restart current track
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      dispatch({ type: "SET_TIME", time: 0 });
      return;
    }
    const prevIndex =
      (state.currentTrackIndex - 1 + TRACKS.length) % TRACKS.length;
    dispatch({ type: "SET_TRACK", index: prevIndex });
    setTimeout(() => {
      audioRef.current?.play().catch(() => {});
    }, 0);
  }, [state.currentTrackIndex]);

  const selectTrack = useCallback((index: number) => {
    if (index === state.currentTrackIndex) return;
    dispatch({ type: "SET_TRACK", index });
    setTimeout(() => {
      audioRef.current?.play().catch(() => {});
    }, 0);
  }, [state.currentTrackIndex]);

  const value: MusicContextValue = {
    ...state,
    tracks: TRACKS,
    play,
    pause,
    toggle,
    next,
    prev,
    selectTrack,
  };

  return (
    <MusicContext.Provider value={value}>
      {children}
    </MusicContext.Provider>
  );
}

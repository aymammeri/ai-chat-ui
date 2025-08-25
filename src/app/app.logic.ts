import { AUDIO_CONFIG, AudioCaptureController, StartAudioCaptureOptions, startAudioCapture } from '../audio/audio.utils';
import { AssemblyAIWsController, WsHandlers, connectAssemblyAI } from '../ws/ws.utils';
import type React from 'react';

export type PipelineRefs = {
  levelRef: React.MutableRefObject<number>;
  wsCtrlRef: React.MutableRefObject<AssemblyAIWsController | null>;
  audioCtrlRef: React.MutableRefObject<AudioCaptureController | null>;
  pipelineActiveRef: React.MutableRefObject<boolean>;
};

export type PipelineSetters = {
  setIsConnecting: (v: boolean) => void;
  setIsConnected: (v: boolean) => void;
  setIsRecording: (v: boolean) => void;
  setError: (v: string | undefined) => void;
  setAudioURL: (v: string) => void;
  setTranscripts: (updater: (prev: Array<{ id: string; text: string }>) => Array<{ id: string; text: string }>) => void;
};

export type AppPipeline = {
  connectWs: () => Promise<void>;
  disconnectWs: () => void;
  startAudio: () => Promise<void>;
  stopAudio: () => Promise<void>;
  startPipeline: () => Promise<void>;
  stopPipeline: () => Promise<void>;
};

export function makeAppPipeline(refs: PipelineRefs, setters: PipelineSetters): AppPipeline {
  const connectWs = async () => {
    const { wsCtrlRef } = refs;
    const { setIsConnecting, setIsConnected, setError, setTranscripts } = setters;
    if (wsCtrlRef.current) return;

    setIsConnecting(true);
    setError(undefined);

    try {
      const handlers: WsHandlers = {
        onOpen: () => {
          setIsConnected(true);
          setIsConnecting(false);
        },
        onMessage: (data) => {
          if (typeof data !== 'object' || data === null) return;
          const rec = data as Record<string, unknown>;
          const eotRaw = rec.end_of_turn ?? (rec as Record<string, unknown>).endOfTurn;
          const isEOT = typeof eotRaw === 'boolean' ? eotRaw : false;
          const textRaw = (rec as { text?: unknown; transcript?: unknown; text_response?: unknown }).text ??
            (rec as { transcript?: unknown }).transcript ??
            (rec as { text_response?: unknown }).text_response;
          if (isEOT && typeof textRaw === 'string') {
            const idVal = rec.id;
            const id = typeof idVal === 'string' ? idVal : String(Date.now());
            setTranscripts((prev) => [...prev, { id, text: textRaw }]);
          }
        },
        onError: (msg) => setError(msg),
        onClose: () => {
          setIsConnected(false);
          setIsConnecting(false);
          refs.wsCtrlRef.current = null;
        },
      };

      const effectiveRate =
        refs.audioCtrlRef.current?.getSampleRate?.() ?? AUDIO_CONFIG.SAMPLE_RATE;
      const ctrl = await connectAssemblyAI(effectiveRate, handlers);
      refs.wsCtrlRef.current = ctrl;
    } catch (err) {
      setIsConnecting(false);
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      setError(msg);
    }
  };

  const disconnectWs = () => {
    const { wsCtrlRef } = refs;
    const { setIsConnected, setIsConnecting } = setters;
    if (!wsCtrlRef.current) return;
    try {
      wsCtrlRef.current.disconnect();
    } catch {
      // ignore
    } finally {
      wsCtrlRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
    }
  };

  const startAudio = async () => {
    const { audioCtrlRef, levelRef } = refs;
    const { setAudioURL, setIsRecording } = setters;
    if (audioCtrlRef.current) return;
    setAudioURL('');

    const options: StartAudioCaptureOptions = {
      sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
      constraints: AUDIO_CONFIG.MEDIA_CONSTRAINTS as MediaStreamConstraints,
      onPCM: (pcm) => refs.wsCtrlRef.current?.sendPCM(pcm),
      onLevel: (lvl) => {
        levelRef.current = lvl;
      },
    };

    const ctrl = await startAudioCapture(options);
    audioCtrlRef.current = ctrl;
    setIsRecording(true);
  };

  const stopAudio = async () => {
    const { audioCtrlRef } = refs;
    const { setIsRecording, setAudioURL } = setters;
    if (!audioCtrlRef.current) return;
    try {
      const result = await audioCtrlRef.current.stop();
      if (result.audioURL) setAudioURL(result.audioURL);
    } finally {
      audioCtrlRef.current = null;
      setIsRecording(false);
    }
  };

  const startPipeline = async () => {
    const { pipelineActiveRef } = refs;
    if (pipelineActiveRef.current) return;
    pipelineActiveRef.current = true;
    // Important: start audio (request mic permission, spin up worklet) BEFORE WS connect
    // to ensure we can send audio frames immediately after the socket opens.
    // AssemblyAI may close idle realtime sockets quickly if no audio is received after Begin.
    await startAudio();
    await connectWs();
  };

  const stopPipeline = async () => {
    const { pipelineActiveRef } = refs;
    if (!pipelineActiveRef.current) return;
    pipelineActiveRef.current = false;
    await stopAudio();
    disconnectWs();
  };

  return { connectWs, disconnectWs, startAudio, stopAudio, startPipeline, stopPipeline };
}

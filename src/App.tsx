import './App.css';
import VoiceMode from './components/VoiceMode.tsx';
import { useEffect, useRef, useState } from 'react';
import { ChatMode } from './components/ChatMode..tsx';
import type { AudioCaptureController } from './audio/audio.utils';
import type { AssemblyAIWsController } from './ws/ws.utils';
import { makeAppPipeline } from './app/app.logic';

export default function App() {
  // UI state
  const [isLive, setIsLive] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [transcripts, setTranscripts] = useState<Array<{ id: string; text: string }>>([]);

  // Refs for pipeline
  const levelRef = useRef(0); // for visual animation
  const wsCtrlRef = useRef<AssemblyAIWsController | null>(null);
  const audioCtrlRef = useRef<AudioCaptureController | null>(null);
  const pipelineActiveRef = useRef(false);

  // Build the pipeline helpers outside of render logic
  const pipeline = makeAppPipeline(
    { levelRef, wsCtrlRef, audioCtrlRef, pipelineActiveRef },
    { setIsConnecting, setIsConnected, setIsRecording, setError, setAudioURL, setTranscripts },
  );

  // React to isLive toggle
  useEffect(() => {
    (async () => {
      if (isLive) {
        await pipeline.startPipeline();
      } else {
        await pipeline.stopPipeline();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  return (
    <>
      <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow-md space-y-4">
        <div className="text-center space-x-2">
          <button
            onClick={() => setIsLive((v) => !v)}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              isLive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isLive ? 'Stop Live Mode' : 'Start Live Mode'}
          </button>
        </div>

        <div className="text-xs text-gray-500 text-center">
          <p>Streams audio to AssemblyAI and builds a WAV from the same data for local playback.</p>
        </div>

        <div className="text-sm text-gray-700 text-center">
          Live: {isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'} | Recording:{' '}
          {String(isRecording)}
        </div>
        {error && <div className="text-center text-red-600 text-sm">{error}</div>}
      </div>

      {isLive && <VoiceMode levelRef={levelRef} />}

      {!isLive && <ChatMode />}

      {transcripts.length > 0 && (
        <div className="p-4 space-y-1">
          <h4 className="font-semibold">You said (end-of-turn):</h4>
          {transcripts.map((t) => (
            <div key={t.id}>You: {t.text}</div>
          ))}
        </div>
      )}

      {audioURL && (
        <div className="space-y-2 p-4">
          <audio controls className="w-full">
            <source src={audioURL} type="audio/wav" />
          </audio>
        </div>
      )}
    </>
  );
}

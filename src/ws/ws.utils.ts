import { requestTempAPIKey } from '../api/api';

export type AssemblyAIWsController = {
  ws: WebSocket;
  token: string;
  sendPCM: (pcm: ArrayBuffer) => void;
  disconnect: () => void;
};

const API_ENDPOINT_BASE_URL = 'wss://streaming.assemblyai.com/v3/ws';
const aaiWsUrl = (sampleRate: number, token: string) =>
  `${API_ENDPOINT_BASE_URL}?sample_rate=${sampleRate}&token=${encodeURIComponent(token)}`;

// const toBase64 = (buffer: ArrayBuffer): string => {
//   const bytes = new Uint8Array(buffer);
//   let binary = '';
//   for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
//   return btoa(binary);
// };

export type WsHandlers = {
  onOpen?: () => void;
  onMessage?: (data: unknown) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

export const connectAssemblyAI = async (
  sampleRate: number,
  handlers: WsHandlers = {},
): Promise<AssemblyAIWsController> => {
  const token = await requestTempAPIKey();
  const url = aaiWsUrl(sampleRate, token);
  console.log('ws.connect', url);
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  let ready = false;

  // PCM chunking to satisfy AAI input duration (50..1000 ms per frame)
  const BYTES_PER_SAMPLE = 2; // pcm16, mono
  const MIN_CHUNK_MS = 50;
  const MAX_CHUNK_MS = 1000;
  const minBytes = Math.floor((sampleRate * MIN_CHUNK_MS) / 1000) * BYTES_PER_SAMPLE;
  const maxBytes = Math.floor((sampleRate * MAX_CHUNK_MS) / 1000) * BYTES_PER_SAMPLE;

  const parts: ArrayBuffer[] = [];
  let totalBytes = 0;

  const flush = (force = false) => {
    if (!force && totalBytes < minBytes) return;
    if (totalBytes <= 0) return;

    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const p of parts) {
      out.set(new Uint8Array(p), offset);
      offset += p.byteLength;
    }

    try {
      ws.send(out.buffer); // binary frame
      try {
        const approxMs = Math.round((out.byteLength / (sampleRate * BYTES_PER_SAMPLE)) * 1000);
        console.debug('ws.sent binary bytes=', out.byteLength, 'approx_ms=', approxMs);
      } catch (err) {
        console.debug('ws.sent bytes log error', err);
      }
    } catch (err) {
      console.debug('ws.send error', err);
    } finally {
      parts.length = 0;
      totalBytes = 0;
    }
  };

  ws.onopen = (event) => {
    console.log('ws.onopen', event);
    // v3 accepts audio frames directly; no explicit start message required
    handlers.onOpen?.();
  };

  ws.onmessage = (event) => {
    console.log('ws.onmessage', event.data);
    try {
      const data = JSON.parse(event.data);
      const t = (data as { type?: string })?.type;

      // v3: after "Begin" from server, we can start streaming audio frames
      if (t === 'Begin' || t === 'Ready' || t === 'SessionBegins') {
        ready = true;
      }

      handlers.onMessage?.(data);
    } catch {
      // ignore non-JSON
    }
  };

  ws.onerror = () => handlers.onError?.('WebSocket error');
  ws.onclose = (ev) => {
    ready = false;
    // Clear any buffered audio
    try { parts.length = 0; totalBytes = 0; } catch (err) { console.debug('clear buffer err', err); }
    // Log close details to aid debugging unexpected disconnects
    try {
      console.log('ws.onclose', { code: (ev as CloseEvent).code, reason: (ev as CloseEvent).reason });
    } catch {
      console.log('ws.onclose');
    }
    handlers.onClose?.();
  };

  return {
    ws,
    token,
    sendPCM: (pcm: ArrayBuffer) => {
      if (ws.readyState !== WebSocket.OPEN || !ready) return;
      // Accumulate until at least 50ms; flush when >= minBytes; never exceed 1000ms
      parts.push(pcm);
      totalBytes += pcm.byteLength;

      if (totalBytes >= maxBytes) {
        flush(true);
      } else if (totalBytes >= minBytes) {
        flush(false);
      }
    },
    disconnect: () => {
      console.log('ws.disconnect');
      try {
        if (ws.readyState === WebSocket.OPEN && totalBytes > 0) flush(true);
      } catch (err) {
        console.debug('flush on disconnect err', err);
      }
      try {
        ws.close();
      } catch (e) {
        console.debug('ws.close err', e);
      }
    },
  };
};

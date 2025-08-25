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

const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

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
  const ws = new WebSocket(aaiWsUrl(sampleRate, token));

  ws.onopen = (event) => {
    console.log('ws.onopen', event);
    // No custom protocol messages on open; AssemblyAI expects audio frames directly after connection.
    handlers.onOpen?.();
  };

  ws.onmessage = (event) => {
    console.log('ws.onmessage', event.data);
    try {
      const data = JSON.parse(event.data);
      handlers.onMessage?.(data);
    } catch {
      // ignore non-JSON
    }
  };

  ws.onerror = () => handlers.onError?.('WebSocket error');
  ws.onclose = (ev) => {
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
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        const b64 = toBase64(pcm);
        ws.send(JSON.stringify({ audio_data: b64 }));
      } catch {
        // ignore
      }
    },
    disconnect: () => {
      console.log('ws.disconnect');
      try {
        ws.close();
      } catch {
        // ignore
      }
    },
  };
};

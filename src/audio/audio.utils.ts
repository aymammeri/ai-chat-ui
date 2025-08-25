// audioUtils.ts

/**
 * Convert Float32Array audio data to 16-bit PCM format for Assembly AI
 */
export const convertToAssemblyAIPCM = (audioData: Float32Array): ArrayBuffer => {
  const pcmData = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    pcmData[i] = sample * 32767;
  }
  return pcmData.buffer;
};

/**
 * Create a WAV file blob from collected Float32Array audio buffers
 */
export const createWAVFile = (audioBuffers: Float32Array[], sampleRate: number): Blob => {
  // Calculate total length
  const totalLength = audioBuffers.reduce((acc, buffer) => acc + buffer.length, 0);

  // Combine all buffers
  const combinedBuffer = new Float32Array(totalLength);
  let offset = 0;
  for (const buffer of audioBuffers) {
    combinedBuffer.set(buffer, offset);
    offset += buffer.length;
  }

  // Convert to 16-bit PCM
  const pcmData = new Int16Array(combinedBuffer.length);
  for (let i = 0; i < combinedBuffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, combinedBuffer[i]));
    pcmData[i] = sample * 32767;
  }

  // Create WAV header
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);

  // Write string to buffer
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // WAV header structure
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.length * 2, true);

  // Write PCM data
  const uint8Array = new Uint8Array(buffer);
  const pcmBytes = new Uint8Array(pcmData.buffer);
  uint8Array.set(pcmBytes, 44);

  return new Blob([buffer], { type: 'audio/wav' });
};

/**
 * Create AudioWorklet processor code as a string
 * This will be converted to a blob URL for dynamic loading
 */
export const getAudioWorkletProcessorCode = (): string => {
  return `
        class AssemblyAIProcessor extends AudioWorkletProcessor {
            process(inputs, outputs, parameters) {
                const input = inputs[0];
                
                if (input.length > 0 && input[0]) {
                    const inputData = input[0]; // First channel (mono)
                    
                    // Create a copy of the audio data
                    const audioCopy = new Float32Array(inputData.length);
                    audioCopy.set(inputData);
                    
                    // Send audio data to main thread
                    this.port.postMessage({
                        type: 'audioData',
                        data: audioCopy
                    });
                }
                
                return true; // Keep processor alive
            }
        }
        
        registerProcessor('assembly-ai-processor', AssemblyAIProcessor);
    `;
};

/**
 * Setup AudioWorklet with dynamic processor loading
 */
export const setupAudioWorklet = async (
  audioContext: AudioContext,
  mediaStream: MediaStream,
  onAudioData: (data: Float32Array) => void,
): Promise<AudioWorkletNode> => {
  // Create processor code as blob URL
  const processorCode = getAudioWorkletProcessorCode();
  const blob = new Blob([processorCode], { type: 'application/javascript' });
  const processorURL = URL.createObjectURL(blob);

  try {
    // Load the worklet processor
    await audioContext.audioWorklet.addModule(processorURL);

    // Create worklet node
    const workletNode = new AudioWorkletNode(audioContext, 'assembly-ai-processor');

    // Listen for audio data from worklet
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'audioData') {
        onAudioData(event.data.data);
      }
    };

    // Connect audio source to worklet
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(workletNode);
    // Ensure the worklet is pulled by the graph (keeps process() running)
    try { workletNode.connect(audioContext.destination); } catch { /* ignore */ }

    return workletNode;
  } finally {
    // Clean up blob URL
    URL.revokeObjectURL(processorURL);
  }
};

/**
 * Audio configuration constants
 */
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  MEDIA_CONSTRAINTS: {
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  },
} as const;

// High-level audio capture controller
export type StartAudioCaptureOptions = {
  sampleRate?: number;
  constraints?: MediaStreamConstraints;
  onPCM?: (pcm: ArrayBuffer) => void;
  onLevel?: (level: number) => void;
};

export type AudioCaptureController = {
  stop: () => Promise<{ audioURL?: string }>;
};

export const startAudioCapture = async (
  opts: StartAudioCaptureOptions,
): Promise<AudioCaptureController> => {
  const sampleRate = opts.sampleRate ?? AUDIO_CONFIG.SAMPLE_RATE;
  const constraints = (opts.constraints ?? AUDIO_CONFIG.MEDIA_CONSTRAINTS) as MediaStreamConstraints;

  const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  const w = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = (w.AudioContext ?? w.webkitAudioContext) as typeof AudioContext;
    const audioContext = new AudioContextCtor({ sampleRate });
  try { if (audioContext.state === 'suspended') { await audioContext.resume(); } } catch (err) { console.debug('AudioContext.resume failed', err); }

  const audioBuffers: Float32Array[] = [];

  const handle = (floatData: Float32Array) => {
    // store for WAV
    audioBuffers.push(new Float32Array(floatData));
    // level (RMS)
    let sum = 0;
    for (let i = 0; i < floatData.length; i++) sum += floatData[i] * floatData[i];
    const rms = Math.sqrt(sum / floatData.length);
    const level = Math.max(0, Math.min(1, rms * 8));
    opts.onLevel?.(level);

    // convert to PCM and emit
    const pcm = convertToAssemblyAIPCM(floatData);
    opts.onPCM?.(pcm);
  };

  let workletNode: AudioWorkletNode | null = null;
  try {
    workletNode = await setupAudioWorklet(audioContext, mediaStream, handle);
  } catch (e) {
    console.warn('AudioWorklet setup failed:', e);
  }

  // Return controller with stop logic
  const controller: AudioCaptureController = {
    stop: async () => {
      try {
        if (workletNode) {
          try {
            workletNode.disconnect();
          } catch {
            // ignore
          }
          workletNode = null;
        }
        try {
          if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
          }
        } catch {
          // ignore
        }
        try {
          mediaStream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      } finally {
        // no-op
      }
      // build WAV after cleanup
      let audioURL: string | undefined;
      if (audioBuffers.length > 0) {
        const wavBlob = createWAVFile(audioBuffers, sampleRate);
        audioURL = URL.createObjectURL(wavBlob);
      }
      return { audioURL };
    },
  };

  return controller;
};

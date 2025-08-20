import { useState, useRef } from "react";

const VoiceRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [audioURL, setAudioURL] = useState("");
    const mediaRecorderRef = useRef<null | MediaRecorder>(null);
    const audioChunks = useRef<Blob[]>([]);

    const audioContextRef = useRef<null | AudioContext>(null);
    const processorRef = useRef<null | ScriptProcessorNode>(null);

    // Conversion function
    const convertToAssemblyAI = (audioData: Float32Array) => {
        // Convert Float32Array to 16-bit PCM for Assembly AI
        const pcmData = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            pcmData[i] = sample * 32767;
        }

        // Here you would send pcmData.buffer to Assembly AI
        console.log('PCM data ready for Assembly AI:', pcmData.buffer);
        // Example: sendToAssemblyAI(pcmData.buffer);
    };

    const startRecording = async () => {
        const mediaStreamDevice = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        // Your existing MediaRecorder setup
        mediaRecorderRef.current = new MediaRecorder(mediaStreamDevice);
        mediaRecorderRef.current.ondataavailable = (event) => audioChunks.current.push(event.data);

        mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunks.current, { type: "audio/wav" });
            setAudioURL(URL.createObjectURL(audioBlob));
            audioChunks.current = [];
        };
        mediaRecorderRef.current.start();

        // Add audio processing for Assembly AI
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(mediaStreamDevice);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (event) => {
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            convertToAssemblyAI(inputData);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        audioContextRef.current = audioContext;
        processorRef.current = processor;

        setIsRecording(true);
    };

    const stopRecording = () => {
        if (!mediaRecorderRef.current) return;

        // Your existing stop logic
        mediaRecorderRef.current.stop();

        // Clean up audio processing
        if (processorRef.current) {
            processorRef.current.disconnect();
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }

        setIsRecording(false);
    };

    return (
        <div>
            <button onClick={isRecording ? stopRecording : startRecording}>
                {isRecording ? "Stop Recording" : "Start Recording"}
            </button>
            {audioURL && (
                <audio controls>
                    <source src={audioURL} type="audio/wav" />
                </audio>
            )}
        </div>
    );
};

export default VoiceRecorder;
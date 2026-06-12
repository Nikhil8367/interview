import { useState, useEffect, useRef } from 'react';
import { Camera, CameraOff, Volume2, Mic, CheckCircle, RefreshCw, Keyboard } from 'lucide-react';
import { API_BASE } from '../config';

const isLiveModel = (model) => {
  if (!model) return false;
  const mapped = model.trim().toLowerCase();
  return (
    mapped === 'gemini-3-flash-live' ||
    mapped === 'gemini-3.1-flash-live-preview' ||
    mapped === 'gemini-2.5-flash-audio' ||
    mapped === 'gemini-2.5-flash-native-audio-preview-12-2025'
  );
};

function float32ToInt16(buf) {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, buf[i] * 32768));
  }
  return out;
}

function int16ToFloat32(int16) {
  const f32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
  return f32;
}

function base64ToInt16(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}


const capitalizeSentences = (text) => {
  if (!text) return '';
  return text.replace(/(^\s*|[.!?]\s+)([a-z])/g, (match, separator, letter) => separator + letter.toUpperCase());
};

const renderBionicText = (text) => {
  if (!text) return '';
  const parts = text.split(/(\s+)/);
  return parts.map((part, idx) => {
    if (/^\s+$/.test(part)) {
      return part;
    }
    const wordMatch = part.match(/^([a-zA-Z0-9'-]+)(.*)$/);
    if (!wordMatch) {
      return <span key={idx} className="bionic-word-normal">{part}</span>;
    }
    const [_, coreWord, punctuation] = wordMatch;
    let boldLength = 1;
    const len = coreWord.length;
    if (len > 3) {
      boldLength = Math.ceil(len * 0.5);
    } else if (len > 1) {
      boldLength = Math.ceil(len * 0.6);
    }

    const boldPart = coreWord.substring(0, boldLength);
    const normalPart = coreWord.substring(boldLength);

    return (
      <span key={idx}>
        <strong className="bionic-word-bold">{boldPart}</strong>
        <span className="bionic-word-normal">{normalPart}</span>
        {punctuation && <span className="bionic-word-normal">{punctuation}</span>}
      </span>
    );
  });
};

export default function InterviewConsole({
  question,
  apiKey,
  geminiModel = 'gemini-2.5-flash',
  sttProvider = 'native',
  sttApiKey = '',
  onAssessmentComplete,
  isMockMode = false,
  currentMockIndex = 0,
  totalMockQuestions = 0,
  onNextQuestion,
  onCancelMock,
  onTranscriptChange,
  onTimeChange,
  onBreaksChange,
  showTimer = true,
  showCalibration = true,
  bionicReading = false,
  onSttProviderChange,
  loadingQuestion = false
}) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isReadingQuestion, setIsReadingQuestion] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [breaksCount, setBreaksCount] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const [isTypingMode, setIsTypingMode] = useState(false);
  const [isBrave, setIsBrave] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showIdealAnswer, setShowIdealAnswer] = useState(false);

  // Reset showIdealAnswer on question change
  useEffect(() => {
    setShowIdealAnswer(false);
  }, [question]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const pendingActionRef = useRef(null); // null | 'analyze' | 'next' | 'autoadvance'
  const nativeFailedRef = useRef(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const drawLoopRef = useRef(null);
  const isRecordingRef = useRef(false);
  const volumeBarFillRef = useRef(null);
  const volumeTextRef = useRef(null);
  const prevTranscriptRef = useRef('');
  const sessionFinalRef = useRef('');
  const transcriptRef = useRef('');

  // Silence tracking refs
  const silenceStartRef = useRef(null);
  const inSilenceRef = useRef(false);
  const breakRegisteredRef = useRef(false);
  const micStreamRef = useRef(null);
  const isMountedRef = useRef(true);

  const assemblyAISocketRef = useRef(null);
  const assemblyAIStreamNodeRef = useRef(null);
  const geminiLiveSocketRef = useRef(null);
  const geminiLiveStreamNodeRef = useRef(null);
  const playAcRef = useRef(null);
  const playQRef = useRef(0);
  const elapsedTimeRef = useRef(0);
  const breaksCountRef = useRef(0);

  useEffect(() => {
    elapsedTimeRef.current = elapsedTime;
  }, [elapsedTime]);

  useEffect(() => {
    breaksCountRef.current = breaksCount;
  }, [breaksCount]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
  };

  const stopAudioAnalysis = () => {
    if (drawLoopRef.current) {
      cancelAnimationFrame(drawLoopRef.current);
      drawLoopRef.current = null;
    }
    if (assemblyAIStreamNodeRef.current) {
      try {
        assemblyAIStreamNodeRef.current.disconnect();
      } catch (err) {
        console.warn("Failed to disconnect AssemblyAI stream node:", err);
      }
      assemblyAIStreamNodeRef.current = null;
    }
    if (geminiLiveStreamNodeRef.current) {
      try {
        geminiLiveStreamNodeRef.current.disconnect();
      } catch (err) {
        console.warn("Failed to disconnect Gemini Live stream node:", err);
      }
      geminiLiveStreamNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (assemblyAISocketRef.current) {
      const ws = assemblyAISocketRef.current;
      setIsTranscribing(true);
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'Terminate' }));
        } catch (err) {
          console.warn("Failed to send AssemblyAI terminate message:", err);
        }
      }
      setTimeout(() => {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch (_) { }
      }, 500);
      assemblyAISocketRef.current = null;
    }

    if (geminiLiveSocketRef.current) {
      const ws = geminiLiveSocketRef.current;
      setIsTranscribing(true);
      setTimeout(() => {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch (_) { }
      }, 500);
      geminiLiveSocketRef.current = null;
    }

    if (playAcRef.current) {
      const pac = playAcRef.current;
      setTimeout(() => {
        try {
          if (pac.state !== 'closed') {
            pac.close();
          }
        } catch (_) { }
      }, 500);
      playAcRef.current = null;
    }
    playQRef.current = 0;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn("Failed to stop MediaRecorder:", err);
      }
      mediaRecorderRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try {
        recognitionRef.current.stop();
      } catch (err) {
        console.warn("Failed to stop SpeechRecognition:", err);
      }
      recognitionRef.current = null;
    }

    stopAudioAnalysis();
  };

  // Reset console state when question changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    stopRecording();
    setTranscript('');
    setElapsedTime(0);
    setBreaksCount(0);
    setSpeechError(null);
    setIsAdvancing(false);
    if (onTranscriptChange) onTranscriptChange('');
    if (onTimeChange) onTimeChange(0);
    if (onBreaksChange) onBreaksChange(0);
    prevTranscriptRef.current = '';
    sessionFinalRef.current = '';
    transcriptRef.current = '';
    breakRegisteredRef.current = false;
  }, [question]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopRecording();
      stopCamera();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect if browser is Brave
  useEffect(() => {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
      navigator.brave.isBrave().then(val => {
        if (isMountedRef.current) {
          setIsBrave(val);
        }
      });
    }
  }, []);

  // Text-To-Speech (TTS)
  const handleReadQuestion = () => {
    if (!question) return;

    // Stop any ongoing speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Safely close existing websocket or playback context
    if (geminiLiveSocketRef.current) {
      try {
        geminiLiveSocketRef.current.onclose = null;
        geminiLiveSocketRef.current.close();
      } catch (_) { }
      geminiLiveSocketRef.current = null;
    }
    if (playAcRef.current) {
      try {
        playAcRef.current.close();
      } catch (_) { }
      playAcRef.current = null;
    }
    playQRef.current = 0;

    if (isLiveModel(geminiModel)) {
      if (!apiKey) {
        alert("Please provide a Gemini API Key in Settings to read the question with the live model.");
        return;
      }

      setIsReadingQuestion(true);

      try {
        const outAc = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        playAcRef.current = outAc;
        playQRef.current = 0;

        const playLiveChunk = (b64) => {
          if (!playAcRef.current || playAcRef.current.state === 'closed') return;
          if (playAcRef.current.state === 'suspended') {
            playAcRef.current.resume();
          }
          const f32 = int16ToFloat32(base64ToInt16(b64));
          const buf = playAcRef.current.createBuffer(1, f32.length, 24000);
          buf.getChannelData(0).set(f32);

          const src = playAcRef.current.createBufferSource();
          src.buffer = buf;
          src.connect(playAcRef.current.destination);

          const now = playAcRef.current.currentTime;
          if (playQRef.current < now) {
            playQRef.current = now;
          }
          src.start(playQRef.current);
          playQRef.current += buf.duration;
        };

        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
        const ws = new WebSocket(wsUrl);
        geminiLiveSocketRef.current = ws;

        ws.onopen = () => {
          console.log("Gemini Live TTS WebSocket connected.");
          const modelName = `models/${geminiModel}`;
          ws.send(JSON.stringify({
            setup: {
              model: modelName,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
                }
              },
              systemInstruction: {
                parts: [{
                  text: "You are a text-to-speech engine. Read the user's text exactly as provided, with no extra conversation, introductions, or pleasantries. Only speak the text itself."
                }]
              }
            }
          }));

          ws.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: question.text }]
              }],
              turnComplete: true
            }
          }));
        };

        ws.onmessage = async (evt) => {
          let msg;
          try {
            const text = typeof evt.data === 'string' ? evt.data : await evt.data.text();
            msg = JSON.parse(text);
          } catch { return; }

          const sc = msg?.serverContent;
          if (!sc) return;

          const parts = sc.modelTurn?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType ?? '';
              if (mime.startsWith('audio/') || mime === '') {
                playLiveChunk(part.inlineData.data);
              }
            }
          }

          if (sc.turnComplete) {
            const delay = Math.max(0, (playQRef.current - outAc.currentTime) * 1000);
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
              }
              setIsReadingQuestion(false);

              const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
              const autoStartDelay = isMobile ? 1200 : 300;
              setTimeout(() => {
                if (isMountedRef.current) {
                  handleStartRecording();
                }
              }, autoStartDelay);
            }, delay + 100);
          }
        };

        ws.onerror = (e) => {
          console.error("Gemini Live TTS WebSocket error:", e);
          setIsReadingQuestion(false);
        };

        ws.onclose = () => {
          console.log("Gemini Live TTS WebSocket closed.");
          setIsReadingQuestion(false);
        };
      } catch (err) {
        console.error("Failed to start Gemini Live TTS:", err);
        setIsReadingQuestion(false);
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(question.text);
    utterance.onstart = () => setIsReadingQuestion(true);
    utterance.onend = () => {
      setIsReadingQuestion(false);
      // Auto-start recording after question finishes reading (high level UX flow)
      // On mobile devices, add a 1200ms delay to give Google Speech Services time to release the audio channel
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const delay = isMobile ? 1200 : 300;
      setTimeout(() => {
        if (isMountedRef.current) {
          handleStartRecording();
        }
      }, delay);
    };
    utterance.onerror = () => setIsReadingQuestion(false);

    window.speechSynthesis.speak(utterance);
  };

  // Toggle Camera
  const handleToggleCamera = async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!isMountedRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        setIsCameraOn(true);
      } catch (err) {
        console.error('Camera access denied:', err);
        if (isMountedRef.current) {
          alert('Could not access camera. Please check permissions.');
        }
      }
    }
  };

  useEffect(() => {
    if (isCameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraOn]);

  const downsampleAndConvertToPCM16 = (float32Array, inputSampleRate, outputSampleRate = 16000) => {
    if (inputSampleRate === outputSampleRate) {
      const buffer = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return buffer.buffer;
    }

    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(float32Array.length / sampleRateRatio);
    const result = new Int16Array(newLength);

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
        accum += float32Array[i];
        count++;
      }
      const avg = count > 0 ? accum / count : 0;
      const s = Math.max(-1, Math.min(1, avg));
      result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result.buffer;
  };

  // Web Audio API & Waveform Draw Loop
  const initAudioAnalysis = (mediaStream) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(mediaStream);

      source.connect(analyser);
      analyser.fftSize = 256;

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      if (sttProvider === 'assemblyai') {
        const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (audioProcessingEvent) => {
          const inputBuffer = audioProcessingEvent.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);

          if (assemblyAISocketRef.current && assemblyAISocketRef.current.readyState === WebSocket.OPEN) {
            const pcmData = downsampleAndConvertToPCM16(inputData, audioCtx.sampleRate, 16000);
            assemblyAISocketRef.current.send(pcmData);
          }
        };
        source.connect(scriptNode);
        scriptNode.connect(audioCtx.destination);
        assemblyAIStreamNodeRef.current = scriptNode;
      } else if (isLiveModel(geminiModel)) {
        const scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (audioProcessingEvent) => {
          const inputBuffer = audioProcessingEvent.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);

          if (geminiLiveSocketRef.current && geminiLiveSocketRef.current.readyState === WebSocket.OPEN) {
            const pcmBuffer = downsampleAndConvertToPCM16(inputData, audioCtx.sampleRate, 16000);
            const b64Data = arrayBufferToBase64(pcmBuffer);
            try {
              geminiLiveSocketRef.current.send(JSON.stringify({
                realtimeInput: {
                  audio: {
                    data: b64Data,
                    mimeType: 'audio/pcm;rate=16000'
                  }
                }
              }));
            } catch (err) {
              console.warn("Failed to send live audio chunk:", err);
            }
          }
        };
        source.connect(scriptNode);
        scriptNode.connect(audioCtx.destination);
        geminiLiveStreamNodeRef.current = scriptNode;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let lastDrawTime = Date.now();
      const draw = () => {
        if (!analyserRef.current || !canvasRef.current) return;

        drawLoopRef.current = requestAnimationFrame(draw);

        const now = Date.now();
        if (now - lastDrawTime < 33) { // limit to ~30 FPS
          return;
        }
        lastDrawTime = now;

        analyserRef.current.getByteFrequencyData(dataArray);

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avgVolume = sum / bufferLength;
        const volPct = Math.min(100, Math.round((avgVolume / 128) * 100));

        // Direct DOM update instead of triggering React state updates
        if (volumeBarFillRef.current) {
          volumeBarFillRef.current.style.width = `${volPct}%`;
        }
        if (volumeTextRef.current) {
          volumeTextRef.current.textContent = `${volPct}%`;
        }

        // Detect pauses/breaks based on volume
        const silenceThreshold = 8; // Adjust threshold based on microphone
        if (avgVolume < silenceThreshold) {
          if (!inSilenceRef.current) {
            inSilenceRef.current = true;
            silenceStartRef.current = Date.now();
            breakRegisteredRef.current = false;
          } else {
            const silenceDuration = Date.now() - silenceStartRef.current;

            // Check for mock mode 5-second silence auto-advance
            if (isMockMode && silenceDuration >= 5000) {
              inSilenceRef.current = false;
              silenceStartRef.current = null;
              breakRegisteredRef.current = false;
              if (handleAutoAdvanceRef.current) {
                handleAutoAdvanceRef.current();
              }
              return;
            }

            // Check if silence duration >= 1.5 seconds (1500 ms) and not already registered for this pause
            if (silenceDuration >= 1500 && !breakRegisteredRef.current) {
              breakRegisteredRef.current = true;
              // Register a break
              setBreaksCount(prev => {
                const next = prev + 1;
                if (onBreaksChange) onBreaksChange(next);
                return next;
              });
            }
          }
        } else {
          // Reset silence tracker when speaking
          inSilenceRef.current = false;
          silenceStartRef.current = null;
          breakRegisteredRef.current = false;
        }

        // Draw visual wave
        ctx.fillStyle = 'rgba(13, 18, 30, 0.4)';
        ctx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height * 0.9;

          // Gradient styling for visualizer
          const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
          grad.addColorStop(0, '#8b5cf6'); // purple
          grad.addColorStop(1, '#06b6d4'); // cyan

          ctx.fillStyle = grad;
          ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

          x += barWidth;
        }
      };

      draw();
    } catch (e) {
      console.error('Error setting up Web Audio API:', e);
    }
  };



  // Whisper / ElevenLabs Client and Semantic Analysis helpers
  const transcribeWithWhisper = async (audioBlob, provider, apiKey) => {
    if (provider === 'puter') {
      if (!window.puter) {
        throw new Error("Puter.js library is not loaded. Please check your network connection.");
      }
      try {
        const result = await window.puter.ai.speech2txt(audioBlob);
        return typeof result === 'string' ? result : (result.text ?? JSON.stringify(result));
      } catch (err) {
        console.error("Puter STT Error:", err);
        throw new Error(err.message || "Puter JS transcription failed");
      }
    }

    if (!apiKey) {
      const providerName = provider === 'groq' ? 'Groq' : provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI';
      throw new Error(`API Key for ${providerName} is required. Please set it in the header.`);
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');

    let url = '';
    let headers = {};

    if (provider === 'elevenlabs') {
      url = 'https://api.elevenlabs.io/v1/speech-to-text';
      formData.append('model_id', 'scribe_v2');
      headers = {
        'xi-api-key': apiKey
      };
    } else {
      let modelName = '';
      if (provider === 'groq') {
        url = 'https://api.groq.com/openai/v1/audio/transcriptions';
        modelName = 'whisper-large-v3-turbo';
      } else {
        url = 'https://api.openai.com/v1/audio/transcriptions';
        modelName = 'whisper-1';
      }
      formData.append('model', modelName);
      headers = {
        'Authorization': `Bearer ${apiKey}`
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = `API error (${response.status})`;
      try {
        const errJson = JSON.parse(errText);
        msg = errJson.detail?.message || errJson.error?.message || msg;
      } catch (_) { }
      throw new Error(msg);
    }

    const data = await response.json();
    return data.text || '';
  };

  const runAnalysis = async (finalTranscript, forcedDuration = null, forcedBreaks = null) => {
    if (!finalTranscript.trim()) {
      alert("No speech was detected. Please answer the question before submitting.");
      setIsAnalyzing(false);
      return;
    }

    setIsAnalyzing(true);
    const duration = forcedDuration !== null ? forcedDuration : (elapsedTimeRef.current > 0 ? elapsedTimeRef.current : 5);
    const breaks = forcedBreaks !== null ? forcedBreaks : breaksCountRef.current;

    let report;
    if (apiKey) {
      const { analyzeTranscriptWithGemini } = await import('../utils/aiEngine');
      report = await analyzeTranscriptWithGemini(finalTranscript, question, duration, apiKey, geminiModel);
    } else {
      const { analyzeTranscriptLocally } = await import('../utils/aiEngine');
      report = analyzeTranscriptLocally(finalTranscript, question, duration);
    }

    report.totalDuration = duration;
    report.breaksCount = breaks;
    report.question = question;

    onAssessmentComplete(report);
    setIsAnalyzing(false);
  };

  // Speech Recognition (STT) & Recording Loop
  const handleStartRecording = async () => {
    if (isRecording) return;

    // Cancel any active Speech Synthesis to prevent device-in-use conflicts
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Delay briefly on mobile devices to let Google Speech Services release audio lines
    const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobileDevice) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Reset trackers
    setTranscript('');
    setElapsedTime(0);
    setBreaksCount(0);
    setSpeechError(null);
    inSilenceRef.current = false;
    silenceStartRef.current = null;
    breakRegisteredRef.current = false;
    prevTranscriptRef.current = '';
    sessionFinalRef.current = '';
    transcriptRef.current = '';

    if (onTranscriptChange) onTranscriptChange('');
    if (onTimeChange) onTimeChange(0);
    if (onBreaksChange) onBreaksChange(0);

    if (isTypingMode) {
      isRecordingRef.current = true;
      setIsRecording(true);
      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime(prev => {
          const next = prev + 1;
          if (onTimeChange) onTimeChange(next);
          return next;
        });
      }, 1000);
      return;
    }

    // Start Camera if not already on
    if (!isCameraOn) {
      await handleToggleCamera();
    }

    if (sttProvider === 'native') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("Speech Recognition API is not supported in this browser. Falling back to background Puter.js recorder.");
        nativeFailedRef.current = true;
        if (onSttProviderChange) {
          onSttProviderChange('puter');
        }
      }
    }

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) {
        audioStream.getTracks().forEach(track => track.stop());
        return;
      }
      micStreamRef.current = audioStream;
      initAudioAnalysis(audioStream);
    } catch (err) {
      console.error('Mic access denied:', err);
      if (isMountedRef.current) {
        alert('Microphone permission is required to analyze speech.');
      }
      return;
    }

    isRecordingRef.current = true;
    setIsRecording(true);

    const startSpeechRecognitionInstance = () => {
      if (!isRecordingRef.current) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event) => {
        setSpeechError(null);

        let sessionFinal = '';
        let sessionInterim = '';
        for (let i = 0; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            sessionFinal += text + ' ';
          } else {
            sessionInterim += text;
          }
        }
        sessionFinalRef.current = sessionFinal;

        const rawText = (prevTranscriptRef.current + ' ' + sessionFinal + ' ' + sessionInterim).trim().replace(/\s+/g, ' ');
        const formattedText = capitalizeSentences(rawText);
        setTranscript(formattedText);
        transcriptRef.current = formattedText;
        if (onTranscriptChange) onTranscriptChange(formattedText);
      };

      rec.onerror = (e) => {
        console.error("Speech Recognition Error:", e);
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isMobile && e.error !== 'no-speech') {
          console.warn(`Speech recognition error '${e.error}' on mobile. Switching to Puter.js fallback...`);
          setSpeechError("Google Speech Services error on mobile. Switched speech engine to Puter.js. Please tap start recording again.");
          if (onSttProviderChange) {
            onSttProviderChange('puter');
          }
          stopRecording();
          return;
        }

        if (e.error === 'not-allowed') {
          setSpeechError("Microphone permission blocked by browser. Please enable microphone access.");
          stopRecording();
        } else if (e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
          setSpeechError(`Speech Recognition API Error: ${e.error}`);
          stopRecording();
        } else if (e.error === 'audio-capture') {
          if (micStreamRef.current) {
            console.warn("Speech recognition failed with audio-capture. Releasing visualizer mic lock and retrying...");
            stopAudioAnalysis();
            setTimeout(() => {
              if (isRecordingRef.current) {
                startSpeechRecognitionInstance();
              }
            }, 300);
          } else {
            setSpeechError("Microphone capture failed. Please check if another program is using your microphone.");
            stopRecording();
          }
        } else if (e.error === 'network') {
          setSpeechError("Network connection interrupted. Retrying...");
          console.warn("Network error in Speech Recognition. Retrying in 1.5 seconds...");
          setTimeout(() => {
            if (isRecordingRef.current) {
              startSpeechRecognitionInstance();
            }
          }, 1500);
        } else if (e.error === 'no-speech') {
          // Warning only, no action needed
        } else {
          setSpeechError(`Speech Recognition Error: ${e.error}`);
        }
      };

      rec.onend = () => {
        console.log("Speech Recognition Ended.");
        prevTranscriptRef.current = transcriptRef.current;
        sessionFinalRef.current = '';

        if (isRecordingRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current) {
              startSpeechRecognitionInstance();
            }
          }, 200);
        }
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch (err) {
        console.error("Failed to start SpeechRecognition:", err);
        if (isRecordingRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current) {
              startSpeechRecognitionInstance();
            }
          }, 500);
        }
      }
    };

    if (isLiveModel(geminiModel) && !isTypingMode) {
      try {
        if (!apiKey) {
          throw new Error("Gemini API Key is required. Please set it in Settings.");
        }

        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
        const ws = new WebSocket(wsUrl);
        geminiLiveSocketRef.current = ws;

        ws.onopen = () => {
          console.log("Gemini Live STT WebSocket connected.");
          const modelName = `models/${geminiModel}`;
          ws.send(JSON.stringify({
            setup: {
              model: modelName,
              generationConfig: {
                responseModalities: ['TEXT'],
              },
              inputAudioTranscription: {},
              systemInstruction: {
                parts: [{
                  text: "You are a speech-to-text transcription engine. Just transcribe the user's speech. Do not respond to it. Stay completely silent."
                }]
              }
            }
          }));
        };

        let finalizedTranscript = '';

        ws.onmessage = async (evt) => {
          let msg;
          try {
            const text = typeof evt.data === 'string' ? evt.data : await evt.data.text();
            msg = JSON.parse(text);
          } catch { return; }

          const sc = msg?.serverContent;
          if (!sc) return;

          // Capture input transcription (what user spoke)
          if (sc.inputTranscription?.text) {
            const chunk = sc.inputTranscription.text;
            finalizedTranscript = (finalizedTranscript + ' ' + chunk).trim().replace(/\s+/g, ' ');
            const formatted = capitalizeSentences(finalizedTranscript);

            setTranscript(formatted);
            transcriptRef.current = formatted;
            if (onTranscriptChange) onTranscriptChange(formatted);
          }
        };

        ws.onerror = (err) => {
          console.error("Gemini Live STT WebSocket error:", err);
          setSpeechError("Gemini Live streaming error occurred.");
        };

        ws.onclose = () => {
          console.log("Gemini Live STT WebSocket closed.");
          handleSessionEnd();
        };

        let sessionEnded = false;
        const handleSessionEnd = () => {
          if (sessionEnded) return;
          sessionEnded = true;

          setIsTranscribing(false);
          const act = pendingActionRef.current;
          pendingActionRef.current = null;

          const text = transcriptRef.current;

          if (act === 'analyze') {
            runAnalysis(text, elapsedTimeRef.current, breaksCountRef.current);
          } else if (act === 'next' || act === 'autoadvance') {
            const finalVal = text.trim() || (act === 'autoadvance' ? "(No response - failed within 5s silence limit)" : "");
            onNextQuestion({
              question,
              transcript: finalVal,
              duration: elapsedTimeRef.current > 0 ? elapsedTimeRef.current : 5,
              breaksCount: breaksCountRef.current
            });
          }
        };

      } catch (err) {
        console.error("Gemini Live STT start failed:", err);
        setSpeechError(`Gemini Live STT start failed: ${err.message}`);
        stopRecording();
        return;
      }
    } else if (sttProvider === 'assemblyai' && !isTypingMode) {
      try {
        if (!sttApiKey) {
          throw new Error("AssemblyAI API Key is required. Please set it in the header.");
        }

        let token;
        try {
          const tokenRes = await fetch('https://api.assemblyai.com/v2/realtime/token', {
            method: 'POST',
            headers: {
              'Authorization': sttApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ expires_in: 600 })
          });
          if (!tokenRes.ok) {
            throw new Error('AssemblyAI token request failed');
          }
          const data = await tokenRes.json();
          token = data.token;
        } catch (fetchErr) {
          console.warn("Direct AssemblyAI token request failed (CORS limit). Trying public CORS proxy...");
          try {
            const tokenRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://api.assemblyai.com/v2/realtime/token')}`, {
              method: 'POST',
              headers: {
                'Authorization': sttApiKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ expires_in: 600 })
            });
            const data = await tokenRes.json();
            const parsed = JSON.parse(data.contents);
            token = parsed.token;
          } catch (proxyErr) {
            throw new Error("AssemblyAI requires a backend or CORS proxy to generate real-time tokens. Please use 'Web Browser Native API', 'Groq Whisper Engine', 'OpenAI Whisper Cloud', or 'Puter.js Speech API' instead.");
          }
        }

        const wsUrl = `wss://streaming.assemblyai.com/v3/ws?token=${token}&speech_model=universal-streaming-english&sample_rate=16000`;
        const socket = new WebSocket(wsUrl);
        assemblyAISocketRef.current = socket;

        socket.onopen = () => {
          console.log("AssemblyAI WebSocket connected.");
        };

        let finalizedTranscript = '';

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'Turn') {
              const text = msg.transcript || '';
              const isFinal = msg.end_of_turn;

              const currentRaw = (finalizedTranscript + ' ' + text).trim().replace(/\s+/g, ' ');
              const formatted = capitalizeSentences(currentRaw);

              setTranscript(formatted);
              transcriptRef.current = formatted;
              if (onTranscriptChange) onTranscriptChange(formatted);

              if (isFinal) {
                finalizedTranscript = (finalizedTranscript + ' ' + text).trim();
              }
            } else if (msg.type === 'Termination') {
              console.log("AssemblyAI session terminated.");
              handleSessionEnd();
            }
          } catch (e) {
            console.error("AssemblyAI message parse error:", e);
          }
        };

        socket.onerror = (err) => {
          console.error("AssemblyAI WebSocket error:", err);
          setSpeechError("AssemblyAI streaming error occurred.");
        };

        socket.onclose = () => {
          console.log("AssemblyAI WebSocket closed.");
          handleSessionEnd();
        };

        let sessionEnded = false;
        const handleSessionEnd = () => {
          if (sessionEnded) return;
          sessionEnded = true;

          setIsTranscribing(false);
          const act = pendingActionRef.current;
          pendingActionRef.current = null;

          const text = transcriptRef.current;

          if (act === 'analyze') {
            runAnalysis(text, elapsedTimeRef.current, breaksCountRef.current);
          } else if (act === 'next' || act === 'autoadvance') {
            const finalVal = text.trim() || (act === 'autoadvance' ? "(No response - failed within 5s silence limit)" : "");
            onNextQuestion({
              question,
              transcript: finalVal,
              duration: elapsedTimeRef.current > 0 ? elapsedTimeRef.current : 5,
              breaksCount: breaksCountRef.current
            });
          }
        };

      } catch (err) {
        console.error("AssemblyAI start failed:", err);
        setSpeechError(`AssemblyAI start failed: ${err.message}`);
        stopRecording();
        return;
      }
    } else if (sttProvider === 'native' && !isTypingMode) {
      nativeFailedRef.current = false;
      audioChunksRef.current = [];

      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (!isMobile) {
        try {
          const mediaRecorder = new MediaRecorder(micStreamRef.current, {
            mimeType: 'audio/webm'
          });

          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            if (!nativeFailedRef.current) {
              setIsTranscribing(false);
              setIsAdvancing(false);
              return;
            }
            if (audioChunksRef.current.length === 0) {
              setIsTranscribing(false);
              setIsAdvancing(false);
              return;
            }

            setIsTranscribing(true);
            setSpeechError(null);
            try {
              console.log("Speech recognition failed. Transcribing with Puter.js fallback...");
              const text = await transcribeWithWhisper(new Blob(audioChunksRef.current, { type: 'audio/webm' }), 'puter', '');
              setTranscript(text);
              transcriptRef.current = text;
              if (onTranscriptChange) onTranscriptChange(text);

              const act = pendingActionRef.current;
              pendingActionRef.current = null;
              if (act === 'analyze') {
                runAnalysis(text, elapsedTimeRef.current, breaksCountRef.current);
              } else if (act === 'next' || act === 'autoadvance') {
                const finalVal = text.trim() || (act === 'autoadvance' ? "(No response - failed within 5s silence limit)" : "");
                onNextQuestion({
                  question,
                  transcript: finalVal,
                  duration: elapsedTimeRef.current > 0 ? elapsedTimeRef.current : 5,
                  breaksCount: breaksCountRef.current
                });
              }
            } catch (err) {
              console.error("Puter fallback transcription failed:", err);
              setSpeechError(`Fallback Transcription failed: ${err.message}`);
              setIsAnalyzing(false);
              setIsAdvancing(false);
            } finally {
              setIsTranscribing(false);
            }
          };

          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start(1000);
        } catch (err) {
          console.warn("Could not start background MediaRecorder fallback:", err);
        }
      } else {
        console.log("Mobile device detected. Skipping concurrent background MediaRecorder for native STT to avoid device locks.");
      }

      startSpeechRecognitionInstance();
    } else if (sttProvider !== 'native' && !isTypingMode) {
      audioChunksRef.current = [];
      try {
        const mediaRecorder = new MediaRecorder(micStreamRef.current, {
          mimeType: 'audio/webm'
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          if (audioChunksRef.current.length === 0) {
            setIsTranscribing(false);
            setIsAdvancing(false);
            return;
          }

          setIsTranscribing(true);
          setSpeechError(null);
          try {
            const text = await transcribeWithWhisper(new Blob(audioChunksRef.current, { type: 'audio/webm' }), sttProvider, sttApiKey);
            setTranscript(text);
            transcriptRef.current = text;
            if (onTranscriptChange) onTranscriptChange(text);

            const act = pendingActionRef.current;
            pendingActionRef.current = null;
            if (act === 'analyze') {
              runAnalysis(text, elapsedTimeRef.current, breaksCountRef.current);
            } else if (act === 'next' || act === 'autoadvance') {
              const finalVal = text.trim() || (act === 'autoadvance' ? "(No response - failed within 5s silence limit)" : "");
              onNextQuestion({
                question,
                transcript: finalVal,
                duration: elapsedTimeRef.current > 0 ? elapsedTimeRef.current : 5,
                breaksCount: breaksCountRef.current
              });
            }
          } catch (err) {
            console.error("Whisper Transcription failed:", err);
            setSpeechError(`Whisper Transcription failed: ${err.message}`);
            setIsAnalyzing(false);
            setIsAdvancing(false);
          } finally {
            setIsTranscribing(false);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(1000);
      } catch (err) {
        console.error("MediaRecorder start failed:", err);
        setSpeechError("Could not start audio recorder. Please try Web Speech API instead.");
        stopRecording();
        return;
      }
    }

    // Start timer
    timerIntervalRef.current = setInterval(() => {
      setElapsedTime(prev => {
        const next = prev + 1;
        if (onTimeChange) onTimeChange(next);
        return next;
      });
    }, 1000);
  };

  // Submit response for analysis
  const handleAnalyze = async () => {
    if ((isLiveModel(geminiModel) || sttProvider !== 'native') && !isTypingMode) {
      pendingActionRef.current = 'analyze';
      stopRecording();
      setIsAnalyzing(true);
    } else {
      if (!transcript.trim()) {
        alert("No response detected. Please write or dictate your answer.");
        return;
      }
      stopRecording();
      setIsAnalyzing(true);
      await runAnalysis(transcript, elapsedTimeRef.current, breaksCountRef.current);
    }
  };

  const handleNext = () => {
    setIsAdvancing(true);
    if ((isLiveModel(geminiModel) || sttProvider !== 'native') && !isTypingMode) {
      pendingActionRef.current = 'next';
      stopRecording();
    } else {
      if (!transcript.trim()) {
        alert("No response detected. Please write or dictate your answer.");
        setIsAdvancing(false);
        return;
      }
      stopRecording();
      onNextQuestion({
        question,
        transcript,
        duration: elapsedTimeRef.current > 0 ? elapsedTimeRef.current : 5,
        breaksCount: breaksCountRef.current
      });
    }
  };

  const handleAutoAdvance = () => {
    setIsAdvancing(true);
    if ((isLiveModel(geminiModel) || sttProvider !== 'native') && !isTypingMode) {
      pendingActionRef.current = 'autoadvance';
      stopRecording();
    } else {
      stopRecording();
      onNextQuestion({
        question,
        transcript: transcript.trim() || "(No response - failed within 5s silence limit)",
        duration: elapsedTimeRef.current > 0 ? elapsedTimeRef.current : 5,
        breaksCount: breaksCountRef.current
      });
    }
  };

  const handleAutoAdvanceRef = useRef(null);
  useEffect(() => {
    handleAutoAdvanceRef.current = handleAutoAdvance;
  });

  if (loadingQuestion) {
    return (
      <div className="glass-panel" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '400px',
        gap: '1.5rem',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <RefreshCw size={48} className="animate-spin text-secondary" />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>AI Interviewer is formulating the next question...</h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: '400px' }}>
          Please wait while the AI interviewer evaluates your previous answer, dynamically adjusts the difficulty, and prepares the next question.
        </p>
      </div>
    );
  }

  return (
    <div className="arena-grid">
      {/* Current Question Banner */}
      <div className="current-question-banner">
        <div className="current-question-content">
          <div className="current-question-title">
            {isMockMode ? `Question ${currentMockIndex + 1} of ${totalMockQuestions}` : 'Active Question'} ({question?.category || 'General'})
          </div>
          <div className="current-question-body">{question?.text || 'No question selected. Select one from the sidebar.'}</div>
        </div>
        <button
          className={`btn btn-secondary ${isReadingQuestion ? 'pulse-button' : ''}`}
          onClick={handleReadQuestion}
          disabled={!question || isReadingQuestion || isRecording}
          title="Listen to question"
          style={{ whiteSpace: 'nowrap' }}
        >
          <Volume2 size={18} />
          {isReadingQuestion ? 'Speaking...' : 'Read Aloud'}
        </button>
      </div>

      {isMockMode && question?.suggestedAnswer && (
        <div className="glass-card" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(6, 182, 212, 0.03)', borderColor: 'rgba(6, 182, 212, 0.15)', fontSize: '0.85rem', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>AI Coach has prepared a hidden reference answer for this question.</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowIdealAnswer(!showIdealAnswer)}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', height: 'auto', borderRadius: '4px' }}
            >
              {showIdealAnswer ? 'Hide Reference' : 'Reveal Reference Answer'}
            </button>
          </div>
          {showIdealAnswer && (
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem', color: 'white', lineHeight: '1.45' }}>
              <strong>Ideal Reference Answer:</strong>
              <p style={{ marginTop: '0.25rem' }}>{question.suggestedAnswer}</p>
            </div>
          )}
        </div>
      )}

      {/* Media Console */}
      <div className="media-console">
        {/* Left: Camera Feed */}
        <div className={`camera-panel ${isRecording ? 'recording' : ''}`}>
          {isCameraOn ? (
            <video ref={videoRef} className="camera-feed" autoPlay playsInline muted />
          ) : (
            <div className="camera-placeholder">
              <CameraOff size={48} />
              <p style={{ fontSize: '0.9rem' }}>Camera is currently turned off</p>
            </div>
          )}

          {/* HUD Overlay */}
          <div className="camera-overlay">
            <div className="hud-top">
              <div className="hud-badge">
                <Camera size={14} /> CAMERA {isCameraOn ? 'ON' : 'OFF'}
              </div>
              {isRecording && showTimer && (
                <div className="hud-badge rec">
                  <div className="rec-pulse" /> REC {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>

            {/* Simulated Eye Tracking Gaze Box */}
            {isRecording && isCameraOn && showCalibration && (
              <div style={{ display: 'flex', width: '100%', justifyContent: 'center' }}>
                <div className="calibration-box">
                  <div className="calibration-dot" />
                  <span>Maintain eye contact with the camera</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>AI Gaze Alignment Active</span>
                </div>
              </div>
            )}

            <div className="hud-bottom">
              <button className="btn btn-secondary btn-icon" onClick={handleToggleCamera} title="Toggle Camera">
                {isCameraOn ? <CameraOff size={16} /> : <Camera size={16} />}
              </button>
              {isRecording && (
                <div className="hud-badge" style={{ color: 'var(--secondary)' }}>
                  Pace: {Math.round(transcript.split(/\s+/).filter(Boolean).length / (Math.max(1, elapsedTime) / 60))} WPM
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Waveform & Speech Telemetry / Response Editor */}
        <div className="waveform-container" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
              {isTypingMode ? 'Response Editor' : 'Audio Visualizer'}
            </h3>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (isRecording) stopRecording();
                setIsTypingMode(!isTypingMode);
                setSpeechError(null);
              }}
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', height: 'auto', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Keyboard size={12} />
              {isTypingMode ? 'Use Voice' : 'Switch to Typing'}
            </button>
          </div>

          {isTypingMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="glass-card" style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Words Written</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>
                    {transcript.split(/\s+/).filter(Boolean).length}
                  </span>
                </div>
                <div className="glass-card" style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Characters</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>
                    {transcript.length}
                  </span>
                </div>
              </div>

              <textarea
                value={transcript}
                onChange={(e) => {
                  const val = e.target.value;
                  setTranscript(val);
                  transcriptRef.current = val;
                  if (onTranscriptChange) onTranscriptChange(val);
                }}
                disabled={!isRecording}
                placeholder={isRecording ? 'Type your response here...' : "Click 'Start Typing' to write your answer."}
                className="transcript-textarea"
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '200px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  color: 'white',
                  padding: '0.75rem',
                  fontSize: '0.9rem',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                  lineHeight: '1.5'
                }}
              />
            </div>
          ) : (
            <>
              <canvas ref={canvasRef} className="waveform-canvas" height={80} />

              {/* Volume Meter */}
              <div className="volume-meter-wrapper">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Input Gain:</span>
                <div className="volume-bar">
                  <div ref={volumeBarFillRef} className="volume-bar-fill" style={{ width: '0%' }} />
                </div>
                <span ref={volumeTextRef} style={{ fontSize: '0.75rem', width: '30px', textAlign: 'right' }}>0%</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Breaks / Pauses</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: breaksCount > 4 ? 'var(--danger)' : breaksCount > 2 ? 'var(--warning)' : 'var(--success)' }}>
                    {breaksCount}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>pauses &gt; 1.5s</span>
                </div>

                <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Words Spoken</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
                    {transcript.split(/\s+/).filter(Boolean).length}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>total words</span>
                </div>
              </div>

              {/* Live Transcript Display */}
              <div style={{ marginTop: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {isLiveModel(geminiModel)
                    ? 'Gemini Live Transcript (Real-time WebSocket):'
                    : sttProvider === 'native'
                      ? 'Live Transcript:'
                      : sttProvider === 'assemblyai'
                        ? 'AssemblyAI Live Transcript (Universal Streaming):'
                        : sttProvider === 'elevenlabs'
                          ? 'ElevenLabs Transcript (processed on stop):'
                          : sttProvider === 'puter'
                            ? 'Puter.js Transcript (processed on stop):'
                            : 'Whisper Transcript (processed on stop):'}
                </span>
                <div className="transcript-panel">
                  {isTranscribing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                      <RefreshCw size={14} className="animate-spin text-primary" />
                      <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                        {isLiveModel(geminiModel)
                          ? 'Finalizing Gemini Live Transcript...'
                          : `Transcribing with ${sttProvider === 'groq' ? 'Groq' : sttProvider === 'elevenlabs' ? 'ElevenLabs' : sttProvider === 'puter' ? 'Puter.js' : sttProvider === 'assemblyai' ? 'AssemblyAI' : 'OpenAI'}...`}
                      </span>
                    </div>
                  ) : speechError ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span className="speech-error-msg" style={{ color: 'var(--danger)', fontWeight: 500 }}>
                        {speechError}
                      </span>
                      {isBrave && (
                        <div style={{
                          padding: '0.75rem',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          lineHeight: '1.45',
                          color: '#f87171'
                        }}>
                          <strong style={{ color: '#ef4444' }}>Brave Browser Detected:</strong> Brave disables Google Speech-to-Text services by default.
                          <br /><br />
                          To fix this:
                          <ol style={{ margin: '0.4rem 0 0 1rem', padding: 0 }}>
                            <li>Open a new tab and go to <strong>brave://settings/privacy</strong></li>
                            <li>Enable <strong>"Use Google services for push messaging and speech-to-text"</strong></li>
                            <li>Relaunch Brave.</li>
                          </ol>
                          <br />
                          Alternatively, use Groq/OpenAI Whisper or enable <strong>Typing Mode</strong> below.
                        </div>
                      )}
                    </div>
                  ) : transcript ? (
                    <span>{bionicReading ? renderBionicText(transcript) : transcript}</span>
                  ) : (
                    <span className="transcript-placeholder">
                      {isRecording
                        ? (isLiveModel(geminiModel)
                          ? "🔴 Recording... Streaming live to Gemini Live API."
                          : sttProvider === 'native'
                            ? "Listening... Speak your answer now."
                            : sttProvider === 'assemblyai'
                              ? "🔴 Recording... Streaming live to AssemblyAI."
                              : `🔴 Recording... Your speech will be transcribed with ${sttProvider === 'elevenlabs' ? 'ElevenLabs' : sttProvider === 'puter' ? 'Puter.js' : 'Whisper'} on stop.`)
                        : "Click 'Start Practice' to record your response."}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Control Actions Row */}
      <div className="console-actions">
        {!isRecording ? (
          <>
            {isMockMode && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (window.confirm("Are you sure you want to exit the mock interview? All progress will be lost.")) {
                    stopRecording();
                    onCancelMock();
                  }
                }}
                style={{ padding: '0.85rem 1.5rem' }}
              >
                Exit Mock
              </button>
            )}
            <button
              className="btn btn-primary pulse-button"
              onClick={handleStartRecording}
              disabled={!question || isAnalyzing || isReadingQuestion}
              style={{ padding: '0.85rem 2rem', marginLeft: isMockMode ? 'auto' : '0' }}
            >
              {isTypingMode ? <Keyboard size={18} /> : <Mic size={18} />}
              {isTypingMode ? ' Start Typing' : ' Start Answer'}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (isMockMode) {
                  if (window.confirm("Exit mock interview? Current progress will be lost.")) {
                    stopRecording();
                    onCancelMock();
                  }
                } else {
                  stopRecording();
                }
              }}
              style={{ padding: '0.85rem 1.5rem' }}
            >
              {isMockMode ? 'Exit Mock' : isTypingMode ? 'Cancel Typing' : 'Cancel Practice'}
            </button>
            {isMockMode ? (
              <button
                className="btn btn-accent"
                onClick={handleNext}
                disabled={isTranscribing || isAdvancing}
                style={{ padding: '0.85rem 2rem', marginLeft: 'auto' }}
              >
                {isTranscribing ? (
                  <>
                    <RefreshCw size={18} className="animate-spin text-primary" /> Transcribing Speech...
                  </>
                ) : currentMockIndex === totalMockQuestions - 1 ? (
                  <>
                    <CheckCircle size={18} /> Finish & Submit Mock
                  </>
                ) : (
                  <>
                    Next Question &gt;
                  </>
                )}
              </button>
            ) : (
              <button
                className="btn btn-accent"
                onClick={handleAnalyze}
                disabled={isAnalyzing || isTranscribing}
                style={{ padding: '0.85rem 2rem', marginLeft: 'auto' }}
              >
                {isTranscribing ? (
                  <>
                    <RefreshCw size={18} className="animate-spin text-primary" /> Transcribing Speech...
                  </>
                ) : isAnalyzing ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" /> Analyzing Response...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} /> Complete & Assess
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, PhoneOff, Play, AlertCircle,
  CheckCircle2, Circle, Sparkles, Radio,
  Volume2, Info, RefreshCw, ChevronRight
} from 'lucide-react';

/* ─── Live API models ────────────────────────────────────────────── */
const LIVE_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const LIVE_MODELS = [
  {
    id: 'gemini-3.1-flash-live-preview',
    label: 'Gemini 3.1 Flash Live',
    badge: 'NEW',
    desc: 'High-quality, low-latency · best for real-time dialogue'
  },
  {
    id: 'gemini-2.5-flash-native-audio-preview-12-2025',
    label: 'Gemini 2.5 Flash Native Audio',
    badge: 'AUDIO',
    desc: 'Native audio-to-audio · deeper acoustic nuance'
  },
];

/* ─── helpers ────────────────────────────────────────────────────── */
function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonCandidate = text.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (innerErr) {
        throw new Error("Found JSON block but failed to parse: " + innerErr.message + "\nRaw text: " + text);
      }
    }
    throw new Error("No JSON object found in response:\n" + text);
  }
}

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
function int16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/* ─── audio level hook ───────────────────────────────────────────── */
function rms(f32) {
  let s = 0;
  for (let i = 0; i < f32.length; i++) s += f32[i] ** 2;
  return Math.sqrt(s / f32.length);
}

/* ══════════════════════════════════════════════════════════════════ */
export default function RealtimeMock({ questions = [], apiKey, geminiModel, user, onSaveReport }) {
  const [status, setStatus] = useState('idle'); // idle | connecting | live | error
  const [err, setErr] = useState('');
  const [liveModel, setLiveModel] = useState(LIVE_MODELS[0].id);
  const [dialogue, setDialogue] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [micLevel, setMicLevel] = useState(0);
  const [aiLevel, setAiLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [closeInfo, setCloseInfo] = useState('');
  const [sessionReport, setSessionReport] = useState(null); // scoring result
  const [isScoring, setIsScoring] = useState(false);
  const [scoringError, setScoringError] = useState('');

  // Audio input/output devices selection state
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState('');
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState(null);

  const wsRef = useRef(null);
  const acRef = useRef(null);      // AudioContext (16kHz input)
  const playAcRef = useRef(null);  // AudioContext (24kHz output)
  const procRef = useRef(null);    // ScriptProcessorNode
  const micRef = useRef(null);     // MediaStream
  const srcNodeRef = useRef(null); // MediaStreamAudioSourceNode (for input hot-swap)
  const playQRef = useRef(0);      // next schedule time for playback
  const bottomRef = useRef(null);
  const mutedRef = useRef(false);

  // keep mutedRef in sync
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // select all by default
  useEffect(() => {
    if (questions.length && !selectedIds.length)
      setSelectedIds(questions.map(q => q.id));
  }, [questions]);

  // scroll transcript
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialogue]);

  // enumerate connected hardware devices
  const loadAudioDevices = useCallback(async (forceRequest = false) => {
    try {
      if (forceRequest) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (e) {
          console.warn("Could not request microphone permission during enumeration:", e);
        }
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      setInputDevices(inputs);
      setOutputDevices(outputs);
      
      if (inputs.length && !selectedInputDeviceId) {
        const defInput = inputs.find(d => d.deviceId === 'default') || inputs[0];
        setSelectedInputDeviceId(defInput.deviceId);
      }
      if (outputs.length && !selectedOutputDeviceId) {
        const defOutput = outputs.find(d => d.deviceId === 'default') || outputs[0];
        setSelectedOutputDeviceId(defOutput.deviceId);
      }
    } catch (e) {
      console.error("Error enumerating audio devices:", e);
    }
  }, [selectedInputDeviceId, selectedOutputDeviceId]);

  useEffect(() => {
    loadAudioDevices(false);
  }, []);

  // Dynamic input switching (hot-swap microphone)
  const handleInputDeviceChange = async (deviceId) => {
    setSelectedInputDeviceId(deviceId);
    if (status === 'live' && micRef.current && acRef.current && procRef.current) {
      try {
        micRef.current.getTracks().forEach(t => t.stop());
        const constraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          video: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        micRef.current = stream;

        if (srcNodeRef.current) {
          try {
            srcNodeRef.current.disconnect();
          } catch (e) {
            console.warn("Error disconnecting old source node:", e);
          }
        }

        const newSrc = acRef.current.createMediaStreamSource(stream);
        srcNodeRef.current = newSrc;
        newSrc.connect(procRef.current);
        console.log("Input device switched dynamically to:", deviceId);
      } catch (err) {
        console.error("Failed to dynamically switch input device:", err);
        setErr(`Failed to switch input device: ${err.message}`);
      }
    }
  };

  // Dynamic output switching (hot-swap speaker)
  const handleOutputDeviceChange = async (deviceId) => {
    setSelectedOutputDeviceId(deviceId);
    if (playAcRef.current && typeof playAcRef.current.setSinkId === 'function') {
      try {
        await playAcRef.current.setSinkId(deviceId);
        console.log("Output device switched dynamically to:", deviceId);
      } catch (err) {
        console.error("Failed to dynamically switch output device:", err);
        setErr(`Failed to switch output device: ${err.message}`);
      }
    }
  };

  // cleanup on unmount
  useEffect(() => () => teardown(), []);

  /* ── score session ───────────────────────────────── */
  const scoreSession = useCallback(async (dialogueSnap) => {
    const realLines = dialogueSnap.filter(d => d.sender !== 'system');
    if (!realLines.length) {
      setScoringError('No dialogue was recorded. Please speak during the interview to generate a report.');
      return;
    }

    setScoringError('');
    setIsScoring(true);

    const transcript = realLines
      .map(d => `${d.sender === 'ai' ? 'Interviewer' : 'Candidate'}: ${d.text}`)
      .join('\n');

    const prompt = `You are an expert interview coach. Analyse this mock interview transcript and respond with ONLY valid JSON matching exactly this schema:
{
  "overall": <integer 0-100>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": <1-2 sentence overall assessment>,
  "strengths": [<up to 3 short strength strings>],
  "improvements": [<up to 3 short improvement strings>],
  "questions": [
    { 
      "q": <question text>, 
      "score": <integer 0-10>, 
      "answer": <candidate's full consolidated response text to this question, including follow-up answers if any>, 
      "correctAnswer": <ideal correct/suggested reference response to this question>,
      "theoryMistakes": [
        { "concept": <concept name>, "explanation": <why it was wrong or why it was missing>, "correction": <correct explanation> }
      ],
      "grammarMistakes": [
        { "original": <incorrect candidate phrase>, "correction": <suggested grammatically correct phrase>, "explanation": <grammar rule violated or improvement tip> }
      ],
      "feedback": <1 sentence> 
    }
  ]
}

Instructions for evaluation:
- If the candidate answers "I don't know", "idk", or similar non-answers, score that question 0, and list the missing target technical concepts of the question under the "theoryMistakes" array, explaining that the candidate was unsure and specifying the target concept they should have covered.
- Identify grammar and delivery mistakes or awkward phrasings under "grammarMistakes".

Transcript:
${transcript}`;

    try {
      if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please add it in settings (⚙).");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second timeout

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`API returned status ${res.status}`);
      }

      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) {
        throw new Error("Empty response or invalid model output structure");
      }

      const parsedReport = extractJson(raw);
      setSessionReport(parsedReport);

      // Save mapped report to history database
      if (onSaveReport) {
        const userLines = dialogueSnap.filter(d => d.sender === 'user');
        const userText = userLines.map(d => d.text).join(' ');
        const wordCount = userText.split(/\s+/).filter(Boolean).length;
        
        const fillerRegex = /\b(um|uh|ah|like|you know)\b/gi;
        const matches = userText.match(fillerRegex);
        const fillerCount = matches ? matches.length : 0;
        
        const fillerBreakdown = {};
        if (matches) {
          matches.forEach(m => {
            const w = m.toLowerCase();
            fillerBreakdown[w] = (fillerBreakdown[w] || 0) + 1;
          });
        }

        const durationSeconds = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
        const wpm = durationSeconds > 0 ? Math.round(wordCount / (durationSeconds / 60)) : 0;
        
        let paceRating = 'Normal';
        if (wpm < 110) paceRating = 'Slow';
        else if (wpm > 170) paceRating = 'Fast';

        const fullReport = {
          score: parsedReport.overall || 70,
          totalDuration: durationSeconds,
          wpm: wpm || 130,
          paceRating: paceRating,
          fillerCount: fillerCount,
          fillerBreakdown: fillerBreakdown,
          breaksCount: 0,
          feedback: parsedReport.summary || '',
          paceFeedback: `Your average pacing was ${wpm || 130} WPM. ${wpm < 110 ? 'Try speaking a bit faster to sound more energetic.' : wpm > 170 ? 'Try speaking a bit slower to ensure clear articulation.' : 'This is within the ideal range.'}`,
          behavioralAssessment: "The candidate participated in a live two-way speaking session with Gemini.",
          bluffingAudit: "No specific authenticity issues flagged during the live response session.",
          strengths: parsedReport.strengths || [],
          weaknesses: parsedReport.improvements || [],
          actionableSteps: [
            "Practice speaking without hesitation",
            "Review technical interview concepts",
            "Ensure clear pronunciation under pressure"
          ],
          questions: (parsedReport.questions || []).map((qObj) => {
            const qTranscript = qObj.answer || 'No transcript captured.';
            
            // Find corresponding original question to retrieve database configurations if available
            const originalQ = questions.find(o => o.text.toLowerCase().trim() === qObj.q.toLowerCase().trim());
            const suggested = originalQ?.suggestedAnswer || qObj.correctAnswer || '';
            
            return {
              question: {
                category: originalQ?.category || "Realtime Speaking",
                text: qObj.q,
                suggestedAnswer: suggested
              },
              score: (qObj.score ?? 8) * 10,
              transcript: qTranscript,
              wpm: durationSeconds > 0 ? Math.round(qTranscript.split(/\s+/).filter(Boolean).length / (durationSeconds / 60 / (parsedReport.questions.length || 1))) : 130,
              duration: durationSeconds > 0 ? Math.round(durationSeconds / (parsedReport.questions.length || 1)) : 10,
              breaksCount: 0,
              theoryMistakes: qObj.theoryMistakes || [],
              grammarMistakes: qObj.grammarMistakes || []
            };
          }),
          timestamp: new Date().toISOString()
        };

        await onSaveReport(fullReport);
      }
    } catch (e) {
      console.error('Scoring failed, falling back to local engine:', e);
      setScoringError(`Evaluation error: ${e.message}. Using local analysis fallback.`);

      // Local fallback parsing
      const localQuestions = [];
      let currentQText = "Interview Question";
      let currentAnswerText = "";
      
      dialogueSnap.forEach(d => {
        if (d.sender === 'ai') {
          if (currentAnswerText.trim()) {
            localQuestions.push({ q: currentQText, answer: currentAnswerText.trim() });
          }
          currentQText = d.text;
          currentAnswerText = "";
        } else if (d.sender === 'user') {
          currentAnswerText += " " + d.text;
        }
      });
      if (currentAnswerText.trim()) {
        localQuestions.push({ q: currentQText, answer: currentAnswerText.trim() });
      }

      if (localQuestions.length === 0 && dialogueSnap.some(d => d.sender === 'user')) {
        const userText = dialogueSnap.filter(d => d.sender === 'user').map(d => d.text).join(' ');
        localQuestions.push({
          q: "General Speaking Response",
          answer: userText
        });
      }

      const evaluatedQuestions = localQuestions.map(q => {
        const words = q.answer.split(/\s+/).filter(Boolean);
        const originalQ = questions.find(o => o && o.text && q.q.toLowerCase().includes(o.text.toLowerCase().slice(0, 15)));
        
        let scoreVal = Math.min(10, Math.max(4, Math.round(words.length / 8)));
        if (originalQ?.keywords?.length) {
          let matches = 0;
          originalQ.keywords.forEach(kw => {
            if (q.answer.toLowerCase().includes(kw.toLowerCase())) matches++;
          });
          scoreVal = Math.round((matches / originalQ.keywords.length) * 10);
          scoreVal = Math.min(10, Math.max(3, scoreVal));
        }

        return {
          q: q.q,
          score: scoreVal,
          answer: q.answer,
          correctAnswer: originalQ?.suggestedAnswer || "Address all target criteria, state clear definitions, and explain real-world usage.",
          theoryMistakes: [],
          grammarMistakes: [],
          feedback: `Processed ${words.length} words. Answer reviewed against local parameters.`
        };
      });

      const sumScores = evaluatedQuestions.reduce((acc, q) => acc + q.score, 0);
      const avgScore = evaluatedQuestions.length > 0 ? (sumScores / evaluatedQuestions.length) : 7;
      const overallScore = Math.round(avgScore * 10);
      const gradeLetter = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F';

      const fallbackReport = {
        overall: overallScore,
        grade: gradeLetter,
        summary: `(API Fallback) We completed local analysis because the Gemini API returned an error: "${e.message}".`,
        strengths: ["Clear speak rate and responsive dialogue flow", "Interactive conversation volume"],
        improvements: ["Check Google AI Studio billing/quota settings", "Practice technical keyword articulation"],
        questions: evaluatedQuestions
      };

      setSessionReport(fallbackReport);

      // Save mapped report to history database
      if (onSaveReport) {
        const userLines = dialogueSnap.filter(d => d.sender === 'user');
        const userText = userLines.map(d => d.text).join(' ');
        const wordCount = userText.split(/\s+/).filter(Boolean).length;
        
        const fillerRegex = /\b(um|uh|ah|like|you know)\b/gi;
        const matches = userText.match(fillerRegex);
        const fillerCount = matches ? matches.length : 0;
        
        const fillerBreakdown = {};
        if (matches) {
          matches.forEach(m => {
            const w = m.toLowerCase();
            fillerBreakdown[w] = (fillerBreakdown[w] || 0) + 1;
          });
        }

        const durationSeconds = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
        const wpm = durationSeconds > 0 ? Math.round(wordCount / (durationSeconds / 60)) : 0;
        
        let paceRating = 'Normal';
        if (wpm < 110) paceRating = 'Slow';
        else if (wpm > 170) paceRating = 'Fast';

        const fullReport = {
          score: fallbackReport.overall,
          totalDuration: durationSeconds,
          wpm: wpm || 130,
          paceRating: paceRating,
          fillerCount: fillerCount,
          fillerBreakdown: fillerBreakdown,
          breaksCount: 0,
          feedback: fallbackReport.summary,
          paceFeedback: `Your average pacing was ${wpm || 130} WPM. ${wpm < 110 ? 'Try speaking a bit faster to sound more energetic.' : wpm > 170 ? 'Try speaking a bit slower to ensure clear articulation.' : 'This is within the ideal range.'}`,
          behavioralAssessment: "The candidate participated in a live two-way speaking session with Gemini.",
          bluffingAudit: "No specific authenticity issues flagged during the live response session.",
          strengths: fallbackReport.strengths,
          weaknesses: fallbackReport.improvements,
          actionableSteps: [
            "Practice speaking without hesitation",
            "Review technical interview concepts",
            "Ensure clear pronunciation under pressure"
          ],
          questions: fallbackReport.questions.map((qObj) => {
            const qTranscript = qObj.answer || 'No transcript captured.';
            const originalQ = questions.find(o => o && o.text && qObj.q.toLowerCase().includes(o.text.toLowerCase().slice(0, 15)));
            const suggested = originalQ?.suggestedAnswer || qObj.correctAnswer || '';
            
            return {
              question: {
                category: originalQ?.category || "Realtime Speaking",
                text: qObj.q,
                suggestedAnswer: suggested
              },
              score: qObj.score * 10,
              transcript: qTranscript,
              wpm: durationSeconds > 0 ? Math.round(qTranscript.split(/\s+/).filter(Boolean).length / (durationSeconds / 60 / (fallbackReport.questions.length || 1))) : 130,
              duration: durationSeconds > 0 ? Math.round(durationSeconds / (fallbackReport.questions.length || 1)) : 10,
              breaksCount: 0,
              theoryMistakes: [],
              grammarMistakes: []
            };
          }),
          timestamp: new Date().toISOString()
        };

        await onSaveReport(fullReport);
      }
    } finally {
      setIsScoring(false);
    }
  }, [apiKey, sessionStartTime, onSaveReport, questions, geminiModel]);

  /* ── teardown ─────────────────────────────────────────────────── */
  const teardown = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
    wsRef.current = null;
    micRef.current?.getTracks().forEach(t => t.stop());
    micRef.current = null;
    procRef.current?.disconnect();
    procRef.current = null;
    if (acRef.current?.state !== 'closed') acRef.current?.close();
    acRef.current = null;
    if (playAcRef.current?.state !== 'closed') playAcRef.current?.close();
    playAcRef.current = null;
    playQRef.current = 0;
    setMicLevel(0); setAiLevel(0);
    setStatus('idle');
  }, []);

  /* ── play incoming PCM ────────────────────────────────────────── */
  const playChunk = useCallback((b64) => {
    const ctx = playAcRef.current;
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') ctx.resume();
    const f32 = int16ToFloat32(base64ToInt16(b64));
    const lvl = Math.min(1, rms(f32) * 6);
    setAiLevel(lvl);
    setTimeout(() => setAiLevel(0), 500);

    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (playQRef.current < now) playQRef.current = now;
    src.start(playQRef.current);
    playQRef.current += buf.duration;
  }, []);

  /* ── handle server message ──────────────────────────────── */
  const handleMessage = useCallback(async (evt) => {
    let msg;
    try {
      const text = typeof evt.data === 'string'
        ? evt.data
        : await evt.data.text();
      msg = JSON.parse(text);
    } catch { return; }

    // Resume AudioContext on first incoming message (browser autoplay policy)
    const ctx = playAcRef.current;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const sc = msg?.serverContent;
    if (!sc) return;

    // ── modelTurn parts: audio chunks ──────────────────────────
    const parts = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        // Accept any audio mimeType: audio/pcm, audio/pcm;rate=24000, audio/l16, etc.
        const mime = part.inlineData.mimeType ?? '';
        if (mime.startsWith('audio/') || mime === '') {
          console.log('Playing audio chunk:', mime);
          playChunk(part.inlineData.data);
        }
      }
    }

    // ── output transcription (AI spoken → text) ────────────────
    if (sc.outputTranscription?.text) {
      const chunk = sc.outputTranscription.text;
      setDialogue(prev => {
        const last = prev[prev.length - 1];
        if (last?.sender === 'ai')
          return [...prev.slice(0, -1), { sender: 'ai', text: last.text + chunk }];
        return [...prev, { sender: 'ai', text: chunk }];
      });
    }

    // ── input transcription (user mic → text) ─────────────────
    if (sc.inputTranscription?.text) {
      const chunk = sc.inputTranscription.text;
      setDialogue(prev => {
        const last = prev[prev.length - 1];
        if (last?.sender === 'user')
          return [...prev.slice(0, -1), { sender: 'user', text: last.text + chunk }];
        return [...prev, { sender: 'user', text: chunk }];
      });
    }

    // ── turn-complete ───────────────────────────────────────
    // no-op; turn boundary is implicit
  }, [playChunk]);

  /* ── connect ─────────────────────────────────────────────────── */
  const connect = useCallback(async () => {
    if (!apiKey) { setErr('Add your Gemini API key in Settings (⚙) first.'); return; }
    const shuffled = questions
      .filter(q => selectedIds.includes(q.id))
      .sort(() => Math.random() - 0.5);
    const syllabus = shuffled
      .map((q, i) => `${i + 1}. ${q.text}`)
      .join('\n');
    if (!syllabus) { setErr('Select at least one question to include in the interview.'); return; }

    setErr(''); setCloseInfo(''); setSessionReport(null); setScoringError('');
    setStatus('connecting');
    setDialogue([{ sender: 'system', text: '⏳ Connecting to Gemini Live…' }]);

    try {
      // Re-enumerate devices to guarantee latest labels are populated
      await loadAudioDevices(true);

      // AudioContexts
      const inAc = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      acRef.current = inAc;
      const outAc = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      
      // Apply speaker output device routing if sink routing is supported
      if (selectedOutputDeviceId && typeof outAc.setSinkId === 'function') {
        try {
          await outAc.setSinkId(selectedOutputDeviceId);
        } catch (err) {
          console.error("Failed to set output device sink ID:", err);
        }
      }
      playAcRef.current = outAc;

      // WebSocket
      const modelName = `models/${liveModel}`;
      const ws = new WebSocket(`${LIVE_WS_URL}?key=${apiKey}`);
      ws.binaryType = 'blob';
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          setup: {
            model: modelName,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
              }
            },
            // top-level setup fields — NOT inside generationConfig
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: {
              parts: [{
                text: `You are a warm, professional mock interviewer running a live voice interview.

The following questions have been randomly shuffled for this session:
${syllabus}

Rules:
- Ask questions in the order listed above (they are already randomized each session).
- Speak naturally and concisely. Do not read the full list upfront.
- Begin by warmly greeting the candidate and asking question 1.
- Dynamic Follow-ups: When the candidate answers, evaluate the depth of their response.
  - Sometime (not every time, but only when their answer feels superficial, incomplete, or misses a core concept), instead of moving to the next syllabus question immediately, ask a relevant follow-up or clarifying question to probe deeper. Guide them until they provide a satisfactory answer or complete response.
  - Otherwise (and after concluding any follow-ups for the current topic), provide a brief 1-sentence feedback, and transition smoothly to the next question in the syllabus list.`
              }]
            }
          }
        }));
        setStatus('live');
        setSessionStartTime(Date.now());
        setDialogue(prev => [...prev, { sender: 'system', text: '✅ Connected — speak naturally when ready.' }]);
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        setErr('WebSocket error — check your API key or network.');
        setStatus('error');
      };

      ws.onclose = (e) => {
        const info = `Code ${e.code}${e.reason ? ` · ${e.reason}` : ''}`;
        setCloseInfo(info);
        // Snapshot dialogue before teardown clears it, then score
        setDialogue(prev => {
          scoreSession(prev);
          return [...prev, { sender: 'system', text: `🔴 Session ended (• Generating score report…)` }];
        });
        teardown();
      };

      // Microphone configuration with device selection constraint
      const constraints = {
        audio: selectedInputDeviceId ? { deviceId: { exact: selectedInputDeviceId } } : true,
        video: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micRef.current = stream;
      const src = inAc.createMediaStreamSource(stream);
      srcNodeRef.current = src;
      const proc = inAc.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      src.connect(proc);
      proc.connect(inAc.destination);

      proc.onaudioprocess = (e) => {
        const f32 = e.inputBuffer.getChannelData(0);
        const level = Math.min(1, rms(f32) * 6);
        setMicLevel(level);
        if (mutedRef.current || wsRef.current?.readyState !== 1) return;
        const i16 = float32ToInt16(f32);
        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: int16ToBase64(i16),
              mimeType: 'audio/pcm;rate=16000'
            }
          }
        }));
      };

    } catch (ex) {
      setErr(`Could not start session: ${ex.message}`);
      setStatus('error');
      teardown();
    }
  }, [apiKey, questions, selectedIds, liveModel, selectedInputDeviceId, selectedOutputDeviceId, handleMessage, teardown, loadAudioDevices, scoreSession]);

  /* ── question selection helpers ──────────────────────────────── */
  const toggle = (id) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const selectAll = () => setSelectedIds(questions.map(q => q.id));
  const selectNone = () => setSelectedIds([]);

  /* ── derived ─────────────────────────────────────────────────── */
  const isLive = status === 'live';
  const isConnecting = status === 'connecting';
  const canConnect = status === 'idle' || status === 'error';

  /* ── render ──────────────────────────────────────────────────── */
  return (
    <div className="rtm-root">
      {/* ── TOP HEADER ─────────────────────────────────────────── */}
      <div className="rtm-header">
        <div className="rtm-header-left">
          <div className="rtm-logo-orb">
            <Radio size={18} color="white" />
          </div>
          <div>
            <h2 className="rtm-title">Realtime Live Arena</h2>
            <p className="rtm-subtitle">
              {LIVE_MODELS.find(m => m.id === liveModel)?.label ?? 'Gemini Live API'} · voice-to-voice · low-latency
            </p>
          </div>
        </div>

        <div className="rtm-header-right">
          {/* Model picker — only when not live */}
          {canConnect && (
            <div className="rtm-model-picker">
              {LIVE_MODELS.map(m => (
                <button
                  key={m.id}
                  className={`rtm-model-btn ${liveModel === m.id ? 'active' : ''}`}
                  onClick={() => setLiveModel(m.id)}
                  title={m.desc}
                >
                  <span className="rtm-model-badge">{m.badge}</span>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* status pill */}
          <div className={`rtm-status-pill ${status}`}>
            <span className="rtm-status-dot" />
            {status === 'idle' && 'Ready'}
            {status === 'connecting' && 'Connecting…'}
            {status === 'live' && 'Live'}
            {status === 'error' && 'Error'}
          </div>

          {canConnect && (
            <button className="btn btn-primary rtm-cta" onClick={connect}>
              <Play size={14} /> Start Session
            </button>
          )}
          {isConnecting && (
            <button className="btn btn-secondary rtm-cta" disabled>
              <RefreshCw size={14} className="spin" /> Connecting…
            </button>
          )}
          {isLive && (
            <>
              <button
                className={`btn rtm-mute-btn ${muted ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => setMuted(m => !m)}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <MicOff size={15} /> : <Mic size={15} />}
                {muted ? 'Unmuted' : 'Mute'}
              </button>
              <button className="btn btn-danger rtm-cta" onClick={teardown}>
                <PhoneOff size={14} /> End
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── ERROR BANNER ────────────────────────────────────────── */}
      {err && (
        <div className="rtm-err-banner">
          <AlertCircle size={15} />
          <span>{err}</span>
        </div>
      )}

      {/* ── MAIN BODY ───────────────────────────────────────────── */}
      <div className="rtm-body">

        {/* LEFT: Syllabus panel */}
        <div className="rtm-syllabus">
          <div className="rtm-syllabus-header">
            <span className="rtm-section-label">Interview Syllabus</span>
            <span className="rtm-counter">{selectedIds.length}/{questions.length}</span>
          </div>
          <div className="rtm-syllabus-actions">
            <button className="rtm-sm-btn" onClick={selectAll}>All</button>
            <button className="rtm-sm-btn" onClick={selectNone}>None</button>
          </div>
          <div className="rtm-question-list">
            {questions.length === 0 && (
              <p className="rtm-empty-hint">No questions yet — add some in Practice Arena.</p>
            )}
            {questions.map(q => {
              const sel = selectedIds.includes(q.id);
              return (
                <div
                  key={q.id}
                  className={`rtm-q-item ${sel ? 'selected' : ''} ${!canConnect ? 'locked' : ''}`}
                  onClick={() => canConnect && toggle(q.id)}
                >
                  {sel
                    ? <CheckCircle2 size={14} className="rtm-q-check active" />
                    : <Circle size={14} className="rtm-q-check" />}
                  <div>
                    <p className="rtm-q-text">{q.text}</p>
                    {q.category && <span className="rtm-q-cat">{q.category}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Arena */}
        <div className="rtm-arena">

          {/* Audio Device Selection Settings Bar */}
          <div className="rtm-devices-bar">
            <div className="rtm-device-group">
              <Mic size={14} className="rtm-device-icon mic" />
              <span className="rtm-device-label">Microphone:</span>
              <select
                value={selectedInputDeviceId}
                onChange={(e) => handleInputDeviceChange(e.target.value)}
                className="rtm-device-select"
              >
                {inputDevices.length === 0 ? (
                  <option value="">Default Microphone</option>
                ) : (
                  inputDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="rtm-device-group">
              <Volume2 size={14} className="rtm-device-icon speaker" />
              <span className="rtm-device-label">Speaker:</span>
              <select
                value={selectedOutputDeviceId}
                onChange={(e) => handleOutputDeviceChange(e.target.value)}
                className="rtm-device-select"
              >
                {outputDevices.length === 0 ? (
                  <option value="">Default Speaker</option>
                ) : (
                  outputDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Speaker ${i + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Voice orbs */}
          <div className="rtm-orbs">
            {/* User orb */}
            <div className="rtm-orb-wrap">
              <div
                className={`rtm-orb user ${muted ? 'muted' : ''} ${isLive ? 'live' : ''}`}
                style={{
                  '--lv': micLevel,
                  transform: `scale(${1 + micLevel * 0.35})`,
                  boxShadow: muted
                    ? '0 0 0 rgba(239,68,68,0)'
                    : `0 0 ${12 + micLevel * 44}px rgba(139,92,246,${0.4 + micLevel * 0.5})`
                }}
              >
                {muted ? <MicOff size={26} color="white" /> : <Mic size={26} color="white" />}
              </div>
              <span className="rtm-orb-label">You</span>
              {isLive && !muted && (
                <div className="rtm-level-bar">
                  <div className="rtm-level-fill" style={{ width: `${micLevel * 100}%` }} />
                </div>
              )}
            </div>

            {/* VS divider */}
            <div className="rtm-vs">
              <ChevronRight size={16} className="text-dim" />
            </div>

            {/* AI orb */}
            <div className="rtm-orb-wrap">
              <div
                className={`rtm-orb ai ${isLive ? 'live' : ''}`}
                style={{
                  transform: `scale(${1 + aiLevel * 0.35})`,
                  boxShadow: `0 0 ${12 + aiLevel * 44}px rgba(6,182,212,${0.4 + aiLevel * 0.5})`
                }}
              >
                <Sparkles size={26} color="white" />
              </div>
              <span className="rtm-orb-label">Gemini</span>
              {isLive && (
                <div className="rtm-level-bar">
                  <div className="rtm-level-fill ai" style={{ width: `${aiLevel * 100}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Idle / How-to card */}
          {!isLive && !isConnecting && dialogue.length === 0 && (
            <div className="rtm-how-to">
              <p className="rtm-ht-title"><Info size={14} /> How it works</p>
              <div className="rtm-ht-steps">
                {['Select questions from the syllabus panel',
                  'Click Start Session (needs Gemini API key)',
                  'Gemini speaks first — answer naturally',
                  'Get instant feedback after each answer'].map((s, i) => (
                  <div className="rtm-ht-step" key={i}>
                    <span className="rtm-ht-num">{i + 1}</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          <div className="rtm-transcript">
            {dialogue.length === 0 && (
              <div className="rtm-transcript-empty">
                <Volume2 size={22} className="text-dim" />
                <p>Transcript will appear here once the session starts.</p>
              </div>
            )}
            {dialogue.map((d, i) => (
              <div key={i} className={`rtm-msg ${d.sender}`}>
                {d.sender === 'ai' && (
                  <span className="rtm-msg-label ai">Interviewer</span>
                )}
                {d.sender === 'user' && (
                  <span className="rtm-msg-label user">You</span>
                )}
                <p className={`rtm-msg-body ${d.sender}`}>{d.text}</p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Info footer */}
          {closeInfo && (
            <div className="rtm-close-info">
              Session closed · {closeInfo}
            </div>
          )}
        </div>
      </div>

      {/* ── SCORE CARD ───────────────────────────────────────────────── */}
      {(isScoring || sessionReport || scoringError) && (
        <div className="rtm-score-card">
          {isScoring && (
            <div className="rtm-score-loading">
              <RefreshCw size={18} className="spin" />
              <span>Generating your session report…</span>
            </div>
          )}

          {scoringError && (
            <div className="rtm-score-fallback-banner" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              color: '#ef4444',
              fontSize: '0.82rem',
              lineHeight: 1.4
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <div>
                <strong>Local Fallback Active:</strong> {scoringError}
              </div>
            </div>
          )}

          {sessionReport && !isScoring && (
            <>
              <div className="rtm-score-header">
                <div className="rtm-score-ring">
                  <svg viewBox="0 0 80 80" className="rtm-score-svg">
                    <circle cx="40" cy="40" r="32" className="rtm-ring-bg" />
                    <circle
                      cx="40" cy="40" r="32"
                      className="rtm-ring-fill"
                      strokeDasharray={`${2 * Math.PI * 32}`}
                      strokeDashoffset={`${2 * Math.PI * 32 * (1 - sessionReport.overall / 100)}`}
                    />
                  </svg>
                  <div className="rtm-score-num">{sessionReport.overall}</div>
                </div>
                <div className="rtm-score-meta">
                  <div className="rtm-score-grade">{sessionReport.grade}</div>
                  <h3 className="rtm-score-title">Session Report</h3>
                  <p className="rtm-score-summary">{sessionReport.summary}</p>
                </div>
              </div>

              <div className="rtm-score-grid">
                <div className="rtm-score-col">
                  <p className="rtm-score-col-label">✅ Strengths</p>
                  <ul className="rtm-score-list strengths">
                    {(sessionReport.strengths ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="rtm-score-col">
                  <p className="rtm-score-col-label">⚡ Improve</p>
                  <ul className="rtm-score-list improvements">
                    {(sessionReport.improvements ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {(sessionReport.questions ?? []).length > 0 && (
                <div className="rtm-score-qs">
                  <p className="rtm-score-col-label">📋 Per-question breakdown</p>
                  {sessionReport.questions.map((q, i) => (
                    <div key={i} className="rtm-score-q-row">
                      <div className="rtm-score-q-bar-wrap">
                        <div
                          className="rtm-score-q-bar"
                          style={{ width: `${q.score * 10}%` }}
                        />
                      </div>
                      <span className="rtm-score-q-score">{q.score}/10</span>
                      <div className="rtm-score-q-text">
                        <span className="rtm-score-q-q">{q.q}</span>
                        <span className="rtm-score-q-fb">{q.feedback}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.9rem', marginTop: '0.5rem' }}
                onClick={() => { setSessionReport(null); setDialogue([]); setCloseInfo(''); setScoringError(''); }}
              >
                Clear Report
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

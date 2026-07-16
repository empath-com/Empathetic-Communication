// PCM-compatible real-time microphone audio stream using AudioContext for Nova Sonic

import { getSocket } from "./socket";

const ts = () => new Date().toLocaleTimeString();

let audioContext;  // mic capture context (16 kHz)
let processor;
let input;
let globalStream;
let voiceStarted = false;
let analyser;
let dataArray;
let animationId;
let voiceStartedListener = null;
let novaStartedListener = null;

// Shared playback AudioContext — created once during a user gesture so Chrome's
// autoplay policy never suspends it when we later call source.start() in a timer.
let playbackCtx = null;
let workletNode = null;        // AudioWorkletNode running pcm-playback-processor
let workletInitPromise = null; // single-flight init guard

// ─── Called from StudentChat during the voice-toggle click (user gesture) ─────
export function initPlaybackContext() {
  if (!playbackCtx || playbackCtx.state === "closed") {
    playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    console.log("🔊 Created new playback AudioContext", {
      state: playbackCtx.state,
      sampleRate: playbackCtx.sampleRate,
      outputChannels: playbackCtx.destination?.maxChannelCount,
    });
  }
  if (playbackCtx.state === "suspended") {
    console.log("⏸️  AudioContext suspended, attempting resume...");
    playbackCtx.resume().then(() => {
      console.log("✅ AudioContext resumed successfully", { state: playbackCtx.state });
    }).catch((e) => {
      console.error("❌ Failed to resume AudioContext:", e);
    });
  } else {
    console.log("✅ AudioContext already running", { state: playbackCtx.state });
  }
  // Eagerly initialise the worklet while we're in the user-gesture stack frame,
  // so the AudioContext is unlocked before the first audio chunk arrives.
  _ensureWorkletReady().catch((e) => console.error("❌ Worklet pre-init failed:", e));
}

async function _ensureWorkletReady() {
  if (workletInitPromise) return workletInitPromise;

  workletInitPromise = (async () => {
    if (!playbackCtx || playbackCtx.state === "closed") {
      playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtx.state === "suspended") {
      await playbackCtx.resume();
    }

    await playbackCtx.audioWorklet.addModule("/pcm-playback-processor.js");

    workletNode = new AudioWorkletNode(playbackCtx, "pcm-playback-processor");

    // Wire: workletNode → analyser → destination
    analyser = playbackCtx.createAnalyser();
    analyser.fftSize = 2048;
    dataArray = new Uint8Array(analyser.fftSize);

    workletNode.connect(analyser);
    analyser.connect(playbackCtx.destination);

    workletNode.port.onmessage = ({ data }) => {
      if (data.type === "ended") {
        console.log(`[${ts()}] ⏹️  Worklet: audio buffer drained`);
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
    };

    console.log("✅ PCM playback worklet ready", { sampleRate: playbackCtx.sampleRate });
  })();

  return workletInitPromise;
}

export async function startSpokenLLM(
  voice_id = "matthew",
  setLoading,
  session_id,
  options = {}
) {
  if (voiceStarted) {
    console.warn("🔁 Voice session is already started.");
    return;
  }

  const socket = await getSocket();

  // Remove only listeners registered by this module.
  if (voiceStartedListener) {
    socket.off("voice-started", voiceStartedListener);
    voiceStartedListener = null;
  }
  if (novaStartedListener) {
    socket.off("nova-started", novaStartedListener);
    novaStartedListener = null;
  }

  const onVoiceStarted = () => {
    if (voiceStarted) return;
    console.log(`[${ts()}] ✅ Voice backend ready!`);
    voiceStarted = true;

    setTimeout(async () => {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

      try {
        await audioContext.audioWorklet.addModule("/pcm-processor.js");
      } catch (err) {
        console.error("🎤 Failed to load AudioWorklet module:", err);
        setLoading(false);
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          globalStream = stream;
          input = audioContext.createMediaStreamSource(stream);
          processor = new AudioWorkletNode(audioContext, "pcm-processor");

          processor.port.onmessage = (e) => {
            const pcmData = e.data; // Uint8Array
            // Process in 4 KB slices so apply() never exceeds the call-stack limit,
            // while still being ~8x faster than the previous character-by-character loop.
            const SLICE = 4096;
            let binary = "";
            for (let i = 0; i < pcmData.length; i += SLICE) {
              binary += String.fromCharCode.apply(null, pcmData.subarray(i, i + SLICE));
            }
            socket.emit("audio-input", { data: btoa(binary) });
          };

          input.connect(processor);
          processor.connect(audioContext.destination);
          setLoading(false);
          console.log(`[${ts()}] 🎤 Microphone connected and streaming`);
        })
        .catch((err) => {
          setLoading(false);
          console.error("🎤 Microphone access denied:", err);
        });
    }, 200);
  };
  voiceStartedListener = onVoiceStarted;
  novaStartedListener = onVoiceStarted;
  socket.once("voice-started", voiceStartedListener);
  // Backward-compatible fallback while older server/client pairs may still emit this event.
  socket.once("nova-started", novaStartedListener);

  if (!socket.connected) {
    socket.connect();
  }

  const {
    patient_name = "",
    patient_prompt = "",
    patient_id = "",
    llm_completion = false,
    system_prompt = "",
  } = options || {};

  console.log("🚀 Requesting voice startup with patient context");
  socket.emit("start-voice-session", {
    voice_id,
    session_id: session_id || "default",
    patient_name,
    patient_prompt,
    patient_id,
    llm_completion: !!llm_completion,
    system_prompt,
  });
}

export async function stopSpokenLLM(waitForResponse = true) {
  console.log(`[${ts()}] 🛑 Stopping voice stream...`);

  // Reset immediately so a re-enable attempt doesn't hit the guard in startSpokenLLM
  // and get stuck with a forever-spinning loader. Context cleanup is guarded below.
  voiceStarted = false;

  const socket = await getSocket();

  if (processor) {
    try { processor.disconnect(); } catch (e) { console.error("❌", e); }
    processor = null;
  }

  if (input) {
    try { input.disconnect(); } catch (e) { console.error("❌", e); }
    input = null;
  }

  // Stop mic tracks immediately so the browser mic indicator turns off now,
  // not after the 60-second waitForResponse timeout.
  if (globalStream) {
    try { globalStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
    globalStream = null;
  }

  if (audioContext) {
    try { audioContext.close(); } catch (e) { /* noop */ }
    audioContext = null;
  }

  console.log(`[${ts()}] Sending end-audio to trigger AI response...`);
  // Mark the start of this voice turn for TTFA measurement.
  markVoiceTurnStart();
  socket.emit("end-audio");

  if (waitForResponse) {
    await new Promise((resolve) => {
      let resolved = false;
      let receivedResponse = false;
      let responseTimer = null;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          socket.off("audio-chunk", onAudioChunk);
          socket.off("text-message", onTextMessage);
          if (responseTimer) clearTimeout(responseTimer);
          resolve();
        }
      };

      const onAudioChunk = () => {
        receivedResponse = true;
        if (responseTimer) clearTimeout(responseTimer);
        // 7 s after the last chunk is enough for any TTS response to finish playing.
        responseTimer = setTimeout(cleanup, 7000);
      };

      const onTextMessage = (data) => {
        console.log("received text response:", data.text?.substring(0, 50));
        receivedResponse = true;
        if (responseTimer) clearTimeout(responseTimer);
        responseTimer = setTimeout(cleanup, 1000);
      };

      socket.on("audio-chunk", onAudioChunk);
      socket.on("text-message", onTextMessage);

      setTimeout(() => {
        if (!receivedResponse) console.warn("⚠️ No response within 60 seconds");
        cleanup();
      }, 60000);
    });
  }

  // Only tear down the playback context if the user hasn't already re-enabled voice.
  // If voiceStarted is true here, a new session started while we were waiting —
  // leave its worklet/playbackCtx alone.
  if (!voiceStarted) {
    if (playbackCtx && playbackCtx.state !== "closed") {
      try { playbackCtx.close(); } catch (e) { /* noop */ }
      playbackCtx = null;
    }
    workletNode = null;
    workletInitPromise = null;

    if (voiceStartedListener) {
      socket.off("voice-started", voiceStartedListener);
      voiceStartedListener = null;
    }
    if (novaStartedListener) {
      socket.off("nova-started", novaStartedListener);
      novaStartedListener = null;
    }
  }

  console.log(`[${ts()}] 🛑 Stopped PCM voice stream`);
}

export function stopAudioPlayback() {
  try {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (workletNode) {
      workletNode.port.postMessage({ type: "stop" });
    }

    console.log(`[${ts()}] 🔇 Audio playback stopped`);
  } catch (e) {
    console.error("❌ Failed to stop audio playback:", e);
  }
}

// Module-level TTFA tracking — reset each turn.
let _turnStartMs = 0;  // set when the user stops speaking
let _ttfaLogged = false;

export function markVoiceTurnStart() {
  _turnStartMs = Date.now();
  _ttfaLogged = false;
}

export async function playAudio(audioBytes) {
  try {
    if (!audioBytes || audioBytes.length === 0) {
      console.error("🔊 Empty audio data received");
      return;
    }

    // Log time-to-first-audio (TTFA) on the first chunk of each turn.
    if (_turnStartMs && !_ttfaLogged) {
      _ttfaLogged = true;
      const ttfaMs = Date.now() - _turnStartMs;
      console.log(`[${ts()}] ⏱️  TTFA: ${ttfaMs} ms (spoken-input to first audio chunk)`);
    }

    // Decode base64 → raw bytes → Int16Array (little-endian 16-bit PCM).
    const byteChars = atob(audioBytes);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);

    // Ensure the buffer is aligned to 16-bit sample boundaries.
    const alignedLength = byteArray.length & ~1;
    const samples = new Int16Array(byteArray.buffer, 0, alignedLength / 2);

    console.log(`[${ts()}] 🔊 Sending PCM to worklet`, {
      bytes: alignedLength,
      samples: samples.length,
    });

    await _ensureWorkletReady();

    // Transfer ownership of the ArrayBuffer to the worklet thread (zero-copy).
    workletNode.port.postMessage({ type: "chunk", samples }, [samples.buffer]);

    if (!animationId) {
      startWaveformVisualizer(analyser.fftSize);
    }
  } catch (error) {
    console.error("❌ Audio processing failed:", error);
  }
}

function startWaveformVisualizer(bufferLength) {
  const canvas = document.getElementById("audio-visualizer");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const baseRadius = Math.min(cx, cy) * 0.6;
  const smoothed = new Float32Array(bufferLength).fill(baseRadius);

  function draw() {
    animationId = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.beginPath();

    const step = 8;
    const avgRange = 4;
    const amplitude = 140;
    const smoothing = 0.1;

    for (let i = 0; i < bufferLength; i += step) {
      let sum = 0, count = 0;
      for (let j = i - avgRange; j <= i + avgRange; j++) {
        if (j >= 0 && j < bufferLength) { sum += dataArray[j]; count++; }
      }
      const v = (sum / count) / 255;
      const targetR = baseRadius + (v - 0.5) * amplitude * 2;
      smoothed[i] += (targetR - smoothed[i]) * smoothing;

      const angle = (i / bufferLength) * Math.PI * 2;
      const x = cx + smoothed[i] * Math.cos(angle);
      const y = cy + smoothed[i] * Math.sin(angle);

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(0, 255, 180, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 255, 180, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  draw();
}

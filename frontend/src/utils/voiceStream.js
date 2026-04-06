// PCM-compatible real-time microphone audio stream using AudioContext for Nova Sonic

import { getSocket } from "./socket";

let audioContext;  // mic capture context (16 kHz)
let processor;
let input;
let globalStream;
let novaStarted = false;
let analyser;
let dataArray;
let animationId;

// Shared playback AudioContext — created once during a user gesture so Chrome's
// autoplay policy never suspends it when we later call source.start() in a timer.
let playbackCtx = null;
let currentSource = null; // AudioBufferSourceNode currently playing

// ─── Called from StudentChat during the voice-toggle click (user gesture) ─────
export function initPlaybackContext() {
  if (!playbackCtx || playbackCtx.state === "closed") {
    playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume immediately while we're inside the user-gesture stack frame.
  if (playbackCtx.state === "suspended") {
    playbackCtx.resume().catch(() => {});
  }
}

export async function startSpokenLLM(
  voice_id = "matthew",
  setLoading,
  session_id,
  options = {}
) {
  if (novaStarted) {
    console.warn("🔁 Nova Sonic is already started.");
    return;
  }

  const socket = await getSocket();

  // Clean up any existing listeners to prevent duplicates
  socket.off("nova-started");

  socket.once("nova-started", () => {
    if (novaStarted) return;
    console.log("✅ Nova backend ready!");
    novaStarted = true;

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
            let binary = "";
            for (let i = 0; i < pcmData.length; i++) {
              binary += String.fromCharCode(pcmData[i]);
            }
            const base64 = btoa(binary);
            socket.emit("audio-input", { data: base64 });
          };

          input.connect(processor);
          processor.connect(audioContext.destination);
          setLoading(false);
          console.log("🎤 Microphone connected and streaming");
        })
        .catch((err) => {
          setLoading(false);
          console.error("🎤 Microphone access denied:", err);
        });
    }, 200);
  });

  if (!socket.connected) {
    socket.connect();
  }

  const {
    patient_name = "",
    patient_prompt = "",
    llm_completion = false,
    system_prompt = "",
  } = options || {};

  console.log("🚀 Requesting Nova Sonic startup with patient context");
  socket.emit("start-nova-sonic", {
    voice_id,
    session_id: session_id || "default",
    patient_name,
    patient_prompt,
    llm_completion: !!llm_completion,
    system_prompt,
  });
}

export async function stopSpokenLLM(waitForResponse = true) {
  console.log("🛑 Stopping Nova Sonic voice stream...");

  const socket = await getSocket();

  if (processor) {
    try { processor.disconnect(); } catch (e) { console.error("❌", e); }
    processor = null;
  }

  if (input) {
    try { input.disconnect(); } catch (e) { console.error("❌", e); }
    input = null;
  }

  console.log("Sending end-audio to trigger AI response...");
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
        responseTimer = setTimeout(() => {
          if (!isPlaying && audioBuffer.length === 0) cleanup();
        }, 7000);
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
        if (!receivedResponse) console.warn("⚠️ No response within 10 seconds");
        cleanup();
      }, 10000);
    });
  }

  if (globalStream) {
    try { globalStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    globalStream = null;
  }

  if (audioContext) {
    try { audioContext.close(); } catch (e) {}
    audioContext = null;
  }

  // Close the shared playback context so it's freshly created next session
  if (playbackCtx && playbackCtx.state !== "closed") {
    try { playbackCtx.close(); } catch (e) {}
    playbackCtx = null;
  }

  socket.off("nova-started");
  novaStarted = false;
  console.log("🛑 Stopped PCM voice stream");
}

export function stopAudioPlayback() {
  try {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (currentSource) {
      try { currentSource.stop(); } catch (e) {}
      currentSource = null;
    }

    isPlaying = false;
    audioBuffer = [];
    console.log("🔇 Audio playback stopped");
  } catch (e) {
    console.error("❌ Failed to stop audio playback:", e);
  }
}

// ─── Audio buffer ──────────────────────────────────────────────────────────────
let audioBuffer = [];
let isPlaying = false;
let bufferTimeout = null;

export function playAudio(audioBytes) {
  try {
    if (!audioBytes || audioBytes.length === 0) {
      console.error("🔊 Empty audio data received");
      return;
    }

    audioBuffer.push(audioBytes);
    console.log("🔊 Buffered chunk", audioBuffer.length);

    if (bufferTimeout) clearTimeout(bufferTimeout);

    if (!isPlaying) {
      bufferTimeout = setTimeout(playBufferedAudio, 300);
      if (audioBuffer.length >= 5) {
        clearTimeout(bufferTimeout);
        playBufferedAudio();
      }
    }
  } catch (error) {
    console.error("🔊 Audio processing failed:", error);
  }
}

async function playBufferedAudio() {
  if (audioBuffer.length === 0 || isPlaying) return;
  isPlaying = true;

  try {
    // ── Decode base64 chunks → raw PCM bytes ──────────────────────────────
    let totalLength = 0;
    const byteArrays = audioBuffer.map((chunk) => {
      const byteChars = atob(chunk);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      totalLength += bytes.length;
      return bytes;
    });
    audioBuffer = [];

    const pcm = new Uint8Array(totalLength);
    let off = 0;
    for (const arr of byteArrays) { pcm.set(arr, off); off += arr.length; }

    // ── Build WAV ArrayBuffer (44-byte header + PCM) ──────────────────────
    const wav = new ArrayBuffer(44 + pcm.length);
    const v = new DataView(wav);
    const w = new Uint8Array(wav);

    // RIFF chunk
    w.set([82,73,70,70], 0);                          // "RIFF"
    v.setUint32(4, 36 + pcm.length, true);            // file size - 8
    w.set([87,65,86,69], 8);                          // "WAVE"
    // fmt  chunk
    w.set([102,109,116,32], 12);                      // "fmt "
    v.setUint32(16, 16, true);                        // chunk size
    v.setUint16(20, 1, true);                         // PCM
    v.setUint16(22, 1, true);                         // mono
    v.setUint32(24, 24000, true);                     // sample rate
    v.setUint32(28, 24000 * 2, true);                 // byte rate
    v.setUint16(32, 2, true);                         // block align
    v.setUint16(34, 16, true);                        // bits per sample
    // data chunk
    w.set([100,97,116,97], 36);                       // "data"
    v.setUint32(40, pcm.length, true);
    w.set(pcm, 44);

    // ── Get (or create) the shared playback context ────────────────────────
    if (!playbackCtx || playbackCtx.state === "closed") {
      playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtx.state === "suspended") {
      await playbackCtx.resume();
    }

    // ── Decode WAV → AudioBuffer ──────────────────────────────────────────
    const decoded = await playbackCtx.decodeAudioData(wav);

    // ── Wire: source → analyser → destination ─────────────────────────────
    analyser = playbackCtx.createAnalyser();
    analyser.fftSize = 2048;
    dataArray = new Uint8Array(analyser.fftSize);

    const source = playbackCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(analyser);
    analyser.connect(playbackCtx.destination);

    currentSource = source;
    startWaveformVisualizer(analyser.fftSize);

    source.onended = () => {
      currentSource = null;
      isPlaying = false;
      if (audioBuffer.length > 0) setTimeout(playBufferedAudio, 50);
    };

    source.start(0);
  } catch (error) {
    console.error("🔊 Playback failed:", error);
    isPlaying = false;
    audioBuffer = [];
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

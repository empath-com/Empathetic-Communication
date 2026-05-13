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
    console.log("🔊 Created new playback AudioContext", {
      state: playbackCtx.state,
      sampleRate: playbackCtx.sampleRate,
      outputChannels: playbackCtx.destination?.maxChannelCount,
    });
  }
  // Resume immediately while we're inside the user-gesture stack frame.
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
    patient_id = "",
    llm_completion = false,
    system_prompt = "",
  } = options || {};

  console.log("🚀 Requesting Nova Sonic startup with patient context");
  socket.emit("start-nova-sonic", {
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
        if (!receivedResponse) console.warn("⚠️ No response within 60 seconds");
        cleanup();
      }, 60000);
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
    console.log("🔊 Buffered audio chunk", {
      chunkSize: audioBytes.length,
      totalBuffered: audioBuffer.length,
      isPlaying,
    });

    if (bufferTimeout) clearTimeout(bufferTimeout);

    if (!isPlaying) {
      if (audioBuffer.length >= 5) {
        console.log("⚡ Buffered 5+ chunks, playing immediately...");
        clearTimeout(bufferTimeout);
        playBufferedAudio();
      } else {
        console.log("⏳ Waiting for more chunks or timeout (300ms)...");
        bufferTimeout = setTimeout(playBufferedAudio, 300);
      }
    }
  } catch (error) {
    console.error("❌ Audio processing failed:", error);
  }
}

async function playBufferedAudio() {
  if (audioBuffer.length === 0 || isPlaying) return;
  isPlaying = true;

  try {
    console.log("🎵 Starting playback of buffered audio chunks...", { chunkCount: audioBuffer.length });
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
    console.log("✅ Decoded base64 chunks to PCM bytes", { totalBytes: totalLength });

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
    v.setUint32(24, 16000, true);                     // sample rate — must match POLLY_SAMPLE_RATE in nova_sonic.py
    v.setUint32(28, 16000 * 2, true);                 // byte rate
    v.setUint16(32, 2, true);                         // block align
    v.setUint16(34, 16, true);                        // bits per sample
    // data chunk
    w.set([100,97,116,97], 36);                       // "data"
    v.setUint32(40, pcm.length, true);
    w.set(pcm, 44);

    // ── Get (or create) the shared playback context ────────────────────────
    if (!playbackCtx || playbackCtx.state === "closed") {
      playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
      console.log("🔊 Created new playback context for audio");
    }
    if (playbackCtx.state === "suspended") {
      console.log("⏸️  Resuming suspended AudioContext...");
      await playbackCtx.resume();
      console.log("✅ AudioContext resumed", { state: playbackCtx.state });
    }

    console.log("📊 AudioContext ready", {
      state: playbackCtx.state,
      sampleRate: playbackCtx.sampleRate,
      destinationChannels: playbackCtx.destination?.maxChannelCount,
    });

    // ── Decode WAV → AudioBuffer ──────────────────────────────────────────
    console.log("🔄 Decoding WAV audio data...");
    const decoded = await playbackCtx.decodeAudioData(wav);
    console.log("✅ WAV decoded", { duration: decoded.duration, channels: decoded.numberOfChannels });

    // ── Wire: source → analyser → gain → destination ──────────────────────
    analyser = playbackCtx.createAnalyser();
    analyser.fftSize = 2048;
    dataArray = new Uint8Array(analyser.fftSize);

    // Create gain node for explicit volume control
    const gainNode = playbackCtx.createGain();
    gainNode.gain.value = 1.0;
    console.log("🔉 Created gain node", { gain: gainNode.gain.value });

    const source = playbackCtx.createBufferSource();
    source.buffer = decoded;
    
    console.log("🔗 Wiring audio components...");
    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(playbackCtx.destination);
    console.log("✅ Audio chain connected: source → analyser → gain → destination");

    console.log("📊 Destination info", {
      maxChannelCount: playbackCtx.destination?.maxChannelCount,
      numberOfInputs: playbackCtx.destination?.numberOfInputs,
    });

    currentSource = source;
    startWaveformVisualizer(analyser.fftSize);

    source.onended = () => {
      currentSource = null;
      isPlaying = false;
      console.log("⏹️  Audio source finished playing");
      if (audioBuffer.length > 0) setTimeout(playBufferedAudio, 50);
    };

    console.log("▶️  Starting audio playback...");
    source.start(0);
    console.log("✅ Source.start() called successfully");
  } catch (error) {
    console.error("❌ Playback failed:", error, {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    isPlaying = false;
    audioBuffer = [];
    
    // Diagnostic info
    console.log("🔍 Audio system diagnostics:", {
      contextState: playbackCtx?.state,
      destinationChannels: playbackCtx?.destination?.maxChannelCount,
      hasAudioOutputDevice: playbackCtx?.destination?.maxChannelCount > 0,
    });
  }
}

function startWaveformVisualizer(bufferLength) {
  console.log("🎨 Starting waveform visualizer with buffer length:", bufferLength);
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
  console.log("🎵 Waveform visualizer active");
}

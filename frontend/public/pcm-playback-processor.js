// AudioWorklet processor for streaming PCM playback.
// Accepts 16 kHz signed-16-bit PCM chunks from the main thread, performs
// linear-interpolation upsampling to the browser's native sample rate, and
// outputs a continuous mono stream — no buffer-join artifacts.

const RING_CAPACITY = 16000 * 60; // 60 s of 16 kHz audio

class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(RING_CAPACITY);
    this._readPos = 0;
    this._writePos = 0;
    this._count = 0;
    // Linear interpolation state.
    // _frac = 1.0 forces reading the first input sample on the first process() call.
    this._frac = 1.0;
    this._prev = 0.0;
    this._curr = 0.0;

    this.port.onmessage = ({ data }) => {
      if (data.type === "chunk") {
        const s = data.samples; // Int16Array, ownership transferred
        for (let i = 0; i < s.length; i++) {
          if (this._count < RING_CAPACITY) {
            this._buf[this._writePos] = s[i] / 32768.0;
            this._writePos = (this._writePos + 1) % RING_CAPACITY;
            this._count++;
          }
        }
      } else if (data.type === "stop") {
        this._readPos = 0;
        this._writePos = 0;
        this._count = 0;
        this._frac = 1.0;
        this._prev = 0.0;
        this._curr = 0.0;
      }
    };
  }

  _readSample() {
    if (this._count === 0) return 0.0;
    const s = this._buf[this._readPos];
    this._readPos = (this._readPos + 1) % RING_CAPACITY;
    this._count--;
    return s;
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;

    // How many 16 kHz input samples to advance per output sample.
    // e.g. 16000/48000 = 0.333 for a typical 48 kHz browser context.
    const step = 16000 / globalThis.sampleRate;
    const hadSamples = this._count > 0;

    for (let i = 0; i < out.length; i++) {
      this._frac += step;
      while (this._frac >= 1.0) {
        this._prev = this._curr;
        this._curr = this._readSample();
        this._frac -= 1.0;
      }
      out[i] = this._prev + this._frac * (this._curr - this._prev);
    }

    if (hadSamples && this._count === 0) {
      // Reset interpolation state so the next chunk starts from silence cleanly.
      this._frac = 1.0;
      this._prev = 0.0;
      this._curr = 0.0;
      this.port.postMessage({ type: "ended" });
    }

    return true;
  }
}

registerProcessor("pcm-playback-processor", PCMPlaybackProcessor);

// AudioWorklet processor for real-time PCM capture (replaces deprecated ScriptProcessorNode)
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // Convert float32 samples to int16 PCM
      const int16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Send raw bytes to main thread (transfer ownership for zero-copy)
      const uint8 = new Uint8Array(int16.buffer.slice(0));
      this.port.postMessage(uint8, [uint8.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);

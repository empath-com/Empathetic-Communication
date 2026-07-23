import { NovaVisualizer } from 'frontend';

// NovaVisualizer reads a real Web Audio AnalyserNode (analyser.fftSize,
// analyser.getByteTimeDomainData). There's no audio device in a static
// preview, so we hand it a minimal object with the same shape, sampling a
// deterministic waveform instead of a live signal.
function makeFakeAnalyser(amplitude: number) {
  return {
    fftSize: 512,
    getByteTimeDomainData(arr: Uint8Array) {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = 128 + Math.round(amplitude * Math.sin(i / 12));
      }
    },
  };
}

export const ActiveWaveform = () => (
  <NovaVisualizer analyser={makeFakeAnalyser(70) as any} width={240} height={240} />
);

export const QuietWaveform = () => (
  <NovaVisualizer analyser={makeFakeAnalyser(8) as any} width={240} height={240} />
);

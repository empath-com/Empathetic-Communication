import React, { useEffect, useRef } from "react";
import p5 from "p5";

/**
 * NovaVisualizer
 * Props:
 *   analyser: Web Audio AnalyserNode providing real‑time PCM data
 */
export default function NovaVisualizer({
  analyser,
  width = 300,
  height = 300,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!analyser) return;

    let p5Instance;

    const sketch = (p) => {
      let bufferLength;
      let dataArray;

      p.setup = () => {
        p.createCanvas(width, height);
        bufferLength = analyser.fftSize;
        dataArray = new Uint8Array(bufferLength);
      };

      p.draw = () => {
        p.background(0);
        analyser.getByteTimeDomainData(dataArray);

        p.stroke(255);
        p.noFill();

        const cx = p.width / 2;
        const cy = p.height / 2;
        const baseRadius = Math.min(cx, cy) * 0.7;

        p.beginShape();
        for (let i = 0; i < bufferLength; i += Math.floor(bufferLength / 360)) {
          const angle = p.map(i, 0, bufferLength, 0, p.TWO_PI);
          const v = dataArray[i] / 255.0;
          const r = baseRadius + v * 50;
          const x = cx + r * p.cos(angle);
          const y = cy + r * p.sin(angle);
          p.vertex(x, y);
        }
        p.endShape(p.CLOSE);
      };
    };

    // mount the sketch
    p5Instance = new p5(sketch, containerRef.current);

    return () => {
      p5Instance.remove();
    };
  }, [analyser]);

  return <div ref={containerRef} />;
}

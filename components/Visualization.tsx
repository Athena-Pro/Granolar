import React, { useRef, useEffect } from 'react';
import { PolarMappingType, Grain } from '../types';

interface VisualizationProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  sourceType: 'oscillators' | 'file' | 'granular';
  oscillatorFreqs: number[];
  activeGrains: Grain[];
  polarParams: {
    polarCenter: number;
    polarRadius: number;
    polarRotation: number;
    polarMapping: PolarMappingType;
    polarPetals: number;
  };
}

const Visualization: React.FC<VisualizationProps> = ({ analyser, isPlaying, sourceType, oscillatorFreqs, activeGrains, polarParams }) => {
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const polarCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const totalRotation = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    if (!isPlaying || !analyser) {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      return;
    }

    const waveCanvas = waveCanvasRef.current!;
    const specCanvas = specCanvasRef.current!;
    const polarCanvas = polarCanvasRef.current!;
    const waveCtx = waveCanvas.getContext('2d')!;
    const specCtx = specCanvas.getContext('2d')!;
    const polarCtx = polarCanvas.getContext('2d')!;

    const bufferLength = analyser.frequencyBinCount;
    const timeDataArray = new Uint8Array(bufferLength);
    const freqDataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(timeDataArray);
      analyser.getByteFrequencyData(freqDataArray);

      // Draw Waveform & Spectrum (unchanged)
      waveCtx.fillStyle = 'rgb(15, 15, 35)';
      waveCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);
      waveCtx.lineWidth = 2;
      waveCtx.strokeStyle = '#4ecdc4';
      waveCtx.beginPath();
      const sliceWidth = waveCanvas.width / bufferLength;
      for (let i = 0; i < bufferLength; i++) {
        const v = timeDataArray[i] / 128.0;
        const y = v * waveCanvas.height / 2;
        if (i === 0) waveCtx.moveTo(i * sliceWidth, y); else waveCtx.lineTo(i * sliceWidth, y);
      }
      waveCtx.stroke();

      specCtx.fillStyle = 'rgb(15, 15, 35)';
      specCtx.fillRect(0, 0, specCanvas.width, specCanvas.height);
      const barWidth = (specCanvas.width / (bufferLength / 2));
      for (let i = 0; i < bufferLength / 2; i++) {
        const barHeight = (freqDataArray[i] / 255.0) * specCanvas.height;
        const hue = (i / (bufferLength / 2)) * 240 + 120;
        specCtx.fillStyle = `hsl(${hue}, 70%, 50%)`;
        specCtx.fillRect(i * barWidth, specCanvas.height - barHeight, barWidth, barHeight);
      }

      // --- Draw Polar Visualization ---
      polarCtx.fillStyle = 'rgba(15, 15, 35, 0.5)'; // Use alpha for trails
      polarCtx.fillRect(0, 0, polarCanvas.width, polarCanvas.height);
      
      const centerX = polarCanvas.width / 2;
      const centerY = polarCanvas.height / 2;
      const maxRadius = Math.min(centerX, centerY) * 0.9;
      
      if (sourceType === 'oscillators') {
          drawOscillatorPolar(polarCtx, centerX, centerY, maxRadius, freqDataArray);
      } else if (sourceType === 'granular') {
          drawGranularPolar(polarCtx, centerX, centerY, maxRadius);
      }

      animationFrameId.current = requestAnimationFrame(draw);
    };

    const drawOscillatorPolar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rMax: number, freqData: Uint8Array) => {
        const now = performance.now();
        const deltaTime = (now - lastTime.current) / 1000;
        lastTime.current = now;
        totalRotation.current += 2 * Math.PI * polarParams.polarRotation * deltaTime;

        oscillatorFreqs.forEach((freq, index) => {
            const harmonic = index + 1;
            const baseAngle = (harmonic - 1) * (2 * Math.PI / 8);
            const angle = baseAngle + totalRotation.current;
            const freqRatio = Math.abs(freq - polarParams.polarCenter) / (polarParams.polarRadius * 2);
            const r = Math.min(rMax * freqRatio, rMax);
            
            const posX = cx + r * Math.cos(angle);
            const posY = cy + r * Math.sin(angle);
            
            const hue = (harmonic / 8) * 360;
            ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
            
            const freqBin = Math.floor(freq / (analyser!.context.sampleRate / analyser!.fftSize));
            const amplitude = (freqBin < freqData.length ? freqData[freqBin] : 0) / 255;
            const size = 2 + amplitude * 12;

            ctx.beginPath();
            ctx.arc(posX, posY, size, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    const drawGranularPolar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rMax: number) => {
        activeGrains.forEach(grain => {
            // Angle is based on pan
            const angle = (grain.pan * Math.PI / 2) + Math.PI / 2;
            
            // Radius is based on playback rate deviation from center
            const rateRatio = (grain.playbackRate - polarParams.polarCenter) / polarParams.polarRadius;
            const r = Math.max(-rMax, Math.min(rMax, rMax * rateRatio));

            const posX = cx - r * Math.sin(angle); // Use sin/cos for standard polar coordinates
            const posY = cy - r * Math.cos(angle);
            
            // Color is based on source position in file
            const hue = grain.sourcePosition * 360;
            ctx.fillStyle = `hsla(${hue}, 80%, 70%, 0.8)`;
            
            const size = 2 + grain.amplitude * 8;

            ctx.beginPath();
            ctx.arc(posX, posY, size, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    draw();

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [isPlaying, analyser, sourceType, oscillatorFreqs, activeGrains, polarParams]);

  return (
    <div className="bg-black/30 rounded-xl p-5 space-y-4">
      <h3 className="text-xl text-synth-accent font-bold">📊 Real-time Analysis</h3>
      <div>
        <h4 className="text-sm text-gray-400 mb-2">Waveform</h4>
        <canvas ref={waveCanvasRef} width="512" height="150" className="w-full h-28 bg-black/50 rounded-md border border-white/10" />
      </div>
      <div>
        <h4 className="text-sm text-gray-400 mb-2">Spectrum</h4>
        <canvas ref={specCanvasRef} width="512" height="150" className="w-full h-28 bg-black/50 rounded-md border border-white/10" />
      </div>
       <div>
        <h4 className="text-sm text-gray-400 mb-2">
            {sourceType === 'granular' ? 'Granular Polar Map (Pan/Pitch)' : 'Oscillator Polar Map'}
        </h4>
        <canvas ref={polarCanvasRef} width="512" height="300" className="w-full h-52 bg-black/50 rounded-md border border-white/10" />
      </div>
    </div>
  );
};

export default Visualization;
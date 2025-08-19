
import React, { useState, useCallback, useMemo, ChangeEvent, DragEvent, useEffect } from 'react';
import { ScalaScale } from '../types';

interface KeyboardProps {
  onNoteOn: (freq: number, keyIndex: number) => void;
  onNoteOff: (keyIndex: number) => void;
  onScaleChange: (frequencies: number[]) => void;
  scaleLock: boolean;
  onScaleLockChange: (locked: boolean) => void;
}

const Keyboard: React.FC<KeyboardProps> = ({ 
  onNoteOn, 
  onNoteOff, 
  onScaleChange,
  scaleLock,
  onScaleLockChange
}) => {
  const [edo, setEdo] = useState(12);
  const [baseNote, setBaseNote] = useState(60);
  const [scalaScale, setScalaScale] = useState<ScalaScale | null>(null);
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const scaleName = useMemo(() => {
    if (scalaScale) return scalaScale.description;
    return `${edo}-EDO`;
  }, [edo, scalaScale]);

  const keys = useMemo(() => {
    const numKeys = scalaScale ? scalaScale.ratios.length : Math.min(edo * 2, 48);
    const baseFreq = 440 * Math.pow(2, (baseNote - 69) / 12);
    
    return Array.from({ length: numKeys }, (_, i) => {
      let frequency: number;
      if (scalaScale) {
        const cents = scalaScale.ratios[i % scalaScale.ratios.length];
        const octave = Math.floor(i / scalaScale.ratios.length);
        frequency = baseFreq * Math.pow(2, octave + cents / 1200);
      } else {
        frequency = baseFreq * Math.pow(2, i / edo);
      }
      return {
        keyIndex: i,
        frequency,
        hue: (i * 360) / (scalaScale ? scalaScale.ratios.length : edo)
      };
    });
  }, [edo, baseNote, scalaScale]);

  useEffect(() => {
    const baseFrequencies = keys.map(k => k.frequency);
    const allFrequencies: number[] = [];
    const numOctavesUp = 6;
    const numOctavesDown = 6;

    for (let i = -numOctavesDown; i <= numOctavesUp; i++) {
        for (const baseFreq of baseFrequencies) {
            allFrequencies.push(baseFreq * Math.pow(2, i));
        }
    }
    allFrequencies.sort((a, b) => a - b);
    
    onScaleChange(allFrequencies.filter(f => f >= 20 && f <= 20000));
  }, [keys, onScaleChange]);
  
  const handleMouseDown = (keyIndex: number, freq: number) => {
    const newActiveKeys = new Set(activeKeys);
    if (!newActiveKeys.has(keyIndex)) {
      newActiveKeys.add(keyIndex);
      setActiveKeys(newActiveKeys);
      onNoteOn(freq, keyIndex);
    }
  };

  const handleMouseUp = (keyIndex: number) => {
    const newActiveKeys = new Set(activeKeys);
    if (newActiveKeys.has(keyIndex)) {
      newActiveKeys.delete(keyIndex);
      setActiveKeys(newActiveKeys);
      onNoteOff(keyIndex);
    }
  };

  const handleMouseLeave = () => {
      if (activeKeys.size > 0) {
          activeKeys.forEach(keyIndex => onNoteOff(keyIndex));
          setActiveKeys(new Set());
      }
  };

  const parseScalaFile = (text: string): ScalaScale | null => {
    try {
        const lines = text.split('\n').filter(line => !line.startsWith('!') && line.trim());
        if (lines.length < 2) return null;

        const description = lines[0].trim();
        const numNotes = parseInt(lines[1].trim());
        const ratios: number[] = [];
        
        for (let i = 2; i < Math.min(lines.length, numNotes + 2); i++) {
            const line = lines[i].trim();
            if (line.includes('.')) {
                ratios.push(parseFloat(line));
            } else if (line.includes('/')) {
                const [num, den] = line.split('/').map(n => parseInt(n));
                ratios.push(1200 * Math.log2(num / den));
            } else {
                ratios.push(parseFloat(line));
            }
        }
        return { description, ratios };
    } catch (e) {
        console.error("Failed to parse Scala file:", e);
        return null;
    }
  };

  const handleFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          const result = e.target?.result;
          if (typeof result === 'string') {
              const parsed = parseScalaFile(result);
              if (parsed) {
                  setScalaScale(parsed);
                  setEdo(parsed.ratios.length);
              }
          }
      };
      reader.readAsText(file);
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          handleFile(e.target.files[0]);
      }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }

  return (
    <div className="bg-synth-panel backdrop-blur-lg border border-white/10 rounded-xl p-5">
      <h3 className="text-xl mb-3 text-synth-accent font-bold">🎹 Microtonal Keyboard</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center mb-4 text-sm">
        <label>EDO:
          <select value={edo} onChange={(e) => { setEdo(Number(e.target.value)); setScalaScale(null); }} className="ml-2 bg-slate-700 border border-slate-600 rounded p-1">
            {[12, 19, 22, 24, 31, 53].map(v => <option key={v} value={v}>{v}-EDO</option>)}
          </select>
        </label>
        <label>Base Note (MIDI):
          <input type="number" value={baseNote} onChange={e => setBaseNote(Number(e.target.value))} min="0" max="127" className="ml-2 w-16 bg-slate-700 border border-slate-600 rounded p-1 text-center" />
        </label>
        <div className="flex items-center gap-2">
            <input 
                type="checkbox" 
                id="scale-lock-toggle"
                checked={scaleLock}
                onChange={e => onScaleLockChange(e.target.checked)}
                className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-synth-accent focus:ring-synth-accent"
            />
            <label htmlFor="scale-lock-toggle" className="cursor-pointer">Lock to Scale</label>
        </div>
      </div>
       <div 
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        className={`border-2 border-dashed rounded-lg p-4 text-center text-gray-400 mb-4 transition-colors ${isDragging ? 'border-synth-hot bg-synth-hot/10' : 'border-slate-600'}`}
      >
        <label htmlFor="scala-file-upload" className="cursor-pointer">
          {scaleName} (Drop .scl file or click to load)
        </label>
        <input id="scala-file-upload" type="file" accept=".scl" onChange={handleFileChange} className="hidden" />
      </div>

      <div className="relative h-24 bg-slate-900 rounded-md overflow-hidden" onMouseLeave={handleMouseLeave}>
        {keys.map(({ keyIndex, frequency, hue }) => (
          <div
            key={keyIndex}
            onMouseDown={() => handleMouseDown(keyIndex, frequency)}
            onMouseUp={() => handleMouseUp(keyIndex)}
            className={`absolute h-full cursor-pointer transition-all duration-100 border-r border-slate-800 ${activeKeys.has(keyIndex) ? 'brightness-75' : 'hover:brightness-90'}`}
            style={{
              left: `${(keyIndex / keys.length) * 100}%`,
              width: `${(1 / keys.length) * 100}%`,
              background: `linear-gradient(to bottom, hsl(${hue}, 40%, 85%), hsl(${hue}, 40%, 75%))`
            }}
            title={`${frequency.toFixed(1)}Hz`}
          />
        ))}
      </div>
    </div>
  );
};

export default Keyboard;

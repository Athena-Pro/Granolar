
import React from 'react';

interface SliderControlProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
  isRecording: boolean;
  onToggleRecord: () => void;
  isPlayingLoop: boolean;
  onTogglePlay: () => void;
}

const SliderControl: React.FC<SliderControlProps> = React.memo(({
  id,
  label,
  min,
  max,
  step,
  value,
  unit = '',
  onChange,
  isRecording,
  onToggleRecord,
  isPlayingLoop,
  onTogglePlay,
}) => {
  const displayValue = (val: number) => {
    if (Math.abs(val) < 10 && !Number.isInteger(val)) {
      return val.toFixed(2);
    }
    return Math.round(val);
  };
  
  return (
    <div className="mb-4">
      <label htmlFor={id} className="block mb-1 font-bold text-gray-300 text-sm">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          id={id}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer range-lg"
        />
        <div className="flex gap-1.5">
          <button 
            onClick={onToggleRecord}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all duration-200 ${isRecording ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50' : 'bg-slate-600 hover:bg-red-500'}`}
            title="Record Parameter Loop (R)"
          >
            ●
          </button>
          <button 
            onClick={onTogglePlay}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all duration-200 ${isPlayingLoop ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' : 'bg-slate-600 hover:bg-green-500'}`}
            title="Play Parameter Loop (P)"
          >
            ▶
          </button>
        </div>
      </div>
      <div className="text-right text-xs text-gray-400 mt-1 pr-16">
        {displayValue(value)} {unit}
      </div>
    </div>
  );
});

export default SliderControl;
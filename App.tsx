import React, { useState, useRef, useCallback, useEffect, ChangeEvent } from 'react';
import SliderControl from './components/SliderControl';
import Keyboard from './components/Keyboard';
import Visualization from './components/Visualization';
import { AudioEngine } from './services/AudioEngine';
import { AppParameters, Looper, ParameterId, PolarMappingType, ModuleStates, Grain, ChaosType, FractalType, FilterType } from './types';

const initialParams: AppParameters = {
  sourceType: 'oscillators',
  playbackRate: 220,
  modDepth: 50,
  modRate: 2,
  chaosType: 'logistic',
  chaosR: 3.57,
  chaosSpeed: 1,
  fractalType: 'weierstrass',
  fractalDepth: 4,
  fractalScale: 0.5,
  filterType: 'powerlaw',
  filterCutoff: 0.5,
  resonance: 1,
  morphSlider: 0,
  polarCenter: 1.0, // Default to 1.0 for granular playback rate
  polarRadius: 0.5,
  polarRotation: 0.2,
  polarMapping: 'sine',
  polarPetals: 3,
  globalSpeed: 1.0,
  scaleLock: false,
  grainDensity: 20,
  grainDuration: 0.15,
  grainPosition: 0.5,
  grainSpread: 0.1,
};

const defaultModuleStates: ModuleStates = {
  modulation: true, chaos: true, fractal: true, filter: true, polar: true, granular: true,
};

const fileModuleStates: ModuleStates = {
  modulation: false, chaos: false, fractal: false, filter: false, polar: false, granular: false,
};

const ControlPanel: React.FC<{ 
  title: string; 
  children: React.ReactNode; 
  enabled: boolean;
  onToggle: () => void;
}> = ({ title, children, enabled, onToggle }) => (
  <div className={`bg-synth-panel backdrop-blur-lg border border-white/10 rounded-xl p-5 transition-opacity ${enabled ? 'opacity-100' : 'opacity-60'}`}>
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-xl text-synth-accent font-bold">{title}</h3>
      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-400">{enabled ? 'On' : 'Off'}</span>
        <button onClick={onToggle} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-synth-accent' : 'bg-slate-600'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    </div>
    <fieldset disabled={!enabled} className="space-y-2">{children}</fieldset>
  </div>
);


const App: React.FC = () => {
  const [params, setParams] = useState<AppParameters>(initialParams);
  const [moduleStates, setModuleStates] = useState<ModuleStates>(defaultModuleStates);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [loopers, setLoopers] = useState<Record<string, Looper>>({});
  const [oscillatorFreqs, setOscillatorFreqs] = useState<number[]>([]);
  const [activeGrains, setActiveGrains] = useState<Grain[]>([]);
  const [scaleFrequencies, setScaleFrequencies] = useState<number[]>([]);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  
  const audioEngine = useRef<AudioEngine | null>(null);
  const looperAnimationId = useRef<number | null>(null);
  const looperLength = 4000;

  const updateParam = useCallback(<K extends keyof AppParameters>(id: K, value: AppParameters[K]) => {
    setParams(prev => ({ ...prev, [id]: value }));
  }, []);

  const initAudio = useCallback(async () => {
    if (!audioEngine.current) {
      audioEngine.current = new AudioEngine();
      await audioEngine.current.init();
      setIsAudioReady(true);
    }
  }, []);
  
  const handleSourceTypeChange = (sourceType: AppParameters['sourceType']) => {
      if (isPlaying) handleStop();
      updateParam('sourceType', sourceType);
      
      switch(sourceType) {
          case 'oscillators':
              setModuleStates(defaultModuleStates);
              updateParam('playbackRate', 220);
              updateParam('polarCenter', 440);
              break;
          case 'file':
              setModuleStates(fileModuleStates);
              updateParam('playbackRate', 1.0);
              break;
          case 'granular':
              setModuleStates(defaultModuleStates);
              updateParam('polarCenter', 1.0); // Center is normal playback speed
              break;
      }
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAudioFileName(file.name);
      await initAudio();
      if (audioEngine.current) {
        const arrayBuffer = await file.arrayBuffer();
        const success = await audioEngine.current.loadAudioData(arrayBuffer);
        if (!success) {
          alert("Failed to load audio file. Please try a different format (e.g., MP3, WAV).");
          setAudioFileName(null);
        }
      }
    }
  }

  const handlePlay = useCallback(async () => {
    await initAudio();
    if (!isPlaying) {
      audioEngine.current?.start(params, moduleStates, scaleFrequencies);
      setIsPlaying(true);
    }
  }, [isPlaying, params, moduleStates, initAudio, scaleFrequencies]);

  const handleStop = useCallback(() => {
    if (isPlaying) {
      audioEngine.current?.stop();
      setIsPlaying(false);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying && audioEngine.current) {
      audioEngine.current.updateParameters(params, moduleStates, scaleFrequencies);
    }
  }, [params, isPlaying, moduleStates, scaleFrequencies]);
  
  const handleNoteOn = useCallback((freq: number, keyIndex: number) => { audioEngine.current?.playKeyboardNote(freq, keyIndex); }, []);
  const handleNoteOff = useCallback((keyIndex: number) => { audioEngine.current?.stopKeyboardNote(keyIndex); }, []);

  useEffect(() => {
    const updateLoopers = () => {
      const now = performance.now();
      let changed = false;
      const newParams = { ...params };
      
      if (audioEngine.current) {
        if (params.sourceType === 'oscillators') {
            setOscillatorFreqs([...audioEngine.current.oscillatorFreqs]);
        } else if (params.sourceType === 'granular') {
            setActiveGrains([...audioEngine.current.activeGrains]);
        }
      }

      Object.keys(loopers).forEach((idString) => {
        const id = idString as ParameterId;
        const looper = loopers[id];
        const paramValue = params[id as keyof AppParameters];
        if (typeof paramValue !== 'number') return;

        if (looper.recording) {
          looper.data.push({ time: now - looper.startTime, value: paramValue });
          if(now - looper.startTime >= looperLength) {
              setLoopers(prev => ({...prev, [id]: {...(prev[id]!), recording: false}}))
          }
        }
        
        if (looper.playing && looper.data.length > 0) {
          const elapsed = (now - looper.playbackStartTime) % looperLength;
          let nextValue: number | null = null;
          
          if (elapsed <= looper.data[0].time) {
            nextValue = looper.data[0].value;
          } else {
            for (let i = 0; i < looper.data.length - 1; i++) {
              const currentPoint = looper.data[i];
              const nextPoint = looper.data[i+1];
              if(elapsed >= currentPoint.time && elapsed <= nextPoint.time) {
                const progress = (elapsed - currentPoint.time) / (nextPoint.time - currentPoint.time);
                nextValue = currentPoint.value + (nextPoint.value - currentPoint.value) * progress;
                break;
              }
            }
          }

          if (nextValue === null) {
              nextValue = looper.data[looper.data.length - 1].value;
          }
          
          if (nextValue !== null && isFinite(nextValue)) {
            (newParams as any)[id] = nextValue;
            changed = true;
          }
        }
      });

      if (changed) setParams(newParams);
      looperAnimationId.current = requestAnimationFrame(updateLoopers);
    };

    if (isPlaying) {
        looperAnimationId.current = requestAnimationFrame(updateLoopers);
    }
    
    return () => { if(looperAnimationId.current) cancelAnimationFrame(looperAnimationId.current); }
  }, [loopers, params, isPlaying]);

  const toggleLooperRecord = useCallback((id: ParameterId) => {
    setLoopers(prev => {
      const current = prev[id] || { recording: false, playing: false, data: [], startTime: 0, playbackStartTime: 0 };
      if (!current.recording) {
        // Start recording
        return {
          ...prev,
          [id]: { ...current, recording: true, data: [], startTime: performance.now() }
        };
      } else {
        // Stop recording
        return {
          ...prev,
          [id]: { ...current, recording: false }
        };
      }
    });
  }, []);

  const toggleLooperPlay = useCallback((id: ParameterId) => {
    setLoopers(prev => {
      const current = prev[id] || { recording: false, playing: false, data: [], startTime: 0, playbackStartTime: 0 };
      if (!current.playing && current.data.length > 0) {
        return {
          ...prev,
          [id]: { ...current, playing: true, playbackStartTime: performance.now() }
        };
      } else {
        return {
          ...prev,
          [id]: { ...current, playing: false }
        };
      }
    });
  }, []);
  
  const toggleModule = (id: keyof ModuleStates) => { setModuleStates(prev => ({...prev, [id]: !prev[id]})); }

  const isFileBased = params.sourceType === 'file' || params.sourceType === 'granular';

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <header className="text-center mb-4">
        <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-synth-hot to-synth-accent text-transparent bg-clip-text pb-2">
          Granolar Synthesizer
        </h1>
        <p className="text-gray-400">An Interactive Mathematical Audio Playground</p>
      </header>
      
      <div className="bg-synth-panel backdrop-blur-md rounded-xl p-4 flex flex-wrap justify-center items-center gap-4">
        <button
          onClick={isPlaying ? handleStop : handlePlay}
          className={`px-8 py-3 rounded-lg font-bold text-lg transition-all duration-300 transform hover:scale-105 ${
            isPlaying
              ? 'bg-synth-hot text-white shadow-lg shadow-synth-hot/40'
              : 'bg-synth-accent text-white shadow-lg shadow-synth-accent/40'
          }`}
        >
          {isPlaying ? '⏹ Stop' : '▶ Start'}
        </button>
        <div className="flex-grow min-w-[200px] max-w-sm flex items-center gap-3">
            <label htmlFor="globalSpeed" className="text-sm font-bold">Global Speed</label>
            <input
                type="range"
                id="globalSpeed"
                min={0.1}
                max={2.0}
                step={0.05}
                value={params.globalSpeed}
                onChange={(e) => updateParam('globalSpeed', parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer range-lg"
            />
            <span className="text-sm w-12 text-center">{params.globalSpeed.toFixed(2)}x</span>
        </div>
      </div>

      <div className="bg-synth-panel backdrop-blur-md rounded-xl p-4">
        <h3 className="text-xl mb-3 text-synth-accent font-bold">🔊 Sound Source</h3>
        <div className="flex flex-col sm:flex-row items-center gap-4">
            <select value={params.sourceType} onChange={(e) => handleSourceTypeChange(e.target.value as any)} className="bg-slate-700 border border-slate-600 rounded p-2">
                <option value="oscillators">Internal Oscillators</option>
                <option value="file">Audio File Player</option>
                <option value="granular">Granular Synth</option>
            </select>
            {isFileBased && (
                <div className="flex-1 w-full sm:w-auto">
                    <label htmlFor="audio-upload" className="w-full text-center block bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded cursor-pointer transition-colors">
                        {audioFileName || 'Click to Upload Audio'}
                    </label>
                    <input id="audio-upload" type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
                </div>
            )}
        </div>
      </div>

      <Keyboard 
        onNoteOn={handleNoteOn} onNoteOff={handleNoteOff} onScaleChange={setScaleFrequencies}
        scaleLock={params.scaleLock} onScaleLockChange={(v) => updateParam('scaleLock', v)}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {params.sourceType === 'granular' && (
            <ControlPanel title="✨ Granular Synth" enabled={moduleStates.granular} onToggle={() => toggleModule('granular')}>
              <SliderControl id="grainDensity" label="Density" min={1} max={60} step={1} value={params.grainDensity} onChange={v => updateParam('grainDensity',v)} unit="gr/s" isRecording={!!loopers.grainDensity?.recording} onToggleRecord={()=>toggleLooperRecord('grainDensity')} isPlayingLoop={!!loopers.grainDensity?.playing} onTogglePlay={()=>toggleLooperPlay('grainDensity')} />
              <SliderControl id="grainDuration" label="Duration" min={0.01} max={0.5} step={0.01} value={params.grainDuration} onChange={v => updateParam('grainDuration',v)} unit="s" isRecording={!!loopers.grainDuration?.recording} onToggleRecord={()=>toggleLooperRecord('grainDuration')} isPlayingLoop={!!loopers.grainDuration?.playing} onTogglePlay={()=>toggleLooperPlay('grainDuration')} />
              <SliderControl id="grainPosition" label="Position" min={0} max={1} step={0.01} value={params.grainPosition} onChange={v => updateParam('grainPosition',v)} isRecording={!!loopers.grainPosition?.recording} onToggleRecord={()=>toggleLooperRecord('grainPosition')} isPlayingLoop={!!loopers.grainPosition?.playing} onTogglePlay={()=>toggleLooperPlay('grainPosition')} />
              <SliderControl id="grainSpread" label="Spread" min={0} max={0.5} step={0.01} value={params.grainSpread} onChange={v => updateParam('grainSpread',v)} isRecording={!!loopers.grainSpread?.recording} onToggleRecord={()=>toggleLooperRecord('grainSpread')} isPlayingLoop={!!loopers.grainSpread?.playing} onTogglePlay={()=>toggleLooperPlay('grainSpread')} />
            </ControlPanel>
          )}

          <ControlPanel title="🌊 Modulation" enabled={moduleStates.modulation} onToggle={() => toggleModule('modulation')}>
            <SliderControl id="playbackRate" label={params.sourceType === 'oscillators' ? "Base Frequency" : "Base Playback Rate"} min={params.sourceType === 'oscillators' ? 50 : 0.1} max={params.sourceType === 'oscillators' ? 800 : 4} step={params.sourceType === 'oscillators' ? 1 : 0.01} value={params.playbackRate} onChange={(v) => updateParam('playbackRate', v)} unit={params.sourceType === 'oscillators' ? "Hz" : "x"} isRecording={!!loopers.playbackRate?.recording} onToggleRecord={() => toggleLooperRecord('playbackRate')} isPlayingLoop={!!loopers.playbackRate?.playing} onTogglePlay={() => toggleLooperPlay('playbackRate')} />
            <SliderControl id="modDepth" label="Sine Mod Depth" min={0} max={200} step={1} value={params.modDepth} onChange={(v) => updateParam('modDepth', v)} unit="Hz" isRecording={!!loopers.modDepth?.recording} onToggleRecord={() => toggleLooperRecord('modDepth')} isPlayingLoop={!!loopers.modDepth?.playing} onTogglePlay={() => toggleLooperPlay('modDepth')} />
            <SliderControl id="modRate" label="Mod Rate" min={0.1} max={10} step={0.1} value={params.modRate} onChange={(v) => updateParam('modRate', v)} unit="Hz" isRecording={!!loopers.modRate?.recording} onToggleRecord={() => toggleLooperRecord('modRate')} isPlayingLoop={!!loopers.modRate?.playing} onTogglePlay={() => toggleLooperPlay('modRate')} />
          </ControlPanel>
          
          <ControlPanel title="🔥 Chaotic Systems" enabled={moduleStates.chaos} onToggle={() => toggleModule('chaos')}>
            <select value={params.chaosType} onChange={(e) => updateParam('chaosType', e.target.value as ChaosType)} className="w-full p-2 mb-4 bg-slate-700 border border-slate-600 rounded">
                <option value="logistic">Logistic Map</option>
                <option value="lorenz">Lorenz Attractor</option>
                <option value="henon">Hénon Map</option>
            </select>
            <SliderControl id="chaosR" label="Parameter (r)" min={2.5} max={4.0} step={0.01} value={params.chaosR} onChange={(v) => updateParam('chaosR', v)} isRecording={!!loopers.chaosR?.recording} onToggleRecord={() => toggleLooperRecord('chaosR')} isPlayingLoop={!!loopers.chaosR?.playing} onTogglePlay={() => toggleLooperPlay('chaosR')} />
            <SliderControl id="chaosSpeed" label="Speed" min={0.1} max={10} step={0.1} value={params.chaosSpeed} onChange={(v) => updateParam('chaosSpeed', v)} isRecording={!!loopers.chaosSpeed?.recording} onToggleRecord={() => toggleLooperRecord('chaosSpeed')} isPlayingLoop={!!loopers.chaosSpeed?.playing} onTogglePlay={() => toggleLooperPlay('chaosSpeed')} />
          </ControlPanel>

          <ControlPanel title="🌀 Fractal Harmonics" enabled={moduleStates.fractal} onToggle={() => toggleModule('fractal')}>
            <select value={params.fractalType} onChange={(e) => updateParam('fractalType', e.target.value as FractalType)} className="w-full p-2 mb-4 bg-slate-700 border border-slate-600 rounded">
                <option value="weierstrass">Weierstrass</option>
                <option value="mandelbrot">Mandelbrot (1D)</option>
                <option value="julia">Julia (1D)</option>
            </select>
            <SliderControl id="fractalDepth" label="Iteration Depth" min={1} max={10} step={1} value={params.fractalDepth} onChange={(v) => updateParam('fractalDepth', v)} isRecording={!!loopers.fractalDepth?.recording} onToggleRecord={() => toggleLooperRecord('fractalDepth')} isPlayingLoop={!!loopers.fractalDepth?.playing} onTogglePlay={() => toggleLooperPlay('fractalDepth')} />
            <SliderControl id="fractalScale" label="Scale" min={0.1} max={1} step={0.01} value={params.fractalScale} onChange={(v) => updateParam('fractalScale', v)} isRecording={!!loopers.fractalScale?.recording} onToggleRecord={() => toggleLooperRecord('fractalScale')} isPlayingLoop={!!loopers.fractalScale?.playing} onTogglePlay={() => toggleLooperPlay('fractalScale')} />
          </ControlPanel>
          
          <ControlPanel title="📐 Spectral Filtering" enabled={moduleStates.filter} onToggle={() => toggleModule('filter')}>
             <select value={params.filterType} onChange={(e) => updateParam('filterType', e.target.value as FilterType)} className="w-full p-2 mb-4 bg-slate-700 border border-slate-600 rounded">
                <option value="powerlaw">Power Law</option>
                <option value="cosease">Cos-Ease</option>
                <option value="logistic">Logistic Chaos</option>
                <option value="chebyshev">Chebyshev</option>
                <option value="fibonacci">Fibonacci</option>
            </select>
            <SliderControl id="filterCutoff" label="Cutoff" min={0} max={1} step={0.01} value={params.filterCutoff} onChange={(v) => updateParam('filterCutoff', v)} isRecording={!!loopers.filterCutoff?.recording} onToggleRecord={() => toggleLooperRecord('filterCutoff')} isPlayingLoop={!!loopers.filterCutoff?.playing} onTogglePlay={() => toggleLooperPlay('filterCutoff')} />
            <SliderControl id="resonance" label="Resonance (Q)" min={0.1} max={30} step={0.1} value={params.resonance} onChange={(v) => updateParam('resonance', v)} isRecording={!!loopers.resonance?.recording} onToggleRecord={() => toggleLooperRecord('resonance')} isPlayingLoop={!!loopers.resonance?.playing} onTogglePlay={() => toggleLooperPlay('resonance')} />
            <SliderControl id="morphSlider" label="Morph" min={0} max={1} step={0.01} value={params.morphSlider} onChange={(v) => updateParam('morphSlider', v)} isRecording={!!loopers.morphSlider?.recording} onToggleRecord={() => toggleLooperRecord('morphSlider')} isPlayingLoop={!!loopers.morphSlider?.playing} onTogglePlay={() => toggleLooperPlay('morphSlider')} />
          </ControlPanel>

          <ControlPanel title="🌀 Polar Mapping" enabled={moduleStates.polar} onToggle={() => toggleModule('polar')}>
             <select value={params.polarMapping} onChange={(e) => updateParam('polarMapping', e.target.value as PolarMappingType)} className="w-full p-2 mb-4 bg-slate-700 border border-slate-600 rounded">
                <option value="sine">Sine</option> <option value="rose">Rose Curve</option> <option value="cardioid">Cardioid</option> <option value="spiral">Logarithmic Spiral</option> <option value="lissajous">Lissajous</option> <option value="hypocycloid">Hypocycloid</option>
            </select>
            <SliderControl id="polarCenter" label={params.sourceType === 'granular' ? "Center Playback Rate" : "Center Frequency"} min={params.sourceType === 'granular' ? 0.1 : 100} max={params.sourceType === 'granular' ? 4 : 1000} step={params.sourceType === 'granular' ? 0.01 : 1} value={params.polarCenter} onChange={(v) => updateParam('polarCenter', v)} unit={params.sourceType === 'granular' ? "x" : "Hz"} isRecording={!!loopers.polarCenter?.recording} onToggleRecord={() => toggleLooperRecord('polarCenter')} isPlayingLoop={!!loopers.polarCenter?.playing} onTogglePlay={() => toggleLooperPlay('polarCenter')} />
            <SliderControl id="polarRadius" label={params.sourceType === 'granular' ? "Rate Deviation" : "Freq Spread"} min={0} max={params.sourceType === 'granular' ? 2 : 500} step={0.01} value={params.polarRadius} onChange={(v) => updateParam('polarRadius', v)} unit={params.sourceType === 'granular' ? "x" : "Hz"} isRecording={!!loopers.polarRadius?.recording} onToggleRecord={() => toggleLooperRecord('polarRadius')} isPlayingLoop={!!loopers.polarRadius?.playing} onTogglePlay={() => toggleLooperPlay('polarRadius')} />
            <SliderControl id="polarRotation" label="Rotation Speed" min={0} max={5} step={0.05} value={params.polarRotation} onChange={(v) => updateParam('polarRotation', v)} unit="Hz" isRecording={!!loopers.polarRotation?.recording} onToggleRecord={() => toggleLooperRecord('polarRotation')} isPlayingLoop={!!loopers.polarRotation?.playing} onTogglePlay={() => toggleLooperPlay('polarRotation')} />
            <SliderControl id="polarPetals" label="Pattern Complexity (n)" min={1} max={12} step={1} value={params.polarPetals} onChange={(v) => updateParam('polarPetals', v)} isRecording={!!loopers.polarPetals?.recording} onToggleRecord={() => toggleLooperRecord('polarPetals')} isPlayingLoop={!!loopers.polarPetals?.playing} onTogglePlay={() => toggleLooperPlay('polarPetals')} />
          </ControlPanel>
        </div>
        
        <Visualization 
          analyser={audioEngine.current?.analyser || null} 
          isPlaying={isPlaying} 
          sourceType={params.sourceType}
          oscillatorFreqs={oscillatorFreqs}
          activeGrains={activeGrains}
          polarParams={{
            polarCenter: params.polarCenter,
            polarRadius: params.polarRadius,
            polarRotation: params.polarRotation * params.globalSpeed,
            polarMapping: params.polarMapping,
            polarPetals: params.polarPetals,
          }}
        />
      </div>
    </div>
  );
};

export default App;
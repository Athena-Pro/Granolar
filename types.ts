
export interface Parameter {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}

export interface LooperDataPoint {
  time: number;
  value: number;
}

export interface Looper {
  recording: boolean;
  playing: boolean;
  data: LooperDataPoint[];
  startTime: number;
  playbackStartTime: number;
}

export interface SpectralSnapshot extends Array<number> {}

export interface ScalaScale {
  description: string;
  ratios: number[];
}

export interface Grain {
  id: number;
  sourcePosition: number; // 0-1
  playbackRate: number;
  pan: number; // -1 to 1
  amplitude: number;
}

export type PolarMappingType = 'sine' | 'spiral' | 'rose' | 'lissajous' | 'cardioid' | 'hypocycloid';

export interface ModuleStates {
  modulation: boolean;
  chaos: boolean;
  fractal: boolean;
  filter: boolean;
  polar: boolean;
  granular: boolean;
}

export type ChaosType = 'logistic' | 'lorenz' | 'henon';
export type FractalType = 'weierstrass' | 'mandelbrot' | 'julia';
export type FilterType = 'powerlaw' | 'cosease' | 'logistic' | 'chebyshev' | 'fibonacci';

export interface AppParameters {
  sourceType: 'oscillators' | 'file' | 'granular';
  playbackRate: number; // Used for file source & osc baseFreq
  modDepth: number;
  modRate: number;
  chaosType: ChaosType;
  chaosR: number;
  chaosSpeed: number;
  fractalType: FractalType;
  fractalDepth: number;
  fractalScale: number;
  filterType: FilterType;
  filterCutoff: number;
  resonance: number;
  morphSlider: number;
  polarCenter: number;
  polarRadius: number;
  polarRotation: number;
  polarMapping: PolarMappingType;
  polarPetals: number;
  globalSpeed: number;
  scaleLock: boolean;
  // Granular params
  grainDensity: number;
  grainDuration: number;
  grainPosition: number;
  grainSpread: number;
}

export type ParameterId = keyof Omit<AppParameters, 'sourceType' | 'chaosType' | 'fractalType' | 'filterType' | 'polarMapping' | 'scaleLock'>;
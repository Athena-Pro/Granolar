import { AppParameters, ModuleStates, Grain } from '../types';

interface OscillatorGroup {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  harmonic: number;
}

interface KeyboardVoice {
  osc: OscillatorNode;
  gain: GainNode;
}

interface GrainVoice {
    source: AudioBufferSourceNode;
    gain: GainNode;
    panner: StereoPannerNode;
    stopTime: number;
}

let nextGrainId = 0;

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  public analyser: AnalyserNode | null = null;
  private isRunning = false;
  
  // Sources
  private oscillators: OscillatorGroup[] = [];
  private audioBuffer: AudioBuffer | null = null;
  private fileSourceNode: AudioBufferSourceNode | null = null;
  private fileGain: GainNode | null = null;
  private fileFilter: BiquadFilterNode | null = null;

  // Granular Engine
  private grainSchedulerInterval: number | null = null;
  private activeGrainVoices: Map<number, GrainVoice> = new Map();
  public activeGrains: Grain[] = [];


  private keyboardVoices: Map<number, KeyboardVoice> = new Map();
  public oscillatorFreqs: number[] = Array(8).fill(0);

  private chaosX = 0.5;
  private chaosY = 0.5;
  private chaosZ = 0.5;
  private totalTime = 0;

  private updateLoopId: number | null = null;

  private currentParams: AppParameters = null!;
  private moduleStates: ModuleStates = null!;
  private scaleFrequencies: number[] = [];

  public async init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.audioContext.destination);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.connect(this.masterGain);
    }
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
  }
  
  public async loadAudioData(audioData: ArrayBuffer): Promise<boolean> {
      if (!this.audioContext) return false;
      try {
          this.audioBuffer = await this.audioContext.decodeAudioData(audioData);
          return true;
      } catch(e) {
          console.error("Error decoding audio data", e);
          this.audioBuffer = null;
          return false;
      }
  }

  public start(params: AppParameters, moduleStates: ModuleStates, scaleFrequencies: number[]) {
    if (this.isRunning || !this.audioContext) return;
    this.currentParams = params;
    this.moduleStates = moduleStates;
    this.scaleFrequencies = scaleFrequencies;
    this.totalTime = 0;
    
    switch(params.sourceType) {
        case 'granular':
            if (this.audioBuffer) this.startGranularSynthesis();
            break;
        case 'file':
            if (this.audioBuffer) this.createFileSourceSynthesis();
            break;
        case 'oscillators':
        default:
            this.createOscillatorSynthesis();
            break;
    }

    this.isRunning = true;
    this.updateLoopId = requestAnimationFrame(this.updateLoop);
  }

  public stop() {
    if (!this.isRunning) return;
    
    this.oscillators.forEach(({ osc }) => osc.stop(0));
    this.oscillators = [];
    
    this.fileSourceNode?.stop(0);
    this.fileSourceNode = null;
    
    this.stopGranularSynthesis();
    
    this.keyboardVoices.forEach(voice => voice.osc.stop(0));
    this.keyboardVoices.clear();
    
    this.isRunning = false;
    if (this.updateLoopId) {
        cancelAnimationFrame(this.updateLoopId);
        this.updateLoopId = null;
    }
  }

  public updateParameters(params: AppParameters, moduleStates: ModuleStates, scaleFrequencies: number[]) {
    this.currentParams = params;
    this.moduleStates = moduleStates;
    this.scaleFrequencies = scaleFrequencies;
  }

  private createOscillatorSynthesis() {
      if (!this.audioContext || !this.analyser) return;

      const numHarmonics = 8;
      for (let i = 1; i <= numHarmonics; i++) {
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          const filter = this.audioContext.createBiquadFilter();

          osc.type = 'sine';
          gain.gain.value = 1 / (i * 2);
          filter.type = 'lowpass';
          
          osc.connect(gain);
          gain.connect(filter);
          filter.connect(this.analyser);
          
          osc.start();
          this.oscillators.push({ osc, gain, filter, harmonic: i });
      }
  }

  private createFileSourceSynthesis() {
      if (!this.audioContext || !this.audioBuffer || !this.analyser) return;

      this.fileSourceNode = this.audioContext.createBufferSource();
      this.fileSourceNode.buffer = this.audioBuffer;
      this.fileSourceNode.loop = true;

      this.fileGain = this.audioContext.createGain();
      this.fileFilter = this.audioContext.createBiquadFilter();
      
      this.fileSourceNode.connect(this.fileGain);
      this.fileGain.connect(this.fileFilter);
      this.fileFilter.connect(this.analyser);

      this.fileSourceNode.start();
  }
  
  private startGranularSynthesis() {
      if (this.grainSchedulerInterval) clearInterval(this.grainSchedulerInterval);
      
      if (!this.fileFilter && this.audioContext) {
        this.fileFilter = this.audioContext.createBiquadFilter();
        this.fileFilter.connect(this.analyser!);
      }
      
      this.grainSchedulerInterval = window.setInterval(() => {
          if (!this.isRunning || !this.currentParams) return;
          const { grainDensity } = this.currentParams;
          const targetGrainsPerSecond = grainDensity * this.currentParams.globalSpeed;
          
          // Spawn grains based on a probability to handle different densities smoothly
          const grainsPerTick = targetGrainsPerSecond / 60; // Scheduler runs at 60Hz
          const spawnCount = Math.floor(grainsPerTick);
          const spawnProbability = grainsPerTick - spawnCount;

          for(let i = 0; i < spawnCount; i++) {
              this.spawnGrain();
          }
          if (Math.random() < spawnProbability) {
              this.spawnGrain();
          }
          
      }, 1000 / 60);
  }
  
  private stopGranularSynthesis() {
      if (this.grainSchedulerInterval) {
          clearInterval(this.grainSchedulerInterval);
          this.grainSchedulerInterval = null;
      }
      this.activeGrainVoices.forEach(voice => {
          voice.source.stop(0);
      });
      this.activeGrainVoices.clear();
      this.activeGrains = [];
      if (this.fileFilter) {
          this.fileFilter.disconnect();
          this.fileFilter = null;
      }
  }

  private spawnGrain() {
      if (!this.audioContext || !this.audioBuffer || !this.analyser) return;

      const { grainDuration, grainPosition, grainSpread, globalSpeed } = this.currentParams;
      const actualDuration = grainDuration / globalSpeed;

      // Determine grain source position
      let sourcePos = grainPosition;
      if (this.moduleStates.chaos) {
          sourcePos += (this.getChaosValue() - 0.5) * grainSpread;
      } else {
          sourcePos += (Math.random() - 0.5) * grainSpread;
      }
      sourcePos = Math.max(0, Math.min(1, sourcePos));
      const startOffset = sourcePos * this.audioBuffer.duration;

      // Determine grain properties from Polar mapping
      const grainAngle = (this.totalTime * this.currentParams.polarRotation * 2 * Math.PI) % (2 * Math.PI);
      const polarProps = this.getPolarProperties(grainAngle, this.totalTime);

      let playbackRate = this.moduleStates.polar ? polarProps.pitch : 1.0;
      if (this.currentParams.scaleLock) {
          const baseFreq = 440 * playbackRate;
          const quantizedFreq = this.quantizeFrequency(baseFreq);
          playbackRate = quantizedFreq / 440;
      }
      
      const pan = this.moduleStates.polar ? polarProps.pan : 0;
      
      // Determine amplitude
      let amplitude = 0.5;
      if (this.moduleStates.fractal) {
          amplitude *= this.getFractalAmplitude(4, this.totalTime); // Use mid-harmonic for complexity
      }

      // Create AudioNodes
      const now = this.audioContext.currentTime;
      const source = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();
      const panner = this.audioContext.createStereoPanner();
      
      source.buffer = this.audioBuffer;
      source.playbackRate.value = Math.max(0.1, playbackRate);
      panner.pan.value = pan;
      
      // Apply envelope to prevent clicks
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amplitude, now + actualDuration * 0.5);
      gain.gain.linearRampToValueAtTime(0, now + actualDuration);
      
      source.connect(gain);
      gain.connect(panner);
      
      // Apply master filter if enabled
      if (this.moduleStates.filter && this.fileFilter) {
          panner.connect(this.fileFilter);
      } else {
          panner.connect(this.analyser!);
      }
      
      source.start(now, startOffset, actualDuration * 2); // Play a bit longer to allow for envelope
      const stopTime = now + actualDuration;
      source.stop(stopTime);

      const grainId = nextGrainId++;
      this.activeGrainVoices.set(grainId, { source, gain, panner, stopTime });
      
      // For visualization
      this.activeGrains.push({ id: grainId, sourcePosition: sourcePos, playbackRate, pan, amplitude });

      // Cleanup
      setTimeout(() => {
          this.activeGrainVoices.delete(grainId);
          this.activeGrains = this.activeGrains.filter(g => g.id !== grainId);
      }, actualDuration * 1000 + 100);
  }


  private quantizeFrequency = (freq: number): number => {
      if (!this.scaleFrequencies || this.scaleFrequencies.length === 0) return freq;
      
      let closestFreq = this.scaleFrequencies[0];
      let smallestDiff = Math.abs(Math.log2(freq / closestFreq));
      
      for (let i = 1; i < this.scaleFrequencies.length; i++) {
          const scaleFreq = this.scaleFrequencies[i];
          const diff = Math.abs(Math.log2(freq / scaleFreq));
          if (diff < smallestDiff) {
              smallestDiff = diff;
              closestFreq = scaleFreq;
          }
      }
      return closestFreq;
  }

  private updateLoop = () => {
    if (!this.isRunning || !this.audioContext) return;
    
    this.totalTime += (1/60.0) * this.currentParams.globalSpeed;
    
    this.updateChaos();
    const chaosValue = this.getChaosValue();

    switch(this.currentParams.sourceType) {
        case 'oscillators': this.updateOscillators(this.totalTime, chaosValue); break;
        case 'file': this.updateFileSource(this.totalTime, chaosValue); break;
        case 'granular': 
            // The master filter is the only thing to modulate continuously for granular
            if (this.moduleStates.filter && this.fileFilter) {
                const filterFreq = this.getFilterCutoff(4);
                if (isFinite(filterFreq)) this.fileFilter.frequency.setValueAtTime(filterFreq, this.audioContext.currentTime);
                if (isFinite(this.currentParams.resonance)) this.fileFilter.Q.setValueAtTime(this.currentParams.resonance, this.audioContext.currentTime);
            }
            break;
    }

    this.updateLoopId = requestAnimationFrame(this.updateLoop);
  }

  private updateOscillators(time: number, chaosValue: number) {
      if (!this.audioContext) return;
      const { playbackRate, modDepth, modRate, globalSpeed } = this.currentParams;

      this.oscillators.forEach(({ osc, gain, filter, harmonic }) => {
          const timeModulation = this.moduleStates.modulation ? modDepth * Math.sin(2 * Math.PI * modRate * time) : 0;
          const chaosModulation = this.moduleStates.chaos ? (chaosValue - 0.5) * 100 : 0;
          const polarFreq = this.moduleStates.polar ? this.getPolarFrequency(harmonic, time) : playbackRate;
          
          let finalFrequency = playbackRate + timeModulation + chaosModulation;
          if(this.moduleStates.polar) {
              finalFrequency += (polarFreq - this.currentParams.polarCenter);
          }
          finalFrequency *= this.getHarmonicMultiplier(harmonic);

          if (this.currentParams.scaleLock) {
              finalFrequency = this.quantizeFrequency(finalFrequency);
          }
          this.oscillatorFreqs[harmonic - 1] = finalFrequency;
          
          const safeFreq = Math.max(20, Math.min(this.audioContext.sampleRate / 2, finalFrequency));
          if (isFinite(safeFreq)) osc.frequency.setValueAtTime(safeFreq, this.audioContext.currentTime);
          
          const fractalAmp = this.moduleStates.fractal ? this.getFractalAmplitude(harmonic, time) : 1.0;
          const safeGain = Math.max(0, Math.min(1, fractalAmp / (harmonic * 1.5)));
          if(isFinite(safeGain)) gain.gain.setValueAtTime(safeGain, this.audioContext.currentTime);

          const filterFreq = this.moduleStates.filter ? this.getFilterCutoff(harmonic) : 20000;
          if(isFinite(filterFreq)) filter.frequency.setValueAtTime(filterFreq, this.audioContext.currentTime);
          if(isFinite(this.currentParams.resonance)) filter.Q.setValueAtTime(this.currentParams.resonance, this.audioContext.currentTime);
      });
  }

  private updateFileSource(time: number, chaosValue: number) {
      if (!this.audioContext || !this.fileSourceNode || !this.fileGain || !this.fileFilter) return;

      const { playbackRate, modDepth, modRate, globalSpeed } = this.currentParams;
      let finalPlaybackRate = playbackRate;
      if (this.moduleStates.modulation) {
          finalPlaybackRate += (modDepth / 400) * Math.sin(2 * Math.PI * modRate * time);
      }
      if (this.moduleStates.chaos) {
          finalPlaybackRate += (chaosValue - 0.5) * 0.5;
      }
      const safeRate = Math.max(0.1, Math.min(8, finalPlaybackRate)) * globalSpeed;
      if(isFinite(safeRate)) this.fileSourceNode.playbackRate.setValueAtTime(safeRate, this.audioContext.currentTime);

      const fractalAmp = this.moduleStates.fractal ? this.getFractalAmplitude(4, time) : 1.0;
      if(isFinite(fractalAmp)) this.fileGain.gain.setValueAtTime(fractalAmp, this.audioContext.currentTime);

      const filterFreq = this.moduleStates.filter ? this.getFilterCutoff(4) : 20000;
      if(isFinite(filterFreq)) this.fileFilter.frequency.setValueAtTime(filterFreq, this.audioContext.currentTime);
      if(isFinite(this.currentParams.resonance)) this.fileFilter.Q.setValueAtTime(this.currentParams.resonance, this.audioContext.currentTime);
  }

  public playKeyboardNote(frequency: number, keyIndex: number) {
      if (!this.audioContext || !this.masterGain || this.keyboardVoices.has(keyIndex)) return;

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      
      gain.gain.setValueAtTime(0, this.audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, this.audioContext.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();

      this.keyboardVoices.set(keyIndex, { osc, gain });
  }

  public stopKeyboardNote(keyIndex: number) {
      if (!this.audioContext || !this.keyboardVoices.has(keyIndex)) return;
      const voice = this.keyboardVoices.get(keyIndex)!;
      const now = this.audioContext.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.2);
      voice.osc.stop(now + 0.2);
      this.keyboardVoices.delete(keyIndex);
  }

  private getHarmonicMultiplier = (harmonic: number): number => {
      const { fractalType } = this.currentParams;
      if (!this.moduleStates.fractal) return harmonic;
      switch(fractalType) {
          case 'weierstrass': return Math.pow(this.currentParams.fractalScale + 1, harmonic - 1);
          case 'mandelbrot': return harmonic;
          case 'julia': const primes = [1, 2, 3, 5, 7, 11, 13, 17]; return primes[harmonic - 1] || harmonic;
          default: return harmonic;
      }
  }
  
  private getChaosValue = (): number => {
      const { chaosType } = this.currentParams;
      switch(chaosType) {
          case 'lorenz': return (this.chaosX + 20) / 40;
          case 'henon': return (this.chaosY + 1.5) / 3;
          case 'logistic':
          default:
              return this.chaosX;
      }
  }
  
  private getPolarProperties(theta: number, time: number): { pitch: number, pan: number } {
    const { polarCenter, polarRadius, polarMapping, polarPetals, globalSpeed } = this.currentParams;
    const n = polarPetals;

    let radiusMod = 0;

    switch(polarMapping) {
        case 'sine': radiusMod = Math.sin(n * theta); break;
        case 'spiral': radiusMod = Math.exp(0.1 * (theta % (2 * Math.PI))) * Math.cos(theta) * 0.5; break;
        case 'rose': radiusMod = Math.cos(n * theta); break;
        case 'lissajous': {
            const x = Math.cos(theta);
            const y = Math.sin(n * theta);
            radiusMod = Math.sqrt(x*x + y*y) / Math.sqrt(2) * (x * Math.cos(time) + y * Math.sin(time));
            break;
        }
        case 'cardioid': radiusMod = 0.5 * (1 + Math.cos(n * theta)) * Math.sin(theta + Math.PI/4); break;
        case 'hypocycloid': {
            const k = n;
            const x = (k-1) * Math.cos(theta) + Math.cos((k-1)*theta);
            const y = (k-1) * Math.sin(theta) - Math.sin((k-1)*theta);
            radiusMod = Math.sqrt(x*x + y*y) / (2*k) * (x * Math.cos(theta) + y * Math.sin(theta)) / k;
            break;
        }
        default: radiusMod = Math.cos(theta);
    }
    const pitch = polarCenter + radiusMod * polarRadius;
    const pan = Math.cos(theta);

    return { pitch, pan };
  }

  private getPolarFrequency(harmonic: number, time: number): number {
      const theta = (time * this.currentParams.polarRotation * 2 * Math.PI + (harmonic-1) * (Math.PI*2/8)) % (Math.PI*2);
      const polarProps = this.getPolarProperties(theta, time);
      return this.currentParams.polarCenter + (polarProps.pitch - 1.0) * this.currentParams.polarRadius * 100;
  }

  private updateChaos() {
      if (!this.moduleStates.chaos) return;

      const { chaosType, chaosR, chaosSpeed, globalSpeed } = this.currentParams;
      const dt = chaosSpeed * globalSpeed / 60.0;

      switch (chaosType) {
          case 'logistic':
              this.chaosX = chaosR * this.chaosX * (1 - this.chaosX);
              break;
          case 'lorenz': {
              const sigma = 10, rho = 28, beta = 8 / 3;
              const dx = sigma * (this.chaosY - this.chaosX);
              const dy = this.chaosX * (rho - this.chaosZ) - this.chaosY;
              const dz = this.chaosX * this.chaosY - beta * this.chaosZ;
              this.chaosX += dx * dt;
              this.chaosY += dy * dt;
              this.chaosZ += dz * dt;
              // Clamp values to prevent explosion
              this.chaosX = Math.max(-40, Math.min(40, this.chaosX));
              this.chaosY = Math.max(-40, Math.min(40, this.chaosY));
              this.chaosZ = Math.max(0, Math.min(80, this.chaosZ));
              break;
          }
          case 'henon': {
              const a = 1.4, b = 0.3;
              const nextX = 1 - a * this.chaosX * this.chaosX + this.chaosY;
              const nextY = b * this.chaosX;
              this.chaosX = nextX;
              this.chaosY = nextY;
              // Clamp values to prevent explosion
              this.chaosX = Math.max(-1.5, Math.min(1.5, this.chaosX));
              this.chaosY = Math.max(-1.5, Math.min(1.5, this.chaosY));
              break;
          }
      }
      if (chaosType === 'logistic') {
        this.chaosX = (this.chaosX % 1 + 1) % 1;
      }
  }

  private getFractalAmplitude = (harmonic: number, time: number): number => {
      const { fractalType, fractalDepth, fractalScale } = this.currentParams;
      let amp = 0.0;

      switch (fractalType) {
          case 'weierstrass':
              for (let i = 0; i < fractalDepth; i++) {
                  amp += Math.cos(Math.pow(3, i) * (time + harmonic)) * Math.pow(fractalScale, i);
              }
              return (amp / fractalDepth) * 0.5 + 0.5;
          case 'mandelbrot': {
              let z = (harmonic / 8) * 2 - 1 + time % 2 - 1;
              let c = fractalScale - 1;
              let iter = 0;
              while(z < 2 && iter < fractalDepth * 5) {
                  z = z*z + c;
                  iter++;
              }
              return iter / (fractalDepth * 5);
          }
          case 'julia': {
              let z2 = (harmonic / 8) * 2 - 1 + time % 2 - 1;
              let c2 = fractalScale * 2 - 1;
              let iter2 = 0;
              while(z2 < 2 && iter2 < fractalDepth * 5) {
                  z2 = z2*z2 + c2;
                  iter2++;
              }
              return iter2 / (fractalDepth * 5);
          }
      }
      return 1.0;
  }

  private getFilterCutoff = (harmonic: number): number => {
      if (!this.audioContext) return 20000;
      const { filterType, filterCutoff, morphSlider } = this.currentParams;
      const chaosVal = this.getChaosValue();
      const baseCutoff = Math.pow(filterCutoff, 2) * (this.audioContext.sampleRate / 2 - 200) + 200;
      let dynamicCutoff = baseCutoff;

      switch (filterType) {
          case 'powerlaw':
              dynamicCutoff *= 1 / Math.pow(harmonic, morphSlider);
              break;
          case 'cosease':
              dynamicCutoff *= (1 - morphSlider) + morphSlider * (0.5 * (1 - Math.cos(Math.PI * harmonic / 8)));
              break;
          case 'logistic':
              dynamicCutoff *= (1 - morphSlider) + morphSlider * chaosVal;
              break;
          case 'chebyshev':
              dynamicCutoff *= Math.abs(Math.cos(harmonic * Math.acos(morphSlider)));
              break;
          case 'fibonacci':
              const fib = (n: number): number => n <= 1 ? n : fib(n - 1) + fib(n - 2);
              dynamicCutoff *= 1 - (fib(harmonic) % 10 / 10) * morphSlider;
              break;
      }

      return Math.max(20, Math.min(this.audioContext.sampleRate / 2, dynamicCutoff));
  }
}
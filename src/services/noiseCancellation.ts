/**
 * Real-time Web Audio API Noise Cancellation & Voice Enhancement Engine
 */
export class NoiseCancellationProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isEnabled: boolean = true;
  private processedStream: MediaStream | null = null;

  constructor(enabled: boolean = true) {
    this.isEnabled = enabled;
  }

  /**
   * Processes an incoming raw mic stream through a studio-grade DSP chain:
   * 1. High-pass filter at 85Hz (eliminates HVAC, table vibration, mic handling thumps)
   * 2. Low-pass filter at 3600Hz (eliminates high-pitch electronic hiss & coil whine)
   * 3. Dynamics Compressor (levels out voice, dampens background spikes)
   * 4. MediaStream destination
   */
  public processStream(rawStream: MediaStream): MediaStream {
    if (typeof window === 'undefined') return rawStream;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return rawStream;

      this.audioContext = new AudioCtx();
      this.sourceNode = this.audioContext.createMediaStreamSource(rawStream);
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      // High-pass filter (85Hz)
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.7;

      // Low-pass speech band filter (3800Hz)
      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = 3800;
      this.lowpassFilter.Q.value = 0.7;

      // Dynamics Compressor (Studio Vocal Leveler & Noise Gate)
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-28, this.audioContext.currentTime);
      this.compressor.knee.setValueAtTime(30, this.audioContext.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.audioContext.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);

      // Analyser for real-time visual meter
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;

      if (this.isEnabled) {
        // Connect DSP chain
        this.sourceNode
          .connect(this.highpassFilter)
          .connect(this.lowpassFilter)
          .connect(this.compressor)
          .connect(this.analyser)
          .connect(this.destinationNode);
      } else {
        // Direct bypass
        this.sourceNode.connect(this.analyser).connect(this.destinationNode);
      }

      // Combine processed audio track with any existing video tracks
      const audioTrack = this.destinationNode.stream.getAudioTracks()[0];
      const videoTracks = rawStream.getVideoTracks();

      this.processedStream = new MediaStream([audioTrack, ...videoTracks]);
      return this.processedStream;
    } catch (e) {
      console.warn('Could not setup Web Audio noise cancellation DSP, using raw stream:', e);
      return rawStream;
    }
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!this.audioContext || !this.sourceNode || !this.destinationNode) return;

    try {
      this.sourceNode.disconnect();
      if (this.isEnabled && this.highpassFilter && this.lowpassFilter && this.compressor && this.analyser) {
        this.sourceNode
          .connect(this.highpassFilter)
          .connect(this.lowpassFilter)
          .connect(this.compressor)
          .connect(this.analyser)
          .connect(this.destinationNode);
      } else if (this.analyser) {
        this.sourceNode.connect(this.analyser).connect(this.destinationNode);
      }
    } catch (e) {
      console.warn('Error toggling noise cancellation state:', e);
    }
  }

  public getAudioLevel(): number {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return Math.min(100, Math.round((sum / dataArray.length / 255) * 100));
  }

  public dispose() {
    try {
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Standard getUserMedia constraints with hardware-assisted Noise Cancellation
 */
export function getOptimizedAudioConstraints(noiseCancellationActive: boolean = true): MediaTrackConstraints {
  return {
    echoCancellation: noiseCancellationActive,
    noiseSuppression: noiseCancellationActive,
    autoGainControl: noiseCancellationActive,
    channelCount: 1,
    sampleRate: 48000,
  };
}

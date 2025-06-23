/**
 * Audio Service
 * Centralized audio management for game sound effects
 */

export class AudioService {
	private audioContext: AudioContext | null = null;
	private soundEnabled = true;
	private masterVolume = 1.0;

	constructor() {
		this.initializeAudioContext();
	}

	private async initializeAudioContext(): Promise<void> {
		try {
			this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
			console.log('AudioContext initialized, state:', this.audioContext.state);
		} catch (e) {
			console.warn('AudioContext not supported, sounds disabled');
			this.soundEnabled = false;
		}
	}

	public async resumeAudioContext(): Promise<void> {
		if (!this.audioContext || !this.soundEnabled) return;

		try {
			if (this.audioContext.state === 'suspended') {
				await this.audioContext.resume();
				console.log('Audio context resumed');
			}
		} catch (e) {
			console.warn('Failed to resume audio context:', e);
		}
	}

	public setSoundEnabled(enabled: boolean): void {
		this.soundEnabled = enabled;
	}

	public setMasterVolume(volume: number): void {
		this.masterVolume = Math.max(0, Math.min(1, volume));
	}

	public async playPopSound(): Promise<void> {
		if (!this.soundEnabled || !this.audioContext) return;

		try {
			await this.resumeAudioContext();

			// Create a bright "pop" sound for target hits
			const compressor = this.audioContext.createDynamicsCompressor();
			const masterGain = this.audioContext.createGain();

			// Set up compressor for snappy sound
			compressor.threshold.setValueAtTime(-5, this.audioContext.currentTime);
			compressor.knee.setValueAtTime(5, this.audioContext.currentTime);
			compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
			compressor.attack.setValueAtTime(0, this.audioContext.currentTime);
			compressor.release.setValueAtTime(0.1, this.audioContext.currentTime);

			// Set master gain
			masterGain.gain.setValueAtTime(5.0 * this.masterVolume, this.audioContext.currentTime);

			masterGain.connect(compressor);
			compressor.connect(this.audioContext.destination);

			// High frequency pop oscillator
			const popOsc = this.audioContext.createOscillator();
			const popGain = this.audioContext.createGain();
			popOsc.connect(popGain);
			popGain.connect(masterGain);

			// Noise burst for attack
			const noiseBuffer = this.audioContext.createBuffer(
				1,
				this.audioContext.sampleRate * 0.05,
				this.audioContext.sampleRate
			);
			const noiseData = noiseBuffer.getChannelData(0);
			for (let i = 0; i < noiseData.length; i++) {
				noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 3);
			}

			const noiseSource = this.audioContext.createBufferSource();
			const noiseGain = this.audioContext.createGain();
			const noiseFilter = this.audioContext.createBiquadFilter();

			noiseSource.buffer = noiseBuffer;
			noiseSource.connect(noiseFilter);
			noiseFilter.connect(noiseGain);
			noiseGain.connect(masterGain);

			// High-pass filter for bright pop
			noiseFilter.type = 'highpass';
			noiseFilter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
			noiseFilter.frequency.exponentialRampToValueAtTime(
				4000,
				this.audioContext.currentTime + 0.02
			);

			// Pop frequency sweep (higher pitched than hip sway)
			popOsc.frequency.setValueAtTime(800, this.audioContext.currentTime);
			popOsc.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.01);
			popOsc.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.05);

			// Pop envelope - very quick attack, quick decay
			popGain.gain.setValueAtTime(0, this.audioContext.currentTime);
			popGain.gain.linearRampToValueAtTime(0.8, this.audioContext.currentTime + 0.002);
			popGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.08);

			// Noise envelope - very quick burst
			noiseGain.gain.setValueAtTime(0, this.audioContext.currentTime);
			noiseGain.gain.linearRampToValueAtTime(0.6, this.audioContext.currentTime + 0.001);
			noiseGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.03);

			popOsc.type = 'sawtooth'; // Sawtooth for brighter sound

			// Start sounds
			popOsc.start(this.audioContext.currentTime);
			popOsc.stop(this.audioContext.currentTime + 0.08);
			noiseSource.start(this.audioContext.currentTime);
			noiseSource.stop(this.audioContext.currentTime + 0.05);

			console.log('Pop sound played successfully');
		} catch (e) {
			console.warn('Error playing pop sound:', e);
			this.soundEnabled = false;
		}
	}

	public async playHipSwaySound(): Promise<void> {
		if (!this.soundEnabled || !this.audioContext) return;

		try {
			await this.resumeAudioContext();

			// Create the existing "thump" sound for hip sway
			const compressor = this.audioContext.createDynamicsCompressor();
			const masterGain = this.audioContext.createGain();

			// Set up compressor for punch
			compressor.threshold.setValueAtTime(-10, this.audioContext.currentTime);
			compressor.knee.setValueAtTime(10, this.audioContext.currentTime);
			compressor.ratio.setValueAtTime(8, this.audioContext.currentTime);
			compressor.attack.setValueAtTime(0, this.audioContext.currentTime);
			compressor.release.setValueAtTime(0.15, this.audioContext.currentTime);

			// Set master gain
			masterGain.gain.setValueAtTime(10.0 * this.masterVolume, this.audioContext.currentTime);

			masterGain.connect(compressor);
			compressor.connect(this.audioContext.destination);

			// Bass thump - low frequency for body
			const bassOsc = this.audioContext.createOscillator();
			const bassGain = this.audioContext.createGain();
			bassOsc.connect(bassGain);
			bassGain.connect(masterGain);

			// Noise burst for attack/click
			const noiseBuffer = this.audioContext.createBuffer(
				1,
				this.audioContext.sampleRate * 0.1,
				this.audioContext.sampleRate
			);
			const noiseData = noiseBuffer.getChannelData(0);
			for (let i = 0; i < noiseData.length; i++) {
				noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 2);
			}

			const noiseSource = this.audioContext.createBufferSource();
			const noiseGain = this.audioContext.createGain();
			const noiseFilter = this.audioContext.createBiquadFilter();

			noiseSource.buffer = noiseBuffer;
			noiseSource.connect(noiseFilter);
			noiseFilter.connect(noiseGain);
			noiseGain.connect(masterGain);

			// Filter the noise for more natural sound
			noiseFilter.type = 'lowpass';
			noiseFilter.frequency.setValueAtTime(800, this.audioContext.currentTime);
			noiseFilter.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.05);

			// Bass frequency sweep (like a kick drum)
			bassOsc.frequency.setValueAtTime(60, this.audioContext.currentTime);
			bassOsc.frequency.exponentialRampToValueAtTime(30, this.audioContext.currentTime + 0.1);

			// Bass envelope - quick attack, longer decay
			bassGain.gain.setValueAtTime(0, this.audioContext.currentTime);
			bassGain.gain.linearRampToValueAtTime(1.2, this.audioContext.currentTime + 0.005);
			bassGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

			// Noise envelope - very quick attack for "thump" character
			noiseGain.gain.setValueAtTime(0, this.audioContext.currentTime);
			noiseGain.gain.linearRampToValueAtTime(0.7, this.audioContext.currentTime + 0.002);
			noiseGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05);

			bassOsc.type = 'sine'; // Sine wave for clean bass

			// Start all sounds
			bassOsc.start(this.audioContext.currentTime);
			bassOsc.stop(this.audioContext.currentTime + 0.2);
			noiseSource.start(this.audioContext.currentTime);
			noiseSource.stop(this.audioContext.currentTime + 0.1);

			console.log('Hip sway sound played successfully');
		} catch (e) {
			console.warn('Error playing hip sway sound:', e);
			this.soundEnabled = false;
		}
	}

	public destroy(): void {
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}
	}
}

// Export singleton instance
export const audioService = new AudioService();

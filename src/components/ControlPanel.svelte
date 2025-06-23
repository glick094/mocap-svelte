<script>
	import { createEventDispatcher } from 'svelte';

	export let userSettings = {};
	export let canvasSettings = {
		width: 800,
		height: 600,
		frameColor: '#333'
	};

	const dispatch = createEventDispatcher();

	let isRecording = false;
	let isWebcamActive = false;

	function toggleWebcam() {
		isWebcamActive = !isWebcamActive;
		dispatch('toggleWebcam');
	}

	function toggleRecording() {
		isRecording = !isRecording;
		// Here you could implement actual recording logic
		console.log(isRecording ? 'Started recording' : 'Stopped recording');
	}

	function openSettings() {
		dispatch('openSettings');
	}

	function resetCanvas() {
		canvasSettings = {
			width: 800,
			height: 600,
			frameColor: '#333'
		};
		// Dispatch canvas reset event
		console.log('Canvas reset to defaults');
	}

	function takeScreenshot() {
		// This would capture the current 3D scene
		console.log('Taking screenshot...');
		// Implementation would involve canvas.toDataURL() or similar
	}

	// Preset canvas sizes
	const canvasPresets = [
		{ name: 'Small', width: 600, height: 400 },
		{ name: 'Medium', width: 800, height: 600 },
		{ name: 'Large', width: 1200, height: 800 },
		{ name: 'HD', width: 1920, height: 1080 }
	];

	function applyCanvasPreset(preset) {
		canvasSettings.width = preset.width;
		canvasSettings.height = preset.height;
		canvasSettings = { ...canvasSettings }; // Trigger reactivity
	}
</script>

<div class="control-panel">
	<div class="panel-header">
		<h3>🎛️ Controls</h3>
	</div>

	<!-- Primary Actions -->
	<div class="control-section">
		<h4>Camera & Recording</h4>
		<div class="button-group">
			<button class="control-btn primary" class:active={isWebcamActive} on:click={toggleWebcam}>
				{isWebcamActive ? '📹' : '📷'}
				{isWebcamActive ? 'Stop' : 'Start'} Camera
			</button>

			<button
				class="control-btn"
				class:recording={isRecording}
				on:click={toggleRecording}
				disabled={!isWebcamActive}
			>
				{isRecording ? '⏹️' : '🔴'}
				{isRecording ? 'Stop' : 'Record'}
			</button>
		</div>
	</div>

	<!-- Canvas Controls -->
	<div class="control-section">
		<h4>Canvas Settings</h4>

		<div class="control-group">
			<span class="control-group-label">Size Presets:</span>
			<div class="preset-buttons">
				{#each canvasPresets as preset}
					<button
						class="preset-btn"
						class:active={canvasSettings.width === preset.width &&
							canvasSettings.height === preset.height}
						on:click={() => applyCanvasPreset(preset)}
					>
						{preset.name}
					</button>
				{/each}
			</div>
		</div>

		<div class="control-group">
			<label for="fps-setting">MediaPipe FPS:</label>
			<input
				id="fps-setting"
				type="range"
				min="5"
				max="30"
				step="5"
				bind:value={userSettings.fps}
				class="fps-slider"
			/>
			<span class="fps-value">{userSettings.fps} FPS</span>
		</div>

		<div class="control-group">
			<label for="frame-color">Frame Color:</label>
			<input
				id="frame-color"
				type="color"
				bind:value={canvasSettings.frameColor}
				class="color-input"
			/>
		</div>

		<div class="size-controls">
			<div class="size-input">
				<label for="canvas-width">Width:</label>
				<input
					id="canvas-width"
					type="number"
					bind:value={canvasSettings.width}
					min="200"
					max="2000"
					step="50"
				/>
			</div>
			<div class="size-input">
				<label for="canvas-height">Height:</label>
				<input
					id="canvas-height"
					type="number"
					bind:value={canvasSettings.height}
					min="200"
					max="2000"
					step="50"
				/>
			</div>
		</div>
	</div>

	<!-- Utility Actions -->
	<div class="control-section">
		<h4>Actions</h4>
		<div class="button-group vertical">
			<button class="control-btn secondary" on:click={takeScreenshot}> 📸 Screenshot </button>

			<button class="control-btn secondary" on:click={resetCanvas}> 🔄 Reset Canvas </button>

			<button class="control-btn secondary" on:click={openSettings}> ⚙️ Settings </button>
		</div>
	</div>

	<!-- Status Info -->
	<div class="status-section">
		<div class="status-item">
			<span class="status-label">Theme:</span>
			<span class="status-value">{userSettings.theme || 'dark'}</span>
		</div>
		<div class="status-item">
			<span class="status-label">Quality:</span>
			<span class="status-value">{userSettings.quality || 'high'}</span>
		</div>
		<div class="status-item">
			<span class="status-label">FPS:</span>
			<span class="status-value">{userSettings.fps || 15}</span>
		</div>
		<div class="status-item">
			<span class="status-label">Canvas:</span>
			<span class="status-value">{canvasSettings.width}×{canvasSettings.height}</span>
		</div>
	</div>
</div>

<style>
	.control-panel {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.panel-header h3 {
		margin: 0;
		font-size: 1rem;
		color: #fff;
	}

	.control-section {
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 1rem;
	}

	.control-section:last-of-type {
		border-bottom: none;
		padding-bottom: 0;
	}

	.control-section h4 {
		margin: 0 0 0.75rem 0;
		font-size: 0.85rem;
		color: #00ff88;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.button-group {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.button-group.vertical {
		flex-direction: column;
	}

	.control-btn {
		padding: 0.5rem 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.1);
		color: white;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 0.8rem;
		flex: 1;
		min-width: 0;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	.control-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.control-btn.primary {
		background: rgba(0, 255, 136, 0.2);
		border-color: rgba(0, 255, 136, 0.5);
	}

	.control-btn.primary:hover {
		background: rgba(0, 255, 136, 0.3);
	}

	.control-btn.primary.active {
		background: rgba(0, 255, 136, 0.4);
		box-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
	}

	.control-btn.recording {
		background: rgba(255, 68, 68, 0.3);
		border-color: rgba(255, 68, 68, 0.5);
		animation: pulse-red 1s infinite;
	}

	@keyframes pulse-red {
		0%,
		100% {
			box-shadow: 0 0 5px rgba(255, 68, 68, 0.3);
		}
		50% {
			box-shadow: 0 0 15px rgba(255, 68, 68, 0.6);
		}
	}

	.control-btn.secondary {
		background: rgba(255, 255, 255, 0.05);
		font-size: 0.75rem;
	}

	.control-group {
		margin-bottom: 0.75rem;
	}

	.control-group label {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
		color: #ccc;
	}

	.control-group-label {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
		color: #ccc;
	}

	.preset-buttons {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.25rem;
	}

	.preset-btn {
		padding: 0.25rem 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
		color: white;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 0.7rem;
	}

	.preset-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.preset-btn.active {
		background: rgba(0, 255, 136, 0.2);
		border-color: rgba(0, 255, 136, 0.5);
	}

	.color-input {
		width: 40px;
		height: 30px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}

	.size-controls {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.size-input {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.size-input label {
		font-size: 0.7rem;
		color: #888;
	}

	.size-input input {
		padding: 0.25rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.05);
		color: white;
		border-radius: 3px;
		font-size: 0.75rem;
	}

	.fps-slider {
		width: 100%;
		height: 20px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		outline: none;
		margin: 0.25rem 0;
	}

	.fps-slider::-webkit-slider-thumb {
		appearance: none;
		width: 15px;
		height: 15px;
		background: #00ff88;
		border-radius: 50%;
		cursor: pointer;
	}

	.fps-slider::-moz-range-thumb {
		width: 15px;
		height: 15px;
		background: #00ff88;
		border-radius: 50%;
		cursor: pointer;
		border: none;
	}

	.fps-value {
		font-size: 0.7rem;
		color: #00ff88;
		font-weight: 500;
	}

	.status-section {
		margin-top: auto;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.status-item {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.25rem;
		font-size: 0.7rem;
	}

	.status-label {
		color: #888;
	}

	.status-value {
		color: #fff;
		font-weight: 500;
	}
</style>

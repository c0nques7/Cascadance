export class MultiTrackTimeline {
    constructor(containerId, onSeek) {
        console.log('VisualTimeline: Initializing...');
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`VisualTimeline: Container #${containerId} not found!`);
        }
        this.onSeek = onSeek;
        this.dataTracks = {
            lows: [],
            mids: [],
            highs: [],
            cameraMovement: []
        };
        this.width = 0;
        this.audioDuration = 0;
        
        // Zoom State
        this.zoomLevel = 1.0;
        this.scrollOffset = 0.0;
        
        // Color State
        this.colorParams = { hue: 0, sat: 100, shift: 0.5 };

        // Configuration
        this.chunkSize = 0.25; 
        this.colors = ['#ef4444', '#22c55e', '#3b82f6', '#ffffff', '#000000']; 
        
        this.initUI();
        this.initListeners();
        this.resize();
    }

    setColorParams(hue, sat, shift) {
        this.colorParams = { hue, sat, shift };
        this.drawTracks();
    }

    initUI() {
        this.container.innerHTML = '';
        
        // Main Container Flex Layout
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.height = '100%'; // Fill island content area
        this.container.style.background = '#000';
        this.container.style.overflow = 'hidden';

        // 1. Toolbar Section
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'timeline-toolbar';
        this.toolbar.style.display = 'flex';
        this.toolbar.style.gap = '10px';
        this.toolbar.style.padding = '4px 10px'; // Slimmer padding
        this.toolbar.style.background = 'rgba(255, 255, 255, 0.05)';
        this.toolbar.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
        this.toolbar.style.flexShrink = '0';
        this.toolbar.style.alignItems = 'center';
        this.toolbar.style.justifyContent = 'flex-end';
        this.toolbar.style.height = '30px'; // Fixed slimmer height
        
        const zoomLabel = document.createElement('span');
        zoomLabel.textContent = 'ZOOM: 1.0x';
        zoomLabel.style.fontSize = '10px';
        zoomLabel.style.color = '#888';
        zoomLabel.style.marginRight = '5px';
        this.zoomLabel = zoomLabel;

        const createBtn = (text, onClick, tooltip) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = 'icon-btn';
            btn.style.background = 'rgba(255, 255, 255, 0.1)';
            btn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            btn.style.color = '#fff';
            btn.style.width = '24px';
            btn.style.height = '24px';
            btn.style.fontSize = '14px';
            btn.style.cursor = 'pointer';
            btn.style.borderRadius = '4px';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.lineHeight = '1';
            btn.setAttribute('data-tooltip', tooltip);
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                onClick();
            });
            return btn;
        };

        const zoomOutBtn = createBtn('-', () => this.modifyZoom(-1), 'Zoom Out');
        const zoomInBtn = createBtn('+', () => this.modifyZoom(1), 'Zoom In');
        
        this.toolbar.appendChild(zoomLabel);
        this.toolbar.appendChild(zoomOutBtn);
        this.toolbar.appendChild(zoomInBtn);
        this.container.appendChild(this.toolbar);

        // 2. Canvas Wrapper
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.className = 'timeline-canvas-wrapper';
        this.canvasContainer.style.position = 'relative';
        this.canvasContainer.style.flexGrow = '1';
        this.canvasContainer.style.minHeight = '0'; 
        this.canvasContainer.style.cursor = 'crosshair';
        this.canvasContainer.style.padding = '0';
        this.container.appendChild(this.canvasContainer);

        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.canvasContainer.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.scrubber = document.createElement('div');
        this.scrubber.style.position = 'absolute';
        this.scrubber.style.top = '0';
        this.scrubber.style.bottom = '0';
        this.scrubber.style.width = '2px';
        this.scrubber.style.backgroundColor = '#fff';
        this.scrubber.style.boxShadow = '0 0 10px white';
        this.scrubber.style.pointerEvents = 'none';
        this.scrubber.style.left = '0';
        this.scrubber.style.zIndex = '10';
        this.canvasContainer.appendChild(this.scrubber);

        this.loadingOverlay = document.createElement('div');
        this.loadingOverlay.style.position = 'absolute';
        this.loadingOverlay.style.top = '0';
        this.loadingOverlay.style.left = '0';
        this.loadingOverlay.style.width = '100%';
        this.loadingOverlay.style.height = '100%';
        this.loadingOverlay.style.background = 'rgba(0, 0, 0, 0.85)';
        this.loadingOverlay.style.display = 'none';
        this.loadingOverlay.style.alignItems = 'center';
        this.loadingOverlay.style.justifyContent = 'center';
        this.loadingOverlay.style.zIndex = '50';
        this.loadingOverlay.style.flexDirection = 'column';
        this.loadingOverlay.style.backdropFilter = 'blur(4px)';
        
        const spinner = document.createElement('div');
        spinner.style.width = '24px';
        spinner.style.height = '24px';
        spinner.style.border = '3px solid rgba(255,255,255,0.3)';
        spinner.style.borderTop = '3px solid #38bdf8';
        spinner.style.borderRadius = '50%';
        spinner.style.animation = 'spin 1s linear infinite';
        
        const text = document.createElement('div');
        text.textContent = 'Processing Audio Data...';
        text.style.color = '#fff';
        text.style.marginTop = '15px';
        text.style.fontSize = '12px';
        text.style.fontFamily = 'monospace';
        
        const progressContainer = document.createElement('div');
        progressContainer.style.width = '60%';
        progressContainer.style.height = '4px';
        progressContainer.style.background = 'rgba(255, 255, 255, 0.1)';
        progressContainer.style.borderRadius = '2px';
        progressContainer.style.marginTop = '10px';
        progressContainer.style.overflow = 'hidden';
        
        this.progressBar = document.createElement('div');
        this.progressBar.style.width = '0%';
        this.progressBar.style.height = '100%';
        this.progressBar.style.background = '#38bdf8';
        this.progressBar.style.transition = 'width 0.1s linear';
        progressContainer.appendChild(this.progressBar);

        const style = document.createElement('style');
        style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
        document.head.appendChild(style);

        this.loadingOverlay.appendChild(spinner);
        this.loadingOverlay.appendChild(text);
        this.loadingOverlay.appendChild(progressContainer);
        this.canvasContainer.appendChild(this.loadingOverlay);

        this.tooltip = document.createElement('div');
        this.tooltip.style.position = 'absolute';
        this.tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
        this.tooltip.style.color = '#fff';
        this.tooltip.style.padding = '4px 8px';
        this.tooltip.style.borderRadius = '4px';
        this.tooltip.style.fontSize = '10px';
        this.tooltip.style.fontFamily = 'monospace';
        this.tooltip.style.pointerEvents = 'none';
        this.tooltip.style.display = 'none';
        this.tooltip.style.zIndex = '30';
        this.tooltip.style.whiteSpace = 'pre';
        this.canvasContainer.appendChild(this.tooltip);
    }

    showLoading() {
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'none';
    }

    resizeCanvas() {
        if (!this.canvasContainer || !this.canvas) return;
        const width = this.canvasContainer.clientWidth;
        const height = this.canvasContainer.clientHeight;
        if (width === 0 || height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        this.width = width;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.ctx.scale(dpr, dpr);
    }

    resize() {
        this.resizeCanvas();
        if (this.dataTracks.lows && this.dataTracks.lows.length > 0) {
            this.drawTracks();
        }
    }

    initListeners() {
        let isDragging = false;
        const handleSeek = (e) => {
            if (!this.audioDuration) return;
            const rect = this.canvasContainer.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const visiblePct = x / rect.width;
            const globalPct = this.scrollOffset + (visiblePct * (1.0 / this.zoomLevel));
            const time = Math.min(this.audioDuration, Math.max(0, globalPct * this.audioDuration));
            if (this.onSeek) this.onSeek(time);
        };

        const updateTooltip = (e) => {
            if (!this.audioDuration || !this.dataTracks || !this.dataTracks.lows || this.dataTracks.lows.length === 0) {
                this.tooltip.style.display = 'none';
                return;
            }
            const rect = this.canvasContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
                this.tooltip.style.display = 'none';
                return;
            }
            const visiblePct = Math.max(0, Math.min(x / rect.width, 1));
            const globalPct = this.scrollOffset + (visiblePct * (1.0 / this.zoomLevel));
            const dataIndex = Math.floor(globalPct * this.dataTracks.lows.length);
            const low = this.dataTracks.lows[dataIndex] || 0;
            const mid = this.dataTracks.mids[dataIndex] || 0;
            const high = this.dataTracks.highs[dataIndex] || 0;
            const cam = this.dataTracks.cameraMovement[dataIndex] || 0;
            this.tooltip.textContent = `T: ${(globalPct * this.audioDuration).toFixed(1)}s\nL: ${low.toFixed(2)}\nM: ${mid.toFixed(2)}\nH: ${high.toFixed(2)}\nC: ${cam.toFixed(2)}`;
            let toolX = x + 10;
            let toolY = y + 10;
            if (toolX + 80 > rect.width) toolX = x - 90;
            if (toolY + 60 > rect.height) toolY = y - 70;
            this.tooltip.style.left = `${toolX}px`;
            this.tooltip.style.top = `${toolY}px`;
            this.tooltip.style.display = 'block';
        };

        this.canvasContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            handleSeek(e);
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                handleSeek(e);
            }
        });

        this.canvasContainer.addEventListener('mousemove', (e) => {
            if (!isDragging) updateTooltip(e);
        });

        this.canvasContainer.addEventListener('mouseleave', () => {
            this.tooltip.style.display = 'none';
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        window.addEventListener('resize', () => {
            this.resize();
        });
    }

    async analyzeAudio(audioBuffer) {
        if (!audioBuffer) return;
        this.showLoading();
        this.audioDuration = audioBuffer.duration;
        this.dataTracks = { lows: [], mids: [], highs: [], cameraMovement: [] };
        if (typeof OfflineAudioContext === 'undefined') {
            this.hideLoading();
            return;
        }
        try {
            const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            const scriptProcessor = offlineCtx.createScriptProcessor(2048, 1, 1);
            source.connect(scriptProcessor);
            scriptProcessor.connect(offlineCtx.destination);
            source.start(0);
            let nextScheduleTime = 0;
            scriptProcessor.onaudioprocess = (e) => {
                const currentTime = e.playbackTime;
                if (currentTime >= nextScheduleTime) {
                    this.processChunk(e);
                    nextScheduleTime += this.chunkSize;
                }
            };
            await offlineCtx.startRendering();
            this.drawTracks();
        } catch (err) {
            console.error("VisualTimeline: Analysis failed", err);
        } finally {
            this.hideLoading();
        }
    }

    processChunk(e) {
        if (this.progressBar && this.audioDuration) {
            const progress = Math.min(100, (e.playbackTime / this.audioDuration) * 100);
            this.progressBar.style.width = `${progress}%`;
        }
        const inputBuffer = e.inputBuffer;
        const channelData = inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < channelData.length; i++) {
            sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / channelData.length);
        const vol = Math.min(1.0, rms * 4.0); 
        const lowVal = vol; 
        const midVal = vol * 0.8;
        const highVal = vol * 0.6;
        const cameraVal = (lowVal * 0.8) + (midVal * 0.2);
        this.dataTracks.lows.push(lowVal);
        this.dataTracks.mids.push(midVal);
        this.dataTracks.highs.push(highVal);
        this.dataTracks.cameraMovement.push(cameraVal);
    }

    modifyZoom(direction) {
        if (!this.audioDuration) return;
        const currentCenter = this.scrollOffset + (0.5 / this.zoomLevel);
        if (direction > 0) this.zoomLevel *= 1.5;
        else this.zoomLevel /= 1.5;
        this.zoomLevel = Math.max(1.0, Math.min(this.zoomLevel, 20.0));
        this.scrollOffset = currentCenter - (0.5 / this.zoomLevel);
        const maxOffset = 1.0 - (1.0 / this.zoomLevel);
        this.scrollOffset = Math.max(0.0, Math.min(this.scrollOffset, maxOffset));
        if (this.zoomLabel) this.zoomLabel.textContent = `ZOOM: ${this.zoomLevel.toFixed(1)}x`;
        this.drawTracks();
        if (window.audio) this.updatePlayhead(window.audio.currentTime, window.audio.duration);
    }

    drawTracks() {
        this.resizeCanvas();
        if (!this.ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;

        const freqH = h * 0.25;
        const camH = h * 0.15;
        const colorH = h * 0.10;

        const yOffsets = [0, freqH, freqH * 2, freqH * 3, freqH * 3 + camH];
        const trackHeights = [freqH, freqH, freqH, camH, colorH];
        const tracks = [this.dataTracks.lows, this.dataTracks.mids, this.dataTracks.highs, this.dataTracks.cameraMovement, this.dataTracks.mids];
        const labels = ['BASS (RMS)', 'MIDS (RMS)', 'HIGHS (RMS)', 'CAMERA / FOV', 'COLOR REACTIVITY'];

        // Get Camera Strength Weights from Global Uniforms
        const uPitchW = (window.uniforms && window.uniforms.uPitch) ? window.uniforms.uPitch.value : 0.2;
        const uRollW = (window.uniforms && window.uniforms.uRoll) ? window.uniforms.uRoll.value : 0.3;
        const uYawW = (window.uniforms && window.uniforms.uYaw) ? window.uniforms.uYaw.value : 0.1;

        this.ctx.clearRect(0, 0, w, h);

        tracks.forEach((fullData, index) => {
            if (!fullData || fullData.length === 0) return;
            const yBase = yOffsets[index];
            const trackH = trackHeights[index];
            const color = this.colors[index];
            const isCameraTrack = index === 3;
            const isHueStrip = index === 4;

            const totalLen = fullData.length;
            const viewLen = Math.floor(totalLen / this.zoomLevel);
            const startIdx = Math.floor(this.scrollOffset * totalLen);
            const endIdx = Math.min(totalLen, startIdx + viewLen);
            const visibleData = fullData.slice(startIdx, endIdx);

            if (visibleData.length < 2) return;
            const stepX = w / (visibleData.length - 1);

            if (isHueStrip) {
                const barWidth = Math.max(1, Math.ceil(stepX));
                for (let i = 0; i < visibleData.length; i++) {
                    const val = visibleData[i];
                    const x = Math.floor(i * stepX);
                    const hue = (this.colorParams.hue + (val * this.colorParams.shift * 180)) % 360;
                    this.ctx.fillStyle = `hsl(${hue}, ${this.colorParams.sat}%, 50%)`;
                    this.ctx.fillRect(x, yBase, barWidth, trackH);
                }
            } else if (isCameraTrack) {
                this.ctx.beginPath();
                this.ctx.setLineDash([5, 5]);
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.moveTo(0, yBase + trackH * 0.5);
                this.ctx.lineTo(w, yBase + trackH * 0.5);
                this.ctx.stroke();
                this.ctx.setLineDash([]);

                // Dynamic Camera Line Graph
                const visLows = this.dataTracks.lows.slice(startIdx, endIdx);
                const visMids = this.dataTracks.mids.slice(startIdx, endIdx);
                const visHighs = this.dataTracks.highs.slice(startIdx, endIdx);

                this.ctx.beginPath();
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 2;
                this.ctx.lineJoin = 'round';
                
                for (let i = 0; i < visibleData.length; i++) {
                    const low = visLows[i] || 0;
                    const mid = visMids[i] || 0;
                    const high = visHighs[i] || 0;
                    
                    const camValue = (low * uPitchW) + (mid * uRollW) + (high * uYawW);
                    const normalizedCam = Math.min(camValue, 1.0);

                    const x = i * stepX;
                    const y = yBase + (trackH - (normalizedCam * trackH));
                    
                    if (i === 0) this.ctx.moveTo(x, y);
                    else this.ctx.lineTo(x, y);
                }
                this.ctx.stroke();
                this.ctx.lineTo(w, yBase + trackH);
                this.ctx.lineTo(0, yBase + trackH);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                this.ctx.fill();
            } else {
                this.ctx.beginPath();
                this.ctx.fillStyle = color;
                this.ctx.moveTo(0, h); // Anchor to bottom
                for (let i = 0; i < visibleData.length; i++) {
                    const val = visibleData[i];
                    const barH = val * trackH;
                    const x = i * stepX;
                    const y = yBase + (trackH - barH);
                    if (i === 0) this.ctx.moveTo(x, yBase + trackH);
                    this.ctx.lineTo(x, y);
                }
                this.ctx.lineTo(w, yBase + trackH);
                this.ctx.closePath();
                this.ctx.fill();
            }
            this.ctx.fillStyle = 'yellow';
            this.ctx.font = '10px monospace';
            this.ctx.fillText(labels[index], 5, yBase + 12);
        });
    }

    updatePlayhead(currentTime, duration) {
        if (!duration || !this.scrubber) return;
        const playheadPct = currentTime / duration;
        const startPct = this.scrollOffset;
        const visibleRange = 1.0 / this.zoomLevel;
        if (playheadPct >= startPct && playheadPct <= startPct + visibleRange) {
            const visibleProgress = (playheadPct - startPct) / visibleRange;
            this.scrubber.style.left = `${visibleProgress * 100}%`;
            this.scrubber.style.display = 'block';
        } else {
            this.scrubber.style.display = 'none';
        }
    }
}
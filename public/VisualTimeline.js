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
        
        // Selection State
        this.selectionStart = null;
        this.selectionEnd = null;
        this.isSelecting = false;
        this.dragStartTime = 0;
        
        this.hoveredSegment = null;
        this.resizingState = null; // { segment, edge: 'start'|'end' }
        
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

    showContextMenu(x, y, startTime, endTime, existingSegment) {
        const existing = document.getElementById('timeline-ctx-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'timeline-ctx-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.background = 'rgba(0, 0, 0, 0.9)';
        menu.style.backdropFilter = 'blur(10px)';
        menu.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        menu.style.padding = '12px';
        menu.style.zIndex = '10000';
        menu.style.borderRadius = '8px';
        menu.style.display = 'flex';
        menu.style.flexDirection = 'column';
        menu.style.gap = '8px';
        menu.style.minWidth = '150px';
        menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';

        // Header
        const header = document.createElement('div');
        header.textContent = existingSegment ? 'Edit Segment' : `Range: ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s`;
        header.style.fontSize = '11px';
        header.style.color = '#aaa';
        header.style.marginBottom = '4px';
        menu.appendChild(header);

        // Tag Select
        const select = document.createElement('select');
        select.style.background = 'rgba(255, 255, 255, 0.1)';
        select.style.color = '#fff';
        select.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        select.style.padding = '4px';
        select.style.borderRadius = '4px';
        
        const tags = Object.keys(window.TAG_LIBRARY || {});
        tags.forEach(tag => {
            const opt = document.createElement('option');
            opt.value = tag;
            opt.textContent = tag;
            if (existingSegment && existingSegment.tag === tag) opt.selected = true;
            select.appendChild(opt);
        });
        menu.appendChild(select);

        // Add/Update Button
        const addBtn = document.createElement('button');
        addBtn.textContent = existingSegment ? 'Update Tag' : 'Apply Tag';
        addBtn.style.background = '#38bdf8';
        addBtn.style.color = '#000';
        addBtn.style.border = 'none';
        addBtn.style.padding = '6px';
        addBtn.style.borderRadius = '4px';
        addBtn.style.cursor = 'pointer';
        addBtn.style.fontWeight = 'bold';
        
        addBtn.onclick = () => {
            if (existingSegment) {
                existingSegment.tag = select.value;
            } else if (window.activeSegments) {
                window.activeSegments.push({
                    start: startTime,
                    end: endTime,
                    tag: select.value
                });
            }
            menu.remove();
            this.selectionStart = null;
            this.selectionEnd = null;
            this.drawTracks();
        };
        menu.appendChild(addBtn);

        // Delete Button (Only for existing)
        if (existingSegment) {
            const delBtn = document.createElement('button');
            delBtn.textContent = 'Delete Segment';
            delBtn.style.background = 'rgba(239, 68, 68, 0.2)';
            delBtn.style.color = '#ef4444';
            delBtn.style.border = '1px solid rgba(239, 68, 68, 0.5)';
            delBtn.style.padding = '6px';
            delBtn.style.borderRadius = '4px';
            delBtn.style.cursor = 'pointer';
            
            delBtn.onclick = () => {
                const idx = window.activeSegments.indexOf(existingSegment);
                if (idx > -1) {
                    window.activeSegments.splice(idx, 1);
                }
                menu.remove();
                this.drawTracks();
            };
            menu.appendChild(delBtn);
        }

        // Cancel
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Cancel';
        clearBtn.style.background = 'transparent';
        clearBtn.style.color = '#aaa';
        clearBtn.style.border = '1px solid rgba(255,255,255,0.2)';
        clearBtn.style.padding = '4px';
        clearBtn.style.borderRadius = '4px';
        clearBtn.style.cursor = 'pointer';
        
        clearBtn.onclick = () => {
             this.selectionStart = null;
             this.selectionEnd = null;
             this.drawTracks();
             menu.remove();
        };
        menu.appendChild(clearBtn);

        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                window.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(() => window.addEventListener('mousedown', closeHandler), 10);
        document.body.appendChild(menu);
    }

    initListeners() {
        let isSeekDragging = false;
        
        const getTimeFromEvent = (e) => {
            if (!this.audioDuration) return 0;
            const rect = this.canvasContainer.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const visiblePct = x / rect.width;
            const globalPct = this.scrollOffset + (visiblePct * (1.0 / this.zoomLevel));
            return Math.min(this.audioDuration, Math.max(0, globalPct * this.audioDuration));
        };

        const handleSeek = (e) => {
            const time = getTimeFromEvent(e);
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
            const rect = this.canvasContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Hit Test
            const hit = this.getHitTest(x, y);

            // 1. Resize (Left Click on Edge)
            if (hit && hit.type === 'resize' && e.button === 0) {
                this.resizingState = hit;
                return;
            }

            // 2. Right Click (2) or Shift+Click
            if (e.button === 2 || e.shiftKey) {
                // Check if we hit an existing segment (Body or Resize)
                if (hit && (hit.type === 'body' || hit.type === 'resize')) {
                    // Edit Existing
                    e.preventDefault();
                    this.showContextMenu(e.clientX, e.clientY, hit.segment.start, hit.segment.end, hit.segment);
                } else {
                    // New Selection
                    this.isSelecting = true;
                    this.selectionStart = getTimeFromEvent(e);
                    this.selectionEnd = this.selectionStart;
                    this.dragStartTime = Date.now();
                    e.preventDefault();
                }
            } else {
                // 3. Normal Seek (Left Click)
                isSeekDragging = true;
                handleSeek(e);
            }
        });

        // Prevent default context menu
        this.canvasContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (this.resizingState) {
                e.preventDefault();
                const time = getTimeFromEvent(e);
                this.resizingState.segment[this.resizingState.edge] = time;
                this.drawTracks();
            } else if (this.isSelecting) {
                e.preventDefault();
                this.selectionEnd = getTimeFromEvent(e);
                this.drawTracks();
            } else if (isSeekDragging) {
                e.preventDefault();
                handleSeek(e);
            }
        });

        this.canvasContainer.addEventListener('mousemove', (e) => {
            if (!isSeekDragging && !this.isSelecting && !this.resizingState) {
                // Hit Test for Cursor
                const rect = this.canvasContainer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const hit = this.getHitTest(x, y);
                
                if (hit && hit.type === 'resize') {
                    this.canvasContainer.style.cursor = 'col-resize';
                    this.tooltip.style.display = 'none'; // Hide tooltip during resize hover
                } else if (hit && hit.type === 'body') {
                    this.canvasContainer.style.cursor = 'context-menu';
                    updateTooltip(e); // Keep tooltip for context
                } else {
                    this.canvasContainer.style.cursor = 'crosshair';
                    updateTooltip(e);
                }
            }
        });

        this.canvasContainer.addEventListener('mouseleave', () => {
            this.tooltip.style.display = 'none';
        });

        window.addEventListener('mouseup', (e) => {
            if (this.resizingState) {
                // Ensure Start < End
                const seg = this.resizingState.segment;
                if (seg.start > seg.end) {
                    const temp = seg.start;
                    seg.start = seg.end;
                    seg.end = temp;
                }
                this.resizingState = null;
                this.drawTracks();
            } else if (this.isSelecting) {
                this.isSelecting = false;
                const duration = Math.abs(this.selectionEnd - this.selectionStart);
                if (duration > 0.1) {
                    const start = Math.min(this.selectionStart, this.selectionEnd);
                    const end = Math.max(this.selectionStart, this.selectionEnd);
                    this.showContextMenu(e.clientX, e.clientY, start, end);
                } else {
                    this.selectionStart = null;
                    this.selectionEnd = null;
                    this.drawTracks();
                }
            }
            isSeekDragging = false;
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

    getXFromTime(time) {
        if (!this.audioDuration) return -1;
        const rect = this.canvasContainer.getBoundingClientRect();
        const globalPct = time / this.audioDuration;
        const visiblePct = (globalPct - this.scrollOffset) * this.zoomLevel;
        return visiblePct * rect.width;
    }

    getHitTest(x, y) {
        if (!window.activeSegments) return null;
        
        // 1. Check Edges (Resize) - Threshold 8px
        const threshold = 8;
        
        for (const seg of window.activeSegments) {
            const startX = this.getXFromTime(seg.start);
            const endX = this.getXFromTime(seg.end);
            
            if (Math.abs(x - startX) < threshold) return { type: 'resize', segment: seg, edge: 'start' };
            if (Math.abs(x - endX) < threshold) return { type: 'resize', segment: seg, edge: 'end' };
        }

        // 2. Check Body (Move/Edit) - Inside rect
        for (const seg of window.activeSegments) {
            const startX = this.getXFromTime(seg.start);
            const endX = this.getXFromTime(seg.end);
            if (x >= startX && x <= endX) return { type: 'body', segment: seg };
        }
        
        return null;
    }

    drawSegments() {
        if (!window.activeSegments || window.activeSegments.length === 0 || !this.ctx) return;
        
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;

        window.activeSegments.forEach(seg => {
            const startX = (seg.start / this.audioDuration - this.scrollOffset) * this.zoomLevel * w;
            const endX = (seg.end / this.audioDuration - this.scrollOffset) * this.zoomLevel * w;
            const width = Math.max(1, endX - startX);

            // Skip if out of view
            if (endX < 0 || startX > w) return;

            // Determine Color based on Tag
            let color = 'rgba(255, 165, 0, 0.3)'; // Default Orange (Build Up)
            if (seg.tag === 'Drop') color = 'rgba(255, 0, 0, 0.3)'; // Red
            if (seg.tag === 'Calm') color = 'rgba(0, 191, 255, 0.3)'; // Blue

            this.ctx.fillStyle = color;
            this.ctx.fillRect(startX, 0, width, h);
            
            // Draw Label
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px monospace';
            this.ctx.fillText(seg.tag || 'Custom', Math.max(0, startX) + 5, 12);
        });
    }

    drawSelectionOverlay() {
        if (this.selectionStart === null || this.selectionEnd === null || !this.ctx) return;
        
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;

        const startX = (this.selectionStart / this.audioDuration - this.scrollOffset) * this.zoomLevel * w;
        const endX = (this.selectionEnd / this.audioDuration - this.scrollOffset) * this.zoomLevel * w;
        const width = endX - startX;

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillRect(startX, 0, width, h);
        
        // Border
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.strokeRect(startX, 0, width, h);
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

        // Draw Segments first (underlay)
        this.drawSegments();

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

        // Draw Selection Overlay on Top
        this.drawSelectionOverlay();
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
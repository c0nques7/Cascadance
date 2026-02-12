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
        this.scrollX = 0; // Horizontal pixel offset
        
        // Selection State
        this.selectionStart = null;
        this.selectionEnd = null;
        this.isSelecting = false;
        this.dragStartTime = 0;
        
        this.hoveredSegment = null;
        this.resizingState = null; // { segment, edge: 'start'|'end' }
        this.moveState = null; // { segment, initialStart, initialEnd, dragStartX }
        
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
        
        this.loadingText = document.createElement('div');
        this.loadingText.textContent = 'Processing Audio Data...';
        this.loadingText.style.color = '#fff';
        this.loadingText.style.marginTop = '15px';
        this.loadingText.style.fontSize = '12px';
        this.loadingText.style.fontFamily = 'monospace';
        
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
        this.loadingOverlay.appendChild(this.loadingText);
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

    showLoading(text) {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'flex';
            if (text && this.loadingText) this.loadingText.textContent = text;
        }
    }

    setLoadingText(text) {
        if (this.loadingText) this.loadingText.textContent = text;
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

        // Move Button (Only for existing)
        if (existingSegment) {
            const moveBtn = document.createElement('button');
            moveBtn.textContent = 'Move Segment';
            moveBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            moveBtn.style.color = '#fff';
            moveBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            moveBtn.style.padding = '6px';
            moveBtn.style.borderRadius = '4px';
            moveBtn.style.cursor = 'pointer';
            
            moveBtn.onclick = () => {
                this.moveState = {
                    segment: existingSegment,
                    duration: existingSegment.end - existingSegment.start,
                    originalStart: existingSegment.start,
                    error: false
                };
                menu.remove();
                this.canvasContainer.style.cursor = 'move';
                // Trigger tooltip immediately
                if (this.tooltip) {
                    this.tooltip.style.display = 'block';
                    this.tooltip.textContent = 'Moving... Click to Place. Esc/RightClick to Cancel.';
                }
            };
            menu.appendChild(moveBtn);
        }

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
        let isPanning = false;
        let lastMouseX = 0;
        
        const getTimeFromEvent = (e) => {
            if (!this.audioDuration) return 0;
            const rect = this.canvasContainer.getBoundingClientRect();
            // x relative to canvas
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            
            // Pixels Per Second
            const totalWidth = rect.width * this.zoomLevel;
            const pps = totalWidth / this.audioDuration;
            
            // Time = (scrollX + x) / pps
            const time = (this.scrollX + x) / pps;
            
            return Math.min(this.audioDuration, Math.max(0, time));
        };

        const handleSeek = (e) => {
            const time = getTimeFromEvent(e);
            if (this.onSeek) this.onSeek(time);
        };

        const updateTooltip = (e) => {
            if (this.moveState) {
                // Tooltip handled in mousemove for move state
                return;
            }
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
            
            const totalWidth = rect.width * this.zoomLevel;
            const pps = totalWidth / this.audioDuration;
            const time = (this.scrollX + x) / pps;
            const clampedTime = Math.max(0, Math.min(this.audioDuration, time));
            
            const samplesPerSec = this.dataTracks.lows.length / this.audioDuration;
            const dataIndex = Math.floor(clampedTime * samplesPerSec);
            const low = this.dataTracks.lows[dataIndex] || 0;
            const mid = this.dataTracks.mids[dataIndex] || 0;
            const high = this.dataTracks.highs[dataIndex] || 0;
            const cam = this.dataTracks.cameraMovement[dataIndex] || 0;
            
            this.tooltip.textContent = `T: ${clampedTime.toFixed(1)}s\nL: ${low.toFixed(2)}\nM: ${mid.toFixed(2)}\nH: ${high.toFixed(2)}\nC: ${cam.toFixed(2)}`;
            let toolX = x + 10;
            let toolY = y + 10;
            if (toolX + 80 > rect.width) toolX = x - 90;
            if (toolY + 60 > rect.height) toolY = y - 70;
            this.tooltip.style.left = `${toolX}px`;
            this.tooltip.style.top = `${toolY}px`;
            this.tooltip.style.display = 'block';
        };

        // Wheel Listener (Shift+Scroll to Pan, Scroll to Zoom)
        this.canvasContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.shiftKey) {
                this.scrollX += e.deltaY;
                this.drawTracks();
            } else {
                const rect = this.canvasContainer.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const direction = e.deltaY < 0 ? 1 : -1;
                this.modifyZoom(direction, mouseX);
            }
        }, { passive: false });

        this.canvasContainer.addEventListener('mousedown', (e) => {
            const rect = this.canvasContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const hit = this.getHitTest(x, y);

            // 0. Confirm Move (Left Click) or Cancel (Right Click)
            if (this.moveState) {
                if (e.button === 0 && !this.moveState.error) {
                    // Success
                    this.moveState = null;
                    this.canvasContainer.style.cursor = 'crosshair';
                    this.drawTracks();
                } else if (e.button === 2) {
                    // Cancel
                    this.moveState.segment.start = this.moveState.originalStart;
                    this.moveState.segment.end = this.moveState.originalStart + this.moveState.duration;
                    this.moveState = null;
                    this.canvasContainer.style.cursor = 'crosshair';
                    this.drawTracks();
                }
                return;
            }

            // 1. Pan (Alt + Click or Middle Click)
            if (e.altKey || e.button === 1) {
                isPanning = true;
                lastMouseX = e.clientX;
                return;
            }

            // 2. Resize
            if (hit && hit.type === 'resize' && e.button === 0) {
                this.resizingState = hit;
                return;
            }

            // 2.5 Fade Handles
            if (hit && (hit.type === 'fade-in' || hit.type === 'fade-out') && e.button === 0) {
                this.fadeDragState = hit;
                return;
            }

            // 3. Right Click or Shift+Click (Select/Edit)
            if (e.button === 2 || e.shiftKey) {
                if (hit && (hit.type === 'body' || hit.type === 'resize')) {
                    e.preventDefault();
                    this.showContextMenu(e.clientX, e.clientY, hit.segment.start, hit.segment.end, hit.segment);
                } else {
                    this.isSelecting = true;
                    this.selectionStart = getTimeFromEvent(e);
                    this.selectionEnd = this.selectionStart;
                    this.dragStartTime = Date.now();
                    e.preventDefault();
                }
            } else {
                // 4. Normal Seek
                isSeekDragging = true;
                handleSeek(e);
            }
        });

        this.canvasContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (this.fadeDragState) {
                e.preventDefault();
                const time = getTimeFromEvent(e);
                const seg = this.fadeDragState.segment;
                const config = this.fadeDragState.config;
                
                if (!config.transition) config.transition = {};

                if (this.fadeDragState.type === 'fade-in') {
                    let newDur = time - seg.start;
                    const maxDur = (seg.end - seg.start) - ((config.useADSR && config.adsr ? config.adsr.release : (config.transition ? config.transition.fadeOutDuration : 0)) || 0);
                    newDur = Math.max(0, Math.min(newDur, maxDur));
                    
                    if (config.useADSR && config.adsr) {
                        config.adsr.attack = newDur;
                    } else {
                        if (!config.transition) config.transition = {};
                        config.transition.duration = newDur;
                    }
                } else {
                    let newDur = seg.end - time;
                    const maxDur = (seg.end - seg.start) - ((config.useADSR && config.adsr ? config.adsr.attack : (config.transition ? config.transition.duration : 0)) || 0);
                    newDur = Math.max(0, Math.min(newDur, maxDur));
                    
                    if (config.useADSR && config.adsr) {
                        config.adsr.release = newDur;
                    } else {
                        if (!config.transition) config.transition = {};
                        config.transition.fadeOutDuration = newDur;
                    }
                }
                this.drawTracks();
                return;
            }

            if (this.moveState) {
                e.preventDefault();
                const time = getTimeFromEvent(e);
                const dur = this.moveState.duration;
                let newStart = time - (dur / 2);
                let newEnd = newStart + dur;
                
                // Clamp
                if (newStart < 0) { newStart = 0; newEnd = dur; }
                if (newEnd > this.audioDuration) { newEnd = this.audioDuration; newStart = newEnd - dur; }

                this.moveState.error = false;
                let snapped = false;

                // Pass 1: Snap & Auto-Resolve Overlaps
                for (const other of window.activeSegments) {
                    if (other === this.moveState.segment) continue;
                    
                    // Magnetic Snap (Proximity)
                    if (!snapped) {
                        if (Math.abs(newStart - other.end) < 0.2) {
                            newStart = other.end;
                            newEnd = newStart + dur;
                            snapped = true;
                        } else if (Math.abs(newEnd - other.start) < 0.2) {
                            newEnd = other.start;
                            newStart = newEnd - dur;
                            snapped = true;
                        }
                    }

                    // Collision Resolve (Push to side)
                    if (newStart < other.end - 0.01 && newEnd > other.start + 0.01) {
                        const distRight = Math.abs(newStart - other.end); // Distance to right side
                        const distLeft = Math.abs(newEnd - other.start); // Distance to left side
                        
                        if (distRight < distLeft) {
                            newStart = other.end;
                            newEnd = newStart + dur;
                        } else {
                            newEnd = other.start;
                            newStart = newEnd - dur;
                        }
                        // We adjusted position, effectively a forced snap
                        snapped = true;
                    }
                }
                
                // Pass 2: Verify Safety (If adjustment caused new overlap)
                for (const other of window.activeSegments) {
                    if (other === this.moveState.segment) continue;
                    if (newStart < other.end - 0.01 && newEnd > other.start + 0.01) {
                        this.moveState.error = true;
                        break;
                    }
                }

                this.moveState.segment.start = newStart;
                this.moveState.segment.end = newEnd;
                this.drawTracks();
                
                if (this.tooltip) {
                    this.tooltip.style.display = 'block';
                    if (this.moveState.error) {
                        this.tooltip.textContent = 'No available space for tag. Change size or relocate to apply.';
                        this.tooltip.style.color = '#ff4444';
                    } else {
                        this.tooltip.textContent = `Move: ${newStart.toFixed(2)}s - ${newEnd.toFixed(2)}s`;
                        this.tooltip.style.color = '#fff';
                    }
                    
                    // Update pos
                    const rect = this.canvasContainer.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    this.tooltip.style.left = `${x + 10}px`;
                    this.tooltip.style.top = `${y + 10}px`;
                }
                return;
            }

            if (isPanning) {
                const deltaX = e.clientX - lastMouseX;
                this.scrollX -= deltaX;
                lastMouseX = e.clientX;
                this.drawTracks();
                return;
            }
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
            if (!isSeekDragging && !this.isSelecting && !this.resizingState && !isPanning && !this.moveState && !this.fadeDragState) {
                const rect = this.canvasContainer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const hit = this.getHitTest(x, y);
                
                if (hit && hit.type === 'resize') {
                    this.canvasContainer.style.cursor = 'col-resize';
                    this.tooltip.style.display = 'none';
                } else if (hit && (hit.type === 'fade-in' || hit.type === 'fade-out')) {
                    this.canvasContainer.style.cursor = 'ew-resize';
                    this.tooltip.style.display = 'none';
                } else if (hit && hit.type === 'body') {
                    this.canvasContainer.style.cursor = 'context-menu';
                    updateTooltip(e);
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
            if (this.fadeDragState) {
                this.fadeDragState = null;
            }

            isPanning = false;
            // Move state handled in mousedown (click to place)
            
            if (this.resizingState) {
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

        // Cancel Move on Esc
        window.addEventListener('keydown', (e) => {
            if (this.moveState && e.key === 'Escape') {
                this.moveState.segment.start = this.moveState.originalStart;
                this.moveState.segment.end = this.moveState.originalStart + this.moveState.duration;
                this.moveState = null;
                this.canvasContainer.style.cursor = 'crosshair';
                this.drawTracks();
            }
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

    modifyZoom(direction, centerX = null) {
        if (!this.audioDuration) return;
        
        const dpr = window.devicePixelRatio || 1;
        const w = (this.canvasContainer.clientWidth || 800) * dpr; // Use virtual width if canvas not ready?
        // Actually this.width is cached in resizeCanvas.
        const width = this.canvasContainer.clientWidth;

        const oldZoom = this.zoomLevel;
        if (direction > 0) this.zoomLevel *= 1.5;
        else this.zoomLevel /= 1.5;
        this.zoomLevel = Math.max(1.0, Math.min(this.zoomLevel, 50.0)); // Increased max zoom

        // Calculate focus point
        // If centerX provided (from mouse wheel), zoom towards that.
        // Else zoom towards center of view.
        const focusX = centerX !== null ? centerX : width / 2;
        
        const totalWidthOld = width * oldZoom;
        const ppsOld = totalWidthOld / this.audioDuration;
        const timeAtFocus = (this.scrollX + focusX) / ppsOld;
        
        const totalWidthNew = width * this.zoomLevel;
        const ppsNew = totalWidthNew / this.audioDuration;
        
        // New scrollX to keep timeAtFocus at focusX
        // (timeAtFocus * ppsNew) = newScrollX + focusX
        this.scrollX = (timeAtFocus * ppsNew) - focusX;
        
        // Clamp will be handled in drawTracks, but good to do here too
        this.scrollX = Math.max(0, Math.min(this.scrollX, totalWidthNew - width));
        if (totalWidthNew <= width) this.scrollX = 0;

        if (this.zoomLabel) this.zoomLabel.textContent = `ZOOM: ${this.zoomLevel.toFixed(1)}x`;
        this.drawTracks();
        if (window.audio) this.updatePlayhead(window.audio.currentTime, window.audio.duration);
    }

    getXFromTime(time) {
        if (!this.audioDuration) return -1;
        const width = this.canvasContainer.clientWidth;
        const totalWidth = width * this.zoomLevel;
        const pps = totalWidth / this.audioDuration;
        return (time * pps) - this.scrollX;
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

        // 2. Check Fade Handles - Threshold 5px
        if (window.TAG_LIBRARY) {
             for (const seg of window.activeSegments) {
                if (!seg.tag || !window.TAG_LIBRARY[seg.tag]) continue;
                const config = window.TAG_LIBRARY[seg.tag];
                
                let fadeIn = 0;
                let fadeOut = 0;

                if (config.useADSR && config.adsr) {
                    fadeIn = config.adsr.attack || 0;
                    fadeOut = config.adsr.release || 0;
                } else {
                    const transition = config.transition || {};
                    fadeIn = transition.duration || 0;
                    fadeOut = transition.fadeOutDuration || 0;
                }
                
                const fadeInX = this.getXFromTime(seg.start + fadeIn);
                const fadeOutX = this.getXFromTime(seg.end - fadeOut);

                if (Math.abs(x - fadeInX) < 5) return { type: 'fade-in', segment: seg, config: config };
                if (Math.abs(x - fadeOutX) < 5) return { type: 'fade-out', segment: seg, config: config };
             }
        }

        // 3. Check Body (Move/Edit) - Inside rect
        for (const seg of window.activeSegments) {
            const startX = this.getXFromTime(seg.start);
            const endX = this.getXFromTime(seg.end);
            if (x >= startX && x <= endX) return { type: 'body', segment: seg };
        }
        
        return null;
    }

    drawSegments() {
        if (!window.activeSegments || window.activeSegments.length === 0 || !this.ctx || !this.audioDuration) return;
        
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;
        
        const totalWidth = w * this.zoomLevel;
        const pps = totalWidth / this.audioDuration;

        window.activeSegments.forEach(seg => {
            const startX = (seg.start * pps) - this.scrollX;
            const endX = (seg.end * pps) - this.scrollX;
            const width = Math.max(1, endX - startX);

            // Skip if out of view
            if (endX < 0 || startX > w) return;

            // Determine Color based on Tag
            let color = '#ffa500'; // Default Orange
            let fadeInDur = 0;
            let fadeOutDur = 0;

            if (seg.tag && window.TAG_LIBRARY && window.TAG_LIBRARY[seg.tag]) {
                const config = window.TAG_LIBRARY[seg.tag];
                if (config.color) color = config.color;
                
                if (config.useADSR && config.adsr) {
                    fadeInDur = config.adsr.attack || 0;
                    fadeOutDur = config.adsr.release || 0;
                } else if (config.transition) {
                    fadeInDur = config.transition.duration || 0;
                    fadeOutDur = config.transition.fadeOutDuration || 0;
                }
            }

            // Error State (Collision)
            if (this.moveState && this.moveState.segment === seg && this.moveState.error) {
                color = '#ff0000'; // Red Error
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#ff0000';
            } else {
                this.ctx.shadowBlur = 0;
            }

            this.ctx.save();
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.3;
            this.ctx.fillRect(startX, 0, width, h);

            // Draw Fade In Overlay (Attack)
            const fadeInPixels = fadeInDur * pps;
            if (fadeInPixels > 0) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                this.ctx.fillRect(startX, 0, Math.min(fadeInPixels, width), h);
                // Handle Line
                this.ctx.fillStyle = '#fff';
                this.ctx.fillRect(startX + Math.min(fadeInPixels, width) - 1, 0, 2, h);
            }

            // Draw Fade Out Overlay (Release)
            const fadeOutPixels = fadeOutDur * pps;
            if (fadeOutPixels > 0) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                const fadeOutStartX = startX + width - fadeOutPixels;
                this.ctx.fillRect(Math.max(startX, fadeOutStartX), 0, Math.min(fadeOutPixels, width), h);
                // Handle Line
                this.ctx.fillStyle = '#fff';
                this.ctx.fillRect(Math.max(startX, fadeOutStartX) - 1, 0, 2, h);
            }

            this.ctx.restore();
            this.ctx.shadowBlur = 0; // Reset
            
            // Draw Label
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px monospace';
            this.ctx.fillText(seg.tag || 'Custom', Math.max(0, startX) + 5, 12);
        });
    }

    drawSelectionOverlay() {
        if (this.selectionStart === null || this.selectionEnd === null || !this.ctx || !this.audioDuration) return;
        
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;
        
        const totalWidth = w * this.zoomLevel;
        const pps = totalWidth / this.audioDuration;

        const startX = (this.selectionStart * pps) - this.scrollX;
        const endX = (this.selectionEnd * pps) - this.scrollX;
        const width = endX - startX;

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillRect(startX, 0, width, h);
        
        // Border
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.strokeRect(startX, 0, width, h);
    }

    drawTracks() {
        this.resizeCanvas();
        if (!this.ctx || !this.audioDuration) return;
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;

        // Optimization: Calculate Bounds
        // Total virtual width of the timeline
        const totalWidth = w * this.zoomLevel;
        // Clamp scrollX
        this.scrollX = Math.max(0, Math.min(this.scrollX, totalWidth - w));
        if (totalWidth <= w) this.scrollX = 0;

        const pixelsPerSecond = totalWidth / this.audioDuration;
        const visibleStartTime = this.scrollX / pixelsPerSecond;
        const visibleEndTime = (this.scrollX + w) / pixelsPerSecond;

        const freqH = h * 0.25;
        const camH = h * 0.15;
        const colorH = h * 0.10;

        const yOffsets = [0, freqH, freqH * 2, freqH * 3, freqH * 3 + camH];
        const trackHeights = [freqH, freqH, freqH, camH, colorH];
        const tracks = [this.dataTracks.lows, this.dataTracks.mids, this.dataTracks.highs, this.dataTracks.cameraMovement, this.dataTracks.mids];
        const labels = ['BASS (RMS)', 'MIDS (RMS)', 'HIGHS (RMS)', 'CAMERA / FOV', 'COLOR REACTIVITY'];

        // Get Camera Strength Weights
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

            // Calculate Indices
            const samplesPerSec = fullData.length / this.audioDuration;
            let startIdx = Math.floor(visibleStartTime * samplesPerSec);
            let endIdx = Math.ceil(visibleEndTime * samplesPerSec);
            
            // Padding
            startIdx = Math.max(0, startIdx - 100);
            endIdx = Math.min(fullData.length, endIdx + 100);

            if (startIdx >= endIdx) return;

            const visibleData = fullData; // Accessing raw array by index is fast
            // stepX in pixels per sample
            const stepX = pixelsPerSecond / samplesPerSec;

            if (isHueStrip) {
                // Helper: Hex to RGB 0-255
                const hexToRgb = (hex) => {
                    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                    return result ? {
                        r: parseInt(result[1], 16),
                        g: parseInt(result[2], 16),
                        b: parseInt(result[3], 16)
                    } : { r: 255, g: 255, b: 255 };
                };
                
                // Helper: THREE.Color or Hex to RGB 0-255
                const getCol = (val) => {
                    if (val && val.isColor) return { r: val.r * 255, g: val.g * 255, b: val.b * 255 };
                    if (typeof val === 'string') return hexToRgb(val);
                    return { r: 255, g: 255, b: 255 };
                };

                let defBase = { r: 255, g: 255, b: 255 };
                let defMid = { r: 0, g: 255, b: 0 };
                
                if (window.uniforms) {
                    if (window.uniforms.uBaseColor) defBase = getCol(window.uniforms.uBaseColor.value);
                    if (window.uniforms.uMidColor) defMid = getCol(window.uniforms.uMidColor.value);
                }

                const barWidth = Math.ceil(stepX) + 1;
                
                for (let i = startIdx; i < endIdx; i++) {
                    const val = visibleData[i]; // Audio amplitude (0-1 approx)
                    const x = (i * stepX) - this.scrollX;
                    if (x < -barWidth || x > w) continue;
                    
                    const time = i / samplesPerSec;
                    let cBase = defBase;
                    let cMid = defMid;

                    // Check for Tag Override
                    if (window.activeSegments) {
                        const seg = window.activeSegments.find(s => time >= s.start && time <= s.end);
                        if (seg && window.TAG_LIBRARY[seg.tag] && window.TAG_LIBRARY[seg.tag].values) {
                            const vals = window.TAG_LIBRARY[seg.tag].values;
                            if (vals.uBaseColor) cBase = getCol(vals.uBaseColor);
                            if (vals.uMidColor) cMid = getCol(vals.uMidColor);
                        }
                    }
                    
                    // Additive Mixing: Base + (Mid * Audio)
                    // Note: This approximates the shader logic: col = Base + AudioReact
                    const r = Math.min(255, cBase.r + (cMid.r * val));
                    const g = Math.min(255, cBase.g + (cMid.g * val));
                    const b = Math.min(255, cBase.b + (cMid.b * val));
                    
                    this.ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
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

                const visLows = this.dataTracks.lows;
                const visMids = this.dataTracks.mids;
                const visHighs = this.dataTracks.highs;

                this.ctx.beginPath();
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 2;
                this.ctx.lineJoin = 'round';
                
                let first = true;
                for (let i = startIdx; i < endIdx; i++) {
                    const low = visLows[i] || 0;
                    const mid = visMids[i] || 0;
                    const high = visHighs[i] || 0;
                    
                    const camValue = (low * uPitchW) + (mid * uRollW) + (high * uYawW);
                    const normalizedCam = Math.min(camValue, 1.0);

                    const x = (i * stepX) - this.scrollX;
                    const y = yBase + (trackH - (normalizedCam * trackH));
                    
                    if (first) {
                        this.ctx.moveTo(x, y);
                        first = false;
                    } else {
                        this.ctx.lineTo(x, y);
                    }
                }
                this.ctx.stroke();
                // Fill? (Optional, might be heavy)
                // this.ctx.lineTo(w, yBase + trackH); ...
            } else {
                this.ctx.beginPath();
                this.ctx.fillStyle = color;
                
                // Draw Bars (Optimized: Path)
                // For very high zoom, bars might be wide. For low zoom, bars overlap.
                // Using path for bars is tricky. 
                // Let's use individual rects if zoom is high, or a polygon if zoom is low?
                // Previous implementation used a polygon path.
                
                this.ctx.moveTo(0, yBase + trackH);
                let first = true;
                
                for (let i = startIdx; i < endIdx; i++) {
                    const val = visibleData[i];
                    const barH = val * trackH;
                    const x = (i * stepX) - this.scrollX;
                    const y = yBase + (trackH - barH);
                    
                    if (x < -stepX || x > w) continue;

                    // Draw as a filled shape
                    if (first) {
                        this.ctx.moveTo(x, yBase + trackH); // Start bottom
                        first = false;
                    }
                    this.ctx.lineTo(x, y); // Top
                    // To make it look like bars, we go down? 
                    // Previous: lineTo(x, y). 
                    // That creates a continuous line graph filled to bottom.
                }
                
                // Close shape
                const endX = (endIdx * stepX) - this.scrollX;
                this.ctx.lineTo(endX, yBase + trackH);
                this.ctx.lineTo((startIdx * stepX) - this.scrollX, yBase + trackH);
                this.ctx.closePath();
                this.ctx.fill();
            }
            this.ctx.fillStyle = 'yellow';
            this.ctx.font = '10px monospace';
            this.ctx.fillText(labels[index], 5, yBase + 12);
        });

        // Draw Selection Overlay on Top
        this.drawSelectionOverlay();
        
        // Draw Scrollbar
        if (totalWidth > w) {
            const barWidth = (w / totalWidth) * w;
            const barX = (this.scrollX / totalWidth) * w;
            
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.fillRect(0, h - 5, w, 5); // Track
            this.ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
            this.ctx.fillRect(barX, h - 5, barWidth, 5); // Handle
        }
    }

    updatePlayhead(currentTime, duration) {
        if (!duration || !this.scrubber || !this.canvasContainer) return;
        const width = this.canvasContainer.clientWidth;
        if (!width) return;

        const totalWidth = width * this.zoomLevel;
        const pps = totalWidth / duration;
        
        // Calculate position relative to view
        const x = (currentTime * pps) - this.scrollX;
        
        if (x >= 0 && x <= width) {
            const pct = (x / width) * 100;
            this.scrubber.style.left = `${pct}%`;
            this.scrubber.style.display = 'block';
        } else {
            this.scrubber.style.display = 'none';
        }
    }
}
import { MultiTrackTimeline } from './VisualTimeline.js';

let audioContext, analyser, source, audio;
let visualTimeline;
let tracks = [];
let currentTrackIndex = -1;
let isPlaying = false;
let uBassValue = 0;
let uMidValue = 0;
let uHighValue = 0;
let dataArray;

const audioMetrics = {
    lowSens: 1.0,
    midSens: 1.0,
    highSens: 1.0,
    autoGain: false,
    gainFactor: 1.0
};

function analyzeAudioProfile(frequencyData) {
    if (!frequencyData) return { low: 0, mid: 0, high: 0 };

    let lowSum = 0, midSum = 0, highSum = 0;
    const lowCount = 11; // 0-10
    const midCount = 90; // 11-100
    const highCount = 155; // 101-255

    // Low (Bass): Indices 0-10
    for (let i = 0; i < 11; i++) {
        lowSum += frequencyData[i];
    }
    
    // Mid (Vocals/Lead): Indices 11-100
    for (let i = 11; i < 101; i++) {
        midSum += frequencyData[i];
    }
    
    // High (Treble): Indices 101-255
    for (let i = 101; i < 256; i++) {
        highSum += frequencyData[i];
    }

    return {
        low: lowSum / (lowCount * 255),
        mid: midSum / (midCount * 255),
        high: highSum / (highCount * 255)
    };
}

// DOM Elements
const audioInput = document.getElementById('audio-input');
const visualStyleSelect = document.getElementById('visualStyle');
const parameterContainer = document.getElementById('parameter-container');
const cameraControlsContainer = document.getElementById('camera-controls');
const playlistEl = document.getElementById('playlist');
const playPauseBtn = document.getElementById('play-pause-btn');
const stopBtn = document.getElementById('stop-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressBar = document.getElementById('progressBar');
const currentTimeSpan = document.getElementById('current-time');
const durationSpan = document.getElementById('duration');
const uiContainer = document.getElementById('ui-container');
const dockBtn = document.getElementById('dock-btn');

visualTimeline = new MultiTrackTimeline('timeline-container', (time) => {
    if (audio) {
        audio.currentTime = time;
    }
});
window.visualTimeline = visualTimeline;

// --- 1. UI Logic (Draggable & Minimizable Islands) ---

let isDocked = false;
const originalPositions = new Map();

// Initialize Minimize Buttons
document.querySelectorAll('.minimize-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent island click from firing immediately
        const island = btn.closest('.island');
        if (island) {
            island.classList.toggle('minimized');
            
            if (island.classList.contains('minimized')) {
                // Store height and clear inline style to allow CSS auto-height
                if (island.style.height) {
                    island.dataset.prevHeight = island.style.height;
                }
                island.style.height = '';
                btn.textContent = '[+]';
            } else {
                // Restore height
                if (island.dataset.prevHeight) {
                    island.style.height = island.dataset.prevHeight;
                }
                btn.textContent = '[-]';
            }
        }
    });
});

window.toggleDock = function() {
    isDocked = !isDocked;
    const uiContainer = document.getElementById('ui-container');
    
    if (isDocked) {
        dockBtn.textContent = 'Undock UI';
        
        // Create Containers
        let dockTop = document.getElementById('dock-top');
        if (!dockTop) {
            dockTop = document.createElement('div');
            dockTop.id = 'dock-top';
            dockTop.className = 'dock-top-container';
            uiContainer.appendChild(dockTop);
        }
        
        let dockBottom = document.getElementById('dock-bottom');
        if (!dockBottom) {
            dockBottom = document.createElement('div');
            dockBottom.id = 'dock-bottom';
            dockBottom.className = 'dock-bottom-container';
            uiContainer.appendChild(dockBottom);
        }
        
        // Move Islands
        document.querySelectorAll('.island').forEach(island => {
            // Save Position & Dimensions
            originalPositions.set(island.id, {
                top: island.style.top,
                left: island.style.left,
                right: island.style.right,
                width: island.style.width,
                height: island.style.height
            });
            
            // Clear positioning styles
            island.style.top = '';
            island.style.left = '';
            island.style.right = '';
            island.style.bottom = '';
            // Only clear dimensions for non-timeline items to allow flex
            if (island.id !== 'timeline-island') {
                 island.style.width = '';
                 island.style.height = '';
            }
            island.classList.add('docked');
            
            if (island.id === 'timeline-island') {
                dockBottom.appendChild(island);
                // Force resize for timeline canvas
                if (window.visualTimeline) {
                    setTimeout(() => window.visualTimeline.resize(), 100);
                }
            } else {
                dockTop.appendChild(island);
            }
        });
        
    } else {
        dockBtn.textContent = 'Dock UI';
        
        const dockTop = document.getElementById('dock-top');
        const dockBottom = document.getElementById('dock-bottom');
        
        // Restore Islands
        document.querySelectorAll('.island').forEach(island => {
            uiContainer.appendChild(island); // Move back
            island.classList.remove('docked');
            
            const pos = originalPositions.get(island.id);
            if (pos) {
                island.style.top = pos.top;
                island.style.left = pos.left;
                island.style.width = pos.width;
                island.style.height = pos.height;
            }
        });
        
        // Remove Containers
        if (dockTop) dockTop.remove();
        if (dockBottom) dockBottom.remove();
        
        // Trigger resize
        if (window.visualTimeline) setTimeout(() => window.visualTimeline.resize(), 50);
    }
};

// Initialize Dock Button
if (dockBtn) {
    dockBtn.addEventListener('click', window.toggleDock);
}

function makeDraggable(el) {
    const header = el.querySelector('.island-header');
    if (!header) return;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (isDocked) return; // Disable dragging when docked
        if (el.classList.contains('minimized')) return;
        if (e.target.classList.contains('minimize-btn')) return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
        el.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Initialize Draggable Islands
document.querySelectorAll('.island').forEach(island => {
    makeDraggable(island);
    island.addEventListener('click', (e) => {
        if (island.classList.contains('minimized')) {
            island.classList.remove('minimized');
        }
    });
});

// --- 2. Audio Player & Logic ---

function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.connect(audioContext.destination);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    }
}

audioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('audioFile', file);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const data = await response.json();
        
        tracks.push({ name: file.name, path: data.filePath });
        renderPlaylist();
        
        if (currentTrackIndex === -1) {
            loadTrack(0);
        }
    } catch (err) {
        console.error('Upload failed:', err);
    }
});

function renderPlaylist() {
    playlistEl.innerHTML = '';
    tracks.forEach((track, index) => {
        const li = document.createElement('li');
        li.textContent = track.name;
        if (index === currentTrackIndex) li.classList.add('active');
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            loadTrack(index);
        });
        playlistEl.appendChild(li);
    });
}

function loadTrack(index) {
    if (index < 0 || index >= tracks.length) return;
    ensureAudioContext();
    
    if (audio) {
        audio.pause();
        audio.removeEventListener('timeupdate', updateProgress);
        audio.removeEventListener('ended', playNext);
    }

    currentTrackIndex = index;
    const trackPath = tracks[currentTrackIndex].path;
    audio = new Audio(trackPath);
    window.audio = audio;
    
    // Show Loading
    if (visualTimeline) visualTimeline.showLoading('Downloading & Decoding...');

    // Load full buffer for visualization
    console.log('Client: Fetching track...', trackPath);
    fetch(trackPath)
        .then(response => {
            console.log('Client: Track fetched. Status:', response.status);
            return response.arrayBuffer();
        })
        .then(arrayBuffer => {
            console.log('Client: Decoding audio data...');
            return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(audioBuffer => {
            console.log('Client: Audio decoded. Duration:', audioBuffer.duration);
            if (visualTimeline) {
                visualTimeline.setLoadingText('Analyzing Audio Spectrum...');
                console.log('Client: Calling visualTimeline.analyzeAudio');
                visualTimeline.analyzeAudio(audioBuffer);
            } else {
                console.error('Client: visualTimeline is not initialized!');
            }
        })
        .catch(err => {
            console.error('Client: Error loading waveform:', err);
            if (visualTimeline) {
                visualTimeline.setLoadingText('Error Loading Track');
                setTimeout(() => visualTimeline.hideLoading(), 2000);
            }
        });

    if (source) source.disconnect();
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', playNext);
    audio.addEventListener('loadedmetadata', () => {
        durationSpan.textContent = formatTime(audio.duration);
        progressBar.max = audio.duration;
    });

    renderPlaylist();
    // Auto-play removed. User must click Play.
    playPauseBtn.textContent = 'Play';
    isPlaying = false;
}

function playAudio() {
    if (!audio) return;
    audio.play();
    isPlaying = true;
    playPauseBtn.textContent = 'Pause';
    if (audioContext.state === 'suspended') audioContext.resume();
}

function pauseAudio() {
    if (!audio) return;
    audio.pause();
    isPlaying = false;
    playPauseBtn.textContent = 'Play';
}

function stopAudio() {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    playPauseBtn.textContent = 'Play';
}

function playNext() {
    let nextIndex = (currentTrackIndex + 1) % tracks.length;
    if (tracks.length > 0) loadTrack(nextIndex);
}

function playPrev() {
    let prevIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    if (tracks.length > 0) loadTrack(prevIndex);
}

function updateProgress() {
    if (!audio) return;
    progressBar.value = audio.currentTime;
    currentTimeSpan.textContent = formatTime(audio.currentTime);
    if (visualTimeline) visualTimeline.updatePlayhead(audio.currentTime, audio.duration);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

playPauseBtn.addEventListener('click', (e) => { e.stopPropagation(); isPlaying ? pauseAudio() : playAudio(); });
stopBtn.addEventListener('click', (e) => { e.stopPropagation(); stopAudio(); });
nextBtn.addEventListener('click', (e) => { e.stopPropagation(); playNext(); });
prevBtn.addEventListener('click', (e) => { e.stopPropagation(); playPrev(); });
progressBar.addEventListener('input', (e) => { e.stopPropagation(); if (audio) audio.currentTime = progressBar.value; });
visualStyleSelect.addEventListener('click', (e) => e.stopPropagation());

// --- 3. Audio Reactivity UI ---

const freqCanvas = document.getElementById('frequency-monitor');
const freqCtx = freqCanvas.getContext('2d');
const lowSensInput = document.getElementById('low-sens');
const midSensInput = document.getElementById('mid-sens');
const highSensInput = document.getElementById('high-sens');
const autoGainCheck = document.getElementById('auto-gain');

function updateSens(key, inputId, displayId) {
    const val = parseFloat(document.getElementById(inputId).value);
    audioMetrics[key] = val;
    document.getElementById(displayId).textContent = val.toFixed(1);
}

lowSensInput.addEventListener('input', () => updateSens('lowSens', 'low-sens', 'low-sens-val'));
midSensInput.addEventListener('input', () => updateSens('midSens', 'mid-sens', 'mid-sens-val'));
highSensInput.addEventListener('input', () => updateSens('highSens', 'high-sens', 'high-sens-val'));

autoGainCheck.addEventListener('change', (e) => {
    audioMetrics.autoGain = e.target.checked;
    if (!audioMetrics.autoGain) audioMetrics.gainFactor = 1.0;
});

function drawFrequencyMonitor(low, mid, high) {
    const w = freqCanvas.width;
    const h = freqCanvas.height;
    freqCtx.clearRect(0, 0, w, h);

    // Bars
    const barW = (w - 10) / 3;
    
    // Low
    freqCtx.fillStyle = '#ef4444'; // Red-ish
    const hLow = low * h;
    freqCtx.fillRect(0, h - hLow, barW, hLow);

    // Mid
    freqCtx.fillStyle = '#22c55e'; // Green-ish
    const hMid = mid * h;
    freqCtx.fillRect(barW + 5, h - hMid, barW, hMid);

    // High
    freqCtx.fillStyle = '#3b82f6'; // Blue-ish
    const hHigh = high * h;
    freqCtx.fillRect((barW + 5) * 2, h - hHigh, barW, hHigh);
}

// --- TIMELINE SEGMENTATION SYSTEM ---
window.TAG_LIBRARY = {
    'Build Up': { 
        color: '#ffaa00',
        values: { uSpeed: 2.0, uColorShift: 0.8, uZoom: 1.2 }, 
        transition: { duration: 2.0, curve: 'easeInQuad' } 
    },
    'Drop': { 
        color: '#ff0000',
        values: { uSpeed: 5.0, uColorShift: 1.0, uGlow: 2.0, uPitch: 1.0 }, 
        transition: { duration: 0.0, curve: 'linear' } 
    },
    'Calm': { 
        color: '#00ccff',
        values: { uSpeed: 0.2, uSaturation: 0.5, uZoom: 2.0 }, 
        transition: { duration: 2.0, curve: 'linear' } 
    }
};

window.activeSegments = [];

// Helper: Linear Interpolation
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

const EASING = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1
};

// Helper: Get All Controllable Params (Global)
window.getAllAvailableParams = () => {
    const params = [];
    // Camera
    ALL_CAMERA_PARAMS.forEach(p => params.push({...p, type: 'Camera'}));
    // Visuals
    const shaderKeys = new Set();
    Object.values(SHADER_PARAMS).forEach(arr => {
        arr.forEach(p => {
            if (!shaderKeys.has(p.name)) {
                params.push({...p, type: 'Visual'});
                shaderKeys.add(p.name);
            }
        });
    });
    // Color / Advanced Visuals
    params.push({ name: 'uBaseColor', label: 'Base Color', inputType: 'color', type: 'Color' });
    params.push({ name: 'uHighlight', label: 'Highlight', inputType: 'color', type: 'Color' });
    params.push({ name: 'uLowlight', label: 'Lowlight', inputType: 'color', type: 'Color' });
    params.push({ name: 'uHighColor', label: 'High Resp', inputType: 'color', type: 'Color' });
    params.push({ name: 'uMidColor', label: 'Mid Resp', inputType: 'color', type: 'Color' });
    params.push({ name: 'uLowColor', label: 'Low Resp', inputType: 'color', type: 'Color' });
    
    params.push({ name: 'uGlowStrength', label: 'Glow Str', min: 0.0, max: 5.0, type: 'Visual' });
    params.push({ name: 'uBloomStrength', label: 'Bloom Str', min: 0.0, max: 2.0, type: 'Visual' });
    
    return params;
};

function applyTimelineLogic(manualTargets) {
    // 0. Preview Mode Override (Editor active)
    if (typeof previewMode !== 'undefined' && previewMode && typeof currentTag !== 'undefined' && currentTag && window.TAG_LIBRARY[currentTag]) {
        const config = window.TAG_LIBRARY[currentTag];
        const values = config.values || {};
        
        Object.keys(values).forEach(key => {
            if (!uniforms[key]) return;
            const tagVal = values[key];
            
            if (uniforms[key].value && uniforms[key].value.isColor) {
                const targetColor = new THREE.Color(tagVal);
                uniforms[key].value.copy(targetColor);
            } else {
                uniforms[key].value = tagVal;
            }
        });
        
        // Also apply material sync if needed
        if (typeof material !== 'undefined' && material) {
            Object.keys(values).forEach(key => {
                if (material.uniforms[key]) material.uniforms[key].value = uniforms[key].value;
            });
        }
        return;
    }

    const currentTime = window.audio ? window.audio.currentTime : 0;
    
    // 1. Find Active Segment
    const currentSeg = window.activeSegments.find(seg => 
        currentTime >= seg.start && currentTime <= seg.end
    );

    // 2. Default: Just use manual targets if no tag
    if (!currentSeg || !currentSeg.tag || !window.TAG_LIBRARY[currentSeg.tag]) {
        // Smoothly return to manual if we were controlled? 
        // For now, let's assume we drift back to manual.
        // We can check if we need to drift back, but for now strict return to manual is safer for logic.
        Object.keys(manualTargets).forEach(key => {
            if (uniforms[key]) {
                // simple drift back
                 // Note: Since we don't have a 'previous' state stored, immediate return 
                 // might jump. Ideally we'd lerp here too, but let's stick to the requested logic.
                 // The prompt suggested: "drift back... lerp... 0.1"
                uniforms[key].value = lerp(uniforms[key].value, manualTargets[key], 0.1); 
            }
        });
        return;
    }

    const config = window.TAG_LIBRARY[currentSeg.tag];
    let weight = 0;

    if (config.useADSR && config.adsr) {
        const t = currentTime - currentSeg.start;
        const dur = currentSeg.end - currentSeg.start;
        const { attack, decay, sustain, release } = config.adsr;

        // 1. Attack
        if (t < attack) {
             weight = (attack > 0) ? (t / attack) : 1.0;
        } 
        // 2. Decay
        else if (t < attack + decay) {
            const decayProgress = (decay > 0) ? (t - attack) / decay : 1.0;
            weight = 1.0 - (decayProgress * (1.0 - sustain));
        } 
        // 3. Sustain
        else if (t < dur - release) {
            weight = sustain;
        } 
        // 4. Release
        else {
             const releaseTime = t - (dur - release);
             const releaseProgress = (release > 0) ? (releaseTime / release) : 1.0;
             weight = sustain * (1.0 - releaseProgress);
        }
        weight = Math.max(0, Math.min(1.0, weight)) || 0;
    } else {
        const trans = config.transition || { duration: 0.5, curve: 'linear' }; // Default fallback

        // 3. Calculate Weight based on Time
        const elapsed = currentTime - currentSeg.start;
        let progress = 0;

        if (trans.duration <= 0) {
            progress = 1.0; // Instant Cut
        } else {
            progress = Math.min(elapsed / trans.duration, 1.0);
        }

        // 4. Apply Easing
        const easeFn = (trans.curve && EASING[trans.curve]) ? EASING[trans.curve] : EASING.linear;
        weight = easeFn(progress);
    }

    // 5. Apply Values (Lerp from Manual -> Tag based on Weight)
    const targetValues = config.values || {};
    
    // Iterate all controlled keys (Manual + Tag keys)
    const allKeys = new Set([...Object.keys(manualTargets), ...Object.keys(targetValues)]);

    allKeys.forEach(key => {
        if (!uniforms[key]) return;

        const manualVal = manualTargets[key] !== undefined ? manualTargets[key] : uniforms[key].value;
        
        // If the tag controls this key, blend towards it
        if (targetValues.hasOwnProperty(key)) {
            const tagVal = targetValues[key];
            
            if (uniforms[key].value && uniforms[key].value.isColor) {
                const targetColor = new THREE.Color(tagVal);
                if (manualVal && manualVal.isColor) {
                    uniforms[key].value.copy(manualVal).lerp(targetColor, weight);
                }
            } else {
                // Interpolate based on the time-based weight
                uniforms[key].value = lerp(manualVal, tagVal, weight);
            }
        } else {
            // Tag doesn't care about this key, revert to manual
            if (uniforms[key].value && uniforms[key].value.isColor) {
                 if (manualVal && manualVal.isColor) uniforms[key].value.copy(manualVal);
            } else {
                 uniforms[key].value = manualVal; 
            }
        }
        
        // Sync Material
        if (material && material.uniforms[key]) {
            material.uniforms[key].value = uniforms[key].value;
        }
    });
}

// --- MODULATION MATRIX SYSTEM ---
let activeModulators = [];

const MOD_SOURCES = [
    { id: 'lows', label: 'Bass' },
    { id: 'mids', label: 'Snare' },
    { id: 'highs', label: 'Hats' },
    { id: 'vol', label: 'Volume' }
];

const MOD_TARGETS = [
    { id: 'uPitch', label: 'Tilt' },
    { id: 'uYaw', label: 'Spin' },
    { id: 'uRoll', label: 'Twist' },
    { id: 'uZoom', label: 'Zoom' },
    { id: 'uColorShift', label: 'Color' },
    { id: 'uSpeed', label: 'Speed' }
];

function applyModulations() {
    // Reset exclusive FX uniforms to 0 before applying modulation
    if (uniforms.uPitch) uniforms.uPitch.value = 0.0;
    if (uniforms.uYaw) uniforms.uYaw.value = 0.0;
    if (uniforms.uRoll) uniforms.uRoll.value = 0.0;

    // We need access to current audio levels.
    // They are in global vars: uBassValue, uMidValue, uHighValue.
    // Let's create a map for easier access.
    const audioLevels = {
        lows: uBassValue,
        mids: uMidValue,
        highs: uHighValue,
        vol: (uBassValue + uMidValue + uHighValue) / 3
    };

    activeModulators.forEach(mod => {
        const audioVal = audioLevels[mod.source] || 0;
        // Map Range: min + (audio * (max - min))
        const modVal = mod.min + (audioVal * (mod.max - mod.min));
        
        if (uniforms[mod.target]) {
            uniforms[mod.target].value += modVal;
        }
        
        // Also update material uniforms if they exist (for shader parity)
        if (material && material.uniforms[mod.target]) {
            material.uniforms[mod.target].value = uniforms[mod.target].value;
        }
    });
}

function renderModulatorUI(container) {
    // Container for the list
    let listContainer = document.getElementById('modulator-list');
    if (!listContainer) {
        listContainer = document.createElement('div');
        listContainer.id = 'modulator-list';
        container.appendChild(listContainer);
    } else {
        listContainer.innerHTML = '';
    }

    // Render Rows
    activeModulators.forEach((mod, index) => {
        const row = document.createElement('div');
        row.className = 'mod-row';

        // Source Select
        const sourceSel = document.createElement('select');
        sourceSel.className = 'mod-select';
        MOD_SOURCES.forEach(src => {
            const opt = document.createElement('option');
            opt.value = src.id;
            opt.textContent = src.label;
            if (src.id === mod.source) opt.selected = true;
            sourceSel.appendChild(opt);
        });
        sourceSel.onchange = (e) => mod.source = e.target.value;
        row.appendChild(sourceSel);

        // Arrow
        const arrow = document.createElement('span');
        arrow.className = 'mod-arrow';
        arrow.textContent = '→';
        row.appendChild(arrow);

        // Target Select
        const targetSel = document.createElement('select');
        targetSel.className = 'mod-select';
        MOD_TARGETS.forEach(tgt => {
            const opt = document.createElement('option');
            opt.value = tgt.id;
            opt.textContent = tgt.label;
            if (tgt.id === mod.target) opt.selected = true;
            targetSel.appendChild(opt);
        });
        targetSel.onchange = (e) => mod.target = e.target.value;
        row.appendChild(targetSel);

        // Min Input
        const minInput = document.createElement('input');
        minInput.className = 'mod-input';
        minInput.type = 'number';
        minInput.step = '0.1';
        minInput.value = mod.min;
        minInput.onchange = (e) => mod.min = parseFloat(e.target.value);
        row.appendChild(minInput);

        // Max Input
        const maxInput = document.createElement('input');
        maxInput.className = 'mod-input';
        maxInput.type = 'number';
        maxInput.step = '0.1';
        maxInput.value = mod.max;
        maxInput.onchange = (e) => mod.max = parseFloat(e.target.value);
        row.appendChild(maxInput);

        // Delete Button
        const delBtn = document.createElement('button');
        delBtn.className = 'mod-delete-btn';
        delBtn.textContent = '✕';
        delBtn.onclick = () => {
            activeModulators.splice(index, 1);
            renderModulatorUI(container);
        };
        row.appendChild(delBtn);

        listContainer.appendChild(row);
    });

    // Add Button (Only render once if not present)
    let addBtn = document.getElementById('add-modulator-btn');
    if (!addBtn) {
        addBtn = document.createElement('button');
        addBtn.id = 'add-modulator-btn';
        addBtn.textContent = '+ Add Modulator';
        addBtn.onclick = () => {
            activeModulators.push({
                source: 'lows',
                target: 'uPitch',
                min: 0.0,
                max: 0.5
            });
            renderModulatorUI(container);
        };
        container.appendChild(addBtn);
    }
}

// --- CONFIGURATION SPLIT ---
const CAMERA_POS = [
    { 
        name: 'uCamX', label: 'Pan X', min: -2.0, max: 2.0, value: 0.0, 
        automation: { enabled: false, source: 'uBass', strength: 0.0 } 
    },
    { 
        name: 'uCamY', label: 'Pan Y', min: -2.0, max: 2.0, value: 0.0, 
        automation: { enabled: false, source: 'uBass', strength: 0.0 } 
    },
    { 
        name: 'uZoom', label: 'Base Zoom', min: 0.1, max: 5.0, value: 1.5, 
        automation: { enabled: false, source: 'uBass', strength: 0.0 } 
    }
];

const CAMERA_FX = []; // Deprecated in favor of Modulation Matrix

// --- ANIMATION LOOP HELPER ---
const ALL_CAMERA_PARAMS = [...CAMERA_POS];

const SHADER_PARAMS = {
    menger: [
        { 
            name: 'uSpeed', label: 'Rotation Speed', min: 0.0, max: 2.0, value: 0.2,
            automation: { enabled: false, source: 'uBass', strength: 0.1 } 
        },
        { 
            name: 'uColor', label: 'Color Shift', min: 0.0, max: 1.0, value: 0.5,
            automation: { enabled: true, source: 'uMid', strength: 0.3 } 
        },
        { 
            name: 'uSensitivity', label: 'Bass Reaction', min: 0.0, max: 2.0, value: 0.5,
            automation: { enabled: false, source: 'uBass', strength: 0.5 }
        }
    ],
    tunnel: [
        { 
            name: 'uSpeed', label: 'Flight Speed', min: 1.0, max: 20.0, value: 10.0,
            automation: { enabled: true, source: 'uBass', strength: 5.0 }
        },
        { 
            name: 'uWarp', label: 'Tunnel Warp', min: 0.0, max: 0.5, value: 0.1,
            automation: { enabled: true, source: 'uMid', strength: 0.2 } 
        },
        { 
            name: 'uGlow', label: 'Glow Intensity', min: 0.5, max: 5.0, value: 1.5,
            automation: { enabled: true, source: 'uHigh', strength: 1.0 } 
        }
    ]
};

// --- Reset Logic: Capture Defaults ---
function captureDefaults(config) {
    if (Array.isArray(config)) {
        config.forEach(param => {
            if (param.defaultValue === undefined) {
                param.defaultValue = param.value !== undefined ? param.value : param.val;
            }
            if (param.automation && !param.defaultAutomation) {
                param.defaultAutomation = JSON.parse(JSON.stringify(param.automation));
            }
        });
    } else {
        // Handle object of arrays (SHADER_PARAMS)
        Object.values(config).forEach(array => captureDefaults(array));
    }
}

captureDefaults(ALL_CAMERA_PARAMS);
captureDefaults(SHADER_PARAMS);

const SHADER_LIB = {
    menger: `
        uniform float iTime;
        uniform vec2 iResolution;
        uniform float uBass;
        uniform float uMid;
        uniform float uHigh;
        uniform float uSpeed;
        uniform float uColor;
        uniform float uSensitivity;
        uniform float uCamX;
        uniform float uCamY;
        uniform float uZoom;
        
        // Camera Rotation (6DoF)
        uniform float uPitch;
        uniform float uYaw;
        uniform float uRoll;
        
        // Color Engine
        uniform float uBaseHue;
        uniform float uSaturation;
        uniform float uColorShift;
        
        varying vec2 vUv;

        // --- Helpers ---
        vec3 hsl2rgb(vec3 c) {
            vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
            return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
        }

        mat3 getCamRot(vec3 rpy) {
            vec3 s = sin(rpy);
            vec3 c = cos(rpy);
            mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, c.x, -s.x, 0.0, s.x, c.x);
            mat3 rotY = mat3(c.y, 0.0, s.y, 0.0, 1.0, 0.0, -s.y, 0.0, c.y);
            mat3 rotZ = mat3(c.z, -s.z, 0.0, s.z, c.z, 0.0, 0.0, 0.0, 1.0);
            return rotZ * rotY * rotX;
        }

        float sdBox(vec3 p, vec3 b) {
            vec3 q = abs(p) - b;
            return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
        }

        float map(vec3 p) {
            float boxSize = 1.0 + uBass * uSensitivity;
            float d = sdBox(p, vec3(boxSize));
            float s = 1.0;
            for(int m = 0; m < 3; m++) {
                vec3 a = mod(p * s, 2.0) - 1.0;
                s *= 3.0;
                vec3 r = abs(1.0 - 3.0 * abs(a));
                float da = max(r.x, r.y);
                float db = max(r.y, r.z);
                float dc = max(r.z, r.x);
                float c = (min(da, min(db, dc)) - 1.0) / s;
                d = max(d, c);
            }
            return d;
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
            
            // --- Camera Setup ---
            vec3 ro = vec3(uCamX, uCamY, 3.5); 
            vec3 rd = normalize(vec3(uv, -uZoom));
            
            // Apply 6DoF Rotation
            mat3 camRot = getCamRot(vec3(uPitch, uYaw, uRoll));
            rd = camRot * rd;
            ro = camRot * ro; // Orbital rotation
            
            // Auto-rotation from Time (Legacy parameter support)
            float rotX = iTime * uSpeed * 0.1;
            float rotY = iTime * uSpeed * 0.15;
            mat3 mX = mat3(1, 0, 0, 0, cos(rotX), -sin(rotX), 0, sin(rotX), cos(rotX));
            mat3 mY = mat3(cos(rotY), 0, sin(rotY), 0, 1, 0, -sin(rotY), 0, cos(rotY));
            rd *= mX * mY;
            ro *= mX * mY;

            // --- Raymarching ---
            float t = 0.0;
            int i;
            for(i = 0; i < 64; i++) {
                float h = map(ro + rd * t);
                if(h < 0.001 || t > 20.0) break;
                t += h;
            }
            
            vec3 col = vec3(0.0);
            if(t < 20.0) {
                float glow = 1.0 - float(i) / 64.0;
                
                // --- Color Engine ---
                float hue = (uBaseHue / 360.0) + (uMid * uColorShift);
                hue = fract(hue); // Wrap 0.0-1.0
                float sat = uSaturation; // 0.0-1.0 from JS
                
                vec3 hslColor = hsl2rgb(vec3(hue, sat, 0.5));
                
                // Mix with lighting
                col = hslColor * glow * (1.0 + uBass * 2.0);
            }
            
            // Fog / Depth
            col = mix(col, vec3(0.0), 1.0 - exp(-0.1 * t));
            
            gl_FragColor = vec4(col, 1.0);
        }
    `,
    tunnel: `
        uniform float iTime;
        uniform vec2 iResolution;
        uniform float uBass;
        uniform float uMid;
        uniform float uHigh;
        uniform float uSpeed;
        uniform float uWarp;
        uniform float uGlow; // Internal tunnel glow param? Or should we use uGlowStrength? 
        // Let's keep uGlow for tunnel geometry logic if it differs, but mapping implies uGlowStrength is global.
        // But here uGlow is a param. Let's use global uGlowStrength for the final mix.
        
        uniform float uCamX;
        uniform float uCamY;
        uniform float uZoom;
        
        // Camera Rotation
        uniform float uPitch;
        uniform float uYaw;
        uniform float uRoll;
        
        // Color Engine (New)
        uniform vec3 uBaseColor;
        uniform vec3 uHighlight;
        uniform vec3 uLowlight;
        uniform vec3 uHighColor;
        uniform vec3 uMidColor;
        uniform vec3 uLowColor;
        uniform float uGlowStrength;
        uniform float uBloomStrength;
        
        varying vec2 vUv;

        // --- Helpers ---
        // (hsl2rgb removed as unused)

        mat3 getCamRot(vec3 rpy) {
            vec3 s = sin(rpy);
            vec3 c = cos(rpy);
            mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, c.x, -s.x, 0.0, s.x, c.x);
            mat3 rotY = mat3(c.y, 0.0, s.y, 0.0, 1.0, 0.0, -s.y, 0.0, c.y);
            mat3 rotZ = mat3(c.z, -s.z, 0.0, s.z, c.z, 0.0, 0.0, 0.0, 1.0);
            return rotZ * rotY * rotX;
        }

        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        float map(vec3 p) {
            p.z = mod(p.z, 20.0) - 10.0;
            // Twist based on Mid frequencies
            p.xy *= rot(p.z * (uWarp + uMid * 0.2) * sin(iTime * 0.5));
            
            vec3 b = vec3(2.5, 2.5, 12.0);
            // Pulse tunnel radius based on Bass
            b.xy += uBass * 0.5; 
            
            vec3 q = abs(p) - b;
            float box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
            
            // Ripple effect
            float ripple = sin(p.x * 2.0 + iTime * 2.0) * cos(p.y * 2.0 + iTime * 2.0) * 0.2 * uBass;
            return -box + ripple;
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
            
            // FOV kick based on Bass
            vec3 ro = vec3(uCamX, uCamY, iTime * uSpeed);
            vec3 rd = normalize(vec3(uv, uZoom - uBass * 0.2)); 
            
            // Apply 6DoF Rotation
            mat3 camRot = getCamRot(vec3(uPitch, uYaw, uRoll));
            rd = camRot * rd;
            
            // Extra tunnel twist
            rd.xy *= rot(iTime * 0.1);
            
            float t = 0.0;
            int i;
            for(i = 0; i < 80; i++) {
                float h = map(ro + rd * t);
                if(h < 0.001 || t > 40.0) break;
                t += h;
            }
            
            vec3 col = vec3(0.0);
            if(t < 40.0) {
                float glow = 1.0 - float(i) / 80.0;
                
                // --- Color Engine ---
                vec3 atmosphere = mix(uLowlight, uHighlight, glow);
                vec3 audioReact = (uLowColor * uBass) + (uMidColor * uMid) + (uHighColor * uHigh);
                
                // Mix dynamic hue with a bit of the old palette for flavor
                // vec3 baseCol = hsl2rgb(vec3(hue, uSaturation, 0.5));
                
                col = uBaseColor * atmosphere;
                col += audioReact * uBloomStrength * glow;
                
                // Brightness/Bloom based on High
                col *= uGlowStrength * glow * (1.0 + uBass * 3.0 + uHigh * 4.0);
            }
            
            col *= exp(-0.05 * t);
            gl_FragColor = vec4(col, 1.0);
        }
    `
};

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const uniforms = {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    // Color Palette Uniforms
    uBaseColor: { value: new THREE.Color(0xffffff) },
    uHighlight: { value: new THREE.Color(0x38bdf8) }, // Cyan-ish
    uLowlight:  { value: new THREE.Color(0x1a0b2e) }, // Dark Purple
    uHighColor: { value: new THREE.Color(0xff00ff) }, // Magenta
    uMidColor:  { value: new THREE.Color(0x00ff00) }, // Green
    uLowColor:  { value: new THREE.Color(0xff0000) }, // Red
    uGlowStrength: { value: 1.5 },
    uBloomStrength: { value: 0.8 },
    // Legacy support (optional, can remove if unused by logic)
    uBaseHue: { value: 0.0 },
    uSaturation: { value: 1.0 },
    uColorShift: { value: 0.5 },
    // Camera Orientation
    uPitch: { value: 0.0 },
    uYaw: { value: 0.0 },
    uRoll: { value: 0.0 }
};
window.uniforms = uniforms; // Expose for Timeline

// --- Color Palette Logic ---
const baseHueInput = document.getElementById('base-hue');
const saturationInput = document.getElementById('saturation');
const colorShiftInput = document.getElementById('color-shift');
const manualColorToggle = document.getElementById('manual-color-toggle');

function updateColorUIState() {
    if (!manualColorToggle) return;
    const enabled = manualColorToggle.checked;
    baseHueInput.disabled = !enabled;
    saturationInput.disabled = !enabled;
    colorShiftInput.disabled = !enabled;
    
    const opacity = enabled ? '1' : '0.3';
    baseHueInput.style.opacity = opacity;
    saturationInput.style.opacity = opacity;
    colorShiftInput.style.opacity = opacity;
}

if (manualColorToggle) {
    manualColorToggle.addEventListener('change', updateColorUIState);
    updateColorUIState(); // Init state
}

function updateColorParams() {
    const hue = parseFloat(baseHueInput.value);
    const sat = parseFloat(saturationInput.value);
    const shift = parseFloat(colorShiftInput.value);

    // Update Displays
    document.getElementById('base-hue-val').textContent = hue;
    document.getElementById('saturation-val').textContent = sat + '%';
    document.getElementById('color-shift-val').textContent = shift.toFixed(2);

    // Update Uniforms
    uniforms.uBaseHue.value = hue;
    uniforms.uSaturation.value = sat / 100.0;
    uniforms.uColorShift.value = shift;

    // Update Timeline Visualization
    if (visualTimeline) {
        visualTimeline.setColorParams(hue, sat, shift);
    }
}

baseHueInput.addEventListener('input', updateColorParams);
saturationInput.addEventListener('input', updateColorParams);
colorShiftInput.addEventListener('input', updateColorParams);

// Initialize Camera Uniforms
ALL_CAMERA_PARAMS.forEach(param => {
    // Ensure we use .value (new config) or fallback to .val (old config)
    const v = param.value !== undefined ? param.value : param.val;
    uniforms[param.name] = { value: v };
});

const geometry = new THREE.PlaneGeometry(2, 2);
let material;
let mesh;

function createSliderElement(param, container, onInput) {
    // 1. Create Row
    const row = document.createElement('div');
    row.className = 'control-row';
    row.style.marginBottom = '12px';
    row.style.position = 'relative';

    // 2. Header (Label + Manual Toggle)
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '4px';

    const label = document.createElement('label');
    label.textContent = param.label;
    label.style.fontSize = '12px';
    label.style.color = '#ccc';
    header.appendChild(label);

    // Add Toggle ONLY if automation config exists
    if (param.automation) {
        const toggleLabel = document.createElement('label');
        toggleLabel.style.fontSize = '10px';
        toggleLabel.style.cursor = 'pointer';
        toggleLabel.style.display = 'flex';
        toggleLabel.style.alignItems = 'center';
        toggleLabel.style.gap = '4px';
        toggleLabel.style.color = '#888';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !param.automation.enabled; // Checked = Manual
        checkbox.onchange = (e) => {
            param.automation.enabled = !e.target.checked;
            // Toggle visibility of the "Ghost Bar"
            const meter = row.querySelector('.live-meter');
            if (meter) meter.style.display = param.automation.enabled ? 'block' : 'none';
        };

        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(document.createTextNode('Manual'));
        header.appendChild(toggleLabel);
    }
    row.appendChild(header);

    // 3. Slider Track Container
    const sliderContainer = document.createElement('div');
    sliderContainer.style.position = 'relative';
    sliderContainer.style.height = '6px';
    sliderContainer.style.background = 'rgba(255,255,255,0.1)';
    sliderContainer.style.borderRadius = '3px';
    sliderContainer.style.marginTop = '5px';

    // 4. Live Meter (The "Ghost Bar")
    const liveMeter = document.createElement('div');
    liveMeter.className = 'live-meter'; // Class for easy selection
    liveMeter.style.position = 'absolute';
    liveMeter.style.top = '0';
    liveMeter.style.left = '0';
    liveMeter.style.height = '100%';
    liveMeter.style.width = '0%'; // Will be updated by animate()
    liveMeter.style.background = 'rgba(56, 189, 248, 0.5)'; // Brighter Blue
    liveMeter.style.borderRadius = '3px';
    liveMeter.style.pointerEvents = 'none'; // Click-through
    liveMeter.style.transition = 'width 0.05s linear';
    liveMeter.style.display = (param.automation && param.automation.enabled) ? 'block' : 'none';
    
    // CRITICAL: Attach to param for animate loop access
    param.uiMeter = liveMeter;
    
    sliderContainer.appendChild(liveMeter);

    // 5. The Input Slider
    const input = document.createElement('input');
    input.type = 'range';
    input.min = param.min;
    input.max = param.max;
    input.step = (param.max - param.min) / 100;
    input.value = param.value !== undefined ? param.value : param.val;
    input.style.width = '100%';
    input.style.height = '15px'; // Taller hit area
    input.style.marginTop = '-4px'; // Center over track
    input.style.cursor = 'pointer';
    input.style.position = 'absolute';
    input.style.top = '0';
    input.style.margin = '0';
    input.style.opacity = '0'; // Invisible track, custom thumb? 
    // Actually, making it invisible hides the thumb too in some browsers.
    // Let's use opacity 1 but transparent background so we see the meter.
    input.style.opacity = '1';
    input.style.background = 'transparent';
    input.style.appearance = 'none'; 
    input.style.webkitAppearance = 'none';

    // Tooltip
    input.setAttribute('data-tooltip', `Adjust ${param.label}`);

    input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (param.value !== undefined) param.value = val;
        else param.val = val;
        onInput(val);
    });

    // Custom Thumb Styles (Injected via style tag or inline is hard for pseudo-elements)
    // For now, rely on default thumb but transparent track.

    sliderContainer.appendChild(input);
    row.appendChild(sliderContainer);
    container.appendChild(row);
}

function renderTagEditor() {
    const visualContent = document.querySelector('#visual-island .content-area');
    if (!visualContent) return;

    let container = document.getElementById('tag-editor-section');
    if (!container) {
        container = document.createElement('div');
        container.id = 'tag-editor-section';
        container.style.marginTop = '20px';
        container.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        container.style.paddingTop = '15px';
        visualContent.appendChild(container);
    }
    container.innerHTML = '';

    // State
    let currentTag = Object.keys(window.TAG_LIBRARY)[0] || '';
    let previewMode = true;

    // Helper: Get All Params
    const getAllAvailableParams = () => {
        const params = [];
        
        // 1. Camera
        ALL_CAMERA_PARAMS.forEach(p => params.push({...p, type: 'Camera'}));
        
        // 2. Visuals (Current Shader) - Note: This might change if shader changes
        // For simplicity, we grab from 'menger' and 'tunnel' and unique by name
        const shaderKeys = new Set();
        Object.values(SHADER_PARAMS).forEach(arr => {
            arr.forEach(p => {
                if (!shaderKeys.has(p.name)) {
                    params.push({...p, type: 'Visual'});
                    shaderKeys.add(p.name);
                }
            });
        });
        
        // 3. Color
        params.push({ name: 'uBaseHue', label: 'Base Hue', min: 0, max: 360, value: 0, type: 'Color' });
        params.push({ name: 'uSaturation', label: 'Saturation', min: 0, max: 1, value: 1, type: 'Color' });
        params.push({ name: 'uColorShift', label: 'Color Shift', min: 0, max: 1, value: 0.5, type: 'Color' });
        
        return params;
    };

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'tag-editor-row';
    header.style.justifyContent = 'space-between';
    
    const title = document.createElement('h4');
    title.textContent = 'TAG EDITOR';
    title.style.margin = '0';
    title.style.fontSize = '12px';
    title.style.color = '#38bdf8';
    title.style.letterSpacing = '1px';
    header.appendChild(title);
    container.appendChild(header);

    // --- Controls Row (Select, Add, Delete) ---
    const controls = document.createElement('div');
    controls.className = 'tag-editor-row';
    
    const tagSelect = document.createElement('select');
    tagSelect.className = 'tag-editor-select';
    
    const refreshSelect = () => {
        tagSelect.innerHTML = '';
        Object.keys(window.TAG_LIBRARY).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === currentTag) opt.selected = true;
            tagSelect.appendChild(opt);
        });
    };
    refreshSelect();
    
    tagSelect.onchange = (e) => {
        currentTag = e.target.value;
        renderParamsList();
    };
    controls.appendChild(tagSelect);

    const addBtn = document.createElement('button');
    addBtn.className = 'tag-editor-btn';
    addBtn.textContent = '+';
    addBtn.title = 'New Tag';
    addBtn.onclick = () => {
        const name = prompt('New Tag Name:');
        if (name && !window.TAG_LIBRARY[name]) {
            window.TAG_LIBRARY[name] = { values: {}, transition: { duration: 1.0, curve: 'linear' } };
            currentTag = name;
            refreshSelect();
            renderParamsList();
        }
    };
    controls.appendChild(addBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'tag-editor-btn danger';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete Tag';
    delBtn.onclick = () => {
        if (!currentTag) return;
        if (confirm(`Delete "${currentTag}"?`)) {
            delete window.TAG_LIBRARY[currentTag];
            const keys = Object.keys(window.TAG_LIBRARY);
            currentTag = keys.length > 0 ? keys[0] : '';
            refreshSelect();
            renderParamsList();
        }
    };
    controls.appendChild(delBtn);
    container.appendChild(controls);

    // --- Settings Row (Transition, Preview) ---
    const settings = document.createElement('div');
    settings.className = 'tag-editor-row';
    
    // Curve Select
    const transSelect = document.createElement('select');
    transSelect.className = 'tag-editor-select';
    Object.keys(EASING).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        transSelect.appendChild(opt);
    });
    transSelect.onchange = (e) => {
        if (window.TAG_LIBRARY[currentTag]) {
             if (typeof window.TAG_LIBRARY[currentTag].transition !== 'object') {
                 window.TAG_LIBRARY[currentTag].transition = { duration: 1.0, curve: 'linear' };
             }
             window.TAG_LIBRARY[currentTag].transition.curve = e.target.value;
        }
    };
    settings.appendChild(transSelect);

    // Duration Input
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.step = '0.1';
    durInput.style.width = '40px';
    durInput.style.background = '#222';
    durInput.style.border = '1px solid #444';
    durInput.style.color = '#fff';
    durInput.style.borderRadius = '4px';
    durInput.style.padding = '4px';
    durInput.style.fontSize = '11px';
    durInput.title = 'Duration (s)';
    
    durInput.onchange = (e) => {
        if (window.TAG_LIBRARY[currentTag]) {
             if (typeof window.TAG_LIBRARY[currentTag].transition !== 'object') {
                 window.TAG_LIBRARY[currentTag].transition = { duration: 1.0, curve: 'linear' };
             }
             window.TAG_LIBRARY[currentTag].transition.duration = parseFloat(e.target.value);
        }
    };
    settings.appendChild(durInput);

    const previewLabel = document.createElement('label');
    previewLabel.style.fontSize = '11px';
    previewLabel.style.color = '#ccc';
    previewLabel.style.display = 'flex';
    previewLabel.style.alignItems = 'center';
    previewLabel.style.gap = '4px';
    const previewCheck = document.createElement('input');
    previewCheck.type = 'checkbox';
    previewCheck.checked = previewMode;
    previewCheck.onchange = (e) => {
        previewMode = e.target.checked;
        if (previewMode && currentTag) {
            // Apply current
            const vals = window.TAG_LIBRARY[currentTag].values;
            for (const [k, v] of Object.entries(vals)) {
                if (uniforms[k]) uniforms[k].value = v;
            }
        }
    };
    previewLabel.appendChild(previewCheck);
    previewLabel.appendChild(document.createTextNode('Preview'));
    settings.appendChild(previewLabel);
    
    container.appendChild(settings);

    // --- Parameters List ---
    const listContainer = document.createElement('div');
    listContainer.className = 'tag-param-list';
    container.appendChild(listContainer);

    const renderParamsList = () => {
        listContainer.innerHTML = '';
        if (!currentTag) return;
        
        const config = window.TAG_LIBRARY[currentTag];
        if (!config.values) config.values = {};
        
        // Sync Transition Select
        const t = config.transition || { duration: 1.0, curve: 'linear' };
        transSelect.value = t.curve || 'linear';
        if (typeof durInput !== 'undefined') durInput.value = t.duration !== undefined ? t.duration : 1.0;

        const allParams = getAllAvailableParams();
        
        allParams.forEach(p => {
            const row = document.createElement('div');
            row.className = 'tag-param-row';
            
            const isIncluded = config.values.hasOwnProperty(p.name);
            
            // Checkbox
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.className = 'tag-param-check';
            check.checked = isIncluded;
            check.onchange = (e) => {
                if (e.target.checked) {
                    config.values[p.name] = uniforms[p.name] ? uniforms[p.name].value : (p.value || 0);
                } else {
                    delete config.values[p.name];
                }
                renderParamsList(); // Re-render to update slider state
            };
            row.appendChild(check);
            
            // Label
            const label = document.createElement('span');
            label.className = 'tag-param-label';
            label.textContent = p.label || p.name;
            label.title = p.name;
            row.appendChild(label);
            
            // Slider
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'tag-param-slider';
            slider.min = p.min;
            slider.max = p.max;
            slider.step = (p.max - p.min) / 100;
            slider.disabled = !isIncluded;
            
            if (isIncluded) {
                slider.value = config.values[p.name];
                slider.style.opacity = '1';
            } else {
                slider.value = uniforms[p.name] ? uniforms[p.name].value : p.value;
                slider.style.opacity = '0.3';
            }
            
            slider.oninput = (e) => {
                const val = parseFloat(e.target.value);
                if (isIncluded) {
                    config.values[p.name] = val;
                    if (previewMode && uniforms[p.name]) {
                        uniforms[p.name].value = val;
                    }
                }
            };
            
            row.appendChild(slider);
            listContainer.appendChild(row);
        });
    };
    
    renderParamsList();

    // --- Footer (Capture) ---
    const captureBtn = document.createElement('button');
    captureBtn.className = 'tag-editor-btn primary';
    captureBtn.textContent = 'CAPTURE SCENE';
    captureBtn.onclick = () => {
        if (!currentTag) return;
        const config = window.TAG_LIBRARY[currentTag];
        
        // Capture ALL params that are currently checked? 
        // Or capture EVERYTHING and check them?
        // "Overwrites the editor's sliders with the current values from the Main controls."
        // Usually capture implies capturing the *active* params.
        // Let's iterate the displayed params and if checked, update value.
        // OR better: Update value for ALL params, but only check the ones that were already checked?
        // Prompt says "Overwrites... sliders...".
        // Let's update all config.values entries.
        
        Object.keys(config.values).forEach(key => {
            if (uniforms[key]) {
                config.values[key] = uniforms[key].value;
            }
        });
        
        renderParamsList(); // Refresh sliders
        
        // Feedback
        const origText = captureBtn.textContent;
        captureBtn.textContent = 'CAPTURED!';
        setTimeout(() => captureBtn.textContent = origText, 1000);
    };
    container.appendChild(captureBtn);
}

// --- Tag Manager System ---

function renderTagManager() {
    const visualContent = document.querySelector('#visual-island .content-area');
    if (!visualContent) return;

    let container = document.getElementById('tag-manager-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'tag-manager-container';
        visualContent.appendChild(container);
    }
    container.innerHTML = '';

    const header = document.createElement('h4');
    header.textContent = 'TAG MANAGER';
    header.style.margin = '0 0 10px 0';
    header.style.fontSize = '12px';
    header.style.color = '#38bdf8';
    header.style.letterSpacing = '1px';
    container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'tag-list';
    container.appendChild(list);

    // Render Cards
    const tags = Object.keys(window.TAG_LIBRARY || {});
    tags.forEach(tagKey => {
        list.appendChild(createTagCard(tagKey));
    });

    // Add New Tag Button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-tag-btn';
    addBtn.textContent = '+ Create New Tag';
    addBtn.onclick = () => {
        const newName = `New Tag ${tags.length + 1}`;
        // Create default entry
        window.TAG_LIBRARY[newName] = {
            color: '#888888',
            transition: 'linear',
            values: {}
        };
        // Re-render and Expand
        renderTagManager();
        // Find the new card and expand it
        const cards = list.querySelectorAll('.tag-card');
        const lastCard = cards[cards.length - 1]; // Assuming appended last
        if (lastCard) expandTagCard(lastCard, newName);
    };
    container.appendChild(addBtn);
}

function createTagCard(tagKey) {
    const config = window.TAG_LIBRARY[tagKey];
    const card = document.createElement('div');
    card.className = 'tag-card';
    card.dataset.tag = tagKey;

    // Header (Always Visible)
    const header = document.createElement('div');
    header.className = 'tag-card-header';
    
    const dot = document.createElement('div');
    dot.className = 'color-dot';
    dot.style.backgroundColor = config.color || '#ccc';
    header.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'tag-label';
    label.textContent = tagKey;
    header.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'tag-actions';

    // Edit Button
    const editBtn = document.createElement('button');
    editBtn.className = 'tag-action-btn';
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        expandTagCard(card, tagKey);
    };
    actions.appendChild(editBtn);

    // Delete Button
    const delBtn = document.createElement('button');
    delBtn.className = 'tag-action-btn delete';
    delBtn.innerHTML = '✕';
    delBtn.title = 'Delete';
    delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete tag "${tagKey}"?`)) {
            delete window.TAG_LIBRARY[tagKey];
            renderTagManager();
        }
    };
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    // Editor Container (Hidden by default)
    const editorContainer = document.createElement('div');
    editorContainer.className = 'tag-editor-container';
    card.appendChild(editorContainer);

    return card;
}

function getSmartDefaults(duration) {
    const d = duration || 4.0;
    return {
        attack: parseFloat((d * 0.1).toFixed(2)),
        decay: parseFloat((d * 0.2).toFixed(2)),
        sustain: 1.0,
        release: parseFloat((d * 0.2).toFixed(2))
    };
}

function expandTagCard(card, tagKey) {
    // 1. Collapse all others
    document.querySelectorAll('.tag-card.expanded').forEach(c => {
        if (c !== card) {
            c.classList.remove('expanded');
            c.querySelector('.tag-editor-container').innerHTML = '';
        }
    });

    // 2. Toggle this one
    if (card.classList.contains('expanded')) {
        card.classList.remove('expanded');
        card.querySelector('.tag-editor-container').innerHTML = '';
        return;
    }

    card.classList.add('expanded');
    const container = card.querySelector('.tag-editor-container');
    renderTagEditorPanel(container, tagKey, card);
}

function renderTagEditorPanel(container, tagKey, card) {
    const config = window.TAG_LIBRARY[tagKey];
    container.innerHTML = '';
    
    const panel = document.createElement('div');
    panel.className = 'tag-editor-panel';

    // --- Row 1: Name & Color ---
    const row1 = document.createElement('div');
    row1.className = 'editor-row';
    
    const nameInput = document.createElement('input');
    nameInput.className = 'editor-input';
    nameInput.value = tagKey;
    nameInput.placeholder = 'Tag Name';
    row1.appendChild(nameInput);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'editor-color';
    colorInput.value = config.color || '#cccccc';
    colorInput.title = 'Timeline Color';
    row1.appendChild(colorInput);
    panel.appendChild(row1);

    // --- Row 2: Transition & Capture ---
    const row2 = document.createElement('div');
    row2.className = 'editor-row';
    row2.style.flexDirection = 'column';
    row2.style.alignItems = 'stretch';

    // ADSR Toggle
    const adsrToggleRow = document.createElement('div');
    adsrToggleRow.style.display = 'flex';
    adsrToggleRow.style.gap = '8px';
    adsrToggleRow.style.marginBottom = '8px';
    adsrToggleRow.style.alignItems = 'center';
    
    const adsrCheck = document.createElement('input');
    adsrCheck.type = 'checkbox';
    adsrCheck.id = `adsr-toggle-${tagKey}`;
    adsrCheck.checked = config.useADSR || false;
    
    const adsrLabel = document.createElement('label');
    adsrLabel.htmlFor = `adsr-toggle-${tagKey}`;
    adsrLabel.textContent = 'Use ADSR Envelope';
    adsrLabel.style.fontSize = '11px';
    adsrLabel.style.color = '#ccc';
    adsrLabel.style.cursor = 'pointer';

    adsrCheck.onchange = (e) => {
        config.useADSR = e.target.checked;
        const container = document.getElementById(`adsr-container-${tagKey}`);
        const select = row2.querySelector('select');
        if (container) container.style.display = config.useADSR ? 'block' : 'none';
        if (select) select.style.display = config.useADSR ? 'none' : 'block';
        
        if (config.useADSR) {
            if (!config.adsr) {
                let duration = 4.0;
                if (window.visualTimeline && window.visualTimeline.selectionStart !== null && window.visualTimeline.selectionEnd !== null) {
                    duration = Math.abs(window.visualTimeline.selectionEnd - window.visualTimeline.selectionStart);
                }
                config.adsr = getSmartDefaults(duration);
            }
            setTimeout(() => {
                if (typeof initADSREditor === 'function') {
                    initADSREditor(`adsr-canvas-${tagKey}`, tagKey);
                }
            }, 10);
        }
    };
    
    adsrToggleRow.appendChild(adsrCheck);
    adsrToggleRow.appendChild(adsrLabel);
    row2.appendChild(adsrToggleRow);

    // ADSR Container
    const adsrContainer = document.createElement('div');
    adsrContainer.id = `adsr-container-${tagKey}`;
    adsrContainer.style.display = config.useADSR ? 'block' : 'none';
    adsrContainer.style.marginBottom = '10px';
    adsrContainer.innerHTML = `
        <div style="position: relative;">
            <canvas id="adsr-canvas-${tagKey}" width="300" height="100" style="background: rgba(0,0,0,0.3); border-radius: 4px; cursor: crosshair; display: block; width: 100%;"></canvas>
            <button id="adsr-fit-${tagKey}" style="position: absolute; top: 5px; right: 5px; font-size: 9px; padding: 2px 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; border-radius: 3px;">Fit to Selection</button>
        </div>
        <div class="adsr-inputs" style="display: flex; gap: 5px; margin-top: 5px; justify-content: space-between;">
            <label style="color:#aaa; font-size:10px;">A: <input type="number" step="0.1" id="adsr-a-${tagKey}" value="${(config.adsr ? config.adsr.attack : 0.2)}" style="width: 35px; background:#222; border:1px solid #444; color:#fff; font-size:10px; border-radius:2px;"></label>
            <label style="color:#aaa; font-size:10px;">D: <input type="number" step="0.1" id="adsr-d-${tagKey}" value="${(config.adsr ? config.adsr.decay : 0.5)}" style="width: 35px; background:#222; border:1px solid #444; color:#fff; font-size:10px; border-radius:2px;"></label>
            <label style="color:#aaa; font-size:10px;">S: <input type="number" step="0.1" max="1.0" id="adsr-s-${tagKey}" value="${(config.adsr ? config.adsr.sustain : 1.0)}" style="width: 35px; background:#222; border:1px solid #444; color:#fff; font-size:10px; border-radius:2px;"></label>
            <label style="color:#aaa; font-size:10px;">R: <input type="number" step="0.1" id="adsr-r-${tagKey}" value="${(config.adsr ? config.adsr.release : 1.0)}" style="width: 35px; background:#222; border:1px solid #444; color:#fff; font-size:10px; border-radius:2px;"></label>
        </div>
    `;
    
    // Bind Fit Button
    setTimeout(() => {
        const fitBtn = document.getElementById(`adsr-fit-${tagKey}`);
        if (fitBtn) {
            fitBtn.onclick = (e) => {
                e.preventDefault();
                let duration = 4.0;
                if (window.visualTimeline && window.visualTimeline.selectionStart !== null && window.visualTimeline.selectionEnd !== null) {
                    duration = Math.abs(window.visualTimeline.selectionEnd - window.visualTimeline.selectionStart);
                }
                config.adsr = getSmartDefaults(duration);
                const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
                setVal(`adsr-a-${tagKey}`, config.adsr.attack);
                setVal(`adsr-d-${tagKey}`, config.adsr.decay);
                setVal(`adsr-s-${tagKey}`, config.adsr.sustain);
                setVal(`adsr-r-${tagKey}`, config.adsr.release);
                
                const input = document.getElementById(`adsr-a-${tagKey}`);
                if (input) input.dispatchEvent(new Event('change'));
            };
        }
    }, 10);
    
    row2.appendChild(adsrContainer);

    const transSelect = document.createElement('select');
    transSelect.className = 'editor-input';
    transSelect.style.display = config.useADSR ? 'none' : 'block';
    
    const easeOptions = typeof EASING !== 'undefined' ? Object.keys(EASING) : ['linear', 'ease-in', 'cut'];
    easeOptions.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        const currentCurve = (config.transition && typeof config.transition === 'object') ? config.transition.curve : config.transition;
        if (currentCurve === t) opt.selected = true;
        transSelect.appendChild(opt);
    });
    transSelect.onchange = (e) => {
        if (!config.transition || typeof config.transition !== 'object') config.transition = { duration: 1.0, curve: 'linear' };
        config.transition.curve = e.target.value;
    };
    row2.appendChild(transSelect);

    const captureBtn = document.createElement('button');
    captureBtn.className = 'editor-btn primary';
    captureBtn.textContent = 'CAPTURE STATE';
    captureBtn.title = 'Overwrite sliders with current scene';
    captureBtn.style.marginTop = '8px';
    captureBtn.style.width = '100%';
    row2.appendChild(captureBtn);
    panel.appendChild(row2);

    if (config.useADSR) {
        setTimeout(() => {
            if (typeof initADSREditor === 'function') {
                initADSREditor(`adsr-canvas-${tagKey}`, tagKey);
            }
        }, 10);
    }

    // --- Row 3: Parameters List ---
    const paramList = document.createElement('div');
    paramList.className = 'param-list';
    
    // Helper to render sliders
    const allParams = getAllAvailableParams();
    // Working copy of values
    if (!config.values) config.values = {};
    let currentValues = config.values;

    const renderSliders = () => {
        paramList.innerHTML = '';
        allParams.forEach(p => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '5px';
            row.style.marginBottom = '4px';

            const isIncluded = currentValues.hasOwnProperty(p.name);

            // Checkbox
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.checked = isIncluded;
            check.onchange = (e) => {
                if (e.target.checked) {
                    currentValues[p.name] = uniforms[p.name] ? uniforms[p.name].value : (p.value || 0);
                } else {
                    delete currentValues[p.name];
                }
                renderSliders();
            };
            row.appendChild(check);

            // Label
            const label = document.createElement('span');
            label.textContent = p.label || p.name;
            label.style.fontSize = '10px';
            label.style.color = '#aaa';
            label.style.width = '70px';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            row.appendChild(label);

            // Input Control
            if (p.inputType === 'color') {
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.style.flexGrow = '1';
                colorInput.style.height = '20px';
                colorInput.style.background = 'transparent';
                colorInput.style.border = 'none';
                colorInput.style.cursor = 'pointer';
                colorInput.disabled = !isIncluded;
                
                let val = '#ffffff';
                if (isIncluded) {
                    val = currentValues[p.name] || '#ffffff';
                } else if (uniforms[p.name] && uniforms[p.name].value && uniforms[p.name].value.getHexString) {
                    val = '#' + uniforms[p.name].value.getHexString();
                }
                colorInput.value = val;
                
                if (!isIncluded) colorInput.style.opacity = '0.3';
                else colorInput.style.opacity = '1';

                colorInput.oninput = (e) => {
                    if (isIncluded) {
                        currentValues[p.name] = e.target.value;
                        if (uniforms[p.name] && uniforms[p.name].value && uniforms[p.name].value.set) {
                            uniforms[p.name].value.set(e.target.value);
                        }
                    }
                };
                row.appendChild(colorInput);
            } else {
                // Slider
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.style.flexGrow = '1';
                slider.style.height = '4px';
                slider.min = p.min !== undefined ? p.min : 0;
                slider.max = p.max !== undefined ? p.max : 1;
                slider.step = (slider.max - slider.min) / 100;
                slider.disabled = !isIncluded;
                
                if (isIncluded) {
                    slider.value = currentValues[p.name];
                } else {
                    slider.value = uniforms[p.name] ? uniforms[p.name].value : (p.value || 0);
                    slider.style.opacity = '0.3';
                }

                slider.oninput = (e) => {
                    const val = parseFloat(e.target.value);
                    if (isIncluded) {
                        currentValues[p.name] = val;
                        // Live Preview
                        if (uniforms[p.name]) uniforms[p.name].value = val;
                    }
                };
                row.appendChild(slider);
            }
            paramList.appendChild(row);
        });
    };
    renderSliders();
    panel.appendChild(paramList);

    // Capture Logic
    captureBtn.onclick = () => {
        Object.keys(currentValues).forEach(key => {
            if (uniforms[key]) {
                currentValues[key] = uniforms[key].value;
            }
        });
        renderSliders();
    };

    // --- Row 4: Actions ---
    const row4 = document.createElement('div');
    row4.className = 'editor-row';
    row4.style.justifyContent = 'flex-end';
    row4.style.marginTop = '10px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'editor-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
        card.classList.remove('expanded');
        container.innerHTML = '';
    };
    row4.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'editor-btn primary';
    saveBtn.textContent = 'Save Changes';
    saveBtn.onclick = () => {
        const toggleEl = document.getElementById(`adsr-toggle-${tagKey}`);
        const useADSR = toggleEl ? toggleEl.checked : false;
        
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? (parseFloat(el.value) || 0) : 0;
        };

        const adsr = {
            attack: getVal(`adsr-a-${tagKey}`),
            decay: getVal(`adsr-d-${tagKey}`),
            sustain: Math.max(0, Math.min(1.0, getVal(`adsr-s-${tagKey}`))),
            release: getVal(`adsr-r-${tagKey}`)
        };

        let transObj = { duration: 1.0, curve: transSelect.value };
        const oldTag = window.TAG_LIBRARY[tagKey];
        if (oldTag && oldTag.transition && typeof oldTag.transition === 'object') {
             transObj.duration = oldTag.transition.duration || 1.0;
             transObj.fadeOutDuration = oldTag.transition.fadeOutDuration || 0;
        }

        handleSaveTag(tagKey, {
            newName: nameInput.value,
            color: colorInput.value,
            transition: transObj,
            values: currentValues,
            useADSR: useADSR,
            adsr: adsr
        });
    };
    row4.appendChild(saveBtn);
    panel.appendChild(row4);

    container.appendChild(panel);
}

function handleSaveTag(originalKey, data) {
    const { newName, color, transition, values, useADSR, adsr } = data;
    
    // Validation
    if (!newName.trim()) return alert('Name required');
    if (newName !== originalKey && window.TAG_LIBRARY[newName]) return alert('Tag name exists');

    // Delete old if renamed
    if (newName !== originalKey) {
        delete window.TAG_LIBRARY[originalKey];
        // Update Segments
        if (window.activeSegments) {
            window.activeSegments.forEach(seg => {
                if (seg.tag === originalKey) seg.tag = newName;
            });
        }
    }

    // Save
    window.TAG_LIBRARY[newName] = {
        color: color,
        transition: transition,
        values: values,
        useADSR: useADSR,
        adsr: adsr
    };

    // Refresh UI
    if (typeof renderTagManager === 'function') renderTagManager();
    if (window.visualTimeline) window.visualTimeline.drawTracks();
}

// --- Reset Logic: Execution ---
function resetGroup(config, container) {
    if (!container) return;
    
    config.forEach(param => {
        // 1. Reset Data
        if (param.defaultValue !== undefined) param.value = param.defaultValue;
        if (param.defaultAutomation) {
            param.automation = JSON.parse(JSON.stringify(param.defaultAutomation));
        }
        
        // 2. Update Uniforms
        if (uniforms[param.name]) {
            uniforms[param.name].value = param.value;
        }
        
        // 3. Update DOM
        // We need to find the specific row. createSliderElement doesn't add IDs.
        // But we can iterate inputs and find matches? Or re-render the whole container?
        // Re-rendering is safer and easier.
    });
    
    // Refresh UI
    container.innerHTML = '';
    config.forEach(param => {
        createSliderElement(param, container, (val) => {
            if (material && material.uniforms[param.name]) {
                material.uniforms[param.name].value = val;
            }
            if (uniforms[param.name]) uniforms[param.name].value = val;
        });
    });
}

function initCameraControls() {
    const container = document.getElementById('camera-controls');
    if (!container) return; 

    // Inject Reset Button into Header if not present
    const header = document.querySelector('#camera-island .island-header');
    if (header && !header.querySelector('.reset-btn')) {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'reset-btn';
        resetBtn.textContent = '↺';
        resetBtn.setAttribute('data-tooltip', 'Reset to Defaults');
        resetBtn.style.background = 'none';
        resetBtn.style.border = 'none';
        resetBtn.style.color = '#888';
        resetBtn.style.cursor = 'pointer';
        resetBtn.style.marginRight = '5px';
        resetBtn.style.fontSize = '14px';
        
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // 1. Reset Data
            ALL_CAMERA_PARAMS.forEach(param => {
                if (param.defaultValue !== undefined) param.value = param.defaultValue;
                if (param.defaultAutomation) {
                    param.automation = JSON.parse(JSON.stringify(param.defaultAutomation));
                }
                if (uniforms[param.name]) uniforms[param.name].value = param.value;
            });
            // 2. Re-render Controls
            initCameraControls();
        });
        
        // Insert before minimize button
        const minBtn = header.querySelector('.minimize-btn');
        header.insertBefore(resetBtn, minBtn);
    }

    container.innerHTML = '';

    // Helper to add Headers
    const addHeader = (text) => {
        const h = document.createElement('h5');
        h.textContent = text;
        h.style.margin = '10px 0 5px 0';
        h.style.color = '#4db8ff'; // Neon Blue Accent
        h.style.borderBottom = '1px solid rgba(77, 184, 255, 0.2)';
        h.style.paddingBottom = '2px';
        h.style.fontSize = '10px';
        h.style.letterSpacing = '1px';
        container.appendChild(h);
    };

    // 1. Positioning Section
    addHeader('POSITIONING');
    CAMERA_POS.forEach(param => {
        if (!uniforms[param.name]) uniforms[param.name] = { value: param.value };
        createSliderElement(param, container, (val) => { 
            if (material && material.uniforms[param.name]) material.uniforms[param.name].value = val;
            uniforms[param.name].value = val; 
        });
    });

    // 2. FX Section (Modulation Matrix)
    addHeader('MODULATION MATRIX');
    
    // Create Container for Modulators
    const modContainer = document.createElement('div');
    modContainer.id = 'modulator-container';
    container.appendChild(modContainer);
    
    // Initial Render
    renderModulatorUI(modContainer);
}

function renderParams(styleKey) {
    parameterContainer.innerHTML = '';
    const params = SHADER_PARAMS[styleKey];
    if (!params) return;

    // Inject Reset Button for Visuals
    const header = document.querySelector('#visual-island .island-header');
    if (header && !header.querySelector('.reset-btn')) {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'reset-btn';
        resetBtn.textContent = '↺';
        resetBtn.setAttribute('data-tooltip', 'Reset to Defaults');
        resetBtn.style.background = 'none';
        resetBtn.style.border = 'none';
        resetBtn.style.color = '#888';
        resetBtn.style.cursor = 'pointer';
        resetBtn.style.marginRight = '5px';
        resetBtn.style.fontSize = '14px';
        
        // Dynamic Listener: Always resets CURRENT style params
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentStyle = visualStyleSelect.value;
            resetGroup(SHADER_PARAMS[currentStyle], parameterContainer);
        });
        
        const minBtn = header.querySelector('.minimize-btn');
        header.insertBefore(resetBtn, minBtn);
    }

    params.forEach(param => {
        createSliderElement(param, parameterContainer, (val) => {
            if (material && material.uniforms[param.name]) {
                material.uniforms[param.name].value = val;
            }
            if (!uniforms[param.name]) uniforms[param.name] = { value: val };
            else uniforms[param.name].value = val;
        });
        
        // Ensure initial value is set in uniforms
        const initialVal = param.value !== undefined ? param.value : param.val;
        if (!uniforms[param.name]) uniforms[param.name] = { value: initialVal };
    });
}

function setVisualizer(styleKey) {
    const fragmentShader = SHADER_LIB[styleKey] || SHADER_LIB.menger;
    
    renderParams(styleKey);

    if (mesh) {
        scene.remove(mesh);
        material.dispose();
    }

    material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
}

initCameraControls();
setVisualizer('menger');
renderTagManager();

visualStyleSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    setVisualizer(e.target.value);
});

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
});

function animate(time) {
    requestAnimationFrame(animate);
    
    // --- Audio Analysis ---
    if (isPlaying && analyser) {
        analyser.getByteFrequencyData(dataArray);
        
        let lowSum = 0, midSum = 0, highSum = 0;
        // Low (Bass): Indices 0-10
        for(let i = 0; i < 11; i++) lowSum += dataArray[i];
        // Mid: Indices 11-100
        for(let i = 11; i < 101; i++) midSum += dataArray[i];
        // High: Indices 101-255
        for(let i = 101; i < 256; i++) highSum += dataArray[i];

        const targetBass = lowSum / (11 * 255);
        const targetMid = midSum / (90 * 255);
        const targetHigh = highSum / (155 * 255);

        // Auto Gain logic
        if (audioMetrics.autoGain) {
            const avg = (targetBass + targetMid + targetHigh) / 3;
            const targetGain = avg > 0.1 ? 0.3 / avg : 1.0; 
            audioMetrics.gainFactor = audioMetrics.gainFactor * 0.95 + targetGain * 0.05;
            if (audioMetrics.gainFactor > 5.0) audioMetrics.gainFactor = 5.0;
            if (audioMetrics.gainFactor < 0.5) audioMetrics.gainFactor = 0.5;
        }

        // Apply Gain & Sensitivity
        const finalBass = targetBass * audioMetrics.lowSens * audioMetrics.gainFactor;
        const finalMid = targetMid * audioMetrics.midSens * audioMetrics.gainFactor;
        const finalHigh = targetHigh * audioMetrics.highSens * audioMetrics.gainFactor;
        
        // Draw Monitor
        drawFrequencyMonitor(finalBass, finalMid, finalHigh);

        // Smoothing
        uBassValue = uBassValue * 0.85 + finalBass * 0.15;
        uMidValue = uMidValue * 0.85 + finalMid * 0.15;
        uHighValue = uHighValue * 0.85 + finalHigh * 0.15;
    } else {
        uBassValue *= 0.95;
        uMidValue *= 0.95;
        uHighValue *= 0.95;
        drawFrequencyMonitor(0, 0, 0);
    }
    
    // --- 1. Calculate Manual Targets ---
    const manualTargets = {};
    
    // Global Uniforms
    uniforms.uBass.value = uBassValue;
    uniforms.uMid.value = uMidValue;
    uniforms.uHigh.value = uHighValue;
    uniforms.iTime.value = time * 0.001;
    
    // Color Palette (Manual Inputs -> Advanced Uniforms)
    let shiftVal = 0.5;
    let satVal = 1.0;
    let hueVal = 0.0;

    if (manualColorToggle && !manualColorToggle.checked) {
        // Disabled: Use Neutral Defaults
        manualTargets['uBaseColor'] = new THREE.Color(0xffffff);
        shiftVal = 0.5;
    } else {
        // Enabled: Use Inputs
        hueVal = parseFloat(baseHueInput.value) / 360.0;
        satVal = parseFloat(saturationInput.value) / 100.0;
        shiftVal = parseFloat(colorShiftInput.value);
        manualTargets['uBaseColor'] = new THREE.Color().setHSL(hueVal, satVal, 0.5);
    }
    
    // Other Advanced Defaults (Fixed for now, could add UI later)
    manualTargets['uHighlight'] = new THREE.Color(0x38bdf8);
    manualTargets['uLowlight']  = new THREE.Color(0x1a0b2e);
    manualTargets['uHighColor'] = new THREE.Color(0xff00ff);
    manualTargets['uMidColor']  = new THREE.Color(0x00ff00);
    manualTargets['uLowColor']  = new THREE.Color(0xff0000);
    
    manualTargets['uGlowStrength'] = 1.5;
    manualTargets['uBloomStrength'] = 0.8;
    
    // Legacy support
    manualTargets['uBaseHue'] = parseFloat(baseHueInput.value); // Keep reading input for legacy just in case? Or use hueVal?
    // Actually better to use calculated values so legacy logic (if any) respects toggle too.
    if (manualColorToggle && !manualColorToggle.checked) {
        manualTargets['uBaseHue'] = 0;
        manualTargets['uSaturation'] = 0;
    } else {
        manualTargets['uBaseHue'] = hueVal * 360.0;
        manualTargets['uSaturation'] = satVal;
    }
    manualTargets['uColorShift'] = shiftVal;

    // Visual Params
    const currentStyle = visualStyleSelect.value;
    const activeParams = SHADER_PARAMS[currentStyle];
    if (activeParams) {
        activeParams.forEach(param => {
            let finalVal = param.value;
            if (param.automation && param.automation.enabled) {
                let sourceVal = 0;
                if (param.automation.source === 'uBass') sourceVal = uBassValue;
                else if (param.automation.source === 'uMid') sourceVal = uMidValue;
                else if (param.automation.source === 'uHigh') sourceVal = uHighValue;
                finalVal = param.value + (sourceVal * param.automation.strength);
            }
            manualTargets[param.name] = finalVal;
            
            if (param.uiMeter) {
                const percent = Math.max(0, Math.min(100, ((finalVal - param.min) / (param.max - param.min)) * 100));
                param.uiMeter.style.width = `${percent}%`;
            }
        });
    }

    // Camera Params
    ALL_CAMERA_PARAMS.forEach(param => {
        let finalVal = param.value;
        if (param.automation && param.automation.enabled) {
            let sourceVal = 0;
            if (param.automation.source === 'uBass') sourceVal = uBassValue;
            else if (param.automation.source === 'uMid') sourceVal = uMidValue;
            else if (param.automation.source === 'uHigh') sourceVal = uHighValue;
            
            if (param.isIntensity) {
                finalVal = sourceVal * param.value;
            } else {
                finalVal = param.value + (sourceVal * param.automation.strength);
            }
        }
        manualTargets[param.name] = finalVal;
        
        if (param.uiMeter) {
            let percent = 0;
            if (param.isIntensity) {
                percent = (Math.abs(finalVal) / param.max) * 100;
            } else {
                percent = ((finalVal - param.min) / (param.max - param.min)) * 100;
            }
            param.uiMeter.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        }
    });

    // --- 2. Apply Timeline Logic (Overrides & Mixing) ---
    applyTimelineLogic(manualTargets);
    
    // --- 3. Apply Modulation Matrix (Offsets) ---
    applyModulations();

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);
function initADSREditor(canvasId, tagKey) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const tag = window.TAG_LIBRARY[tagKey];
    if (!tag.adsr) {
        tag.adsr = { attack: 0.2, decay: 0.5, sustain: 1.0, release: 1.0 };
    }
    
    const inputs = {
        a: document.getElementById(`adsr-a-${tagKey}`),
        d: document.getElementById(`adsr-d-${tagKey}`),
        s: document.getElementById(`adsr-s-${tagKey}`),
        r: document.getElementById(`adsr-r-${tagKey}`)
    };

    let isDragging = null;
    const padding = 10;
    const w = canvas.width;
    const h = canvas.height;
    const totalTime = 10.0; // Fixed 10s scale

    const timeToX = (t) => padding + (t / totalTime) * (w - 2 * padding);
    const valToY = (v) => h - padding - (v * (h - 2 * padding));
    const xToTime = (x) => ((x - padding) / (w - 2 * padding)) * totalTime;
    const yToVal = (y) => 1.0 - ((y - padding) / (h - 2 * padding));

    const draw = () => {
        if (!canvas.parentNode) return; // Stop if removed
        ctx.clearRect(0, 0, w, h);
        
        const { attack, decay, sustain, release } = tag.adsr;
        
        const releaseStartT = totalTime - release;
        
        // Points
        const p1 = { x: timeToX(0), y: valToY(0) }; // Start
        const p2 = { x: timeToX(attack), y: valToY(1.0) }; // Peak
        const p3 = { x: timeToX(attack + decay), y: valToY(sustain) }; // Sustain Start
        const p4 = { x: timeToX(releaseStartT), y: valToY(sustain) }; // Release Start
        const p5 = { x: timeToX(totalTime), y: valToY(0) }; // End

        // Fill
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.lineTo(p5.x, p5.y);
        ctx.fillStyle = tag.color || '#ff0000';
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        
        // Line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Handles
        const drawHandle = (p, label) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            if (label) {
                ctx.fillStyle = '#ccc';
                ctx.font = '10px sans-serif';
                ctx.fillText(label, p.x - 5, p.y - 10);
            }
        };

        drawHandle(p2, 'A');
        drawHandle(p3, 'D');
        drawHandle(p4, 'R');
    };

    const updateInputs = () => {
        if (inputs.a) inputs.a.value = tag.adsr.attack.toFixed(2);
        if (inputs.d) inputs.d.value = tag.adsr.decay.toFixed(2);
        if (inputs.s) inputs.s.value = tag.adsr.sustain.toFixed(2);
        if (inputs.r) inputs.r.value = tag.adsr.release.toFixed(2);
    };

    canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const { attack, decay, sustain, release } = tag.adsr;
        const p2 = { x: timeToX(attack), y: valToY(1.0) };
        const p3 = { x: timeToX(attack + decay), y: valToY(sustain) };
        const p4 = { x: timeToX(totalTime - release), y: valToY(sustain) };
        
        if (Math.hypot(x - p2.x, y - p2.y) < 10) isDragging = 'attack';
        else if (Math.hypot(x - p3.x, y - p3.y) < 10) isDragging = 'decay';
        else if (Math.hypot(x - p4.x, y - p4.y) < 10) isDragging = 'release';
    };

    const moveHandler = (e) => {
        if (!isDragging) return;
        if (!document.body.contains(canvas)) {
            window.removeEventListener('mousemove', moveHandler);
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const t = Math.max(0, Math.min(totalTime, xToTime(x)));
        const v = Math.max(0, Math.min(1.0, yToVal(y)));

        if (isDragging === 'attack') {
            tag.adsr.attack = Math.max(0.1, t); // Min 0.1s
        } else if (isDragging === 'decay') {
            const d = t - tag.adsr.attack;
            if (d > 0) tag.adsr.decay = d;
            tag.adsr.sustain = v;
        } else if (isDragging === 'release') {
            const r = totalTime - t;
            if (r > 0) tag.adsr.release = r;
            tag.adsr.sustain = v;
        }
        updateInputs();
        draw();
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', () => { isDragging = null; });

    // Input Listeners
    if (inputs.a) inputs.a.onchange = (e) => { 
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) tag.adsr.attack = Math.max(0, v); 
        updateInputs(); draw(); 
    };
    if (inputs.d) inputs.d.onchange = (e) => { 
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) tag.adsr.decay = Math.max(0, v); 
        updateInputs(); draw(); 
    };
    if (inputs.s) inputs.s.onchange = (e) => { 
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) tag.adsr.sustain = Math.max(0, Math.min(1.0, v)); 
        updateInputs(); draw(); 
    };
    if (inputs.r) inputs.r.onchange = (e) => { 
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) tag.adsr.release = Math.max(0, v); 
        updateInputs(); draw(); 
    };

    draw();
}

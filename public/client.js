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
                console.log('Client: Calling visualTimeline.analyzeAudio');
                visualTimeline.analyzeAudio(audioBuffer);
            } else {
                console.error('Client: visualTimeline is not initialized!');
            }
        })
        .catch(err => console.error('Client: Error loading waveform:', err));

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

const CAMERA_CONFIG = [
    // --- SECTION 1: MANUAL POSITIONING ---
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
    },

    // --- SECTION 2: AUDIO REACTIVITY (Intensity Multipliers) ---
    { 
        name: 'uPitch', label: 'Bass Wobble (Pitch)', min: 0.0, max: 1.0, value: 0.2, 
        isIntensity: true, // Custom flag for animate loop
        automation: { enabled: true, source: 'uBass', strength: 1.0 } 
    },
    { 
        name: 'uYaw', label: 'High Spin (Yaw)', min: 0.0, max: 1.0, value: 0.1, 
        isIntensity: true,
        automation: { enabled: true, source: 'uHigh', strength: 1.0 } 
    },
    { 
        name: 'uRoll', label: 'Mid Twist (Roll)', min: 0.0, max: 1.0, value: 0.3, 
        isIntensity: true,
        automation: { enabled: true, source: 'uMid', strength: 1.0 } 
    }
];

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

captureDefaults(CAMERA_CONFIG);
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
        uniform float uGlow;
        uniform float uCamX;
        uniform float uCamY;
        uniform float uZoom;
        
        // Camera Rotation
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
                float hue = (uBaseHue / 360.0) + (uMid * uColorShift);
                hue = fract(hue);
                
                // Mix dynamic hue with a bit of the old palette for flavor
                vec3 baseCol = hsl2rgb(vec3(hue, uSaturation, 0.5));
                
                // Brightness/Bloom based on High
                col = baseCol * glow * (uGlow + uBass * 3.0 + uHigh * 4.0);
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
CAMERA_CONFIG.forEach(param => {
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
            resetGroup(CAMERA_CONFIG, container);
        });
        
        // Insert before minimize button
        const minBtn = header.querySelector('.minimize-btn');
        header.insertBefore(resetBtn, minBtn);
    }

    container.innerHTML = '';

    CAMERA_CONFIG.forEach(param => {
        if (!uniforms[param.name]) {
            // console.log(`Auto-initializing uniform: ${param.name}`);
            uniforms[param.name] = { value: param.value };
        }

        createSliderElement(param, container, (val) => {
            if (material && material.uniforms[param.name]) {
                material.uniforms[param.name].value = val;
            }
            if (uniforms[param.name]) {
                uniforms[param.name].value = val;
            }
        });
    });
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
    
    // --- Uniform Updates ---
    uniforms.uBass.value = uBassValue;
    uniforms.uMid.value = uMidValue;
    uniforms.uHigh.value = uHighValue;
    uniforms.iTime.value = time * 0.001;

    // --- Parameter Automation & Live Metering ---
    const currentStyle = visualStyleSelect.value;
    const activeParams = SHADER_PARAMS[currentStyle];
    
    if (activeParams) {
        activeParams.forEach(param => {
            let finalVal = param.value;
            
            if (param.automation && param.automation.enabled) {
                // Determine audio source value
                let sourceVal = 0;
                if (param.automation.source === 'uBass') sourceVal = uBassValue;
                else if (param.automation.source === 'uMid') sourceVal = uMidValue;
                else if (param.automation.source === 'uHigh') sourceVal = uHighValue;
                
                // Calculate automated value
                // Value = Base + (Source * Strength)
                finalVal = param.value + (sourceVal * param.automation.strength);
                
                // Update UI Meter
                if (param.uiMeter) {
                    // Map value to 0-100% range
                    const percent = Math.max(0, Math.min(100, ((finalVal - param.min) / (param.max - param.min)) * 100));
                    param.uiMeter.style.width = `${percent}%`;
                }
            } else if (param.uiMeter) {
                // Hide meter in manual mode
                param.uiMeter.style.width = '0%';
            }

            // Update Shader Uniform
            if (material && material.uniforms[param.name]) {
                material.uniforms[param.name].value = finalVal;
            }
        });
    }

    // --- Camera Automation & Metering ---
    CAMERA_CONFIG.forEach(param => {
        let finalVal = param.value;
        
        if (param.automation && param.automation.enabled) {
            let sourceVal = 0;
            if (param.automation.source === 'uBass') sourceVal = uBassValue;
            else if (param.automation.source === 'uMid') sourceVal = uMidValue;
            else if (param.automation.source === 'uHigh') sourceVal = uHighValue;
            
            if (param.isIntensity) {
                // Slider sets the MAX AMPLITUDE of the reaction
                finalVal = sourceVal * param.value;
            } else {
                // Standard: Slider sets BASE value, Audio adds offset
                finalVal = param.value + (sourceVal * param.automation.strength);
            }
            
            if (param.uiMeter) {
                let percent = 0;
                if (param.isIntensity) {
                    // Normalize 0 to Max
                    percent = (Math.abs(finalVal) / param.max) * 100;
                } else {
                    // Standard Range Mapping
                    percent = ((finalVal - param.min) / (param.max - param.min)) * 100;
                }
                percent = Math.max(0, Math.min(100, percent));
                param.uiMeter.style.width = `${percent}%`;
            }
        } else if (param.uiMeter) {
            param.uiMeter.style.width = '0%';
        }
        
        // Update Uniform
        if (material && material.uniforms[param.name]) {
            material.uniforms[param.name].value = finalVal;
        }
        uniforms[param.name].value = finalVal;
    });

    renderer.render(scene, camera);
}

requestAnimationFrame(animate);
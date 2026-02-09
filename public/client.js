let audioContext, analyser, source, audio;
let tracks = [];
let currentTrackIndex = -1;
let isPlaying = false;
let uBassValue = 0;
let dataArray;

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

// --- 1. UI Logic (Draggable & Minimizable Islands) ---

function toggleMinimize(id) {
    const el = document.getElementById(id);
    el.classList.toggle('minimized');
}

window.toggleMinimize = toggleMinimize;

let isDocked = false;
const uiContainer = document.getElementById('ui-container');
const dockBtn = document.getElementById('dock-btn');
dockBtn.addEventListener('click', window.toggleDock);
const originalPositions = new Map();

window.toggleDock = function() {
    isDocked = !isDocked;
    
    if (isDocked) {
        uiContainer.classList.add('docked');
        dockBtn.textContent = 'Undock UI';
        
        // Save current positions before docking
        document.querySelectorAll('.island').forEach(island => {
            originalPositions.set(island.id, {
                top: island.style.top,
                left: island.style.left,
                right: island.style.right // though we mostly use top/left
            });
            // Clear inline styles to let flexbox take over
            island.style.top = '';
            island.style.left = '';
            island.style.right = '';
        });
    } else {
        uiContainer.classList.remove('docked');
        dockBtn.textContent = 'Dock UI';
        
        // Restore positions
        document.querySelectorAll('.island').forEach(island => {
            const pos = originalPositions.get(island.id);
            if (pos) {
                island.style.top = pos.top;
                island.style.left = pos.left;
                // If right was set (like visual island initially), restore it?
                // Actually, makeDraggable sets top/left. Initial CSS uses right.
                // If the user hasn't dragged, top/left might be empty strings.
                // In that case, we should clear them to let CSS take over again.
                if (!pos.top && !pos.left) {
                    island.style.top = '';
                    island.style.left = '';
                }
            }
        });
    }
};

document.querySelectorAll('.island').forEach(island => {
    makeDraggable(island);
    island.addEventListener('click', (e) => {
        if (island.classList.contains('minimized')) {
            island.classList.remove('minimized');
        }
    });
});

// Update makeDraggable to respect docked state
function makeDraggable(el) {
    const header = el.querySelector('.island-header');
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
    audio = new Audio(tracks[currentTrackIndex].path);
    
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
    playAudio();
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

// --- 3. Visualizer (Three.js & GLSL) ---

const CAMERA_CONFIG = [
    { name: 'uCamX', label: 'Pan X', min: -2.0, max: 2.0, val: 0.0 },
    { name: 'uCamY', label: 'Pan Y', min: -2.0, max: 2.0, val: 0.0 },
    { name: 'uZoom', label: 'Zoom/FOV', min: 0.1, max: 3.0, val: 1.5 }
];

const SHADER_PARAMS = {
    menger: [
        { name: 'uSpeed', label: 'Rotation Speed', min: 0.0, max: 2.0, value: 0.2 },
        { name: 'uColor', label: 'Color Shift', min: 0.0, max: 1.0, value: 0.5 },
        { name: 'uSensitivity', label: 'Bass Reaction', min: 0.0, max: 2.0, value: 0.5 }
    ],
    tunnel: [
        { name: 'uSpeed', label: 'Flight Speed', min: 1.0, max: 20.0, value: 10.0 },
        { name: 'uWarp', label: 'Tunnel Warp', min: 0.0, max: 0.5, value: 0.1 },
        { name: 'uGlow', label: 'Glow Intensity', min: 0.5, max: 5.0, value: 1.5 }
    ]
};

const SHADER_LIB = {
    menger: `
        uniform float iTime;
        uniform vec2 iResolution;
        uniform float uBass;
        uniform float uSpeed;
        uniform float uColor;
        uniform float uSensitivity;
        uniform float uCamX;
        uniform float uCamY;
        uniform float uZoom;
        varying vec2 vUv;

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
            vec3 ro = vec3(uCamX, uCamY, 3.5);
            vec3 rd = normalize(vec3(uv, -uZoom));
            float rotX = iTime * uSpeed;
            float rotY = iTime * uSpeed * 1.5;
            mat3 mX = mat3(1, 0, 0, 0, cos(rotX), -sin(rotX), 0, sin(rotX), cos(rotX));
            mat3 mY = mat3(cos(rotY), 0, sin(rotY), 0, 1, 0, -sin(rotY), 0, cos(rotY));
            ro *= mX * mY;
            rd *= mX * mY;
            float t = 0.0;
            int i;
            for(i = 0; i < 64; i++) {
                float h = map(ro + rd * t);
                if(h < 0.001 || t > 10.0) break;
                t += h;
            }
            vec3 col = vec3(0.0);
            if(t < 10.0) {
                float glow = 1.0 - float(i) / 64.0;
                vec3 baseCol = vec3(0.1, 0.5, 0.9);
                baseCol.rb += uColor * 0.5;
                col = baseCol * glow * (1.0 + uBass * 2.0);
            }
            gl_FragColor = vec4(col, 1.0);
        }
    `,
    tunnel: `
        uniform float iTime;
        uniform vec2 iResolution;
        uniform float uBass;
        uniform float uSpeed;
        uniform float uWarp;
        uniform float uGlow;
        uniform float uCamX;
        uniform float uCamY;
        uniform float uZoom;
        varying vec2 vUv;

        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        float map(vec3 p) {
            p.z = mod(p.z, 20.0) - 10.0;
            p.xy *= rot(p.z * uWarp * sin(iTime * 0.5));
            vec3 b = vec3(2.5, 2.5, 12.0);
            vec3 q = abs(p) - b;
            float box = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
            float ripple = sin(p.x * 2.0 + iTime * 2.0) * cos(p.y * 2.0 + iTime * 2.0) * 0.2 * uBass;
            return -box + ripple;
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
            vec3 ro = vec3(uCamX, uCamY, iTime * uSpeed);
            vec3 rd = normalize(vec3(uv, uZoom));
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
                vec3 baseCol = mix(vec3(0.5, 0.0, 0.8), vec3(0.0, 0.8, 0.9), sin(iTime + t * 0.1) * 0.5 + 0.5);
                col = baseCol * glow * (uGlow + uBass * 3.0);
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
    uBass: { value: 0 }
};

// Initialize Camera Uniforms
CAMERA_CONFIG.forEach(param => {
    uniforms[param.name] = { value: param.val };
});

const geometry = new THREE.PlaneGeometry(2, 2);
let material;
let mesh;

function createSliderElement(param, container, onInput) {
    const row = document.createElement('div');
    row.className = 'param-row';
    
    const info = document.createElement('div');
    info.className = 'param-info';
    
    const label = document.createElement('label');
    label.textContent = param.label;
    
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'param-value';
    valueDisplay.textContent = (param.value !== undefined ? param.value : param.val).toFixed(2);
    
    info.appendChild(label);
    info.appendChild(valueDisplay);
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = param.min;
    slider.max = param.max;
    slider.step = (param.max - param.min) / 100;
    slider.value = param.value !== undefined ? param.value : param.val;
    
    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (param.value !== undefined) param.value = val;
        else param.val = val;
        valueDisplay.textContent = val.toFixed(2);
        onInput(val);
    });

    row.appendChild(info);
    row.appendChild(slider);
    container.appendChild(row);
}

function initCameraControls() {
    cameraControlsContainer.innerHTML = '';
    CAMERA_CONFIG.forEach(param => {
        createSliderElement(param, cameraControlsContainer, (val) => {
            if (material && material.uniforms[param.name]) {
                material.uniforms[param.name].value = val;
            }
            uniforms[param.name].value = val; // Persistent storage
        });
    });
}

function renderParams(styleKey) {
    parameterContainer.innerHTML = '';
    const params = SHADER_PARAMS[styleKey];
    if (!params) return;

    params.forEach(param => {
        createSliderElement(param, parameterContainer, (val) => {
            if (material && material.uniforms[param.name]) {
                material.uniforms[param.name].value = val;
            }
            if (!uniforms[param.name]) uniforms[param.name] = { value: val };
            else uniforms[param.name].value = val;
        });
        
        if (!uniforms[param.name]) uniforms[param.name] = { value: param.value };
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
    if (isPlaying && analyser) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < 10; i++) sum += dataArray[i];
        let targetBass = sum / (10 * 255);
        uBassValue = uBassValue * 0.8 + targetBass * 0.2;
    } else {
        uBassValue *= 0.95;
        if (uBassValue < 0.001) uBassValue = 0;
    }
    uniforms.uBass.value = uBassValue;
    uniforms.iTime.value = time * 0.001;
    renderer.render(scene, camera);
}

requestAnimationFrame(animate);

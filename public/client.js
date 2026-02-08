let audioContext, analyser, source, audio;
const playButton = document.getElementById('play-button');
const audioInput = document.getElementById('audio-input');
let filePath = '';

audioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('mp3file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        filePath = data.filePath;
        playButton.disabled = false;
    } catch (err) {
        console.error('Upload failed:', err);
    }
});

playButton.addEventListener('click', () => {
    if (!filePath) return;
    initAudio();
    playButton.style.display = 'none';
    audioInput.style.display = 'none';
});

function initAudio() {
    audio = new Audio(filePath);
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    audio.play();
    
    initThree();
}

function initThree() {
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform float iTime;
        uniform vec2 iResolution;
        uniform float uBass;
        varying vec2 vUv;

        // Menger Sponge distance function
        float sdBox(vec3 p, vec3 b) {
            vec3 q = abs(p) - b;
            return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
        }

        float map(vec3 p) {
            // Modulate box size with bass
            float d = sdBox(p, vec3(1.0 + uBass * 0.5));
            
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
            
            vec3 ro = vec3(0.0, 0.0, 3.5);
            vec3 rd = normalize(vec3(uv, -1.5));
            
            // Rotate camera
            float rotX = iTime * 0.2;
            float rotY = iTime * 0.3;
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
                // Simple distance-based glow (blue/cyan)
                float glow = 1.0 - float(i) / 64.0;
                col = vec3(0.1, 0.5, 0.9) * glow * (1.0 + uBass * 2.0);
            }
            
            gl_FragColor = vec4(col, 1.0);
        }
    `;

    const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uBass: { value: 0 }
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
    });

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function animate(time) {
        requestAnimationFrame(animate);
        
        analyser.getByteFrequencyData(dataArray);
        // Get average of lower frequencies for bass
        let sum = 0;
        for(let i = 0; i < 10; i++) {
            sum += dataArray[i];
        }
        uniforms.uBass.value = sum / (10 * 255);
        uniforms.iTime.value = time * 0.001;
        
        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
}

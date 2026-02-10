# Cascadance: Project Documentation & Context

## 1. Project Overview
**Cascadance** is a high-fidelity, audio-reactive 3D visualizer built with **Three.js** and **Vanilla JavaScript**. It features a custom raymarching engine, a 5-track analysis timeline, and a "Glassmorphism" UI with draggable, resizable, and dockable windows.

---

## 2. Core Architecture

### A. Audio Analysis Engine (`client.js` & `VisualTimeline.js`)
The system analyzes audio frequency data in real-time using the Web Audio API.
* **Bands:** The spectrum is split into 3 primary bands:
    * **Lows (Bass):** Drives Zoom, Kick effects, and Pitch (Tilt).
    * **Mids (Vocals/Snare):** Drives Screen Shake (Roll) and Color Shifts.
    * **Highs (Treble):** Drives Detail noise and Yaw (Spin).
* **Smoothing:** Uses an Exponential Moving Average (EMA) with adjustable decay (Default: 0.85) to smooth jittery data.
* **Auto-Gain:** A custom algorithm normalizes volume levels dynamically (0.5x to 5.0x) to ensure visual impact regardless of track loudness.

### B. The Visual Timeline
A sophisticated offline analysis tool that pre-renders the song's structure.
* **Tracks:**
    1.  **Lows (Red):** Bass amplitude.
    2.  **Mids (Green):** Vocal/Snare amplitude.
    3.  **Highs (Blue):** Treble amplitude.
    4.  **Camera (White Line):** Visualizes the computed "Impact" value (Zoom/Shake).
    5.  **Color (Spectrum Strip):** Visualizes the computed Hue Shift over time.
* **Navigation:**
    * **Zoom:** Mouse Wheel or `[+] / [-]` buttons (1.0x to 20.0x).
    * **Pan:** Click & Drag to scrub through the zoomed view.
    * **Architecture:** Decoupled Toolbar and Canvas to prevent event bubbling conflicts.

### C. 6DoF Camera System
The camera is no longer static; it simulates a physical drone flying through the fractal space.
* **Degrees of Freedom:**
    * **Position:** Pan X, Pan Y, Zoom (Z).
    * **Rotation:** Pitch (Tilt), Yaw (Spin), Roll (Bank).
* **Reactive Logic:**
    * **Kick (Lows):** Punches `uZoom` and Tilts `uPitch` (Head-banging).
    * **Snare (Mids):** Twists `uRoll` (Disorienting shake).
    * **Hats (Highs):** Drifts `uYaw` (Slow spin).

---

## 3. UI System ("The Islands")

### A. Window Management (`UIManager.js`)
* **Draggable:** Absolute positioning with bounds checking.
* **Resizable:** Custom `nwse-resize` handle in the bottom-right corner.
* **Dockable:** "Dock UI" button snaps islands to a Sidebar Flexbox layout.
* **Minimizable:** "[-]" button collapses the window to a header bar.

### B. Hybrid Controls (Auto/Manual)
Every parameter (Visuals and Camera) uses a dual-state control system:
* **Auto Mode (Default):** The slider sets the *Base Value*. A "Ghost Bar" (Live Meter) overlays the slider to show real-time audio modulation.
* **Manual Mode:** A toggle switch disables automation. The slider becomes a strict static value.

### C. Color Palette
* **Base Hue:** Sets the starting color (0-360).
* **Vibrance:** Controls Saturation.
* **Audio Shift:** Determines how much the "Mids" push the Hue around the color wheel.

---

## 4. Shader Pipeline (GLSL)

### A. Raymarching Core
* **Technique:** Sphere Tracing (Raymarching) for infinite detail.
* **Rotation:** Custom `mat3 getCamRot(vec3 rpy)` function applies Pitch/Yaw/Roll to the Ray Direction (`rd`) before the marching loop.

### B. Shader Library
* **Menger Sponge:** A recursive fractal structure.
    * *Params:* Scale (Density), Speed (Rotation), Color Shift.
* **Neon Tunnel:** A warped, infinite cylinder flight.
    * *Params:* FOV, Warp Strength, Glow Intensity.

---

## 5. Key Data Structures

### `CAMERA_CONFIG`
```javascript
{
    name: 'uPitch',
    label: 'Tilt (Pitch)',
    min: -1.0, max: 1.0, value: 0.0,
    automation: {
        enabled: true,
        source: 'uBass', // Maps to audioMetrics.lows
        strength: 0.2   // Modulator intensity
    }
}
```
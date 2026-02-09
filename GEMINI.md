# Cascadance

## Project Overview
Cascadance is an interactive web-based audio visualizer application. It allows users to upload MP3 files, manage a playlist, and experience real-time 3D visual effects that react to the audio frequencies (specifically bass). The visuals are generated using Three.js and custom GLSL fragment shaders.

### Tech Stack
*   **Backend:** Node.js, Express.js
*   **Frontend:** Vanilla JavaScript, HTML5, CSS3
*   **Graphics:** Three.js (via CDN), WebGL, GLSL Shaders
*   **File Handling:** Multer (for handling MP3 uploads)

## Getting Started

### Prerequisites
*   Node.js (v14 or higher recommended)
*   npm (Node Package Manager)

### Installation
1.  Clone the repository (if applicable) or navigate to the project directory.
2.  Install the dependencies:
    ```bash
    npm install
    ```

### Running the Application
1.  Start the server:
    ```bash
    node server.js
    ```
2.  Open your browser and navigate to:
    ```
    http://localhost:3000
    ```

## Project Structure

*   **`server.js`**: The main entry point for the Node.js application. It sets up the Express server, handles file uploads using `multer`, and serves static files from the `public` directory.
*   **`public/`**: Contains the frontend assets.
    *   **`index.html`**: The main HTML file. It includes the UI structure (draggable "islands"), embedded CSS styles, and loads Three.js from a CDN.
    *   **`client.js`**: Contains the core frontend logic, including:
        *   **UI Logic:** Handling draggable and minimizable windows.
        *   **Audio Logic:** managing the AudioContext, playlist, playback controls, and analyzing audio data.
        *   **Visualizer Logic:** Setting up the Three.js scene, camera, and updating GLSL shader uniforms based on audio data.
    *   **`uploads/`**: Directory where uploaded MP3 files are stored (created automatically if it doesn't exist).
*   **`package.json`**: Defines project metadata and dependencies (`express`, `multer`, `cors`).

## Key Features

1.  **Audio Playback:**
    *   Upload MP3 files directly through the UI.
    *   Standard playback controls (Play, Pause, Stop, Next, Prev).
    *   Progress bar and time display.
    *   Playlist management.

2.  **Visualizations:**
    *   Two distinct visual styles: "Architectural Sponge" (Menger Sponge fractal) and "Neon Warp Tunnel".
    *   Real-time reactivity to audio bass frequencies.
    *   Adjustable parameters for visuals (Speed, Color Shift, Sensitivity, etc.).

3.  **Interactive UI:**
    *   Floating "Island" windows for Audio, Visuals, and Camera controls.
    *   Windows are draggable and minimizable to customize the viewing experience.
    *   Camera controls to pan and zoom the visualizer.

## Development Notes

*   **Styling:** CSS is currently embedded directly within `public/index.html`.
*   **Frontend Build:** There is no build step (e.g., Webpack/Vite) for the frontend; it uses native ES modules and browser capabilities.
*   **Testing:** There are currently no automated tests specified in `package.json`.
*   **Data Persistence:** Uploaded files are stored on disk in `public/uploads/`. There is no database; the playlist is session-based on the client side.

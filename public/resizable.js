// CSS styles for resize handle and resizable islands
const resizeStyles = document.createElement('style');
resizeStyles.textContent = `
    .island {
        min-width: 300px;
        min-height: 200px;
        position: absolute; /* Default state */
    }

    .island.docked, .island.minimized {
        /* When docked or minimized, resizing is disabled */
        min-width: 0; 
        min-height: 0;
    }
    
    .island.minimized .content-area {
        display: none;
    }

    .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 15px;
        height: 15px;
        cursor: nwse-resize;
        z-index: 10;
        /* Visual Grip */
        background: linear-gradient(135deg, transparent 50%, rgba(255, 255, 255, 0.4) 50%);
        border-bottom-right-radius: 12px; /* Match island radius */
    }

    /* Hide handle when docked or minimized */
    .island.docked .resize-handle,
    .island.minimized .resize-handle {
        display: none;
    }
`;
document.head.appendChild(resizeStyles);

/**
 * Makes an island element resizable.
 * Handles mouse events on a generated handle and observes content size changes to update canvases.
 * @param {HTMLElement} island - The island element to make resizable.
 */
function makeResizable(island) {
    // 1. Create Handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.setAttribute('data-tooltip', 'Drag to resize');
    island.appendChild(handle);

    // 2. Mouse Events for Resizing
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    const onMouseDown = (e) => {
        // Guard Clause: Disable resize if docked or minimized
        if (island.classList.contains('docked') || island.classList.contains('minimized')) return;
        
        e.stopPropagation(); // Prevent drag
        e.preventDefault(); // Prevent selection
        
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        
        // Use computed style or offset dimensions
        startWidth = parseInt(document.defaultView.getComputedStyle(island).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(island).height, 10);
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isResizing) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        const newWidth = startWidth + dx;
        const newHeight = startHeight + dy;
        
        // Apply minimum dimensions (enforced by CSS min-width/height too)
        if (newWidth > 300) island.style.width = `${newWidth}px`;
        if (newHeight > 200) island.style.height = `${newHeight}px`;
    };

    const onMouseUp = () => {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', onMouseDown);

    // 3. Canvas Reactivity (ResizeObserver)
    const contentArea = island.querySelector('.content-area');
    if (contentArea) {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                
                // Find all canvases in this content area
                const canvases = contentArea.querySelectorAll('canvas');
                canvases.forEach(canvas => {
                    // Update internal resolution to match display size (avoid blur)
                    // Note: This resets canvas content, so redraw logic is needed externally if not handled by a loop
                    // For WebGL (Three.js), renderer.setSize handles this separately.
                    // For 2D contexts (like timeline), we rely on their internal resize methods or loop.
                    
                    // Simple pixel ratio fix
                    const dpr = window.devicePixelRatio || 1;
                    // Check if it's the main Three.js canvas (usually not in an island content area, but just in case)
                    if (canvas.id !== 'canvas-container') {
                         canvas.width = width * dpr;
                         canvas.height = height * dpr;
                         // Style dimensions usually handled by CSS (width: 100%, height: 100%)
                    }
                });

                // Special handling for specific islands if needed
                if (island.id === 'timeline-island' && window.visualTimeline) {
                     window.visualTimeline.resize();
                }
            }
        });
        
        resizeObserver.observe(contentArea);
    }
}

// Initialize for all existing islands
document.querySelectorAll('.island').forEach(makeResizable);

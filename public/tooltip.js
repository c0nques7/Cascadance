const tooltip = document.createElement('div');
tooltip.id = 'global-tooltip';
tooltip.style.position = 'absolute';
tooltip.style.background = 'rgba(0, 0, 0, 0.85)';
tooltip.style.color = '#fff';
tooltip.style.padding = '6px 10px';
tooltip.style.borderRadius = '4px';
tooltip.style.fontSize = '11px';
tooltip.style.pointerEvents = 'none';
tooltip.style.zIndex = '9999';
tooltip.style.display = 'none';
tooltip.style.whiteSpace = 'nowrap';
tooltip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
tooltip.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
tooltip.style.fontFamily = 'sans-serif';
tooltip.style.backdropFilter = 'blur(4px)';
document.body.appendChild(tooltip);

let tooltipTimeout;

document.addEventListener('mouseover', (e) => {
    // Find closest element with data-tooltip
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;

    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    tooltip.textContent = text;
    tooltip.style.display = 'block';
    
    // Initial positioning
    updatePosition(e);
});

document.addEventListener('mousemove', (e) => {
    if (tooltip.style.display === 'block') {
        updatePosition(e);
    }
});

document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        tooltip.style.display = 'none';
    }
});

function updatePosition(e) {
    const offset = 15;
    let x = e.pageX + offset;
    let y = e.pageY + offset;

    // Boundary checks
    if (x + tooltip.offsetWidth > window.innerWidth) {
        x = e.pageX - tooltip.offsetWidth - offset;
    }
    if (y + tooltip.offsetHeight > window.innerHeight) {
        y = e.pageY - tooltip.offsetHeight - offset;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

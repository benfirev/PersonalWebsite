// Wait for page to load
window.addEventListener('load', function() {
    // ===== CONFIGURATION CONSTANTS =====
    const HOVER_DELAY_MS = 600;        // Time to wait before showing hover info (milliseconds)
    const MOUSE_MOVE_THRESHOLD_PX = 50;  // Distance mouse can move before hiding info (pixels)
    const HOVER_DOT_SIZE = 0.02;         // Size of green hover dot
    const NORTH_POLE_SIZE = 0.05;        // Size of north pole indicator
    const NORTH_POLE_HEIGHT = 1.08;      // Height of north pole indicator above sphere
    const HOVER_DOT_HEIGHT = 1.02;       // Height of hover dot above sphere surface
    const INFO_WINDOW_OFFSET_X = 10;     // Horizontal offset of info window from mouse (pixels)
    const INFO_WINDOW_OFFSET_Y = -60;    // Vertical offset of info window from mouse (pixels)
    let FUNCTION_NORMALIZATION = 1.5;    // Multiplier for function values in hue calculation
    // ===================================
    
    // Scene setup
    const scene = new THREE.Scene();
    
    // Get initial dimensions
    const windowContent = document.querySelector('.window-content');
    const contentWidth = windowContent ? windowContent.clientWidth : window.innerWidth - 550;
    const contentHeight = windowContent ? windowContent.clientHeight : window.innerHeight - 45;
    
    const camera = new THREE.PerspectiveCamera(75, contentWidth / contentHeight, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('sphere-canvas'),
        antialias: true 
    });
    
    // Set renderer size based on calculated dimensions
    renderer.setSize(contentWidth, contentHeight);
    camera.aspect = contentWidth / contentHeight;
    camera.updateProjectionMatrix();
    renderer.setClearColor(0x121212);
    
    // Create sphere geometry and material
    const geometry = new THREE.SphereGeometry(1, 128, 128);
    
    // Create material for function visualization
    const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        shininess: 25,
        specular: 0x222222
    });
    
    // Create sphere mesh
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    
    // Add north pole indicator
    const northPoleGeometry = new THREE.SphereGeometry(NORTH_POLE_SIZE, 16, 16);
    const northPoleMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000
    });
    const northPoleIndicator = new THREE.Mesh(northPoleGeometry, northPoleMaterial);
    northPoleIndicator.position.set(0, 0, NORTH_POLE_HEIGHT); // Floating above, but closer
    scene.add(northPoleIndicator);
    
    // Add hover dot indicator
    const hoverDotGeometry = new THREE.SphereGeometry(HOVER_DOT_SIZE, 8, 8);
    const hoverDotMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00
    });
    const hoverDot = new THREE.Mesh(hoverDotGeometry, hoverDotMaterial);
    hoverDot.visible = false;
    scene.add(hoverDot);
    
    // Function to evaluate mathematical expressions
    function evaluateFunction(expression, h, t) {
        try {
            // Replace mathematical functions and operators for JavaScript
            // Order matters! Replace longer function names first to avoid conflicts
            let jsExpr = expression
                .replace(/\^/g, '**')  // Power operator
                .replace(/sqrt/g, 'Math.sqrt')  // Do sqrt before other functions containing 'r'
                .replace(/abs/g, 'Math.abs')    // Do abs before other functions 
                .replace(/sin/g, 'Math.sin')
                .replace(/cos/g, 'Math.cos')
                .replace(/tan/g, 'Math.tan')
                .replace(/exp/g, 'Math.exp')
                .replace(/\bpi\b/g, 'Math.PI')    // Pi constant
                .replace(/\be\b/g, 'Math.E')      // Euler's number
                .replace(/\bh\b/g, h.toString())
                .replace(/\bt\b/g, t.toString());
            
            const result = Function('"use strict"; return (' + jsExpr + ')')();
            
            // Check for invalid results (NaN, Infinity)
            if (isNaN(result) || !isFinite(result)) {
                return 0;
            }
            
            return result;
        } catch (e) {
            console.warn('Function evaluation error:', e, 'for expression:', expression, 'at h=', h, 't=', t);
            return 0; // Return 0 for invalid expressions
        }
    }
    
    // Function to normalize angle t to be between 0 and 2π
    function normalizeAngle(angle) {
        // Convert from [-π, π] to [0, 2π]
        return angle + Math.PI;
    }
    
    // Function to convert function value to hue (0-360 degrees)
    function valueToHue(value) {
        // Apply normalization multiplier
        const normalizedInput = value * FUNCTION_NORMALIZATION;
        // Direct mapping with tanh for better color spread
        // tanh gives good saturation and maps (-∞,∞) to (-1,1)
        const normalizedValue = Math.tanh(normalizedInput);
        return ((normalizedValue + 1) / 2) * 360; // Map [-1,1] to [0,360]
    }
    
    // Function to create HSL color from hue
    function hueToColor(hue) {
        const color = new THREE.Color();
        color.setHSL(hue / 360, 0.7, 0.5); // More moderate brightness
        return color;
    }

    // Function to update the color gradient indicator
    function updateColorGradient() {
        const colorGradient = document.querySelector('.color-gradient');
        if (!colorGradient) return;

        // Generate gradient stops for values from -1 to 1
        const stops = [];
        for (let i = 0; i <= 20; i++) {
            const value = -1 + (i / 10); // -1 to 1 in steps of 0.1
            const hue = valueToHue(value);
            const percentage = (i / 20) * 100;
            stops.push(`hsl(${hue.toFixed(1)}, 70%, 50%) ${percentage.toFixed(1)}%`);
        }

        const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
        colorGradient.style.background = gradient;
    }
    
    // Function to update sphere colors based on function
    function updateSphereVisualization(expression) {
        if (!expression.trim()) {
            // Reset to default blue color if no expression
            const positions = geometry.attributes.position;
            const colors = new Float32Array(positions.count * 3);
            const defaultColor = new THREE.Color(0x2c2c2c);
            
            for (let i = 0; i < positions.count; i++) {
                colors[i * 3] = defaultColor.r;
                colors[i * 3 + 1] = defaultColor.g;
                colors[i * 3 + 2] = defaultColor.b;
            }
            
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.attributes.color.needsUpdate = true;
            return;
        }
        
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        
        for (let i = 0; i < positions.count; i++) {
            // Get the vertex position (already normalized on unit sphere)
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            
            // Convert Cartesian (x,y,z) back to (h,t) coordinates
            const h = z; // h is just the z-coordinate
            const t = normalizeAngle(Math.atan2(y, x)); // t is the angle in the xy-plane, normalized to [0, 2π]
            
            // Evaluate the function at this point
            const functionValue = evaluateFunction(expression, h, t);
            
            // Convert function value to hue
            const hue = valueToHue(functionValue);
            
            // Create color from hue
            const color = hueToColor(hue);
            
            // Set vertex color
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        // Update geometry colors
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.attributes.color.needsUpdate = true;
    }
    
    // Add isometric lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Three directional lights for even isometric lighting
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight1.position.set(1, 1, 1);
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-1, 1, 1);
    scene.add(directionalLight2);
    
    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.2);
    directionalLight3.position.set(0, -1, 1);
    scene.add(directionalLight3);
    
    // Position camera
    camera.position.set(0, -1.9, 1.1); // Looking from negative Y towards origin
    camera.lookAt(0, 0, 0); // Look at sphere center
    
    // Add orbit controls for mouse interaction
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth camera movements
    controls.dampingFactor = 0.05;
    controls.enableZoom = true; // Allow zoom with scroll wheel
    controls.enableRotate = true; // Allow rotation with mouse drag
    controls.enablePan = false; // Allow panning with right mouse button
    controls.minDistance = 1.7; // Minimum zoom distance
    controls.maxDistance = 10; // Maximum zoom distance
    
    // Hide info window when controls start changing (rotating/panning/zooming)
    controls.addEventListener('start', function() {
        hideInfoWindow();
    });
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        // Update controls
        controls.update();
        // Render scene
        renderer.render(scene, camera);
    }
    
    // Start animation
    animate();
    
    // Handle window resize and mobile layout changes
    let resizeTimeout;
    function updateCanvasSize() {
        const content = document.querySelector('.window-content');
        if (!content) return;
        
        const newWidth = content.clientWidth;
        const newHeight = content.clientHeight;
        
        // Only update if dimensions have actually changed and are valid
        if (newWidth > 0 && newHeight > 0 && 
            (Math.abs(camera.aspect - (newWidth / newHeight)) > 0.001 || 
             Math.abs(renderer.domElement.width - newWidth) > 1 ||
             Math.abs(renderer.domElement.height - newHeight) > 1)) {
            
            camera.aspect = newWidth / newHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(newWidth, newHeight);
        }
    }
    
    // Debounced resize handler
    function handleResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateCanvasSize, 16); // ~60fps
    }
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', function() {
        // Delay to allow orientation change to complete
        setTimeout(updateCanvasSize, 200);
    });
    
    // Also listen for visual viewport changes (mobile browsers with dynamic UI)
    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', handleResize);
    }
    
    // Initial canvas size update after everything is loaded
    setTimeout(updateCanvasSize, 100);
    
    // Function validation
    const functionInput = document.getElementById('function-input');
    
    function validateFunction(expression) {
        if (!expression.trim()) {
            return true; // Empty is valid (neutral state)
        }
        
        // Remove whitespace
        const expr = expression.replace(/\s+/g, '');
        
        // Check for implicit multiplication (number followed by letter or function)
        // This catches cases like 3sin(t), 2h, 5cos(h), etc.
        if (/\d[a-z]/.test(expr.toLowerCase())) {
            return false;
        }
        
        // Check for implicit multiplication (closing paren followed by letter or number)
        // This catches cases like (h+1)sin(t), (2)h, etc.
        if (/\)[a-z0-9]/.test(expr.toLowerCase())) {
            return false;
        }
        
        // Check for implicit multiplication (letter followed by opening paren)
        // This catches cases like h(t+1), t(sin), etc. - but allow function calls
        const allowedFunctions = ['sin', 'cos', 'tan', 'exp', 'sqrt', 'abs'];
        let tempCheck = expr.toLowerCase();
        // Remove valid function calls first
        allowedFunctions.forEach(func => {
            tempCheck = tempCheck.replace(new RegExp(func + '\\(', 'g'), '');
        });
        // Now check for remaining letter followed by opening paren
        if (/[a-z]\(/.test(tempCheck)) {
            return false;
        }
        
        // Check for valid characters only: h, t, numbers, operators, functions, parentheses, constants
        const validPattern = /^[htpie0-9+\-*\/^().sincoexpqrab]+$/i;
        if (!validPattern.test(expr)) {
            return false;
        }
        
        // Check for valid function names and structure
        let processedExpr = expr.toLowerCase();
        
        // First, check for invalid variables (any single letter that's not h, t, e or part of pi)
        // Replace known functions and constants first to avoid false positives
        let tempExpr = processedExpr;
        allowedFunctions.forEach(func => {
            tempExpr = tempExpr.replace(new RegExp(func, 'g'), '');
        });
        
        // Remove mathematical constants
        tempExpr = tempExpr.replace(/pi/g, '');
        tempExpr = tempExpr.replace(/\be\b/g, '');
        
        // Check for any remaining single letters that aren't h or t
        const invalidVariables = tempExpr.match(/[a-gi-su-z]/g); // Any letter except h and t
        if (invalidVariables) {
            return false;
        }
        
        // Replace function names with placeholders to check structure
        allowedFunctions.forEach(func => {
            processedExpr = processedExpr.replace(new RegExp(func, 'g'), 'f');
        });
        
        // Replace variables with placeholders
        processedExpr = processedExpr.replace(/[ht]/g, 'x');
        
        // Replace numbers with placeholder
        processedExpr = processedExpr.replace(/\d+(\.\d+)?/g, 'n');
        
        // Check for basic syntax issues
        const brackets = processedExpr.match(/[()]/g) || [];
        let openCount = 0;
        for (let bracket of brackets) {
            if (bracket === '(') openCount++;
            else openCount--;
            if (openCount < 0) return false;
        }
        if (openCount !== 0) return false;
        
        // Check for consecutive operators
        if (/[+\-*\/^]{2,}/.test(processedExpr)) {
            return false;
        }
        
        // Check for operators at start/end (except - at start)
        if (/[+*\/^]$/.test(processedExpr) || /^[+*\/^]/.test(processedExpr)) {
            return false;
        }
        
        return true;
    }
    
    function updateInputValidation() {
        const isValid = validateFunction(functionInput.value);
        if (isValid) {
            functionInput.style.backgroundColor = '#1a1a1a';
            functionInput.style.borderColor = '#3c3c3c';
            
            // Update sphere visualization with valid function
            updateSphereVisualization(functionInput.value);
        } else {
            functionInput.style.backgroundColor = '#2d1b1b'; // Dark red
            functionInput.style.borderColor = '#ff4444'; // Red border
        }
    }
    
    // Add input event listener for real-time validation
    functionInput.addEventListener('input', updateInputValidation);
    
    // Set default function and apply it
    functionInput.value = 'h*sin(t)';
    updateInputValidation(); // Apply the default function
    
    // Add hover detection for sphere
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoverTimeout = null;
    let currentHoverPoint = null;
    let infoWindow = null;
    let originalMousePos = { x: 0, y: 0 };
    
    function createInfoWindow(x, y, z, h, t, functionValue, clientX, clientY) {
        // Remove existing info window
        if (infoWindow) {
            document.body.removeChild(infoWindow);
        }
        
        infoWindow = document.createElement('div');
        infoWindow.style.position = 'fixed';
        infoWindow.style.background = 'rgba(0, 0, 0, 0.9)';
        infoWindow.style.color = 'white';
        infoWindow.style.padding = '12px 16px';
        infoWindow.style.borderRadius = '8px';
        infoWindow.style.fontSize = '14px';
        infoWindow.style.fontFamily = 'monospace';
        infoWindow.style.pointerEvents = 'none';
        infoWindow.style.zIndex = '1000';
        infoWindow.style.whiteSpace = 'nowrap';
        infoWindow.style.border = '1px solid #ff6347';
        infoWindow.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';
        
        // Mobile-friendly positioning
        const isMobile = window.innerWidth <= 768;
        const isSmallMobile = window.innerWidth <= 480;
        
        if (isMobile) {
            // Position at top center on mobile for better visibility
            infoWindow.style.left = '50%';
            infoWindow.style.transform = 'translateX(-50%)';
            infoWindow.style.top = '20px';
            infoWindow.style.fontSize = isSmallMobile ? '12px' : '14px';
            infoWindow.style.padding = isSmallMobile ? '10px 12px' : '12px 16px';
            infoWindow.style.maxWidth = 'calc(100vw - 40px)';
        } else {
            // Desktop positioning
            infoWindow.style.left = (clientX + INFO_WINDOW_OFFSET_X) + 'px';
            infoWindow.style.top = (clientY + INFO_WINDOW_OFFSET_Y) + 'px';
        }
        
        infoWindow.innerHTML = `
        (h,t): (${h.toFixed(3)}, ${(t/Math.PI).toFixed(3)}π)<br>
        f(h,t): ${functionValue.toFixed(3)}<br>
        (x,y,z): (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})
        `;
        
        document.body.appendChild(infoWindow);
        
        // // Auto-hide on mobile after 3 seconds
        // if (isMobile) {
        //     setTimeout(() => {
        //         if (infoWindow) {
        //             hideInfoWindow();
        //         }
        //     }, 3000);
        // }
    }
    
    function hideInfoWindow() {
        if (infoWindow) {
            document.body.removeChild(infoWindow);
            infoWindow = null;
        }
        hoverDot.visible = false;
        currentHoverPoint = null;
    }
    
    function getMouseDistance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
    
    function onSphereHover(event) {
        // Get canvas bounds
        const canvas = renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // If info window is shown, check if mouse moved too far
        if (infoWindow) {
            const distance = getMouseDistance(originalMousePos.x, originalMousePos.y, event.clientX, event.clientY);
            if (distance > MOUSE_MOVE_THRESHOLD_PX) { // Hide if moved too far
                hideInfoWindow();
                return;
            }
        }
        
        // Update raycaster
        raycaster.setFromCamera(mouse, camera);
        
        // Find intersections with the sphere
        const intersects = raycaster.intersectObject(sphere);
        
        if (intersects.length > 0) {
            const intersection = intersects[0];
            const point = intersection.point;
            
            // Don't start new hover if info window is already shown
            if (infoWindow) {
                return;
            }
            
            // Clear existing timeout
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
            
            // Store original mouse position
            originalMousePos.x = event.clientX;
            originalMousePos.y = event.clientY;
            
            // Set new timeout for 1 second
            hoverTimeout = setTimeout(() => {
                // Get (x,y,z) coordinates
                const x = point.x;
                const y = point.y;
                const z = point.z;
                
                // Convert to (h,t) coordinates
                const h = z;
                const t = normalizeAngle(Math.atan2(y, x));
                
                // Evaluate function at this point
                const expression = functionInput.value.trim();
                let functionValue = 0;
                if (expression) {
                    functionValue = evaluateFunction(expression, h, t);
                }
                
                // Show hover dot
                hoverDot.position.copy(point);
                hoverDot.position.multiplyScalar(HOVER_DOT_HEIGHT); // Slightly outside sphere
                hoverDot.visible = true;
                
                // Create and show info window at original position
                createInfoWindow(x, y, z, h, t, functionValue, originalMousePos.x, originalMousePos.y);
                
                currentHoverPoint = { x, y, z, h, t, functionValue };
            }, HOVER_DELAY_MS); // Configurable delay
        } else {
            // Clear timeout if not hovering over sphere
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
        }
    }
    
    function onMouseLeave(event) {
        // Clear timeout and hide info when mouse leaves canvas
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
        hideInfoWindow();
    }
    
    // Add hover/touch event listeners to canvas
    renderer.domElement.addEventListener('mousemove', onSphereHover);
    renderer.domElement.addEventListener('mouseleave', onMouseLeave);
    
    // Mobile touch events
    renderer.domElement.addEventListener('touchstart', function(event) {
        event.preventDefault();
        const touch = event.touches[0];
        const mouseEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY
        };
        onSphereHover(mouseEvent);
    });
    
    renderer.domElement.addEventListener('touchend', function(event) {
        event.preventDefault();
        // Don't hide immediately on touch end, let auto-hide handle it
    });
    
    // Add north pole indicator toggle functionality
    const northPoleToggle = document.getElementById('north-pole-toggle');
    northPoleToggle.addEventListener('change', function() {
        northPoleIndicator.visible = this.checked;
    });
    
    // Add function normalization slider functionality
    const normalizationSlider = document.getElementById('normalization-slider');
    const normalizationValue = document.getElementById('normalization-value');
    
    // Update display value while dragging (fast)
    normalizationSlider.addEventListener('input', function() {
        FUNCTION_NORMALIZATION = parseFloat(this.value);
        normalizationValue.textContent = FUNCTION_NORMALIZATION.toFixed(1);
        updateColorGradient(); // Update gradient in real-time
    });

    // Update visualization only when slider is released (slower operation)
    normalizationSlider.addEventListener('change', function() {
        updateInputValidation();
    });

    // Initialize color gradient on load
    updateColorGradient();    console.log('3D Sphere loaded successfully!');
});
import { Filter, GlProgram } from 'pixi.js';

/**
 * BeaconSignalFilter — halftone broadcast signal shader.
 *
 * Inspired by classic halftone/ASCII art: a grid of circles whose SIZE varies
 * with the underlying signal intensity. Concentric signal waves radiate from
 * center — where the wave is strong, dots grow large; where it's quiet, dots
 * shrink to tiny specks. Creates a living, breathing dither-display aesthetic.
 *
 * Driven by uTime uniform — increment each frame for animation.
 */

const vertex = `
    attribute vec2 aPosition;
    varying vec2 vTextureCoord;

    uniform vec4 uInputSize;
    uniform vec4 uOutputFrame;
    uniform vec4 uOutputTexture;

    void main(void) {
        gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
        vTextureCoord = aPosition;
    }
`;

const fragment = `
    precision mediump float;

    varying vec2 vTextureCoord;
    uniform sampler2D uTexture;

    uniform float uTime;
    uniform float uColorR;
    uniform float uColorG;
    uniform float uColorB;
    uniform float uIntensity;
    uniform float uAspect;

    void main(void) {
        vec4 original = texture2D(uTexture, vTextureCoord);

        // Use original alpha as shape mask (rounded corners)
        if (original.a < 0.01) {
            discard;
        }

        vec2 uv = vTextureCoord;
        vec2 center = vec2(0.5);

        // Aspect-corrected distance for circular rings on rectangular card
        vec2 pos = (uv - center) * vec2(1.0, 1.0 / uAspect);
        float dist = length(pos);

        vec3 beaconColor = vec3(uColorR, uColorG, uColorB);

        // --- Dark base ---
        vec3 bg = vec3(0.04, 0.04, 0.07);

        // --- Signal wave field (determines halftone dot sizes) ---
        // Primary expanding rings
        float ringWave = sin(dist * 20.0 - uTime * 2.2) * 0.5 + 0.5;
        ringWave = pow(ringWave, 2.5);
        ringWave *= smoothstep(0.6, 0.05, dist);

        // Secondary ring layer (offset phase, slower — creates moiré depth)
        float ring2 = sin(dist * 12.0 - uTime * 1.3 + 2.0) * 0.5 + 0.5;
        ring2 = pow(ring2, 4.0) * 0.35;
        ring2 *= smoothstep(0.55, 0.08, dist);

        // Slow breathing base (everything gently pulses)
        float breath = sin(uTime * 0.8) * 0.08 + 0.12;

        // Combined signal intensity at this point
        float signal = clamp(ringWave + ring2 + breath, 0.0, 1.0);

        // Center hotspot — always active, creates bright core
        float centerGlow = smoothstep(0.35, 0.0, dist) * 0.6;
        signal = clamp(signal + centerGlow, 0.0, 1.0);

        // === HALFTONE GRID ===
        // Grid parameters
        float cellCount = 22.0; // cells across
        vec2 cellSize = vec2(1.0 / cellCount, (1.0 / cellCount) * uAspect);
        vec2 cellUV = uv / cellSize;
        vec2 cellId = floor(cellUV);
        vec2 cellFrac = fract(cellUV); // position within cell (0-1)

        // Sample signal at cell center (not at pixel) for uniform dot per cell
        vec2 cellCenterUV = (cellId + 0.5) * cellSize;
        vec2 cellCenterPos = (cellCenterUV - center) * vec2(1.0, 1.0 / uAspect);
        float cellDist = length(cellCenterPos);

        // Recompute signal at cell center for clean halftone
        float cellRing1 = sin(cellDist * 20.0 - uTime * 2.2) * 0.5 + 0.5;
        cellRing1 = pow(cellRing1, 2.5);
        cellRing1 *= smoothstep(0.6, 0.05, cellDist);

        float cellRing2 = sin(cellDist * 12.0 - uTime * 1.3 + 2.0) * 0.5 + 0.5;
        cellRing2 = pow(cellRing2, 4.0) * 0.35;
        cellRing2 *= smoothstep(0.55, 0.08, cellDist);

        float cellCenter = smoothstep(0.35, 0.0, cellDist) * 0.6;
        float cellSignal = clamp(cellRing1 + cellRing2 + breath + cellCenter, 0.0, 1.0);

        // --- Variable dot radius (the halftone magic) ---
        // At full signal, dot fills 90% of cell; at zero signal, tiny speck (3%)
        float maxRadius = 0.45;
        float minRadius = 0.03;
        float dotRadius = mix(minRadius, maxRadius, cellSignal);

        // Distance from pixel to cell center
        float pixDist = length(cellFrac - 0.5);

        // Smooth circle edge (anti-aliased)
        float aa = 0.02; // anti-alias width
        float dot = 1.0 - smoothstep(dotRadius - aa, dotRadius + aa, pixDist);

        // --- Dot color: bright where strong, subtle dim elsewhere ---
        // Strong signal dots: full beacon color
        // Weak dots: dimmer, slightly blue-shifted
        vec3 dotColorStrong = beaconColor * 1.2;
        vec3 dotColorWeak = beaconColor * 0.3 + vec3(0.02, 0.02, 0.06);
        vec3 dotColor = mix(dotColorWeak, dotColorStrong, cellSignal);

        // --- Subtle edge frame ---
        float edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
        float edgeLine = smoothstep(0.0, 0.008, edgeDist) * (1.0 - smoothstep(0.008, 0.025, edgeDist));
        edgeLine *= 0.15;

        // --- Combine ---
        vec3 finalColor = bg + dotColor * dot * uIntensity + beaconColor * edgeLine;

        gl_FragColor = vec4(finalColor, original.a);
    }
`;

/** Hex color (0xRRGGBB) to normalized RGB array */
function hexToRgb(hex: number): [number, number, number] {
	return [
		((hex >> 16) & 0xFF) / 255,
		((hex >> 8) & 0xFF) / 255,
		(hex & 0xFF) / 255,
	];
}

export interface BeaconSignalFilterOptions {
	color: number;    // 0xRRGGBB
	aspect: number;   // width / height
	intensity?: number;
}

export function createBeaconSignalFilter(options: BeaconSignalFilterOptions): Filter {
	const [r, g, b] = hexToRgb(options.color);

	return new Filter({
		glProgram: new GlProgram({ vertex, fragment }),
		resources: {
			signalUniforms: {
				uTime: { value: 0.0, type: 'f32' },
				uColorR: { value: r, type: 'f32' },
				uColorG: { value: g, type: 'f32' },
				uColorB: { value: b, type: 'f32' },
				uIntensity: { value: options.intensity ?? 1.0, type: 'f32' },
				uAspect: { value: options.aspect, type: 'f32' },
			},
		},
	});
}

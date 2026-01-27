// Atmosphere glow shader for Earth globe
import * as THREE from 'three'

export const atmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const atmosphereFragmentShader = `
uniform vec3 glowColor;
uniform float intensity;
uniform float power;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vec3 viewDirection = normalize(-vPosition);
    float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), power);
    vec3 glow = glowColor * fresnel * intensity;
    gl_FragColor = vec4(glow, fresnel * 0.8);
}
`

export function createAtmosphereMaterial(color: number = 0x4FC3F7): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            glowColor: { value: new THREE.Color(color) },
            intensity: { value: 1.5 },
            power: { value: 3.0 },
        },
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    })
}

// Earth surface shader with subtle grid lines
export const earthVertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const earthFragmentShader = `
uniform vec3 landColor;
uniform vec3 oceanColor;
uniform vec3 gridColor;
uniform float gridOpacity;
uniform float time;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    // Simple procedural land/ocean (can be replaced with texture)
    float noise = sin(vUv.x * 20.0) * sin(vUv.y * 10.0) * 0.5 + 0.5;
    vec3 baseColor = mix(oceanColor, landColor, step(0.45, noise));
    
    // Grid lines
    float latLines = abs(sin(vUv.y * 3.14159 * 18.0));
    float lonLines = abs(sin(vUv.x * 3.14159 * 36.0));
    float grid = smoothstep(0.95, 1.0, max(latLines, lonLines));
    
    vec3 color = mix(baseColor, gridColor, grid * gridOpacity);
    
    // Fresnel rim lighting
    vec3 viewDirection = normalize(-vPosition);
    float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), 2.0);
    color += gridColor * fresnel * 0.3;
    
    gl_FragColor = vec4(color, 1.0);
}
`

export function createEarthMaterial(
    landColor: number = 0x1A3F4E,
    oceanColor: number = 0x0B171C,
    gridColor: number = 0x3C8FB0
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            landColor: { value: new THREE.Color(landColor) },
            oceanColor: { value: new THREE.Color(oceanColor) },
            gridColor: { value: new THREE.Color(gridColor) },
            gridOpacity: { value: 0.15 },
            time: { value: 0 },
        },
        vertexShader: earthVertexShader,
        fragmentShader: earthFragmentShader,
    })
}

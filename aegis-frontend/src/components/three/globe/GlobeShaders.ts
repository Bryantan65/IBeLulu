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
uniform float time;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

// Simple pseudo-random noise
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

#define NUM_OCTAVES 5

float fbm(vec2 st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // Rotate to reduce axial bias
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(st);
        st = rot * st * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    // FBM Noise for continental shapes
    vec2 st = vUv * 4.0;
    float landNoise = fbm(st);
    
    // Threshold for land vs ocean
    float isLand = step(0.48, landNoise);
    
    // Mix colors with slight variation
    vec3 col = mix(oceanColor, landColor, isLand);
    
    // Add some "cloud" like noise over top
    float cloudNoise = fbm(st + vec2(time * 0.02, 0.0));
    float cloudCvr = smoothstep(0.6, 0.8, cloudNoise);
    col = mix(col, vec3(1.0), cloudCvr * 0.4); // White clouds

    // Fresnel rim lighting for atmosphere feel
    vec3 viewDirection = normalize(-vPosition);
    float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), 3.0);
    col += vec3(0.2, 0.4, 0.8) * fresnel * 0.5;
    
    gl_FragColor = vec4(col, 1.0);
}
`

export function createEarthMaterial(
    landColor: number = 0x1A3F4E,
    oceanColor: number = 0x0B171C
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            landColor: { value: new THREE.Color(landColor) },
            oceanColor: { value: new THREE.Color(oceanColor) },
            time: { value: 0 },
        },
        vertexShader: earthVertexShader,
        fragmentShader: earthFragmentShader,
    })
}

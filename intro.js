// ===== OPENING SCENE =====
// The two of us holding hands on a beach, the sun setting over the sea, in the blocky style of the
// portfolio's pickleball scene. script.js owns the overlay and its button; this file only draws behind them.
// If it can't run (no WebGL, the file didn't load) the overlay keeps its painted sky and still works.
import * as THREE from './vendor/three/three.module.min.js';

const intro = document.getElementById('intro');
const host = document.getElementById('introScene');

// --- Colours: the site's blues, with the sunset kept to a soft peach around the sun ---
const COLORS = {
    skyTop: '#2b6ea3',
    skyMid: '#86bfe0',
    horizon: '#d4ecf4',
    sunBand: '#f6cfd3',
    sunGlow: '#ffd6bf',
    sun: '#fff4e0',
    seaDeep: '#1f6c9c',
    seaShallow: '#5dbbd8',
    seaSky: '#bfe2f0',
    glint: '#fff1dc',
    foam: '#ffffff',
    sheet: '#8fd6e8',
    sandDry: '#efe1c6',
    sandWet: '#cfbd9d',
    footprint: '#d9c5a1',
    outline: '#173554'
};

const SEA_Y = -0.12;
// The sun sits just above the sea, a little to the right of straight ahead
const SUN_DIR = new THREE.Vector3(0.3, 0.024, -1).normalize();
const SUN_ANGLE = Math.atan2(SUN_DIR.x, -SUN_DIR.z);
// The light it gives is lifted higher, so the shadows are long but not endless
const LIGHT_DIR = new THREE.Vector3(0.3, 0.36, -1).normalize();
const FOG_NEAR = 50, FOG_FAR = 420;

const color = hex => new THREE.Color(hex);
const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

// Small seeded random numbers, so the clouds and the footprints come out the same on every visit
function random(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// How far the waterline bends in or out along the beach (0 where we stand). The foam shader repeats it
const shoreBend = x => Math.sin(x * 0.07) * 1.2 + Math.sin(x * 0.16 + 1) * 0.5 - Math.sin(1) * 0.5;

// Height of the beach: it runs down into the sea in front of us and rises into low dunes behind
function sandHeight(x, z) {
    const zs = z - shoreBend(x) * smoothstep(4, -2, z);
    const slope = zs < 0 ? zs * 0.06 : zs * 0.012;
    const ripples = (Math.sin(x * 0.9 + z * 0.4) * 0.012 + Math.sin(x * 0.37 - z * 0.8) * 0.016) * smoothstep(-3, 1, z) + 0.004;
    const dunes = (Math.sin(x * 0.18) * 0.5 + Math.sin(x * 0.07 + 1.3) * 0.8 + 0.9) * smoothstep(7, 26, z);
    return slope + ripples + dunes;
}

// ----- Blocks: many small boxes merged into one mesh (one draw call), plus an outline hull -----
const OUTLINE = 0.009;
const blockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const outlineMaterial = new THREE.MeshBasicMaterial({ color: COLORS.outline, side: THREE.BackSide });

class Blocks {
    constructor() {
        this.solid = [];
        this.hull = [];
    }

    // A box of size w×h×d centred at (x, y, z); opts: { outline, rot: [x, y, z] }
    box(w, h, d, x, y, z, hex, opts = {}) {
        const matrix = transform(x, y, z, opts.rot);
        this.solid.push([new THREE.BoxGeometry(w, h, d), matrix, color(hex)]);
        if (opts.outline) this.hull.push([new THREE.BoxGeometry(w + OUTLINE * 2, h + OUTLINE * 2, d + OUTLINE * 2), matrix, null]);
        return this;
    }

    shape(geometry, x, y, z, hex, rot) {
        this.solid.push([geometry, transform(x, y, z, rot), color(hex)]);
        return this;
    }

    addTo(group, { shadow = true } = {}) {
        if (this.solid.length) {
            const mesh = new THREE.Mesh(merge(this.solid), blockMaterial);
            mesh.castShadow = shadow;
            group.add(mesh);
        }
        if (this.hull.length) group.add(new THREE.Mesh(merge(this.hull), outlineMaterial));
        return group;
    }
}

function transform(x, y, z, rot) {
    const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
    if (rot) matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    return matrix;
}

// Join [geometry, matrix, colour] parts into one geometry with the colours as vertex colours
function merge(parts) {
    const pieces = parts.map(([geometry, matrix, c]) => {
        const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        geometry.dispose();
        g.applyMatrix4(matrix);
        return [g, c];
    });
    const count = pieces.reduce((n, [g]) => n + g.attributes.position.count, 0);
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
    const colors = pieces[0][1] ? new Float32Array(count * 3) : null;
    let offset = 0;
    for (const [g, c] of pieces) {
        position.set(g.attributes.position.array, offset * 3);
        normal.set(g.attributes.normal.array, offset * 3);
        if (colors) for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], (offset + i) * 3);
        offset += g.attributes.position.count;
        g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return merged;
}

const shade = (hex, amount) => `#${color(hex).multiplyScalar(1 - amount).getHexString()}`;
const tint = (hex, amount) => `#${color(hex).lerp(color('#ffffff'), amount).getHexString()}`;

// ----- The two of us -----
// Built facing +z like the portfolio figures, then turned around to look out to sea.
// Looks taken from our photos: his short black textured crop with a fringe, white tee and navy shorts;
// her shoulder-length dark brown hair with a side fringe, round black glasses, and a light blue sundress.
const HIP_Y = 0.78, SHOULDER_Y = 1.47, NECK_Y = 1.55;
const HIPS_Y = 0.085, WAIST_Y = 0.295, CHEST_Y = 0.57, COLLAR_Y = 0.745;

const HIM = {
    female: false,
    chestW: 0.7, chestD: 0.4, waistW: 0.64, waistD: 0.37, hipsW: 0.66, hipsD: 0.38,
    shoulderHalf: 0.48, hipHalf: 0.17, armW: 0.22, legW: 0.25, headW: 0.52,
    skin: '#e9be96', skinShade: '#d6a67c',
    hair: '#1b1715', hairLight: '#332b26',
    top: '#f7f6f1', bottom: '#24375a'
};

const HER = {
    female: true,
    chestW: 0.58, chestD: 0.35, waistW: 0.46, waistD: 0.3, hipsW: 0.62, hipsD: 0.37,
    shoulderHalf: 0.365, hipHalf: 0.145, armW: 0.18, legW: 0.215, headW: 0.5,
    skin: '#f2d0b0', skinShade: '#dfb592',
    hair: '#35231a', hairLight: '#5a3b2a',
    top: '#8cc6e8', bottom: '#8cc6e8'
};

function buildPerson(P) {
    const outer = new THREE.Group();
    const root = new THREE.Group();
    const torso = new THREE.Group();
    const head = new THREE.Group();
    const legs = [1, -1].map(side => {
        const leg = new THREE.Group();
        leg.position.set(P.hipHalf * side, HIP_Y, 0);
        return leg;
    });
    // Arms pivot at the shoulders. The right hand is -x for a figure facing its own +z
    const armRight = new THREE.Group(), armLeft = new THREE.Group();
    armRight.position.set(-P.shoulderHalf, SHOULDER_Y - HIP_Y, 0);
    armLeft.position.set(P.shoulderHalf, SHOULDER_Y - HIP_Y, 0);
    torso.position.y = HIP_Y;
    head.position.y = NECK_Y - HIP_Y;
    outer.add(root);
    root.add(...legs, torso);
    torso.add(head, armRight, armLeft);

    legs.forEach((leg, i) => buildLeg(P, i === 0 ? 1 : -1).addTo(leg));
    buildTorso(P).addTo(torso);
    buildArm(P, true).addTo(armRight);
    buildArm(P, false).addTo(armLeft);
    buildHead(P).addTo(head);

    const person = { P, outer, root, torso, head, armRight, armLeft };

    if (P.female) {
        // Her skirt and the long part of her hair hang from their own pivots so the sea breeze can move them
        const skirt = new THREE.Group();
        skirt.position.y = HIPS_Y - 0.02;
        buildSkirt(P).addTo(skirt);
        torso.add(skirt);
        const hairFlow = new THREE.Group();
        hairFlow.position.set(0, 0.5, -0.05);
        buildHairFlow(P).addTo(hairFlow);
        head.add(hairFlow);
        // Glass in the round frames: see-through, so it stays out of the merged blocks
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.068, 20),
            new THREE.MeshStandardMaterial({ color: '#dbeaf6', transparent: true, opacity: 0.22, roughness: 0.1 }));
        [1, -1].forEach(side => {
            const l = lens.clone();
            l.position.set(0.118 * side, 0.31, P.headW / 2 + 0.024);
            head.add(l);
        });
        Object.assign(person, { skirt, hairFlow });
    }
    return person;
}

function buildLeg(P, side) {
    const b = new Blocks(), w = P.legW;
    if (P.female) {
        b.box(w, 0.3, w + 0.02, 0, -0.15, 0, P.skin, { outline: true });
    } else {
        // Shorts, with a white stripe down the outside
        b.box(w + 0.02, 0.3, w + 0.05, 0, -0.13, 0, P.bottom, { outline: true });
        b.box(w + 0.034, 0.05, w + 0.064, 0, -0.27, 0, shade(P.bottom, 0.22));
        b.box(0.02, 0.22, w + 0.056, (w / 2 + 0.012) * side, -0.14, 0, '#e8eef5');
    }
    b.box(w - 0.03, 0.07, w + 0.02, 0, -0.32, 0.005, P.skinShade);
    b.box(w - 0.035, 0.34, w - 0.005, 0, -0.5, 0, P.skin, { outline: true });
    b.box(w - 0.07, 0.16, w - 0.06, 0, -0.48, -0.045, P.skinShade);
    // Bare feet on the sand
    b.box(w + 0.005, 0.09, w + 0.1, 0, -0.735, 0.045, P.skin, { outline: true });
    b.box(w + 0.009, 0.035, 0.05, 0, -0.755, 0.045 + (w + 0.1) / 2 - 0.02, P.skinShade);
    return b;
}

function buildTorso(P) {
    const b = new Blocks();
    if (P.female) {
        // Sundress: fitted top with a ribbon at the waist, thin straps, a small gold necklace
        b.box(P.hipsW, 0.17, P.hipsD, 0, HIPS_Y, 0, P.top, { outline: true });
        b.box(P.waistW, 0.29, P.waistD, 0, WAIST_Y, 0, P.top, { outline: true });
        b.box(P.waistW + 0.016, 0.05, P.waistD + 0.016, 0, WAIST_Y - 0.06, 0, '#ffffff');
        b.box(P.chestW, 0.24, P.chestD, 0, CHEST_Y - 0.03, 0, P.top, { outline: true });
        b.box(P.chestW - 0.06, 0.1, P.chestD - 0.06, 0, CHEST_Y + 0.13, 0, P.skin, { outline: true });
        [1, -1].forEach(side => b.box(0.05, 0.1, P.chestD - 0.04, (P.chestW / 2 - 0.1) * side, CHEST_Y + 0.13, 0, shade(P.top, 0.12)));
        b.box(0.17, 0.014, 0.012, 0, CHEST_Y + 0.15, P.chestD / 2 - 0.024, '#e9c46a');
        b.box(0.03, 0.03, 0.012, 0, CHEST_Y + 0.125, P.chestD / 2 - 0.022, '#f2d38a', { rot: [0, 0, Math.PI / 4] });
        b.box(0.16, 0.06, 0.15, 0, COLLAR_Y - 0.02, 0, P.skinShade);
    } else {
        // White T-shirt over navy shorts
        b.box(P.hipsW, 0.17, P.hipsD, 0, HIPS_Y, 0, P.bottom, { outline: true });
        b.box(P.waistW, 0.29, P.waistD, 0, WAIST_Y, 0, P.top, { outline: true });
        b.box(P.waistW + 0.016, 0.05, P.waistD + 0.016, 0, WAIST_Y - 0.12, 0, shade(P.top, 0.06));
        b.box(P.chestW, 0.3, P.chestD, 0, CHEST_Y, 0, P.top, { outline: true });
        [1, -1].forEach(side => b.box(0.03, 0.26, P.chestD + 0.006, (P.chestW / 2 - 0.02) * side, CHEST_Y - 0.02, 0, shade(P.top, 0.08)));
        b.box(0.34, 0.05, 0.3, 0, COLLAR_Y, 0, shade(P.top, 0.1));
        b.box(0.2, 0.06, 0.2, 0, COLLAR_Y + 0.02, 0, P.skinShade);
    }
    return b;
}

function buildSkirt(P) {
    const b = new Blocks(), w = P.hipsW, d = P.hipsD;
    b.box(w + 0.05, 0.2, d + 0.05, 0, -0.08, 0, P.top, { outline: true });
    b.box(w + 0.16, 0.2, d + 0.16, 0, -0.26, 0, P.top, { outline: true });
    b.box(w + 0.18, 0.035, d + 0.18, 0, -0.37, 0, '#ffffff');
    // Pleats, front and back
    [-0.24, -0.08, 0.08, 0.24].forEach(x => [1, -1].forEach(face =>
        b.box(0.05, 0.19, 0.01, x, -0.26, ((d + 0.16) / 2 + 0.004) * face, tint(P.top, 0.3))));
    return b;
}

function buildArm(P, holding) {
    const b = new Blocks(), w = P.armW;
    if (P.female) {
        b.box(w + 0.04, 0.12, w + 0.04, 0, -0.03, 0, P.skin);
        b.box(w, 0.3, w, 0, -0.2, 0, P.skin, { outline: true });
    } else {
        // Short T-shirt sleeve
        b.box(w + 0.06, 0.2, w + 0.06, 0, -0.06, 0, P.top, { outline: true });
        b.box(w + 0.07, 0.035, w + 0.07, 0, -0.16, 0, shade(P.top, 0.08));
        b.box(w, 0.18, w, 0, -0.25, 0, P.skin, { outline: true });
    }
    b.box(w - 0.025, 0.06, w - 0.025, 0, -0.355, 0, P.skinShade);
    b.box(w - 0.03, 0.25, w - 0.03, 0, -0.49, 0, P.skin, { outline: true });
    if (!holding) {
        // A watch on his free wrist, a white bracelet on hers
        b.box(w - 0.012, 0.045, w - 0.012, 0, -0.6, 0, P.female ? '#ffffff' : '#2b2b2f');
    }
    b.box(w - 0.035, 0.14, w + 0.015, 0, -0.69, 0.01, P.skin);
    b.box(w - 0.11, 0.05, 0.05, 0, -0.655, 0.075, P.skinShade);
    return b;
}

function buildHead(P) {
    const b = new Blocks(), hw = P.headW, face = hw / 2;
    b.box(P.female ? 0.16 : 0.2, 0.14, P.female ? 0.16 : 0.2, 0, 0.01, 0, P.skinShade);
    b.box(hw, hw, hw, 0, 0.3, 0, P.skin, { outline: true });
    b.box(P.female ? hw - 0.16 : hw - 0.06, 0.07, P.female ? hw - 0.13 : hw - 0.05, 0, 0.055, 0.01, P.female ? P.skin : P.skinShade);
    [1, -1].forEach(side => b.box(0.055, 0.13, 0.11, (hw / 2 + 0.02) * side, 0.29, -0.02, P.skinShade));
    // Face: eyes with a glint, brows, a small smile
    [1, -1].forEach(side => {
        b.box(0.06, 0.07, 0.02, 0.115 * side, 0.3, face + 0.004, '#2a211c');
        b.box(0.022, 0.022, 0.01, 0.115 * side + 0.014, 0.318, face + 0.014, '#ffffff');
        b.box(0.1, 0.022, 0.02, 0.115 * side, P.female ? 0.4 : 0.395, face + 0.004, P.hair);
    });
    b.box(0.1, 0.022, 0.016, 0, 0.165, face + 0.004, '#c46d65');
    if (P.female) {
        [1, -1].forEach(side => b.box(0.07, 0.035, 0.01, 0.17 * side, 0.215, face + 0.004, '#f3a5a9'));
        buildGlasses(b, face);
        // Crown and a side-swept fringe parted on her right
        b.box(hw + 0.05, 0.13, hw + 0.06, 0, 0.52, -0.01, P.hair, { outline: true });
        b.box(0.34, 0.12, 0.08, 0.07, 0.47, face - 0.01, P.hair, { rot: [0, 0, -0.18] });
        b.box(0.13, 0.08, 0.08, -0.19, 0.49, face - 0.01, P.hairLight);
        b.box(0.07, 0.3, 0.12, -(hw / 2 + 0.03), 0.38, face - 0.08, P.hair);
        b.box(0.07, 0.3, 0.12, hw / 2 + 0.03, 0.38, face - 0.08, P.hair);
    } else {
        // Short textured crop: a fringe that falls onto the forehead, short sides, a few tufts on top
        b.box(hw + 0.04, 0.12, hw + 0.04, 0, 0.53, 0, P.hair, { outline: true });
        b.box(hw + 0.02, 0.08, 0.08, 0, 0.5, face - 0.02, P.hair);
        b.box(0.16, 0.1, 0.06, -0.15, 0.44, face, P.hair);
        b.box(0.18, 0.12, 0.06, 0.01, 0.43, face + 0.004, P.hair);
        b.box(0.14, 0.08, 0.06, 0.16, 0.45, face, P.hairLight);
        // Sides cut short above the ears, the back tapering down to the nape
        [1, -1].forEach(side => {
            b.box(0.035, 0.15, hw - 0.06, (hw / 2 + 0.015) * side, 0.45, -0.01, P.hair);
            b.box(0.03, 0.2, 0.2, (hw / 2 + 0.013) * side, 0.36, -0.15, P.hair);
        });
        b.box(hw + 0.02, 0.36, 0.06, 0, 0.36, -(hw / 2 + 0.02), P.hair, { outline: true });
        b.box(hw - 0.08, 0.08, 0.05, 0, 0.15, -(hw / 2 + 0.015), shade(P.hair, -0.4));
        [[-0.12, 0.08, 0.3], [0.08, -0.06, -0.25], [0.16, 0.12, 0.2], [-0.04, -0.15, -0.15]].forEach(([x, z, r]) =>
            b.box(0.13, 0.06, 0.12, x, 0.6, z, P.hairLight, { rot: [r * 0.5, r, r] }));
    }
    return b;
}

// Round black frames like hers, with arms running back to the ears
function buildGlasses(b, face) {
    const frame = '#1c1c22';
    [1, -1].forEach(side => {
        b.shape(new THREE.TorusGeometry(0.075, 0.011, 6, 22), 0.118 * side, 0.31, face + 0.024, frame);
        b.box(0.014, 0.014, 0.25, (0.25 + 0.006) * side, 0.33, face - 0.1, frame);
    });
    b.box(0.07, 0.014, 0.014, 0, 0.325, face + 0.024, frame);
}

// Her hair below the crown: the back and the sides down to her shoulders, with a few lighter strands
function buildHairFlow(P) {
    const b = new Blocks(), hw = P.headW;
    b.box(hw + 0.07, 0.6, 0.1, 0, -0.26, -hw / 2, P.hair, { outline: true });
    b.box(hw - 0.02, 0.54, 0.06, 0, -0.25, -hw / 2 + 0.06, shade(P.hair, 0.25));
    [1, -1].forEach(side => {
        b.box(0.075, 0.5, hw - 0.12, (hw / 2 + 0.04) * side, -0.27, 0.0, P.hair, { outline: true });
        b.box(0.09, 0.08, hw - 0.16, (hw / 2 + 0.05) * side, -0.53, -0.02, shade(P.hair, 0.2));
    });
    [-0.15, 0.02, 0.17].forEach((x, i) => b.box(0.05, 0.42 - i * 0.06, 0.012, x, -0.25, -hw / 2 - 0.054, P.hairLight));
    b.box(hw + 0.09, 0.07, 0.12, 0, -0.56, -hw / 2 + 0.01, shade(P.hair, 0.2));
    return b;
}

// ----- Heart shape for the little hearts that float up -----
function heartGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0.25, 0.25);
    s.bezierCurveTo(0.25, 0.25, 0.2, 0, 0, 0);
    s.bezierCurveTo(-0.3, 0, -0.3, 0.35, -0.3, 0.35);
    s.bezierCurveTo(-0.3, 0.55, -0.1, 0.77, 0.25, 0.95);
    s.bezierCurveTo(0.6, 0.77, 0.8, 0.55, 0.8, 0.35);
    s.bezierCurveTo(0.8, 0.35, 0.8, 0, 0.5, 0);
    s.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
    g.center();
    g.rotateZ(Math.PI);
    g.scale(0.22, 0.22, 0.22);
    return g;
}

// ----- Beach props -----
function palmTree(x, z, height, lean, seed) {
    const tree = new THREE.Group();
    tree.position.set(x, sandHeight(x, z) - 0.05, z);
    const trunk = new Blocks();
    const segments = Math.round(height / 0.42);
    let top = new THREE.Vector3();
    for (let i = 0; i < segments; i++) {
        const t = i / segments, size = 0.36 - t * 0.1;
        const px = lean * t * t * height * 0.35;
        trunk.box(size, 0.44, size, px, i * 0.42 + 0.22, 0, i % 2 ? '#9c7853' : '#876440', { outline: true, rot: [0, 0, -lean * t * 0.5] });
        top.set(px, i * 0.42 + 0.44, 0);
    }
    trunk.addTo(tree);
    const crown = new THREE.Group();
    crown.position.copy(top);
    const leaves = new Blocks();
    for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + seed;
        for (let j = 0; j < 5; j++) {
            const r = 0.3 + j * 0.36, droop = j * j * 0.06;
            leaves.box(0.42, 0.05, 0.2 - j * 0.025, Math.cos(a) * r, -droop + 0.05, Math.sin(a) * r,
                j > 2 ? '#5aa982' : k % 2 ? '#3f8f6c' : '#337c5d', { rot: [0, -a, -0.1 - j * 0.16] });
        }
    }
    [[0.12, 0.08], [-0.1, 0.1], [0.02, -0.13]].forEach(([cx, cz]) => leaves.box(0.14, 0.14, 0.14, cx, -0.12, cz, '#6b4a2b'));
    leaves.addTo(crown);
    tree.add(crown);
    return { tree, crown, seed };
}

// Long thin bands low over the sea, lit peach from below by the setting sun
function cloudBand(x, y, z, length, seed) {
    const rand = random(seed);
    const b = new Blocks();
    ['#ffcdb9', '#fbd9df', '#fff0ec', '#ffffff'].slice(0, 3 + Math.floor(rand() * 2)).forEach((hex, i) =>
        b.box(length * (0.45 + rand() * 0.55), 1.4 + rand() * 1.6, 10, (rand() - 0.5) * length * 0.35, i * 2.1, rand() * 6, hex));
    return cloudMesh(b, x, y, z, 0.85);
}

// A few heaped clouds higher up, stepped like the blocks they are made of
function cloudHeap(x, y, z, scale, seed) {
    const rand = random(seed);
    const b = new Blocks();
    ['#ffe0d2', '#eef5fc', '#ffffff'].forEach((hex, layer) => {
        const count = 4 - layer;
        for (let i = 0; i < count; i++) {
            const w = (9 + rand() * 5) * scale;
            b.box(w, 4 * scale, (7 + rand() * 4) * scale, (i - (count - 1) / 2) * 8 * scale + (rand() - 0.5) * 3 * scale, layer * 3.6 * scale, rand() * 3, hex);
        }
    });
    return cloudMesh(b, x, y, z, 0.95);
}

function cloudMesh(b, x, y, z, opacity) {
    const mesh = new THREE.Mesh(merge(b.solid), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity }));
    mesh.position.set(x, y, z);
    return mesh;
}

function seagull() {
    const bird = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: '#3d6e90', fog: false });
    bird.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.22), material));
    const wings = [1, -1].map(side => {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.04, 0);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 1.0), material);
        wing.position.z = 0.5 * side;
        pivot.add(wing);
        bird.add(pivot);
        return { pivot, side };
    });
    return { bird, wings };
}

// ----- Sky, sea, foam -----
const GLSL_NOISE = `
    float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
    float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }`;

const WORLD_VERTEX = `
    varying vec3 vWorld;
    void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
    }`;

function skyMaterial() {
    return new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
            sunDir: { value: SUN_DIR },
            top: { value: color(COLORS.skyTop) }, mid: { value: color(COLORS.skyMid) }, horizon: { value: color(COLORS.horizon) },
            band: { value: color(COLORS.sunBand) }, glow: { value: color(COLORS.sunGlow) }, sun: { value: color(COLORS.sun) }
        },
        vertexShader: WORLD_VERTEX,
        fragmentShader: `
            uniform vec3 sunDir, top, mid, horizon, band, glow, sun;
            varying vec3 vWorld;
            void main() {
                vec3 d = normalize(vWorld - cameraPosition);
                float h = max(d.y, 0.0);
                vec3 col = mix(horizon, mid, smoothstep(0.0, 0.12, h));
                col = mix(col, top, smoothstep(0.1, 0.45, h));
                float s = max(dot(d, sunDir), 0.0);
                float towardSun = max(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz)), 0.0);
                float low = 1.0 - smoothstep(0.0, 0.12, h);
                col = mix(col, band, low * (0.18 + 0.6 * pow(towardSun, 5.0)));
                col = mix(col, glow, pow(s, 14.0) * (1.0 - smoothstep(0.0, 0.45, h)));
                col += sun * (pow(s, 700.0) * 0.9 + smoothstep(0.99915, 0.9994, s) * 1.4);
                gl_FragColor = vec4(col, 1.0);
                #include <colorspace_fragment>
            }`
    });
}

function seaMaterial() {
    return new THREE.ShaderMaterial({
        toneMapped: false,
        uniforms: {
            time: { value: 0 }, sunDir: { value: SUN_DIR },
            deep: { value: color(COLORS.seaDeep) }, shallow: { value: color(COLORS.seaShallow) },
            skyRef: { value: color(COLORS.seaSky) }, horizon: { value: color(COLORS.horizon) }, glint: { value: color(COLORS.glint) },
            fogRange: { value: new THREE.Vector2(FOG_NEAR, FOG_FAR) }
        },
        vertexShader: WORLD_VERTEX,
        fragmentShader: `
            uniform float time;
            uniform vec3 sunDir, deep, shallow, skyRef, horizon, glint;
            uniform vec2 fogRange;
            varying vec3 vWorld;
            ${GLSL_NOISE}
            float waves(vec2 p) {
                return noise(p * 0.5 + vec2(time * 0.15, time * 0.3)) * 0.6
                     + noise(p * 1.4 - vec2(time * 0.35, time * 0.12)) * 0.3
                     + noise(p * 3.3 + vec2(0.0, time * 0.6)) * 0.1;
            }
            void main() {
                vec3 toCam = cameraPosition - vWorld;
                float dist = length(toCam);
                vec3 V = toCam / dist;
                vec2 p = vWorld.xz;
                // Sample further apart in the distance so far-off ripples don't flicker
                float e = 0.08 + dist * 0.004;
                float h0 = waves(p), hx = waves(p + vec2(e, 0.0)), hz = waves(p + vec2(0.0, e));
                vec3 N = normalize(vec3((h0 - hx) / e * 0.55, 1.0, (h0 - hz) / e * 0.55));
                float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
                vec3 col = mix(shallow, deep, smoothstep(-1.5, -30.0, vWorld.z));
                col = mix(col, skyRef, clamp(fres, 0.0, 0.75));
                // The sun's path on the water, broken up by the ripples
                vec3 R = reflect(-V, N);
                col += glint * pow(max(dot(R, sunDir), 0.0), 220.0) * 2.4;
                col = mix(col, horizon, smoothstep(fogRange.x, fogRange.y, dist));
                gl_FragColor = vec4(col, 1.0);
                #include <colorspace_fragment>
            }`
    });
}

// The wash of each wave up the sand: a thin sheet of water with a foam edge that runs up and slides back
function foamMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: { time: { value: 0 }, foam: { value: color(COLORS.foam) }, water: { value: color(COLORS.sheet) } },
        vertexShader: WORLD_VERTEX,
        fragmentShader: `
            uniform float time;
            uniform vec3 foam, water;
            varying vec3 vWorld;
            void main() {
                float x = vWorld.x, z = vWorld.z;
                float bend = sin(x * 0.07) * 1.2 + sin(x * 0.16 + 1.0) * 0.5 - sin(1.0) * 0.5;
                float reach = 0.5 + 0.5 * sin(time * 0.55);
                float edge = -2.0 + bend + 0.9 * reach + 0.12 * sin(x * 1.3 + time * 0.8) + 0.06 * sin(x * 3.1 - time * 1.4);
                if (z > edge) discard;
                float band = 1.0 - smoothstep(0.0, 0.16 + 0.1 * reach, edge - z);
                float alpha = mix(0.4, 0.95, band) * smoothstep(-2.3, -2.0, z - bend);
                gl_FragColor = vec4(mix(water, foam, band), alpha);
                #include <colorspace_fragment>
            }`
    });
}

function start() {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
        return; // no WebGL here: the painted sky behind the title stays
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(COLORS.horizon);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLORS.horizon, FOG_NEAR, FOG_FAR);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 2000);

    // Light: warm low sun from across the sea, a cool fill from our side, sky and sand bounce
    scene.add(new THREE.HemisphereLight('#c4e2f5', '#f3e2c4', 2.0));
    const sunLight = new THREE.DirectionalLight('#ffd9bd', 2.8);
    sunLight.position.copy(LIGHT_DIR).multiplyScalar(30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    Object.assign(sunLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 70 });
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight, sunLight.target);
    const fill = new THREE.DirectionalLight('#e4f0fb', 1.7);
    fill.position.set(-2, 4, 9);
    scene.add(fill);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial());
    sky.renderOrder = -1;
    scene.add(sky);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 800).rotateX(-Math.PI / 2), seaMaterial());
    sea.position.set(0, SEA_Y, -399);
    scene.add(sea);

    // Sand: wet and darker where the waves reach, with a little grain. The grid is fine around us and
    // stretched out further away, so the beach reaches the fog in every direction without a visible edge
    const sandGeometry = new THREE.PlaneGeometry(240, 140, 240, 140).rotateX(-Math.PI / 2).translate(0, 0, 58);
    const pos = sandGeometry.attributes.position;
    const sandColors = new Float32Array(pos.count * 3);
    const dry = color(COLORS.sandDry), wet = color(COLORS.sandWet), grainRand = random(7), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        const gx = pos.getX(i), gz = pos.getZ(i);
        const x = gx * (1 + (gx / 45) ** 2);
        const z = gz > 20 ? 20 + (gz - 20) * (1 + ((gz - 20) / 40) ** 2) : gz;
        pos.setXYZ(i, x, sandHeight(x, z), z);
        c.copy(dry).lerp(wet, smoothstep(-0.6, -1.3, z - shoreBend(x))).multiplyScalar(0.97 + grainRand() * 0.05);
        sandColors.set([c.r, c.g, c.b], i * 3);
    }
    sandGeometry.setAttribute('color', new THREE.BufferAttribute(sandColors, 3));
    sandGeometry.computeVertexNormals();
    const sand = new THREE.Mesh(sandGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    sand.receiveShadow = true;
    scene.add(sand);

    const foamGeometry = new THREE.PlaneGeometry(200, 1.8, 400, 6).rotateX(-Math.PI / 2).translate(0, 0, -1.6);
    const fpos = foamGeometry.attributes.position;
    for (let i = 0; i < fpos.count; i++) {
        const x = fpos.getX(i), z = fpos.getZ(i) + shoreBend(fpos.getX(i));
        fpos.setXYZ(i, x, sandHeight(x, z) + 0.02, z);
    }
    const foam = new THREE.Mesh(foamGeometry, foamMaterial());
    scene.add(foam);

    // Us: him on the left, her on the right (seen from behind), turned a little toward each other
    const him = buildPerson(HIM), her = buildPerson(HER);
    him.outer.position.set(-0.66, sandHeight(-0.66, 0) - 0.02, 0);
    him.outer.rotation.y = Math.PI - 0.12;
    her.outer.position.set(0.62, sandHeight(0.62, 0) - 0.02, 0);
    her.outer.rotation.y = Math.PI + 0.12;
    her.outer.scale.setScalar(0.93);
    scene.add(him.outer, her.outer);

    // Point his right arm and her left arm at the same spot between us, so the hands meet
    scene.updateMatrixWorld(true);
    const shoulderR = him.armRight.getWorldPosition(new THREE.Vector3());
    const shoulderL = her.armLeft.getWorldPosition(new THREE.Vector3());
    const handsMeet = shoulderR.clone().lerp(shoulderL, 0.5).setY(0.79).add(new THREE.Vector3(0, 0, -0.06));
    const down = new THREE.Vector3(0, -1, 0);
    for (const arm of [him.armRight, her.armLeft]) {
        const target = arm.parent.worldToLocal(handsMeet.clone()).sub(arm.position).normalize();
        arm.userData.base = new THREE.Quaternion().setFromUnitVectors(down, target);
        arm.quaternion.copy(arm.userData.base);
    }
    him.armLeft.rotation.z = 0.07;
    her.armRight.rotation.z = -0.07;

    // Our footprints, walking up the beach to where we stand
    const prints = [];
    for (const [person, stride, startX] of [[him, 0.48, -0.66], [her, 0.42, 0.62]]) {
        for (let z = 1.0, i = 0; z < 16; z += stride, i++) {
            const x = startX + Math.sin(z * 0.3) * 0.5 * (z / 16) + (i % 2 ? 0.12 : -0.12) * (person === her ? 0.9 : 1);
            prints.push([x, z, Math.sin(z * 0.3) * 0.2]);
        }
    }
    const printGeometry = new THREE.CircleGeometry(0.07, 12).rotateX(-Math.PI / 2).scale(0.8, 1, 1.5);
    const printMaterial = new THREE.MeshStandardMaterial({ color: COLORS.footprint, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const footprints = new THREE.InstancedMesh(printGeometry, printMaterial, prints.length);
    const m = new THREE.Matrix4();
    prints.forEach(([x, z, r], i) => footprints.setMatrixAt(i, m.makeRotationY(r).setPosition(x, sandHeight(x, z) + 0.004, z)));
    footprints.receiveShadow = true;
    scene.add(footprints);

    // Shells and a starfish by the water
    const shells = new Blocks();
    const star = (x, z, rot) => {
        const y = sandHeight(x, z) + 0.02;
        for (let k = 0; k < 5; k++) {
            const a = rot + (k / 5) * Math.PI * 2;
            shells.box(0.2, 0.03, 0.06, x + Math.cos(a) * 0.09, y, z + Math.sin(a) * 0.09, '#f2896d', { rot: [0, -a, 0] });
        }
    };
    star(1.9, -0.3, 0.4);
    star(-3.2, 1.8, 1.1);
    [[1.2, 0.6, '#fbe4ec'], [-1.6, -0.2, '#fff4e6'], [2.6, 1.4, '#fbe4ec'], [-2.4, 0.9, '#f9e7d2']].forEach(([x, z, hex]) =>
        shells.box(0.1, 0.04, 0.12, x, sandHeight(x, z) + 0.02, z, hex, { rot: [0, x, 0] }));
    shells.addTo(scene, { shadow: false });

    const palms = [palmTree(-5.6, 2.6, 4.4, -1.0, 0.3), palmTree(-8.8, 9, 5.2, -0.6, 1.1), palmTree(7.6, 6.5, 4.8, 0.9, 2.2), palmTree(10.5, 13, 5.6, 0.5, 0.7)];
    palms.forEach(p => {
        p.tree.traverse(o => { if (o.isMesh) o.castShadow = true; });
        scene.add(p.tree);
    });

    const clouds = [
        cloudBand(40, 12, -350, 140, 1), cloudBand(190, 20, -380, 110, 2), cloudBand(-120, 16, -340, 120, 3), cloudBand(100, 32, -420, 160, 4),
        cloudHeap(-180, 65, -300, 1.5, 5), cloudHeap(320, 75, -240, 1.8, 6), cloudHeap(-300, 55, 160, 1.6, 7), cloudHeap(260, 65, 220, 1.8, 8)
    ];
    clouds.forEach(cl => scene.add(cl));

    const gulls = [0, 1, 2].map(i => {
        const g = seagull();
        g.bird.scale.setScalar(1.3 - i * 0.2);
        scene.add(g.bird);
        return { ...g, offset: i * 9, height: 13 + i * 2.5, depth: -55 - i * 12 };
    });

    // Hearts that float up from our hands now and then (and when the scene is tapped)
    const heartShape = heartGeometry();
    const hearts = [];
    function spawnHeart(from, delay = 0) {
        const material = new THREE.MeshStandardMaterial({ color: '#ff6f91', emissive: '#ff3e6c', emissiveIntensity: 0.45, roughness: 0.35, transparent: true });
        const heart = new THREE.Mesh(heartShape, material);
        heart.position.copy(from);
        heart.scale.setScalar(0.001);
        scene.add(heart);
        hearts.push({ heart, born: clock + delay, drift: (Math.random() - 0.5) * 0.6, spin: (Math.random() - 0.5) * 2, from: from.clone() });
    }
    function updateHearts() {
        for (let i = hearts.length - 1; i >= 0; i--) {
            const h = hearts[i], age = clock - h.born;
            if (age < 0) continue;
            const life = 2.8, t = age / life;
            if (t >= 1) {
                scene.remove(h.heart);
                h.heart.material.dispose();
                hearts.splice(i, 1);
                continue;
            }
            h.heart.position.set(h.from.x + Math.sin(age * 3) * 0.08 + h.drift * t, h.from.y + easeOut(t) * 1.15, h.from.z);
            h.heart.rotation.y = h.spin * age;
            h.heart.scale.setScalar(Math.min(age / 0.3, 1) * (0.85 - t * 0.3));
            h.heart.material.opacity = 1 - smoothstep(0.6, 1, t);
        }
    }

    // ----- Camera: settles in from above on arrival, then drifts slowly; drag to look around -----
    const target = new THREE.Vector3(0, 1.2, -0.3);
    let width = 1, height = 1, dist = 6.3;
    let userYaw = 0, yawVelocity = 0;
    let flight = null;
    function resize() {
        width = host.clientWidth || window.innerWidth;
        height = host.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // Keep both of us in view on narrow (portrait) screens by stepping back
        const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
        dist = Math.max(6.3, 2.1 / Math.tan(halfWidth));
        camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    let dragging = null;
    intro.addEventListener('pointerdown', onPointerDown);
    function onPointerDown(e) {
        if (e.target.closest('button') || flight) return;
        dragging = { x: e.clientX, start: e.clientX, y: e.clientY, moved: 0, last: performance.now() };
        intro.setPointerCapture(e.pointerId);
        intro.addEventListener('pointermove', onPointerMove);
        intro.addEventListener('pointerup', onPointerUp, { once: true });
        intro.addEventListener('pointercancel', onPointerUp, { once: true });
    }
    function onPointerMove(e) {
        const dx = e.clientX - dragging.x;
        dragging.moved += Math.abs(dx) + Math.abs(e.clientY - dragging.y);
        dragging.x = e.clientX;
        dragging.y = e.clientY;
        const delta = -dx * 0.006;
        userYaw = THREE.MathUtils.clamp(userYaw + delta, -3.0, 2.2);
        yawVelocity = delta;
    }
    function onPointerUp() {
        intro.removeEventListener('pointermove', onPointerMove);
        // A tap rather than a drag sends up a few hearts
        if (dragging && dragging.moved < 8) for (let i = 0; i < 4; i++) spawnHeart(handsMeet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, 0)), i * 0.15);
        dragging = null;
    }

    const startTime = performance.now();
    let clock = 0, lastHeartCycle = -1, frameId = 0, drawn = false;
    const lookAt = new THREE.Vector3();
    const swingAxis = new THREE.Vector3(1, 0, 0), swing = new THREE.Quaternion();
    const partnerHead = new THREE.Vector3();

    function lookToward(person, other, amount) {
        other.head.getWorldPosition(partnerHead);
        const local = person.torso.worldToLocal(partnerHead).sub(person.head.position);
        const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.9, 0.9);
        person.head.rotation.y = yaw * amount;
        person.head.rotation.z = (person.P.female ? -0.14 : -0.05) * Math.sign(yaw) * amount;
    }

    function animatePeople(t) {
        for (const [person, seed] of [[him, 0], [her, 1.7]]) {
            person.root.position.y = Math.sin(t * 1.6 + seed) * 0.005;
            person.torso.rotation.z = Math.sin(t * 0.9 + seed) * 0.012;
        }
        // Our joined hands swing a little
        swing.setFromAxisAngle(swingAxis, Math.sin(t * 1.1) * 0.05);
        for (const arm of [him.armRight, her.armLeft]) arm.quaternion.copy(swing).multiply(arm.userData.base);
        him.armLeft.rotation.x = Math.sin(t * 1.1 + 2) * 0.04;
        her.armRight.rotation.x = Math.sin(t * 1.1 + 2.4) * 0.04;
        // Every nine seconds we turn to look at each other for a moment, and a heart floats up
        const cycle = t % 9;
        const look = smoothstep(3.6, 4.4, cycle) * (1 - smoothstep(6.6, 7.4, cycle));
        lookToward(him, her, look);
        lookToward(her, him, look);
        const cycleIndex = Math.floor(t / 9);
        if (cycle > 4.3 && cycleIndex !== lastHeartCycle) {
            lastHeartCycle = cycleIndex;
            spawnHeart(handsMeet.clone().add(new THREE.Vector3(0, 0.25, 0)));
            spawnHeart(handsMeet.clone().add(new THREE.Vector3(0.1, 0.6, 0.05)), 0.35);
        }
        // Sea breeze in her hair and her dress
        her.hairFlow.rotation.x = 0.1 + Math.sin(t * 1.3) * 0.04 + Math.sin(t * 2.9) * 0.02;
        her.hairFlow.rotation.z = Math.sin(t * 0.8) * 0.03;
        her.skirt.rotation.x = 0.05 + Math.sin(t * 1.7) * 0.025;
        her.skirt.rotation.z = Math.sin(t * 1.1) * 0.02;
    }

    function placeCamera(t) {
        if (!dragging) {
            userYaw = THREE.MathUtils.clamp(userYaw + yawVelocity, -3.0, 2.2);
            yawVelocity *= 0.92;
        }
        // Straight behind us the sun sets in the gap between us; the drift swings it slowly from side to side
        const arrive = easeInOut(Math.min(t / 3.2, 1));
        const yaw = -SUN_ANGLE + Math.sin(t * 0.13) * 0.15 + userYaw + (1 - arrive) * 0.9;
        const d = dist * (1 + (1 - arrive) * 1.4);
        const rise = d * 0.11 + (1 - arrive) * 5;
        camera.position.set(target.x + Math.sin(yaw) * d, target.y + rise, target.z + Math.cos(yaw) * d);
        lookAt.copy(target).add(new THREE.Vector3(0, 0.2, 0));
        if (flight) {
            // Off over our heads toward the sun
            const f = easeInOut(Math.min((performance.now() - flight.start) / 1600, 1));
            camera.position.lerpVectors(flight.from, flight.to, f);
            lookAt.lerpVectors(flight.lookFrom, flight.lookTo, f);
        }
        camera.lookAt(lookAt);
    }

    function frame() {
        frameId = requestAnimationFrame(frame);
        clock = (performance.now() - startTime) / 1000;
        sea.material.uniforms.time.value = clock;
        foam.material.uniforms.time.value = clock;
        animatePeople(clock);
        updateHearts();
        palms.forEach(p => { p.crown.rotation.z = Math.sin(clock * 0.9 + p.seed) * 0.05; p.crown.rotation.x = Math.sin(clock * 0.7 + p.seed) * 0.03; });
        clouds.forEach((cl, i) => { cl.position.x += 0.02 * (i % 2 ? 1 : -1); });
        gulls.forEach(g => {
            const s = (clock * 3 + g.offset * 10) % 200;
            g.bird.position.set(-100 + s, g.height + Math.sin(clock * 0.8 + g.offset) * 1.2, g.depth);
            g.wings.forEach(w => { w.pivot.rotation.x = w.side * (0.35 + Math.sin(clock * 5 + g.offset) * 0.45); });
        });
        placeCamera(clock);
        renderer.render(scene, camera);
        if (!drawn) {
            drawn = true;
            requestAnimationFrame(() => intro.classList.add('drawn'));
        }
    }
    frame();

    window.openingScene = {
        flyAway() {
            flight = {
                start: performance.now(),
                from: camera.position.clone(),
                to: new THREE.Vector3(SUN_DIR.x * 6, 3.4, -16),
                lookFrom: lookAt.clone(),
                lookTo: new THREE.Vector3(SUN_DIR.x * 200, 4, -200)
            };
        },
        dispose() {
            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            intro.removeEventListener('pointerdown', onPointerDown);
            scene.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
            delete window.openingScene;
        }
    };
}

if (intro && host && !intro.classList.contains('leaving')) start();

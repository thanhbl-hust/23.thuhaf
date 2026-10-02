// ===== OPENING SCENE =====
// A floating island built entirely from blocks, like a voxel diorama, with the two of us holding hands on
// its beach at sunset: a bay with a jetty and a boat that spills over the edge as a waterfall, palms,
// umbrellas and loungers on the sand, a cottage with a garden, a campfire, a swing, pines on a hill and a
// lighthouse on the rocks, with smaller islands, a hot-air balloon, clouds and gulls around it.
// The camera always looks at the two of us: drag to turn it round or up and down, scroll or pinch to zoom.
// The figures follow the blocky style of the portfolio's pickleball scene.
// script.js owns the overlay and its button; this file only draws behind them. If it can't run (no WebGL,
// the file didn't load) the overlay keeps its painted sky and still works.
import * as THREE from './vendor/three/three.module.min.js';

const intro = document.getElementById('intro');
const host = document.getElementById('introScene');

// --- Colours: the site's blues, with the sunset kept to a soft peach around the sun ---
const COLORS = {
    skyTop: '#2f74a8',
    skyMid: '#8cc3e2',
    skyBand: '#f8d3d2',
    skyGlow: '#ffd9bf',
    skyLow: '#d7e8f5',
    sand: '#f0dcb0',
    sandDeep: '#e2c690',
    sandstone: '#cfae7c',
    dirt: '#9d7650',
    stone: '#8d97a1',
    stoneDark: '#7b858f',
    seabed: '#dcc493',
    grass: '#84c25d',
    grassDark: '#74b54f',
    path: '#c8b48c',
    rock: '#a0a9b1',
    waterShallow: '#52b9dc',
    waterDeep: '#2477b4',
    foam: '#f4fbff',
    footprint: '#d8c08f',
    wood: '#a8794e',
    woodDark: '#7a5233',
    woodLight: '#c49a6c',
    roof: '#4b5866',
    leaf: '#4f9a4a',
    pine: '#2f6e4f',
    glow: '#ffd58a',
    outline: '#173554'
};

// One block of the island
const B = 0.35;
// The sun hangs low beyond the bay, in front of us; the camera starts behind us looking out at it
const SUN_AZIMUTH = 0.6;
const SUN_ELEVATION = -0.28;
const SUN_DIR = new THREE.Vector3(-Math.sin(SUN_AZIMUTH), 0, -Math.cos(SUN_AZIMUTH))
    .multiplyScalar(Math.sqrt(1 - SUN_ELEVATION ** 2)).setY(SUN_ELEVATION);

const color = hex => new THREE.Color(hex);
const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

// Small seeded random numbers, so the island and everything on it come out the same on every visit
function random(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A fixed random number for a block position
function hash(i, k, salt) {
    const v = Math.sin(i * 127.1 + k * 311.7 + salt * 74.7) * 43758.5453;
    return v - Math.floor(v);
}

// ----- Blocks: many small boxes merged into one mesh (one draw call), plus an outline hull -----
const OUTLINE = 0.009;
const blockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const outlineMaterial = new THREE.MeshBasicMaterial({ color: COLORS.outline, side: THREE.BackSide });

// A unit cube as 36 corners (12 triangles); every box is this cube scaled, turned and moved
const CUBE = (() => {
    const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    return { position: g.attributes.position.array, normal: g.attributes.normal.array };
})();

class Blocks {
    constructor() {
        this.parts = [];
        this.hull = [];
    }

    // A box of size w×h×d centred at (x, y, z); opts: { outline, rot: [x, y, z] }
    box(w, h, d, x, y, z, hex, opts = {}) {
        this.parts.push({ matrix: transform(x, y, z, opts.rot).scale(new THREE.Vector3(w, h, d)), color: color(hex) });
        if (opts.outline) {
            this.hull.push({ matrix: transform(x, y, z, opts.rot).scale(new THREE.Vector3(w + OUTLINE * 2, h + OUTLINE * 2, d + OUTLINE * 2)) });
        }
        return this;
    }

    shape(geometry, x, y, z, hex, rot) {
        this.parts.push({ geometry, matrix: transform(x, y, z, rot), color: color(hex) });
        return this;
    }

    mesh(material = blockMaterial, { shadow = true, receive = false } = {}) {
        const mesh = new THREE.Mesh(merge(this.parts), material);
        mesh.castShadow = shadow;
        mesh.receiveShadow = receive;
        return mesh;
    }

    addTo(group, options) {
        if (this.parts.length) group.add(this.mesh(blockMaterial, options));
        if (this.hull.length) group.add(new THREE.Mesh(merge(this.hull), outlineMaterial));
        return group;
    }
}

function transform(x, y, z, rot) {
    const matrix = new THREE.Matrix4().makeTranslation(x, y, z);
    if (rot) matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    return matrix;
}

// Join the parts into one geometry, their colours as vertex colours
function merge(parts) {
    const sources = parts.map(p => {
        if (!p.geometry) return CUBE;
        const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
        const source = { position: g.attributes.position.array, normal: g.attributes.normal.array };
        g.dispose();
        p.geometry.dispose();
        return source;
    });
    const count = sources.reduce((n, s) => n + s.position.length / 3, 0);
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
    const colors = parts[0]?.color ? new Float32Array(count * 3) : null;
    const v = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
    let offset = 0;
    parts.forEach((p, n) => {
        const s = sources[n], corners = s.position.length / 3;
        normalMatrix.getNormalMatrix(p.matrix);
        for (let i = 0; i < corners; i++) {
            v.fromArray(s.position, i * 3).applyMatrix4(p.matrix).toArray(position, (offset + i) * 3);
            v.fromArray(s.normal, i * 3).applyMatrix3(normalMatrix).normalize().toArray(normal, (offset + i) * 3);
            if (colors) {
                colors[(offset + i) * 3] = p.color.r;
                colors[(offset + i) * 3 + 1] = p.color.g;
                colors[(offset + i) * 3 + 2] = p.color.b;
            }
        }
        offset += corners;
    });
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
// her shoulder-length dark brown hair with a side fringe, a slim figure, a light blue bra top and skirt.
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
    chestW: 0.5, chestD: 0.3, waistW: 0.38, waistD: 0.25, hipsW: 0.52, hipsD: 0.32,
    shoulderHalf: 0.31, hipHalf: 0.12, armW: 0.15, legW: 0.18, headW: 0.48,
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
        // Beach outfit: a light blue bra top with thin straps and a white trim, a bare waist, the skirt's
        // waistband at the hips, and a small gold necklace
        b.box(P.hipsW, 0.17, P.hipsD, 0, HIPS_Y, 0, P.top, { outline: true });
        b.box(P.waistW, 0.29, P.waistD, 0, WAIST_Y, 0, P.skin, { outline: true });
        b.box(P.chestW, 0.3, P.chestD, 0, CHEST_Y, 0, P.skin, { outline: true });
        b.box(P.chestW + 0.014, 0.15, P.chestD + 0.014, 0, CHEST_Y - 0.035, 0, P.top);
        b.box(P.chestW + 0.018, 0.025, P.chestD + 0.018, 0, CHEST_Y - 0.1, 0, '#ffffff');
        b.box(0.04, 0.04, 0.012, 0, CHEST_Y - 0.03, P.chestD / 2 + 0.01, '#ffffff');
        [1, -1].forEach(side => b.box(0.04, 0.16, P.chestD + 0.016, (P.chestW / 2 - 0.09) * side, CHEST_Y + 0.11, 0, shade(P.top, 0.08)));
        b.box(0.15, 0.014, 0.012, 0, CHEST_Y + 0.13, P.chestD / 2 + 0.002, '#e9c46a');
        b.box(0.03, 0.03, 0.012, 0, CHEST_Y + 0.105, P.chestD / 2 + 0.004, '#f2d38a', { rot: [0, 0, Math.PI / 4] });
        b.box(0.15, 0.06, 0.14, 0, COLLAR_Y - 0.02, 0, P.skinShade);
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
    [-0.36, -0.12, 0.12, 0.36].map(f => f * (w + 0.16)).forEach(x => [1, -1].forEach(face =>
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
        [1, -1].forEach(side => b.box(0.07, 0.035, 0.01, 0.16 * side, 0.22, face + 0.004, '#f3a5a9'));
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

// ----- A pixel heart, for the hearts that float up -----
const HEART_PIXELS = [
    '.XX.XX.',
    'XoXXXXX',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...'
];

function heartGeometry() {
    const b = new Blocks(), px = 0.07;
    HEART_PIXELS.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch !== '.') b.box(px, px, px, (c - 3) * px, (2.5 - r) * px, 0, ch === 'o' ? '#ffd1dc' : r < 3 ? '#ff5d84' : '#f2456f');
    }));
    return merge(b.parts);
}

// ----- Voxel terrain: a grid of blocks drawn as one mesh of only the faces open to the air -----
// The six faces of a unit cube, corners in counter-clockwise order seen from outside
const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
];

const ID = { sand: 1, sandDeep: 2, sandstone: 3, dirt: 4, stone: 5, stoneDark: 6, seabed: 7, grass: 8, grassDark: 9, path: 10, rock: 11 };
const PALETTE = [];
for (const [name, id] of Object.entries(ID)) PALETTE[id] = color(COLORS[name]);

class VoxelGrid {
    // Blocks i0..i1 across, j0..j1 up, k0..k1 front to back
    constructor(i0, i1, j0, j1, k0, k1) {
        Object.assign(this, { i0, j0, k0, ni: i1 - i0 + 1, nj: j1 - j0 + 1, nk: k1 - k0 + 1 });
        this.cells = new Uint8Array(this.ni * this.nj * this.nk);
    }

    get(i, j, k) {
        const a = i - this.i0, b = j - this.j0, c = k - this.k0;
        if (a < 0 || b < 0 || c < 0 || a >= this.ni || b >= this.nj || c >= this.nk) return 0;
        return this.cells[(a * this.nj + b) * this.nk + c];
    }

    set(i, j, k, id) {
        this.cells[((i - this.i0) * this.nj + (j - this.j0)) * this.nk + (k - this.k0)] = id;
    }

    mesh() {
        const position = [], normal = [], colors = [];
        for (let a = 0; a < this.ni; a++) {
            for (let b = 0; b < this.nj; b++) {
                for (let c = 0; c < this.nk; c++) {
                    const id = this.cells[(a * this.nj + b) * this.nk + c];
                    if (!id) continue;
                    const i = a + this.i0, j = b + this.j0, k = c + this.k0;
                    // Each block a shade lighter or darker than its neighbours, like the texture of real blocks
                    const tint = 0.93 + hash(i + j * 7, k, 3) * 0.1, p = PALETTE[id];
                    for (const face of FACES) {
                        if (this.get(i + face.n[0], j + face.n[1], k + face.n[2])) continue;
                        for (const n of [0, 1, 2, 0, 2, 3]) {
                            const [cx, cy, cz] = face.c[n];
                            position.push((i - 0.5 + cx) * B, (j + cy) * B, (k - 0.5 + cz) * B);
                            normal.push(face.n[0], face.n[1], face.n[2]);
                            colors.push(p.r * tint, p.g * tint, p.b * tint);
                        }
                    }
                }
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
        mesh.receiveShadow = true;
        return mesh;
    }
}

// ----- The island -----
// Columns of blocks: i across, k from the front (the bay, toward the sun) to the back, levels up, all in
// blocks. We stand near the front with the bay before us; behind us the beach rises to grass, a cottage and
// its garden, and a hill of pines; the lighthouse is on a rocky point at the front left. Underneath, the
// island narrows in layers of sand, earth and stone, like a chunk lifted out of the ground.
const ISLAND = { ci: 0, ck: 7, ri: 32, rk: 25 };
const ROCK = { i: -24, k: -8 };
const COTTAGE = { i0: -15, i1: -9, k0: 12, k1: 17 };
const GARDEN = { i0: -19, i1: -6, k0: 10, k1: 20 };
const HILL = { i: -3, k: 24 };

// 0 at the middle of the island, 1 at its edge
function islandRadius(i, k) {
    const di = (i - ISLAND.ci) / ISLAND.ri, dk = (k - ISLAND.ck) / ISLAND.rk;
    const a = Math.atan2(dk, di);
    return Math.hypot(di, dk) / (1 + 0.06 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 2.5) + 0.03 * Math.sin(9 * a));
}

const insideIsland = (i, k) => islandRadius(i, k) <= 1;
const shoreK = i => -4 + Math.round(1.6 * Math.sin(i * 0.21 + 0.5) + 0.8 * Math.sin(i * 0.53));
const grassK = i => 9 + Math.round(2 * Math.sin(i * 0.3 + 1.2));
const isRock = (i, k) => ((i - ROCK.i) / 6) ** 2 + ((k - ROCK.k) / 5) ** 2 < 1;
const isWater = (i, k) => !isRock(i, k) && k < shoreK(i);
const isGrass = (i, k) => !isRock(i, k) && k >= grassK(i);

// The gravel path from the beach up to the cottage door
function onPath(i, k) {
    const ax = -1, az = 6, bx = -12, bz = 11;
    const t = Math.max(0, Math.min(1, ((i - ax) * (bx - ax) + (k - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    return Math.hypot(i - (ax + t * (bx - ax)), k - (az + t * (bz - az))) < 0.9;
}

// Level of the top of a column. The water's own surface sits just under level 0
function topLevel(i, k) {
    if (isRock(i, k)) {
        return Math.hypot(i - ROCK.i, k - ROCK.k) < 2.6 ? 3 : 2 + (hash(i, k, 4) > 0.5 ? 1 : 0) + (hash(i, k, 5) > 0.8 ? 1 : 0);
    }
    const s = shoreK(i);
    if (k < s) return -1 - Math.min(Math.floor((s - 1 - k) / 2), 4);
    if (!isGrass(i, k)) return k - s > 6 ? 2 : 1;
    const hill = Math.round(3.2 * Math.exp(-((i - HILL.i) ** 2 + (k - HILL.k) ** 2) / 45));
    const bump = (k > 21 || Math.abs(i) > 21) && hash(i, k, 1) > 0.8 ? 1 : 0;
    return 2 + hill + bump;
}

function bottomLevel(i, k) {
    return -Math.round(4 + 14 * Math.pow(Math.max(0, 1 - islandRadius(i, k)), 0.75) + hash(i, k, 2) * 2.5);
}

// World height of the ground at a block
const ground = (i, k) => topLevel(i, k) * B;

function blockId(i, k, j, top) {
    const depth = top - 1 - j;
    if (isRock(i, k)) return depth === 0 ? ID.rock : hash(i, k, j) > 0.5 ? ID.stone : ID.stoneDark;
    if (depth === 0) {
        if (isWater(i, k)) return ID.seabed;
        if (onPath(i, k)) return ID.path;
        if (isGrass(i, k)) return hash(i, k, 6) > 0.7 ? ID.grassDark : ID.grass;
        return ID.sand;
    }
    if (isGrass(i, k) && depth <= 3) return ID.dirt;
    if (depth <= 2 && j >= -2) return ID.sandDeep;
    if (j >= -3) return ID.sandstone;
    if (j >= -8) return ID.dirt;
    return hash(i, k, j) > 0.5 ? ID.stone : ID.stoneDark;
}

function buildIsland() {
    const grid = new VoxelGrid(-36, 36, -26, 8, -22, 36);
    const columns = [];
    for (let i = -35; i <= 35; i++) {
        for (let k = -21; k <= 35; k++) {
            if (!insideIsland(i, k)) continue;
            const top = topLevel(i, k), bottom = bottomLevel(i, k);
            for (let j = bottom; j < top; j++) grid.set(i, j, k, blockId(i, k, j, top));
            columns.push({ i, k, top });
        }
    }
    return { mesh: grid.mesh(), columns };
}

// A small floating island around the big one: grass on top, earth and stone below
function buildIslet(radius, seed) {
    const rand = random(seed);
    const n = radius + 1;
    const grid = new VoxelGrid(-n, n, -radius * 2 - 3, 2, -n, n);
    const tops = [];
    for (let i = -n; i <= n; i++) {
        for (let k = -n; k <= n; k++) {
            const r = Math.hypot(i, k) / (radius * (1 + 0.12 * Math.sin(Math.atan2(k, i) * 3 + seed)));
            if (r > 1) continue;
            const top = 1 + (r < 0.5 && rand() > 0.6 ? 1 : 0);
            const bottom = -Math.round(1 + radius * 1.6 * Math.pow(1 - r, 0.8) + rand() * 1.5);
            for (let j = bottom; j < top; j++) {
                const depth = top - 1 - j;
                grid.set(i, j, k, depth === 0 ? (rand() > 0.7 ? ID.grassDark : ID.grass) : depth <= 2 ? ID.dirt : rand() > 0.5 ? ID.stone : ID.stoneDark);
            }
            tops.push({ i, k, top });
        }
    }
    return { mesh: grid.mesh(), tops };
}

// ----- The bay: one column of water blocks over each piece of sea floor -----
// The columns bob, and every few seconds a wave of raised blocks rolls in and breaks white on the beach
function buildWater(columns) {
    const cols = columns.filter(c => isWater(c.i, c.k)).map(c => ({ ...c, x: c.i * B, z: c.k * B, base: c.top * B, shore: shoreK(c.i) }));
    const geometry = new THREE.BoxGeometry(B, 1, B).translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: '#d8ecf6', roughness: 0.3 }), cols.length);
    mesh.receiveShadow = true;
    const deep = color(COLORS.waterDeep), shallow = color(COLORS.waterShallow), foam = color(COLORS.foam);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    function update(t) {
        const phase = (t / 5) % 1;
        cols.forEach((w, n) => {
            const crest = -22 + (w.shore + 22) * easeInOut(phase);
            const wave = Math.exp(-((w.k - crest) ** 2) / 1.2) * smoothstep(1, 0.85, phase);
            const nearShore = smoothstep(w.shore - 5, w.shore - 1, w.k);
            const top = -0.06 + Math.sin(t * 1.7 + w.i * 0.5 + w.k * 0.8) * 0.03 + wave * 0.1;
            m.makeScale(1, top - w.base, 1).setPosition(w.x, w.base, w.z);
            mesh.setMatrixAt(n, m);
            c.copy(deep).lerp(shallow, smoothstep(-5, -1, w.top) * 0.8 + nearShore * 0.2)
                .lerp(foam, Math.min(wave * nearShore * 0.9 + (w.k === w.shore - 1 ? 0.25 : 0), 1));
            mesh.setColorAt(n, c);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
    }
    update(0);
    // Where the bay meets the front edge of the island, it pours over as a waterfall
    const spill = cols.filter(w => w.i >= 3 && w.i <= 8 && !insideIsland(w.i, w.k - 1));
    return { mesh, update, spill };
}

function waterfall(spill) {
    const group = new THREE.Group();
    const curtain = new Blocks();
    const water = color(COLORS.waterShallow), foam = color(COLORS.foam);
    for (const w of spill) {
        const z = (w.k - 0.5) * B - 0.05;
        for (let s = 0; s < 12; s++) {
            const shade = `#${water.clone().lerp(foam, 0.15 + s * 0.06).getHexString()}`;
            const narrow = 1 - s * 0.035;
            curtain.box(B * narrow, 0.8, 0.12, w.x + (hash(w.i, s, 9) - 0.5) * 0.06, -0.46 - s * 0.8, z - s * 0.025, shade);
        }
    }
    const curtainMesh = curtain.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, transparent: true, opacity: 0.85, depthWrite: false }), { shadow: false });
    group.add(curtainMesh);
    // White water tumbling down the curtain
    const count = 60;
    const foamCubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), count);
    const rand = random(31);
    const xs = spill.map(w => w.x), x0 = Math.min(...xs) - B / 2, x1 = Math.max(...xs) + B / 2;
    const z0 = Math.min(...spill.map(w => (w.k - 0.5) * B)) - 0.13;
    const drops = Array.from({ length: count }, () => ({ x: x0 + rand() * (x1 - x0), y: -rand() * 9, s: 0.05 + rand() * 0.08, v: 2 + rand() * 1.5 }));
    group.add(foamCubes);
    const m = new THREE.Matrix4();
    function update(dt) {
        drops.forEach((d, n) => {
            d.y -= d.v * dt;
            if (d.y < -9.5) d.y = 0;
            const size = d.s * (1 - Math.max(0, -d.y - 6) / 4);
            m.makeScale(size, size, size).setPosition(d.x, d.y - 0.05, z0 + d.y * 0.03);
            foamCubes.setMatrixAt(n, m);
        });
        foamCubes.instanceMatrix.needsUpdate = true;
    }
    return { group, update };
}

// ----- Things on the island, all in blocks -----
// Static things go into one shared set of blocks (one mesh); glowing windows and lamps into another
function palmTree(b, i, k, height, lean, seed) {
    const x = i * B, z = k * B, y = ground(i, k), s = 0.26;
    let topX = x, topZ = z, topY = y;
    for (let n = 0; n < height; n++) {
        const step = Math.floor(n / 3) * 0.08;
        b.box(s, s, s, x + lean[0] * step, y + n * s + s / 2, z + lean[1] * step, n % 2 ? '#9c7853' : '#86643f');
        [topX, topY, topZ] = [x + lean[0] * step, y + n * s + s, z + lean[1] * step];
    }
    // The crown sways on its own
    const crown = new THREE.Group();
    crown.position.set(topX, topY, topZ);
    const leaves = new Blocks();
    leaves.box(0.34, 0.2, 0.34, 0, 0.08, 0, '#3f8f6c');
    [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([dx, dz], f) => {
        for (let n = 1; n <= 4; n++) {
            const droop = Math.max(0, n - 2) * 0.13;
            leaves.box(0.24, 0.1, 0.24, dx * n * 0.22, 0.12 - droop, dz * n * 0.22, n === 4 ? '#62b085' : (n + f) % 2 ? '#3f8f6c' : '#347d5c');
        }
    });
    [[0.12, 0.1], [-0.1, 0.12], [0.02, -0.14]].forEach(([cx, cz]) => leaves.box(0.13, 0.13, 0.13, cx, -0.1, cz, '#6b4a2b'));
    crown.add(leaves.mesh());
    return { crown, seed };
}

function oakTree(b, i, k, height, seed) {
    const x = i * B, z = k * B, y = ground(i, k), s = 0.3;
    for (let n = 0; n < height; n++) b.box(s, s, s, x, y + n * s + s / 2, z, n % 2 ? '#7a5233' : '#6b4629');
    const top = y + height * s;
    const rand = random(seed);
    const leaf = ['#4f9a4a', '#5aa953', '#468b42', '#63b35a'];
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 0; dy <= 3; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (dx * dx + dz * dz + (dy - 1.3) ** 2 * 1.5 > 6.2 || rand() < 0.1) continue;
                b.box(B, B, B, x + dx * B, top + dy * B - B / 2, z + dz * B, leaf[Math.floor(rand() * leaf.length)]);
            }
        }
    }
    return { x, z, top };
}

function pineTree(b, i, k, height) {
    const x = i * B, z = k * B, y = ground(i, k), s = 0.24;
    for (let n = 0; n < 3; n++) b.box(s, s, s, x, y + n * s + s / 2, z, '#6b4629');
    let level = y + 3 * s;
    const layers = height >= 4 ? [2, 2, 1, 1, 1, 0, 0] : [2, 1, 1, 0, 0];
    layers.forEach((r, n) => {
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
                b.box(s, s, s, x + dx * s, level + s / 2, z + dz * s, (n + dx + dz) % 2 ? '#2f6e4f' : '#3a7f5c');
            }
        }
        level += s;
    });
    b.box(s * 0.6, s, s * 0.6, x, level + s / 2, z, '#3a7f5c');
}

function beachUmbrella(b, i, k, stripe) {
    const x = i * B, z = k * B, y = ground(i, k), cell = 0.2;
    b.box(0.07, 1.6, 0.07, x, y + 0.8, z, '#f4f4f4');
    [[7, 1.3], [5, 1.42], [3, 1.54], [1, 1.66]].forEach(([n, h]) => {
        for (let a = 0; a < n; a++) {
            for (let c = 0; c < n; c++) b.box(cell, 0.12, cell, x + (a - (n - 1) / 2) * cell, y + h, z + (c - (n - 1) / 2) * cell, a % 2 ? '#ffffff' : stripe);
        }
    });
    // A striped towel in its shade
    ['#ffffff', '#5fb0e0', '#ffffff', '#f4a6b8', '#ffffff', '#5fb0e0'].forEach((hex, n) => b.box(0.62, 0.03, 0.2, x + 0.55, y + 0.015, z - 0.5 + n * 0.2, hex));
}

// A lounger looking out to sea
function lounger(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k);
    [[-0.17, -0.3], [0.17, -0.3], [-0.17, 0.3], [0.17, 0.3]].forEach(([dx, dz]) => b.box(0.04, 0.12, 0.04, x + dx, y + 0.06, z + dz, '#f4f4f4'));
    b.box(0.4, 0.05, 0.72, x, y + 0.14, z, '#ffffff');
    ['#5fb0e0', '#ffffff', '#5fb0e0', '#ffffff', '#5fb0e0'].forEach((hex, n) => b.box(0.36, 0.04, 0.12, x, y + 0.18, z - 0.3 + n * 0.12, hex));
    for (let n = 0; n < 4; n++) b.box(0.36, 0.06, 0.08, x, y + 0.22 + n * 0.08, z + 0.3 + n * 0.05, n % 2 ? '#ffffff' : '#5fb0e0');
}

function sandcastle(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k), s = 0.12, light = '#ecd6a6', dark = '#d9bd86';
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) b.box(s, s * 2, s, x + (a - 1) * s, y + s, z + (c - 1) * s, (a + c) % 2 ? light : dark);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => b.box(s, s, s, x + a * s, y + s * 2.5, z + c * s, light));
    b.box(s, s * 2, s, x, y + s * 3, z, dark);
    b.box(0.02, 0.22, 0.02, x, y + s * 4 + 0.11, z, '#f4f4f4');
    b.box(0.1, 0.07, 0.02, x + 0.05, y + s * 4 + 0.18, z, '#e8455a');
    // A bucket and spade beside it
    b.box(0.14, 0.13, 0.14, x + 0.32, y + 0.065, z + 0.1, '#e8455a');
    b.box(0.16, 0.025, 0.16, x + 0.32, y + 0.14, z + 0.1, '#f06a7a');
    b.box(0.03, 0.03, 0.26, x + 0.3, y + 0.02, z - 0.2, '#ffd166', { rot: [0, 0.5, 0] });
    b.box(0.1, 0.02, 0.1, x + 0.36, y + 0.015, z - 0.31, '#ffc23d');
}

function surfboard(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k);
    b.box(0.16, 1.0, 0.05, x, y + 0.45, z, '#ffffff', { rot: [0.12, 0.4, 0.1] });
    b.box(0.165, 0.08, 0.055, x + 0.02, y + 0.55, z, '#3d8fd1', { rot: [0.12, 0.4, 0.1] });
    b.box(0.165, 0.04, 0.055, x + 0.03, y + 0.66, z, '#f4a6b8', { rot: [0.12, 0.4, 0.1] });
}

// A wooden jetty out over the bay, with a little boat tied at the end
function jetty(b, i, kFrom, kTo) {
    const x = (i + 0.5) * B;
    for (let k = kFrom; k >= kTo; k--) {
        b.box(2 * B - 0.02, 0.08, B - 0.03, x, 0.31, k * B, k % 2 ? COLORS.wood : '#93673f');
        if (k % 2 === 0) [-1, 1].forEach(side => b.box(0.09, 0.85, 0.09, x + side * (B - 0.05), -0.13, k * B, COLORS.woodDark));
    }
    // A lamp at the end
    b.box(0.06, 0.9, 0.06, x + B - 0.05, 0.75, kTo * B, '#3b3f45');
    const boat = new THREE.Group();
    const hull = new Blocks();
    hull.box(0.6, 0.1, 1.2, 0, 0, 0, COLORS.wood);
    [-1, 1].forEach(side => hull.box(0.08, 0.22, 1.2, side * 0.3, 0.11, 0, '#b88a5c'));
    [-1, 1].forEach(end => hull.box(0.6, 0.22, 0.08, 0, 0.11, end * 0.6, '#b88a5c'));
    hull.box(0.62, 0.04, 1.22, 0, 0.2, 0, '#f4f4f4');
    hull.box(0.52, 0.05, 0.16, 0, 0.12, 0.1, '#8a5f3a');
    // A pair of oars resting across it
    [-1, 1].forEach(side => hull.box(0.04, 0.03, 0.9, side * 0.2, 0.2, -0.05, '#c49a6c', { rot: [0, side * 0.3, 0] }));
    boat.add(hull.mesh());
    boat.position.set(x + 2.3 * B, -0.04, kTo * B + 0.3);
    return { boat, lamp: [x + B - 0.05, 1.25, kTo * B] };
}

function campfire(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k);
    for (let n = 0; n < 8; n++) {
        const a = (n / 8) * Math.PI * 2;
        b.box(0.12, 0.08, 0.12, x + Math.cos(a) * 0.24, y + 0.04, z + Math.sin(a) * 0.24, n % 2 ? '#8d97a1' : '#7b858f');
    }
    b.box(0.36, 0.07, 0.08, x, y + 0.06, z, '#6b4629', { rot: [0, 0.6, 0] });
    b.box(0.36, 0.07, 0.08, x, y + 0.1, z, '#7a5233', { rot: [0, -0.6, 0] });
    // Logs to sit on
    b.box(0.7, 0.16, 0.18, x - 0.7, y + 0.08, z + 0.1, '#7a5233', { rot: [0, 1.2, 0] });
    b.box(0.7, 0.16, 0.18, x + 0.1, y + 0.08, z + 0.72, '#6b4629');
    return new THREE.Vector3(x, y + 0.1, z);
}

function bench(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k);
    [-0.32, 0.32].forEach(dx => {
        b.box(0.06, 0.22, 0.24, x + dx, y + 0.11, z, '#3b3f45');
        b.box(0.06, 0.3, 0.05, x + dx, y + 0.37, z + 0.11, '#3b3f45');
    });
    [-0.08, 0, 0.08].forEach(dz => b.box(0.8, 0.04, 0.07, x, y + 0.24, z + dz, COLORS.woodLight));
    [0.3, 0.42].forEach(h => b.box(0.8, 0.07, 0.04, x, y + h, z + 0.12, COLORS.woodLight));
}

function lampPost(b, glow, i, k) {
    const x = i * B, z = k * B, y = ground(i, k);
    b.box(0.07, 1.4, 0.07, x, y + 0.7, z, '#3b3f45');
    b.box(0.16, 0.04, 0.16, x, y + 1.42, z, '#3b3f45');
    glow.box(0.12, 0.14, 0.12, x, y + 1.33, z, COLORS.glow);
    b.box(0.18, 0.04, 0.18, x, y + 1.24, z, '#3b3f45');
}

function cottage(b, glow) {
    const { i0, i1, k0, k1 } = COTTAGE;
    const y0 = ground(i0, k0), wallH = 4;
    const doorI = Math.round((i0 + i1) / 2);
    const windows = new Set([`${doorI - 2},${k0}`, `${doorI + 2},${k0}`, `${i0},${k0 + 2}`, `${i1},${k0 + 2}`, `${doorI},${k1}`]);
    for (let i = i0; i <= i1; i++) {
        for (let k = k0; k <= k1; k++) {
            const edge = i === i0 || i === i1 || k === k0 || k === k1;
            if (!edge) continue;
            const corner = (i === i0 || i === i1) && (k === k0 || k === k1);
            for (let j = 0; j < wallH; j++) {
                const x = i * B, z = k * B, y = y0 + j * B + B / 2;
                if (k === k0 && i === doorI && j < 2) {
                    b.box(B, B, B * 0.5, x, y, z + B * 0.2, '#5c3b22');
                    if (j === 0) b.box(0.04, 0.04, 0.04, x + 0.1, y + 0.1, z - 0.07, '#ffd166');
                    continue;
                }
                if (windows.has(`${i},${k}`) && (j === 1 || j === 2)) {
                    glow.box(B * 0.8, B * 0.8, B * 0.9, x, y, z, COLORS.glow);
                    b.box(B, 0.04, B, x, y, z, COLORS.woodDark);
                    continue;
                }
                b.box(B, B, B, x, y, z, corner ? COLORS.woodDark : j % 2 ? COLORS.wood : COLORS.woodLight);
            }
        }
    }
    // Flower boxes under the front windows
    [doorI - 2, doorI + 2].forEach(i => {
        b.box(B * 1.1, 0.1, 0.12, i * B, y0 + B * 0.95, k0 * B - B * 0.62, COLORS.woodDark);
        [-0.1, 0, 0.1].forEach((dx, n) => b.box(0.07, 0.07, 0.07, i * B + dx, y0 + B * 1.12, k0 * B - B * 0.62, ['#f7a8c4', '#ffffff', '#e8455a'][n]));
    });
    // A step and a lantern at the door
    b.box(B * 1.4, 0.1, B * 0.8, doorI * B, y0 + 0.05, (k0 - 1) * B + 0.05, '#8d97a1');
    glow.box(0.1, 0.12, 0.1, (doorI + 1) * B, y0 + B * 2.2, k0 * B - B * 0.6, COLORS.glow);
    // Gable roof: rows of slates stepping up from the front and the back to a ridge
    const roofY = y0 + wallH * B;
    const rows = Math.ceil((k1 - k0 + 3) / 2);
    for (let r = 0; r < rows; r++) {
        const y = roofY + r * 0.2 + 0.09;
        for (const k of new Set([k0 - 1 + r, k1 + 1 - r])) {
            for (let i = i0 - 1; i <= i1 + 1; i++) b.box(B, 0.18, B, i * B, y, k * B, (i + r) % 2 ? COLORS.roof : '#3f4a56');
        }
        // Fill the gable ends under this row
        for (let k = k0 + r; k <= k1 - r; k++) {
            if (r > 0) [i0, i1].forEach(i => b.box(B, 0.2, B, i * B, y - 0.1, k * B, COLORS.wood));
        }
    }
    // Chimney
    const chimneyTop = roofY + rows * 0.2 + 0.5;
    for (let y = roofY; y < chimneyTop; y += 0.25) b.box(0.32, 0.25, 0.32, (i1 - 1) * B, y + 0.125, (k1 - 1) * B, (Math.round(y * 4) % 2) ? '#9aa3ab' : '#868f98');
    // A mailbox by the path
    b.box(0.06, 0.6, 0.06, (doorI + 3) * B, y0 + 0.3, (k0 - 2) * B, COLORS.woodDark);
    b.box(0.2, 0.16, 0.28, (doorI + 3) * B, y0 + 0.66, (k0 - 2) * B, '#3d8fd1');
    b.box(0.03, 0.1, 0.03, (doorI + 3) * B + 0.11, y0 + 0.75, (k0 - 2) * B + 0.06, '#e8455a');
    return new THREE.Vector3((i1 - 1) * B, chimneyTop, (k1 - 1) * B);
}

function fenceAndGarden(b) {
    const { i0, i1, k0, k1 } = GARDEN;
    const gate = i => i >= -13 && i <= -11;
    const post = (i, k) => b.box(0.08, 0.42, 0.08, i * B, ground(i, k) + 0.21, k * B, COLORS.woodLight);
    const rail = (x, z, w, d, i, k) => [0.14, 0.3].forEach(h => b.box(w, 0.05, d, x, ground(i, k) + h, z, COLORS.wood));
    for (let i = i0; i <= i1; i++) {
        for (const k of [k0, k1]) {
            if (k === k0 && gate(i)) continue;
            if (i % 2 === 0) post(i, k);
            if (i < i1 && !(k === k0 && gate(i + 1))) rail(i * B + B / 2, k * B, B, 0.04, i, k);
        }
    }
    for (let k = k0; k <= k1; k++) {
        for (const i of [i0, i1]) {
            if (k % 2 === 0) post(i, k);
            if (k < k1) rail(i * B, k * B + B / 2, 0.04, B, i, k);
        }
    }
    // Vegetable rows beside the cottage
    for (let i = -18; i <= -16; i++) {
        for (let k = 12; k <= 18; k++) {
            const y = ground(i, k);
            b.box(B * 0.9, 0.04, B * 0.9, i * B, y + 0.02, k * B, '#7a5233');
            b.box(0.06, 0.12, 0.06, i * B, y + 0.1, k * B, '#5aa953');
            if ((i + k) % 3 === 0) b.box(0.06, 0.05, 0.06, i * B, y + 0.17, k * B, i === -17 ? '#e8455a' : '#ff9f43');
        }
    }
}

function lighthouse(b, glow) {
    const x = ROCK.i * B, z = ROCK.k * B, y = ground(ROCK.i, ROCK.k);
    for (let n = 0; n < 9; n++) {
        const w = 0.95 - n * 0.035;
        b.box(w, 0.3, w, x, y + n * 0.3 + 0.15, z, n % 2 ? '#ffffff' : '#d9534f');
    }
    const top = y + 9 * 0.3;
    b.box(1.0, 0.07, 1.0, x, top + 0.035, z, '#3b3f45');
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => b.box(0.05, 0.42, 0.05, x + a * 0.25, top + 0.28, z + c * 0.25, '#3b3f45'));
    glow.box(0.42, 0.36, 0.42, x, top + 0.26, z, '#fff1b8');
    b.box(0.62, 0.08, 0.62, x, top + 0.52, z, '#d9534f');
    b.box(0.4, 0.1, 0.4, x, top + 0.6, z, '#d9534f');
    b.box(0.16, 0.1, 0.16, x, top + 0.7, z, '#3b3f45');
    return new THREE.Vector3(x, top + 0.26, z);
}

function islandDetails(b, columns) {
    const rand = random(11);
    for (const { i, k, top } of columns) {
        const y = top * B;
        const busy = (i >= GARDEN.i0 - 1 && i <= GARDEN.i1 + 1 && k >= GARDEN.k0 - 1 && k <= GARDEN.k1 + 1) || onPath(i, k);
        // Grass tufts and flowers on the grassy part
        if (isGrass(i, k) && !busy && hash(i, k, 5) > 0.82) {
            for (let n = 0; n < 2; n++) {
                const h = 0.12 + rand() * 0.18;
                b.box(0.05, h, 0.05, i * B + (rand() - 0.5) * 0.25, y + h / 2, k * B + (rand() - 0.5) * 0.25, n % 2 ? '#6fae4f' : '#93cf6c');
            }
        }
        if (isGrass(i, k) && !busy && hash(i, k, 6) > 0.94) {
            b.box(0.02, 0.16, 0.02, i * B, y + 0.08, k * B, '#5c9a41');
            b.box(0.08, 0.08, 0.08, i * B, y + 0.19, k * B, ['#f7a8c4', '#ffffff', '#ffd166'][Math.floor(hash(i, k, 7) * 3)]);
        }
        // Shells along the waterline
        if (!isWater(i, k) && !isRock(i, k) && k === shoreK(i) && hash(i, k, 8) > 0.75) {
            b.box(0.09, 0.04, 0.11, i * B + (hash(i, k, 9) - 0.5) * 0.2, y + 0.02, k * B, hash(i, k, 10) > 0.5 ? '#fbe4ec' : '#fff4e6');
        }
        // Loose rocks along the bay's edge
        if (isWater(i, k) && !insideIsland(i, k - 1) && hash(i, k, 12) > 0.8 && (i < 2 || i > 9)) {
            b.box(0.3, 0.26, 0.3, i * B, 0.04, k * B, '#8d97a1');
        }
    }
    // A starfish
    const sx = -3 * B, sz = -3 * B, sy = ground(-3, -3) + 0.015;
    [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [1, -2], [-1, -2]].forEach(([a, c]) =>
        b.box(0.05, 0.03, 0.05, sx + a * 0.05, sy, sz + c * 0.05, '#f2896d'));
}

// Our footprints, walking down the beach to where we stand
function footprints(b, people) {
    for (const [person, side] of people) {
        const facing = new THREE.Vector3(Math.sin(person.outer.rotation.y), 0, Math.cos(person.outer.rotation.y));
        const across = new THREE.Vector3(facing.z, 0, -facing.x);
        for (let d = 0.6, n = 0; d < 4.6; d += 0.42, n++) {
            const p = person.outer.position.clone().addScaledVector(facing, -d).addScaledVector(across, (n % 2 ? 0.08 : -0.08) + Math.sin(d) * 0.1 * side);
            const i = Math.round(p.x / B), k = Math.round(p.z / B);
            if (!insideIsland(i, k) || isWater(i, k)) break;
            b.box(0.08, 0.02, 0.13, p.x, ground(i, k) + 0.01, p.z, COLORS.footprint, { rot: [0, person.outer.rotation.y, 0] });
        }
    }
}

// ----- Around the island -----
function islets(scene) {
    const list = [];
    // Each little island has something on it; one has a heart of red flowers
    [[-22, -1.5, -15, 6, 1], [21, 2.5, -11, 5, 2], [-8, -5.5, -26, 4, 3], [27, -3, 13, 4, 4]].forEach(([x, y, z, radius, seed], n) => {
        const { mesh, tops } = buildIslet(radius, seed);
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.add(mesh);
        const b = new Blocks();
        const top = (i, k) => (tops.find(t => t.i === i && t.k === k)?.top ?? 1) * B;
        const groundAt = (i, k) => top(i, k);
        if (n === 0) {
            oakTreeOn(b, groundAt, 0, 1, 6, 41);
            [[-2, -2], [3, -1], [-3, 2]].forEach(([i, k]) => flowerOn(b, groundAt, i, k, '#f7a8c4'));
        } else if (n === 1) {
            const heart = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
            heart.forEach((row, r) => [...row].forEach((ch, c) => {
                if (ch === 'X') b.box(B * 0.8, 0.12, B * 0.8, (c - 3) * B, groundAt(c - 3, r - 2) + 0.06, (r - 2.5) * B, r < 2 && c % 2 ? '#ff6f91' : '#e8455a');
            }));
        } else if (n === 2) {
            pineOn(b, groundAt, 0, 0);
        } else {
            b.box(0.06, 0.6, 0.06, 0, groundAt(0, 0) + 0.3, 0, COLORS.woodDark);
            b.box(0.5, 0.26, 0.04, 0, groundAt(0, 0) + 0.62, 0, COLORS.woodLight);
            [[1, 1], [-1, 2], [2, -1]].forEach(([i, k]) => flowerOn(b, groundAt, i, k, '#ffd166'));
        }
        group.add(b.mesh());
        scene.add(group);
        list.push({ group, y, phase: n * 1.7 });
    });
    return list;
}

function flowerOn(b, groundAt, i, k, hex) {
    b.box(0.02, 0.16, 0.02, i * B, groundAt(i, k) + 0.08, k * B, '#5c9a41');
    b.box(0.09, 0.09, 0.09, i * B, groundAt(i, k) + 0.2, k * B, hex);
}

function oakTreeOn(b, groundAt, i, k, height, seed) {
    const x = i * B, z = k * B, y = groundAt(i, k), s = 0.3, rand = random(seed);
    for (let n = 0; n < height; n++) b.box(s, s, s, x, y + n * s + s / 2, z, n % 2 ? '#7a5233' : '#6b4629');
    const top = y + height * s;
    for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 3; dy++) for (let dz = -2; dz <= 2; dz++) {
        if (dx * dx + dz * dz + (dy - 1.3) ** 2 * 1.5 > 6.2 || rand() < 0.1) continue;
        b.box(B, B, B, x + dx * B, top + dy * B - B / 2, z + dz * B, ['#4f9a4a', '#5aa953', '#468b42'][Math.floor(rand() * 3)]);
    }
}

function pineOn(b, groundAt, i, k) {
    const x = i * B, z = k * B, s = 0.24;
    let level = groundAt(i, k);
    for (let n = 0; n < 3; n++) b.box(s, s, s, x, level + n * s + s / 2, z, '#6b4629');
    level += 3 * s;
    [2, 2, 1, 1, 1, 0, 0].forEach((r, n) => {
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            b.box(s, s, s, x + dx * s, level + s / 2, z + dz * s, (n + dx + dz) % 2 ? '#2f6e4f' : '#3a7f5c');
        }
        level += s;
    });
}

// A hot-air balloon in the island's blues, drifting nearby
function balloon() {
    const group = new THREE.Group();
    const b = new Blocks(), s = 0.3;
    const profile = [1.2, 2, 2.6, 3, 3.2, 3.2, 3, 2.6, 2, 1.2];
    profile.forEach((r, layer) => {
        for (let a = -4; a <= 4; a++) {
            for (let c = -4; c <= 4; c++) {
                const d = Math.hypot(a, c);
                if (d > r || d < r - 1.6) continue;
                const sector = Math.floor(((Math.atan2(c, a) + Math.PI) / (Math.PI * 2)) * 8);
                b.box(s, s, s, a * s, layer * s, c * s, layer === 4 ? '#f4a6b8' : sector % 2 ? '#ffffff' : '#3d8fd1');
            }
        }
    });
    b.box(0.5, 0.36, 0.5, 0, -1.3, 0, COLORS.wood);
    b.box(0.56, 0.06, 0.56, 0, -1.1, 0, COLORS.woodDark);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => b.box(0.02, 1.0, 0.02, a * 0.24, -0.6, c * 0.24, '#5c3b22'));
    group.add(b.mesh());
    return group;
}

// Clouds of white blocks, a little blue underneath, merged into one mesh that turns slowly round the island
function clouds() {
    const b = new Blocks();
    const rand = random(51);
    const place = [
        [-16, 1, -10, 1.0], [16, -3, -12, 1.2], [-15, -7, 10, 1.1], [18, 1, 9, 0.9], [2, -9, -16, 1.3], [-6, 4, 22, 1.0],
        [-34, -12, 4, 2.2], [32, -10, 22, 2.0], [-40, 6, -30, 3], [44, 3, -36, 3.2], [-10, -16, -40, 2.6], [10, 8, 40, 2.4]
    ];
    for (const [x, y, z, size] of place) {
        const nx = 4 + Math.floor(rand() * 3), nz = 2 + Math.floor(rand() * 2);
        for (let a = 0; a < nx; a++) {
            for (let c = 0; c < nz; c++) {
                if ((a === 0 || a === nx - 1) && rand() < 0.4) continue;
                const levels = rand() < 0.35 && a > 0 && a < nx - 1 ? 2 : 1;
                for (let l = 0; l < levels; l++) {
                    b.box(size, size, size, x + (a - (nx - 1) / 2) * size, y + l * size, z + (c - (nz - 1) / 2) * size, l ? '#ffffff' : '#eef5fc');
                }
            }
        }
    }
    return b.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.94 }), { shadow: false });
}

// A square sun, like the sun in a block game, with square layers of glow around it
function voxelSun() {
    const sun = new THREE.Group();
    [[46, '#ffe2a8', 1], [70, '#ffc890', 0.5], [100, '#ffb9a0', 0.25]].forEach(([size, hex, opacity], n) => {
        const square = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
            new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, toneMapped: false }));
        square.position.z = -n * 2;
        square.renderOrder = -1 - n;
        sun.add(square);
    });
    sun.position.copy(SUN_DIR).multiplyScalar(400);
    sun.lookAt(0, 0, 0);
    return sun;
}

function seagull() {
    const bird = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 1 });
    bird.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.11), material));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.03), new THREE.MeshStandardMaterial({ color: '#f2b13d' }));
    head.position.set(0.2, 0.01, 0);
    bird.add(head);
    const wings = [1, -1].map(side => {
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.03, 0);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.42), material);
        wing.position.z = 0.21 * side;
        pivot.add(wing);
        bird.add(pivot);
        return { pivot, side };
    });
    return { bird, wings };
}

// The sky is a huge box round everything (it moves with the camera), each wall tiled with square blocks of
// colour: blue overhead, a band of sunset at the sun's height, pale blue below, each block a little lighter
// or darker than its neighbours with a faint join between them, so even the sky is made of blocks
function skyBox() {
    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
            sunDir: { value: SUN_DIR }, tiles: { value: 22 },
            top: { value: color(COLORS.skyTop) }, mid: { value: color(COLORS.skyMid) }, band: { value: color(COLORS.skyBand) },
            glow: { value: color(COLORS.skyGlow) }, low: { value: color(COLORS.skyLow) }
        },
        vertexShader: `
            varying vec3 vLocal;
            void main() {
                vLocal = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform vec3 sunDir, top, mid, band, glow, low;
            uniform float tiles;
            varying vec3 vLocal;
            float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
            vec3 skyColor(vec3 d) {
                vec3 col = mix(mid, top, smoothstep(-0.15, 0.35, d.y));
                col = mix(low, col, smoothstep(-0.6, -0.32, d.y));
                float towardSun = max(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz)), 0.0);
                float inBand = exp(-pow((d.y - sunDir.y) / 0.1, 2.0));
                col = mix(col, band, inBand * (0.25 + 0.6 * pow(towardSun, 3.0)));
                return mix(col, glow, pow(max(dot(d, sunDir), 0.0), 10.0) * 0.85);
            }
            void main() {
                // Which wall of the box this is, and where on it (-1..1 across the wall)
                vec3 a = abs(vLocal);
                float m = max(a.x, max(a.y, a.z));
                vec3 p = vLocal / m;
                vec2 f = a.x == m ? p.yz : a.y == m ? p.xz : p.xy;
                // The block this point falls in, and the direction to its middle
                vec2 cell = (floor(f * tiles * 0.5) + 0.5) / (tiles * 0.5);
                vec3 centre = a.x == m ? vec3(sign(p.x), cell) : a.y == m ? vec3(cell.x, sign(p.y), cell.y) : vec3(cell, sign(p.z));
                vec3 col = skyColor(normalize(centre)) * (0.975 + 0.05 * hash(centre));
                vec2 g = fract(f * tiles * 0.5);
                float edge = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
                col *= mix(0.955, 1.0, smoothstep(0.0, 0.05, edge));
                gl_FragColor = vec4(col, 1.0);
                #include <colorspace_fragment>
            }`
    });
    return new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), material);
}

// Little cubes that rise, drift and fade (fire, smoke) or wander (fireflies, falling earth): one draw call each
function particles(count, material, reset, step) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
    const rand = random(count * 7 + 3);
    const items = Array.from({ length: count }, (_, n) => reset({}, rand, n, true));
    const m = new THREE.Matrix4();
    return {
        mesh,
        update(t, dt) {
            items.forEach((p, n) => {
                const [x, y, z, size] = step(p, t, dt, rand, n);
                m.makeScale(size, size, size).setPosition(x, y, z);
                mesh.setMatrixAt(n, m);
            });
            mesh.instanceMatrix.needsUpdate = true;
        }
    };
}

function rising(origin, spread, height, speed, size, flicker = 0) {
    return [
        (p, rand, n, first) => Object.assign(p, { age: first ? rand() : 0, life: 0.6 + rand() * 0.5, dx: (rand() - 0.5) * spread, dz: (rand() - 0.5) * spread }),
        (p, t, dt, rand) => {
            p.age += dt * speed / p.life;
            if (p.age >= 1) Object.assign(p, { age: 0, dx: (rand() - 0.5) * spread, dz: (rand() - 0.5) * spread });
            const a = p.age;
            const flick = 1 - flicker + flicker * Math.sin((p.dx + p.dz) * 50 + t * 9);
            return [origin.x + p.dx * (1 + a), origin.y + a * height, origin.z + p.dz * (1 + a) + a * a * 0.3, size * (1 - a * 0.8) * flick];
        }
    ];
}

function start() {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
        return; // no WebGL here: the painted sky behind the title stays
    }
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(COLORS.skyLow);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

    // Light: warm light from above, a peach rim from the low sun, a cool fill from the other side
    scene.add(new THREE.HemisphereLight('#d2e8f7', '#f1dcc0', 1.7));
    const key = new THREE.DirectionalLight('#ffe3c9', 2.6);
    key.position.set(9, 16, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    const rim = new THREE.DirectionalLight('#ffc6a6', 1.1);
    rim.position.set(SUN_DIR.x * 20, 5, SUN_DIR.z * 20);
    const fill = new THREE.DirectionalLight('#d8e9f8', 0.9);
    fill.position.set(-6, 4, 8);
    scene.add(key, rim, fill);

    const sky = skyBox();
    sky.renderOrder = -10;
    scene.add(sky, voxelSun());

    // The island floats a little, up and down; everything on it moves with it
    const island = new THREE.Group();
    scene.add(island);
    const { mesh: terrain, columns } = buildIsland();
    island.add(terrain);
    const water = buildWater(columns);
    island.add(water.mesh);
    const fall = waterfall(water.spill);
    island.add(fall.group);

    // Us, on the beach facing the sun: him on the left, her on the right, turned a little toward each other
    const facingSun = Math.atan2(SUN_DIR.x, SUN_DIR.z);
    const right = new THREE.Vector3(-Math.cos(facingSun), 0, Math.sin(facingSun));
    const forward = new THREE.Vector3(Math.sin(facingSun), 0, Math.cos(facingSun));
    const spot = new THREE.Vector3(0, 0, 0);
    const him = buildPerson(HIM), her = buildPerson(HER);
    him.outer.position.copy(spot).addScaledVector(right, -0.66);
    her.outer.position.copy(spot).addScaledVector(right, 0.62);
    for (const p of [him, her]) p.outer.position.y = ground(Math.round(p.outer.position.x / B), Math.round(p.outer.position.z / B));
    him.outer.rotation.y = facingSun - 0.12;
    her.outer.rotation.y = facingSun + 0.12;
    her.outer.scale.setScalar(0.93);
    island.add(him.outer, her.outer);

    // Point his right arm and her left arm at the same spot between us, so the hands meet
    scene.updateMatrixWorld(true);
    const shoulderR = him.armRight.getWorldPosition(new THREE.Vector3());
    const shoulderL = her.armLeft.getWorldPosition(new THREE.Vector3());
    const handsMeet = shoulderR.clone().lerp(shoulderL, 0.5).setY(him.outer.position.y + 0.79).addScaledVector(forward, 0.06);
    const down = new THREE.Vector3(0, -1, 0);
    for (const arm of [him.armRight, her.armLeft]) {
        const target = arm.parent.worldToLocal(handsMeet.clone()).sub(arm.position).normalize();
        arm.userData.base = new THREE.Quaternion().setFromUnitVectors(down, target);
        arm.quaternion.copy(arm.userData.base);
    }
    him.armLeft.rotation.z = 0.07;
    her.armRight.rotation.z = -0.07;

    // Everything else on the island: still things in one mesh, glowing windows and lamps in another
    const decor = new Blocks(), glow = new Blocks();
    islandDetails(decor, columns);
    footprints(decor, [[him, 1], [her, -1]]);
    const palms = [
        palmTree(decor, -9, 2, 11, [-1, 0], 0.3), palmTree(decor, 8, 1, 12, [1, 0], 1.4), palmTree(decor, 17, 1, 10, [1, -1], 2.2),
        palmTree(decor, -18, 3, 12, [-1, 1], 0.9), palmTree(decor, 24, 0, 9, [1, 0], 1.8)
    ];
    palms.forEach(p => island.add(p.crown));
    beachUmbrella(decor, -6, 3, '#3d8fd1');
    beachUmbrella(decor, 13, 4, '#e8455a');
    lounger(decor, 12, 1);
    lounger(decor, 14, 1);
    sandcastle(decor, 4, 1);
    surfboard(decor, -4, 5);
    const pier = jetty(decor, 10, -2, -13);
    island.add(pier.boat);
    glow.box(0.12, 0.14, 0.12, ...pier.lamp, COLORS.glow);
    const fireAt = campfire(decor, -5, 7);
    bench(decor, 3, 11);
    lampPost(decor, glow, -3, 5);
    lampPost(decor, glow, -10, 9);
    const chimney = cottage(decor, glow);
    fenceAndGarden(decor);
    // A mailbox by the garden gate
    decor.box(0.06, 0.6, 0.06, -6 * B, ground(-6, 9) + 0.3, 9 * B, COLORS.woodDark);
    decor.box(0.2, 0.16, 0.28, -6 * B, ground(-6, 9) + 0.66, 9 * B, '#3d8fd1');
    const swingTree = oakTree(decor, -22, 17, 6, 61);
    oakTree(decor, 24, 14, 7, 62);
    oakTree(decor, -25, 12, 6, 63);
    [[-3, 25, 5], [-7, 27, 4], [1, 28, 4], [-1, 21, 5], [-6, 22, 4], [3, 24, 3]].forEach(([i, k, h]) => pineTree(decor, i, k, h));
    lighthouse(decor, glow);
    const decorMesh = decor.mesh(blockMaterial, { receive: true });
    island.add(decorMesh, glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), { shadow: false }));

    // A swing hanging from the oak by the garden
    const swing = new THREE.Group();
    swing.position.set(swingTree.x + 0.7, swingTree.top - 0.45, swingTree.z);
    const swingBlocks = new Blocks();
    swingBlocks.box(0.04, 0.95, 0.04, 0, -0.48, -0.15, '#d9c39a');
    swingBlocks.box(0.04, 0.95, 0.04, 0, -0.48, 0.15, '#d9c39a');
    swingBlocks.box(0.22, 0.05, 0.42, 0, -0.97, 0, COLORS.woodLight);
    swing.add(swingBlocks.mesh());
    const branch = new Blocks();
    branch.box(0.9, 0.12, 0.12, swingTree.x + 0.45, swingTree.top - 0.4, swingTree.z, '#6b4629');
    island.add(swing, branch.mesh());


    // Fire, smoke from the fire and the chimney, fireflies, earth falling from under the island
    const flames = particles(12, new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }), ...rising(fireAt, 0.16, 0.45, 2.2, 0.09, 0.4));
    const embers = particles(6, new THREE.MeshBasicMaterial({ color: '#ff6a3d', toneMapped: false }), ...rising(fireAt, 0.1, 0.25, 2.6, 0.07, 0.4));
    const smokeMaterial = new THREE.MeshStandardMaterial({ color: '#e9eef2', transparent: true, opacity: 0.75, roughness: 1 });
    const smoke = particles(10, smokeMaterial, ...rising(fireAt.clone().add(new THREE.Vector3(0, 0.4, 0)), 0.15, 1.6, 0.35, 0.13));
    const chimneySmoke = particles(10, smokeMaterial, ...rising(chimney, 0.12, 1.8, 0.3, 0.16));
    const fireflies = particles(30, new THREE.MeshBasicMaterial({ color: '#fff3a0', toneMapped: false }),
        (p, rand, n) => Object.assign(p, { x: (-18 + rand() * 26) * B, z: (6 + rand() * 18) * B, y: 0.9 + rand() * 0.9, ph: rand() * 10 }),
        (p, t) => [p.x + Math.sin(t * 0.5 + p.ph) * 0.5, p.y + Math.sin(t * 0.9 + p.ph * 2) * 0.25, p.z + Math.cos(t * 0.4 + p.ph) * 0.5, 0.045 * (0.5 + 0.5 * Math.sin(t * 3 + p.ph))]);
    const specks = particles(60, new THREE.MeshStandardMaterial({ color: '#b89a74' }),
        (p, rand, n, first) => Object.assign(p, { x: (rand() - 0.5) * 16, z: -4 + rand() * 14, y: first ? -2 - rand() * 8 : -2, v: 0.12 + rand() * 0.2 }),
        (p, t, dt, rand) => {
            p.y -= p.v * dt;
            if (p.y < -11) Object.assign(p, { y: -2, x: (rand() - 0.5) * 16, z: -4 + rand() * 14 });
            return [p.x, p.y, p.z, 0.07];
        });
    [flames, embers, smoke, chimneySmoke, fireflies, specks].forEach(p => island.add(p.mesh));

    // Around the island: smaller islands, a balloon, clouds, gulls
    const smallIslands = islets(scene);
    const hotAir = balloon();
    hotAir.position.set(14, 6, -18);
    scene.add(hotAir);
    const cloudMesh = clouds();
    scene.add(cloudMesh);
    const gulls = [0, 1, 2].map(n => {
        const g = seagull();
        island.add(g.bird);
        return { ...g, offset: n * 2.1, radius: 8 + n * 2.5, height: 4 + n * 1.3, speed: 0.32 - n * 0.05 };
    });

    // Pixel hearts that float up from our hands now and then (and when the scene is tapped)
    const heartShape = heartGeometry();
    const hearts = [];
    function spawnHeart(from, delay = 0) {
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#ff3e6c', emissiveIntensity: 0.3, roughness: 0.6, transparent: true });
        const heart = new THREE.Mesh(heartShape, material);
        heart.position.copy(from);
        heart.scale.setScalar(0.001);
        island.add(heart);
        hearts.push({ heart, born: clock + delay, drift: (Math.random() - 0.5) * 0.6, spin: (Math.random() - 0.5) * 2, from: from.clone() });
    }
    function updateHearts() {
        for (let n = hearts.length - 1; n >= 0; n--) {
            const h = hearts[n], age = clock - h.born;
            if (age < 0) continue;
            const t = age / 2.8;
            if (t >= 1) {
                island.remove(h.heart);
                h.heart.material.dispose();
                hearts.splice(n, 1);
                continue;
            }
            h.heart.position.set(h.from.x + Math.sin(age * 3) * 0.08 + h.drift * t, h.from.y + easeOut(t) * 1.2, h.from.z);
            h.heart.rotation.y = h.spin * age;
            h.heart.scale.setScalar(Math.min(age / 0.3, 1) * (1 - t * 0.3));
            h.heart.material.opacity = 1 - smoothstep(0.6, 1, t);
        }
    }

    // ----- Camera: always on the two of us. Drag to turn round or up and down, scroll or pinch to zoom -----
    const PITCH_MIN = 0.05, PITCH_MAX = 1.45, DIST_MIN = 3.2, DIST_MAX = 55;
    const view = { yaw: SUN_AZIMUTH, pitch: 0.42, dist: 12 };
    let zoomed = false, interacted = false, flight = null;
    const velocity = { yaw: 0, pitch: 0 };
    function resize() {
        const width = host.clientWidth || window.innerWidth;
        const height = host.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        // Further back on narrow (portrait) screens, so there's still some island around us
        if (!zoomed) view.dist = camera.aspect < 1 ? 17 : 12;
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const pointers = new Map();
    let pinch = null, lastMove = 0;
    const pinchDistance = () => {
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    // While someone is looking around, the title fades back so it doesn't cover the view
    let exploringTimer = 0;
    function startInteraction() {
        intro.classList.add('exploring');
        clearTimeout(exploringTimer);
        exploringTimer = setTimeout(() => intro.classList.remove('exploring'), 2500);
        if (interacted) return;
        // Keep the angle the idle sway had reached, then stop swaying
        view.yaw += idleSway;
        interacted = true;
    }
    function onPointerDown(e) {
        if (e.target.closest('button') || flight) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 });
        intro.setPointerCapture(e.pointerId);
        if (pointers.size === 2) pinch = { start: pinchDistance(), dist: view.dist };
    }
    function onPointerMove(e) {
        const p = pointers.get(e.pointerId);
        if (!p || flight) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        Object.assign(p, { x: e.clientX, y: e.clientY, moved: p.moved + Math.abs(dx) + Math.abs(dy) });
        if (p.moved < 4) return;
        startInteraction();
        if (pointers.size === 1 && !pinch) {
            lastMove = performance.now();
            velocity.yaw = -dx * 0.006;
            velocity.pitch = dy * 0.005;
            view.yaw += velocity.yaw;
            view.pitch = THREE.MathUtils.clamp(view.pitch + velocity.pitch, PITCH_MIN, PITCH_MAX);
        } else if (pinch) {
            view.dist = THREE.MathUtils.clamp(pinch.dist * pinch.start / pinchDistance(), DIST_MIN, DIST_MAX);
            zoomed = true;
        }
    }
    function onPointerUp(e) {
        const p = pointers.get(e.pointerId);
        pointers.delete(e.pointerId);
        const wasPinch = !!pinch;
        if (pointers.size < 2) pinch = null;
        // No glide after a pinch, or when the finger was held still before letting go
        if (pointers.size === 0 && (wasPinch || performance.now() - lastMove > 80)) velocity.yaw = velocity.pitch = 0;
        // A tap rather than a drag sends up a few hearts
        if (p && p.moved < 8 && !wasPinch && pointers.size === 0 && !flight) {
            for (let n = 0; n < 4; n++) spawnHeart(handsMeet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, 0)), n * 0.15);
        }
    }
    function onWheel(e) {
        e.preventDefault();
        if (flight) return;
        startInteraction();
        view.dist = THREE.MathUtils.clamp(view.dist * Math.exp(e.deltaY * 0.0012), DIST_MIN, DIST_MAX);
        zoomed = true;
    }
    intro.addEventListener('pointerdown', onPointerDown);
    intro.addEventListener('pointermove', onPointerMove);
    intro.addEventListener('pointerup', onPointerUp);
    intro.addEventListener('pointercancel', onPointerUp);
    intro.addEventListener('wheel', onWheel, { passive: false });

    const startTime = performance.now();
    let clock = 0, lastClock = 0, lastHeartCycle = -1, frameId = 0, drawn = false, idleSway = 0;
    const lookAt = new THREE.Vector3(), focus = new THREE.Vector3();
    const swingAxis = new THREE.Vector3(1, 0, 0), swingTurn = new THREE.Quaternion();
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
        swingTurn.setFromAxisAngle(swingAxis, Math.sin(t * 1.1) * 0.05);
        for (const arm of [him.armRight, her.armLeft]) arm.quaternion.copy(swingTurn).multiply(arm.userData.base);
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
        if (!pointers.size) {
            view.yaw += velocity.yaw;
            view.pitch = THREE.MathUtils.clamp(view.pitch + velocity.pitch, PITCH_MIN, PITCH_MAX);
            velocity.yaw *= 0.86;
            velocity.pitch *= 0.86;
        }
        // Until someone takes over, it sways slowly from side to side
        idleSway = interacted ? 0 : Math.sin(t * 0.1) * 0.2;
        // On arrival it swoops in from far above
        const arrive = easeInOut(Math.min(t / 3.6, 1));
        const yaw = view.yaw + idleSway + (1 - arrive) * 1.2;
        const pitch = Math.min(view.pitch + (1 - arrive) * 0.45, PITCH_MAX);
        const d = view.dist * (1 + (1 - arrive) * 2);
        focus.copy(spot).add(island.position).setY(island.position.y + him.outer.position.y + 1.0);
        camera.position.set(
            focus.x + Math.sin(yaw) * Math.cos(pitch) * d,
            focus.y + Math.sin(pitch) * d,
            focus.z + Math.cos(yaw) * Math.cos(pitch) * d);
        // Stay above the ground when skimming low over the island
        const ci = Math.round(camera.position.x / B), ck = Math.round(camera.position.z / B);
        if (insideIsland(ci, ck)) camera.position.y = Math.max(camera.position.y, island.position.y + Math.max(topLevel(ci, ck), 0) * B + 0.45);
        lookAt.copy(focus);
        if (flight) {
            // Down to just behind us, looking out at the sun
            const f = easeInOut(Math.min((performance.now() - flight.start) / 1600, 1));
            camera.position.lerpVectors(flight.from, flight.to, f);
            lookAt.lerpVectors(flight.lookFrom, flight.lookTo, f);
        }
        camera.lookAt(lookAt);
    }

    function frame() {
        frameId = requestAnimationFrame(frame);
        clock = (performance.now() - startTime) / 1000;
        const dt = Math.min(clock - lastClock, 0.1);
        lastClock = clock;
        island.position.y = Math.sin(clock * 0.6) * 0.08;
        water.update(clock);
        fall.update(dt);
        animatePeople(clock);
        updateHearts();
        palms.forEach(p => { p.crown.rotation.z = Math.sin(clock * 0.9 + p.seed) * 0.04; p.crown.rotation.x = Math.sin(clock * 0.7 + p.seed) * 0.03; });
        pier.boat.position.y = -0.04 + Math.sin(clock * 1.5) * 0.03;
        pier.boat.rotation.z = Math.sin(clock * 1.2) * 0.04;
        swing.rotation.z = Math.sin(clock * 1.4) * 0.35;
        [flames, embers, smoke, chimneySmoke, fireflies, specks].forEach(p => p.update(clock, dt));
        smallIslands.forEach(s => { s.group.position.y = s.y + Math.sin(clock * 0.5 + s.phase) * 0.25; });
        hotAir.position.y = 6 + Math.sin(clock * 0.25) * 0.8;
        hotAir.rotation.y = clock * 0.05;
        cloudMesh.rotation.y = clock * 0.004;
        gulls.forEach(g => {
            const a = clock * g.speed + g.offset;
            g.bird.position.set(Math.cos(a) * g.radius, g.height + Math.sin(clock * 0.9 + g.offset) * 0.3, Math.sin(a) * g.radius);
            g.bird.rotation.y = -a - Math.PI / 2;
            g.wings.forEach(w => { w.pivot.rotation.x = w.side * Math.sin(clock * 6 + g.offset) * 0.5; });
        });
        placeCamera(clock);
        sky.position.copy(camera.position);
        renderer.render(scene, camera);
        if (!drawn) {
            drawn = true;
            requestAnimationFrame(() => intro.classList.add('drawn'));
        }
    }
    frame();

    window.openingScene = {
        flyAway() {
            const behind = spot.clone().addScaledVector(forward, -2.8).add(new THREE.Vector3(0, him.outer.position.y + 1.9, 0)).add(island.position);
            flight = {
                start: performance.now(),
                from: camera.position.clone(),
                to: behind,
                lookFrom: lookAt.clone(),
                lookTo: SUN_DIR.clone().multiplyScalar(100)
            };
        },
        dispose() {
            cancelAnimationFrame(frameId);
            clearTimeout(exploringTimer);
            resizeObserver.disconnect();
            intro.removeEventListener('pointerdown', onPointerDown);
            intro.removeEventListener('pointermove', onPointerMove);
            intro.removeEventListener('pointerup', onPointerUp);
            intro.removeEventListener('pointercancel', onPointerUp);
            intro.removeEventListener('wheel', onWheel);
            scene.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            heartShape.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
            delete window.openingScene;
        }
    };
}

if (intro && host && !intro.classList.contains('leaving')) start();

// ===== OPENING SCENE =====
// The two of us holding hands on a little floating island of a beach, built entirely from blocks like a
// voxel diorama, with the sun going down in the sky beyond. The figures follow the blocky style of the
// portfolio's pickleball scene. script.js owns the overlay and its button; this file only draws behind them.
// If it can't run (no WebGL, the file didn't load) the overlay keeps its painted sky and still works.
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
    waterShallow: '#52b9dc',
    waterDeep: '#2477b4',
    foam: '#f4fbff',
    footprint: '#d8c08f',
    outline: '#173554'
};

// One block of the island
const B = 0.35;
// The sun hangs low beyond the far corner of the island; we look across the island at it from the
// opposite corner, from above, like looking at a diorama
const SUN_AZIMUTH = 0.75;
const SUN_DIR = new THREE.Vector3(-Math.sin(SUN_AZIMUTH) * 0.907, -0.42, -Math.cos(SUN_AZIMUTH) * 0.907).normalize();

const color = hex => new THREE.Color(hex);
const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

// Small seeded random numbers, so the island and the clouds come out the same on every visit
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
    return merge(b.solid);
}

// ----- The island -----
// Columns of blocks on a grid: i across, k from the front (the sea) to the back, both counted in blocks,
// and levels up in blocks. The front is a little bay of water, the beach rises in steps toward the back
// where it turns to grass, and underneath the island narrows in layers of sand, earth and stone, like a
// chunk lifted out of the ground.
const R = 13;

function insideIsland(i, k) {
    const a = Math.atan2(k, i);
    const r = R * (1 + 0.07 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 2.5));
    return Math.hypot(i, k * 1.08) <= r;
}

const shoreK = i => -3 + Math.round(1.4 * Math.sin(i * 0.33 + 0.5));
const isWater = (i, k) => k < shoreK(i);
const isGrass = (i, k) => k >= 7 + Math.round(1.5 * Math.sin(i * 0.4 + 1.2));

// Level of the top surface. The water's own surface sits just under level 0
function topLevel(i, k) {
    const s = shoreK(i);
    if (k < s) return -1 - Math.min(Math.floor((s - 1 - k) / 2), 3);
    return (k - s > 5 ? 2 : 1) + (isGrass(i, k) && hash(i, k, 1) > 0.75 ? 1 : 0);
}

function bottomLevel(i, k) {
    const d = Math.hypot(i, k * 1.08) / R;
    return -Math.round(3 + 9 * Math.pow(Math.max(0, 1 - d), 0.75) + hash(i, k, 2) * 2.2);
}

// World height of the ground at a point on the island
function groundY(x, z) {
    return topLevel(Math.round(x / B), Math.round(z / B)) * B;
}

function blockColor(i, k, j, top) {
    const depth = top - 1 - j;
    let hex;
    if (depth === 0) hex = isWater(i, k) ? COLORS.seabed : isGrass(i, k) ? COLORS.grass : COLORS.sand;
    else if (depth === 1 && isGrass(i, k)) hex = COLORS.dirt;
    else if (depth <= 2 && j >= -2) hex = COLORS.sandDeep;
    else if (j >= -3) hex = COLORS.sandstone;
    else if (j >= -7) hex = COLORS.dirt;
    else hex = hash(i, k, j) > 0.5 ? COLORS.stone : COLORS.stoneDark;
    // Each block a shade lighter or darker than its neighbours, like the texture of real blocks
    return color(hex).multiplyScalar(0.93 + hash(i + j * 7, k, 3) * 0.1);
}

// The six faces of a unit cube, corners in counter-clockwise order seen from outside
const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
];

// One mesh for the whole island, drawing only the block faces that are not hidden by a neighbour
function buildIsland() {
    const columns = new Map();
    for (let i = -R - 2; i <= R + 2; i++) {
        for (let k = -R - 2; k <= R + 2; k++) {
            if (insideIsland(i, k)) columns.set(`${i},${k}`, { i, k, top: topLevel(i, k), bottom: bottomLevel(i, k) });
        }
    }
    const solid = (i, k, j) => {
        const c = columns.get(`${i},${k}`);
        return !!c && j >= c.bottom && j < c.top;
    };
    const position = [], normal = [], colors = [];
    for (const { i, k, top, bottom } of columns.values()) {
        for (let j = bottom; j < top; j++) {
            const c = blockColor(i, k, j, top);
            for (const face of FACES) {
                if (solid(i + face.n[0], k + face.n[2], j + face.n[1])) continue;
                const corners = face.c.map(([cx, cy, cz]) => [(i - 0.5 + cx) * B, (j + cy) * B, (k - 0.5 + cz) * B]);
                for (const n of [0, 1, 2, 0, 2, 3]) {
                    position.push(...corners[n]);
                    normal.push(...face.n);
                    colors.push(c.r, c.g, c.b);
                }
            }
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // It catches the shadows of everything on it; its own would hardly show and cost the most to draw
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    mesh.receiveShadow = true;
    return { mesh, columns: [...columns.values()] };
}

// The bay: one column of water blocks over each piece of sea floor. The columns bob, and every few
// seconds a wave of raised blocks rolls in and breaks white against the beach
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
            const crest = -R + (w.shore + R) * easeInOut(phase);
            const wave = Math.exp(-((w.k - crest) ** 2) / 1.2) * smoothstep(1, 0.85, phase);
            const nearShore = smoothstep(w.shore - 5, w.shore - 1, w.k);
            const top = -0.06 + Math.sin(t * 1.7 + w.i * 0.5 + w.k * 0.8) * 0.03 + wave * 0.1;
            m.makeScale(1, top - w.base, 1).setPosition(w.x, w.base, w.z);
            mesh.setMatrixAt(n, m);
            c.copy(deep).lerp(shallow, smoothstep(-4, -1, w.top) * 0.8 + nearShore * 0.2)
                .lerp(foam, Math.min(wave * nearShore * 0.9 + (w.k === w.shore - 1 ? 0.25 : 0), 1));
            mesh.setColorAt(n, c);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
    }
    update(0);
    return { mesh, update };
}

// ----- Things on the island, all in blocks -----
function palmTree(i, k, height, lean, seed) {
    const tree = new THREE.Group();
    tree.position.set(i * B, topLevel(i, k) * B, k * B);
    const trunk = new Blocks(), s = 0.26;
    let top = new THREE.Vector3();
    for (let n = 0; n < height; n++) {
        const step = Math.floor(n / 3) * 0.08;
        trunk.box(s, s, s, lean[0] * step, n * s + s / 2, lean[1] * step, n % 2 ? '#9c7853' : '#86643f');
        top.set(lean[0] * step, n * s + s, lean[1] * step);
    }
    trunk.addTo(tree);
    const crown = new THREE.Group();
    crown.position.copy(top);
    const leaves = new Blocks();
    leaves.box(0.34, 0.2, 0.34, 0, 0.08, 0, '#3f8f6c');
    [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([dx, dz], f) => {
        for (let n = 1; n <= 4; n++) {
            const droop = Math.max(0, n - 2) * 0.13;
            leaves.box(0.24, 0.1, 0.24, dx * n * 0.22, 0.12 - droop, dz * n * 0.22, n === 4 ? '#62b085' : (n + f) % 2 ? '#3f8f6c' : '#347d5c');
        }
    });
    [[0.12, 0.1], [-0.1, 0.12], [0.02, -0.14]].forEach(([cx, cz]) => leaves.box(0.13, 0.13, 0.13, cx, -0.1, cz, '#6b4a2b'));
    leaves.addTo(crown);
    tree.add(crown);
    return { tree, crown, seed };
}

function beachUmbrella(i, k) {
    const group = new THREE.Group();
    group.position.set(i * B, topLevel(i, k) * B, k * B);
    const b = new Blocks(), cell = 0.2;
    b.box(0.07, 1.6, 0.07, 0, 0.8, 0, '#f4f4f4');
    [[7, 1.3], [5, 1.42], [3, 1.54], [1, 1.66]].forEach(([n, y]) => {
        for (let a = 0; a < n; a++) {
            for (let c = 0; c < n; c++) b.box(cell, 0.12, cell, (a - (n - 1) / 2) * cell, y, (c - (n - 1) / 2) * cell, a % 2 ? '#ffffff' : '#3d8fd1');
        }
    });
    // A striped towel in its shade
    ['#ffffff', '#5fb0e0', '#ffffff', '#f4a6b8', '#ffffff', '#5fb0e0'].forEach((hex, n) => b.box(0.62, 0.03, 0.2, 0.55, 0.015, -0.5 + n * 0.2, hex));
    b.addTo(group);
    return group;
}

function sandcastle(i, k) {
    const group = new THREE.Group();
    group.position.set(i * B, topLevel(i, k) * B, k * B);
    const b = new Blocks(), s = 0.12, light = '#ecd6a6', dark = '#d9bd86';
    for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) b.box(s, s * 2, s, (a - 1) * s, s, (c - 1) * s, (a + c) % 2 ? light : dark);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => b.box(s, s, s, a * s, s * 2.5, c * s, light));
    b.box(s, s * 2, s, 0, s * 3, 0, dark);
    b.box(0.02, 0.22, 0.02, 0, s * 4 + 0.11, 0, '#f4f4f4');
    b.box(0.1, 0.07, 0.02, 0.05, s * 4 + 0.18, 0, '#e8455a');
    b.addTo(group);
    return group;
}

// A wooden jetty out over the bay, with a little boat tied at the end
function jetty(i, kFrom, kTo) {
    const group = new THREE.Group();
    const b = new Blocks();
    const x = (i + 0.5) * B;
    for (let k = kFrom; k >= kTo; k--) {
        b.box(2 * B - 0.02, 0.08, B - 0.03, x, 0.31, k * B, k % 2 ? '#a8794e' : '#93673f');
        if (k % 2 === 0) [-1, 1].forEach(side => b.box(0.09, 0.75, 0.09, x + side * (B - 0.05), -0.08, k * B, '#6b4a2e'));
    }
    b.addTo(group);
    const boat = new THREE.Group();
    const hull = new Blocks();
    hull.box(0.6, 0.1, 1.2, 0, 0, 0, '#a8794e');
    [-1, 1].forEach(side => hull.box(0.08, 0.22, 1.2, side * 0.3, 0.11, 0, '#b88a5c'));
    [-1, 1].forEach(end => hull.box(0.6, 0.22, 0.08, 0, 0.11, end * 0.6, '#b88a5c'));
    hull.box(0.62, 0.04, 1.22, 0, 0.2, 0, '#f4f4f4');
    hull.box(0.52, 0.05, 0.16, 0, 0.12, 0.1, '#8a5f3a');
    hull.addTo(boat);
    boat.position.set(x + 2.3 * B, -0.04, kTo * B + 0.3);
    group.add(boat);
    return { group, boat };
}

function islandDetails(columns, him, her) {
    const b = new Blocks();
    const rand = random(11);
    for (const { i, k, top } of columns) {
        const y = top * B;
        // Beach grass and a few flowers on the grassy back of the island
        if (isGrass(i, k) && hash(i, k, 5) > 0.55) {
            for (let n = 0; n < 3; n++) {
                const h = 0.12 + rand() * 0.18;
                b.box(0.05, h, 0.05, i * B + (rand() - 0.5) * 0.25, y + h / 2, k * B + (rand() - 0.5) * 0.25, n % 2 ? '#6fae4f' : '#93cf6c');
            }
        }
        if (isGrass(i, k) && hash(i, k, 6) > 0.9) {
            b.box(0.02, 0.16, 0.02, i * B, y + 0.08, k * B, '#5c9a41');
            b.box(0.08, 0.08, 0.08, i * B, y + 0.19, k * B, ['#f7a8c4', '#ffffff', '#ffd166'][Math.floor(hash(i, k, 7) * 3)]);
        }
        // Shells along the waterline
        if (!isWater(i, k) && k === shoreK(i) && hash(i, k, 8) > 0.75) {
            b.box(0.09, 0.04, 0.11, i * B + (hash(i, k, 9) - 0.5) * 0.2, y + 0.02, k * B, hash(i, k, 10) > 0.5 ? '#fbe4ec' : '#fff4e6');
        }
    }
    // Rocks at the edge of the bay
    [[-9, -5], [-10, -3], [-8, -6], [10, -4]].forEach(([i, k], n) => {
        const y = Math.max(topLevel(i, k), 0) * B;
        b.box(0.32, 0.24, 0.3, i * B, y + 0.06, k * B, '#8d97a1');
        b.box(0.2, 0.16, 0.2, i * B + 0.12, y + 0.24, k * B - 0.05, n % 2 ? '#a3acb4' : '#7b858f');
    });
    // A starfish
    const sx = -3 * B, sz = -3 * B, sy = groundY(sx, sz) + 0.015;
    [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [1, -2], [-1, -2]].forEach(([a, c]) =>
        b.box(0.05, 0.03, 0.05, sx + a * 0.05, sy, sz + c * 0.05, '#f2896d'));
    // Our footprints, walking up the beach to where we stand
    for (const [person, side] of [[him, 1], [her, -1]]) {
        const facing = new THREE.Vector3(Math.sin(person.outer.rotation.y), 0, Math.cos(person.outer.rotation.y));
        const across = new THREE.Vector3(facing.z, 0, -facing.x);
        for (let d = 0.6, n = 0; d < 4.6; d += 0.42, n++) {
            const p = person.outer.position.clone().addScaledVector(facing, -d).addScaledVector(across, (n % 2 ? 0.08 : -0.08) + Math.sin(d) * 0.1 * side);
            if (!insideIsland(Math.round(p.x / B), Math.round(p.z / B))) break;
            b.box(0.08, 0.02, 0.13, p.x, groundY(p.x, p.z) + 0.01, p.z, COLORS.footprint, { rot: [0, person.outer.rotation.y, 0] });
        }
    }
    return b;
}

// ----- The sky -----
// A cloud of white blocks, a little blue underneath
function voxelCloud(x, y, z, size, seed) {
    const rand = random(seed);
    const b = new Blocks();
    const nx = 4 + Math.floor(rand() * 3), nz = 2 + Math.floor(rand() * 2);
    for (let a = 0; a < nx; a++) {
        for (let c = 0; c < nz; c++) {
            if ((a === 0 || a === nx - 1) && rand() < 0.4) continue;
            const levels = rand() < 0.35 && a > 0 && a < nx - 1 ? 2 : 1;
            for (let l = 0; l < levels; l++) b.box(size, size, size, (a - (nx - 1) / 2) * size, l * size, (c - (nz - 1) / 2) * size, l ? '#ffffff' : '#eef5fc');
        }
    }
    const mesh = new THREE.Mesh(merge(b.solid), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.94 }));
    mesh.position.set(x, y, z);
    return mesh;
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

function skyMaterial() {
    return new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
            sunDir: { value: SUN_DIR },
            top: { value: color(COLORS.skyTop) }, mid: { value: color(COLORS.skyMid) }, band: { value: color(COLORS.skyBand) },
            glow: { value: color(COLORS.skyGlow) }, low: { value: color(COLORS.skyLow) }
        },
        vertexShader: `
            varying vec3 vWorld;
            void main() {
                vec4 w = modelMatrix * vec4(position, 1.0);
                vWorld = w.xyz;
                gl_Position = projectionMatrix * viewMatrix * w;
            }`,
        fragmentShader: `
            uniform vec3 sunDir, top, mid, band, glow, low;
            varying vec3 vWorld;
            void main() {
                vec3 d = normalize(vWorld - cameraPosition);
                // Blue overhead, a warm band of sunset at the sun's height, soft pale blue below it
                vec3 col = mix(mid, top, smoothstep(-0.22, 0.1, d.y));
                col = mix(low, col, smoothstep(-0.55, -0.3, d.y));
                float towardSun = max(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz)), 0.0);
                float inBand = exp(-pow((d.y - sunDir.y) / 0.09, 2.0));
                col = mix(col, band, inBand * (0.25 + 0.6 * pow(towardSun, 3.0)));
                col = mix(col, glow, pow(max(dot(d, sunDir), 0.0), 10.0) * 0.85);
                gl_FragColor = vec4(col, 1.0);
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
    renderer.setClearColor(COLORS.skyLow);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

    // Light: warm afternoon light from above, a peach rim from the low sun, a cool fill from our side
    scene.add(new THREE.HemisphereLight('#d2e8f7', '#f1dcc0', 1.7));
    const key = new THREE.DirectionalLight('#ffe3c9', 2.6);
    key.position.set(5, 11, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    const rim = new THREE.DirectionalLight('#ffc6a6', 1.1);
    rim.position.set(SUN_DIR.x * 20, 5, SUN_DIR.z * 20);
    const fill = new THREE.DirectionalLight('#d8e9f8', 0.9);
    fill.position.set(-6, 4, 8);
    scene.add(key, rim, fill);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial());
    sky.renderOrder = -10;
    scene.add(sky, voxelSun());

    // The island floats a little, up and down
    const island = new THREE.Group();
    scene.add(island);
    const { mesh: ground, columns } = buildIsland();
    island.add(ground);
    const water = buildWater(columns);
    island.add(water.mesh);

    // Us, on the beach facing the sun: him on the left, her on the right, turned a little toward each other
    const facingSun = Math.atan2(SUN_DIR.x, SUN_DIR.z);
    const right = new THREE.Vector3(-Math.cos(facingSun), 0, Math.sin(facingSun));
    const spot = new THREE.Vector3(0, 0, -0.3);
    const him = buildPerson(HIM), her = buildPerson(HER);
    him.outer.position.copy(spot).addScaledVector(right, -0.66);
    her.outer.position.copy(spot).addScaledVector(right, 0.62);
    for (const p of [him, her]) p.outer.position.y = groundY(p.outer.position.x, p.outer.position.z);
    him.outer.rotation.y = facingSun - 0.12;
    her.outer.rotation.y = facingSun + 0.12;
    her.outer.scale.setScalar(0.93);
    island.add(him.outer, her.outer);

    // Point his right arm and her left arm at the same spot between us, so the hands meet
    scene.updateMatrixWorld(true);
    const shoulderR = him.armRight.getWorldPosition(new THREE.Vector3());
    const shoulderL = her.armLeft.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(Math.sin(facingSun), 0, Math.cos(facingSun));
    const handsMeet = shoulderR.clone().lerp(shoulderL, 0.5).setY(him.outer.position.y + 0.79).addScaledVector(forward, 0.06);
    const down = new THREE.Vector3(0, -1, 0);
    for (const arm of [him.armRight, her.armLeft]) {
        const target = arm.parent.worldToLocal(handsMeet.clone()).sub(arm.position).normalize();
        arm.userData.base = new THREE.Quaternion().setFromUnitVectors(down, target);
        arm.quaternion.copy(arm.userData.base);
    }
    him.armLeft.rotation.z = 0.07;
    her.armRight.rotation.z = -0.07;

    islandDetails(columns, him, her).addTo(island);
    const palms = [palmTree(-10, -1, 9, [-1, 0], 0.3), palmTree(11, -3, 11, [1, 0], 1.4), palmTree(-10, 4, 7, [-1, 0], 2.2)];
    palms.forEach(p => island.add(p.tree));
    const umbrella = beachUmbrella(-6, 2);
    umbrella.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    island.add(umbrella, sandcastle(4, 1));
    const pier = jetty(6, -1, -8);
    island.add(pier.group);

    // Clouds around and below the island, and a few far off by the sun
    const sunPoint = (distance, dx, dy) => SUN_DIR.clone().multiplyScalar(distance).add(new THREE.Vector3(dx, dy, 0));
    const clouds = [
        voxelCloud(-12, -1.5, -6, 1.0, 1), voxelCloud(12, -3.5, -8, 1.2, 2), voxelCloud(-11, -7, 6, 1.1, 3), voxelCloud(13, -0.5, 7, 0.9, 4),
        voxelCloud(...sunPoint(120, -30, -9).toArray(), 4.5, 5), voxelCloud(...sunPoint(140, 34, 10).toArray(), 4, 6),
        voxelCloud(...sunPoint(170, 40, -18).toArray(), 6, 7), voxelCloud(-34, -16, 10, 2.4, 8), voxelCloud(30, -14, 20, 2.2, 9)
    ];
    clouds.forEach(c => scene.add(c));

    const gulls = [0, 1].map(n => {
        const g = seagull();
        island.add(g.bird);
        return { ...g, offset: n * 2.6, radius: 6.5 + n * 1.4, height: 4.2 + n * 0.8 };
    });

    // Bits of earth drifting down under the island
    const specks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: '#b89a74' }), 40);
    const speckRand = random(21);
    const speckData = Array.from({ length: 40 }, () => ({ x: (speckRand() - 0.5) * 7, y: -1.5 - speckRand() * 5, z: (speckRand() - 0.5) * 7, v: 0.12 + speckRand() * 0.2 }));
    island.add(specks);

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

    // ----- Camera: swings in on arrival, then sways slowly round the island; drag to turn it -----
    const target = new THREE.Vector3(0, 0.6, 0);
    const PITCH = THREE.MathUtils.degToRad(32);
    let dist = 19, userYaw = 0, yawVelocity = 0, flight = null;
    function resize() {
        const width = host.clientWidth || window.innerWidth;
        const height = host.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // Step back on narrow (portrait) screens so the island still fits across
        const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
        dist = Math.max(19, (camera.aspect < 1 ? 4.6 : 6.4) / Math.tan(halfWidth));
        camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    let dragging = null;
    intro.addEventListener('pointerdown', onPointerDown);
    function onPointerDown(e) {
        if (e.target.closest('button') || flight) return;
        dragging = { x: e.clientX, y: e.clientY, moved: 0 };
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
        yawVelocity = -dx * 0.006;
        userYaw += yawVelocity;
    }
    function onPointerUp() {
        intro.removeEventListener('pointermove', onPointerMove);
        // A tap rather than a drag sends up a few hearts
        if (dragging && dragging.moved < 8) for (let n = 0; n < 4; n++) spawnHeart(handsMeet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, 0)), n * 0.15);
        dragging = null;
    }

    const startTime = performance.now();
    let clock = 0, lastClock = 0, lastHeartCycle = -1, frameId = 0, drawn = false;
    const lookAt = new THREE.Vector3();
    const swingAxis = new THREE.Vector3(1, 0, 0), swing = new THREE.Quaternion();
    const partnerHead = new THREE.Vector3();
    const m = new THREE.Matrix4();

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
            userYaw += yawVelocity;
            yawVelocity *= 0.92;
        }
        // From behind us, the sun sits in the sky just beyond the far side of the island
        const arrive = easeInOut(Math.min(t / 3.4, 1));
        const yaw = SUN_AZIMUTH + Math.sin(t * 0.1) * 0.35 + userYaw + (1 - arrive) * 1.4;
        const pitch = PITCH + (1 - arrive) * 0.25;
        const d = dist * (1 + (1 - arrive) * 0.9);
        camera.position.set(
            target.x + Math.sin(yaw) * Math.cos(pitch) * d,
            target.y + Math.sin(pitch) * d,
            target.z + Math.cos(yaw) * Math.cos(pitch) * d);
        lookAt.copy(target);
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
        animatePeople(clock);
        updateHearts();
        palms.forEach(p => { p.crown.rotation.z = Math.sin(clock * 0.9 + p.seed) * 0.04; p.crown.rotation.x = Math.sin(clock * 0.7 + p.seed) * 0.03; });
        pier.boat.position.y = -0.04 + Math.sin(clock * 1.5) * 0.03;
        pier.boat.rotation.z = Math.sin(clock * 1.2) * 0.04;
        clouds.forEach((c, n) => { c.position.x += (n % 2 ? 0.004 : -0.004) * (n > 3 ? 4 : 1); });
        gulls.forEach(g => {
            const a = clock * 0.35 + g.offset;
            g.bird.position.set(Math.cos(a) * g.radius, g.height + Math.sin(clock * 0.9 + g.offset) * 0.3, Math.sin(a) * g.radius);
            g.bird.rotation.y = -a - Math.PI / 2;
            g.wings.forEach(w => { w.pivot.rotation.x = w.side * Math.sin(clock * 6 + g.offset) * 0.5; });
        });
        speckData.forEach((s, n) => {
            s.y -= s.v * dt;
            if (s.y < -7) s.y = -1.5;
            specks.setMatrixAt(n, m.makeTranslation(s.x, s.y, s.z));
        });
        specks.instanceMatrix.needsUpdate = true;
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
            const behind = spot.clone().addScaledVector(forward, -2.8).add(new THREE.Vector3(0, 1.9, 0));
            flight = {
                start: performance.now(),
                from: camera.position.clone(),
                to: behind.add(island.position),
                lookFrom: lookAt.clone(),
                lookTo: SUN_DIR.clone().multiplyScalar(100)
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
            heartShape.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
            delete window.openingScene;
        }
    };
}

if (intro && host && !intro.classList.contains('leaving')) start();

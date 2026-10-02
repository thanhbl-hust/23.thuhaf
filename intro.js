// ===== OPENING SCENE =====
// An island built entirely from blocks, in a sea of blocks that runs to the horizon, with the two of us lying
// on two loungers under a beach umbrella at sunset, holding hands, our little dog beside her: a bay with a
// jetty and a boat, palms, beach huts and a lifeguard's chair along the sand, a cottage with a garden, a
// campfire, a swing, a white resort hotel like Vinpearl Ha Long with its pool at the back and a car park
// behind it, a pickleball court, a forest round a pond with ducks and a little bridge, a field of tulips, and
// a windmill. Waves roll into the bay and break on the beach, and near it the water is clear, with fish and a
// turtle over the sand. Out at sea are a yacht at anchor off the bay, small islands, the lighthouse on its
// rock, ships big and small, leaping dolphins and far-off hills; above, a
// hot-air balloon, clouds and gulls. Like a photo, it is sharp round us and softer and hazier the further away
// things are.
// The camera always looks at the two of us: drag to turn it round or up and down, scroll or pinch to zoom.
// The figures follow the blocky style of the portfolio's pickleball scene.
// script.js owns the overlay and its button; this file only draws behind them. Once in the page, the scene
// stays behind it as its background until the page's button brings it back to the front (script.js says when).
// If it can't run (no WebGL, the file didn't load) the overlay keeps its painted sky and still works.
import * as THREE from './vendor/three/three.module.min.js';

const intro = document.getElementById('intro');
const host = document.getElementById('introScene');

// --- Colours: the site's blues overhead, going lavender and then orange toward the setting sun ---
const COLORS = {
    skyTop: '#284c86',
    skyMid: '#b394c2',
    skyBand: '#ff9f6e',
    skyGlow: '#ffc06a',
    skyLow: '#b9a9cf',
    sand: '#f0dcb0',
    sandDeep: '#e2c690',
    sandstone: '#cfae7c',
    dirt: '#9d7650',
    stone: '#8d97a1',
    stoneDark: '#7b858f',
    seabed: '#dcc493',
    seabedDeep: '#ad9c78',
    seabedDark: '#7d8580',
    grass: '#84c25d',
    grassDark: '#74b54f',
    path: '#c8b48c',
    rock: '#a0a9b1',
    waterShallow: '#4aa9cf',
    waterDeep: '#2a6aa8',
    pond: '#5cc0e2',
    deck: '#ebe4d6',
    pool: '#5fd3ea',
    wall: '#f5f0e6',
    trim: '#ffffff',
    glass: '#7fa9c8',
    glassDark: '#4f6f8c',
    slate: '#5d6b7d',
    roofFlat: '#97a3b3',
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
// The open sea's surface, just under the lowest the bay's blocks bob to, and how far below it land is built
const SEA_Y = -0.09, SEA_FLOOR = -2;
// The sun is setting beyond the bay, in front of us, already touching the sea; the camera starts behind us
// looking out at it
const SUN_AZIMUTH = 0.6;
const SUN_ELEVATION = 0.025;
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

    // A box of size w×h×d centred at (x, y, z); opts: { outline, rot: [x, y, z], hide: faces to leave out }
    box(w, h, d, x, y, z, hex, opts = {}) {
        this.parts.push({ matrix: transform(x, y, z, opts.rot).scale(new THREE.Vector3(w, h, d)), color: color(hex), hide: opts.hide });
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

// Add boxes that are turned together by `rot` about `pivot`, as if they were one rigid piece: give each box
// where it would be unturned
function turned(b, pivot, rot) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), v = new THREE.Vector3();
    return (w, h, d, x, y, z, hex, opts = {}) => {
        v.set(x, y, z).sub(pivot).applyQuaternion(q).add(pivot);
        b.box(w, h, d, v.x, v.y, v.z, hex, { ...opts, rot });
    };
}

// Cubes of size s at whole steps [i, j, k] from `origin`, each with its colour, added without the faces they
// press against each other, which can't be seen
function cubes(b, s, origin, cells) {
    const filled = new Set(cells.map(([i, j, k]) => `${i},${j},${k}`));
    for (const [i, j, k, hex] of cells) {
        let hide = 0;
        FACES.forEach(({ n }, f) => { if (filled.has(`${i + n[0]},${j + n[1]},${k + n[2]}`)) hide |= 1 << f; });
        if (hide !== 63) b.box(s, s, s, origin.x + i * s, origin.y + j * s, origin.z + k * s, hex, { hide });
    }
}

// Join the parts into one geometry, their colours as vertex colours. A box can leave out some of its faces:
// `hide` has a bit for each, in the order of FACES (the cube's corners come six to a face in that order)
function merge(parts) {
    const sources = parts.map(p => {
        if (!p.geometry) return CUBE;
        const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
        const source = { position: g.attributes.position.array, normal: g.attributes.normal.array };
        g.dispose();
        p.geometry.dispose();
        return source;
    });
    const kept = (p, corner) => !(p.hide & (1 << Math.floor(corner / 6)));
    let count = 0;
    parts.forEach((p, n) => { for (let i = 0; i < sources[n].position.length / 3; i++) if (kept(p, i)) count++; });
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
    const colors = parts[0]?.color ? new Float32Array(count * 3) : null;
    const v = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
    let offset = 0;
    parts.forEach((p, n) => {
        const s = sources[n], corners = s.position.length / 3;
        normalMatrix.getNormalMatrix(p.matrix);
        for (let i = 0; i < corners; i++) {
            if (!kept(p, i)) continue;
            v.fromArray(s.position, i * 3).applyMatrix4(p.matrix).toArray(position, offset * 3);
            v.fromArray(s.normal, i * 3).applyMatrix3(normalMatrix).normalize().toArray(normal, offset * 3);
            if (colors) {
                colors[offset * 3] = p.color.r;
                colors[offset * 3 + 1] = p.color.g;
                colors[offset * 3 + 2] = p.color.b;
            }
            offset++;
        }
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
// her face, her black cat-eye glasses, her shoulder-length brown hair parted in the middle, a slim figure, a
// light blue bra top that comes down over her waist, and denim shorts.
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
    hair: '#3a281e', hairLight: '#6e4e37',
    top: '#8cc6e8', bottom: '#5a82b0'
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

    const person = { P, outer, root, torso, head, legs, armRight, armLeft };

    if (P.female) {
        // The long part of her hair hangs from its own pivot so the sea breeze can move it
        const hairFlow = new THREE.Group();
        hairFlow.position.set(0, 0.5, -0.05);
        buildHairFlow(P).addTo(hairFlow);
        head.add(hairFlow, buildLenses(P.headW / 2));
        person.hairFlow = hairFlow;
    }
    return person;
}

function buildLeg(P, side) {
    const b = new Blocks(), w = P.legW;
    if (P.female) {
        // Short denim shorts with a frayed, lighter hem, then bare thigh
        b.box(w + 0.02, 0.2, w + 0.05, 0, -0.09, 0, P.bottom, { outline: true });
        b.box(w + 0.03, 0.035, w + 0.06, 0, -0.19, 0, '#8fb0d4');
        b.box(w, 0.13, w + 0.01, 0, -0.25, 0, P.skin, { outline: true });
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
        // Beach outfit: a light blue bra top with thin straps that comes down over her waist to a white hem,
        // denim shorts with a darker waistband, and a fine silver necklace with a crescent moon
        b.box(P.hipsW, 0.17, P.hipsD, 0, HIPS_Y, 0, P.bottom, { outline: true });
        b.box(P.hipsW + 0.012, 0.04, P.hipsD + 0.012, 0, HIPS_Y + 0.06, 0, shade(P.bottom, 0.2));
        b.box(P.waistW, 0.29, P.waistD, 0, WAIST_Y, 0, P.top, { outline: true });
        b.box(P.waistW + 0.016, 0.03, P.waistD + 0.016, 0, WAIST_Y - 0.13, 0, '#ffffff');
        b.box(P.chestW, 0.3, P.chestD, 0, CHEST_Y, 0, P.skin, { outline: true });
        b.box(P.chestW + 0.014, 0.21, P.chestD + 0.014, 0, CHEST_Y - 0.045, 0, P.top);
        b.box(P.chestW + 0.018, 0.02, P.chestD + 0.018, 0, CHEST_Y + 0.06, 0, '#ffffff');
        b.box(0.04, 0.04, 0.012, 0, CHEST_Y + 0.04, P.chestD / 2 + 0.01, '#ffffff');
        [1, -1].forEach(side => b.box(0.04, 0.16, P.chestD + 0.016, (P.chestW / 2 - 0.09) * side, CHEST_Y + 0.11, 0, shade(P.top, 0.08)));
        [1, -1].forEach(side => b.box(0.08, 0.01, 0.012, 0.038 * side, CHEST_Y + 0.15, P.chestD / 2 + 0.004, '#e4e7ec', { rot: [0, 0, 0.26 * side] }));
        // Its pendant: a little crescent moon holding a pale stone
        ['.XX', 'X..', 'X.o', 'X..', '.XX'].forEach((row, r) => [...row].forEach((c, i) => {
            if (c !== '.') b.box(0.012, 0.012, 0.01, (i - 1) * 0.012, CHEST_Y + 0.106 + (2 - r) * 0.012, P.chestD / 2 + 0.012, c === 'X' ? '#e4e7ec' : '#b9d3ff');
        }));
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
    if (P.female) return buildHerHead(b, P);
    b.box(hw, hw, hw, 0, 0.3, 0, P.skin, { outline: true });
    b.box(hw - 0.06, 0.07, hw - 0.05, 0, 0.055, 0.01, P.skinShade);
    [1, -1].forEach(side => b.box(0.055, 0.13, 0.11, (hw / 2 + 0.02) * side, 0.29, -0.02, P.skinShade));
    // Face: eyes with a glint, brows, a small smile
    [1, -1].forEach(side => {
        b.box(0.06, 0.07, 0.02, 0.115 * side, 0.3, face + 0.004, '#2a211c');
        b.box(0.022, 0.022, 0.01, 0.115 * side + 0.014, 0.318, face + 0.014, '#ffffff');
        b.box(0.1, 0.022, 0.02, 0.115 * side, 0.395, face + 0.004, P.hair);
    });
    b.box(0.1, 0.022, 0.016, 0, 0.165, face + 0.004, '#c46d65');
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
    return b;
}

// Her face, after her photos: a soft round face with a high forehead, framed by straight brown hair parted in
// the middle, defined arched brows, clear almond eyes behind big black cat-eye glasses, a small rounded nose
// and full dusty rose lips
function buildHerHead(b, P) {
    const hw = P.headW, face = hw / 2, front = face + 0.004;
    // Full width down to the mouth, then the jaw rounds in to a soft chin. Their outlines come from copies set
    // back a little, so no line is drawn across her face where it steps in
    const skin = (w, h, y, d = hw, z = 0) => {
        b.box(w, h, d, 0, y, z, P.skin);
        b.box(w, h, d - 0.03, 0, y, z - 0.015, P.skin, { outline: true });
    };
    skin(hw, 0.42, 0.33);
    skin(hw - 0.12, 0.05, 0.095);
    skin(hw - 0.22, 0.04, 0.05, hw - 0.02, 0.01);
    [1, -1].forEach(side => {
        const x = 0.1 * side, y = 0.305, out = dx => x + dx * side;
        // Almond eye: white either side of a dark iris that the upper lid rests on, with a glint; a bold lash
        // line that ends level in a fine point past the outer corner, a dip at the inner corner, and a thin
        // lower lash line under the outer half
        b.box(0.086, 0.022, 0.016, x, y, front, '#fbf5f0');
        b.box(0.062, 0.034, 0.016, x, y, front, '#fbf5f0');
        b.box(0.04, 0.036, 0.02, x, y - 0.001, front, '#22170f');
        b.box(0.028, 0.042, 0.02, x, y - 0.001, front, '#22170f');
        b.box(0.026, 0.01, 0.022, x, y - 0.014, front, '#3d2a1f');
        b.box(0.012, 0.012, 0.01, x + 0.007, y + 0.006, front + 0.012, '#ffffff');
        b.box(0.09, 0.014, 0.024, out(0.002), y + 0.021, front + 0.001, '#140e0b');
        b.box(0.018, 0.009, 0.024, out(0.05), y + 0.0115, front + 0.001, '#140e0b');
        b.box(0.008, 0.01, 0.024, out(-0.042), y + 0.012, front + 0.001, '#140e0b');
        b.box(0.022, 0.006, 0.014, out(0.02), y - 0.02, front, '#4a3226');
        b.box(0.016, 0.006, 0.014, out(0.039), y - 0.014, front, '#4a3226');
        // Defined brow: a fuller head rising gently, then a crisp, thinner tail that runs on level rather
        // than falling away; and a faint blush
        b.box(0.064, 0.018, 0.016, out(-0.013), 0.3972, front, '#4a3226', { rot: [0, 0, 0.1 * side] });
        b.box(0.038, 0.012, 0.016, out(0.035), 0.4024, front, '#4a3226');
        b.box(0.06, 0.026, 0.01, 0.135 * side, 0.215, front, '#f3b8ae');
    });
    // Small nose with a soft, rounded tip and a shadow under it
    b.box(0.026, 0.05, 0.012, 0, 0.255, face + 0.002, P.skin);
    b.box(0.05, 0.034, 0.024, 0, 0.218, face + 0.008, P.skin);
    b.box(0.044, 0.01, 0.016, 0, 0.197, face + 0.004, P.skinShade);
    // Full, dusty rose lips, closed, with the corners lifting just a little
    b.box(0.068, 0.014, 0.014, 0, 0.164, front, '#c8736c');
    b.box(0.054, 0.006, 0.012, 0, 0.155, front, '#b05f5c');
    b.box(0.058, 0.016, 0.014, 0, 0.145, front, '#d4847e');
    [1, -1].forEach(side => b.box(0.01, 0.01, 0.014, 0.039 * side, 0.163, front, '#b5625d'));
    // Straight brown hair parted in the middle: the crown with the parting showing, two curtains that sweep
    // out from it over the corners of her forehead, and locks down both sides of her face past the jaw, the
    // ends a lighter brown
    b.box(hw + 0.05, 0.13, hw + 0.06, 0, 0.565, -0.01, P.hair, { outline: true });
    b.box(0.018, 0.1, 0.01, 0, 0.585, face + 0.02, shade(P.skin, 0.06));
    b.box(0.018, 0.012, hw * 0.5, 0, 0.63, face - hw * 0.25, shade(P.skin, 0.06));
    [1, -1].forEach(side => {
        b.box(0.22, 0.09, 0.07, 0.115 * side, 0.5, face - 0.005, P.hair, { rot: [0, 0, -0.5 * side] });
        b.box(0.06, 0.5, 0.08, (hw / 2 - 0.008) * side, 0.25, face - 0.015, P.hair, { outline: true });
        b.box(0.07, 0.05, 0.08, hw / 2 * side, -0.02, face - 0.02, shade(P.hairLight, 0.18), { outline: true });
        b.box(0.02, 0.26, 0.01, (hw / 2 - 0.022) * side, 0.27, face + 0.026, P.hairLight);
        b.box(0.07, 0.3, 0.12, (hw / 2 + 0.03) * side, 0.38, face - 0.08, P.hair);
    });
    buildGlasses(b, face);
    return b;
}

// Her glasses: big black cat-eye frames, the top rim a little thicker and sweeping up to a point at the outer
// corner, rounded underneath, with her eyes in the top half. One lens, from the nose (left) outwards; the
// other is its mirror image
const CAT_EYE = [
    '.............XX',
    'XXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXX.',
    'X............X.',
    'X............X.',
    'X............X.',
    'X...........X..',
    'X...........X..',
    'X..........X...',
    '.X.........X...',
    '.X........X....',
    '..XX....XX.....',
    '....XXXX.......'
];
const GLASSES = { px: 0.012, inner: 0.022, top: 0.384 };

function buildGlasses(b, face) {
    const { px, inner, top } = GLASSES, frame = '#16141a';
    [1, -1].forEach(side => CAT_EYE.forEach((row, r) => {
        for (const run of row.matchAll(/X+/g)) {
            const n = run[0].length;
            b.box(n * px, px, px, (inner + (run.index + n / 2) * px) * side, top - r * px, face + 0.036, frame);
        }
    }));
    // The bridge across the top of her nose
    b.box(inner * 2, px, px, 0, top - 1.5 * px, face + 0.036, frame);
}

// The clear lenses, filling the frames between their sides: see-through, so they stay out of the merged blocks
function buildLenses(face) {
    const { px, inner, top } = GLASSES, b = new Blocks();
    [1, -1].forEach(side => CAT_EYE.forEach((row, r) => {
        const runs = [...row.matchAll(/X+/g)];
        if (runs.length < 2) return;
        const from = runs[0].index + runs[0][0].length, to = runs[runs.length - 1].index;
        b.box((to - from) * px, px, 0.004, (inner + (from + to) / 2 * px) * side, top - r * px, face + 0.034, '#ffffff');
    }));
    const material = new THREE.MeshStandardMaterial({ color: '#e3f0fa', transparent: true, opacity: 0.05, roughness: 0.2, depthWrite: false });
    return b.mesh(material, { shadow: false });
}

// Her hair below the crown: the back and the sides down to her shoulders, with a few lighter strands
function buildHairFlow(P) {
    const b = new Blocks(), hw = P.headW;
    b.box(hw + 0.07, 0.6, 0.1, 0, -0.26, -hw / 2, P.hair, { outline: true });
    b.box(hw - 0.02, 0.54, 0.06, 0, -0.25, -hw / 2 + 0.06, shade(P.hair, 0.25));
    [1, -1].forEach(side => {
        b.box(0.075, 0.5, hw - 0.12, (hw / 2 + 0.04) * side, -0.27, 0.0, P.hair, { outline: true });
        b.box(0.09, 0.08, hw - 0.16, (hw / 2 + 0.05) * side, -0.53, -0.02, P.hairLight);
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
// The six faces of a unit cube: which way each looks, and its two triangles' corners in a flat list,
// counter-clockwise seen from outside
const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
].map(({ n, c }) => ({ n, corners: [0, 1, 2, 0, 2, 3].flatMap(m => c[m]) }));

const ID = {
    sand: 1, sandDeep: 2, sandstone: 3, dirt: 4, stone: 5, stoneDark: 6, seabed: 7, grass: 8, grassDark: 9, path: 10, rock: 11, pond: 12,
    deck: 13, pool: 14, wall: 15, trim: 16, glass: 17, glassDark: 18, slate: 19, seabedDeep: 20, seabedDark: 21,
    roofFlat: 22
};
const PALETTE = [];
for (const [name, id] of Object.entries(ID)) PALETTE[id] = color(COLORS[name]);

class VoxelGrid {
    // Blocks i0..i1 across, j0..j1 up, k0..k1 front to back, each `size` across
    constructor(i0, i1, j0, j1, k0, k1, size = B) {
        Object.assign(this, { i0, j0, k0, size, ni: i1 - i0 + 1, nj: j1 - j0 + 1, nk: k1 - k0 + 1 });
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

    // With `undersides: false` the faces looking down are left out too, for land the camera never goes below;
    // `variation` is how much lighter or darker one block can be than the next
    mesh({ undersides = true, variation = 0.1 } = {}) {
        const position = [], normal = [], colors = [], s = this.size;
        const faces = FACES.filter(face => undersides || face.n[1] >= 0);
        for (let a = 0; a < this.ni; a++) {
            for (let b = 0; b < this.nj; b++) {
                for (let c = 0; c < this.nk; c++) {
                    const id = this.cells[(a * this.nj + b) * this.nk + c];
                    if (!id) continue;
                    const i = a + this.i0, j = b + this.j0, k = c + this.k0;
                    // Each block a shade lighter or darker than its neighbours, like the texture of real blocks
                    const tint = 1 - variation * 0.7 + hash(i + j * 7, k, 3) * variation, p = PALETTE[id];
                    const red = p.r * tint, green = p.g * tint, blue = p.b * tint;
                    for (const { n, corners } of faces) {
                        if (this.get(i + n[0], j + n[1], k + n[2])) continue;
                        for (let v = 0; v < 18; v += 3) {
                            position.push((i - 0.5 + corners[v]) * s, (j + corners[v + 1]) * s, (k - 0.5 + corners[v + 2]) * s);
                            normal.push(n[0], n[1], n[2]);
                            colors.push(red, green, blue);
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
// blocks. We lie on two loungers near the front with the bay before us; behind us the beach rises to grass,
// a cottage and its garden, and at the back the resort with its pool and its car park behind it; to the left
// is a forest round a pond, to the right beach huts, a field of tulips, a windmill on its own hill and a
// pickleball court; the beach ends in rocks at the front left. The island rises out of a sea that runs to the horizon, so its blocks only go a little way below the
// water.
const ISLAND = { ci: 0, ck: 20, ri: 64, rk: 48 };
const ROCK = { i: -31, k: -13 };
// The lighthouse's rock, out in the sea beyond the bay (in world units)
const LIGHTHOUSE = { x: -22, z: -27 };
const COTTAGE = { i0: -15, i1: -9, k0: 14, k1: 19 };
const GARDEN = { i0: -19, i1: -6, k0: 12, k1: 22 };
const MILL = { i: 25, k: 35 };
const POND = { i: -26, k: 30, ri: 6.5, rk: 4 };
// The resort at the back of the island, like Vinpearl on Reu island in Ha Long Bay: a white neoclassical hotel
// whose wings curve round toward the sea, stepping down from its tall middle. Its curve is round block
// (ci, ck): the facade r1 blocks out from there and the back r2, the wings reaching `wing` degrees either side;
// the paved terrace in front starts `terrace` blocks out, at the grass's level `ground`
const RESORT = { ci: 0, ck: 2, r1: 32, r2: 46, wing: 28, terrace: 22, ground: 2 };
const DEG = Math.PI / 180;
const TULIPS = { i0: 14, i1: 29, k0: 16, k1: 26 };
// The pickleball court in its fence on the grass to the right, and the car park behind the resort
const COURT = { i0: 41, i1: 54, k0: 14, k1: 39 };
const CAR_PARK = { i0: -16, i1: 16, k0: 49, k1: 60 };
const inRect = (r, i, k, margin = 0) => i >= r.i0 - margin && i <= r.i1 + margin && k >= r.k0 - margin && k <= r.k1 + margin;

// 0 at the middle of the island, 1 at its edge
function islandRadius(i, k) {
    const di = (i - ISLAND.ci) / ISLAND.ri, dk = (k - ISLAND.ck) / ISLAND.rk;
    const a = Math.atan2(dk, di);
    return Math.hypot(di, dk) / (1 + 0.06 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 2.5) + 0.03 * Math.sin(9 * a));
}

const insideIsland = (i, k) => islandRadius(i, k) <= 1;
const shoreK = i => -6 + Math.round(1.6 * Math.sin(i * 0.21 + 0.5) + 0.8 * Math.sin(i * 0.53));
const grassK = i => 11 + Math.round(2 * Math.sin(i * 0.3 + 1.2));
const isRock = (i, k) => ((i - ROCK.i) / 6) ** 2 + ((k - ROCK.k) / 5) ** 2 < 1;
const isWater = (i, k) => !isRock(i, k) && k < shoreK(i);
const isGrass = (i, k) => !isRock(i, k) && k >= grassK(i);
// In the pond, or within `margin` blocks of it
const nearPond = (i, k, margin) => ((i - POND.i) / (POND.ri + margin)) ** 2 + ((k - POND.k) / (POND.rk + margin)) ** 2 < 1;
const isPond = (i, k) => nearPond(i, k, 0);

// Block (i, k) seen from the middle of the resort's curve: how far out, at what angle (0 straight out through
// the middle of the hotel), and how far along the facade that is, in blocks
function resortAt(i, k) {
    const a = Math.atan2(i - RESORT.ci, k - RESORT.ck);
    return { r: Math.hypot(i - RESORT.ci, k - RESORT.ck), a, u: a * RESORT.r1 };
}

// The paved terrace under and in front of the hotel: wide in front of the middle, a walk in front of the wings
function onTerrace(i, k) {
    // Quickly out if it's nowhere near
    if (k < RESORT.ck + RESORT.terrace * Math.cos(20 * DEG) || Math.abs(i - RESORT.ci) > RESORT.r2 * Math.sin(RESORT.wing * DEG) + 1) return false;
    const { r, a } = resortAt(i, k), side = Math.abs(a);
    return side <= RESORT.wing * DEG && r <= RESORT.r2 && ((r >= RESORT.terrace && side <= 20 * DEG) || r >= RESORT.r1 - 3);
}

// The pool, curving like the hotel, sunk a block into the terrace
function inPool(i, k) {
    const { r, a } = resortAt(i, k);
    return Math.abs(a) <= 16 * DEG && r >= 23.5 && r <= 28.5;
}

// The paved path from the beach straight up to the terrace
const onResortPath = (i, k) => Math.abs(i - RESORT.ci) <= 1 && k >= 10 && k < RESORT.ck + RESORT.terrace + 1;

// The gravel path from the beach up to the cottage door
function onPath(i, k) {
    const ax = -2, az = 7, bx = -12, bz = 13;
    const t = Math.max(0, Math.min(1, ((i - ax) * (bx - ax) + (k - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    return Math.hypot(i - (ax + t * (bx - ax)), k - (az + t * (bz - az))) < 0.9;
}

// Level of the top of a column. The water's own surface sits just under level 0
function topLevel(i, k) {
    if (isRock(i, k)) {
        return Math.hypot(i - ROCK.i, k - ROCK.k) < 2.6 ? 3 : 2 + (hash(i, k, 4) > 0.5 ? 1 : 0) + (hash(i, k, 5) > 0.8 ? 1 : 0);
    }
    const s = shoreK(i);
    if (k < s) return -1 - Math.min(Math.floor((s - 1 - k) / 2), 5);
    if (!isGrass(i, k)) return k - s > 10 ? 2 : 1;
    // The resort's terrace is level with the grass, its pool and the pond a block lower
    if (onTerrace(i, k)) return inPool(i, k) ? 1 : RESORT.ground;
    if (isPond(i, k)) return 1;
    // The court and the car park are level, and so is a strip of grass round them
    if (inRect(COURT, i, k, 1) || inRect(CAR_PARK, i, k, 1)) return 2;
    const mill = Math.round(3.4 * Math.exp(-((i - MILL.i) ** 2 + (k - MILL.k) ** 2) / 60));
    const bump = (k > 27 || (Math.abs(i) > 30 && k > 14)) && !nearPond(i, k, 2) && hash(i, k, 1) > 0.8 ? 1 : 0;
    return 2 + mill + bump;
}

// World height of the ground at a block
const ground = (i, k) => topLevel(i, k) * B;

function blockId(i, k, j, top) {
    const depth = top - 1 - j;
    if (isRock(i, k)) return depth === 0 ? ID.rock : hash(i, k, j) > 0.5 ? ID.stone : ID.stoneDark;
    if (depth === 0) {
        if (isWater(i, k)) return ID.seabed;
        if (isPond(i, k)) return ID.pond;
        if (onTerrace(i, k)) return inPool(i, k) ? ID.pool : ID.deck;
        if (onResortPath(i, k)) return ID.deck;
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

// Near the beach the water of the bay is clear, and the sand, the fish and their shadows show through it. Further
// out, and wherever it meets the open sea, it is deep and dark
const clearWater = (i, k) => insideIsland(i, k) && isWater(i, k) && topLevel(i, k) >= -4 &&
    [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, c]) => insideIsland(i + a, k + c));

function buildIsland() {
    const grid = new VoxelGrid(-62, 71, -6, 10, -32, 67);
    const columns = [];
    for (let i = -61; i <= 70; i++) {
        for (let k = -31; k <= 66; k++) {
            if (!insideIsland(i, k)) continue;
            const top = topLevel(i, k);
            if (isWater(i, k)) {
                // Under clear water the sand of the sea floor, darker where it's deeper; under deep water the
                // water's own blocks hide the floor, so only its depth is kept
                if (clearWater(i, k)) for (let j = top - 2; j < top; j++) grid.set(i, j, k, j < top - 1 ? ID.sandDeep : top >= -2 ? ID.seabed : top === -3 ? ID.seabedDeep : ID.seabedDark);
            } else {
                // Land reaches down as deep as the clear water beside it, so nothing shows under it through the water
                let bottom = SEA_FLOOR;
                for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (clearWater(i + a, k + c)) bottom = Math.min(bottom, topLevel(i + a, k + c) - 2);
                for (let j = bottom; j < top; j++) grid.set(i, j, k, blockId(i, k, j, top));
            }
            columns.push({ i, k, top });
        }
    }
    return { mesh: grid.mesh({ undersides: false }), columns };
}

// The resort's hotel, in white blocks. Every floor has a white balcony rail along the front with the windows
// set back behind it and piers between the rooms; the ground floor is an arcade; a cornice runs under the
// roof. The ends of the wings and the back have rows of windows too, with the door from the car park in the
// middle of the back. The wings have grey mansard roofs rising in steps to a paler flat top, with dormer
// windows on both slopes; the tower in the middle stands forward and is taller, with a rounded vault for a
// roof and a big arched window in its front. Also returns how high it reaches over each block, to keep the
// camera above it
function buildResort() {
    const { r1, r2, ground: g } = RESORT, wing = RESORT.wing * DEG;
    const grid = new VoxelGrid(-23, 23, g, g + 22, 24, 49), roofTop = new Map();
    for (let i = -23; i <= 23; i++) {
        for (let k = 24; k <= 49; k++) {
            const { r, a, u } = resortAt(i, k), along = Math.abs(u);
            const tower = along <= 3.2, front = tower ? r1 - 1 : r1, d = r - front;
            if (Math.abs(a) > wing || d < 0 || r > r2) continue;
            const floors = tower ? 7 : along <= 7.5 ? 6 : 6 - Math.ceil((along - 7.5) / 3.2);
            const walls = g + floors * 2, back = r2 - r < 1, pier = Math.floor(u + 99) % 3 === 0;
            // How far in from the end of its wing, and whether this is between the windows there
            const fromEnd = (wing - Math.abs(a)) * r, endPier = Math.floor(d + 99) % 3 === 0;
            let highest = 0;
            const put = (j, id) => {
                if (!id) return;
                grid.set(i, j, k, id);
                highest = Math.max(highest, j + 1);
            };
            for (let j = g; j < walls; j++) {
                const floor = Math.floor((j - g) / 2), upper = (j - g) % 2 === 1;
                if (d < 1) put(j, j === walls - 1 ? ID.trim : floor === 0 ? (pier ? ID.trim : 0) : !upper ? ID.trim : pier || (tower && along > 2.4) ? ID.wall : 0);
                else if (d < 2) put(j, floor === 0 ? ID.glassDark : pier ? ID.wall : ID.glass);
                else if (floor === 0 && back && along < 1.6) put(j, ID.glassDark);
                else put(j, upper && (back ? !pier : fromEnd < 1 && !endPier) ? ID.glass : ID.wall);
            }
            if (tower) {
                const rise = Math.round(3.5 * Math.sqrt(Math.max(0, 1 - (u / 3.8) ** 2)));
                for (let q = 0; q < rise; q++) put(walls + q, d >= 1 ? ID.slate : along < 1.2 && q < 2 ? ID.glass : ID.trim);
            } else {
                const depth = r2 - front, dormer = Math.floor(u + 99) % 3 === 1;
                for (let q = 0; q < 3; q++) {
                    if (d >= 1 + q && d < depth - 1 - q && fromEnd >= q) put(walls + q, q === 0 && dormer && (d < 2 || d >= depth - 2) ? ID.glass : q === 2 ? ID.roofFlat : ID.slate);
                }
            }
            roofTop.set(`${i},${k}`, highest);
        }
    }
    // Smoother white than the island's blocks
    const mesh = grid.mesh({ undersides: false, variation: 0.035 });
    mesh.castShadow = true;
    return { mesh, roofTop };
}

// The resort's finishing touches: a clock on the front of the tower's vault and a little dome with a flag on
// top, loungers and white umbrellas behind the pool looking out to sea, and lamps up the path from the beach
function resortDetails(b, glow) {
    const { ci, ck, r1, r2, ground: g } = RESORT;
    const spot = (r, deg) => [(ci + r * Math.sin(deg * DEG)) * B, (ck + r * Math.cos(deg * DEG)) * B];
    const eaves = (g + 14) * B, face = (ck + r1 - 1.5) * B, middle = (ck + (r1 - 1 + r2) / 2) * B;
    b.box(0.56, 0.56, 0.04, 0, eaves + 2.5 * B, face - 0.02, '#d8b45a');
    b.box(0.44, 0.44, 0.04, 0, eaves + 2.5 * B, face - 0.04, '#fbf7ec');
    b.box(0.03, 0.17, 0.03, 0, eaves + 2.5 * B + 0.07, face - 0.07, '#2b2b2f');
    b.box(0.13, 0.03, 0.03, 0.05, eaves + 2.5 * B, face - 0.07, '#2b2b2f');
    const top = eaves + 4 * B;
    b.box(0.7, 0.45, 0.7, 0, top + 0.22, middle, '#ffffff', { outline: true });
    [[0.62, 0.18], [0.44, 0.16], [0.24, 0.14]].reduce((y, [w, h]) => {
        b.box(w, h, w, 0, y + h / 2, middle, COLORS.slate);
        return y + h;
    }, top + 0.45);
    b.box(0.05, 0.9, 0.05, 0, top + 1.38, middle, '#d8b45a');
    b.box(0.34, 0.2, 0.02, 0.18, top + 1.7, middle, '#3d8fd1');
    // Loungers and umbrellas on the terrace behind the pool
    const lounger = (deg, cushion) => {
        const [x, z] = spot(30, deg), y = g * B, turn = turned(b, new THREE.Vector3(x, y, z), [0, deg * DEG, 0]);
        turn(0.3, 0.08, 0.72, x, y + 0.12, z, '#ffffff');
        turn(0.26, 0.05, 0.56, x, y + 0.185, z - 0.06, cushion);
        turn(0.26, 0.09, 0.14, x, y + 0.23, z + 0.26, '#ffffff');
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => turn(0.04, 0.08, 0.04, x + sx * 0.12, y + 0.04, z + sz * 0.3, '#d9d4c7'));
    };
    [-14, -10.5, -7, 7, 10.5, 14].forEach((deg, n) => lounger(deg, n % 2 ? '#3d8fd1' : '#f4a6b8'));
    [-12.25, 12.25].forEach(deg => {
        const [x, z] = spot(30.6, deg), y = g * B;
        b.box(0.04, 1.0, 0.04, x, y + 0.5, z, '#ffffff');
        b.box(0.8, 0.08, 0.8, x, y + 1.0, z, '#ffffff', { outline: true });
        b.box(0.5, 0.08, 0.5, x, y + 1.08, z, '#ffffff');
    });
    [[-2, 15], [2, 15], [-2, 20], [2, 20]].forEach(([i, k]) => lampPost(b, glow, i, k));
    // Over the door at the back, from the car park, a canopy on white columns
    const back = (ck + r2 + 0.5) * B, y = g * B;
    b.box(1.7, 0.08, 1.0, 0, y + 0.8, back + 0.5, '#ffffff', { outline: true });
    [-0.75, 0.75].forEach(x => b.box(0.08, 0.76, 0.08, x, y + 0.38, back + 0.9, '#ffffff'));
    glow.box(0.5, 0.03, 0.3, 0, y + 0.75, back + 0.4, COLORS.glow);
}

// On the sand under the clear water: shells, starfish and pebbles, and where it's deep enough for them, tufts of
// seaweed and little corals
function seaFloor(b, columns) {
    for (const { i, k, top } of columns) {
        if (!clearWater(i, k) || hash(i, k, 21) < 0.86) continue;
        const x = i * B + (hash(i, k, 23) - 0.5) * 0.12, z = k * B + (hash(i, k, 24) - 0.5) * 0.12, y = top * B;
        const kind = Math.floor(hash(i, k, 22) * (top <= -2 ? 5 : 3));
        if (kind === 0) {
            b.box(0.11, 0.03, 0.08, x, y + 0.015, z, hash(i, k, 25) > 0.5 ? '#fbe4ec' : '#fff1dc', { rot: [0, hash(i, k, 26) * 3, 0] });
        } else if (kind === 1) {
            [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [1, -2], [-1, -2]].forEach(([a, c]) =>
                b.box(0.04, 0.025, 0.04, x + a * 0.04, y + 0.012, z + c * 0.04, '#f2896d'));
        } else if (kind === 2) {
            [[0, 0, 0.12], [0.1, 0.05, 0.08], [-0.06, 0.08, 0.07]].forEach(([dx, dz, w]) => b.box(w, w * 0.7, w, x + dx, y + w * 0.35, z + dz, '#9aa3ab'));
        } else if (kind === 3) {
            for (let n = 0; n < 3; n++) b.box(0.03, 0.16 + n * 0.07, 0.03, x + (n - 1) * 0.06, y + 0.08 + n * 0.035, z + (n % 2) * 0.05, n % 2 ? '#5aa86a' : '#3f8f5a');
        } else {
            const hex = ['#ff7f8a', '#ffa45c', '#b67de0'][Math.floor(hash(i, k, 27) * 3)];
            [[0, 0.1, 0], [0.06, 0.16, 0.03], [-0.05, 0.13, -0.03], [0.02, 0.22, -0.02]].forEach(([dx, h, dz]) => b.box(0.05, h, 0.05, x + dx, y + h / 2, z + dz, hex));
        }
    }
}

// Where the edge of the beach runs, smoothly (shoreK without the rounding into blocks)
const shoreLine = i => -6 + 1.6 * Math.sin(i * 0.21 + 0.5) + 0.8 * Math.sin(i * 0.53);

// Little fish swimming in schools in the clear water along the beach, and a turtle paddling slowly past, just
// under the surface; their shadows fall on the sand below
function sealife() {
    // Each school: where along the beach it swims (in blocks), how far either way, its colour, how many, how fast
    const fish = [];
    [[-6, 7, '#cfd8e3', 7, 0.16], [8, 6, '#ffd23f', 5, -0.2], [-17, 5, '#ff8a3d', 4, 0.22], [16, 5, '#5b9be6', 5, 0.18]].forEach(([along, range, hex, count, speed], s) => {
        const rand = random(90 + s), start = rand() * 6;
        for (let n = 0; n < count; n++) {
            fish.push({ along, range, hex, speed, start, di: (rand() - 0.5) * 1.6, dk: (rand() - 0.5) * 1.2, dy: (rand() - 0.5) * 0.06, size: 0.85 + rand() * 0.35, beat: rand() * 6 });
        }
    });
    const material = () => new THREE.MeshStandardMaterial({ roughness: 0.5 });
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.07, 0.05), material(), fish.length);
    const tails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), material(), fish.length);
    fish.forEach((f, n) => {
        bodies.setColorAt(n, color(f.hex));
        tails.setColorAt(n, color(shade(f.hex, 0.18)));
    });
    bodies.castShadow = tails.castShadow = true;
    // The turtle: a domed shell with a lighter pattern, its head, and two pairs of flippers that paddle
    const turtle = new THREE.Group(), shell = new Blocks();
    turtle.rotation.order = 'YXZ';
    shell.box(0.34, 0.08, 0.4, 0, 0, 0, '#4f6b3a', { outline: true });
    shell.box(0.26, 0.05, 0.3, 0, 0.06, 0, '#6b8a4a');
    shell.box(0.12, 0.03, 0.14, 0, 0.09, 0, '#7d9c58');
    shell.box(0.1, 0.07, 0.12, 0, 0.0, 0.25, '#93b36e', { outline: true });
    shell.box(0.02, 0.02, 0.01, 0.03, 0.02, 0.31, '#1d2630');
    shell.box(0.02, 0.02, 0.01, -0.03, 0.02, 0.31, '#1d2630');
    shell.addTo(turtle);
    const flippers = [[0.12, 1], [-0.12, -1]].map(([z, front]) => {
        const pair = new THREE.Group(), f = new Blocks();
        pair.position.z = z;
        [-1, 1].forEach(side => f.box(front > 0 ? 0.16 : 0.1, 0.02, front > 0 ? 0.08 : 0.06, side * (front > 0 ? 0.22 : 0.18), -0.01, 0, '#93b36e'));
        pair.add(f.mesh());
        turtle.add(pair);
        return { pair, front };
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const size = new THREE.Vector3();
    function update(t) {
        fish.forEach((f, n) => {
            // Round a long thin loop along the beach, a little way out from the sand
            const a = f.start + t * f.speed, i = f.along + Math.cos(a) * f.range + f.di;
            p.set(i * B, -0.27 + f.dy + Math.sin(t * 1.5 + f.beat) * 0.02, (shoreLine(i) - 4.4 + Math.sin(a) * 1.3 + f.dk) * B);
            const heading = Math.atan2(-Math.cos(a) * 1.3, -Math.sin(a) * f.range) + (f.speed < 0 ? Math.PI : 0);
            size.setScalar(f.size);
            q.setFromAxisAngle(up, heading);
            m.compose(p, q, size);
            bodies.setMatrixAt(n, m);
            // The tail beats behind it
            v.set(-0.105 * f.size, 0, 0).applyQuaternion(q).add(p);
            q.setFromAxisAngle(up, heading + Math.sin(t * 12 + f.beat) * 0.5);
            m.compose(v, q, size);
            tails.setMatrixAt(n, m);
        });
        bodies.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true;
        const a = t * 0.045, i = 2 + Math.cos(a) * 11;
        turtle.position.set(i * B, -0.45 + Math.sin(t * 0.8) * 0.03, (shoreLine(i) - 5.6 + Math.sin(a) * 0.8) * B);
        turtle.rotation.set(Math.sin(t * 0.8) * 0.05, Math.atan2(-Math.sin(a) * 11, Math.cos(a) * 0.8), 0);
        flippers.forEach(({ pair, front }) => { pair.rotation.z = Math.sin(t * 2.2 + (front > 0 ? 0 : 1.5)) * 0.35; });
    }
    update(0);
    return { meshes: [bodies, tails, turtle], update };
}

// Two dolphins at the mouth of the bay, in front of the yacht, that leap one after the other every few seconds,
// splashing as they come out of the water and go back in
function dolphins() {
    const group = new THREE.Group(), PERIOD = 8, LEAP = 1.8, REACH = 3.4, HEIGHT = 1.6;
    const pod = [[-3, -9.5, 0], [-6, -11, 1.1]].map(([x, z, delay]) => {
        const body = new THREE.Group(), b = new Blocks(), grey = '#5f7f99';
        body.rotation.order = 'YXZ';
        b.box(0.3, 0.28, 1.0, 0, 0, 0, grey, { outline: true });
        b.box(0.24, 0.08, 0.8, 0, -0.12, 0.02, '#dfe7ee');
        b.box(0.24, 0.22, 0.22, 0, 0, 0.6, grey, { outline: true });
        b.box(0.1, 0.08, 0.2, 0, -0.04, 0.8, '#7d97ad');
        b.box(0.05, 0.2, 0.22, 0, 0.22, -0.05, grey, { rot: [-0.5, 0, 0] });
        b.box(0.16, 0.14, 0.32, 0, 0.02, -0.64, grey);
        b.box(0.56, 0.05, 0.16, 0, 0.02, -0.86, grey, { outline: true });
        [-1, 1].forEach(side => {
            b.box(0.2, 0.04, 0.12, side * 0.2, -0.1, 0.3, grey, { rot: [0, 0, side * 0.5] });
            b.box(0.03, 0.03, 0.02, side * 0.125, 0.05, 0.66, '#1d2630');
        });
        b.addTo(body);
        // White water thrown up where it breaks the surface
        const splash = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: COLORS.foam, roughness: 0.6 }), 12);
        group.add(body, splash);
        return { body, splash, x, z, delay };
    });
    // Where the leap breaks the surface on the way out and on the way back in (fractions of the leap)
    const out = (1 - Math.sqrt(1 - 0.5 / HEIGHT)) / 2, back = 1 - out;
    const m = new THREE.Matrix4();
    function update(t) {
        pod.forEach(d => {
            const u = ((((t - d.delay) % PERIOD) + PERIOD) % PERIOD) / LEAP;
            d.body.visible = u <= 1;
            if (u <= 1) {
                // Along an arc, from under the water up and back down, nose following the arc
                d.body.position.set(d.x - REACH / 2 + u * REACH, SEA_Y - 0.5 + 4 * u * (1 - u) * HEIGHT, d.z);
                d.body.rotation.set(-Math.atan((1 - 2 * u) * 4 * HEIGHT / REACH), Math.PI / 2, 0);
            }
            // The splash from the last time it broke the surface, if that was less than 0.7 s ago
            let age = -1, at = 0;
            for (const crossing of [out, back]) {
                const since = (u - crossing) * LEAP;
                if (since >= 0 && since < 0.7 && (age < 0 || since < age)) {
                    age = since;
                    at = d.x - REACH / 2 + crossing * REACH;
                }
            }
            for (let n = 0; n < 12; n++) {
                if (age < 0) {
                    m.makeScale(0, 0, 0);
                } else {
                    const a = (n / 12) * Math.PI * 2, r = 0.15 + age * (0.8 + (n % 3) * 0.25), s = 0.1 * (1 - age / 0.7);
                    m.makeScale(s, s, s).setPosition(at + Math.cos(a) * r, SEA_Y + age * (2 + (n % 2)) - age * age * 4.5, d.z + Math.sin(a) * r);
                }
                d.splash.setMatrixAt(n, m);
            }
            d.splash.instanceMatrix.needsUpdate = true;
        });
    }
    update(0);
    return { group, update };
}

// A small island out in the sea: grass inside a rim of sand, or a heap of bare rock
function buildSeaIsland(radius, seed, rocky) {
    const rand = random(seed);
    const n = radius + 1;
    const grid = new VoxelGrid(-n, n, SEA_FLOOR, 6, -n, n);
    const tops = [];
    for (let i = -n; i <= n; i++) {
        for (let k = -n; k <= n; k++) {
            const r = Math.hypot(i, k) / (radius * (1 + 0.12 * Math.sin(Math.atan2(k, i) * 3 + seed)));
            if (r > 1) continue;
            const top = rocky ? (r < 0.45 ? 4 : r < 0.8 ? 2 + (rand() > 0.4 ? 1 : 0) : 1 + (rand() > 0.6 ? 1 : 0))
                : r > 0.72 ? 1 : 2 + (r < 0.4 && rand() > 0.6 ? 1 : 0);
            for (let j = SEA_FLOOR; j < top; j++) {
                const depth = top - 1 - j;
                grid.set(i, j, k, rocky ? (depth === 0 ? ID.rock : rand() > 0.5 ? ID.stone : ID.stoneDark)
                    : top === 1 ? (depth === 0 ? ID.sand : ID.sandDeep)
                    : depth === 0 ? (rand() > 0.7 ? ID.grassDark : ID.grass) : depth === 1 ? ID.dirt : ID.sandDeep);
            }
            tops.push({ i, k, top });
        }
    }
    return { mesh: grid.mesh({ undersides: false }), tops };
}

// Far-off land round the bay in big blocks of `size`: hills wooded at their feet rising to bare peaks, which
// the haze turns the colour of the sky. It is `along` by `across` blocks either side of its middle at (x, z),
// laid out along `angle`
function farLand(x, z, angle, along, across, height, size, seed) {
    const grid = new VoxelGrid(-along, along, -1, height + 1, -across, across, size);
    for (let i = -along; i <= along; i++) {
        for (let k = -across; k <= across; k++) {
            const u = i / along, v = k / across, shape = 1 - u * u * 0.85 - v * v;
            if (shape <= 0) continue;
            const peaks = 0.55 + 0.25 * Math.sin(i * 0.37 + seed) + 0.2 * Math.sin(i * 0.91 + k * 0.5 + seed * 2);
            const top = Math.max(1, Math.round(height * shape * peaks));
            for (let j = -1; j < top; j++) {
                grid.set(i, j, k, j < top - 1 ? ID.dirt : top >= height * 0.62 ? (hash(i, k, 15) > 0.4 ? ID.rock : ID.stone)
                    : top === 1 ? ID.sand : top >= height * 0.3 ? ID.grassDark : ID.grass);
            }
        }
    }
    const mesh = grid.mesh({ undersides: false });
    mesh.position.set(x, 0, z);
    mesh.rotation.y = angle;
    return mesh;
}

// ----- The bay: one column of water blocks over each piece of sea floor -----
// The columns rise and fall on the swell, and waves of raised blocks roll in from the mouth of the bay, two at a
// time, growing and whitening on their crests, and break on the beach, where white water runs up the sand and
// back. The clear water near the beach is a see-through layer at the surface, clearer in the shallows, and
// thick only where a wave lifts it
function buildWater(columns) {
    const cols = columns.filter(c => isWater(c.i, c.k)).map(c => ({ ...c, x: c.i * B, z: c.k * B, base: c.top * B, shore: shoreK(c.i) }));
    const mouth = Math.min(...cols.map(w => w.k));
    const geometry = new THREE.BoxGeometry(B, 1, B).translate(0, 0.5, 0);
    // The sides of the water blocks are lit and catch the sunset just like their tops, so where a wave lifts
    // some blocks above the ones in front, their edges don't show as dark lines across the bay that flicker
    // as the wave passes
    const water = geometry.clone(), normal = water.attributes.normal;
    for (let n = 0; n < normal.count; n++) if (normal.getY(n) === 0) normal.setXYZ(n, 0, 1, 0);
    const clear = cols.filter(w => clearWater(w.i, w.k));
    const parts = [[clear.filter(w => w.top >= -2), 0.5], [clear.filter(w => w.top < -2), 0.72], [cols.filter(w => !clearWater(w.i, w.k)), 1]].map(([list, opacity]) => {
        const material = new THREE.MeshStandardMaterial({ color: '#d8ecf6', roughness: 0.3, transparent: opacity < 1, opacity });
        const mesh = new THREE.InstancedMesh(water, material, list.length);
        mesh.receiveShadow = true;
        return { list, mesh, clear: opacity < 1 };
    });
    // The white water running up the beach: a flat block on the sand at the top of each column of the bay
    const edge = [...new Map(cols.filter(w => w.k === w.shore - 1).map(w => [w.i, w])).values()];
    const swash = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: COLORS.foam, roughness: 0.5, transparent: true, opacity: 0.85 }), edge.length);
    const deep = color(COLORS.waterDeep), shallow = color(COLORS.waterShallow), foam = color(COLORS.foam);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    function update(t) {
        // How far each wave has come, from 0 at the mouth of the bay to 1 on the beach
        const waves = [0, 0.5].map(offset => (t / 6 + offset) % 1);
        for (const { list, mesh, clear } of parts) {
            list.forEach((w, n) => {
                let wave = 0;
                waves.forEach((along, o) => {
                    const crest = mouth + (w.shore - mouth) * along + Math.sin(w.i * 0.17 + o * 4) * 1.2;
                    wave = Math.max(wave, Math.exp(-((w.k - crest) ** 2) / 2.2) * smoothstep(1, 0.9, along) * (0.45 + 0.55 * along));
                });
                const nearShore = smoothstep(w.shore - 6, w.shore - 1, w.k);
                const top = -0.06 + Math.sin(t * 1.3 + w.i * 0.31 + w.k * 0.55) * 0.04 + wave * 0.26;
                const base = clear ? Math.min(top - 0.08, -0.16) : w.base;
                m.makeScale(1, top - base, 1).setPosition(w.x, base, w.z);
                mesh.setMatrixAt(n, m);
                c.copy(deep).lerp(shallow, smoothstep(-5, -1, w.top) * 0.8 + nearShore * 0.2)
                    .lerp(foam, Math.min(wave * wave * (0.35 + nearShore * 0.65) + (w.k === w.shore - 1 ? 0.3 : 0), 1));
                mesh.setColorAt(n, c);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
        }
        edge.forEach((w, n) => {
            // Up the sand as a wave breaks, a little further in some places than others, and back down
            const run = Math.max(...waves.map(along => Math.sin(smoothstep(0.86, 1, along) * Math.PI))) * (0.8 + hash(w.i, 0, 17) * 0.9);
            m.makeScale(0.98, 0.02, Math.max(run, 0.001)).setPosition(w.x, ground(w.i, w.shore), (w.shore - 0.5 + run / 2) * B);
            swash.setMatrixAt(n, m);
        });
        swash.instanceMatrix.needsUpdate = true;
    }
    update(0);
    return { meshes: [...parts.map(part => part.mesh), swash], update };
}

// The open sea round the island, out to the horizon: one flat surface drawn as square blocks of water lined
// up with the island's, each a shade lighter or darker and shimmering, with swell rolling in toward the island,
// white caps breaking along its crests, and a path of glitter under the sun. Where the blocks get too small to
// see, they fade into an even colour. It leaves out the island's own blocks, so the clear water of the bay
// shows the sea floor and not this
function openSea() {
    const uniforms = { time: { value: 0 }, sunDir: { value: SUN_DIR }, glint: { value: color(COLORS.glow) } };
    const material = new THREE.MeshStandardMaterial({ color: COLORS.waterDeep, roughness: 0.3 });
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vSea;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                varying vec3 vSea;
                uniform float time;
                uniform vec3 sunDir, glint;
                float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                // islandRadius(), for block (i, k)
                float islandRadius(vec2 c) {
                    vec2 d = (c - vec2(${ISLAND.ci.toFixed(1)}, ${ISLAND.ck.toFixed(1)})) / vec2(${ISLAND.ri.toFixed(1)}, ${ISLAND.rk.toFixed(1)});
                    float a = atan(d.y, d.x);
                    return length(d) / (1.0 + 0.06 * sin(3.0 * a + 1.0) + 0.05 * sin(5.0 * a + 2.5) + 0.03 * sin(9.0 * a));
                }`)
            .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( diffuse, opacity );
                vec2 blockAt = vSea.xz / ${B} + 0.5, cell = floor(blockAt), inBlock = fract(blockAt);
                if (islandRadius(cell) < 0.9999) discard;
                float seen = 1.0 - smoothstep(0.25, 0.8, max(fwidth(blockAt.x), fwidth(blockAt.y)));
                float shade = seaHash(cell), shimmer = sin(time * 1.7 + cell.x * 0.5 + cell.y * 0.8);
                float edge = min(min(inBlock.x, 1.0 - inBlock.x), min(inBlock.y, 1.0 - inBlock.y));
                vec2 cellPos = cell * ${B};
                float swell = 0.6 * sin(dot(cellPos, vec2(0.28, 0.96)) * 0.9 - time * 1.3) + 0.4 * sin(dot(cellPos, vec2(-0.55, 0.83)) * 1.6 - time * 2.0);
                float cap = smoothstep(0.78, 0.95, swell) * step(0.5, shade);
                diffuseColor.rgb *= 1.0 + seen * ((shade - 0.5) * 0.06 + shimmer * 0.02 + swell * 0.08 - (1.0 - smoothstep(0.0, 0.06, edge)) * 0.03);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), cap * seen * 0.8);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                vec3 bounce = reflect(normalize(vSea - cameraPosition), vec3(0.0, 1.0, 0.0));
                float path = pow(max(dot(bounce, sunDir), 0.0), 60.0);
                float twinkle = step(0.55, fract(shade * 13.7 + time * (0.15 + 0.35 * shade)));
                totalEmissiveRadiance += glint * path * mix(0.12, 0.6, mix(0.5, twinkle, seen));`);
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), material);
    mesh.position.y = SEA_Y;
    mesh.receiveShadow = true;
    return { mesh, uniforms };
}

// White water lapping round a coast: flat blocks on the open sea all along the land, and a broken ring
// beyond. `land(i, k)` says which blocks are land and `open(i, k)` which are open sea; (x, z) is where block
// (0, 0) is
function coastFoam(rings, land, open, i0, i1, k0, k1, x = 0, z = 0) {
    // Which blocks are land, worked out once for the area and a margin of two round it
    const nk = k1 - k0 + 5, isLand = new Uint8Array((i1 - i0 + 5) * nk);
    for (let i = i0 - 2; i <= i1 + 2; i++) for (let k = k0 - 2; k <= k1 + 2; k++) isLand[(i - i0 + 2) * nk + k - k0 + 2] = land(i, k) ? 1 : 0;
    for (let i = i0; i <= i1; i++) {
        for (let k = k0; k <= k1; k++) {
            if (!open(i, k)) continue;
            let near = 3;
            for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) if (isLand[(i + a - i0 + 2) * nk + k + c - k0 + 2]) near = Math.min(near, Math.max(Math.abs(a), Math.abs(c)));
            if (near > 2 || (near === 2 && hash(i + x, k + z, 13) > 0.55)) continue;
            const w = B * (0.75 + hash(i + x, k + z, 14) * 0.25);
            rings[near - 1].box(w, 0.02, w, x + i * B, SEA_Y + 0.012, z + k * B, '#ffffff');
        }
    }
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
    const leaf = ['#4f9a4a', '#5aa953', '#468b42', '#63b35a'], crown = [];
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 0; dy <= 3; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (dx * dx + dz * dz + (dy - 1.3) ** 2 * 1.5 > 6.2 || rand() < 0.1) continue;
                crown.push([dx, dy, dz, leaf[Math.floor(rand() * leaf.length)]]);
            }
        }
    }
    cubes(b, B, new THREE.Vector3(x, top - B / 2, z), crown);
    return { x, z, top };
}

function pineTree(b, i, k, height) {
    const x = i * B, z = k * B, y = ground(i, k), s = 0.24;
    // A trunk three cubes high, then layers of needles narrowing to the top
    const cells = [0, 1, 2].map(n => [0, n, 0, '#6b4629']);
    const layers = height >= 4 ? [2, 2, 1, 1, 1, 0, 0] : [2, 1, 1, 0, 0];
    layers.forEach((r, n) => {
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
                cells.push([dx, 3 + n, dz, (n + dx + dz) % 2 ? '#2f6e4f' : '#3a7f5c']);
            }
        }
    });
    cubes(b, s, new THREE.Vector3(x, y + s / 2, z), cells);
    b.box(s * 0.6, s, s * 0.6, x, y + (3 + layers.length) * s + s / 2, z, '#3a7f5c');
}

// ----- Where we lie: two loungers side by side under a big umbrella, built facing +z (out to sea) -----
// How far the loungers' backs, and we, lean back from upright
const RECLINE = 0.87;

// A wooden lounger with a striped cushion, its back raised to RECLINE; x is its middle. Whoever lies on it
// has their hips at z = 0, the seat's top at 0.42
function lounger(b, x, stripe) {
    const W = 1.1, wood = COLORS.woodLight, dark = COLORS.wood;
    b.box(W, 0.08, 1.7, x, 0.3, 0.23, wood, { outline: true });
    [[-1, -0.55], [1, -0.55], [-1, 1.0], [1, 1.0]].forEach(([side, z]) => b.box(0.08, 0.26, 0.08, x + side * (W / 2 - 0.07), 0.13, z, dark));
    // Seat cushion, striped along its length
    const stripes = 5, sw = (W - 0.1) / stripes;
    for (let n = 0; n < stripes; n++) b.box(sw, 0.08, 1.3, x - (W - 0.1) / 2 + (n + 0.5) * sw, 0.38, 0.43, n % 2 ? '#ffffff' : stripe);
    // The back, raised about its foot, with its own cushion and a pillow at the top
    const back = turned(b, new THREE.Vector3(x, 0.42, -0.11), [-RECLINE, 0, 0]);
    for (let n = 0; n < stripes; n++) back(sw, 1.02, 0.08, x - (W - 0.1) / 2 + (n + 0.5) * sw, 0.93, -0.15, n % 2 ? '#ffffff' : stripe);
    back(W, 1.06, 0.06, x, 0.92, -0.22, wood, { outline: true });
    back(0.56, 0.12, 0.12, x, 1.36, -0.07, '#ffffff', { outline: true });
    // Two struts propping the back up
    [-1, 1].forEach(side => b.box(0.06, 0.31, 0.06, x + side * (W / 2 - 0.07), 0.495, -0.58, dark));
}

// A big beach umbrella planted at (x, z), its pole leaning by `tilt` (turns about x, then z); the canopy steps
// up in rings to the top, in stripes of colour and white, with a scalloped edge
function parasol(b, x, z, height, radius, tilt, stripe) {
    const lean = turned(b, new THREE.Vector3(x, 0, z), tilt);
    lean(0.08, height, 0.08, x, height / 2, z, '#f4f4f4', { outline: true });
    const cell = 0.24, rings = [radius, radius * 0.76, radius * 0.52, radius * 0.28, 0];
    for (let r = 0; r < 4; r++) {
        const n = Math.ceil(rings[r] / cell);
        for (let a = -n; a <= n; a++) {
            for (let c = -n; c <= n; c++) {
                const d = Math.hypot(a, c) * cell;
                if (d > rings[r] || (r < 3 && d <= rings[r + 1])) continue;
                const sector = Math.floor(((Math.atan2(c, a) + Math.PI) / (Math.PI * 2)) * 8);
                const hex = sector % 2 ? '#ffffff' : stripe;
                lean(cell, 0.13, cell, x + a * cell, height + r * 0.13, z + c * cell, hex);
                if (r === 0 && d > rings[0] - cell && (a + c) % 2 === 0) lean(cell, 0.1, cell, x + a * cell, height - 0.11, z + c * cell, hex);
            }
        }
    }
    lean(0.12, 0.14, 0.12, x, height + 0.58, z, '#f4f4f4');
}

// A little wooden table with two coconuts to drink from, each with a straw and a paper umbrella
function drinksTable(b, x, z) {
    b.box(0.42, 0.05, 0.42, x, 0.47, z, COLORS.woodLight, { outline: true });
    b.box(0.07, 0.44, 0.07, x, 0.23, z, COLORS.wood);
    b.box(0.26, 0.03, 0.26, x, 0.015, z, COLORS.wood);
    [[-0.09, 0.06, '#f4a6b8'], [0.09, -0.06, '#5fb0e0']].forEach(([dx, dz, hex]) => {
        b.box(0.16, 0.14, 0.16, x + dx, 0.565, z + dz, '#7a5233');
        b.box(0.11, 0.02, 0.11, x + dx, 0.64, z + dz, '#f6efe2');
        b.box(0.02, 0.16, 0.02, x + dx + 0.03, 0.71, z + dz, hex, { rot: [0, 0, -0.3] });
        b.box(0.012, 0.14, 0.012, x + dx - 0.03, 0.7, z + dz, '#f4f4f4');
        b.box(0.09, 0.025, 0.09, x + dx - 0.03, 0.77, z + dz, hex);
    });
}

// A small dog lying on the sand beside her: ginger, with a cream chest, muzzle and paws, pointed ears and a
// curled tail, built facing +z. Its head and tail move on their own
function buildDog() {
    const dog = new THREE.Group(), ginger = '#d9884a', cream = '#f7ead8', dark = '#2a1d16';
    // Lying down, the back legs tucked in and the front legs out in front
    const body = new Blocks();
    body.box(0.26, 0.17, 0.44, 0, 0.115, 0, ginger, { outline: true });
    body.box(0.3, 0.15, 0.16, 0, 0.1, -0.15, ginger, { outline: true });
    body.box(0.2, 0.12, 0.05, 0, 0.12, 0.215, cream);
    [-1, 1].forEach(side => {
        body.box(0.08, 0.05, 0.13, side * 0.12, 0.025, -0.07, cream);
        body.box(0.07, 0.06, 0.2, side * 0.07, 0.03, 0.29, ginger, { outline: true });
        body.box(0.075, 0.05, 0.07, side * 0.07, 0.025, 0.41, cream);
    });
    body.addTo(dog);
    const head = new THREE.Group(), face = new Blocks();
    head.position.set(0, 0.2, 0.2);
    face.box(0.24, 0.2, 0.2, 0, 0.1, 0.05, ginger, { outline: true });
    face.box(0.13, 0.08, 0.09, 0, 0.04, 0.19, cream, { outline: true });
    face.box(0.05, 0.035, 0.02, 0, 0.075, 0.24, dark);
    [-1, 1].forEach(side => {
        face.box(0.035, 0.04, 0.02, side * 0.062, 0.13, 0.152, dark);
        face.box(0.012, 0.012, 0.01, side * 0.062 + 0.008, 0.142, 0.163, '#ffffff');
        face.box(0.07, 0.05, 0.02, side * 0.075, 0.055, 0.151, cream);
        face.box(0.07, 0.1, 0.05, side * 0.08, 0.24, 0.02, ginger, { outline: true });
        face.box(0.035, 0.05, 0.05, side * 0.095, 0.31, 0.02, ginger);
        face.box(0.04, 0.06, 0.01, side * 0.08, 0.235, 0.048, '#f2b8b0');
    });
    face.addTo(head);
    const tail = new THREE.Group(), curl = new Blocks();
    tail.position.set(0, 0.17, -0.23);
    curl.box(0.07, 0.07, 0.1, 0, 0.03, -0.04, ginger);
    curl.box(0.07, 0.07, 0.07, 0, 0.09, -0.06, ginger);
    curl.box(0.07, 0.07, 0.06, 0, 0.13, -0.02, cream);
    curl.addTo(tail);
    dog.add(head, tail);
    return { dog, head, tail };
}

// A pair of flip-flops left on the sand
function flipFlops(b, x, z, hex) {
    [[-0.07, 0, -0.12], [0.08, 0.04, 0.1]].forEach(([dx, dz, turn]) => {
        b.box(0.1, 0.025, 0.25, x + dx, 0.0125, z + dz, hex, { rot: [0, turn, 0] });
        b.box(0.08, 0.03, 0.025, x + dx + Math.sin(turn) * 0.05, 0.035, z + dz + Math.cos(turn) * 0.05, '#ffffff', { rot: [0, turn, 0] });
    });
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

// A wooden jetty out over the bay, with a little boat tied at the end. Its deck starts on the beach, a little
// above the sand, so the two don't flicker through each other
function jetty(b, i, kFrom, kTo) {
    const x = (i + 0.5) * B, deck = ground(i, kFrom) + 0.07, postTop = deck - 0.04, postFoot = -0.55;
    for (let k = kFrom; k >= kTo; k--) {
        b.box(2 * B - 0.02, 0.08, B - 0.03, x, deck, k * B, k % 2 ? COLORS.wood : '#93673f');
        if (k % 2 === 0) [-1, 1].forEach(side => b.box(0.09, postTop - postFoot, 0.09, x + side * (B - 0.05), (postTop + postFoot) / 2, k * B, COLORS.woodDark));
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
        for (let k = 14; k <= 20; k++) {
            const y = ground(i, k);
            b.box(B * 0.9, 0.04, B * 0.9, i * B, y + 0.02, k * B, '#7a5233');
            b.box(0.06, 0.12, 0.06, i * B, y + 0.1, k * B, '#5aa953');
            if ((i + k) % 3 === 0) b.box(0.06, 0.05, 0.06, i * B, y + 0.17, k * B, i === -17 ? '#e8455a' : '#ff9f43');
        }
    }
}

function lighthouse(b, glow, x, y, z) {
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

// A windmill on its hill: a white tower narrowing up to a slate cap, a door and windows looking out to sea,
// and four sails, returned on their own so they can turn
function windmill(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k), course = 0.42, courses = 7;
    const half = h => (1.6 - Math.floor(h / course) * 0.1) / 2;
    for (let n = 0; n < courses; n++) b.box(1.6 - n * 0.1, course, 1.6 - n * 0.1, x, y + (n + 0.5) * course, z, n % 2 ? '#f4f1ea' : '#e6dfd2', { outline: true });
    const top = y + courses * course;
    b.box(0.4, 0.66, 0.06, x, y + 0.33, z - half(0) - 0.02, COLORS.woodDark);
    [1.3, 2.2].forEach(h => b.box(0.22, 0.22, 0.06, x, y + h, z - half(h) - 0.02, '#7fb8e0'));
    b.box(1.2, 0.3, 1.3, x, top + 0.15, z, COLORS.roof, { outline: true });
    b.box(0.9, 0.26, 1.0, x, top + 0.43, z, '#3f4a56');
    b.box(0.5, 0.2, 0.6, x, top + 0.66, z, COLORS.roof);
    const sails = new THREE.Group();
    sails.position.set(x, top + 0.2, z - 0.75);
    const s = new Blocks(), hub = new THREE.Vector3();
    s.box(0.24, 0.24, 0.24, 0, 0, 0, COLORS.woodDark);
    s.box(0.1, 0.1, 0.4, 0, 0, 0.25, COLORS.woodDark);
    for (let a = 0; a < 4; a++) {
        const arm = turned(s, hub, [0, 0, a * Math.PI / 2]);
        arm(0.08, 2.1, 0.06, 0, 1.12, 0, COLORS.woodDark);
        arm(0.48, 1.7, 0.03, 0.29, 1.22, -0.03, '#fbf8f2');
        for (let n = 0; n < 7; n++) arm(0.52, 0.035, 0.05, 0.29, 0.42 + n * 0.27, -0.04, COLORS.wood);
        arm(0.035, 1.7, 0.05, 0.54, 1.22, -0.04, COLORS.wood);
    }
    sails.add(s.mesh());
    return sails;
}

// A field of tulips in rows of colours, between furrows of earth
function tulipField(b) {
    const { i0, i1, k0, k1 } = TULIPS, colours = ['#f7a8c4', '#e8455a', '#ffffff', '#ffd166', '#c3a6e6', '#ff9f43'];
    for (let k = k0; k <= k1; k += 2) {
        const hex = colours[((k - k0) / 2) % colours.length];
        for (let i = i0; i <= i1; i++) {
            if (!insideIsland(i, k) || !isGrass(i, k)) continue;
            const y = ground(i, k);
            b.box(B, 0.04, B * 0.7, i * B, y + 0.02, k * B, '#7a5233');
            [-0.08, 0.08].forEach((dx, n) => {
                const tx = i * B + dx, tz = k * B + (n ? 0.05 : -0.05), h = 0.16 + hash(i, k, n + 20) * 0.08;
                b.box(0.025, h, 0.025, tx, y + h / 2, tz, '#5aa953');
                b.box(0.08, 0.09, 0.08, tx, y + h + 0.03, tz, hex);
            });
        }
    }
}

// On the pond: lily pads, some flowering, two ducks, reeds at its ends, and a little wooden bridge that
// arches across its middle
function pondLife(b) {
    const y = B;
    [[-4, -1], [-2, 2], [2, 1], [4, -1], [-3, -2]].map(([i, k]) => [POND.i + i, POND.k + k]).forEach(([i, k], n) => {
        b.box(0.24, 0.02, 0.2, i * B + 0.05, y + 0.01, k * B, '#4f9a4a', { rot: [0, n, 0] });
        if (n % 2 === 0) b.box(0.08, 0.06, 0.08, i * B + 0.05, y + 0.05, k * B, '#f7a8c4');
    });
    [[3, -2, 0.4], [-3, 1, 2.6]].map(([i, k, turn]) => [POND.i + i, POND.k + k, turn]).forEach(([i, k, turn]) => {
        const duck = turned(b, new THREE.Vector3(i * B, y, k * B), [0, turn, 0]);
        duck(0.24, 0.12, 0.15, i * B, y + 0.06, k * B, '#ffffff');
        duck(0.09, 0.1, 0.09, i * B + 0.09, y + 0.17, k * B, '#ffffff');
        duck(0.06, 0.03, 0.05, i * B + 0.16, y + 0.16, k * B, '#ff9f43');
        duck(0.06, 0.06, 0.1, i * B - 0.11, y + 0.1, k * B, '#f4f4f4');
    });
    [[POND.i - 6, POND.k], [POND.i + 6, POND.k - 1], [POND.i - 5, POND.k + 2]].forEach(([i, k]) => {
        for (let n = 0; n < 4; n++) b.box(0.03, 0.3 + n * 0.06, 0.03, i * B + (n - 1.5) * 0.07, y + 0.15 + n * 0.03, k * B + (n % 2) * 0.06, n % 2 ? '#6fae4f' : '#5c9a41');
        b.box(0.05, 0.12, 0.05, i * B + 0.035, y + 0.5, k * B, '#8a5f3a');
    });
    const bx = POND.i * B, reach = POND.rk + 1;
    for (let k = POND.k - reach; k <= POND.k + reach; k++) {
        const t = (k - POND.k) / reach, h = 2 * B + 0.04 + (1 - t * t) * 0.24;
        b.box(0.72, 0.06, B * 0.96, bx, h, k * B, k % 2 ? COLORS.wood : COLORS.woodLight);
        [-1, 1].forEach(side => {
            b.box(0.05, 0.28, 0.05, bx + side * 0.34, h + 0.14, k * B, COLORS.woodDark);
            b.box(0.04, 0.04, B, bx + side * 0.34, h + 0.28, k * B, COLORS.wood);
        });
    }
}

// A little beach hut: upright boards in a colour and white, a door to the sea with a step, and a pitched
// roof with its gable to the front
function beachHut(b, i, k, hex) {
    const x = i * B, z = k * B, y = ground(i, k), w = 1.4, h = 1.6, boards = 7, bw = w / boards;
    for (let n = 0; n < boards; n++) {
        const along = -w / 2 + (n + 0.5) * bw, board = n % 2 ? '#ffffff' : hex;
        [-1, 1].forEach(end => b.box(bw, h, 0.08, x + along, y + h / 2, z + end * w / 2, board));
        [-1, 1].forEach(side => b.box(0.08, h, bw, x + side * w / 2, y + h / 2, z + along, board));
    }
    b.box(0.48, 1.04, 0.04, x, y + 0.58, z - w / 2 - 0.05, '#ffffff');
    b.box(0.38, 0.94, 0.03, x, y + 0.56, z - w / 2 - 0.07, shade(hex, 0.15));
    b.box(0.04, 0.04, 0.03, x + 0.12, y + 0.55, z - w / 2 - 0.09, '#ffd166');
    b.box(0.64, 0.08, 0.3, x, y + 0.04, z - w / 2 - 0.18, COLORS.woodLight);
    for (let n = 1; n <= 3; n++) [-1, 1].forEach(end => b.box(w - n * 0.36, 0.14, 0.08, x, y + h + (n - 0.5) * 0.14, z + end * w / 2, n % 2 ? hex : '#ffffff'));
    [-1, 1].forEach(side => b.box(w * 0.62, 0.07, w + 0.24, x + side * w * 0.256, y + h + 0.25, z, COLORS.roof, { rot: [0, 0, -side * 0.6], outline: true }));
}

// A lifeguard's tall chair, white and red, with a ladder at the back, a little roof and a flag
function lifeguardChair(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k), white = '#f4f4f4', red = '#e8455a';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, c]) => b.box(0.08, 1.45, 0.08, x + a * 0.36, y + 0.72, z + c * 0.36, white));
    for (let n = 1; n <= 4; n++) b.box(0.72, 0.05, 0.05, x, y + n * 0.29, z + 0.38, white);
    b.box(0.9, 0.1, 0.9, x, y + 1.45, z, red, { outline: true });
    b.box(0.9, 0.55, 0.08, x, y + 1.78, z + 0.41, red);
    [-1, 1].forEach(side => b.box(0.06, 0.06, 0.86, x + side * 0.42, y + 1.72, z, white));
    b.box(0.05, 1.05, 0.05, x - 0.4, y + 2.0, z + 0.4, white);
    b.box(1.1, 0.07, 1.1, x - 0.05, y + 2.55, z + 0.05, red, { outline: true });
    b.box(0.03, 0.5, 0.03, x + 0.4, y + 2.8, z + 0.4, white);
    b.box(0.32, 0.2, 0.02, x + 0.56, y + 2.95, z + 0.4, red);
}

// A checked picnic blanket in the shade of an oak, with a basket and a few apples
function picnic(b, i, k) {
    const x = i * B, z = k * B, y = ground(i, k), cell = 0.28;
    for (let a = 0; a < 5; a++) for (let c = 0; c < 4; c++) b.box(cell, 0.03, cell, x + (a - 2) * cell, y + 0.015, z + (c - 1.5) * cell, (a + c) % 2 ? '#ffffff' : '#e8455a');
    b.box(0.34, 0.2, 0.24, x + 0.3, y + 0.13, z + 0.1, '#c49a6c', { outline: true });
    b.box(0.36, 0.05, 0.26, x + 0.3, y + 0.25, z + 0.1, '#a8794e');
    b.box(0.04, 0.16, 0.2, x + 0.3, y + 0.33, z + 0.1, '#7a5233');
    [[-0.3, -0.15], [-0.2, 0.05], [-0.4, 0.1]].forEach(([dx, dz]) => b.box(0.08, 0.08, 0.08, x + dx, y + 0.07, z + dz, '#e8455a'));
}

// A forest of pines over the back left of the island
// The pickleball court on the grass to the right: a blue court with its white lines and the kitchen either side
// of the net, a green surround in a fence with a green windscreen and a gate, lights at the corners, and a
// bench with two paddles and a ball
function pickleball(b, glow) {
    const { i0, i1, k0, k1 } = COURT, y = ground(i0, k0);
    const x0 = (i0 - 0.5) * B, x1 = (i1 + 0.5) * B, z0 = (k0 - 0.5) * B, z1 = (k1 + 0.5) * B;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = 8 * B, L = 18 * B, kitchen = 3 * B, line = 0.035, white = '#f7f7f2';
    b.box(x1 - x0, 0.03, z1 - z0, cx, y + 0.015, cz, '#3f8a5c');
    b.box(W, 0.03, L, cx, y + 0.03, cz, '#2f6fb0');
    b.box(W, 0.03, kitchen * 2, cx, y + 0.035, cz, '#3f86c6');
    const top = y + 0.056;
    [-1, 1].forEach(side => {
        b.box(line, 0.012, L, cx + side * W / 2, top, cz, white);
        b.box(W + line, 0.012, line, cx, top, cz + side * L / 2, white);
        b.box(W, 0.012, line, cx, top, cz + side * kitchen, white);
        b.box(line, 0.012, L / 2 - kitchen, cx, top, cz + side * (kitchen + (L / 2 - kitchen) / 2), white);
    });
    // The net
    [-1, 1].forEach(side => b.box(0.06, 0.4, 0.06, cx + side * (W / 2 + 0.15), y + 0.2, cz, '#2b2f36'));
    b.box(W + 0.3, 0.24, 0.015, cx, y + 0.2, cz, '#39414c');
    b.box(W + 0.3, 0.04, 0.03, cx, y + 0.34, cz, white);
    // The fence: posts, a rail along the top, and a green windscreen along the bottom, with a gate toward the
    // resort
    const fence = '#2d4a3a', screen = '#2f6b4a', gate = 1.2;
    const run = (ax, az, bx, bz) => {
        const length = Math.hypot(bx - ax, bz - az), along = bx !== ax;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        b.box(along ? length : 0.04, 0.04, along ? 0.04 : length, mx, y + 0.95, mz, fence);
        b.box(along ? length : 0.03, 0.55, along ? 0.03 : length, mx, y + 0.33, mz, screen);
        for (let n = 0, posts = Math.max(1, Math.round(length / (2 * B))); n <= posts; n++) {
            b.box(0.06, 0.97, 0.06, ax + (bx - ax) * n / posts, y + 0.485, az + (bz - az) * n / posts, fence);
        }
    };
    run(x0, z0, x1, z0);
    run(x0, z1, x1, z1);
    run(x1, z0, x1, z1);
    run(x0, z0, x0, cz - gate / 2);
    run(x0, cz + gate / 2, x0, z1);
    // Lights over the corners, leaning in over the court
    [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]].forEach(([x, z, sx, sz]) => {
        b.box(0.07, 1.9, 0.07, x + sx * 0.12, y + 0.95, z + sz * 0.12, '#3b3f45');
        b.box(0.3, 0.06, 0.06, x + sx * 0.25, y + 1.88, z + sz * 0.12, '#3b3f45');
        glow.box(0.18, 0.05, 0.14, x + sx * 0.36, y + 1.84, z + sz * 0.16, COLORS.glow);
    });
    // A bench inside the fence by the gate, two paddles on it and a ball on the court
    const bx = x0 + 0.3, bz = cz + gate / 2 + 0.7;
    b.box(0.26, 0.05, 0.9, bx, y + 0.24, bz, COLORS.woodLight);
    [-0.35, 0.35].forEach(dz => b.box(0.22, 0.22, 0.05, bx, y + 0.11, bz + dz, '#3b3f45'));
    [['#e8455a', -0.18], ['#ffd166', 0.18]].forEach(([hex, dz]) => {
        b.box(0.16, 0.02, 0.2, bx, y + 0.275, bz + dz, hex);
        b.box(0.04, 0.02, 0.12, bx + 0.12, y + 0.275, bz + dz, '#2b2f36');
    });
    b.box(0.06, 0.06, 0.06, cx + 0.5, y + 0.08, cz + L / 2 - 0.6, '#d7f24a');
}

// A little car, nose toward +z before it is turned by `heading`, its wheels on the ground at y, with a dark
// patch of shade under it
function car(b, x, y, z, heading, hex) {
    const t = turned(b, new THREE.Vector3(x, y, z), [0, heading, 0]), W = 0.7, L = 1.5, glass = '#2a3440';
    t(W + 0.08, 0.004, L + 0.1, x, y + 0.002, z, '#2b2e33');
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => t(0.12, 0.24, 0.24, x + sx * (W / 2 - 0.04), y + 0.12, z + sz * 0.47, '#1d1f22'));
    t(W, 0.22, L, x, y + 0.23, z, hex);
    t(W - 0.08, 0.2, 0.8, x, y + 0.44, z - 0.08, glass);
    t(W - 0.1, 0.05, 0.7, x, y + 0.565, z - 0.1, hex);
    [-1, 1].forEach(side => {
        t(0.14, 0.06, 0.02, x + side * 0.22, y + 0.28, z + L / 2 + 0.005, '#fff6d8');
        t(0.14, 0.06, 0.02, x + side * 0.22, y + 0.28, z - L / 2 - 0.005, '#d23a3a');
    });
    [-1, 1].forEach(end => t(W + 0.02, 0.06, 0.06, x, y + 0.15, z + end * (L / 2 + 0.01), '#2b2e33'));
}

// The car park behind the resort: asphalt with a kerb round it, a row of spaces marked in white along the back
// with cars in most of them, a car waiting at the door, a sign with a P, and lamps
function carPark(b, glow) {
    const { i0, i1, k0, k1 } = CAR_PARK, y = ground(0, k0), surface = y + 0.03;
    const x0 = (i0 - 0.5) * B, x1 = (i1 + 0.5) * B, z0 = (k0 - 0.5) * B, z1 = (k1 + 0.5) * B, cx = (x0 + x1) / 2;
    b.box(x1 - x0, 0.03, z1 - z0, cx, y + 0.015, (z0 + z1) / 2, '#50555d');
    b.box(x1 - x0 + 0.2, 0.08, 0.1, cx, y + 0.04, z1 + 0.05, '#d9d4c7');
    [x0 - 0.05, x1 + 0.05].forEach(x => b.box(0.1, 0.08, z1 - z0, x, y + 0.04, (z0 + z1) / 2, '#d9d4c7'));
    const spaces = Math.floor((i1 - i0 + 1) / 3), deep = 5 * B, zs = z1 - deep;
    for (let n = 0; n <= spaces; n++) b.box(0.035, 0.012, deep, x0 + n * 3 * B, surface + 0.006, zs + deep / 2, '#f7f7f2');
    b.box(x1 - x0, 0.012, 0.035, cx, surface + 0.006, zs, '#f7f7f2');
    const colours = ['#f4f4f4', '#1f2329', '#c8453b', '#b8bec6', '#2f6fb0', '#f4f4f4', '#e8b93a', '#3f8a5c', '#b8bec6'];
    [0, 1, 3, 4, 5, 7, 8, 10].forEach((n, m) => car(b, x0 + (n + 0.5) * 3 * B, surface, zs + deep / 2 + 0.05, 0, colours[m]));
    car(b, 1.1, surface, (RESORT.ck + RESORT.r2 + 1.6) * B, -Math.PI / 2, colours[8]);
    // The sign at the corner, a white P on blue on both sides
    const sx = x0 + 0.2, sz = z0 + 0.2, sy = y + 1.05;
    b.box(0.06, 1.05, 0.06, sx, y + 0.52, sz, '#8d97a1');
    b.box(0.46, 0.46, 0.04, sx, sy, sz, '#2f6fb0');
    ['XXX.', 'X..X', 'XXX.', 'X...', 'X...'].forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch === 'X') [-1, 1].forEach(side => b.box(0.06, 0.06, 0.012, sx + (c - 1.5) * 0.06, sy + (2 - r) * 0.06, sz + side * 0.024, '#ffffff'));
    }));
    [-11, 0, 11].forEach(i => lampPost(b, glow, i, k1 + 1));
}

function forest(b, keepClear) {
    const rand = random(71), placed = [];
    for (let n = 0; n < 220 && placed.length < 30; n++) {
        const i = Math.round(-58 + rand() * 42), k = Math.round(16 + rand() * 42);
        if (islandRadius(i, k) > 0.9 || !isGrass(i, k) || keepClear(i, k)) continue;
        if (placed.some(([a, c]) => Math.hypot(a - i, c - k) < 4)) continue;
        placed.push([i, k]);
        pineTree(b, i, k, rand() > 0.4 ? 5 : 3);
    }
}

function islandDetails(b, columns) {
    const rand = random(11);
    for (const { i, k, top } of columns) {
        const y = top * B;
        const busy = (i >= GARDEN.i0 - 1 && i <= GARDEN.i1 + 1 && k >= GARDEN.k0 - 1 && k <= GARDEN.k1 + 1) || onPath(i, k) ||
            (i >= TULIPS.i0 - 1 && i <= TULIPS.i1 + 1 && k >= TULIPS.k0 - 1 && k <= TULIPS.k1 + 1) ||
            nearPond(i, k, 1.5) || Math.hypot(i - MILL.i, k - MILL.k) < 3 || onTerrace(i, k) || onResortPath(i, k) ||
            inRect(COURT, i, k, 1) || inRect(CAR_PARK, i, k, 1);
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
    }
    // A starfish
    const sx = -3 * B, sz = -3 * B, sy = ground(-3, -3) + 0.015;
    [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [1, -2], [-1, -2]].forEach(([a, c]) =>
        b.box(0.05, 0.03, 0.05, sx + a * 0.05, sy, sz + c * 0.05, '#f2896d'));
}

// Our footprints, coming down the beach to the loungers
function footprints(b, people) {
    for (const [person, side] of people) {
        const facing = new THREE.Vector3(Math.sin(person.outer.rotation.y), 0, Math.cos(person.outer.rotation.y));
        const across = new THREE.Vector3(facing.z, 0, -facing.x);
        for (let d = 1.3, n = 0; d < 5.6; d += 0.42, n++) {
            const p = person.outer.position.clone().addScaledVector(facing, -d).addScaledVector(across, (n % 2 ? 0.08 : -0.08) + Math.sin(d) * 0.1 * side);
            const i = Math.round(p.x / B), k = Math.round(p.z / B);
            if (!insideIsland(i, k) || isWater(i, k)) break;
            b.box(0.08, 0.02, 0.13, p.x, ground(i, k) + 0.01, p.z, COLORS.footprint, { rot: [0, person.outer.rotation.y, 0] });
        }
    }
}

// ----- Ships out at sea -----
// Each is built facing +z with its waterline at 0, and leaves a wake of white water
function wake(b, beam, stern, spread, length) {
    for (let n = 1; n <= length; n++) {
        const w = beam * (0.3 + n * 0.08);
        [-1, 1].forEach(side => b.box(w, 0.04, beam * 0.45, side * (beam * 0.35 + n * spread), 0.02, stern - n * beam * 0.5, '#ffffff'));
        if (n < length * 0.6) b.box(beam * 0.5, 0.04, beam * 0.45, 0, 0.02, stern - n * beam * 0.5, '#eef7fb');
    }
}

// A hull narrowing in steps to its bow at +z, `length` long overall
function hull(b, length, beam, height, color, below) {
    const bow = length * 0.2, main = length - bow;
    b.box(beam, height, main, 0, height / 2 - 0.3, -length / 2 + main / 2, color);
    b.box(beam + 0.02, 0.5, main + 0.02, 0, -0.1, -length / 2 + main / 2, below);
    [[0.78, 0.4], [0.52, 0.33], [0.26, 0.27]].reduce((z, [w, part]) => {
        b.box(beam * w, height, bow * part, 0, height / 2 - 0.3, z + (bow * part) / 2, color);
        return z + bow * part;
    }, -length / 2 + main);
}

// A big container ship: a dark hull stacked with containers of every colour, the bridge and funnel at the stern
function containerShip() {
    const b = new Blocks(), L = 34, W = 6, rand = random(81);
    hull(b, L, W, 2.8, '#2b3a55', '#b8423a');
    b.box(W + 0.04, 0.1, L * 0.8, 0, 2.5, -L * 0.1, '#e8e8e8');
    const colours = ['#c8453b', '#2f6fb0', '#e8b93a', '#3f9a5a', '#e07a3a', '#2f9a9a', '#e8e8e8', '#8a4fa8'];
    for (let row = 0; row < 9; row++) {
        for (let col = -1; col <= 1; col++) {
            const high = 1 + Math.floor(rand() * 3);
            for (let level = 0; level < high; level++) {
                b.box(1.85, 1.1, 2.15, col * 1.9, 3.1 + level * 1.15, -L / 2 + 7.5 + row * 2.25, colours[Math.floor(rand() * colours.length)]);
            }
        }
    }
    b.box(W - 0.4, 4.6, 3.6, 0, 4.8, -L / 2 + 3.4, '#f2f2f2');
    b.box(W - 0.36, 0.5, 3.64, 0, 6.3, -L / 2 + 3.4, '#22303f');
    b.box(W + 1.2, 0.35, 1.4, 0, 7.25, -L / 2 + 4.4, '#f2f2f2');
    b.box(1.4, 2.2, 1.4, 0, 8.2, -L / 2 + 2.2, '#e8e8e8');
    b.box(1.44, 0.45, 1.44, 0, 8.4, -L / 2 + 2.2, '#c8453b');
    b.box(1.44, 0.3, 1.44, 0, 9.35, -L / 2 + 2.2, '#2b2b2f');
    wake(b, W, -L / 2, 0.55, 10);
    [-1, 1].forEach(side => b.box(0.6, 0.06, 2.4, side * (W / 2 + 0.3), 0.03, L / 2 - 2, '#ffffff'));
    return b;
}

// A white cruise ship: a long hull with a blue line, decks stepping back with rows of windows, orange
// lifeboats and a blue funnel
function cruiseShip() {
    const b = new Blocks(), L = 30, W = 5;
    hull(b, L, W, 2.6, '#f4f4f4', '#1f3d6b');
    b.box(W + 0.04, 0.3, L * 0.8 + 0.04, 0, 0.6, -L * 0.1, '#1f3d6b');
    for (let deck = 0; deck < 4; deck++) {
        const z0 = -L / 2 + 1.2 + deck * 1.1, z1 = L * 0.28 - deck * 1.6, w = W - 0.3 - deck * 0.35, y = 2.8 + deck * 1.0;
        b.box(w, 1.0, z1 - z0, 0, y, (z0 + z1) / 2, '#fbfbfb');
        b.box(w + 0.04, 0.28, z1 - z0 - 0.4, 0, y + 0.08, (z0 + z1) / 2, '#2a4f7a');
        b.box(w - 0.4, 0.28, 0.04, 0, y + 0.08, z1 + 0.01, '#2a4f7a');
    }
    [-1, 1].forEach(side => {
        for (let n = 0; n < 6; n++) b.box(0.4, 0.45, 1.1, side * (W / 2 - 0.05), 2.4, -L / 2 + 4 + n * 2.6, '#f08a3a');
    });
    b.box(1.8, 2.4, 2.6, 0, 7.5, -L / 2 + 6.5, '#2f6fb0');
    b.box(1.84, 0.4, 2.64, 0, 7.7, -L / 2 + 6.5, '#ffffff');
    b.box(1.84, 0.3, 2.64, 0, 8.65, -L / 2 + 6.5, '#22262b');
    wake(b, W, -L / 2, 0.5, 9);
    return b;
}

// A little sailing boat: a white hull with a coloured stripe, a tall mast, the mainsail behind it and a
// coloured jib in front, stepped like blocks
function sailboat(stripe, jib) {
    const b = new Blocks(), white = '#f8f8f6';
    b.box(0.9, 0.42, 1.8, 0, 0.11, -0.2, white);
    b.box(0.62, 0.4, 0.5, 0, 0.12, 0.95, white);
    b.box(0.3, 0.36, 0.35, 0, 0.14, 1.37, white);
    b.box(0.92, 0.08, 1.82, 0, 0.14, -0.2, stripe);
    b.box(0.6, 0.06, 0.8, 0, 0.34, -0.5, COLORS.woodLight);
    b.box(0.07, 3.4, 0.07, 0, 2.0, 0.35, '#e8e8e8');
    b.box(0.06, 0.06, 1.5, 0, 0.78, -0.42, '#e8e8e8');
    for (let r = 0; r < 7; r++) {
        const len = 1.4 * (1 - r / 7);
        b.box(0.04, 0.42, len, 0, 1.02 + r * 0.42, 0.31 - len / 2, white);
    }
    for (let r = 0; r < 5; r++) {
        const len = 0.9 * (1 - r / 5);
        b.box(0.04, 0.42, len, 0, 0.62 + r * 0.42, 0.42 + len / 2, jib);
    }
    wake(b, 0.9, -1.1, 0.12, 5);
    return b;
}

// A fishing boat: a red hull with a white band, a little wheelhouse at the stern, a mast with its boom over
// the deck, crates and a flag
function fishingBoat() {
    const b = new Blocks();
    hull(b, 3.2, 1.3, 0.75, '#f2f2f2', '#c8453b');
    b.box(1.32, 0.18, 2.6, 0, 0.12, -0.3, '#c8453b');
    b.box(1.0, 0.85, 0.95, 0, 0.85, -0.9, '#f8f8f6');
    b.box(1.04, 0.22, 0.99, 0, 0.98, -0.9, '#2f4f6b');
    b.box(1.12, 0.1, 1.1, 0, 1.32, -0.9, '#2f6fb0');
    b.box(0.07, 1.9, 0.07, 0, 1.4, 0.55, COLORS.woodDark);
    b.box(0.06, 0.06, 1.3, 0, 1.6, 0.0, COLORS.woodDark, { rot: [0.5, 0, 0] });
    b.box(0.3, 0.2, 0.06, 0.15, 2.25, 0.55, '#ffd166');
    [[-0.3, 0.2], [0.25, 0.35]].forEach(([x, z]) => b.box(0.32, 0.22, 0.3, x, 0.56, z, '#e07a3a'));
    wake(b, 1.3, -1.6, 0.14, 5);
    return b;
}

// A white motor yacht at anchor: a long hull with a navy waterline and a gold line along it and portholes, two
// decks of dark windows, a flybridge under a hardtop with the radar and a mast, a teak aft deck and a swim
// platform, a sunpad on the bow, the anchor chain going down in front and a flag at the stern. Some of its
// windows and its lights are lit; those go in `lights`
function yacht() {
    const b = new Blocks(), lights = new Blocks(), L = 7.2, W = 1.8, white = '#f7f7f5', dark = '#24303d', teak = '#b07a4a', cream = '#efe6d2', rail = '#dcdcdc';
    hull(b, L, W, 1.05, white, '#1f3d6b');
    const main = L * 0.8;
    b.box(W + 0.03, 0.05, main + 0.02, 0, 0.56, -L / 2 + main / 2, '#c9a14a');
    for (let n = 0; n < 6; n++) (n % 3 === 1 ? lights : b).box(W + 0.03, 0.08, 0.16, 0, 0.36, -2.6 + n * 0.8, n % 3 === 1 ? COLORS.glow : dark);
    // Decks: teak aft with a sofa across it, the swim platform, the sunpad on the bow
    b.box(W - 0.16, 0.03, 1.3, 0, 0.765, -L / 2 + 0.75, teak);
    b.box(W - 0.3, 0.14, 0.3, 0, 0.85, -L / 2 + 0.3, cream);
    b.box(W - 0.2, 0.08, 0.45, 0, 0.12, -L / 2 - 0.2, teak);
    b.box(0.9, 0.08, 1.0, 0, 0.79, 2.4, cream);
    // The main deck's cabin and the upper deck's on it, each with a band of windows and a step down in front
    b.box(W - 0.3, 0.58, 3.8, 0, 1.04, -0.3, white);
    b.box(W - 0.28, 0.28, 3.4, 0, 1.08, -0.4, dark);
    b.box(W - 0.3, 0.3, 0.4, 0, 0.9, 1.8, white);
    b.box(W - 0.28, 0.12, 0.3, 0, 1.0, 1.78, dark);
    b.box(W - 0.5, 0.48, 2.6, 0, 1.57, -0.6, white);
    b.box(W - 0.48, 0.22, 2.2, 0, 1.6, -0.55, dark);
    b.box(W - 0.5, 0.25, 0.35, 0, 1.45, 0.88, white);
    [-1.5, 0.3].forEach(z => lights.box(W - 0.26, 0.2, 0.5, 0, 1.08, z, COLORS.glow));
    lights.box(W - 0.46, 0.15, 0.45, 0, 1.6, -1.25, COLORS.glow);
    // The flybridge: seats under a hardtop on posts, the radar dome and a mast with the radar bar
    b.box(0.9, 0.12, 0.3, 0, 1.87, -1.45, cream);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => b.box(0.05, 0.45, 0.05, sx * 0.55, 2.04, -0.7 + sz * 0.7, white));
    b.box(1.3, 0.07, 1.7, 0, 2.29, -0.7, white);
    b.box(0.26, 0.1, 0.26, 0, 2.38, -0.9, white);
    b.box(0.04, 0.55, 0.04, 0, 2.6, -1.3, rail);
    b.box(0.5, 0.03, 0.06, 0, 2.62, -1.3, dark);
    lights.box(0.06, 0.06, 0.06, 0, 2.9, -1.3, '#ffffff');
    [[1, '#ff4a4a'], [-1, '#4aff7a']].forEach(([side, hex]) => lights.box(0.04, 0.06, 0.1, side * (W / 2 - 0.24), 1.42, 0.95, hex));
    // Rails round the aft deck and the bow, on little posts
    [-1, 1].forEach(side => {
        [[1.3, W / 2 - 0.05, -L / 2 + 0.75], [0.65, 0.62, 2.375]].forEach(([length, x, z]) => {
            b.box(0.03, 0.03, length, side * x, 1.02, z, rail);
            [-1, 0, 1].forEach(n => b.box(0.025, 0.25, 0.025, side * x, 0.88, z + n * length * 0.45, rail));
        });
    });
    // The anchor chain and the flag
    b.box(0.03, 0.03, 0.9, 0, 0.22, 3.85, '#3b3f45', { rot: [0.75, 0, 0] });
    b.box(0.03, 0.6, 0.03, 0, 1.05, -L / 2 + 0.06, rail);
    b.box(0.02, 0.24, 0.36, 0, 1.22, -L / 2 - 0.12, '#da251d');
    b.box(0.03, 0.07, 0.07, 0, 1.22, -L / 2 - 0.12, '#ffde00');
    return { b, lights };
}

// The ships with how they sail: straight across the sea, coming round again, round and round in a ring, or
// at anchor. `course(t)` gives where each is at time t and which way it heads
function fleet() {
    const across = (z, x0, x1, speed, start) => t => {
        const span = Math.abs(x1 - x0), along = (((start + t * speed) % span) + span) % span;
        return [x0 + Math.sign(x1 - x0) * along, z, Math.sign(x1 - x0) * Math.PI / 2];
    };
    const ring = (x, z, radius, speed, start) => t => {
        const a = start + t * speed;
        return [x + Math.cos(a) * radius, z + Math.sin(a) * radius, speed > 0 ? -a : Math.PI - a];
    };
    const anchored = (x, z, heading) => () => [x, z, heading];
    const superyacht = yacht();
    return [
        [superyacht.b, anchored(-8.5, -13.5, 2.25), 0.03, 0.008, superyacht.lights],
        [containerShip(), across(-135, 200, -700, 1.8, 260), 0.06, 0.006],
        [cruiseShip(), across(-105, -420, 160, 1.5, 230), 0.07, 0.008],
        [sailboat('#3d8fd1', '#f4a6b8'), ring(-34, -58, 9, 0.04, 0.6), 0.12, 0.05],
        [sailboat('#e8455a', '#ffd166'), ring(-10, -50, 7, -0.05, 2.1), 0.12, 0.05],
        [fishingBoat(), ring(-34, -32, 5, 0.03, 4), 0.1, 0.04]
    ].map(([blocks, course, bob, roll, lights], n) => {
        const ship = new THREE.Group();
        ship.rotation.order = 'YXZ';
        ship.add(blocks.mesh(blockMaterial, { shadow: false }));
        if (lights) ship.add(lights.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), { shadow: false }));
        return { ship, course, bob, roll, phase: n * 1.9 };
    });
}

// ----- Around the island -----
// Small islands out in the sea, each with something on it: an oak, a heart of red flowers, a pine, a sign, and
// the lighthouse on its own rock out beyond the bay. Their land goes in `meshes`, their things into the
// island's blocks, and white water round them into the foam rings
function seaIslands(meshes, decor, glow, foam) {
    [[-30, -21, 6, 1], [29, -16, 5, 2], [-11, -36, 4, 3], [37, 18, 4, 4], [LIGHTHOUSE.x, LIGHTHOUSE.z, 6, 5, true]].forEach(([x, z, radius, seed, rocky], n) => {
        const { mesh, tops } = buildSeaIsland(radius, seed, rocky);
        mesh.position.set(x, 0, z);
        meshes.push(mesh);
        const top = new Map(tops.map(t => [`${t.i},${t.k}`, t.top]));
        coastFoam(foam, (i, k) => top.has(`${i},${k}`), (i, k) => !top.has(`${i},${k}`), -radius - 3, radius + 3, -radius - 3, radius + 3, x, z);
        // Boxes placed as if the island were at the middle of the world
        const b = { box: (w, h, d, bx, by, bz, hex, opts) => decor.box(w, h, d, x + bx, by, z + bz, hex, opts) };
        const groundAt = (i, k) => (top.get(`${i},${k}`) ?? 1) * B;
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
        } else if (n === 3) {
            b.box(0.06, 0.6, 0.06, 0, groundAt(0, 0) + 0.3, 0, COLORS.woodDark);
            b.box(0.5, 0.26, 0.04, 0, groundAt(0, 0) + 0.62, 0, COLORS.woodLight);
            [[1, 1], [-1, 2], [2, -1]].forEach(([i, k]) => flowerOn(b, groundAt, i, k, '#ffd166'));
        } else {
            const g = { box: (w, h, d, bx, by, bz, hex, opts) => glow.box(w, h, d, x + bx, by, z + bz, hex, opts) };
            lighthouse(b, g, 0, groundAt(0, 0), 0);
        }
    });
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

// Clouds of white blocks high in the sky, a little blue underneath, merged into one mesh that turns slowly
// round the island
function clouds() {
    const b = new Blocks();
    const rand = random(51);
    const place = [
        [-120, 34, -210, 9], [60, 26, -260, 11], [-260, 42, -90, 12], [210, 30, -170, 10], [-40, 50, -330, 14], [150, 20, -70, 5],
        [-75, 18, -85, 4], [300, 38, 60, 13], [-300, 30, 140, 12], [80, 44, 300, 14], [-120, 24, 260, 10], [40, 16, 90, 5]
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

// A square sun, like the sun in a block game, with square layers of glow around it. It is further off than
// the edge of the sea, so the sea hides its lower part
function voxelSun() {
    const sun = new THREE.Group(), far = 1700, scale = far / 400;
    [[46, '#ffd77e', 1], [70, '#ffad66', 0.5], [100, '#ff8c6e', 0.25]].forEach(([size, hex, opacity], n) => {
        // Blended over the sky without changing its alpha, so it stays out of the tone mapping like the sky
        const square = new THREE.Mesh(new THREE.PlaneGeometry(size * scale, size * scale), new THREE.MeshBasicMaterial({
            color: hex, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending,
            blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
        }));
        square.position.z = -n * 2 * scale;
        square.renderOrder = -1 - n;
        sun.add(square);
    });
    sun.position.copy(SUN_DIR).multiplyScalar(far);
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

// The colour of the sky in direction d: blue overhead, a band of sunset at the sun's height, pale blue
// below. The sky's blocks take it, and so does the haze over far things
const SKY_GLSL = `
    uniform vec3 sunDir, top, mid, band, glow, low;
    vec3 skyColor(vec3 d) {
        vec3 col = mix(mid, top, smoothstep(-0.15, 0.35, d.y));
        col = mix(low, col, smoothstep(-0.6, -0.32, d.y));
        float towardSun = max(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz)), 0.0);
        float inBand = exp(-pow((d.y - sunDir.y) / 0.1, 2.0));
        col = mix(col, band, inBand * (0.25 + 0.6 * pow(towardSun, 3.0)));
        return mix(col, glow, pow(max(dot(d, sunDir), 0.0), 10.0) * 0.85);
    }`;
const skyUniforms = () => ({
    sunDir: { value: SUN_DIR }, top: { value: color(COLORS.skyTop) }, mid: { value: color(COLORS.skyMid) },
    band: { value: color(COLORS.skyBand) }, glow: { value: color(COLORS.skyGlow) }, low: { value: color(COLORS.skyLow) }
});

// The sky is a huge box round everything (it moves with the camera), each wall tiled with square blocks of
// the sky's colour, each a little lighter or darker than its neighbours with a faint join between them, so
// even the sky is made of blocks. It leaves alpha at 0, which tells the lens it needs no tone mapping
function skyBox() {
    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: { ...skyUniforms(), tiles: { value: 22 } },
        vertexShader: `
            varying vec3 vLocal;
            void main() {
                vLocal = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform float tiles;
            varying vec3 vLocal;
            float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
            ${SKY_GLSL}
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
                gl_FragColor = vec4(col, 0.0);
            }`
    });
    return new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), material);
}

// ----- The lens: depth of field and haze -----
// The scene is drawn into a buffer first. Then each pixel is blurred more the further its point is from us,
// so the two of us and what's round us stay sharp and far things go soft (when the camera is pulled back,
// the sharp part grows with it), and far things fade toward the colour of the sky behind them. Pixels of
// the sky (alpha 0) already have their final colours; the rest are tone mapped here. Behind the page, `veil`
// softens and dims the whole picture a little, so the page reads clearly over it
function lens(renderer, small) {
    const gl = renderer.getContext();
    const float = renderer.extensions.has('EXT_color_buffer_float');
    // Multisampled, for smooth edges, if this GPU can do that in the format we draw in
    const samples = Math.min(4, Math.max(0, ...(gl.getInternalformatParameter(gl.RENDERBUFFER, float ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES) || [0])));
    const target = new THREE.WebGLRenderTarget(1, 1, {
        type: float ? THREE.HalfFloatType : THREE.UnsignedByteType, samples, depthTexture: new THREE.DepthTexture(1, 1)
    });
    const uniforms = {
        tColor: { value: target.texture }, tDepth: { value: target.depthTexture }, texel: { value: new THREE.Vector2() },
        projectionInverse: { value: new THREE.Matrix4() }, cameraToWorld: { value: new THREE.Matrix4() },
        focus: { value: new THREE.Vector3() }, sharp: { value: 3 }, soft: { value: 30 }, maxBlur: { value: 5 }, veil: { value: 0 },
        hazeStart: { value: 30 }, hazeScale: { value: 1 / 550 }, ...skyUniforms()
    };
    const material = new THREE.ShaderMaterial({
        defines: { TAPS: small ? 14 : 20 },
        uniforms,
        depthTest: false,
        depthWrite: false,
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }`,
        fragmentShader: `
            uniform sampler2D tColor, tDepth;
            uniform vec2 texel;
            uniform mat4 projectionInverse, cameraToWorld;
            uniform vec3 focus;
            uniform float sharp, soft, maxBlur, hazeStart, hazeScale, veil;
            varying vec2 vUv;
            ${SKY_GLSL}
            vec3 viewAt(vec2 uv, float depth) {
                vec4 p = projectionInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
                return p.xyz / p.w;
            }
            // How many pixels the blur spreads at a point: none near us, more the further it is from us, and
            // some everywhere behind the page
            float blurAt(vec2 uv, float depth) {
                float lens = depth >= 1.0 ? maxBlur : maxBlur * smoothstep(sharp, soft, distance(viewAt(uv, depth), focus));
                return max(lens, veil * maxBlur * 0.8);
            }
            void main() {
                float depth = texture2D(tDepth, vUv).x, blur = blurAt(vUv, depth);
                vec4 sum = texture2D(tColor, vUv);
                float total = 1.0;
                if (blur > 0.5) {
                    // Points on a spiral out to the edge of the blur, each counted only if its own blur reaches
                    // this far, so sharp things don't smear onto the soft things beside them
                    for (int n = 1; n < TAPS; n++) {
                        float r = sqrt(float(n) / float(TAPS)) * blur, a = float(n) * 2.39996;
                        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
                        float w = smoothstep(r - 1.0, r, blurAt(uv, texture2D(tDepth, uv).x));
                        sum += texture2D(tColor, uv) * w;
                        total += w;
                    }
                }
                vec4 col = sum / total;
                vec3 rgb = mix(col.rgb, toneMapping(col.rgb), col.a);
                if (depth < 1.0) {
                    vec3 p = viewAt(vUv, depth);
                    float haze = 1.0 - exp(-max(length(p) - hazeStart, 0.0) * hazeScale);
                    rgb = mix(rgb, skyColor(normalize((cameraToWorld * vec4(p, 0.0)).xyz)), haze);
                }
                rgb *= 1.0 - veil * 0.12;
                gl_FragColor = vec4(rgb, 1.0);
                #include <colorspace_fragment>
            }`
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const screen = new THREE.Scene().add(quad), flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return {
        setSize(width, height) {
            target.setSize(width, height);
            uniforms.texel.value.set(1 / width, 1 / height);
            uniforms.maxBlur.value = height * 0.0065;
        },
        // Draw the scene, sharpest round `at`, with the camera `dist` from it, and softened by `veil` (0 to 1)
        render(scene, camera, at, dist, veil = 0) {
            camera.updateMatrixWorld();
            uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
            uniforms.cameraToWorld.value.copy(camera.matrixWorld);
            uniforms.focus.value.copy(at).applyMatrix4(camera.matrixWorldInverse);
            uniforms.sharp.value = 2.2 + dist * 0.1;
            uniforms.soft.value = uniforms.sharp.value + 12 + dist * 1.6;
            uniforms.veil.value = veil;
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(null);
            renderer.render(screen, flat);
        }
    };
}

// Little cubes that rise, drift and fade (fire, smoke) or wander (fireflies): one draw call each
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
        renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
    } catch {
        return; // no WebGL here: the painted sky behind the title stays
    }
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(COLORS.skyLow);
    host.appendChild(renderer.domElement);
    const view3d = lens(renderer, small);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);

    // Light: warm light from above, a peach rim from the low sun, a cool fill from the other side
    scene.add(new THREE.HemisphereLight('#bdb9e6', '#f0c19a', 1.4));
    const key = new THREE.DirectionalLight('#ffc690', 2.3);
    key.position.set(9, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 70 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    const rim = new THREE.DirectionalLight('#ff9a66', 1.6);
    rim.position.set(SUN_DIR.x * 20, 5, SUN_DIR.z * 20);
    const fill = new THREE.DirectionalLight('#c8c8f0', 0.7);
    fill.position.set(-6, 4, 8);
    scene.add(key, rim, fill);

    const sky = skyBox();
    sky.renderOrder = -10;
    scene.add(sky, voxelSun());

    // The island and everything on and around it
    const island = new THREE.Group();
    scene.add(island);
    const { mesh: terrain, columns } = buildIsland();
    island.add(terrain);
    const water = buildWater(columns);
    const sea = openSea();
    island.add(...water.meshes, sea.mesh);
    // Under the clear water fish and a turtle; out at sea, dolphins
    const life = sealife(), pod = dolphins();
    island.add(...life.meshes, pod.group);

    // Us, lying back on two loungers at the top of the beach, looking out to sea under a big umbrella: him on
    // the left, her on the right, holding hands across the gap between the loungers. The umbrella is planted
    // beside his lounger and leans in over both of us, so from behind its pole doesn't stand between us
    const facingSun = Math.atan2(SUN_DIR.x, SUN_DIR.z);
    const right = new THREE.Vector3(-Math.cos(facingSun), 0, Math.sin(facingSun));
    const forward = new THREE.Vector3(Math.sin(facingSun), 0, Math.cos(facingSun));
    const spot = new THREE.Vector3(0, 0, 0), beachY = ground(0, 0);
    // The loungers, the umbrella and the things around them, built facing +z, so turned to face the sun;
    // in here +x is toward his side
    const beach = new THREE.Group();
    beach.position.copy(spot).setY(beachY);
    beach.rotation.y = facingSun;
    const set = new Blocks();
    lounger(set, 0.8, '#3d8fd1');
    lounger(set, -0.8, '#f4a6b8');
    parasol(set, 1.55, -0.45, 2.65, 1.7, [0.12, 0, 0.38], '#3d8fd1');
    drinksTable(set, -1.72, -0.3);
    flipFlops(set, 1.55, 0.75, '#3d8fd1');
    flipFlops(set, -1.4, 1.45, '#f4a6b8');
    set.addTo(beach, { receive: true });
    // Our little dog, lying on the sand by her lounger
    const pup = buildDog();
    pup.dog.position.set(-1.78, 0, 0.5);
    pup.dog.scale.setScalar(1.15);
    beach.add(pup.dog);
    island.add(beach);

    const him = buildPerson(HIM), her = buildPerson(HER);
    her.outer.scale.setScalar(0.93);
    for (const [person, x, spread] of [[him, 0.8, 0.07], [her, -0.8, 0.02]]) {
        person.outer.position.copy(spot).addScaledVector(right, -x).setY(beachY);
        person.outer.rotation.y = facingSun;
        // Hips on the seat with the legs out along it, back against the raised back, head tipped forward a
        // little to see the sea
        const thigh = (person.P.legW + 0.05) / 2;
        person.root.position.y = 0.42 / person.outer.scale.y + thigh - HIP_Y;
        person.legs.forEach((leg, n) => leg.rotation.set(-Math.PI / 2, 0, n ? -spread : spread));
        person.torso.rotation.x = -RECLINE;
        person.head.rotation.x = 0.32;
        island.add(person.outer);
    }

    // Point his right arm and her left arm at the same spot between the loungers, so our hands meet; the
    // other arms lie along the cushions
    scene.updateMatrixWorld(true);
    const shoulderR = him.armRight.getWorldPosition(new THREE.Vector3());
    const shoulderL = her.armLeft.getWorldPosition(new THREE.Vector3());
    const handsMeet = shoulderR.clone().lerp(shoulderL, 0.5).setY(beachY + 0.62).addScaledVector(forward, 0.39);
    const down = new THREE.Vector3(0, -1, 0);
    for (const arm of [him.armRight, her.armLeft]) {
        const target = arm.parent.worldToLocal(handsMeet.clone()).sub(arm.position).normalize();
        arm.userData.base = new THREE.Quaternion().setFromUnitVectors(down, target);
        arm.quaternion.copy(arm.userData.base);
    }
    him.armLeft.rotation.set(0.13, 0, 0.07);
    her.armRight.rotation.set(0.13, 0, -0.07);

    // Everything else on the island: still things in one mesh, glowing windows and lamps in another
    const decor = new Blocks(), glow = new Blocks();
    islandDetails(decor, columns);
    seaFloor(decor, columns);
    footprints(decor, [[him, 1], [her, -1]]);
    const palms = [
        palmTree(decor, -9, 2, 11, [-1, 0], 0.3), palmTree(decor, 20, 0, 10, [1, -1], 2.2),
        palmTree(decor, -18, 3, 12, [-1, 1], 0.9), palmTree(decor, 24, -1, 9, [1, 0], 1.8), palmTree(decor, -27, 4, 11, [-1, 0], 2.7),
        palmTree(decor, 33, -1, 11, [1, 1], 0.6), palmTree(decor, 42, 6, 10, [1, 0], 3.1), palmTree(decor, -36, 8, 10, [-1, 1], 1.1),
        palmTree(decor, -8, 27, 9, [-1, 0], 1.3), palmTree(decor, 8, 27, 9, [1, 0], 2.5)
    ];
    palms.forEach(p => island.add(p.crown));
    sandcastle(decor, 5, -4);
    surfboard(decor, -12, -1);
    const pier = jetty(decor, 10, -5, -20);
    island.add(pier.boat);
    glow.box(0.12, 0.14, 0.12, ...pier.lamp, COLORS.glow);
    const fireAt = campfire(decor, -7, 5);
    bench(decor, 3, 13);
    lampPost(decor, glow, -4, 8);
    lampPost(decor, glow, -10, 11);
    const chimney = cottage(decor, glow);
    fenceAndGarden(decor);
    // A mailbox by the garden gate
    decor.box(0.06, 0.6, 0.06, -6 * B, ground(-6, 11) + 0.3, 11 * B, COLORS.woodDark);
    decor.box(0.2, 0.16, 0.28, -6 * B, ground(-6, 11) + 0.66, 11 * B, '#3d8fd1');
    const swingTree = oakTree(decor, -24, 19, 6, 61);
    oakTree(decor, -13, 25, 7, 62);
    oakTree(decor, -27, 14, 6, 63);
    oakTree(decor, 38, 22, 6, 64);
    // At the back, the resort
    const resort = buildResort();
    island.add(resort.mesh);
    resortDetails(decor, glow);
    carPark(decor, glow);
    pickleball(decor, glow);
    forest(decor, (i, k) => {
        const { r, a } = resortAt(i, k);
        return (r > 18 && r < RESORT.r2 + 6 && Math.abs(a) < 32 * DEG) || Math.hypot(i + 24, k - 19) < 5 || nearPond(i, k, 3) ||
            (i >= GARDEN.i0 - 3 && i <= GARDEN.i1 + 3 && k <= GARDEN.k1 + 3) || inRect(CAR_PARK, i, k, 4);
    });
    // Along the beach: a lifeguard's chair to the left, beach huts to the right
    lifeguardChair(decor, -18, -2);
    [[27, '#5fb0e0'], [31, '#f4a6b8'], [35, '#ffd166'], [39, '#7fd1b9']].forEach(([i, hex]) => beachHut(decor, i, 8, hex));
    // Over the grass to the right: tulips, a picnic under an oak and the windmill on its hill; the pond, in the
    // forest at the back left
    tulipField(decor);
    picnic(decor, 35, 19);
    pondLife(decor);
    const millSails = windmill(decor, MILL.i, MILL.k);
    island.add(millSails);
    // Out at sea: the small islands and the lighthouse, white water round every coast, and far-off hills
    const foamRings = [new Blocks(), new Blocks()], landMeshes = [];
    coastFoam(foamRings, (i, k) => insideIsland(i, k) && !isWater(i, k), (i, k) => !insideIsland(i, k), -63, 72, -33, 68);
    seaIslands(landMeshes, decor, glow, foamRings);
    landMeshes.push(
        farLand(-470, -177, 1.2, 26, 10, 6, 7, 1), farLand(97, -520, -0.2, 24, 9, 5, 7, 2), farLand(230, 330, 0.6, 32, 10, 7, 7, 3));
    island.add(...landMeshes);
    const foamMaterials = foamRings.map(() => new THREE.MeshBasicMaterial({ color: COLORS.foam, transparent: true, depthWrite: false }));
    foamRings.forEach((ring, n) => island.add(ring.mesh(foamMaterials[n], { shadow: false })));
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


    // Fire, smoke from the fire and the chimney, fireflies
    const flames = particles(12, new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }), ...rising(fireAt, 0.16, 0.45, 2.2, 0.09, 0.4));
    const embers = particles(6, new THREE.MeshBasicMaterial({ color: '#ff6a3d', toneMapped: false }), ...rising(fireAt, 0.1, 0.25, 2.6, 0.07, 0.4));
    const smokeMaterial = new THREE.MeshStandardMaterial({ color: '#e9eef2', transparent: true, opacity: 0.75, roughness: 1 });
    const smoke = particles(10, smokeMaterial, ...rising(fireAt.clone().add(new THREE.Vector3(0, 0.4, 0)), 0.15, 1.6, 0.35, 0.13));
    const chimneySmoke = particles(10, smokeMaterial, ...rising(chimney, 0.12, 1.8, 0.3, 0.16));
    const fireflies = particles(30, new THREE.MeshBasicMaterial({ color: '#fff3a0', toneMapped: false }),
        (p, rand, n) => Object.assign(p, { x: (-20 + rand() * 30) * B, z: (10 + rand() * 22) * B, y: 0.9 + rand() * 0.9, ph: rand() * 10 }),
        (p, t) => [p.x + Math.sin(t * 0.5 + p.ph) * 0.5, p.y + Math.sin(t * 0.9 + p.ph * 2) * 0.25, p.z + Math.cos(t * 0.4 + p.ph) * 0.5, 0.045 * (0.5 + 0.5 * Math.sin(t * 3 + p.ph))]);
    [flames, embers, smoke, chimneySmoke, fireflies].forEach(p => island.add(p.mesh));

    // Ships out at sea
    const ships = fleet();
    ships.forEach(s => island.add(s.ship));

    // In the sky: a balloon, clouds, gulls
    const hotAir = balloon();
    hotAir.position.set(30, 14, -48);
    scene.add(hotAir);
    const cloudMesh = clouds();
    scene.add(cloudMesh);
    const gulls = [0, 1, 2].map(n => {
        const g = seagull();
        island.add(g.bird);
        return { ...g, offset: n * 2.1, radius: 11 + n * 3, height: 9.8 + n * 1.3, speed: 0.3 - n * 0.05 };
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
    const PITCH_MIN = 0.05, PITCH_MAX = 1.45, DIST_MIN = 3.2, DIST_MAX = 72;
    // It starts a little round to her side, so the sun shows over the bay beside the umbrella, not behind it
    const view = { yaw: SUN_AZIMUTH + 0.3, pitch: 0.3, dist: 9.5 };
    let zoomed = false, interacted = false;
    // Behind the page (script.js) the scene is its background: the camera pulls back to a wide view of the sunset
    // and drifts there slowly, and can't be dragged. `away` goes from 0 to 1 as it pulls back. If the page was
    // opened before this file had loaded, it starts there
    let away = intro.classList.contains('leaving') ? 1 : 0, awayTarget = away;
    const velocity = { yaw: 0, pitch: 0 };
    function resize() {
        const width = host.clientWidth || window.innerWidth;
        const height = host.clientHeight || window.innerHeight;
        renderer.setSize(width, height, false);
        view3d.setSize(...renderer.getDrawingBufferSize(new THREE.Vector2()).toArray());
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        // Further back on narrow (portrait) screens, so there's still some island around us
        if (!zoomed) view.dist = camera.aspect < 1 ? 14 : 9.5;
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
        if (e.target.closest('button') || awayTarget) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 });
        intro.setPointerCapture(e.pointerId);
        if (pointers.size === 2) pinch = { start: pinchDistance(), dist: view.dist };
    }
    function onPointerMove(e) {
        const p = pointers.get(e.pointerId);
        if (!p || awayTarget) return;
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
        if (p && p.moved < 8 && !wasPinch && pointers.size === 0 && !awayTarget) {
            for (let n = 0; n < 4; n++) spawnHeart(handsMeet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, 0)), n * 0.15);
        }
    }
    function onWheel(e) {
        e.preventDefault();
        if (awayTarget) return;
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
    let clock = 0, lastClock = 0, lastHeartCycle = -1, drawn = false, idleSway = 0, skipped = false;
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
        // Slow breathing
        for (const [person, seed] of [[him, 0], [her, 1.7]]) person.torso.rotation.x = -RECLINE + Math.sin(t * 1.4 + seed) * 0.006;
        // Our joined hands sway a little
        swingTurn.setFromAxisAngle(swingAxis, Math.sin(t * 1.1) * 0.03);
        for (const arm of [him.armRight, her.armLeft]) arm.quaternion.copy(swingTurn).multiply(arm.userData.base);
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
        // The dog wags its tail, and looks up at her when we look at each other
        pup.tail.rotation.y = Math.sin(t * 9) * 0.5;
        pup.head.rotation.y = 0.15 + look * 0.5 + Math.sin(t * 0.7) * 0.08;
        pup.head.rotation.x = -look * 0.3 + Math.sin(t * 1.9) * 0.03;
        // Sea breeze in her hair, which lies forward against the cushion so it doesn't poke through it
        her.hairFlow.rotation.x = -0.1 + Math.sin(t * 1.3) * 0.012;
        her.hairFlow.rotation.z = Math.sin(t * 0.8) * 0.02;
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
        let yaw = view.yaw + idleSway + (1 - arrive) * 1.2;
        let pitch = Math.min(view.pitch + (1 - arrive) * 0.45, PITCH_MAX);
        let d = view.dist * (1 + (1 - arrive) * 2);
        if (away > 0) {
            // Behind the page: further back and round to her side again, turning the shorter way, then drifting
            const w = easeInOut(away), backYaw = SUN_AZIMUTH + 0.3 + Math.sin(t * 0.05) * 0.12;
            yaw += Math.atan2(Math.sin(backYaw - yaw), Math.cos(backYaw - yaw)) * w;
            pitch += (0.3 - pitch) * w;
            d += ((camera.aspect < 1 ? 19 : 13) - d) * w;
        }
        focus.copy(spot).addScaledVector(forward, -0.2).setY(beachY + 0.75);
        camera.position.set(
            focus.x + Math.sin(yaw) * Math.cos(pitch) * d,
            focus.y + Math.sin(pitch) * d,
            focus.z + Math.cos(yaw) * Math.cos(pitch) * d);
        // Stay above the ground when skimming low over the island
        const ci = Math.round(camera.position.x / B), ck = Math.round(camera.position.z / B);
        const below = insideIsland(ci, ck) ? Math.max(topLevel(ci, ck), resort.roofTop.get(`${ci},${ck}`) ?? 0, 0) * B : SEA_Y;
        camera.position.y = Math.max(camera.position.y, below + 0.45);
        // Low down it looks a little above us, so the sea and the sky fill the top of the picture
        lookAt.copy(focus).setY(focus.y + 1.4 * (1 - smoothstep(0.25, 1, pitch)));
        camera.lookAt(lookAt);
    }

    function frame() {
        requestAnimationFrame(frame);
        // Behind the page, every other frame is enough
        if (away === 1 && awayTarget === 1 && (skipped = !skipped)) return;
        clock = (performance.now() - startTime) / 1000;
        const dt = Math.min(clock - lastClock, 0.1);
        lastClock = clock;
        away = THREE.MathUtils.clamp(away + THREE.MathUtils.clamp(awayTarget - away, -dt / 1.6, dt / 1.6), 0, 1);
        water.update(clock);
        life.update(clock);
        pod.update(clock);
        sea.uniforms.time.value = clock;
        foamMaterials.forEach((m, n) => { m.opacity = 0.55 + 0.3 * Math.sin(clock * 1.3 - n * 1.4) - n * 0.15; });
        animatePeople(clock);
        updateHearts();
        palms.forEach(p => { p.crown.rotation.z = Math.sin(clock * 0.9 + p.seed) * 0.04; p.crown.rotation.x = Math.sin(clock * 0.7 + p.seed) * 0.03; });
        pier.boat.position.y = -0.04 + Math.sin(clock * 1.5) * 0.03;
        pier.boat.rotation.z = Math.sin(clock * 1.2) * 0.04;
        ships.forEach(s => {
            const [x, z, heading] = s.course(clock);
            s.ship.position.set(x, Math.sin(clock * 0.8 + s.phase) * s.bob, z);
            s.ship.rotation.set(Math.sin(clock * 0.6 + s.phase) * s.roll * 0.5, heading, Math.sin(clock * 0.7 + s.phase) * s.roll);
        });
        swing.rotation.z = Math.sin(clock * 1.4) * 0.35;
        millSails.rotation.z = clock * 0.6;
        [flames, embers, smoke, chimneySmoke, fireflies].forEach(p => p.update(clock, dt));
        hotAir.position.y = 14 + Math.sin(clock * 0.25) * 0.8;
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
        view3d.render(scene, camera, focus, camera.position.distanceTo(focus), easeInOut(away));
        if (!drawn) {
            drawn = true;
            requestAnimationFrame(() => intro.classList.add('drawn'));
        }
    }
    frame();

    // script.js moves the scene behind the page, and back to the front
    window.openingScene = {
        toBackground() {
            awayTarget = 1;
            pointers.clear();
            pinch = null;
            velocity.yaw = velocity.pitch = 0;
        },
        toFront() {
            awayTarget = 0;
        }
    };
}

if (intro && host) start();

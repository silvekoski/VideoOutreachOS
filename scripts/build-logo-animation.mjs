import { readFileSync, writeFileSync } from "node:fs";

// Adapted from norrin-hackathon's outline/fill animation. Read the original
// Mergero artwork so the animation and static fallback keep identical geometry.
function readArtwork() {
  const svg = readFileSync(new URL('../config/mergero-logo-dark.svg', import.meta.url), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const paths = [];
  const artworkGroups = [];
  for (const [, data] of svg.matchAll(/ d="([^"]+)"/g)) {
    const commands = data.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
    const indices = [];
    let cursor = 0;
    let current = [0, 0];
    let shape;
    let command;
    const relative = (a, b) => a.map((value, index) => Number((value - b[index]).toFixed(4)));
    const vertex = (value, incoming = [0, 0]) => {
      shape.v.push(value);
      shape.i.push(incoming);
      shape.o.push([0, 0]);
      current = value;
    };
    const point = (relativeCommand) => {
      const value = [Number(commands[cursor++]), Number(commands[cursor++])];
      return relativeCommand ? value.map((n, axis) => n + current[axis]) : value;
    };
    while (cursor < commands.length) {
      if (/^[A-Za-z]$/.test(commands[cursor])) command = commands[cursor++];
      const relativeCommand = command === command.toLowerCase();
      switch (command.toUpperCase()) {
        case 'M': {
          const first = point(relativeCommand);
          shape = { c: false, v: [], i: [], o: [] };
          indices.push(paths.length);
          paths.push(shape);
          vertex(first);
          command = relativeCommand ? 'l' : 'L';
          break;
        }
        case 'L': vertex(point(relativeCommand)); break;
        case 'H': vertex([Number(commands[cursor++]) + (relativeCommand ? current[0] : 0), current[1]]); break;
        case 'V': vertex([current[0], Number(commands[cursor++]) + (relativeCommand ? current[1] : 0)]); break;
        case 'C': {
          const first = point(relativeCommand);
          const second = point(relativeCommand);
          const end = point(relativeCommand);
          shape.o[shape.v.length - 1] = relative(first, current);
          vertex(end, relative(second, end));
          break;
        }
        case 'Z':
          shape.c = true;
          current = shape.v[0];
          command = undefined;
          break;
        default: throw new Error(`Unsupported SVG command: ${command}`);
      }
    }
    artworkGroups.push(indices);
  }
  return { paths, viewBox, artworkGroups };
}

const fixed = (k) => ({ a: 0, k });
const tween = (start, end, from, to, linear = false) => ({
  a: 1,
  k: [
    { t: start, s: from, e: to, o: { x: linear ? 0.33 : 0.22, y: linear ? 0.33 : 1 }, i: { x: linear ? 0.67 : 0.36, y: linear ? 0.67 : 1 } },
    { t: end, s: to },
  ],
});

const transform = (opacity = fixed(100)) => ({
  ty: "tr", p: fixed([0, 0]), a: fixed([0, 0]), s: fixed([100, 100]), r: fixed(0), o: opacity, sk: fixed(0), sa: fixed(0),
});
const fill = (opacity = fixed(100)) => ({ ty: "fl", c: fixed([1, 1, 1, 1]), o: opacity, r: 1, bm: 0 });
const stroke = (width) => ({ ty: "st", c: fixed([1, 1, 1, 1]), o: fixed(100), w: fixed(width), lc: 2, lj: 2, bm: 0 });
const trim = (start, end) => ({ ty: "tm", s: start, e: end, o: fixed(0), m: 1 });
const group = (name, shapes, opacity) => ({ ty: "gr", nm: name, it: [...shapes, transform(opacity)] });

// Measure once at build time. Native SVG dashes can reveal the exact same
// Bezier outlines without Lottie rebuilding their geometry on every frame.
function pathLength(path) {
  let length = 0;
  const segments = path.c ? path.v.length : path.v.length - 1;
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % path.v.length;
    const from = path.v[index];
    const to = path.v[next];
    let previous = from;
    for (let sample = 1; sample <= 150; sample++) {
      const t = sample / 150;
      const point = from.map((value, axis) =>
        (1 - t) ** 3 * value +
        3 * (1 - t) ** 2 * t * (value + path.o[index][axis]) +
        3 * (1 - t) * t ** 2 * (to[axis] + path.i[next][axis]) +
        t ** 3 * to[axis],
      );
      length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      previous = point;
    }
  }
  return Number(length.toFixed(4));
}

function build(name, groups) {
  const { paths, viewBox: [x, y, w, h], artworkGroups } = readArtwork();
  const outline = (indices) => indices.map((path) => ({ ty: "sh", ks: fixed(paths[path]) }));
  let layerId = 0;
  const layer = (label, shapes, overrides = {}) => ({
    ddd: 0, ind: ++layerId, ty: 4, nm: label, sr: 1, ip: 0, op: 66, st: 0, bm: 0,
    ks: { o: fixed(100), p: fixed([-x, -y, 0]), a: fixed([0, 0, 0]), s: fixed([100, 100, 100]), r: fixed(0), ...overrides },
    shapes,
  });
  const letters = groups.map(([label, artworkIndices], index) => {
    const indices = artworkIndices.flatMap((i) => artworkGroups[i]);
    const start = index * 5;
    return layer(label, [
      group(`${label} solid`, [...outline(indices), fill(tween(start + 14, start + 30, [12], [100]))]),
      group(`${label} traced outline`, indices.map((path) => {
        const length = pathLength(paths[path]);
        return group(`${label} contour ${path}`, [
          ...outline([path]),
          {
            ...stroke(1.4),
            // Hide zero-length round caps at the exact first frame.
            o: tween(start, start + 0.001, [0], [100], true),
            d: [
              { n: "d", v: fixed(length) },
              { n: "g", v: fixed(length + 1) },
              { n: "o", v: tween(start, start + 24, [length], [0]) },
            ],
          },
        ]);
      }), tween(start + 22, start + 32, [100], [0])),
    ]);
  });

  // Follow the M diagonals and each letter's center as the wordmark resolves.
  const route = [[6, 62], [13, 8], [40, 59], [67, 8], [74, 62], [105, 34], [140, 34], [171, 8], [197, 23], [185, 36], [210, 62], [237, 34], [260, 12], [278, 34], [309, 34], [344, 34], [375, 8], [402, 23], [389, 36], [414, 62], [441, 34], [465, 12], [488, 34]];
  const signalShape = { c: false, v: route, i: route.map(() => [0, 0]), o: route.map(() => [0, 0]) };
  const distances = [0];
  for (let index = 1; index < route.length; index++) {
    distances.push(distances.at(-1) + Math.hypot(route[index][0] - route[index - 1][0], route[index][1] - route[index - 1][1]));
  }
  const travelFrames = 46;
  const positions = route.map(([px, py], index) => {
    const position = [px - x, py - y, 0];
    if (index === route.length - 1) return { t: travelFrames, s: position };
    return {
      t: distances[index] / distances.at(-1) * travelFrames,
      s: position, e: [route[index + 1][0] - x, route[index + 1][1] - y, 0],
      o: { x: 0.33, y: 0.33 }, i: { x: 0.67, y: 0.67 },
    };
  });
  const signal = layer("Mergero signal", [group("Traveling trace", [
    { ty: "sh", ks: fixed(signalShape) }, stroke(1.8),
    trim(tween(7, travelFrames + 7, [0], [100], true), tween(0, travelFrames, [0], [100], true)),
  ])], { o: tween(travelFrames, travelFrames + 8, [85], [0]) });
  const point = layer("Signal point", [group("Point", [
    { ty: "el", p: fixed([0, 0]), s: fixed([4, 4]), d: 1 }, fill(),
  ])], { p: { a: 1, k: positions }, o: tween(travelFrames - 1, travelFrames + 5, [100], [0]) });

  const animation = {
    // Preserve the original drawing sequence with a slightly quicker 0.88s playback.
    v: "5.12.2", fr: 75, ip: 0, op: 66, w, h, nm: `${name} · outline trace`, ddd: 0, assets: [],
    layers: [point, signal, ...letters],
  };
  writeFileSync(new URL(`../apps/web/src/assets/${name}.json`, import.meta.url), `${JSON.stringify(animation)}\n`);
}

// Two paths form each E; retain the counters inside R, G, and O.
build("mergero-logo", [["M", [0]], ["E", [1, 2]], ["R", [4]], ["G", [5]], ["E", [3, 6]], ["R", [7]], ["O", [8]]]);

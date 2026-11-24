/** Draw site/sf-map.svg, the city under the neighborhood map, from DataSF's
 *  Analysis Neighborhoods (https://data.sfgov.org/d/j2bu-swwd, Open Data
 *  Commons Public Domain Dedication and License). Run `npm run map` after
 *  changing the projection in site/map.ts. The drawing is committed, like the
 *  other artwork, so a deploy does not depend on DataSF.
 *
 *  Each official neighborhood becomes one tinted patch. Neighbors get
 *  different tints and parks are green; the patches are decoration, not the
 *  site's labels, which are curated running areas (research/neighborhoods.md).
 *  The page styles every class, so the file has no colors of its own. */
import fs from 'node:fs';
import path from 'node:path';
import { BOUNDS, HEIGHT, project, WIDTH } from '../site/map.ts';
import { args, ROOT } from './lib.mts';

const SOURCE = 'https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100';
/* Official neighborhoods drawn as parks. */
const PARKS = new Set([
  'Golden Gate Park',
  'Presidio',
  'Lincoln Park',
  'McLaren Park',
]);
const TINTS = 4;
/* Simplification tolerance and the smallest ring kept, in viewBox units
   (one unit is about 15 m). Piers and rocks smaller than that are dropped. */
const TOLERANCE = 1.1;
const MIN_AREA = 12;

type Point = [number, number];
type Feature = {
  properties: { nhood: string };
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
};

/* Douglas–Peucker: keep the points that stray more than ``tolerance`` from
   the line through their neighbors. A ring starts and ends at the same
   point, so it is split first at the point farthest from its start. */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  const [x0, y0] = points[0];
  const far = points.reduce(
    (best, [x, y], i) =>
      Math.hypot(x - x0, y - y0) >
      Math.hypot(points[best][0] - x0, points[best][1] - y0)
        ? i
        : best,
    0,
  );
  keep[0] = keep[far] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, points.length - 1],
  ];
  while (stack.length) {
    const [start, end] = stack.pop() as [number, number];
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let farthest = -1;
    let distance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i];
      const offset =
        Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (offset > distance) [farthest, distance] = [i, offset];
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    stack.push([start, farthest], [farthest, end]);
  }
  return points.filter((_, i) => keep[i]);
}
const area = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, [x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length];
      return sum + x * ny - nx * y;
    }, 0) / 2,
  );
/* Whole-unit coordinates as relative moves, the shortest path text. */
function pathData(rings: Point[][]) {
  return rings
    .map((ring) => {
      const rounded = ring.map(([x, y]) => [Math.round(x), Math.round(y)]);
      const steps = rounded.filter(
        ([x, y], i) =>
          i === 0 || x !== rounded[i - 1][0] || y !== rounded[i - 1][1],
      );
      const [[x0, y0], ...rest] = steps;
      const moves = rest.map(
        ([x, y], i) => `${x - steps[i][0]} ${y - steps[i][1]}`,
      );
      return `M${x0} ${y0}l${moves.join(' ')}z`.replace(/ -/g, '-');
    })
    .join('');
}
/* Neighbors share an edge, so two patches are neighbors when their outlines
   pass through the same small grid cell. */
function neighbors(outlines: Point[][][]) {
  const cells = new Map<string, Set<number>>();
  for (const [index, rings] of outlines.entries())
    for (const ring of rings)
      for (const [x, y] of ring) {
        const key = `${Math.floor(x / 3)},${Math.floor(y / 3)}`;
        cells.set(key, (cells.get(key) || new Set()).add(index));
      }
  const adjacent = outlines.map(() => new Set<number>());
  for (const group of cells.values())
    for (const a of group)
      for (const b of group) if (a !== b) adjacent[a].add(b);
  return adjacent;
}
/* Greedy coloring, busiest patch first, so no two neighbors share a tint. */
function tints(names: string[], adjacent: Set<number>[]) {
  const tint = new Array<number>(names.length).fill(-1);
  const order = names
    .map((_, index) => index)
    .filter((index) => !PARKS.has(names[index]))
    .sort((a, b) => adjacent[b].size - adjacent[a].size || a - b);
  for (const index of order) {
    const used = new Set([...adjacent[index]].map((other) => tint[other]));
    tint[index] =
      Array.from({ length: TINTS }, (_, i) => i).find((i) => !used.has(i)) ?? 0;
  }
  return tint;
}
/* The Golden Gate Bridge, from Fort Point toward Marin, and the Bay Bridge's
   west span to Yerba Buena Island. Tower positions are approximate. */
function bridges() {
  const line = (points: [number, number][]) =>
    points
      .map(([lat, lon], i) => {
        const [x, y] = project(lat, lon);
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join('');
  // Seen from above, each tower is a short bar across the deck.
  const tower = (lat: number, lon: number) => {
    const [x, y] = project(lat, lon);
    return `<rect class="map-bridge-tower" x="${(x - 11).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="22" height="8" rx="3"/>`;
  };
  return [
    `<path class="map-bay-bridge" d="${line([
      [37.7887, -122.3878],
      [37.8062, -122.3705],
    ])}"/>`,
    '<g class="map-golden-gate">',
    `<path class="map-bridge-deck" d="${line([
      [37.8104, -122.4774],
      [37.8392, -122.4805],
    ])}"/>`,
    tower(37.8117, -122.4779),
    tower(37.8266, -122.4797),
    '</g>',
  ].join('');
}
export function drawMap(features: Feature[]) {
  const named = features
    .map((feature) => ({
      name: feature.properties.nhood,
      outline: feature.geometry.coordinates.flatMap((polygon) =>
        polygon.map((ring) =>
          ring.map(([lon, lat]) => project(lat, lon) as Point),
        ),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const adjacent = neighbors(named.map((item) => item.outline));
  const tint = tints(
    named.map((item) => item.name),
    adjacent,
  );
  const patches = named.map(({ name, outline }, index) => {
    const rings = outline
      .map((ring) => simplify(ring, TOLERANCE))
      .filter((ring) => ring.length > 3 && area(ring) >= MIN_AREA);
    const kind = PARKS.has(name) ? 'map-park' : `map-tint-${tint[index] + 1}`;
    return `<path class="${kind}" d="${pathData(rings)}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" class="map-art" focusable="false" aria-hidden="true">
<!-- Generated by scripts/build_map.mts from DataSF Analysis Neighborhoods (public domain): ${BOUNDS.west}..${BOUNDS.east} E, ${BOUNDS.south}..${BOUNDS.north} N. -->
<rect class="map-water" width="${WIDTH}" height="${HEIGHT}"/>
<g class="map-land" fill-rule="evenodd">${patches.join('')}</g>
${bridges()}
</svg>
`;
}
async function main(argv?: string[]) {
  const options = args({ input: { type: 'string' } }, argv);
  if (options.help) {
    console.log(
      `Draw site/sf-map.svg from DataSF's Analysis Neighborhoods. Usage: node scripts/build_map.mts [--input neighborhoods.geojson]\nWithout --input it downloads ${SOURCE}.`,
    );
    return 0;
  }
  const text =
    typeof options.input === 'string'
      ? fs.readFileSync(options.input, 'utf8')
      : await (async () => {
          const response = await fetch(SOURCE);
          if (!response.ok) throw new Error(`DataSF: HTTP ${response.status}`);
          return response.text();
        })();
  const features: Feature[] = JSON.parse(text).features;
  if (!features?.length) throw new Error('No neighborhoods in the download');
  const file = path.join(ROOT, 'site', 'sf-map.svg');
  fs.writeFileSync(file, drawMap(features));
  console.log(
    `Wrote site/sf-map.svg: ${features.length} neighborhoods, ${fs.statSync(file).size} bytes.`,
  );
  return 0;
}
if (import.meta.main)
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );

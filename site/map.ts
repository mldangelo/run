/* The neighborhood map. site/sf-map.svg (drawn by scripts/build_map.mts from
   DataSF's neighborhoods) is the city; each San Francisco label in
   data/neighborhoods.json gets a marker at its `marker` point. Both use
   project(), so markers land where the art draws the city. The layout
   functions are pure; drawMarkers() puts their result on the page. */
import type { Neighborhood } from '../scripts/types.mts';

/* The area drawn, in degrees: San Francisco and Treasure Island, with a
   margin of water for its labels. The Golden Gate Bridge runs off the top
   edge toward Marin. */
export const BOUNDS = {
  west: -122.528,
  east: -122.35,
  north: 37.836,
  south: 37.704,
};
/* A degree of longitude is shorter than a degree of latitude by the cosine
   of the latitude; at city scale that one factor keeps shapes true. */
const X_SCALE = Math.cos((((BOUNDS.north + BOUNDS.south) / 2) * Math.PI) / 180);
export const WIDTH = 1000;
export const HEIGHT = Math.round(
  (WIDTH * (BOUNDS.north - BOUNDS.south)) /
    ((BOUNDS.east - BOUNDS.west) * X_SCALE),
);
/* A point's position in the map's WIDTH × HEIGHT viewBox. */
export function project(lat: number, lon: number): [number, number] {
  return [
    ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * WIDTH,
    ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * HEIGHT,
  ];
}

export type Place = Neighborhood & { count: number };
export type Marker = {
  name: string;
  count: number;
  /* Where the label's point is, and where its marker is drawn after
     spreading, in pixels. */
  anchor: [number, number];
  x: number;
  y: number;
  r: number;
};
type Box = { left: number; top: number; right: number; bottom: number };

/* Markers grow with the square root of their count, so area tracks it. A
   marker with nothing to show is a small dot. */
export function markerRadius(count: number, compact = false) {
  if (!count) return 4;
  return Math.min(
    compact ? 17 : 23,
    compact ? 10 + 1.8 * Math.sqrt(count) : 13 + 2 * Math.sqrt(count),
  );
}
/* Pixel positions for the places that have a marker point. Markers that
   would overlap are pushed apart, a little each round, and kept inside the
   map; each keeps its anchor so the page can show where it belongs. */
export function layoutMarkers(
  places: Place[],
  width: number,
  height: number,
  gap = 3,
): Marker[] {
  const compact = width < 520;
  const markers = places.flatMap((place): Marker[] => {
    if (!place.marker) return [];
    const [x, y] = project(place.marker.lat, place.marker.lon);
    const anchor: [number, number] = [
      (x / WIDTH) * width,
      (y / HEIGHT) * height,
    ];
    return [
      {
        name: place.name,
        count: place.count,
        anchor,
        x: anchor[0],
        y: anchor[1],
        r: markerRadius(place.count, compact),
      },
    ];
  });
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (const [i, a] of markers.entries())
      for (const b of markers.slice(i + 1)) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        const overlap = a.r + b.r + gap - distance;
        if (overlap <= 0) continue;
        moved = true;
        // The larger marker moves less, so busy places stay put.
        const share = b.r / (a.r + b.r);
        const [ux, uy] =
          distance > 0.01 ? [dx / distance, dy / distance] : [1, 0];
        a.x -= ux * overlap * share;
        a.y -= uy * overlap * share;
        b.x += ux * overlap * (1 - share);
        b.y += uy * overlap * (1 - share);
      }
    for (const marker of markers) {
      marker.x = Math.min(width - marker.r, Math.max(marker.r, marker.x));
      marker.y = Math.min(height - marker.r, Math.max(marker.r, marker.y));
    }
    if (!moved) break;
  }
  return markers;
}
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const circleBox = ({ x, y, r }: Marker): Box => ({
  left: x - r,
  top: y - r,
  right: x + r,
  bottom: y + r,
});
/* Where each marker's name goes: beside it, then the other side, below or
   above, whichever first fits inside the map without covering another
   marker or name. Names that fit nowhere are left out; the list beside the
   map still shows them. ``first`` names are placed before the rest and
   always shown. */
export function placeNames(
  markers: Marker[],
  sizes: Map<string, [number, number]>,
  width: number,
  height: number,
  first: string[] = [],
) {
  const placed = new Map<string, Box>();
  const taken = markers.map(circleBox);
  const order = [...markers].sort(
    (a, b) =>
      Number(first.includes(b.name)) - Number(first.includes(a.name)) ||
      b.count - a.count,
  );
  for (const marker of order) {
    const size = sizes.get(marker.name);
    if (!size || !marker.count) continue;
    const [w, h] = size;
    const space = 4;
    const options: Box[] = [
      [marker.x + marker.r + space, marker.y - h / 2],
      [marker.x - marker.r - space - w, marker.y - h / 2],
      [marker.x - w / 2, marker.y + marker.r + 2],
      [marker.x - w / 2, marker.y - marker.r - 2 - h],
    ].map(([left, top]) => ({ left, top, right: left + w, bottom: top + h }));
    const inside = options.filter(
      (box) =>
        box.left >= 2 &&
        box.top >= 2 &&
        box.right <= width - 2 &&
        box.bottom <= height - 2,
    );
    // A ``first`` name is always shown, over its neighbors if it must be.
    const fit =
      inside.find((box) => !taken.some((other) => overlaps(box, other))) ||
      (first.includes(marker.name) ? inside[0] : undefined);
    if (!fit) continue;
    placed.set(marker.name, fit);
    taken.push(fit);
  }
  return placed;
}
/* A short name for the map, where space is tight: the part before a slash,
   so "Marina / Presidio" is drawn as "Marina". The list shows the full
   label. */
export const shortName = (name: string) => name.split(' / ')[0];

/* ---------- On the page ---------- */

const percent = (value: number, total: number) => `${(value / total) * 100}%`;
/* Draw the markers and their names into ``layer``, a box over the map art.
   Markers are buttons for pointer users; the list beside the map is the
   keyboard and screen-reader control, so the layer is aria-hidden and its
   buttons stay out of the tab order. Styles are set through the DOM because
   the page's security policy blocks inline style attributes. */
export function drawMarkers(
  layer: HTMLElement,
  places: Place[],
  selected: string,
) {
  const { width, height } = layer.getBoundingClientRect();
  if (!width || !height) return;
  const markers = layoutMarkers(places, width, height);
  const nodes: HTMLElement[] = [];
  const names = new Map<string, HTMLElement>();
  for (const marker of markers) {
    if (
      Math.hypot(marker.x - marker.anchor[0], marker.y - marker.anchor[1]) > 3
    ) {
      const anchor = document.createElement('span');
      anchor.className = 'map-anchor';
      anchor.style.left = percent(marker.anchor[0], width);
      anchor.style.top = percent(marker.anchor[1], height);
      nodes.push(anchor);
    }
    const button = document.createElement(marker.count ? 'button' : 'span');
    button.className = 'map-marker';
    button.dataset.place = marker.name;
    if (button instanceof HTMLButtonElement) {
      button.type = 'button';
      button.tabIndex = -1;
      button.textContent = String(marker.count);
      button.classList.toggle('selected', marker.name === selected);
    } else button.classList.add('map-dot');
    button.style.left = percent(marker.x, width);
    button.style.top = percent(marker.y, height);
    button.style.width = button.style.height = `${marker.r * 2}px`;
    nodes.push(button);
    if (!marker.count) continue;
    const name = document.createElement('span');
    name.className = 'map-name';
    name.dataset.place = marker.name;
    name.textContent = shortName(marker.name);
    name.classList.toggle('selected', marker.name === selected);
    names.set(marker.name, name);
  }
  layer.replaceChildren(...nodes, ...names.values());
  const sizes = new Map(
    [...names].map(
      ([key, node]) =>
        [key, [node.offsetWidth, node.offsetHeight]] as [
          string,
          [number, number],
        ],
    ),
  );
  const boxes = placeNames(markers, sizes, width, height, [selected]);
  for (const [key, node] of names) {
    const box = boxes.get(key);
    if (!box) {
      node.remove();
      continue;
    }
    node.style.left = percent(box.left, width);
    node.style.top = percent(box.top, height);
  }
}

/* Names on the water, for orientation. "Marin" marks where the Golden Gate
   Bridge leaves the map. */
const WATER = [
  { text: 'Pacific Ocean', lat: 37.745, lon: -122.5205, vertical: true },
  { text: 'Golden Gate', lat: 37.8235, lon: -122.508 },
  { text: 'Marin', lat: 37.8325, lon: -122.465 },
  { text: 'The Bay', lat: 37.7715, lon: -122.366 },
];
let art: Promise<void> | null = null;
/* Load the city drawing into ``slot`` once, the first time the map opens,
   and set ``canvas`` to its proportions. If it cannot load, the markers
   still show over plain water and the list still works; the next opening
   tries again. */
export function loadArt(canvas: HTMLElement, slot: HTMLElement) {
  canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
  art ||= fetch('site/sf-map.svg', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw Error(`map: HTTP ${response.status}`);
      return response.text();
    })
    .then((svg) => {
      slot.innerHTML = svg;
      slot.append(
        ...WATER.map(({ text, lat, lon, vertical }) => {
          const label = document.createElement('span');
          label.className = vertical
            ? 'map-water-name vertical'
            : 'map-water-name';
          label.textContent = text;
          const [x, y] = project(lat, lon);
          label.style.left = percent(x, WIDTH);
          label.style.top = percent(y, HEIGHT);
          return label;
        }),
      );
    })
    .catch((error) => {
      console.error(error);
      art = null;
    });
  return art;
}

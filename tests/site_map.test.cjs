const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const map = require('../site/map.js');
const neighborhoods = require('../data/neighborhoods.json');

const svg = fs.readFileSync(
  path.join(__dirname, '..', 'site', 'sf-map.svg'),
  'utf8',
);
const places = (count) =>
  neighborhoods
    .filter((place) => place.marker)
    .map((place) => ({ ...place, count }));
const apart = (a, b, gap = 0) =>
  Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + gap - 0.01;

test('the map art and the markers share one projection', () => {
  assert.match(svg, new RegExp(`viewBox="0 0 ${map.WIDTH} ${map.HEIGHT}"`));
  assert.deepEqual(map.project(map.BOUNDS.north, map.BOUNDS.west), [0, 0]);
  assert.deepEqual(map.project(map.BOUNDS.south, map.BOUNDS.east), [
    map.WIDTH,
    map.HEIGHT,
  ]);
  // A kilometre east covers as many units as a kilometre north.
  const [x0, y0] = map.project(37.77, -122.45);
  const [x1] = map.project(
    37.77,
    -122.45 + 1 / (111.32 * Math.cos((37.77 * Math.PI) / 180)),
  );
  const [, y1] = map.project(37.77 - 1 / 111.32, -122.45);
  assert.ok(Math.abs(x1 - x0 - (y1 - y0)) < 0.5);
  // The art has no colors of its own; the stylesheet's tokens paint it.
  assert.doesNotMatch(svg, /\b(?:fill|stroke|style)="/);
});

for (const width of [330, 700])
  test(`markers never overlap and stay on a ${width}px map`, () => {
    const height = (width * map.HEIGHT) / map.WIDTH;
    for (const count of [1, 9, 120]) {
      const markers = map.layoutMarkers(places(count), width, height);
      assert.equal(markers.length, places(count).length);
      for (const [i, a] of markers.entries()) {
        assert.ok(a.x - a.r >= 0 && a.x + a.r <= width, a.name);
        assert.ok(a.y - a.r >= 0 && a.y + a.r <= height, a.name);
        for (const b of markers.slice(i + 1))
          assert.ok(apart(a, b), `${a.name} overlaps ${b.name}`);
      }
    }
  });

test('names sit beside their markers without covering another, and the chosen one always shows', () => {
  const [width, height] = [330, (330 * map.HEIGHT) / map.WIDTH];
  const markers = map.layoutMarkers(places(3), width, height);
  const sizes = new Map(
    markers.map((marker) => [
      marker.name,
      [map.shortName(marker.name).length * 7, 14],
    ]),
  );
  const chosen = 'Duboce Park';
  const boxes = map.placeNames(markers, sizes, width, height, [chosen]);
  assert.ok(boxes.has(chosen));
  const circles = markers.map(({ x, y, r }) => ({
    left: x - r,
    top: y - r,
    right: x + r,
    bottom: y + r,
  }));
  const covers = (a, b) =>
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom;
  const others = [...boxes].filter(([name]) => name !== chosen);
  for (const [name, box] of boxes) {
    assert.ok(box.left >= 0 && box.right <= width, name);
    assert.ok(box.top >= 0 && box.bottom <= height, name);
  }
  for (const [name, box] of others) {
    assert.ok(!circles.some((circle) => covers(box, circle)), name);
    for (const [other, next] of others)
      if (other !== name) assert.ok(!covers(box, next), `${name} / ${other}`);
  }
  assert.equal(map.shortName('Marina / Presidio'), 'Marina');
});

test('a place with nothing to show is a small dot, and busier places grow', () => {
  assert.equal(map.markerRadius(0), 4);
  assert.ok(map.markerRadius(1) < map.markerRadius(9));
  assert.ok(map.markerRadius(9) <= map.markerRadius(500));
  assert.ok(map.markerRadius(1, true) < map.markerRadius(1));
});

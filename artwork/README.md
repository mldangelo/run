# Site artwork

The visual identity uses the existing forest, warm cream and burnt-orange palette. The bridge-and-route mark is a hand-authored SVG, so it remains crisp at favicon sizes. Browser, Apple and home-screen exports use that same source. The share card combines the mark, editable SVG text and the running illustration.

## Sources and exports

- `site/favicon.svg`: editable mark, also used directly on the page.
- `site/running-together.webp`: AI-generated illustration, optimized to WebP without changing its composition (1536 × 1024; about 160 kB).
- `artwork/social-card.svg`: 1200 × 630 layout. `{{illustration}}` and `{{mark}}` are embedded by the exporter.
- `scripts/build_artwork.mts`: run with `npm run artwork` after `npm ci`. Uses the pinned Sharp development dependency; the deployed site has no runtime dependency on it.

Review `site/og-image.png` after exporting, especially if the machine's available fonts change. The template uses Arial/Helvetica/sans-serif fallbacks. The SVG renderer receives an embedded PNG version of the WebP illustration for compatibility. The original illustration was generated with the built-in imagegen tool on November 9, 2026. It is decorative artwork, not a sourced photograph, map or depiction of a specific club or event.

The desktop introduction shows the complete illustration. Small screens omit it to keep the directory close to the top. Empty alt text marks the on-page image and repeated icons as decorative; the share card has its own descriptive Open Graph alt text.

## Original generation prompt

> Use case: illustration-story. Asset type: editorial website artwork for SF Run Club Index, an independent running-club directory. Create a refined flat screenprint illustration of a few runners moving together along a winding San Francisco park path, with a simplified Golden Gate Bridge in the distance, layered coastal hills, a cypress tree silhouette and low fog. Wide landscape composition, approximately 3:2. Give the runners varied silhouettes and casual running clothes; tiny, loose gestural figures, with no facial details. Runners in lower middle, bridge on upper right, broad quiet warm cream sky in upper third. Style: mid-century Bay Area park poster, bold cut-paper shapes, restrained subtle screenprint grain, elegant confident curves, no outlines, no photorealism, no gradients, no fine detail. Palette strictly warm cream #f7f5eb, deep forest green #203c32, muted sage #799b71, pale chartreuse #dfe8c7 and burnt vermilion #d95d3f. Mostly cream and green, orange accents on bridge and shirts. Must work cropped into a wide horizontal strip as well as a social preview. Depict a friendly everyday group run rather than a race. No lettering, no text, no numbers, no logo, no watermark, no borders. This is a decorative illustration, not an actual route map.

## PAC community photograph

`site/pac-community.webp` is a 1200 × 800 WebP (about 130 kB) of the organizer-published [PAC group photograph](https://pacrunclub.com/images/a3e4da6b_PRC_Group_3.jpg), retrieved November 9, 2026. It identifies PAC in an editorial directory feature; it is not presented as a photograph of a specific dated run. The [organizer homepage](https://pacrunclub.com/) credits photography to [@tianna.nguy](https://www.instagram.com/tianna.nguy/), repeated visibly beside the image. The file is resized and compressed without changing the composition. Copyright remains with its owner; this third-party photograph is excluded from the repository MIT license. No explicit open reuse license was found.

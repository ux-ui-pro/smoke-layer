# smoke-layer

A lightweight animated smoke layer for any HTML container using Canvas 2D.

- Responsive to container size and DPR.
- Supports wind, turbulence, tint, and density controls.
- Uses viewport and document visibility observers to avoid wasted frames.

## Install

```bash
npm i smoke-layer
```

## Usage (TypeScript)

```ts
import { SmokeLayer } from 'smoke-layer';

const container = document.getElementById('smoke-layer');

if (!container) {
  throw new Error('Smoke container was not found');
}

const smokeLayer = new SmokeLayer({
  container,
  texture: 'https://i.ibb.co/Z6CQhdz9/fog4.png',
  tintColor: '#98B4C9',
  opacity: 0.45,
  smokeDensity: 1,
  particleSize: 280,
  maxParticleCount: 420,
  windX: 5,
  windY: -9,
  turbulence: 1.5,
  animationSpeed: 1.25,
});

smokeLayer.start();

// Later when hidden or unmounted:
smokeLayer.dispose();
```

## Methods

```ts
smokeLayer.start();
smokeLayer.stop();
smokeLayer.dispose();
```

## Exports

```ts
import { SmokeLayer } from 'smoke-layer';
import type { SmokeLayerOptions } from 'smoke-layer';
```

## Vue 3 (short example)

```ts
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { SmokeLayer } from 'smoke-layer';

const containerRef = ref<HTMLDivElement | null>(null);
const layerRef = shallowRef<SmokeLayer | null>(null);

onMounted(() => {
  if (!containerRef.value) return;
  layerRef.value = new SmokeLayer({
    container: containerRef.value,
    texture: '/fog-texture.png',
  });
  layerRef.value.start();
});

onBeforeUnmount(() => {
  layerRef.value?.dispose();
  layerRef.value = null;
});
```

## Options

| Option             | Type          | Default     | Description |
|:-------------------|:--------------|:------------|:------------|
| `container`        | `HTMLElement` | —           | Target element where the internal smoke canvas is injected. |
| `texture`          | `string`      | —           | URL of a smoke texture image. |
| `tintColor`        | `string`      | `#ffffff`   | Hex tint color (`#rgb` or `#rrggbb`). |
| `opacity`          | `number`      | `0.3`       | Global smoke opacity (`0..1`). |
| `smokeDensity`     | `number`      | `1`         | Density multiplier used in automatic particle count. |
| `particleScale`    | `number`      | `1`         | Scale multiplier for automatic particle sizing. |
| `particleSize`     | `number`      | auto        | Fixed particle size in pixels. |
| `particleCount`    | `number`      | auto        | Fixed particle count. |
| `maxParticleCount` | `number`      | `420`       | Upper limit for automatically calculated particle count. |
| `maxDpr`           | `number`      | `2`         | Maximum DPR used for canvas backing resolution. |
| `windX`            | `number`      | `6`         | Horizontal drift speed in px/sec. |
| `windY`            | `number`      | `-8`        | Vertical drift speed in px/sec. |
| `turbulence`       | `number`      | `1`         | Multiplier for sway, pulse, and depth movement. |
| `animationSpeed`   | `number`      | `1`         | Time scale for animation updates. |

## License

MIT

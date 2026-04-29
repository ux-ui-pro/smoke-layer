export interface SmokeLayerOptions {
  container: HTMLElement;
  texture: string;
  tintColor?: string;
  opacity?: number;
  smokeDensity?: number;
  particleScale?: number;
  particleSize?: number;
  particleCount?: number;
  maxParticleCount?: number;
  maxDpr?: number;
  windX?: number;
  windY?: number;
  turbulence?: number;
  animationSpeed?: number;
}

interface SmokeParticle {
  nx: number;
  ny: number;
  z: number;
  rotation: number;
  rotationSpeed: number;
  sizeMultiplier: number;
  alpha: number;
  driftX: number;
  driftY: number;
  swayRadiusX: number;
  swayRadiusY: number;
  swaySpeed: number;
  swayPhaseX: number;
  swayPhaseY: number;
  pulseSpeed: number;
  pulsePhase: number;
  pulseAmount: number;
  depthPhase: number;
  depthSpeed: number;
  depthAmount: number;
}

interface SmokeLayerBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export default class SmokeLayer {
  private width = 0;
  private height = 0;
  private dpr = 1;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private dprMediaQuery: MediaQueryList | null = null;

  private particles: SmokeParticle[] = [];
  private tintedTexture: HTMLCanvasElement | null = null;
  private rafId: number | null = null;

  private disposed = false;
  private running = false;
  private isInViewport = true;
  private isDocumentVisible = !document.hidden;

  private lastTime = 0;
  private elapsedTime = 0;

  private currentParticleSize = 0;

  private readonly container: HTMLElement;
  private readonly textureUrl: string;
  private readonly tintColor: string;
  private readonly opacity: number;
  private readonly smokeDensity: number;
  private readonly particleScale: number;
  private readonly manualParticleSize?: number;
  private readonly manualParticleCount?: number;
  private readonly maxParticleCount: number;
  private readonly maxDpr: number;
  private readonly windX: number;
  private readonly windY: number;
  private readonly turbulence: number;
  private readonly animationSpeed: number;

  constructor({
    container,
    texture,
    tintColor = '#ffffff',
    opacity = 0.3,
    smokeDensity = 1,
    particleScale = 1,
    particleSize,
    particleCount,
    maxParticleCount = 420,
    maxDpr = 2,
    windX = 6,
    windY = -8,
    turbulence = 1,
    animationSpeed = 1,
  }: SmokeLayerOptions) {
    this.container = container;
    this.textureUrl = texture;
    this.tintColor = tintColor;
    this.opacity = SmokeLayer.clamp(opacity, 0, 1);
    this.smokeDensity = Math.max(0.05, smokeDensity);
    this.particleScale = Math.max(0.01, particleScale);
    this.manualParticleSize =
      typeof particleSize === 'number' ? Math.max(1, particleSize) : undefined;
    this.manualParticleCount =
      typeof particleCount === 'number' ? Math.max(1, Math.round(particleCount)) : undefined;
    this.maxParticleCount = Math.max(1, Math.round(maxParticleCount));
    this.maxDpr = Math.max(1, maxDpr);
    this.windX = windX;
    this.windY = windY;
    this.turbulence = Math.max(0, turbulence);
    this.animationSpeed = Math.max(0, animationSpeed);

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.pointerEvents = 'none';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D is not supported');
    }

    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.container.appendChild(this.canvas);

    this.resizeRenderer(this.container.clientWidth, this.container.clientHeight);
    this.updateResponsiveModel();
    this.loadTexture();
    this.attachResizeObserver();
    this.attachDprListener();
    this.attachVisibilityObservers();
  }

  public start(): void {
    if (this.disposed) return;
    this.running = true;
    this.requestFrame(true);
  }

  public stop(): void {
    this.running = false;
    this.cancelFrame();
  }

  public dispose(): void {
    this.disposed = true;
    this.stop();

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;

    this.dprMediaQuery?.removeEventListener('change', this.onDprChange);
    this.dprMediaQuery = null;

    window.removeEventListener('resize', this.onWindowResize);
    document.removeEventListener('visibilitychange', this.onDocumentVisibilityChange);

    this.particles = [];
    this.tintedTexture = null;

    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }
  }

  private requestFrame(resetTime = false): void {
    if (this.disposed || !this.running || !this.canAnimate() || this.rafId !== null) {
      return;
    }
    if (resetTime) {
      this.lastTime = performance.now();
    }
    this.rafId = requestAnimationFrame(this.animate);
  }

  private cancelFrame(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private animate = (time: number): void => {
    this.rafId = null;
    if (this.disposed || !this.running || !this.canAnimate()) {
      return;
    }

    const rawDelta = (time - this.lastTime) / 1000;
    const delta = Math.min(rawDelta, 1 / 30);
    this.lastTime = time;

    this.updateParticles(delta);
    this.render();
    this.requestFrame();
  };

  private canAnimate(): boolean {
    return this.isInViewport && this.isDocumentVisible;
  }

  private loadTexture(): void {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    image.onload = (): void => {
      if (this.disposed) return;
      this.tintedTexture = this.createTintedTextureCanvas(image);
    };

    image.onerror = (): void => {
      if (this.disposed) return;
      console.warn(`SmokeLayer: failed to load texture "${this.textureUrl}"`);
    };

    image.src = this.textureUrl;
  }

  private createTintedTextureCanvas(image: HTMLImageElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D is not supported');
    }

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = SmokeLayer.normalizeColor(this.tintColor);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    return canvas;
  }

  private updateResponsiveModel(): void {
    if (this.width <= 0 || this.height <= 0) {
      this.currentParticleSize = 0;
      this.ensureParticleCount(0);
      return;
    }

    this.currentParticleSize = this.getParticleSize();
    this.ensureParticleCount(this.getParticleCount(this.currentParticleSize));
  }

  private getParticleSize(): number {
    if (typeof this.manualParticleSize === 'number') {
      return this.manualParticleSize;
    }

    const geometricSize = Math.sqrt(this.width * this.height);
    const rawSize = geometricSize * 0.45 * this.particleScale;

    const shortSide = Math.min(this.width, this.height);
    const longSide = Math.max(this.width, this.height);

    return SmokeLayer.clamp(rawSize, shortSide * 0.35, longSide * 0.55);
  }

  private getParticleCount(particleSize: number): number {
    if (typeof this.manualParticleCount === 'number') {
      return Math.min(this.manualParticleCount, this.maxParticleCount);
    }

    if (particleSize <= 0 || this.width <= 0 || this.height <= 0) {
      return 0;
    }

    const bounds = this.getSmokeBoundsFor(this.width, this.height, particleSize);
    const smokeArea = bounds.width * bounds.height;
    const particleRadius = particleSize / 2;
    const particleArea = Math.PI * particleRadius * particleRadius;
    const count = (smokeArea / particleArea) * 9 * this.smokeDensity;

    return Math.min(this.maxParticleCount, Math.max(24, Math.round(count)));
  }

  private ensureParticleCount(count: number): void {
    if (this.particles.length === count) return;
    if (this.particles.length > count) {
      this.particles.length = count;
      return;
    }

    for (let i = this.particles.length; i < count; i++) {
      this.particles.push(this.createParticle(i));
    }
  }

  private createParticle(index: number): SmokeParticle {
    const jitter = 0.035;
    const twoPi = Math.PI * 2;

    return {
      nx: SmokeLayer.wrap01(
        SmokeLayer.halton(index + 1, 2) + SmokeLayer.range(index, 11, -jitter / 2, jitter / 2),
      ),
      ny: SmokeLayer.wrap01(
        SmokeLayer.halton(index + 1, 3) + SmokeLayer.range(index, 29, -jitter / 2, jitter / 2),
      ),
      z: SmokeLayer.range(index, 43, -100, 900),
      rotation: SmokeLayer.range(index, 71, 0, twoPi),
      rotationSpeed: SmokeLayer.range(index, 97, 0.01, 0.055),
      sizeMultiplier: SmokeLayer.range(index, 131, 0.82, 1.24),
      alpha: SmokeLayer.range(index, 173, 0.72, 1),
      driftX: SmokeLayer.range(index, 191, -5, 5),
      driftY: SmokeLayer.range(index, 211, -10, -2),
      swayRadiusX: SmokeLayer.range(index, 229, 14, 56),
      swayRadiusY: SmokeLayer.range(index, 251, 8, 32),
      swaySpeed: SmokeLayer.range(index, 271, 0.08, 0.3),
      swayPhaseX: SmokeLayer.range(index, 293, 0, twoPi),
      swayPhaseY: SmokeLayer.range(index, 311, 0, twoPi),
      pulseSpeed: SmokeLayer.range(index, 337, 0.08, 0.26),
      pulsePhase: SmokeLayer.range(index, 353, 0, twoPi),
      pulseAmount: SmokeLayer.range(index, 379, 0.035, 0.09),
      depthPhase: SmokeLayer.range(index, 397, 0, twoPi),
      depthSpeed: SmokeLayer.range(index, 419, 0.035, 0.115),
      depthAmount: SmokeLayer.range(index, 431, 35, 125),
    };
  }

  private updateParticles(delta: number): void {
    if (this.particles.length === 0) return;
    if (this.width <= 0 || this.height <= 0) return;

    const scaledDelta = delta * this.animationSpeed;
    this.elapsedTime += scaledDelta;

    const bounds = this.getSmokeBounds();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    for (const particle of this.particles) {
      this.updateParticle(particle, scaledDelta, bounds);
    }
  }

  private updateParticle(
    particle: SmokeParticle,
    scaledDelta: number,
    bounds: SmokeLayerBounds,
  ): void {
    const depth = this.getParticleDepth(particle);
    const motionDepthMultiplier = 0.55 + depth * 0.85;

    particle.rotation += scaledDelta * particle.rotationSpeed * (0.65 + depth * 0.7);

    const velocityX = (this.windX + particle.driftX) * motionDepthMultiplier;
    const velocityY = (this.windY + particle.driftY) * motionDepthMultiplier;

    particle.nx = SmokeLayer.wrap01(particle.nx + (velocityX * scaledDelta) / bounds.width);
    particle.ny = SmokeLayer.wrap01(particle.ny + (velocityY * scaledDelta) / bounds.height);
  }

  private render(): void {
    if (this.width <= 0 || this.height <= 0) return;

    const texture = this.tintedTexture;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (!texture) return;

    const bounds = this.getSmokeBounds();
    const topGap = this.getSmokeTopGap(this.height);
    const time = this.elapsedTime;

    for (const particle of this.particles) {
      this.drawParticle(texture, particle, bounds, topGap, time);
    }

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.globalAlpha = 1;
  }

  private drawParticle(
    texture: HTMLCanvasElement,
    particle: SmokeParticle,
    bounds: SmokeLayerBounds,
    topGap: number,
    time: number,
  ): void {
    const depth = this.getParticleDepth(particle, time);
    const depthScale = 0.75 + depth * 0.65;

    const pulse =
      1 +
      Math.sin(time * particle.pulseSpeed + particle.pulsePhase) *
        particle.pulseAmount *
        this.turbulence;

    const size = this.currentParticleSize * particle.sizeMultiplier * depthScale * pulse;
    const baseX = bounds.minX + particle.nx * bounds.width;
    const baseY = bounds.minY + particle.ny * bounds.height;

    const swayX =
      (Math.sin(time * particle.swaySpeed + particle.swayPhaseX) * particle.swayRadiusX +
        Math.sin(time * particle.swaySpeed * 0.43 + particle.swayPhaseY) *
          particle.swayRadiusX *
          0.45) *
      this.turbulence;

    const swayY =
      Math.cos(time * particle.swaySpeed * 0.71 + particle.swayPhaseY) *
      particle.swayRadiusY *
      this.turbulence;

    const x = baseX + swayX;
    let y = baseY + swayY;

    const minYByTopEdge = -this.height / 2 + topGap + size / 2;
    if (y < minYByTopEdge) {
      y = minYByTopEdge;
    }

    const edgeFade = this.getEdgeFade(particle.nx, particle.ny);
    const alphaPulse =
      0.9 +
      Math.sin(time * particle.pulseSpeed * 0.77 + particle.pulsePhase) * 0.1 * this.turbulence;

    const alpha = SmokeLayer.clamp01(
      this.opacity * particle.alpha * (0.72 + depth * 0.28) * edgeFade * alphaPulse,
    );
    if (alpha <= 0.001) return;

    const rotation = particle.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const centerX = this.width / 2 + x;
    const centerY = this.height / 2 + y;

    this.ctx.setTransform(
      cos * this.dpr,
      sin * this.dpr,
      -sin * this.dpr,
      cos * this.dpr,
      centerX * this.dpr,
      centerY * this.dpr,
    );

    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(texture, -size / 2, -size / 2, size, size);
  }

  private getParticleDepth(particle: SmokeParticle, time = this.elapsedTime): number {
    const animatedZ =
      particle.z +
      Math.sin(time * particle.depthSpeed + particle.depthPhase) *
        particle.depthAmount *
        this.turbulence;

    return SmokeLayer.normalizeDepth(animatedZ);
  }

  private getEdgeFade(nx: number, ny: number): number {
    const horizontalFade = 0.07;
    const verticalFade = 0.12;

    const xFade = Math.min(1, nx / horizontalFade, (1 - nx) / horizontalFade);
    const yFade = Math.min(1, ny / verticalFade, (1 - ny) / verticalFade);

    return SmokeLayer.clamp01(Math.min(xFade, yFade));
  }

  private getSmokeBounds(): SmokeLayerBounds {
    return this.getSmokeBoundsFor(this.width, this.height, this.currentParticleSize);
  }

  private getSmokeBoundsFor(width: number, height: number, particleSize: number): SmokeLayerBounds {
    const horizontalOverflow = particleSize * 0.75;
    const verticalOverflowBottom = particleSize * 0.35;

    const minX = -width / 2 - horizontalOverflow;
    const maxX = width / 2 + horizontalOverflow;

    const minY = -height / 2 + this.getSmokeTopGap(height) + particleSize / 2;
    const maxY = height - height / 2 + verticalOverflowBottom;

    return {
      minX,
      minY,
      width: maxX - minX,
      height: Math.max(1, maxY - minY),
    };
  }

  private getSmokeTopGap(height: number): number {
    return SmokeLayer.clamp(height * 0.035, 12, 48);
  }

  private attachResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.onWindowResize);
      this.onWindowResize();
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      this.resizeRenderer(entry.contentRect.width, entry.contentRect.height);
      this.updateResponsiveModel();
    });

    this.resizeObserver.observe(this.container);
  }

  private onWindowResize = (): void => {
    if (this.disposed) return;

    this.resizeRenderer(this.container.clientWidth, this.container.clientHeight);
    this.updateResponsiveModel();
  };

  private attachDprListener(): void {
    this.dprMediaQuery?.removeEventListener('change', this.onDprChange);
    this.dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.dprMediaQuery.addEventListener('change', this.onDprChange);
  }

  private onDprChange = (): void => {
    if (this.disposed) return;

    this.dprMediaQuery?.removeEventListener('change', this.onDprChange);

    this.resizeRenderer(this.container.clientWidth, this.container.clientHeight);
    this.updateResponsiveModel();
    this.attachDprListener();
  };

  private attachVisibilityObservers(): void {
    document.addEventListener('visibilitychange', this.onDocumentVisibilityChange);

    if (typeof IntersectionObserver === 'undefined') return;

    this.intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      this.isInViewport = entry?.isIntersecting ?? true;
      this.handleAnimationVisibility();
    });

    this.intersectionObserver.observe(this.container);
  }

  private onDocumentVisibilityChange = (): void => {
    if (this.disposed) return;
    this.isDocumentVisible = !document.hidden;
    this.handleAnimationVisibility();
  };

  private handleAnimationVisibility(): void {
    if (!this.running) return;

    if (this.canAnimate()) {
      this.requestFrame(true);
    } else {
      this.cancelFrame();
    }
  }

  private resizeRenderer(width: number, height: number): void {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);

    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    if (this.width <= 0 || this.height <= 0) {
      this.dpr = 1;

      if (this.canvas.width !== 1 || this.canvas.height !== 1) {
        this.canvas.width = 1;
        this.canvas.height = 1;
      }

      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, 1, 1);
      return;
    }

    this.dpr = this.getSafeDpr();

    const nextCanvasWidth = Math.max(1, Math.round(this.width * this.dpr));
    const nextCanvasHeight = Math.max(1, Math.round(this.height * this.dpr));

    if (this.canvas.width !== nextCanvasWidth || this.canvas.height !== nextCanvasHeight) {
      this.canvas.width = nextCanvasWidth;
      this.canvas.height = nextCanvasHeight;
    }

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  private getSafeDpr(): number {
    return Math.min(window.devicePixelRatio || 1, this.maxDpr);
  }

  private static normalizeDepth(z: number): number {
    return SmokeLayer.clamp01((z + 100) / 1000);
  }

  private static normalizeColor(color: string): string {
    let hex = color.trim().replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }

    if (!/^[0-9a-f]{6}$/i.test(hex)) {
      return '#ffffff';
    }

    return `#${hex}`;
  }

  private static halton(index: number, base: number): number {
    let result = 0;
    let fraction = 1 / base;
    let i = index;

    while (i > 0) {
      result += fraction * (i % base);
      i = Math.floor(i / base);
      fraction /= base;
    }

    return result;
  }

  private static hash(index: number, salt: number): number {
    const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  private static range(index: number, salt: number, min: number, max: number): number {
    return min + SmokeLayer.hash(index, salt) * (max - min);
  }

  private static wrap01(value: number): number {
    return value - Math.floor(value);
  }

  private static clamp01(value: number): number {
    return SmokeLayer.clamp(value, 0, 1);
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}

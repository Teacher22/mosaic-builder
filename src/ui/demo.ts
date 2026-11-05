// A one-click demo using images generated on the spot, so anyone can try the
// app without choosing files and nothing needs downloading.

const DEMO_TILES = 320;
const TILE_SIZE = 200;

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawScene(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  const hue = rand() * 360;
  const light = 12 + rand() * 76;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `hsl(${hue} ${25 + rand() * 60}% ${light}%)`);
  sky.addColorStop(1, `hsl(${(hue + rand() * 70) % 360} ${25 + rand() * 60}% ${Math.min(95, light + rand() * 25)}%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = `hsl(${(hue + 40) % 360} 75% ${Math.min(96, light + 35)}%)`;
  ctx.beginPath();
  ctx.arc(rand() * w, rand() * h * 0.6, (0.06 + rand() * 0.14) * w, 0, Math.PI * 2);
  ctx.fill();

  const layers = 1 + Math.floor(rand() * 3);
  for (let layer = 0; layer < layers; layer++) {
    ctx.fillStyle = `hsl(${(hue + 150 + rand() * 80) % 360} ${15 + rand() * 45}% ${Math.max(4, light - 8 - layer * 10 - rand() * 12)}%)`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const base = h * (0.45 + 0.17 * layer + rand() * 0.2);
    for (let x = 0; x <= w; x += w / 6) ctx.lineTo(x, base + (rand() - 0.5) * h * 0.3);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTarget(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2B2A6B');
  sky.addColorStop(0.45, '#C65A8E');
  sky.addColorStop(0.72, '#FFB454');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#FFE9AE';
  ctx.beginPath();
  ctx.arc(w * 0.56, h * 0.5, h * 0.16, 0, Math.PI * 2);
  ctx.fill();
  const ridges: [string, number[]][] = [
    ['#55477F', [0.68, 0.5, 0.63, 0.46, 0.6, 0.42, 0.56]],
    ['#2C6B7E', [0.8, 0.66, 0.74, 0.6, 0.72, 0.66, 0.78]],
    ['#123A45', [0.92, 0.82, 0.88, 0.8, 0.86, 0.78, 0.84]],
  ];
  for (const [color, points] of ridges) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    points.forEach((p, i) => ctx.lineTo((i / (points.length - 1)) * w, p * h));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

export async function createDemoFiles(): Promise<{ photos: File[]; target: File }> {
  const lastModified = 1;
  const photos: File[] = [];
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < DEMO_TILES; i++) {
    drawScene(ctx, TILE_SIZE, TILE_SIZE, mulberry(i * 7919 + 13));
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    photos.push(new File([blob], `demo-${i + 1}.jpg`, { type: 'image/jpeg', lastModified }));
  }
  const targetCanvas = new OffscreenCanvas(1600, 1000);
  drawTarget(targetCanvas.getContext('2d')!, 1600, 1000);
  const targetBlob = await targetCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return { photos, target: new File([targetBlob], 'demo-target.jpg', { type: 'image/jpeg', lastModified }) };
}

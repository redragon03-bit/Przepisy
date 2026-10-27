// Przepis jako ładny obrazek (PNG) do wysłania rodzinie - rysowany w telefonie, bez serwera.

const WIDTH = 1080;
const PADDING = 64;
const PHOTO_HEIGHT = 720;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const COLORS = { background: "#fffaf3", text: "#2b2118", muted: "#7a6a5c", accent: "#c2410c" };

interface Card {
  title: string;
  meta: string;
  ingredients: string[];
  steps: string[];
  imageUrl: string | null;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // bez zdjęcia też jest dobra karta
    img.src = url;
  });
}

// Dzieli tekst na linijki mieszczące się w `width`
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type Block = { font: string; color: string; lines: string[]; lineHeight: number; gapBefore: number; indent?: number; prefix?: string[] };

function layout(ctx: CanvasRenderingContext2D, card: Card): Block[] {
  const width = WIDTH - 2 * PADDING;
  const block = (font: string, color: string, text: string, lineHeight: number, gapBefore: number): Block => {
    ctx.font = font;
    return { font, color, lines: wrap(ctx, text, width), lineHeight, gapBefore };
  };
  const list = (items: string[], marker: (i: number) => string): Block[] =>
    items.map((item, i) => {
      const font = `32px ${FONT}`;
      ctx.font = font;
      const lines = wrap(ctx, item, width - 56);
      return { font, color: COLORS.text, lines, lineHeight: 44, gapBefore: 12, indent: 56, prefix: [marker(i)] };
    });
  return [
    block(`bold 64px ${FONT}`, COLORS.text, card.title, 76, 0),
    ...(card.meta ? [block(`30px ${FONT}`, COLORS.muted, card.meta, 40, 16)] : []),
    block(`bold 40px ${FONT}`, COLORS.accent, "Składniki", 52, 48),
    ...list(card.ingredients, () => "•"),
    block(`bold 40px ${FONT}`, COLORS.accent, "Przygotowanie", 52, 48),
    ...list(card.steps, (i) => `${i + 1}.`),
  ];
}

async function draw(card: Card): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const photo = card.imageUrl ? await loadImage(card.imageUrl) : null;
  const blocks = layout(ctx, card);
  const textHeight = blocks.reduce((sum, b) => sum + b.gapBefore + b.lines.length * b.lineHeight, 0);
  const top = photo ? PHOTO_HEIGHT : 0;
  canvas.width = WIDTH;
  canvas.height = top + PADDING + textHeight + PADDING + 40;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (photo) {
    // Kadrowanie jak object-fit: cover
    const scale = Math.max(WIDTH / photo.width, PHOTO_HEIGHT / photo.height);
    const w = WIDTH / scale;
    const h = PHOTO_HEIGHT / scale;
    ctx.drawImage(photo, (photo.width - w) / 2, (photo.height - h) / 2, w, h, 0, 0, WIDTH, PHOTO_HEIGHT);
  }
  let y = top + PADDING;
  ctx.textBaseline = "top";
  for (const b of blocks) {
    y += b.gapBefore;
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    b.prefix?.forEach((p) => {
      ctx.fillStyle = COLORS.accent;
      ctx.fillText(p, PADDING, y);
      ctx.fillStyle = b.color;
    });
    for (const line of b.lines) {
      ctx.fillText(line, PADDING + (b.indent ?? 0), y);
      y += b.lineHeight;
    }
  }
  ctx.font = `24px ${FONT}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText("z aplikacji Przepisy", PADDING, canvas.height - PADDING / 2 - 24);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Nie udało się zrobić obrazka"))), "image/png"));
}

// Zwraca komunikat dla użytkownika albo "" (gdy otworzył się systemowy arkusz udostępniania)
export async function shareAsImage(card: Card): Promise<string> {
  const blob = await draw(card);
  const file = new File([blob], `${card.title.replace(/[^\p{L}\p{N} ]/gu, "").trim() || "przepis"}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: card.title });
      return "";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "";
    }
  }
  // Komputer bez udostępniania plików - pobieramy obrazek
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(link.href);
  return "Obrazek zapisany w Pobranych.";
}

import jsQR from 'jsqr';
import type { CropResult, Point, QrResult } from '../types';

type BarcodeDetection = {
  rawValue?: string;
  cornerPoints?: Point[];
  boundingBox?: DOMRectReadOnly;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<BarcodeDetection[]>;
};

type WindowWithBarcode = Window & {
  BarcodeDetector?: BarcodeDetectorCtor;
};

const cropPaddingRatio = 0.1;

export async function canvasFromFile(file: File): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a browser-supported image file.');
  }

  const bitmap = await createImageBitmap(file);
  return canvasFromImageSource(bitmap, bitmap.width, bitmap.height);
}

export function canvasFromVideo(video: HTMLVideoElement): HTMLCanvasElement {
  return canvasFromImageSource(video, video.videoWidth, video.videoHeight);
}

function canvasFromImageSource(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

export async function detectQr(canvas: HTMLCanvasElement): Promise<QrResult | null> {
  const barcodeResult = await detectWithBarcodeDetector(canvas);
  if (barcodeResult) {
    return barcodeResult;
  }
  return detectWithJsQr(canvas);
}

async function detectWithBarcodeDetector(canvas: HTMLCanvasElement): Promise<QrResult | null> {
  const Detector = (window as WindowWithBarcode).BarcodeDetector;
  if (!Detector) {
    return null;
  }

  try {
    const detector = new Detector({ formats: ['qr_code'] });
    const results = await detector.detect(canvas);
    const qr = results.find((result) => Boolean(result.rawValue));
    if (!qr?.rawValue) {
      return null;
    }

    const points = qr.cornerPoints?.length
      ? qr.cornerPoints
      : pointsFromRect(qr.boundingBox, canvas.width, canvas.height);

    return {
      text: qr.rawValue,
      points,
      source: 'barcode-detector'
    };
  } catch {
    return null;
  }
}

function detectWithJsQr(canvas: HTMLCanvasElement): QrResult | null {
  const ctx = getCanvasContext(canvas);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const qr = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth'
  });

  if (!qr) {
    return null;
  }

  return {
    text: qr.data,
    source: 'jsqr',
    points: [
      qr.location.topLeftCorner,
      qr.location.topRightCorner,
      qr.location.bottomRightCorner,
      qr.location.bottomLeftCorner
    ]
  };
}

export async function cropQr(canvas: HTMLCanvasElement, points: Point[]): Promise<CropResult> {
  const rect = paddedRect(points, canvas.width, canvas.height);
  const output = document.createElement('canvas');
  output.width = rect.width;
  output.height = rect.height;
  const ctx = getCanvasContext(output);
  ctx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    output.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
      } else {
        reject(new Error('Could not create QR crop.'));
      }
    }, 'image/png');
  });

  return {
    blob,
    url: URL.createObjectURL(blob),
    width: rect.width,
    height: rect.height
  };
}

export function pointsToCssPolygon(points: Point[], width: number, height: number): string {
  return points.map((point) => `${(point.x / width) * 100}% ${(point.y / height) * 100}%`).join(', ');
}

function paddedRect(points: Point[], width: number, height: number) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(height, Math.ceil(Math.max(...ys)));
  const base = Math.max(maxX - minX, maxY - minY);
  const padding = Math.ceil(base * cropPaddingRatio);

  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + padding);
  const bottom = Math.min(height, maxY + padding);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

function pointsFromRect(rect: DOMRectReadOnly | undefined, width: number, height: number): Point[] {
  if (!rect) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ];
  }

  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas is not available in this browser.');
  }
  return ctx;
}

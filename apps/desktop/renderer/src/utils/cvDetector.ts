/**
 * Computer Vision Component Detector
 * 
 * Uses OpenCV.js for local, zero-API-cost component detection.
 * Pipeline: grayscale -> blur -> Canny -> morphology -> contours -> filter
 * 
 * Returns geometric regions only - use GPT-4V for semantic labeling.
 */

// OpenCV.js types
declare const cv: any;

export interface DetectedRegion {
  id: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  area: number;
  centroid: { x: number; y: number };
  contourPoints: number;
  aspectRatio: number;
  polygon: { x: number; y: number }[];
}

export interface CVDetectionOptions {
  cannyLow?: number;      // Lower threshold for Canny edge detection (default: 50)
  cannyHigh?: number;     // Upper threshold for Canny edge detection (default: 150)
  blurSize?: number;      // Gaussian blur kernel size (default: 5)
  dilateIterations?: number;  // Morphology dilation iterations (default: 2)
  erodeIterations?: number;   // Morphology erosion iterations (default: 1)
  minArea?: number;       // Minimum contour area in pixels (default: 500)
  maxArea?: number;       // Maximum contour area as ratio of image (default: 0.8)
  minAspectRatio?: number; // Minimum aspect ratio to filter thin lines (default: 0.1)
  maxAspectRatio?: number; // Maximum aspect ratio (default: 10)
  epsilon?: number;       // Polygon approximation epsilon factor (default: 0.02)
}

const DEFAULT_OPTIONS: Required<CVDetectionOptions> = {
  cannyLow: 50,
  cannyHigh: 150,
  blurSize: 5,
  dilateIterations: 2,
  erodeIterations: 1,
  minArea: 500,
  maxArea: 0.8,
  minAspectRatio: 0.1,
  maxAspectRatio: 10,
  epsilon: 0.02,
};

let cvReady = false;
let cvLoadPromise: Promise<void> | null = null;

/**
 * Load OpenCV.js and wait for it to be ready
 */
export async function loadOpenCV(): Promise<void> {
  if (cvReady) return;
  
  if (cvLoadPromise) {
    return cvLoadPromise;
  }
  
  cvLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof cv !== 'undefined' && cv.Mat) {
      console.log('[CV] OpenCV already loaded');
      cvReady = true;
      resolve();
      return;
    }
    
    console.log('[CV] Loading OpenCV.js...');
    
    // Dynamic import
    import('@techstark/opencv-js').then((opencv) => {
      console.log('[CV] OpenCV module imported:', Object.keys(opencv));
      
      // The module exports cv directly
      const cvModule = opencv.default || opencv;
      
      // Check if it has onRuntimeInitialized (WASM not ready yet)
      if (cvModule && cvModule.onRuntimeInitialized !== undefined) {
        console.log('[CV] Waiting for WASM initialization...');
        const originalCallback = cvModule.onRuntimeInitialized;
        cvModule.onRuntimeInitialized = () => {
          console.log('[CV] WASM initialized');
          if (originalCallback) originalCallback();
          cvReady = true;
          resolve();
        };
      } else if (typeof cv !== 'undefined' && cv.Mat) {
        // cv is already available globally
        console.log('[CV] OpenCV ready (global cv)');
        cvReady = true;
        resolve();
      } else {
        // Give it a moment for global cv to be set
        setTimeout(() => {
          if (typeof cv !== 'undefined' && cv.Mat) {
            console.log('[CV] OpenCV ready (delayed)');
            cvReady = true;
            resolve();
          } else {
            console.error('[CV] OpenCV failed to initialize');
            reject(new Error('OpenCV failed to initialize'));
          }
        }, 1000);
      }
    }).catch((err) => {
      console.error('[CV] Failed to import OpenCV:', err);
      reject(err);
    });
  });
  
  return cvLoadPromise;
}

/**
 * Convert an image element or canvas to an OpenCV Mat
 */
function imageToMat(source: HTMLImageElement | HTMLCanvasElement): any {
  const canvas = source instanceof HTMLCanvasElement 
    ? source 
    : imageToCanvas(source);
  
  return cv.imread(canvas);
}

/**
 * Convert image element to canvas
 */
function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0);
  }
  return canvas;
}

/**
 * Generate unique ID for detected region
 */
function generateRegionId(index: number): string {
  return `region_${index}_${Date.now().toString(36)}`;
}

/**
 * Helper to yield to the event loop, allowing UI updates
 */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Detect component regions in an image using classical CV techniques
 * 
 * Pipeline:
 * 1. Convert to grayscale
 * 2. Apply Gaussian blur to reduce noise
 * 3. Canny edge detection
 * 4. Morphological operations (dilate then erode) to close gaps
 * 5. Find contours
 * 6. Approximate polygons
 * 7. Filter by area and aspect ratio
 * 8. Compute metrics for each region
 */
export async function detectComponents(
  source: HTMLImageElement | HTMLCanvasElement,
  options: CVDetectionOptions = {}
): Promise<DetectedRegion[]> {
  console.log('[CV] Starting detection...');
  
  await loadOpenCV();
  
  // Yield to allow UI to update before heavy processing
  await yieldToMain();
  
  console.log('[CV] OpenCV loaded, cv available:', typeof cv !== 'undefined');
  
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const regions: DetectedRegion[] = [];
  
  // Check source dimensions
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  console.log('[CV] Image dimensions:', width, 'x', height);
  
  if (width === 0 || height === 0) {
    console.error('[CV] Image has zero dimensions');
    return [];
  }
  
  // Create Mats
  const src = imageToMat(source);
  console.log('[CV] Created source Mat:', src.rows, 'x', src.cols);
  
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const morphed = new cv.Mat();
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();
  
  try {
    const imageArea = src.rows * src.cols;
    const maxAreaPixels = imageArea * opts.maxArea;
    
    // 1. Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    console.log('[CV] Converted to grayscale');
    
    // 2. Gaussian blur
    const ksize = new cv.Size(opts.blurSize, opts.blurSize);
    cv.GaussianBlur(gray, blurred, ksize, 0);
    
    // 3. Canny edge detection
    cv.Canny(blurred, edges, opts.cannyLow, opts.cannyHigh);
    console.log('[CV] Canny edge detection complete');
    
    // Yield to allow UI updates
    await yieldToMain();
    
    // 4. Morphological operations
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    
    // Dilate to connect nearby edges
    cv.dilate(edges, morphed, kernel, new cv.Point(-1, -1), opts.dilateIterations);
    
    // Erode to remove noise
    cv.erode(morphed, morphed, kernel, new cv.Point(-1, -1), opts.erodeIterations);
    
    kernel.delete();
    
    // 5. Find contours
    cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    console.log('[CV] Found', contours.size(), 'contours');
    
    // Yield before processing contours
    await yieldToMain();
    
    // 6-8. Process each contour
    const contourCount = contours.size();
    for (let i = 0; i < contourCount; i++) {
      // Yield every 50 contours to keep UI responsive
      if (i > 0 && i % 50 === 0) {
        await yieldToMain();
      }
      
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // Filter by area
      if (area < opts.minArea || area > maxAreaPixels) {
        contour.delete();
        continue;
      }
      
      // Get bounding rect
      const rect = cv.boundingRect(contour);
      const aspectRatio = rect.width / rect.height;
      
      // Filter by aspect ratio
      if (aspectRatio < opts.minAspectRatio || aspectRatio > opts.maxAspectRatio) {
        contour.delete();
        continue;
      }
      
      // Approximate polygon
      const epsilon = opts.epsilon * cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, epsilon, true);
      
      // Extract polygon points
      const polygon: { x: number; y: number }[] = [];
      for (let j = 0; j < approx.rows; j++) {
        polygon.push({
          x: approx.intPtr(j, 0)[0],
          y: approx.intPtr(j, 0)[1],
        });
      }
      
      // Compute centroid using moments
      const moments = cv.moments(contour);
      const centroid = {
        x: moments.m10 / moments.m00,
        y: moments.m01 / moments.m00,
      };
      
      regions.push({
        id: generateRegionId(regions.length),
        bbox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        area,
        centroid,
        contourPoints: approx.rows,
        aspectRatio,
        polygon,
      });
      
      approx.delete();
      contour.delete();
    }
    
    console.log('[CV] Detected', regions.length, 'valid regions after filtering');
    
  } finally {
    // Clean up
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    morphed.delete();
    hierarchy.delete();
    contours.delete();
  }
  
  // Sort by area (largest first)
  regions.sort((a, b) => b.area - a.area);
  
  console.log('[CV] Detection complete:', regions.length, 'regions');
  return regions;
}

/**
 * Get edge detection preview for debugging/visualization
 */
export async function getEdgePreview(
  source: HTMLImageElement | HTMLCanvasElement,
  options: CVDetectionOptions = {}
): Promise<string> {
  await loadOpenCV();
  
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const src = imageToMat(source);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const ksize = new cv.Size(opts.blurSize, opts.blurSize);
    cv.GaussianBlur(gray, blurred, ksize, 0);
    cv.Canny(blurred, edges, opts.cannyLow, opts.cannyHigh);
    
    // Convert to canvas and get data URL
    const canvas = document.createElement('canvas');
    cv.imshow(canvas, edges);
    return canvas.toDataURL('image/png');
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
  }
}

/**
 * Draw detected regions on a canvas for visualization
 */
export function drawRegionsOnCanvas(
  canvas: HTMLCanvasElement,
  regions: DetectedRegion[],
  options: {
    strokeColor?: string;
    fillColor?: string;
    lineWidth?: number;
    showLabels?: boolean;
    labelFont?: string;
  } = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const {
    strokeColor = '#00ff00',
    fillColor = 'rgba(0, 255, 0, 0.1)',
    lineWidth = 2,
    showLabels = true,
    labelFont = '12px sans-serif',
  } = options;
  
  regions.forEach((region, index) => {
    // Draw polygon
    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = lineWidth;
    
    if (region.polygon.length > 0) {
      ctx.moveTo(region.polygon[0].x, region.polygon[0].y);
      region.polygon.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
    } else {
      // Fallback to bounding box
      ctx.rect(region.bbox.x, region.bbox.y, region.bbox.width, region.bbox.height);
    }
    
    ctx.fill();
    ctx.stroke();
    
    // Draw label
    if (showLabels) {
      ctx.font = labelFont;
      ctx.fillStyle = strokeColor;
      ctx.fillText(
        `#${index + 1}`,
        region.bbox.x + 4,
        region.bbox.y + 14
      );
    }
  });
}

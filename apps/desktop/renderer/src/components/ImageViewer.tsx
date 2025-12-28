import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './ImageViewer.module.css';
import { detectComponents, DetectedRegion } from '../utils/cvDetector';
import { useAppStore } from '../store';

interface ImageViewerProps {
  fileName: string;
  path: string;
}

export function ImageViewer({ fileName, path }: ImageViewerProps) {
  const { showToast } = useAppStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedRegions, setDetectedRegions] = useState<DetectedRegion[]>([]);
  const [showRegions, setShowRegions] = useState(true);
  const [isLabeling, setIsLabeling] = useState(false);
  const [labeledComponents, setLabeledComponents] = useState<Array<{ name: string; category: string; bbox: { x: number; y: number; width: number; height: number } }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        // Read image as binary data
        const result = await window.electronAPI.readFileBinary(path);
        
        // Store base64 for CV detection
        setImageBase64(result.data);
        
        // Determine MIME type from extension
        const ext = path.toLowerCase().split('.').pop();
        const mimeTypes: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          bmp: 'image/bmp',
          webp: 'image/webp',
          svg: 'image/svg+xml',
          ico: 'image/x-icon',
          tiff: 'image/tiff',
          tif: 'image/tiff',
        };
        
        const mimeType = mimeTypes[ext || ''] || 'image/png';
        
        // Create blob URL from base64 data
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        setImageUrl(url);
        setError(null);
        
        // Reset detection state when image changes
        setDetectedRegions([]);
        setLabeledComponents([]);
      } catch (err) {
        setError(`Failed to load image: ${err}`);
        setImageUrl(null);
      }
    };

    loadImage();

    // Cleanup blob URL on unmount
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [path]);

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.25, 5));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.25, 0.1));
  const handleResetZoom = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.1, Math.min(5, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Detect components using OpenCV.js
  const handleDetectComponents = async () => {
    if (!imageRef.current || isDetecting) return;
    
    setIsDetecting(true);
    setDetectedRegions([]);
    setLabeledComponents([]);
    
    try {
      // Use lower thresholds for better detection
      const regions = await detectComponents(imageRef.current, {
        cannyLow: 30,        // Lower = more edges detected
        cannyHigh: 100,      // Upper threshold
        minArea: 100,        // Smaller minimum area
        maxArea: 0.7,        // Allow larger regions
        blurSize: 3,         // Less blur preserves more detail
        dilateIterations: 1, // Less dilation
        erodeIterations: 1,
      });
      
      setDetectedRegions(regions);
      setShowRegions(true);
      
      if (regions.length === 0) {
        showToast('warning', 'No components detected. Try a higher contrast image.');
      } else {
        showToast('success', `Detected ${regions.length} component${regions.length > 1 ? 's' : ''}`);
      }
    } catch (err) {
      console.error('Detection failed:', err);
      showToast('error', `Detection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDetecting(false);
    }
  };

  // Label detected regions with GPT-4V
  const handleLabelComponents = async () => {
    if (detectedRegions.length === 0 || !imageBase64 || isLabeling) return;
    
    setIsLabeling(true);
    
    try {
      // Convert DetectedRegion to CVDetectedRegion for API
      const cvRegions = detectedRegions.map((r) => ({
        id: r.id,
        bbox: r.bbox,
        centroid: r.centroid,
        area: r.area,
      }));
      
      const result = await window.electronAPI.labelDetectedRegions(
        imageBase64,
        cvRegions,
        fileName
      );
      
      if (result.success && result.components) {
        setLabeledComponents(result.components.map(c => ({
          name: c.name,
          category: c.category,
          bbox: c.bbox,
        })));
      }
    } catch (err) {
      console.error('Labeling failed:', err);
    } finally {
      setIsLabeling(false);
    }
  };

  // Clear detection results
  const handleClearDetection = () => {
    setDetectedRegions([]);
    setLabeledComponents([]);
  };

  if (error) {
    return (
      <div className={styles.error}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>{error}</p>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading image...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.fileName}>{fileName}</span>
        <div className={styles.controls}>
          {/* Detection controls */}
          <div className={styles.detectionControls}>
            <button 
              onClick={handleDetectComponents} 
              disabled={isDetecting}
              className={styles.detectButton}
              title="Detect Components (CV)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              {isDetecting ? 'Detecting...' : 'Detect'}
            </button>
            
            {detectedRegions.length > 0 && (
              <>
                <button
                  onClick={handleLabelComponents}
                  disabled={isLabeling}
                  className={styles.labelButton}
                  title="Label with GPT-4V"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  {isLabeling ? 'Labeling...' : `Label (${detectedRegions.length})`}
                </button>
                
                <button
                  onClick={() => setShowRegions(!showRegions)}
                  className={showRegions ? styles.toggleActive : styles.toggle}
                  title={showRegions ? 'Hide Regions' : 'Show Regions'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
                
                <button
                  onClick={handleClearDetection}
                  className={styles.clearButton}
                  title="Clear Detection"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </>
            )}
          </div>
          
          <div className={styles.separator} />
          
          {/* Zoom controls */}
          <button onClick={handleZoomOut} title="Zoom Out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} title="Zoom In">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button onClick={handleResetZoom} title="Reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className={styles.imageContainer}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className={styles.imageWrapper} style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
        }}>
          <img
            ref={imageRef}
            src={imageUrl}
            alt={fileName}
            className={styles.image}
            draggable={false}
          />
          
          {/* Detection overlay */}
          {showRegions && (detectedRegions.length > 0 || labeledComponents.length > 0) && imageRef.current && (
            <svg 
              className={styles.detectionOverlay}
              viewBox={`0 0 ${imageRef.current.naturalWidth} ${imageRef.current.naturalHeight}`}
            >
              {/* Unlabeled regions (blue) */}
              {labeledComponents.length === 0 && detectedRegions.map((region, i) => (
                <g key={i}>
                  <rect
                    x={region.bbox.x}
                    y={region.bbox.y}
                    width={region.bbox.width}
                    height={region.bbox.height}
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="#3b82f6"
                    strokeWidth="2"
                  />
                  <text
                    x={region.bbox.x + 4}
                    y={region.bbox.y + 16}
                    fill="#3b82f6"
                    fontSize="14"
                    fontWeight="bold"
                  >
                    {i + 1}
                  </text>
                </g>
              ))}
              
              {/* Labeled components (green with names) */}
              {labeledComponents.map((component, i) => (
                <g key={i}>
                  <rect
                    x={component.bbox.x}
                    y={component.bbox.y}
                    width={component.bbox.width}
                    height={component.bbox.height}
                    fill="rgba(34, 197, 94, 0.2)"
                    stroke="#22c55e"
                    strokeWidth="2"
                  />
                  <rect
                    x={component.bbox.x}
                    y={component.bbox.y - 20}
                    width={component.name.length * 8 + 8}
                    height="20"
                    fill="#22c55e"
                    rx="2"
                  />
                  <text
                    x={component.bbox.x + 4}
                    y={component.bbox.y - 6}
                    fill="white"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {component.name}
                  </text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
      
      {/* Detection info panel */}
      {(detectedRegions.length > 0 || labeledComponents.length > 0) && (
        <div className={styles.infoPanel}>
          <span className={styles.infoBadge}>
            {labeledComponents.length > 0 
              ? `${labeledComponents.length} labeled components`
              : `${detectedRegions.length} regions detected`
            }
          </span>
        </div>
      )}
    </div>
  );
}

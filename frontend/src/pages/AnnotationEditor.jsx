import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { annotationsAPI } from '../services/api';
import { PDFDocument, rgb } from 'pdf-lib';
import Toast from '../components/Toast';

const AnnotationEditor = () => {
  const { projectId, fileId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const file = location.state?.file;
  
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const [annotations, setAnnotations] = useState([]);
  const [currentTool, setCurrentTool] = useState('select');
  const [currentColor, setCurrentColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [tempAnnotation, setTempAnnotation] = useState(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [toast, setToast] = useState(null);
  const [pencilPath, setPencilPath] = useState([]);
  const [measurementPoints, setMeasurementPoints] = useState([]);
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [savedStatus, setSavedStatus] = useState('saved'); // saved, saving, unsaved
  const [redoStack, setRedoStack] = useState([]);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationStartAngle, setRotationStartAngle] = useState(null);
  const [showNoAnnoTips, setShowNoAnnoTips] = useState(false);
  const [showInfoBar, setShowInfoBar] = useState(false); // hide tool info by default
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [pdfPageDataUrl, setPdfPageDataUrl] = useState(null);
  const baseCanvasWidth = 900; // reduced from 1000 to avoid overlap
  const baseCanvasHeight = 1260; // maintain similar aspect ratio
  const [pdfPageHeight, setPdfPageHeight] = useState(1260);
  const [pdfFallbackIframe, setPdfFallbackIframe] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [transformStart, setTransformStart] = useState(null); // start mouse pos for move/scale
  const [originalForTransform, setOriginalForTransform] = useState(null); // original selected annotation snapshot
  const [measurementUnit, setMeasurementUnit] = useState('px'); // px | mm | cm | in

  // Initialize pdf.js library and worker for Vite environment
  if (typeof window !== 'undefined') {
    // Expose to existing code paths that reference window.pdfjsLib
    // This avoids a large refactor across the file
    // Assign only once to prevent overwriting in Fast Refresh
    if (!window.pdfjsLib) {
      window.pdfjsLib = pdfjsLib;
    }
    if (window.pdfjsLib?.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    }
  }

  const colors = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', 
    '#00FFFF', '#FFA500', '#800080', '#000000', '#FFFFFF',
    '#FFC0CB', '#A52A2A', '#808080', '#00FF7F', '#4B0082'
  ];

  const tools = [
    { id: 'select', icon: 'fa-mouse-pointer', label: 'Select (S)', hotkey: 'S' },
    { id: 'pan', icon: 'fa-hand-paper', label: 'Pan (H)', hotkey: 'H' },
    { id: 'pencil', icon: 'fa-pencil-alt', label: 'Pencil (P)', hotkey: 'P' },
    { id: 'line', icon: 'fa-minus', label: 'Line (L)', hotkey: 'L' },
    { id: 'arrow', icon: 'fa-arrow-right', label: 'Arrow (A)', hotkey: 'A' },
    { id: 'rectangle', icon: 'fa-square', label: 'Rectangle (R)', hotkey: 'R' },
    { id: 'circle', icon: 'fa-circle', label: 'Circle (C)', hotkey: 'C' },
    { id: 'ellipse', icon: 'fa-ellipsis-h', label: 'Ellipse', hotkey: null },
    { id: 'polygon', icon: 'fa-shapes', label: 'Polygon', hotkey: null },
    { id: 'polyline', icon: 'fa-draw-polygon', label: 'Polyline', hotkey: null },
    { id: 'text', icon: 'fa-font', label: 'Text (T)', hotkey: 'T' },
    { id: 'eraser', icon: 'fa-eraser', label: 'Eraser (E)', hotkey: 'E' },
    { id: 'measure-distance', icon: 'fa-ruler', label: 'Measure Distance (M)', hotkey: 'M' },
    { id: 'measure-angle', icon: 'fa-drafting-compass', label: 'Measure Angle (G)', hotkey: 'G' },
    { id: 'move', icon: 'fa-arrows-alt', label: 'Move', hotkey: null },
    { id: 'copy', icon: 'fa-copy', label: 'Copy', hotkey: null },
    { id: 'scale', icon: 'fa-expand-arrows-alt', label: 'Scale', hotkey: null },
    { id: 'mirror', icon: 'fa-clone', label: 'Mirror', hotkey: null },
    { id: 'array', icon: 'fa-th', label: 'Array', hotkey: null },
  ];

  useEffect(() => {
    if (file && fileId) {
      loadAnnotations();
    }
  }, [fileId]);

  useEffect(() => {
    drawCanvas();
  }, [annotations, tempAnnotation, scale, panOffset, selectedAnnotation, currentPdfPage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const key = e.key.toUpperCase();
      const tool = tools.find(t => t.hotkey === key);
      if (tool) {
        handleToolSwitch(tool.id);
      }
      
      // Delete selected annotation with Delete/Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotation) {
        handleDeleteAnnotation(selectedAnnotation.id);
      }
      
      // Undo with Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && annotations.length > 0) {
        handleUndo();
      }
      // Redo with Ctrl+Y or Ctrl+Shift+Z
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && redoStack.length > 0) {
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedAnnotation, annotations, redoStack]);

  const loadAnnotations = async () => {
    try {
      const response = await annotationsAPI.getByFile(fileId);
      const processedAnnotations = response.data.map(annotation => {
        if (annotation.type === 'pencil' && annotation.text) {
          try {
            annotation.points = JSON.parse(annotation.text);
          } catch (e) {
            console.error('Failed to parse pencil points:', e);
          }
        }
        return annotation;
      });
      setAnnotations(processedAnnotations);
      setSavedStatus('saved');
    } catch (error) {
      if (error.response?.status !== 404) {
        showToast('Failed to load annotations', 'error');
      }
      setAnnotations([]);
    }
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(scale, scale);

    // Draw only annotations for current page (for PDFs). Images show all (page 1).
    const visibleAnnotations = file?.type === 'pdf'
      ? annotations.filter(a => (a.page || 1) === (currentPdfPage || 1))
      : annotations;

    // Draw all saved annotations for the visible page
    visibleAnnotations.forEach((annotation) => {
      drawAnnotation(ctx, annotation);
    });

    // Draw temporary annotation being created
    if (tempAnnotation) {
      drawAnnotation(ctx, tempAnnotation, true);
    }

    // Draw measurement info
    if (showMeasurement && measurementPoints.length > 0) {
      drawMeasurementInfo(ctx);
    }

    ctx.restore();
  };

  const drawAnnotation = (ctx, annotation, isTemp = false) => {
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = annotation.lineWidth || lineWidth;

    const x = annotation.x;
    const y = annotation.y;
    const width = annotation.width || 0;
    const height = annotation.height || 0;

    // Read meta (rotation) if present in object or encoded in text
    const meta = (() => {
      // prioritize selected annotation's live meta for preview
      if (selectedAnnotation && selectedAnnotation.id === annotation.id && selectedAnnotation.meta) return selectedAnnotation.meta;
      if (annotation.meta) return annotation.meta;
      if (annotation.type !== 'text' && typeof annotation.text === 'string') {
        try {
          const obj = JSON.parse(annotation.text);
          return obj?.meta || {};
        } catch (e) {}
      }
      return {};
    })();
    const rotation = meta.rotation || 0;
    const applyRotation = rotation && annotation.type !== 'text';
    if (applyRotation) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.translate(-cx, -cy);
    }

    switch (annotation.type) {
      case 'rectangle':
        ctx.strokeRect(x, y, width, height);
        if (selectedAnnotation?.id === annotation.id && !isTemp) {
          drawSelectionHandles(ctx, x, y, width, height);
        }
        break;

      case 'circle':
        const radius = Math.sqrt(width * width + height * height) / 2;
        ctx.beginPath();
        ctx.arc(x + width / 2, y + height / 2, radius, 0, 2 * Math.PI);
        ctx.stroke();
        break;

      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(x + width / 2, y + height / 2, Math.abs(width / 2), Math.abs(height / 2), 0, 0, 2 * Math.PI);
        ctx.stroke();
        break;

      case 'line':
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + width, y + height);
        ctx.stroke();
        break;

      case 'arrow':
        drawArrow(ctx, x, y, x + width, y + height);
        break;

      case 'text':
        ctx.font = `${annotation.fontSize || 16}px Inter, Arial, sans-serif`;
        ctx.fillText(annotation.text || '', x, y);
        // Show bounding box for selected text
        if (selectedAnnotation?.id === annotation.id && !isTemp) {
          const metrics = ctx.measureText(annotation.text || '');
          ctx.strokeStyle = '#00FF00';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(x - 5, y - 20, metrics.width + 10, 25);
          ctx.setLineDash([]);
        }
        break;

      case 'pencil':
        if (annotation.points && annotation.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
          annotation.points.forEach((point) => {
            ctx.lineTo(point.x, point.y);
          });
          ctx.stroke();
        }
        break;

      case 'polygon':
      case 'polyline':
        if (annotation.points && annotation.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
          for (let i = 1; i < annotation.points.length; i++) {
            ctx.lineTo(annotation.points[i].x, annotation.points[i].y);
          }
          if (annotation.type === 'polygon') ctx.closePath();
          ctx.stroke();
        }
        break;

      case 'measure-distance':
        drawMeasurement(ctx, x, y, x + width, y + height);
        break;

      case 'measure-angle':
        if (annotation.points && annotation.points.length === 3) {
          drawAngleMeasurement(ctx, annotation.points);
        }
        break;

      default:
        break;
    }

    if (applyRotation) {
      ctx.restore();
    }

    // Draw rotation handle if selected
    if (!isTemp && selectedAnnotation?.id === annotation.id && annotation.type !== 'text') {
      const cx = x + width / 2;
      const handleY = y - 30;
      ctx.save();
      ctx.fillStyle = '#1E90FF';
      ctx.beginPath();
      ctx.arc(cx, handleY, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawArrow = (ctx, x1, y1, x2, y2) => {
    const headLength = 15;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  const getPixelsPerUnit = (unit) => {
    // Assuming 96 DPI canvas:
    // 1 inch = 96 px, 1 cm = 96/2.54 px, 1 mm = 96/25.4 px
    switch (unit) {
      case 'in': return 96;
      case 'cm': return 96 / 2.54;
      case 'mm': return 96 / 25.4;
      case 'px':
      default: return 1;
    }
  };

  const drawMeasurement = (ctx, x1, y1, x2, y2) => {
    // Draw line
    ctx.strokeStyle = '#FF6B00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Calculate distance
    const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const ppu = getPixelsPerUnit(measurementUnit);
    const value = distance / ppu;
    
    // Draw distance label
    ctx.fillStyle = '#FF6B00';
    ctx.font = 'bold 14px Inter, Arial, sans-serif';
    const label = `${value.toFixed(2)} ${measurementUnit}`;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    // Background for text
    const metrics = ctx.measureText(label);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(midX - metrics.width / 2 - 4, midY - 12, metrics.width + 8, 20);
    
    ctx.fillStyle = '#FF6B00';
    ctx.fillText(label, midX - metrics.width / 2, midY + 4);
  };

  const drawAngleMeasurement = (ctx, points) => {
    if (points.length !== 3) return;

    const [p1, p2, p3] = points;
    
    // Draw lines
    ctx.strokeStyle = '#6B00FF';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Calculate angle
    const angle1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
    const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    let angle = Math.abs(angle2 - angle1) * (180 / Math.PI);
    if (angle > 180) angle = 360 - angle;

    // Draw angle arc
    ctx.strokeStyle = '#6B00FF';
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 30, angle1, angle2, false);
    ctx.stroke();

    // Draw angle label
    ctx.fillStyle = '#6B00FF';
    ctx.font = 'bold 14px Inter, Arial, sans-serif';
    const label = `${angle.toFixed(1)}°`;
    ctx.fillText(label, p2.x + 40, p2.y);
  };

  const drawSelectionHandles = (ctx, x, y, width, height) => {
    ctx.strokeStyle = '#00FF00';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    const handleSize = 6;

    const handles = [
      { x: x, y: y },
      { x: x + width / 2, y: y },
      { x: x + width, y: y },
      { x: x, y: y + height / 2 },
      { x: x + width, y: y + height / 2 },
      { x: x, y: y + height },
      { x: x + width / 2, y: y + height },
      { x: x + width, y: y + height },
    ];

    handles.forEach(handle => {
      ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    });
  };

  const drawMeasurementInfo = (ctx) => {
    measurementPoints.forEach((point, index) => {
      ctx.fillStyle = '#FF6B00';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(index + 1, point.x - 3, point.y + 4);
    });
  };

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panOffset.x) / scale,
      y: (e.clientY - rect.top - panOffset.y) / scale,
    };
  };

  const handleMouseDown = async (e) => {
    const pos = getCanvasCoordinates(e);

    if (currentTool === 'pan') {
      setIsPanning(true);
      setStartPos({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    if (currentTool === 'select') {
      // Rotation handle hit test
      if (selectedAnnotation) {
        const sx = selectedAnnotation.x;
        const sy = selectedAnnotation.y;
        const sw = selectedAnnotation.width || 0;
        const cx = sx + sw / 2;
        const handleY = sy - 30;
        const dx = pos.x - cx;
        const dy = pos.y - handleY;
        if (Math.sqrt(dx * dx + dy * dy) <= 10) {
          setIsRotating(true);
          const sh = selectedAnnotation.height || 0;
          const angle = Math.atan2(pos.y - (sy + sh / 2), pos.x - cx);
          const currentRotation = selectedAnnotation.meta?.rotation || (() => {
            try {
              const obj = JSON.parse(selectedAnnotation.text || '{}');
              return obj?.meta?.rotation || 0;
            } catch { return 0; }
          })();
          setRotationStartAngle(angle - currentRotation);
          return;
        }
      }
      // Check if clicked on annotation
      const clicked = findAnnotationAtPoint(pos);
      setSelectedAnnotation(clicked);
      return;
    }

    // Start MOVE tool: pick clicked annotation and begin dragging
    if (currentTool === 'move') {
      const clicked = findAnnotationAtPoint(pos) || selectedAnnotation;
      if (clicked) {
        setSelectedAnnotation(clicked);
        setIsMoving(true);
        setTransformStart(pos);
        setOriginalForTransform({ ...clicked });
      }
      return;
    }

    // COPY tool: duplicate clicked annotation with a small offset
    if (currentTool === 'copy') {
      const clicked = findAnnotationAtPoint(pos);
      if (clicked) {
        const duplicate = {
          type: clicked.type,
          x: (clicked.x || 0) + 20,
          y: (clicked.y || 0) + 20,
          width: clicked.width || 0,
          height: clicked.height || 0,
          color: clicked.color,
          lineWidth: clicked.lineWidth || lineWidth,
          text: clicked.type === 'text' ? clicked.text || '' : (clicked.text || ''),
        };
        if ((clicked.type === 'pencil' || clicked.type === 'polygon' || clicked.type === 'polyline' || clicked.type === 'measure-angle') && clicked.points) {
          duplicate.text = JSON.stringify(clicked.points);
        }
        saveAnnotation(duplicate);
      }
      return;
    }

    // SCALE tool: begin resize from top-left anchor to cursor
    if (currentTool === 'scale') {
      const clicked = findAnnotationAtPoint(pos) || selectedAnnotation;
      if (clicked) {
        setSelectedAnnotation(clicked);
        setIsScaling(true);
        setTransformStart(pos);
        setOriginalForTransform({ ...clicked });
      }
      return;
    }

    // MIRROR tool: flip horizontally
    if (currentTool === 'mirror') {
      const clicked = findAnnotationAtPoint(pos) || selectedAnnotation;
      if (clicked) {
        const newX = (clicked.x || 0) + (clicked.width || 0);
        const newWidth = -(clicked.width || 0);
        const updated = { ...clicked, x: newX, width: newWidth };
        setAnnotations(annotations.map(a => a.id === clicked.id ? updated : a));
        setSelectedAnnotation(updated);
        // persist asynchronously, do not block UI
        annotationsAPI.update(clicked.id, {
          type: updated.type,
          x: updated.x || 0,
          y: updated.y || 0,
          width: updated.width || 0,
          height: updated.height || 0,
          color: updated.color,
          text: updated.text || '',
        }).catch(err => console.error('Failed to mirror', err));
      }
      return;
    }

    // ARRAY tool: create multiple copies with spacing
    if (currentTool === 'array') {
      const base = findAnnotationAtPoint(pos) || selectedAnnotation;
      if (!base) return;
      const countStr = prompt('How many copies? (>=2)', '3');
      const count = parseInt(countStr || '0', 10);
      if (!Number.isFinite(count) || count < 2) return;
      const dx = parseFloat(prompt('Horizontal spacing (px)', '40') || '0');
      const dy = parseFloat(prompt('Vertical spacing (px)', '0') || '0');
      for (let i = 1; i < count; i++) {
        const payload = {
          type: base.type,
          x: (base.x || 0) + dx * i,
          y: (base.y || 0) + dy * i,
          width: base.width || 0,
          height: base.height || 0,
          color: base.color,
          lineWidth: base.lineWidth || lineWidth,
          text: base.type === 'text' ? (base.text || '') : (base.text || ''),
        };
        if ((base.type === 'pencil' || base.type === 'polygon' || base.type === 'polyline' || base.type === 'measure-angle') && base.points) {
          payload.text = JSON.stringify(base.points);
        }
        await saveAnnotation(payload);
      }
      showToast('Array created', 'success');
      return;
    }

    if (currentTool === 'eraser') {
      const toDelete = findAnnotationAtPoint(pos);
      if (toDelete) {
        handleDeleteAnnotation(toDelete.id);
      }
      return;
    }

    if (currentTool === 'polygon' || currentTool === 'polyline') {
      if (!tempAnnotation) {
        setTempAnnotation({ type: currentTool, points: [pos], color: currentColor, lineWidth });
      } else {
        // add points on click, finish with double-click
        const now = Date.now();
        setTempAnnotation((prev) => ({ ...prev, points: [...(prev.points || []), pos] }));
      }
      return;
    }

    if (currentTool === 'measure-angle') {
      setMeasurementPoints([...measurementPoints, pos]);
      if (measurementPoints.length === 2) {
        // Save angle measurement
        saveAnnotation({
          type: 'measure-angle',
          points: [...measurementPoints, pos],
          color: '#6B00FF',
          lineWidth: 2,
        });
        setMeasurementPoints([]);
        setShowMeasurement(false);
      } else {
        setShowMeasurement(true);
      }
      return;
    }

    if (currentTool === 'text') {
      const text = prompt('Enter text:');
      if (text && text.trim()) {
        saveAnnotation({
          type: 'text',
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          text: text,
          color: currentColor,
          lineWidth: lineWidth,
          fontSize: 16,
        });
      }
      return;
    }

    setStartPos(pos);
    setIsDrawing(true);

    if (currentTool === 'pencil') {
      setPencilPath([pos]);
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning && startPos) {
      setPanOffset({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y,
      });
      return;
    }

    // MOVE drag interaction
    if (isMoving && selectedAnnotation && transformStart && originalForTransform) {
      const pos = getCanvasCoordinates(e);
      const dx = pos.x - transformStart.x;
      const dy = pos.y - transformStart.y;
      const updated = { ...selectedAnnotation, x: (originalForTransform.x || 0) + dx, y: (originalForTransform.y || 0) + dy };
      setSelectedAnnotation(updated);
      setAnnotations(annotations.map(a => a.id === updated.id ? updated : a));
      return;
    }

    // SCALE drag interaction
    if (isScaling && selectedAnnotation && transformStart && originalForTransform) {
      const pos = getCanvasCoordinates(e);
      const newWidth = (originalForTransform.width || 0) + (pos.x - transformStart.x);
      const newHeight = (originalForTransform.height || 0) + (pos.y - transformStart.y);
      const updated = { ...selectedAnnotation, width: newWidth, height: newHeight };
      setSelectedAnnotation(updated);
      setAnnotations(annotations.map(a => a.id === updated.id ? updated : a));
      return;
    }

    // Rotation drag
    if (isRotating && selectedAnnotation) {
      const pos = getCanvasCoordinates(e);
      const sx = selectedAnnotation.x;
      const sy = selectedAnnotation.y;
      const sw = selectedAnnotation.width || 0;
      const sh = selectedAnnotation.height || 0;
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const angle = Math.atan2(pos.y - cy, pos.x - cx);
      const newRotation = angle - (rotationStartAngle || 0);
      const updated = { ...selectedAnnotation, meta: { ...(selectedAnnotation.meta || {}), rotation: newRotation } };
      setSelectedAnnotation(updated);
      drawCanvas();
      return;
    }

    if (!isDrawing || !startPos) {
      // show preview segment for polygon/polyline if in progress
      if (tempAnnotation && (currentTool === 'polygon' || currentTool === 'polyline')) {
        const pos = getCanvasCoordinates(e);
        setTempAnnotation((prev) => prev ? { ...prev, previewPoint: pos } : prev);
      }
      return;
    }

    const pos = getCanvasCoordinates(e);

    if (currentTool === 'pencil') {
      setPencilPath([...pencilPath, pos]);
      setTempAnnotation({
        type: 'pencil',
        points: [...pencilPath, pos],
        color: currentColor,
        lineWidth: lineWidth,
      });
    } else if (currentTool === 'measure-distance') {
      setTempAnnotation({
        type: 'measure-distance',
        x: startPos.x,
        y: startPos.y,
        width: pos.x - startPos.x,
        height: pos.y - startPos.y,
        color: '#FF6B00',
        lineWidth: 2,
      });
    } else if (currentTool === 'ellipse') {
      setTempAnnotation({
        type: 'ellipse',
        x: startPos.x,
        y: startPos.y,
        width: pos.x - startPos.x,
        height: pos.y - startPos.y,
        color: currentColor,
        lineWidth: lineWidth,
      });
    } else {
      setTempAnnotation({
        type: currentTool,
        x: startPos.x,
        y: startPos.y,
        width: pos.x - startPos.x,
        height: pos.y - startPos.y,
        color: currentColor,
        lineWidth: lineWidth,
      });
    }
  };

  const handleMouseUp = async (e) => {
    if (isPanning) {
      setIsPanning(false);
      setStartPos(null);
      return;
    }

    // Finish MOVE: persist updated position
    if (isMoving && selectedAnnotation) {
      setIsMoving(false);
      setTransformStart(null);
      setOriginalForTransform(null);
      try {
        const payload = normalizeRectLike({
          type: selectedAnnotation.type,
          x: selectedAnnotation.x || 0,
          y: selectedAnnotation.y || 0,
          width: selectedAnnotation.width || 0,
          height: selectedAnnotation.height || 0,
          color: selectedAnnotation.color,
          text: selectedAnnotation.text || '',
          page: selectedAnnotation.page || (file?.type==='pdf'?currentPdfPage:1),
        });
        await annotationsAPI.update(selectedAnnotation.id, payload);
        showToast('Moved', 'info');
      } catch (err) {
        console.error('Failed to persist move', err);
      }
      return;
    }

    // Finish SCALE: persist updated size
    if (isScaling && selectedAnnotation) {
      setIsScaling(false);
      setTransformStart(null);
      setOriginalForTransform(null);
      try {
        const payload = normalizeRectLike({
          type: selectedAnnotation.type,
          x: selectedAnnotation.x || 0,
          y: selectedAnnotation.y || 0,
          width: selectedAnnotation.width || 0,
          height: selectedAnnotation.height || 0,
          color: selectedAnnotation.color,
          text: selectedAnnotation.text || '',
          page: selectedAnnotation.page || (file?.type==='pdf'?currentPdfPage:1),
        });
        await annotationsAPI.update(selectedAnnotation.id, payload);
        showToast('Resized', 'info');
      } catch (err) {
        console.error('Failed to persist resize', err);
      }
      return;
    }

    if (isRotating && selectedAnnotation) {
      setIsRotating(false);
      setRotationStartAngle(null);
      // Persist rotation by encoding meta into text for non-text types
      if (selectedAnnotation.type !== 'text') {
        try {
          const meta = { ...(selectedAnnotation.meta || {}) };
          const payload = {
            type: selectedAnnotation.type,
            x: selectedAnnotation.x,
            y: selectedAnnotation.y,
            width: selectedAnnotation.width || 0,
            height: selectedAnnotation.height || 0,
            color: selectedAnnotation.color,
            text: JSON.stringify({ meta })
          };
          await annotationsAPI.update(selectedAnnotation.id, payload);
        } catch (err) {
          console.error('Failed to save rotation', err);
        }
      }
      return;
    }

    if (!isDrawing) {
      // Finish polygon/polyline with double click handled outside; nothing here
      return;
    }

    setIsDrawing(false);

    if (tempAnnotation && currentTool !== 'text' && currentTool !== 'polygon' && currentTool !== 'polyline') {
      await saveAnnotation(tempAnnotation);
      setTempAnnotation(null);
      setPencilPath([]);
    }

    setStartPos(null);
  };

  const findAnnotationAtPoint = (point) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      if (a.type === 'rectangle' || a.type === 'line' || a.type === 'arrow') {
        const minX = Math.min(a.x, a.x + a.width);
        const maxX = Math.max(a.x, a.x + a.width);
        const minY = Math.min(a.y, a.y + a.height);
        const maxY = Math.max(a.y, a.y + a.height);
        
        if (point.x >= minX - 10 && point.x <= maxX + 10 &&
            point.y >= minY - 10 && point.y <= maxY + 10) {
          return a;
        }
      }
      if (a.type === 'text') {
        // approximate text bounding box
        const approxWidth = (a.text ? a.text.length : 4) * 8;
        const minX = a.x - 5;
        const maxX = a.x - 5 + approxWidth + 10;
        const minY = a.y - 20;
        const maxY = a.y + 5;
        if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
          return a;
        }
      }
      // Add more complex hit detection for circles, etc.
    }
    return null;
  };

  const saveAnnotation = async (annotationData) => {
    try {
      setSavedStatus('saving');
      const data = {
        project_id: parseInt(projectId),
        file_id: parseInt(fileId),
        type: annotationData.type,
        x: annotationData.x || 0,
        y: annotationData.y || 0,
        width: annotationData.width || 0,
        height: annotationData.height || 0,
        text: annotationData.text || '',
        color: annotationData.color,
        page: file?.type === 'pdf' ? (currentPdfPage || 1) : 1,
      };

      // For pencil tool, encode points as JSON string
      if (annotationData.type === 'pencil' && annotationData.points) {
        data.text = JSON.stringify(annotationData.points);
      }

      // For angle measurement, encode points
      if (annotationData.type === 'measure-angle' && annotationData.points) {
        data.text = JSON.stringify(annotationData.points);
      }

      const response = await annotationsAPI.create(data);
      
      // Process the response
      const newAnnotation = response.data;
      if (newAnnotation.type === 'pencil' && newAnnotation.text) {
        newAnnotation.points = JSON.parse(newAnnotation.text);
      }
      if (newAnnotation.type === 'measure-angle' && newAnnotation.text) {
        newAnnotation.points = JSON.parse(newAnnotation.text);
      }
      
      setAnnotations([...annotations, newAnnotation]);
      setSavedStatus('saved');
      showToast('Annotation saved', 'success');
    } catch (error) {
      console.error('Failed to save annotation:', error);
      setSavedStatus('unsaved');
      showToast('Failed to save annotation', 'error');
    }
  };

  const handleDeleteAnnotation = async (annotationId) => {
    try {
      await annotationsAPI.delete(annotationId);
      setAnnotations(annotations.filter((a) => a.id !== annotationId));
      setSelectedAnnotation(null);
      showToast('Annotation deleted', 'success');
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      showToast('Failed to delete annotation', 'error');
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete all annotations? This cannot be undone.')) return;

    try {
      for (const annotation of annotations) {
        await annotationsAPI.delete(annotation.id);
      }
      setAnnotations([]);
      setSelectedAnnotation(null);
      showToast('All annotations cleared', 'success');
    } catch (error) {
      console.error('Failed to clear annotations:', error);
      showToast('Failed to clear annotations', 'error');
    }
  };

  const handleUndo = async () => {
    if (annotations.length === 0) return;
    
    const lastAnnotation = annotations[annotations.length - 1];
    setRedoStack([lastAnnotation, ...redoStack]);
    await handleDeleteAnnotation(lastAnnotation.id);
    showToast('Undo successful', 'info');
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const [toRestore, ...rest] = redoStack;
    setRedoStack(rest);
    const data = {
      project_id: parseInt(projectId),
      file_id: parseInt(fileId),
      type: toRestore.type,
      x: toRestore.x || 0,
      y: toRestore.y || 0,
      width: toRestore.width || 0,
      height: toRestore.height || 0,
      color: toRestore.color,
      page: toRestore.page || 1,
    };
    if (toRestore.type === 'pencil' && toRestore.points) {
      data.text = JSON.stringify(toRestore.points);
    } else if (toRestore.text && toRestore.type !== 'text') {
      data.text = toRestore.text;
    } else if (toRestore.type === 'text') {
      data.text = toRestore.text || '';
    }
    try {
      const response = await annotationsAPI.create(data);
      const recreated = response.data;
      if (recreated.type === 'pencil' && recreated.text) {
        try { recreated.points = JSON.parse(recreated.text); } catch {}
      }
      setAnnotations([...annotations, recreated]);
      showToast('Redo successful', 'info');
    } catch (err) {
      console.error('Failed to redo annotation', err);
      showToast('Failed to redo', 'error');
    }
  };

  const handleSaveAll = async () => {
    showToast('All annotations are auto-saved!', 'success');
  };

  const handleZoom = (delta) => {
    setScale((prev) => Math.max(0.25, Math.min(4, prev + delta)));
  };

  const handleZoomFit = () => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Handle tool switching with auto-save for polygon/polyline
  const handleToolSwitch = async (newTool) => {
    // If we're currently drawing a polygon/polyline and have points, save it before switching
    if (tempAnnotation && (currentTool === 'polygon' || currentTool === 'polyline') && tempAnnotation.points && tempAnnotation.points.length > 1) {
      const finalized = { ...tempAnnotation };
      delete finalized.previewPoint;
      await saveAnnotation(finalized);
      setTempAnnotation(null);
      showToast(`${currentTool} saved`, 'success');
    }
    setCurrentTool(newTool);
  };

  const handleScrollPdf = (delta) => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ top: delta, behavior: 'smooth' });
    }
  };

  const handleWheelScroll = (e) => {
    if (!containerRef.current) return;
    // Allow smooth vertical scrolling even when cursor is over the canvas
    containerRef.current.scrollBy({ top: e.deltaY, behavior: 'auto' });
  };

  const showToast = (message, type) => {
    setToast({ message, type });
  };

  // Normalize rectangle-like annotations to avoid negative width/height
  const normalizeRectLike = (a) => {
    if (!a) return a;
    const out = { ...a };
    if (typeof out.width === 'number' && out.width < 0) {
      out.x = (out.x || 0) + out.width;
      out.width = Math.abs(out.width);
    }
    if (typeof out.height === 'number' && out.height < 0) {
      out.y = (out.y || 0) + out.height;
      out.height = Math.abs(out.height);
    }
    return out;
  };

  // Utility: load external script with fallback URLs
  const loadScriptWithFallback = (urls) => {
    return new Promise((resolve, reject) => {
      const tryNext = (index) => {
        if (index >= urls.length) {
          reject(new Error('All script URLs failed'));
          return;
        }
        const s = document.createElement('script');
        s.src = urls[index];
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve(true);
        s.onerror = () => {
          s.remove();
          tryNext(index + 1);
        };
        document.body.appendChild(s);
      };
      tryNext(0);
    });
  };

  const handlePrintPdf = async () => {
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = baseCanvasWidth; exportCanvas.height = file.type === 'pdf' ? (pdfPageHeight || baseCanvasHeight) : baseCanvasHeight;
      const ex = exportCanvas.getContext('2d');
      const drawForExport = (ctx, a, scaleFactor = 1) => {
        ctx.save();
        const lineW = (a.lineWidth || 2) * scaleFactor;
        ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = lineW;
        const x=(a.x||0) * scaleFactor, y=(a.y||0) * scaleFactor, w=(a.width||0) * scaleFactor, h=(a.height||0) * scaleFactor;
        const meta = (()=>{ 
          try {
            if (a.meta) return a.meta;
            if (typeof a.text === 'string') {
              const parsed = JSON.parse(a.text);
              return (parsed && parsed.meta) || {};
            }
            return {};
          } catch { return {}; }
        })();
        const rot = (meta && meta.rotation) || 0; const apply=rot && a.type!=='text';
        if (apply){ const cx=x+w/2, cy=y+h/2; ctx.translate(cx,cy); ctx.rotate(rot); ctx.translate(-cx,-cy); }
        switch(a.type){
          case 'rectangle': ctx.strokeRect(x,y,w,h); break;
          case 'circle': { const r = Math.sqrt(w*w+h*h)/2; ctx.beginPath(); ctx.arc(x+w/2,y+h/2,r,0,2*Math.PI); ctx.stroke(); break; }
          case 'ellipse': { ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,Math.abs(w/2),Math.abs(h/2),0,0,2*Math.PI); ctx.stroke(); break; }
          case 'line': ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y+h); ctx.stroke(); break;
          case 'arrow': { const angle=Math.atan2(h,w), hl=15*scaleFactor; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y+h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x+w,y+h); ctx.lineTo(x+w-hl*Math.cos(angle-Math.PI/6), y+h-hl*Math.sin(angle-Math.PI/6)); ctx.moveTo(x+w,y+h); ctx.lineTo(x+w-hl*Math.cos(angle+Math.PI/6), y+h-hl*Math.sin(angle+Math.PI/6)); ctx.stroke(); break; }
          case 'text': ctx.font = `${(a.fontSize||16)*scaleFactor}px Inter, Arial, sans-serif`; ctx.fillText(a.text||'', x, y); break;
          case 'pencil': { if (a.points?.length>1){ ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y); a.points.forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke(); } break; }
          case 'polygon':
          case 'polyline': { if (a.points?.length>1){ ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y); for (let i=1;i<a.points.length;i++){ ctx.lineTo(a.points[i].x, a.points[i].y);} if (a.type==='polygon') ctx.closePath(); ctx.stroke(); } break; }
          case 'measure-distance': {
            // line
            ctx.strokeStyle = '#FF6B00';
            ctx.lineWidth = 2 * scaleFactor;
            ctx.setLineDash([5 * scaleFactor, 5 * scaleFactor]);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
            ctx.setLineDash([]);
            // label using current unit
            const dx = (x + w) - x; const dy = (y + h) - y;
            const distancePx = Math.sqrt(dx*dx + dy*dy) / scaleFactor; // back to editor px
            const ppu = getPixelsPerUnit(measurementUnit);
            const value = distancePx / ppu;
            const label = `${value.toFixed(2)} ${measurementUnit}`;
            ctx.font = `${14 * scaleFactor}px Inter, Arial, sans-serif`;
            const midX = x + w / 2; const midY = y + h / 2;
            const metrics = ctx.measureText(label);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(midX - metrics.width/2 - 4*scaleFactor, midY - 12*scaleFactor, metrics.width + 8*scaleFactor, 20*scaleFactor);
            ctx.fillStyle = '#FF6B00';
            ctx.fillText(label, midX - metrics.width/2, midY + 4*scaleFactor);
            break; }
        }
        ctx.restore();
      };
      
      if (file.type === 'pdf' && pdfDoc) {
        // Load original PDF bytes to preserve vector content
        const originalBytes = await (await fetch(resolvedFileUrl, { credentials: 'include' })).arrayBuffer();
        const outPdf = await PDFDocument.load(originalBytes);
        
        for (let p = 1; p <= (pdfPageCount || 1); p++) {
          const page = await pdfDoc.getPage(p);
          const baseViewport = page.getViewport({ scale: 1 });
          // Render at the same on-screen width so annotation coordinates map 1:1
          const displayScale = baseCanvasWidth / baseViewport.width;
          const displayViewport = page.getViewport({ scale: displayScale });
          exportCanvas.width = Math.round(displayViewport.width);
          exportCanvas.height = Math.round(displayViewport.height);
          ex.setTransform(1,0,0,1,0,0);
          ex.clearRect(0,0,exportCanvas.width, exportCanvas.height);
          // First draw the actual PDF page at display scale
          await page.render({ canvasContext: ex, viewport: displayViewport }).promise;
          // Then overlay annotations with no extra scaling (1:1 with display)
          const pageAnnotations = annotations.filter(a => (a.page || 1) === p);
          for (const a of pageAnnotations) drawForExport(ex, a, 1);
          const pngBytes = await (await fetch(exportCanvas.toDataURL('image/png'))).arrayBuffer();
          const pngEmbed = await outPdf.embedPng(pngBytes);
          const pdfPage = outPdf.getPage(p - 1);
          const { width, height } = pdfPage.getSize();
          pdfPage.drawImage(pngEmbed, { x: 0, y: 0, width, height });
        }
        
        const bytes = await outPdf.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Create a more robust print window with proper orientation handling
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Print Document</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  background: #f0f0f0;
                  font-family: Arial, sans-serif;
                }
                .container {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  padding: 20px;
                }
                .pdf-viewer {
                  width: 100%;
                  height: 80vh;
                  border: 1px solid #ccc;
                  background: white;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                .controls {
                  margin: 20px 0;
                  text-align: center;
                }
                .btn {
                  background: #007bff;
                  color: white;
                  border: none;
                  padding: 10px 20px;
                  margin: 0 10px;
                  border-radius: 5px;
                  cursor: pointer;
                  font-size: 14px;
                }
                .btn:hover {
                  background: #0056b3;
                }
                @media print {
                  body {
                    margin: 0;
                    padding: 0;
                    background: white;
                  }
                  .container {
                    min-height: auto;
                    padding: 0;
                  }
                  .controls {
                    display: none;
                  }
                  .pdf-viewer {
                    width: 100% !important;
                    height: 100vh !important;
                    border: none;
                    box-shadow: none;
                  }
                  embed {
                    width: 100% !important;
                    height: 100vh !important;
                  }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="controls">
                  <button class="btn" onclick="window.print()">Print Document</button>
                  <button class="btn" onclick="window.close()">Close</button>
                </div>
                <embed class="pdf-viewer" src="${url}" type="application/pdf" />
              </div>
            </body>
            </html>
          `);
          printWindow.document.close();
        }
      } else {
        // Image export single-page
        if (imageRef.current && imageRef.current.tagName === 'IMG') {
          await new Promise((r) => { if (imageRef.current.complete) r(); else imageRef.current.onload = r; });
          ex.clearRect(0,0,exportCanvas.width, exportCanvas.height);
          ex.drawImage(imageRef.current, 0, 0, baseCanvasWidth, exportCanvas.height);
          for (const a of annotations) drawForExport(ex, a);
        }
        
        const imgData = exportCanvas.toDataURL('image/png');
        const pdf = await PDFDocument.create();
        
        // Determine page orientation based on image dimensions
        const isLandscape = exportCanvas.width > exportCanvas.height;
        const pageSize = [exportCanvas.width, exportCanvas.height];
        const page = pdf.addPage(pageSize);
        
        const pngBytes = await (await fetch(imgData)).arrayBuffer();
        const pngEmbed = await pdf.embedPng(pngBytes);
        page.drawImage(pngEmbed, { x: 0, y: 0, width: exportCanvas.width, height: exportCanvas.height });
        
        const bytes = await pdf.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Create a more robust print window with proper orientation handling
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Print Document</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  background: #f0f0f0;
                  font-family: Arial, sans-serif;
                }
                .container {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  padding: 20px;
                }
                .pdf-viewer {
                  width: 100%;
                  height: 80vh;
                  border: 1px solid #ccc;
                  background: white;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                .controls {
                  margin: 20px 0;
                  text-align: center;
                }
                .btn {
                  background: #007bff;
                  color: white;
                  border: none;
                  padding: 10px 20px;
                  margin: 0 10px;
                  border-radius: 5px;
                  cursor: pointer;
                  font-size: 14px;
                }
                .btn:hover {
                  background: #0056b3;
                }
                @media print {
                  body {
                    margin: 0;
                    padding: 0;
                    background: white;
                  }
                  .container {
                    min-height: auto;
                    padding: 0;
                  }
                  .controls {
                    display: none;
                  }
                  .pdf-viewer {
                    width: 100% !important;
                    height: 100vh !important;
                    border: none;
                    box-shadow: none;
                  }
                  embed {
                    width: 100% !important;
                    height: 100vh !important;
                  }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="controls">
                  <button class="btn" onclick="window.print()">Print Document</button>
                  <button class="btn" onclick="window.close()">Close</button>
                </div>
                <embed class="pdf-viewer" src="${url}" type="application/pdf" />
              </div>
            </body>
            </html>
          `);
          printWindow.document.close();
        }
      }
      showToast('PDF ready for printing', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to prepare PDF for printing', 'error');
    }
  };

  if (!file) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <i className="fas fa-exclamation-triangle text-6xl mb-4"></i>
          <h2 className="text-2xl font-bold mb-2">No File Selected</h2>
          <p className="text-gray-400 mb-6">Please select a file to annotate</p>
          <button
            onClick={() => navigate(`/project/${projectId}`)}
            className="btn-primary"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Back to Project
          </button>
        </div>
      </div>
    );
  }

  // Ensure static files use backend origin when VITE_API_URL is configured
  const apiBase = import.meta.env.VITE_API_URL || '';
  const staticBase = apiBase ? apiBase.replace(/\/api$/, '') : '';
  const resolvedFileUrl = file.url?.startsWith('http') ? file.url : `${staticBase}${file.url || ''}`;
  // pdf.js renderer to avoid native viewer and support pagination
  useEffect(() => {
    const loadPdf = async () => {
      if (!file || file.type !== 'pdf') return;
      try {
        // pdf.js is provided locally via pdfjs-dist and configured above

        let doc;
        try {
          // Try to fetch with credentials to avoid CORS/session issues
          const resp = await fetch(resolvedFileUrl, { credentials: 'include' });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = await resp.arrayBuffer();
          const loadingTaskData = window.pdfjsLib.getDocument({ data: buf, withXfa: false });
          doc = await loadingTaskData.promise;
        } catch (fetchErr) {
          // Fallback to direct URL if fetch blocked
          console.warn('PDF fetch fallback to URL:', fetchErr);
          const loadingTaskUrl = window.pdfjsLib.getDocument({ url: resolvedFileUrl, withXfa: false, withCredentials: true });
          doc = await loadingTaskUrl.promise;
        }
        setPdfDoc(doc);
        setPdfPageCount(doc.numPages);
        setCurrentPdfPage(1);
        await renderPdfPage(doc, 1);
      } catch (e) {
        console.error('PDF load failed', e);
        // Fallback to native PDF viewer inside iframe to avoid blocking the editor UI
        setPdfFallbackIframe(true);
        showToast('Falling back to built-in PDF viewer', 'info');
        setPdfDoc(null);
        setPdfPageDataUrl(null);
      }
    };
    loadPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedFileUrl, file?.type]);

  const renderPdfPage = async (doc, pageNum) => {
    if (!doc) return;
    let page;
    try {
      page = await doc.getPage(pageNum);
    } catch (e) {
      console.error('Failed to get PDF page', e);
      showToast('Failed to open PDF page', 'error');
      return;
    }
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = baseCanvasWidth; // match drawing canvas width
    const scale = targetWidth / viewport.width;
    const scaled = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(scaled.width);
    canvas.height = Math.floor(scaled.height);
    const ctx = canvas.getContext('2d');
    try {
      await page.render({ canvasContext: ctx, viewport: scaled }).promise;
      const url = canvas.toDataURL('image/png');
      setPdfPageDataUrl(url);
    } catch (e) {
      console.warn('PDF render failed', e);
      setPdfPageDataUrl(null);
    }
    setPdfPageHeight(Math.floor(scaled.height));
  };

  const goToPdfPage = async (pageNum) => {
    if (!pdfDoc) return;
    const p = Math.max(1, Math.min(pdfPageCount || 1, pageNum));
    setCurrentPdfPage(p);
    // Clear selection when changing pages to avoid showing handles from previous page
    setSelectedAnnotation(null);
    await renderPdfPage(pdfDoc, p);
  };

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Top Bar - always visible */}
      <div className="bg-gray-800 border-b border-gray-700 text-white sticky top-16 z-30">
        {/* Main Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center gap-2 transition-colors"
            >
              <i className="fas fa-arrow-left"></i>
              <span className="hidden sm:inline">Back to Project</span>
            </button>
            
            <div className="h-8 w-px bg-gray-600"></div>
            
            {/* hide large title to increase visible PDF area */}
          </div>

          <div className="flex items-center gap-3">
            {/* Save Status */}
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-700 rounded">
              {savedStatus === 'saving' && (
                <>
                  <i className="fas fa-spinner fa-spin text-blue-400"></i>
                  <span className="text-sm text-gray-300">Saving...</span>
                </>
              )}
              {savedStatus === 'saved' && (
                <>
                  <i className="fas fa-check-circle text-green-400"></i>
                  <span className="text-sm text-gray-300">All Changes Saved</span>
                </>
              )}
              {savedStatus === 'unsaved' && (
                <>
                  <i className="fas fa-exclamation-circle text-yellow-400"></i>
                  <span className="text-sm text-gray-300">Unsaved Changes</span>
                </>
              )}
            </div>

            {/* Removed top bar page selector (pagination) to avoid duplication. Use bottom quick bar controls instead. */}
            {/* Removed duplicate Back button on the right side */}
            {/* Removed old PDF button; new Download button is in quick bar */}
            {/* removed duplicate download button */}
              </div>
            </div>

        {/* Tools Toolbar removed in favor of side + quickbar */}

        {/* Tool Info Bar */}
        {showInfoBar && (
        <div className="px-4 py-2 bg-gray-700 text-sm text-gray-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="fas fa-info-circle text-blue-400"></i>
              <span>
                {currentTool === 'select' && 'Click annotations to select them. Press Delete to remove.'}
                {currentTool === 'pan' && 'Click and drag to pan the canvas'}
                {currentTool === 'pencil' && 'Click and drag to draw freehand'}
                {currentTool === 'line' && 'Click and drag to draw a straight line'}
                {currentTool === 'arrow' && 'Click and drag to draw an arrow'}
                {currentTool === 'rectangle' && 'Click and drag to draw a rectangle'}
                {currentTool === 'circle' && 'Click and drag to draw a circle'}
                {currentTool === 'text' && 'Click anywhere to add text'}
                {currentTool === 'eraser' && 'Click on annotations to delete them'}
                {currentTool === 'measure-distance' && 'Click and drag to measure distance'}
                {currentTool === 'measure-angle' && 'Click 3 points to measure angle'}
              </span>
            </div>
            <div className="text-xs text-gray-400">
              <i className="fas fa-keyboard mr-1"></i>
              Use hotkeys: S(elect), P(encil), L(ine), A(rrow), R(ectangle), C(ircle), T(ext), E(raser), M(easure), G(Angle)
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Content Row */}
      <div className="flex-1 flex overflow-hidden relative mt-4 min-h-0">
      {/* Left Sidebar Tools */}
      <div className="w-72 bg-gray-850 border-r border-gray-700 text-white hidden md:flex md:flex-col overflow-y-auto min-h-0">
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 uppercase">CAD Tools</h3>
        </div>
        <div className="p-3 space-y-4 overflow-y-auto">
          <div>
            <div className="text-[10px] text-gray-400 mb-2 uppercase">Draw</div>
            <div className="grid grid-cols-3 gap-2">
              {tools.filter(t => ['select','pan','pencil','line','arrow','rectangle','circle','ellipse','polygon','polyline','text','eraser','measure-distance','measure-angle'].includes(t.id)).map(tool => (
                <button key={tool.id} onClick={() => handleToolSwitch(tool.id)}
                  className={`h-10 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center ${currentTool === tool.id ? 'ring-2 ring-blue-500 bg-blue-600' : ''}`}
                  title={tool.label}>
                  <i className={`fas ${tool.icon}`}></i>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-2 uppercase">Modify</div>
            <div className="grid grid-cols-3 gap-2">
              {tools.filter(t => ['move','copy','scale','mirror','array'].includes(t.id)).map(tool => (
                <button key={tool.id} onClick={() => handleToolSwitch(tool.id)}
                  className={`h-10 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center ${currentTool === tool.id ? 'ring-2 ring-blue-500 bg-blue-600' : ''}`}
                  title={tool.label}>
                  <i className={`fas ${tool.icon}`}></i>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 mb-2 uppercase">Style</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-8 h-8 rounded border-2 border-gray-600 shadow-sm hover:border-blue-500"
                style={{ backgroundColor: currentColor }}
                title="Select Color"
              />
              <div className="flex gap-1">
                {[1,2,4,6,8].map(w => (
                  <button key={w} onClick={() => setLineWidth(w)} title={`${w}px`}
                    className={`w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center ${lineWidth===w?'ring-2 ring-blue-400':''}`}>
                    <div className="rounded-full bg-current" style={{ width: `${w}px`, height: `${w}px` }} />
                  </button>
                ))}
              </div>
            </div>
            {showColorPicker && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {colors.map((color) => (
                  <button key={color} onClick={() => { setCurrentColor(color); setShowColorPicker(false); }}
                    className={`w-6 h-6 rounded border-2 ${currentColor===color?'border-blue-400':'border-gray-600'}`}
                    style={{ backgroundColor: color }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 overflow-auto relative bg-gray-800 flex flex-col">
        <div className="absolute inset-0 overflow-auto" ref={containerRef} onWheel={handleWheelScroll}>
          <div 
            className="relative inline-block min-w-full"
            style={{ 
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            }}
          >
            {/* File Display */}
            {file.type === 'pdf' ? (
              pdfFallbackIframe ? (
                <iframe
                  ref={imageRef}
                  src={`${resolvedFileUrl}${resolvedFileUrl.includes('#') ? '&' : '#'}toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                  className="border-0 bg-white shadow-2xl"
                  style={{
                  width: `${baseCanvasWidth * scale}px`,
                  height: `${(pdfPageHeight || baseCanvasHeight) * scale}px`,
                    pointerEvents: 'none',
                    display: 'block',
                  }}
                  title={file.name}
                />
              ) : pdfPageDataUrl ? (
                <img
                ref={imageRef}
                  src={pdfPageDataUrl}
                  alt={file.name}
                  className="bg-white shadow-2xl"
                style={{ 
                  width: `${baseCanvasWidth * scale}px`,
                    height: `${pdfPageHeight * scale}px`,
                    display: 'block',
                }}
              />
              ) : null
            ) : (
              <img
                ref={imageRef}
                src={resolvedFileUrl}
                alt={file.name}
                className="bg-white shadow-2xl"
                style={{ 
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              />
            )}

            {/* Drawing Canvas Overlay */}
            <canvas
              ref={canvasRef}
              width={baseCanvasWidth}
              height={file.type === 'pdf' ? (pdfPageHeight || baseCanvasHeight) : baseCanvasHeight}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onDoubleClick={(e) => {
                const pos = getCanvasCoordinates(e);
                const clicked = findAnnotationAtPoint(pos);
                if (clicked && clicked.type === 'text') {
                  const newText = prompt('Edit text:', clicked.text || '');
                  if (newText !== null) {
                    annotationsAPI.update(clicked.id, { type: 'text', x: clicked.x, y: clicked.y, width: 0, height: 0, color: clicked.color, text: newText })
                      .then(() => {
                        setAnnotations(annotations.map(a => a.id === clicked.id ? { ...a, text: newText } : a));
                        showToast('Text updated', 'success');
                      })
                      .catch(() => showToast('Failed to update text', 'error'));
                  }
                } else if (tempAnnotation && (currentTool === 'polygon' || currentTool === 'polyline')) {
                  // Finish polygon/polyline
                  const finalized = { ...tempAnnotation };
                  delete finalized.previewPoint;
                  saveAnnotation(finalized);
                  setTempAnnotation(null);
                }
              }}
              className="absolute top-0 left-0"
              style={{
                // Ensure the drawing canvas visually scales and matches the PDF/image size
                width: `${baseCanvasWidth * scale}px`,
                height: `${(file.type === 'pdf' ? (pdfPageHeight || baseCanvasHeight) : baseCanvasHeight) * scale}px`,
                cursor: 
                  currentTool === 'pan' ? 'grab' :
                  isPanning ? 'grabbing' :
                  currentTool === 'select' ? 'default' :
                  currentTool === 'eraser' ? 'not-allowed' :
                  'crosshair',
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Quick Bar */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-20">
        <div className="bg-gray-800/95 text-white backdrop-blur px-3 py-2 rounded-xl border border-gray-700 shadow-xl flex items-center gap-2">
          {file.type === 'pdf' && pdfDoc && (
            <>
              <div className="h-6 w-px bg-gray-700" />
              <button disabled={currentPdfPage<=1} onClick={async()=>{ const p=Math.max(1,currentPdfPage-1); setCurrentPdfPage(p); await renderPdfPage(pdfDoc,p); }}
                className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 disabled:opacity-50 flex items-center justify-center" title="Prev page">
                <i className="fas fa-chevron-left"></i>
              </button>
              <span className="text-xs text-gray-300 min-w-[64px] text-center">{currentPdfPage} / {pdfPageCount}</span>
              <button disabled={currentPdfPage>=pdfPageCount} onClick={async()=>{ const p=Math.min(pdfPageCount,currentPdfPage+1); setCurrentPdfPage(p); await renderPdfPage(pdfDoc,p); }}
                className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 disabled:opacity-50 flex items-center justify-center" title="Next page">
                <i className="fas fa-chevron-right"></i>
              </button>
            </>
          )}
          <button onClick={() => setShowInfoBar(!showInfoBar)}
            className={`w-9 h-9 rounded ${showInfoBar?'bg-blue-600':'bg-gray-700 hover:bg-gray-600'} text-white border border-gray-600 flex items-center justify-center`}
            title={showInfoBar?'Hide info':'Show info'}>
            <i className="fas fa-bars"></i>
          </button>
          <div className="h-6 w-px bg-gray-700" />
          {/* Download new button */}
          <button onClick={handlePrintPdf}
            className="px-3 h-9 rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
            title="Download annotated PDF">
            <i className="fas fa-download"></i>
            <span className="hidden sm:inline">Download</span>
          </button>
          <button onClick={() => handleUndo()} disabled={annotations.length===0}
            className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 disabled:opacity-50 flex items-center justify-center" title="Undo">
            <i className="fas fa-undo"></i>
          </button>
          <button onClick={() => handleRedo()} disabled={redoStack.length===0}
            className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 disabled:opacity-50 flex items-center justify-center" title="Redo">
            <i className="fas fa-redo"></i>
          </button>
          <div className="h-6 w-px bg-gray-700" />
          <button onClick={() => handleZoom(-0.1)} className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 flex items-center justify-center" title="Zoom Out">
            <i className="fas fa-minus"></i>
          </button>
          <span className="text-xs text-gray-300 min-w-[48px] text-center">{Math.round(scale*100)}%</span>
          <button onClick={() => handleZoom(0.1)} className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 flex items-center justify-center" title="Zoom In">
            <i className="fas fa-plus"></i>
          </button>
          <button onClick={handleZoomFit} className="px-2 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 text-xs" title="Fit">
            Fit
          </button>
          {/* Measurement Unit Toggle */}
          <button onClick={() => {
            const order = ['px','mm','cm','in'];
            const idx = order.indexOf(measurementUnit);
            const next = order[(idx + 1) % order.length];
            setMeasurementUnit(next);
            showToast(`Measurement unit: ${next}`, 'info');
          }} className="px-2 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 text-xs" title="Toggle measurement unit">
            {measurementUnit}
          </button>
          {/* PDF Scroll Controls */}
          <div className="h-6 w-px bg-gray-700" />
          <button onClick={() => handleScrollPdf(-300)} className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 flex items-center justify-center" title="Scroll Up">
            <i className="fas fa-arrow-up"></i>
          </button>
          <button onClick={() => handleScrollPdf(300)} className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 flex items-center justify-center" title="Scroll Down">
            <i className="fas fa-arrow-down"></i>
          </button>
          {selectedAnnotation && selectedAnnotation.type !== 'text' && (
            <>
              <div className="h-6 w-px bg-gray-700" />
              <button
                onClick={async () => {
                  const current = (selectedAnnotation.meta?.rotation) || (() => { try { return JSON.parse(selectedAnnotation.text || '{}')?.meta?.rotation || 0; } catch { return 0; } })();
                  const updated = { ...selectedAnnotation, meta: { ...(selectedAnnotation.meta || {}), rotation: current + Math.PI } };
                  setSelectedAnnotation(updated);
                  try {
                    const payload = { type: updated.type, x: updated.x, y: updated.y, width: updated.width || 0, height: updated.height || 0, color: updated.color, text: JSON.stringify({ meta: updated.meta }) };
                    await annotationsAPI.update(updated.id, payload);
                  } catch (e) { console.error('Failed to rotate 180', e); }
                }}
                className="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 flex items-center justify-center"
                title="Rotate 180°"
              >
                <i className="fas fa-sync-alt"></i>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right Sidebar - Annotations List */}
      <div className="w-88 bg-gray-800 border-l border-gray-700 text-white overflow-y-auto hidden xl:block min-h-0">
        <div className="p-4 sticky top-0 z-10 bg-gray-800">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <i className="fas fa-list text-blue-400"></i>
            Annotations List
          </h3>
          {file.type === 'pdf' && pdfDoc && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Page</label>
              <select
                value={currentPdfPage}
                onChange={(e) => goToPdfPage(parseInt(e.target.value, 10))}
                className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
              >
                {Array.from({ length: pdfPageCount || 1 }).map((_, idx) => (
                  <option key={idx+1} value={idx+1}>{idx+1}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">/ {pdfPageCount}</span>
            </div>
          )}
        </div>
        <div className="p-4 pt-0">
          {annotations.length > 0 ? (
            <div className="space-y-2">
              {annotations.map((annotation, index) => (
                <div
                  key={annotation.id}
                  onClick={() => setSelectedAnnotation(annotation)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedAnnotation?.id === annotation.id
                      ? 'bg-blue-600 ring-2 ring-blue-400'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-gray-500"
                        style={{ backgroundColor: annotation.color }}
                      />
                      <span className="text-sm font-medium">
                        #{index + 1} {annotation.type ? annotation.type.replace('-', ' ').toUpperCase() : 'Unknown'}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAnnotation(annotation.id);
                      }}
                      className="text-red-400 hover:text-red-300 px-2 py-1"
                      title="Delete"
                    >
                      <i className="fas fa-trash text-sm"></i>
                    </button>
                  </div>
                  
                  {annotation.text && annotation.type === 'text' && (
                    <p className="text-xs text-gray-300 truncate">
                      "{annotation.text}"
                    </p>
                  )}
                  
                  <p className="text-xs text-gray-400 mt-1">
                    by {annotation.user_name || 'You'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2">
              <button
                onClick={() => setShowNoAnnoTips(!showNoAnnoTips)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              >
                <span className="text-sm font-medium text-gray-100">No annotations yet</span>
                <i className={`fas fa-chevron-${showNoAnnoTips ? 'up' : 'down'} text-gray-300`}></i>
              </button>
              {showNoAnnoTips && (
                <div className="text-center py-6 text-gray-400">
              <i className="fas fa-layer-group text-3xl mb-3 block"></i>
              <p className="text-sm">No annotations yet</p>
              <p className="text-xs mt-1">Select a tool and start drawing!</p>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 p-3 bg-gray-700 rounded-lg">
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Keyboard Shortcuts</h4>
            <div className="space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>Select Tool</span>
                <kbd className="px-2 py-0.5 bg-gray-600 rounded">S</kbd>
              </div>
              <div className="flex justify-between">
                <span>Pan Tool</span>
                <kbd className="px-2 py-0.5 bg-gray-600 rounded">H</kbd>
              </div>
              <div className="flex justify-between">
                <span>Undo</span>
                <kbd className="px-2 py-0.5 bg-gray-600 rounded">Ctrl+Z</kbd>
              </div>
              <div className="flex justify-between">
                <span>Delete Selected</span>
                <kbd className="px-2 py-0.5 bg-gray-600 rounded">Del</kbd>
              </div>
            </div>
          </div>

          {/* Current Tool Info */}
          <div className="mt-4 p-3 bg-blue-900 bg-opacity-50 rounded-lg border border-blue-700">
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-info-circle text-blue-400"></i>
              <h4 className="text-xs font-semibold text-blue-300 uppercase">Active Tool</h4>
            </div>
            <p className="text-sm text-blue-100">
              {tools.find(t => t.id === currentTool)?.label || 'Select'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-blue-300">Color:</span>
              <div 
                className="w-4 h-4 rounded border border-blue-400" 
                style={{ backgroundColor: currentColor }}
              />
              <span className="text-xs text-blue-300 ml-2">Width:</span>
              <span className="text-xs text-blue-100">{lineWidth}px</span>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationEditor;


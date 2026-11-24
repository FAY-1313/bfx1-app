import { useState, useRef, useEffect } from 'react';
import { SmartphoneIcon, RotateCcwIcon } from 'lucide-react';
import { useI18n } from '../../i18n';

/* ★ 2026-11-24：从 Index.tsx 原样搬出（纯搬家，逻辑未改） */

function PdfViewer({ file }: { file: string }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(100);
  const [landscape, setLandscape] = useState(false);
  const [canvasCssW, setCanvasCssW] = useState(0);
  const [canvasCssH, setCanvasCssH] = useState(0);
  const pdfDocRef = useRef<any>(null);
  const [, setRerender] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const scriptId = 'pdfjs-script';
    const existing = document.getElementById(scriptId);
    const loadPdf = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) { if (!cancelled) setError(t('pdf.engineFail')); setLoading(false); return; }
      pdfjsLib.getDocument('/docs/' + file).promise.then((doc: any) => {
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(1);
        renderPage(1, doc, canvasRef, zoom, landscape, window.innerWidth, window.innerHeight, (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); setLoading(false); });
      }).catch(() => { if (!cancelled) { setError(t('pdf.loadFail')); setLoading(false); } });
    };

    if (existing) {
      if ((window as any).pdfjsLib) loadPdf();
      else existing.addEventListener('load', loadPdf);
    } else {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = loadPdf;
      script.onerror = () => { if (!cancelled) { setError(t('pdf.downloadFail')); setLoading(false); } };
      document.head.appendChild(script);
    }

    return () => { cancelled = true; };
  }, [file]);

  const goPage = (delta: number) => {
    const next = Math.max(1, Math.min(numPages, pageNum + delta));
    setPageNum(next);
    if (pdfDocRef.current) renderPage(next, pdfDocRef.current, canvasRef, zoom, landscape, window.innerWidth, window.innerHeight, (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); });
  };

  // Re-render on zoom/landscape change immediately
  useEffect(() => {
    if (pdfDocRef.current) {
      const w = landscape ? window.innerHeight : window.innerWidth;
      const h = landscape ? window.innerWidth : window.innerHeight;
      renderPage(pageNum, pdfDocRef.current, canvasRef, zoom, landscape, w, h,
        (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); });
    }
  }, [zoom, landscape, pageNum]);

  // Re-render on window resize
  useEffect(() => {
    const onResize = () => {
      setRerender(n => n + 1);
      if (pdfDocRef.current) {
        const w = landscape ? window.innerHeight : window.innerWidth;
        const h = landscape ? window.innerWidth : window.innerHeight;
        renderPage(pageNum, pdfDocRef.current, canvasRef, zoom, landscape, w, h,
          (cssW, cssH) => { setCanvasCssW(cssW); setCanvasCssH(cssH); });
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, [pageNum, zoom, landscape]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#525659', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', flexShrink: 0 }}>
        {numPages > 1 && !loading && !error && (
          <>
            <button onClick={() => goPage(-1)} style={pdfBtnStyle}>◀</button>
            <span style={{ color: '#ccc', fontSize: 11, minWidth: 44, textAlign: 'center' }}>{pageNum}/{numPages}</span>
            <button onClick={() => goPage(1)} style={pdfBtnStyle}>▶</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {!loading && !error && (
          <>
            <button onClick={() => setZoom(z => Math.max(50, z - 25))} style={pdfBtnStyle}>−</button>
            <span style={{ color: '#ccc', fontSize: 11, minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(400, z + 25))} style={pdfBtnStyle}>+</button>
            <button onClick={() => setLandscape(v => !v)} style={{ ...pdfBtnStyle, fontSize: 11, padding: '4px 10px' }}>
              {landscape ? <SmartphoneIcon size={14} /> : <RotateCcwIcon size={14} />}
            </button>
          </>
        )}
      </div>
      {/* Canvas area — scrollable with full bidirectional access, landscape sizes wrapper to rotated dims */}
      <div ref={containerRef} style={{
        flex: 1, overflow: 'auto', padding: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {loading && <div style={{ color: '#ccc', padding: 40, fontSize: 13 }}>{t('preset.loading')}</div>}
        {error && <div style={{ color: '#f88', padding: 40, fontSize: 13, textAlign: 'center' }}>{error}</div>}
        <div style={{
          // In landscape: wrapper sized to contain rotated canvas
          width: landscape && canvasCssH ? canvasCssH + 16 : 'auto',
          height: landscape && canvasCssW ? canvasCssW + 16 : 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          minWidth: landscape ? undefined : '100%',
        }}>
          <canvas ref={canvasRef} style={{
            display: loading || error ? 'none' : 'block',
            transform: landscape ? 'rotate(90deg)' : 'none',
            transformOrigin: 'center center',
          }} />
        </div>
      </div>
    </div>
  );
}

const pdfBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.1)',
  border: 'none', color: '#F2F4F8', cursor: 'pointer', fontSize: 13,
};

function renderPage(
  num: number, doc: any, canvasRef: React.RefObject<HTMLCanvasElement | null>,
  zoomPercent: number, landscape: boolean, containerW: number, containerH: number,
  onDone?: (cssW: number, cssH: number) => void,
) {
  doc.getPage(num).then((page: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale: 1.0 });
    const availW = landscape ? (containerH - 16) : (containerW - 16);
    const fitScale = availW / vp.width;
    const scale = fitScale * (zoomPercent / 100) * dpr;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const cssW = viewport.width / dpr;
    const cssH = viewport.height / dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    page.render({ canvasContext: ctx, viewport }).promise.then(() => onDone?.(cssW, cssH));
  }).catch(() => onDone?.(0, 0));
}

export default PdfViewer;

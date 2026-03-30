/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import ReactMarkdown from 'react-markdown';
import localforage from 'localforage';
import { jsPDF } from 'jspdf';
import { Upload, Moon, Sun, BookOpen, ChevronLeft, ChevronRight, Loader2, Library, Trash2, WifiOff, ArrowLeft, Download, Settings, ZoomIn, ZoomOut, Share2, Book, CloudDownload, CheckCircle, Languages, Camera, X } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const PdfPage = ({ pdfDoc, pageNum, zoom }: { pdfDoc: pdfjsLib.PDFDocumentProxy | null, pageNum: number, zoom: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let renderTask: pdfjsLib.RenderTask;
    let isCancelled = false;

    pdfDoc.getPage(pageNum).then(async (page) => {
      if (isCancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const context = canvas.getContext('2d');
      if (!context) return;

      if (typeof OffscreenCanvas !== 'undefined') {
        const offscreen = new OffscreenCanvas(viewport.width, viewport.height);
        const offscreenContext = offscreen.getContext('2d');
        if (offscreenContext) {
          renderTask = page.render({ canvasContext: offscreenContext as any, canvas: offscreen as any, viewport });
          await renderTask.promise;
          if (!isCancelled) {
            context.drawImage(offscreen, 0, 0);
          }
          return;
        }
      }
      
      // Fallback for browsers that don't support OffscreenCanvas
      renderTask = page.render({ canvasContext: context, canvas, viewport });
    }).catch(err => {
      if (err.name !== 'RenderingCancelledException') console.error(err);
    });

    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, pageNum, zoom]);

  return <canvas ref={canvasRef} className="max-w-full h-auto shadow-md bg-white rounded" />;
};

type Theme = 'light' | 'dark' | 'sepia' | 'novel';
type View = 'dashboard' | 'reader';

interface Book {
  id: string;
  title: string;
  totalPages: number;
  lastReadPage: number;
  addedAt: number;
  downloadedPages?: number;
}

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [library, setLibrary] = useState<Book[]>([]);
  
  // Reader State
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const currentBookIdRef = useRef<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [translatedPages, setTranslatedPages] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const translatingPagesRef = useRef<Set<number>>(new Set());
  
  // Selection Translation State
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [selectionTranslation, setSelectionTranslation] = useState<string | null>(null);
  const [isTranslatingSelection, setIsTranslatingSelection] = useState(false);
  
  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Offline & Download State
  const [offlineQueue, setOfflineQueue] = useState<Record<string, number[]>>({});
  const [downloadingBooks, setDownloadingBooks] = useState<Record<string, { total: number, current: number }>>({});
  
  // Settings & Network
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('reader_theme') as Theme) || 'light';
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('reader_fontSize');
    return saved ? parseInt(saved, 10) : 18;
  });
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  // Advanced Reader Settings
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showShareMenu, setShowShareMenu] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'translation' | 'pdf' | 'split'>(() => {
    return (localStorage.getItem('reader_viewMode') as any) || 'translation';
  });
  const [pdfZoom, setPdfZoom] = useState<number>(() => {
    const saved = localStorage.getItem('reader_pdfZoom');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [pageLayout, setPageLayout] = useState<'single' | 'facing'>(() => {
    return (localStorage.getItem('reader_pageLayout') as any) || 'single';
  });
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [downloadConfirm, setDownloadConfirm] = useState<{count: number, total: number} | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const aiRef = useRef(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }));

  // Initialize & Network Listeners
  useEffect(() => {
    currentBookIdRef.current = currentBook?.id || null;
  }, [currentBook]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      showToast("Back online! Processing queued translations...");
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast("You are offline. Translations will be queued.");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    loadLibrary();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Process offline queue when back online
  useEffect(() => {
    if (!isOffline && Object.keys(offlineQueue).length > 0) {
      const processQueue = async () => {
        const queueToProcess = { ...offlineQueue };
        setOfflineQueue({}); // Clear queue immediately so we don't process twice
        
        for (const [bookId, pages] of Object.entries(queueToProcess)) {
          if (pages.length === 0) continue;
          
          try {
            let pdfToUse = pdfDoc;
            if (currentBookIdRef.current !== bookId) {
              const pdfData = await localforage.getItem<ArrayBuffer>(`book_${bookId}_pdf`);
              if (pdfData) {
                const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
                pdfToUse = await loadingTask.promise;
              } else {
                continue;
              }
            }
            
            const currentPages = await localforage.getItem<Record<number, string>>(`book_${bookId}_pages`) || {};
            
            for (const pageNum of pages) {
              await translatePage(pdfToUse, bookId, pageNum, currentPages);
              // Small delay between pages to avoid rate limits
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (error) {
            console.error(`Failed to process offline queue for book ${bookId}`, error);
          }
        }
      };
      
      processQueue();
    }
  }, [isOffline]); // Intentionally only depending on isOffline to trigger once when coming online

  // Save Settings to LocalStorage
  useEffect(() => {
    localStorage.setItem('reader_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('reader_fontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('reader_viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('reader_pdfZoom', pdfZoom.toString());
  }, [pdfZoom]);

  useEffect(() => {
    localStorage.setItem('reader_pageLayout', pageLayout);
  }, [pageLayout]);

  const loadLibrary = async () => {
    const books = await localforage.getItem<Book[]>('library') || [];
    
    // Calculate downloaded pages for existing books
    const updatedBooks = await Promise.all(books.map(async (book) => {
      if (book.downloadedPages === undefined) {
        const pages = await localforage.getItem<Record<number, string>>(`book_${book.id}_pages`) || {};
        return { ...book, downloadedPages: Object.keys(pages).length };
      }
      return book;
    }));
    
    setLibrary(updatedBooks.sort((a, b) => b.addedAt - a.addedAt));
  };

  const saveLibrary = async (books: Book[]) => {
    await localforage.setItem('library', books);
    setLibrary(books);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
      const pdf = await loadingTask.promise;
      
      const newBook: Book = {
        id: Date.now().toString(),
        title: file.name.replace('.pdf', ''),
        totalPages: pdf.numPages,
        lastReadPage: 1,
        addedAt: Date.now(),
      };

      // Save to local storage
      await localforage.setItem(`book_${newBook.id}_pdf`, arrayBuffer);
      await localforage.setItem(`book_${newBook.id}_pages`, {});
      await saveLibrary([...library, newBook]);

      openBook(newBook, pdf, {});
    } catch (error) {
      console.error("Error loading PDF:", error);
      showToast("Failed to load PDF.");
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      showToast("Could not access camera. Please check permissions.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  const captureAndTranslate = async () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    try {
      // 1. Capture image from video
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");
      
      // Apply OCR preprocessing: Grayscale, Contrast, Brightness
      ctx.filter = 'grayscale(100%) contrast(150%) brightness(110%)';
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';

      // Apply Sharpening (Edge Enhancement / Noise Reduction)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;
      
      const sharpenKernel = [
         0, -1,  0,
        -1,  5, -1,
         0, -1,  0
      ];
      
      const tempData = new Uint8ClampedArray(data);
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          let r = 0, g = 0, b = 0;
          
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const kIdx = ((y + ky) * width + (x + kx)) * 4;
              const weight = sharpenKernel[(ky + 1) * 3 + (kx + 1)];
              r += tempData[kIdx] * weight;
              g += tempData[kIdx + 1] * weight;
              b += tempData[kIdx + 2] * weight;
            }
          }
          
          data[idx] = Math.min(255, Math.max(0, r));
          data[idx + 1] = Math.min(255, Math.max(0, g));
          data[idx + 2] = Math.min(255, Math.max(0, b));
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Note: Full perspective correction requires complex matrix transformations
      // and corner detection (e.g., via OpenCV.js). For this implementation,
      // we rely on the user aligning the camera, and Gemini's robust vision model
      // which naturally handles minor perspective distortions.

      const base64Image = canvas.toDataURL('image/jpeg', 0.8);
      
      // Stop camera since we have the image
      stopCamera();
      showToast("Processing image and translating...");

      // 2. Generate PDF using jsPDF
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(base64Image, 'JPEG', 0, 0, canvas.width, canvas.height);
      const pdfArrayBuffer = pdf.output('arraybuffer');

      // 3. Translate image using Gemini
      const response = await aiRef.current.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: 'image/jpeg'
            }
          },
          "Translate the text in this image to natural Bengali. Keep the formatting as best as you can. Output ONLY the translated text without any introductory or concluding remarks."
        ],
        config: {
          temperature: 0.3,
        }
      });

      const translatedText = response.text || "*No text found in image.*";

      // 4. Save as a new book
      const newBook: Book = {
        id: Date.now().toString(),
        title: `Camera Capture - ${new Date().toLocaleDateString()}`,
        totalPages: 1,
        lastReadPage: 1,
        addedAt: Date.now(),
        downloadedPages: 1
      };

      const pages = { 1: translatedText };
      await localforage.setItem(`book_${newBook.id}_pdf`, pdfArrayBuffer);
      await localforage.setItem(`book_${newBook.id}_pages`, pages);
      await saveLibrary([...library, newBook]);

      // 5. Open the new book
      const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer.slice(0) });
      const pdfDocProxy = await loadingTask.promise;
      openBook(newBook, pdfDocProxy, pages);

    } catch (error: any) {
      console.error("Error capturing and translating:", error);
      const errorString = typeof error === 'string' ? error : (error?.message || '') + ' ' + JSON.stringify(error, Object.getOwnPropertyNames(error));
      if (errorString.toLowerCase().includes('quota') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('429')) {
        showToast("API Quota Exceeded. Please wait a while before translating more pages.");
      } else {
        showToast("Failed to process image.");
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const openBookFromLibrary = async (book: Book) => {
    try {
      const pages = await localforage.getItem<Record<number, string>>(`book_${book.id}_pages`) || {};
      const pdfData = await localforage.getItem<ArrayBuffer>(`book_${book.id}_pdf`);
      
      let pdf: pdfjsLib.PDFDocumentProxy | null = null;
      if (pdfData) {
        const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
        pdf = await loadingTask.promise;
      }
      
      openBook(book, pdf, pages);
    } catch (error) {
      console.error("Failed to open book", error);
      showToast("Failed to open book from library.");
    }
  };

  const openBook = (book: Book, pdf: pdfjsLib.PDFDocumentProxy | null, pages: Record<number, string>) => {
    setCurrentBook(book);
    setPdfDoc(pdf);
    setTranslatedPages(pages);
    setCurrentPage(book.lastReadPage || 1);
    setView('reader');
    
    // Trigger translation for current page if not already translated
    const startPage = book.lastReadPage || 1;
    if (pages[startPage] === undefined) {
      translatePage(pdf, book.id, startPage, pages);
    }
    if (pageLayout === 'facing' && startPage < book.totalPages && pages[startPage + 1] === undefined) {
      translatePage(pdf, book.id, startPage + 1, pages);
    }

    // Pre-fetch next 2 pages (Lazy Loading optimization)
    if (!isOffline) {
      const startPrefetch = pageLayout === 'facing' ? startPage + 2 : startPage + 1;
      for (let i = 0; i < 2; i++) {
        const fetchPage = startPrefetch + i;
        if (fetchPage <= book.totalPages && pages[fetchPage] === undefined) {
          setTimeout(() => {
            translatePage(pdf, book.id, fetchPage, pages);
          }, i * 2000); // Stagger prefetch requests by 2 seconds
        }
      }
    }
  };

  const requestDeleteBook = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    setBookToDelete(id);
  };

  const confirmDeleteBook = async () => {
    if (!bookToDelete) return;
    const id = bookToDelete;
    
    const newLibrary = library.filter(b => b.id !== id);
    await saveLibrary(newLibrary);
    await localforage.removeItem(`book_${id}_pdf`);
    await localforage.removeItem(`book_${id}_pages`);

    if (currentBook?.id === id) {
      setView('dashboard');
      setCurrentBook(null);
      setPdfDoc(null);
      setTranslatedPages({});
    }
    setBookToDelete(null);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // If clicking inside the popup, do nothing
    if ((e.target as Element).closest('.translation-popup')) return;

    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 0) {
        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelection({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top
        });
        setSelectionTranslation(null);
      } else {
        setSelection(null);
        setSelectionTranslation(null);
      }
    }, 10);
  };

  const translateSelectedText = async () => {
    if (!selection) return;
    setIsTranslatingSelection(true);
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=bn&dt=t&q=${encodeURIComponent(selection.text)}`);
      const data = await res.json();
      const translatedText = data[0].map((item: any) => item[0]).join('');
      setSelectionTranslation(translatedText);
    } catch (error) {
      console.error("Google Translate error:", error);
      setSelectionTranslation("Translation failed.");
    } finally {
      setIsTranslatingSelection(false);
    }
  };

  const translatePage = async (
    pdf: pdfjsLib.PDFDocumentProxy | null, 
    bookId: string, 
    pageNum: number, 
    currentPages: Record<number, string> = translatedPages
  ): Promise<'started' | 'already_translated' | 'already_translating' | 'offline_queued' | 'no_pdf'> => {
    if (currentPages[pageNum] !== undefined) return 'already_translated';
    if (translatingPagesRef.current.has(pageNum)) return 'already_translating';
    if (!pdf) return 'no_pdf';
    
    if (isOffline) {
      setOfflineQueue(prev => {
        const bookQueue = prev[bookId] || [];
        if (bookQueue.includes(pageNum)) return prev;
        return { ...prev, [bookId]: [...bookQueue, pageNum] };
      });
      return 'offline_queued';
    }

    translatingPagesRef.current.add(pageNum);
    setIsTranslating(true);
    
    // Set to empty string to indicate translation has started, only if it's the current book
    if (currentBookIdRef.current === bookId) {
      setTranslatedPages(prev => ({ ...prev, [pageNum]: '' }));
    }

    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Improve text extraction by adding newlines for distinct blocks
      let text = '';
      let lastY;
      for (const item of textContent.items as any[]) {
        if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 5) {
          text += '\n';
        }
        text += item.str + ' ';
        lastY = item.transform[5];
      }

      if (!text.trim()) {
         const newPages = { ...currentPages, [pageNum]: "*No extractable text on this page.*" };
         if (currentBookIdRef.current === bookId) {
           setTranslatedPages(newPages);
         }
         await localforage.setItem(`book_${bookId}_pages`, newPages);
         translatingPagesRef.current.delete(pageNum);
         setIsTranslating(translatingPagesRef.current.size > 0);
         return;
      }

      let attempt = 0;
      const maxAttempts = 3;
      let success = false;
      let fullText = '';

      while (attempt < maxAttempts && !success) {
        try {
          const responseStream = await aiRef.current.models.generateContentStream({
            model: 'gemini-3.1-flash-lite-preview',
            contents: `Translate this English book text to natural Bengali. Keep the Markdown formatting: \n\n ${text}`,
            config: {
              systemInstruction: "You are an expert English to Bengali translator. Translate the following text into natural, accurate Bengali. Preserve all Markdown formatting, line breaks, and document structure. Output ONLY the translated text without any introductory or concluding remarks.",
              temperature: 0.3,
            }
          });

          fullText = '';
          for await (const chunk of responseStream) {
            if (chunk.text) {
              fullText += chunk.text;
              if (currentBookIdRef.current === bookId) {
                setTranslatedPages(prev => ({ ...prev, [pageNum]: fullText }));
              }
            }
          }
          success = true;
        } catch (error: any) {
          const errorString = typeof error === 'string' ? error : (error?.message || '') + ' ' + JSON.stringify(error, Object.getOwnPropertyNames(error));
          if (errorString.toLowerCase().includes('quota') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('429')) {
            throw error; // Stop retrying and trigger the outer catch block
          }

          console.error(`Translation error on attempt ${attempt + 1}:`, error);
          attempt++;
          if (attempt >= maxAttempts) {
            throw error; // Rethrow if we've exhausted attempts
          }
          // Wait before retrying (exponential backoff: 2s, 4s, 8s...)
          const delay = Math.pow(2, attempt) * 1000;
          if (currentBookIdRef.current === bookId) {
            setTranslatedPages(prev => ({ ...prev, [pageNum]: `Rate limit exceeded. Retrying in ${delay/1000}s...` }));
          }
          await new Promise(resolve => setTimeout(resolve, delay));
          if (currentBookIdRef.current === bookId) {
            setTranslatedPages(prev => ({ ...prev, [pageNum]: '' })); // Clear message before retry
          }
        }
      }

      if (success) {
        // Save to localforage after complete
        const finalPages = await localforage.getItem<Record<number, string>>(`book_${bookId}_pages`) || {};
        finalPages[pageNum] = fullText;
        await localforage.setItem(`book_${bookId}_pages`, finalPages);
        
        // Update downloaded pages count in library
        setLibrary(prev => prev.map(b => b.id === bookId ? { ...b, downloadedPages: Object.keys(finalPages).length } : b));
      }
    } catch (error: any) {
      const errorString = typeof error === 'string' ? error : (error?.message || '') + ' ' + JSON.stringify(error, Object.getOwnPropertyNames(error));
      if (currentBookIdRef.current === bookId) {
        if (errorString.toLowerCase().includes('quota') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('429')) {
          setTranslatedPages(prev => ({ ...prev, [pageNum]: "API Quota Exceeded. Please wait a while before translating more pages, or check your Gemini API plan and billing details." }));
        } else {
          console.error("Translation error:", error);
          setTranslatedPages(prev => ({ ...prev, [pageNum]: "Translation failed. Please try again." }));
        }
      }
    } finally {
      translatingPagesRef.current.delete(pageNum);
      setIsTranslating(translatingPagesRef.current.size > 0);
    }
    
    return 'started';
  };

  const goToPage = async (newPg: number) => {
    if (!currentBook) return;
    if (newPg >= 1 && newPg <= currentBook.totalPages) {
      setCurrentPage(newPg);
      
      // Update last read position
      const updatedBook = { ...currentBook, lastReadPage: newPg };
      setCurrentBook(updatedBook);
      const newLibrary = library.map(b => b.id === updatedBook.id ? updatedBook : b);
      await saveLibrary(newLibrary);

      translatePage(pdfDoc, currentBook.id, newPg);
      
      if (pageLayout === 'facing' && newPg + 1 <= currentBook.totalPages) {
        translatePage(pdfDoc, currentBook.id, newPg + 1);
      }
      
      // Pre-fetch next 2 pages (Lazy Loading optimization)
      if (!isOffline) {
        const startPrefetch = pageLayout === 'facing' ? newPg + 2 : newPg + 1;
        for (let i = 0; i < 2; i++) {
          const fetchPage = startPrefetch + i;
          if (fetchPage <= currentBook.totalPages && translatedPages[fetchPage] === undefined) {
            setTimeout(() => {
              translatePage(pdfDoc, currentBook.id, fetchPage);
            }, i * 2000); // Stagger prefetch requests by 2 seconds
          }
        }
      }
    }
  };

  const downloadTranslatedBook = () => {
    if (!currentBook) return;
    
    let content = `# ${currentBook.title}\n\n`;
    let translatedCount = 0;

    for (let i = 1; i <= currentBook.totalPages; i++) {
      if (translatedPages[i]) {
        content += `## Page ${i}\n\n${translatedPages[i]}\n\n`;
        translatedCount++;
      } else {
        content += `## Page ${i}\n\n*[Not translated yet]*\n\n`;
      }
    }

    if (translatedCount < currentBook.totalPages) {
      setDownloadConfirm({ count: translatedCount, total: currentBook.totalPages });
      return;
    }

    executeDownload(content);
  };

  const executeDownload = (content: string) => {
    if (!currentBook) return;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentBook.title}_Bengali.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadConfirm(null);
  };

  const downloadBookForOffline = async (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    if (isOffline) {
      showToast("You must be online to download books.");
      return;
    }
    
    if (downloadingBooks[book.id]) {
      showToast("Book is already downloading.");
      return;
    }

    try {
      const currentPages = await localforage.getItem<Record<number, string>>(`book_${book.id}_pages`) || {};
      const untranslatedPages = [];
      for (let i = 1; i <= book.totalPages; i++) {
        if (!currentPages[i]) untranslatedPages.push(i);
      }
      
      if (untranslatedPages.length === 0) {
        showToast("Book is already fully downloaded.");
        return;
      }

      setDownloadingBooks(prev => ({
        ...prev,
        [book.id]: { total: untranslatedPages.length, current: 0 }
      }));

      const pdfData = await localforage.getItem<ArrayBuffer>(`book_${book.id}_pdf`);
      if (!pdfData) throw new Error("PDF not found");
      
      const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
      const pdf = await loadingTask.promise;

      // Start background translation
      for (const pageNum of untranslatedPages) {
        if (!navigator.onLine) {
          showToast("Download paused. You are offline.");
          setDownloadingBooks(prev => {
            const newObj = { ...prev };
            delete newObj[book.id];
            return newObj;
          });
          break;
        }
        
        // Fetch latest pages to avoid re-translating if user scrolled to it
        const latestPages = await localforage.getItem<Record<number, string>>(`book_${book.id}_pages`) || {};
        const status = await translatePage(pdf, book.id, pageNum, latestPages);
        
        // Increment progress for all cases
        setDownloadingBooks(prev => {
          if (!prev[book.id]) return prev;
          const current = prev[book.id].current + 1;
          if (current >= prev[book.id].total) {
            const newObj = { ...prev };
            delete newObj[book.id];
            return newObj;
          }
          return { ...prev, [book.id]: { ...prev[book.id], current } };
        });
        
        if (status === 'started') {
          await new Promise(resolve => setTimeout(resolve, 500)); // Delay to avoid rate limits
        }
      }
    } catch (error) {
      console.error("Failed to download book", error);
      showToast("Failed to download book.");
      setDownloadingBooks(prev => {
        const newObj = { ...prev };
        delete newObj[book.id];
        return newObj;
      });
    }
  };

  const handleShare = async (type: 'page' | 'book') => {
    if (!currentBook) return;
    
    let textToShare = '';
    let shareTitle = currentBook.title;

    if (type === 'page') {
      textToShare = translatedPages[currentPage] || '';
      shareTitle = `${currentBook.title} - Page ${currentPage}`;
      if (!textToShare) {
        showToast('This page has not been translated yet.');
        return;
      }
    } else {
      const pages = Object.entries(translatedPages)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([pageNum, text]) => `## Page ${pageNum}\n\n${text}`)
        .join('\n\n---\n\n');
      textToShare = pages;
      if (!textToShare) {
        showToast('No translated pages available to share.');
        return;
      }
    }

    const shareData = {
      title: shareTitle,
      text: textToShare,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(textToShare);
        showToast('Copied to clipboard! (Share API not supported)');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error sharing:', err);
        try {
          await navigator.clipboard.writeText(textToShare);
          showToast('Copied to clipboard!');
        } catch (clipboardErr) {
          showToast('Failed to share or copy to clipboard.');
        }
      }
    }
    setShowShareMenu(false);
  };

  const renderTranslation = (pageNum: number) => {
    if (translatedPages[pageNum] !== undefined) {
      return (
        <div className="markdown-body relative">
          <ReactMarkdown>{translatedPages[pageNum] || '*Translating...*'}</ReactMarkdown>
          {translatedPages[pageNum] === '' && isTranslating && (
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}
        </div>
      );
    }
    
    if (currentBook && offlineQueue[currentBook.id]?.includes(pageNum)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-80 text-center bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50 p-6">
          <WifiOff className="w-10 h-10 text-amber-500 mb-2" />
          <h3 className="text-xl font-bold text-amber-700 dark:text-amber-400">Queued for Translation</h3>
          <p className="max-w-md text-amber-600 dark:text-amber-500">
            You are currently offline. This page has been queued and will be translated automatically in the background as soon as your internet connection is restored.
          </p>
        </div>
      );
    }

    if (isTranslating) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 opacity-60">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="animate-pulse">Translating page {pageNum}...</p>
        </div>
      );
    }
    if (isOffline) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-80 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <WifiOff className="w-10 h-10 mb-2 text-gray-400" />
          <h3 className="text-xl font-bold">Content Unavailable</h3>
          <p className="max-w-md text-gray-500 dark:text-gray-400">
            Page {pageNum} is not available offline. Please connect to the internet to translate this page.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 opacity-60">
        <p>Failed to load page {pageNum}.</p>
        <button onClick={() => translatePage(pdfDoc, currentBook!.id, pageNum)} className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm">
          Retry
        </button>
      </div>
    );
  };

  const themeStyles = {
    light: 'bg-gray-50 text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    sepia: 'bg-[#e8dcc4] text-[#5b4636]',
    novel: 'bg-[#eee8d5] text-[#4a4a4a]'
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${themeStyles[theme]}`}>
      {/* Header */}
      <header className="p-4 border-b border-opacity-20 border-current flex justify-between items-center sticky top-0 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('dashboard')}>
          <BookOpen className="w-6 h-6" />
          <h1 className="text-xl font-bold font-serif hidden sm:block">Bangla Reader</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {isOffline && (
            <div className="flex items-center gap-1 text-sm text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 rounded-full">
              <WifiOff className="w-4 h-4" />
              <span className="hidden sm:inline">Offline Mode</span>
            </div>
          )}

          {view === 'reader' && (
            <button onClick={() => setView('dashboard')} className="flex items-center gap-1 px-3 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              <Library className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </button>
          )}

          <div className="flex bg-black/5 dark:bg-white/10 rounded-full p-1">
            <button onClick={() => setTheme('light')} className={`p-2 rounded-full ${theme === 'light' ? 'bg-white text-black shadow-sm' : ''}`} title="Light Mode"><Sun className="w-4 h-4" /></button>
            <button onClick={() => setTheme('dark')} className={`p-2 rounded-full ${theme === 'dark' ? 'bg-gray-800 text-white shadow-sm' : ''}`} title="Dark Mode"><Moon className="w-4 h-4" /></button>
            <button onClick={() => setTheme('sepia')} className={`p-2 rounded-full ${theme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636] shadow-sm' : ''}`} title="Sepia Mode"><BookOpen className="w-4 h-4" /></button>
            <button onClick={() => setTheme('novel')} className={`p-2 rounded-full ${theme === 'novel' ? 'bg-[#fdf6e3] text-[#4a4a4a] shadow-sm' : ''}`} title="Novel Mode"><Book className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8" onMouseUp={handleMouseUp}>
        {view === 'dashboard' ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-bold font-serif mb-2">Your Library</h2>
                <p className="opacity-70">Read and translate English PDFs to Bengali.</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={startCamera}
                  disabled={isOffline}
                  className={`flex items-center gap-2 px-4 py-2.5 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-full hover:bg-gray-700 dark:hover:bg-white transition-colors shadow-md ${isOffline ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Camera className="w-5 h-5" />
                  <span className="font-medium hidden sm:inline">Camera</span>
                </button>
                <label className={`cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-md ${isOffline ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <Upload className="w-5 h-5" />
                  <span className="font-medium">New Book</span>
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={isOffline} />
                </label>
              </div>
            </div>

            {library.length === 0 ? (
              <div className="text-center py-24 border-2 border-dashed border-current border-opacity-20 rounded-2xl">
                <Library className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg opacity-60">Your library is empty.</p>
                <p className="text-sm opacity-40 mt-2">Upload a PDF to start reading.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {library.map(book => (
                  <div 
                    key={book.id} 
                    onClick={() => openBookFromLibrary(book)}
                    className="group relative p-6 rounded-2xl border border-current border-opacity-10 hover:border-opacity-30 hover:shadow-lg transition-all cursor-pointer bg-black/5 dark:bg-white/5"
                  >
                    <button 
                      onClick={(e) => requestDeleteBook(e, book.id)}
                      className="absolute top-4 right-4 p-2 rounded-full bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-12 h-16 bg-blue-600/20 rounded flex items-center justify-center mb-4">
                      <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="font-bold text-lg mb-1 line-clamp-2">{book.title}</h3>
                    <div className="flex justify-between items-center text-sm opacity-60 mt-4">
                      <span>Page {book.lastReadPage} / {book.totalPages}</span>
                      <span>{Math.round((book.lastReadPage / book.totalPages) * 100)}%</span>
                    </div>
                    <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full rounded-full" 
                        style={{ width: `${(book.lastReadPage / book.totalPages) * 100}%` }}
                      />
                    </div>
                    
                    {/* Offline Download Status */}
                    <div className="mt-4 flex items-center justify-between border-t border-current border-opacity-10 pt-3">
                      {downloadingBooks[book.id] ? (
                        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 w-full">
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          <div className="flex-1 bg-blue-100 dark:bg-blue-900/30 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${(downloadingBooks[book.id].current / downloadingBooks[book.id].total) * 100}%` }}
                            />
                          </div>
                          <span className="shrink-0">{Math.round((downloadingBooks[book.id].current / downloadingBooks[book.id].total) * 100)}%</span>
                        </div>
                      ) : book.downloadedPages === book.totalPages ? (
                        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle className="w-4 h-4" />
                          <span>Available Offline</span>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => downloadBookForOffline(e, book)}
                          className="flex items-center gap-1.5 text-xs opacity-60 hover:opacity-100 hover:text-blue-600 transition-colors"
                        >
                          <CloudDownload className="w-4 h-4" />
                          <span>Download for Offline</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="relative animate-in fade-in duration-500">
            {/* Reader Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4 opacity-100 sm:opacity-70 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                <button onClick={() => setView('dashboard')} className="flex items-center gap-1 hover:underline py-2 shrink-0">
                  <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Library</span>
                </button>
                <span className="font-medium truncate flex-1 sm:hidden text-right text-sm">{currentBook?.title}</span>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 no-scrollbar justify-start sm:justify-end">
                <span className="font-medium truncate max-w-[200px] sm:max-w-xs hidden sm:block">{currentBook?.title}</span>
                <div className="flex items-center gap-1 border border-current border-opacity-20 rounded-lg p-1 shrink-0">
                  <div className="relative">
                    <button onClick={() => setShowShareMenu(!showShareMenu)} className={`p-2 sm:px-3 sm:py-1 hover:bg-black/5 dark:hover:bg-white/10 rounded flex items-center gap-1 ${showShareMenu ? 'bg-black/5 dark:bg-white/10' : ''}`} title="Share">
                      <Share2 className="w-4 h-4" />
                    </button>
                    {showShareMenu && (
                      <div className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 shadow-xl rounded-xl p-2 border border-gray-200 dark:border-gray-700 z-50 w-48 text-gray-900 dark:text-gray-100 flex flex-col gap-1">
                        <button onClick={() => handleShare('page')} className="text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 rounded">
                          Share Current Page
                        </button>
                        <button onClick={() => handleShare('book')} className="text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10 rounded">
                          Share Full Book
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={downloadTranslatedBook} className="p-2 sm:px-3 sm:py-1 hover:bg-black/5 dark:hover:bg-white/10 rounded flex items-center gap-1" title="Download Translated Book">
                    <Download className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-current opacity-20 mx-1"></div>
                  <button onClick={() => setFontSize(f => Math.max(14, f - 2))} className="p-2 sm:px-3 sm:py-1 hover:bg-black/5 dark:hover:bg-white/10 rounded font-medium">-A</button>
                  <button onClick={() => setFontSize(f => Math.min(32, f + 2))} className="p-2 sm:px-3 sm:py-1 hover:bg-black/5 dark:hover:bg-white/10 rounded font-medium">+A</button>
                  <div className="w-px h-4 bg-current opacity-20 mx-1"></div>
                  <div className="relative">
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded ${showSettings ? 'bg-black/5 dark:bg-white/10' : ''}`} title="Settings">
                      <Settings className="w-4 h-4" />
                    </button>
                    {showSettings && (
                      <div className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 shadow-xl rounded-xl p-4 border border-gray-200 dark:border-gray-700 z-50 w-[85vw] max-w-[16rem] sm:w-64 text-gray-900 dark:text-gray-100">
                        <h3 className="font-bold mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Reader Settings</h3>
                        
                        <div className="mb-4">
                          <label className="text-xs font-bold uppercase opacity-50 block mb-2">View Mode</label>
                          <div className="flex bg-gray-100 dark:bg-gray-900 rounded p-1">
                            <button onClick={() => setViewMode('translation')} className={`flex-1 py-1 text-sm rounded ${viewMode === 'translation' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>Text</button>
                            <button onClick={() => setViewMode('pdf')} className={`flex-1 py-1 text-sm rounded ${viewMode === 'pdf' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>PDF</button>
                            <button onClick={() => setViewMode('split')} className={`flex-1 py-1 text-sm rounded ${viewMode === 'split' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>Split</button>
                          </div>
                        </div>

                        <div className="mb-4">
                          <label className="text-xs font-bold uppercase opacity-50 block mb-2">Page Layout</label>
                          <div className="flex bg-gray-100 dark:bg-gray-900 rounded p-1">
                            <button onClick={() => { setPageLayout('single'); goToPage(currentPage); }} className={`flex-1 py-1 text-sm rounded ${pageLayout === 'single' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>Single</button>
                            <button onClick={() => { setPageLayout('facing'); goToPage(currentPage); }} className={`flex-1 py-1 text-sm rounded ${pageLayout === 'facing' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>Facing</button>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-bold uppercase opacity-50 block mb-2">PDF Zoom</label>
                          <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-900 rounded p-1">
                            <button onClick={() => setPdfZoom(z => Math.max(0.5, z - 0.25))} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded"><ZoomOut className="w-4 h-4"/></button>
                            <span className="text-sm font-mono">{Math.round(pdfZoom * 100)}%</span>
                            <button onClick={() => setPdfZoom(z => Math.min(3.0, z + 0.25))} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded"><ZoomIn className="w-4 h-4"/></button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={(e) => currentBook && requestDeleteBook(e, currentBook.id)} className="p-2 hover:bg-red-500/10 text-red-500 rounded transition-colors" title="Delete Book">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className={`flex ${viewMode === 'split' ? 'flex-col lg:flex-row gap-8' : 'justify-center'} min-h-[50vh]`}>
              
              {/* PDF View */}
              {(viewMode === 'pdf' || viewMode === 'split') && (
                <div className={`flex-1 flex justify-center overflow-auto bg-black/5 dark:bg-white/5 p-4 rounded-xl ${pageLayout === 'facing' ? 'gap-4' : ''} ${viewMode === 'split' ? 'max-h-[70vh]' : ''}`}>
                  <PdfPage pdfDoc={pdfDoc} pageNum={currentPage} zoom={pdfZoom} />
                  {pageLayout === 'facing' && currentPage < (currentBook?.totalPages || 1) && (
                    <PdfPage pdfDoc={pdfDoc} pageNum={currentPage + 1} zoom={pdfZoom} />
                  )}
                </div>
              )}

              {/* Translation View */}
              {(viewMode === 'translation' || viewMode === 'split') && (
                <div 
                  className={`flex-1 prose prose-lg max-w-none font-serif leading-relaxed ${viewMode === 'split' ? 'lg:max-w-[50%] overflow-y-auto max-h-[70vh] p-0 sm:p-4' : ''}`}
                  style={{ fontSize: `${fontSize}px` }}
                >
                  <div className={`p-4 sm:p-8 md:p-12 min-h-[60vh] rounded-sm shadow-md border transition-colors duration-300 ${
                    theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-200' :
                    theme === 'sepia' ? 'bg-[#f4ecd8] border-[#e8dcc4] text-[#5b4636]' :
                    theme === 'novel' ? 'bg-[#fdf6e3] border-[#eee8d5] text-[#4a4a4a]' :
                    'bg-[#fdfbf7] border-gray-200 text-gray-800' // Real novel page color
                  }`}>
                    {renderTranslation(currentPage)}
                    
                    {pageLayout === 'facing' && currentPage < (currentBook?.totalPages || 1) && (
                      <>
                        <div className="my-12 border-b-2 border-dashed border-current opacity-20"></div>
                        {renderTranslation(currentPage + 1)}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-8 sm:mt-16 pt-4 sm:pt-8 border-t border-opacity-20 border-current sticky bottom-0 sm:bottom-4 bg-inherit backdrop-blur-md p-3 sm:p-4 rounded-t-2xl sm:rounded-2xl shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.1)] sm:shadow-sm z-20">
              <button 
                onClick={() => goToPage(Math.max(1, currentPage - (pageLayout === 'facing' ? 2 : 1)))}
                disabled={currentPage <= 1 || isTranslating}
                className="flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors shrink-0"
              >
                <ChevronLeft className="w-6 h-6 sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Previous</span>
              </button>
              
              <div className="flex flex-col items-center gap-1 sm:gap-2 w-full max-w-[160px] sm:max-w-md mx-2 sm:mx-4">
                <input 
                  type="range" 
                  min={1} 
                  max={currentBook?.totalPages || 1} 
                  value={currentPage}
                  onChange={(e) => goToPage(parseInt(e.target.value))}
                  className="w-full h-1.5 sm:h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600 dark:accent-blue-400"
                  title={`Page ${currentPage} of ${currentBook?.totalPages || 1}`}
                />
                <div className="flex items-center gap-1 sm:gap-2 font-mono text-xs sm:text-sm opacity-80">
                  <input 
                    type="number" 
                    value={currentPage}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) goToPage(val);
                    }}
                    className="w-12 sm:w-16 text-center bg-transparent border-b border-current border-opacity-30 focus:outline-none focus:border-opacity-100"
                    min={1}
                    max={currentBook?.totalPages || 1}
                  />
                  {pageLayout === 'facing' && currentPage < (currentBook?.totalPages || 1) && (
                    <span>- {currentPage + 1}</span>
                  )}
                  <span>/ {currentBook?.totalPages || 1}</span>
                </div>
              </div>

              <button 
                onClick={() => goToPage(Math.min(currentBook?.totalPages || 1, currentPage + (pageLayout === 'facing' ? 2 : 1)))}
                disabled={currentPage >= (currentBook?.totalPages || 1) || isTranslating}
                className="flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors shrink-0"
              >
                <span className="hidden sm:inline">Next</span> <ChevronRight className="w-6 h-6 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Translation Popup */}
        {selection && (
          <div 
            className="translation-popup fixed z-[100] bg-white dark:bg-gray-800 shadow-2xl rounded-xl border border-gray-200 dark:border-gray-700 p-3 max-w-xs transform -translate-x-1/2 -translate-y-full mt-[-10px] animate-in fade-in zoom-in-95 duration-200"
            style={{ left: selection.x, top: selection.y }}
          >
            {!selectionTranslation && !isTranslatingSelection ? (
              <button onClick={translateSelectedText} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1.5">
                <Languages className="w-4 h-4" /> Translate with Google
              </button>
            ) : isTranslatingSelection ? (
              <div className="flex items-center gap-2 text-sm opacity-70">
                <Loader2 className="w-4 h-4 animate-spin" /> Translating...
              </div>
            ) : (
              <div className="text-sm">
                <div className="flex items-center gap-1.5 mb-1.5 opacity-60">
                  <Languages className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Google Translate</span>
                </div>
                <p className="text-gray-900 dark:text-gray-100">{selectionTranslation}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {bookToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">Delete Book</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete this book? This action cannot be undone and will remove all translated pages.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setBookToDelete(null)}
                className="px-4 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteBook}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors font-medium shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Confirmation Modal */}
      {downloadConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">Incomplete Translation</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Only {downloadConfirm.count} out of {downloadConfirm.total} pages have been translated. Download anyway?
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDownloadConfirm(null)}
                className="px-4 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!currentBook) return;
                  let content = `# ${currentBook.title}\n\n`;
                  for (let i = 1; i <= currentBook.totalPages; i++) {
                    if (translatedPages[i]) {
                      content += `## Page ${i}\n\n${translatedPages[i]}\n\n`;
                    } else {
                      content += `## Page ${i}\n\n*[Not translated yet]*\n\n`;
                    }
                  }
                  executeDownload(content);
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors font-medium shadow-sm"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
            <h3 className="text-white font-medium">Capture Image</h3>
            <button onClick={stopCamera} className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white backdrop-blur-sm transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            
            {/* Capture Guide */}
            <div className="absolute inset-0 border-4 border-white/20 m-8 rounded-xl pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white -mt-1 -ml-1 rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white -mt-1 -mr-1 rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white -mb-1 -ml-1 rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white -mb-1 -mr-1 rounded-br-xl"></div>
            </div>
          </div>
          
          <div className="h-32 bg-black flex items-center justify-center pb-8">
            <button 
              onClick={captureAndTranslate}
              disabled={isCapturing}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-50"
            >
              {isCapturing ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : (
                <div className="w-16 h-16 bg-white rounded-full hover:bg-gray-200 transition-colors"></div>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-full shadow-xl font-medium text-sm">
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

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
import { 
  Upload, Moon, Sun, BookOpen, ChevronLeft, ChevronRight, Loader2, Library, 
  Trash2, WifiOff, ArrowLeft, Download, Settings, ZoomIn, ZoomOut, Share2, 
  Book, CloudDownload, CheckCircle, Languages, Camera, X, BookText, Search, 
  LogIn, LogOut, User as UserIcon, Wifi, FileText
} from 'lucide-react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { AuthModal } from './components/AuthModal';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const PdfPage = ({ pdfDoc, pageNum, zoom, onVisible }: { pdfDoc: pdfjsLib.PDFDocumentProxy | null, pageNum: number, zoom: number, onVisible?: (pageNum: number) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (onVisible) onVisible(pageNum);
          }
        });
      },
      { rootMargin: '1000px 0px', threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [pageNum, onVisible]);

  useEffect(() => {
    setHasRendered(false);
  }, [zoom, pdfDoc, pageNum]);

  useEffect(() => {
    if (!isVisible || !pdfDoc || !canvasRef.current || hasRendered) return;
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
            setHasRendered(true);
          }
          return;
        }
      }
      
      // Fallback for browsers that don't support OffscreenCanvas
      renderTask = page.render({ canvasContext: context, canvas, viewport });
      await renderTask.promise;
      if (!isCancelled) setHasRendered(true);
    }).catch(err => {
      if (err.name !== 'RenderingCancelledException') console.error(err);
    });

    return () => {
      isCancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, pageNum, zoom, isVisible, hasRendered]);

  return (
    <div ref={containerRef} className="w-full flex justify-center mb-8 transition-opacity duration-500" style={{ minHeight: isVisible ? 'auto' : '400px', opacity: isVisible ? 1 : 0.5 }}>
      <canvas ref={canvasRef} className="max-w-full h-auto shadow-2xl bg-white rounded-xl" />
    </div>
  );
};

const TranslationPage = ({ 
  pageNum, 
  content, 
  isTranslating, 
  onVisible,
  onRetry
}: { 
  pageNum: number, 
  content: string | undefined, 
  isTranslating: boolean, 
  onVisible?: (pageNum: number) => void,
  onRetry?: (pageNum: number) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (onVisible) onVisible(pageNum);
          }
        });
      },
      { rootMargin: '1000px 0px', threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [pageNum, onVisible]);

  return (
    <div ref={containerRef} className="transition-opacity duration-500" style={{ minHeight: '200px', opacity: isVisible ? 1 : 0.5 }}>
      {isVisible ? (
        isTranslating ? (
          <div className="flex flex-col items-center justify-center p-12 opacity-50">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="font-sans text-sm tracking-widest uppercase">Translating Page {pageNum}...</p>
          </div>
        ) : content ? (
          <div className="markdown-body">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 opacity-50">
            <p className="font-sans text-sm tracking-widest uppercase mb-4">Page {pageNum} not translated</p>
            {onRetry && (
              <button onClick={() => onRetry(pageNum)} className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm hover:bg-blue-700 transition-colors">
                Retry Translation
              </button>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center p-12 opacity-30">
          <p className="font-sans text-sm tracking-widest uppercase">Loading Page {pageNum}...</p>
        </div>
      )}
    </div>
  );
};

type Theme = 'light' | 'dark' | 'sepia' | 'novel';
type View = 'dashboard' | 'reader' | 'wordLibrary' | 'translate';

interface Book {
  id: string;
  title: string;
  totalPages: number;
  lastReadPage: number;
  addedAt: number;
  downloadedPages?: number;
}

export default function App() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Create or update user profile in Firestore
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            const userData: any = {
              uid: currentUser.uid,
              createdAt: Date.now()
            };
            if (currentUser.email) userData.email = currentUser.email;
            if (currentUser.phoneNumber) userData.phoneNumber = currentUser.phoneNumber;
            
            await setDoc(userRef, userData);
          }
        } catch (error) {
          console.error("Error creating user profile:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

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
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraProcessingStep, setCameraProcessingStep] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Word Library State
  const [savedWords, setSavedWords] = useState<Record<string, string>>({});
  const [wordSearchQuery, setWordSearchQuery] = useState("");
  const [searchTranslation, setSearchTranslation] = useState<string | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<{english: string, bengali: string, isCorrection?: boolean}[]>([]);
  const [isSearchingTranslation, setIsSearchingTranslation] = useState(false);
  
  // Translate View State
  const [translateInputText, setTranslateInputText] = useState("");
  const [translateOutputText, setTranslateOutputText] = useState("");
  const [isTranslatingText, setIsTranslatingText] = useState(false);
  
  // Offline & Download State
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
  const [forceOffline, setForceOffline] = useState<boolean>(false);
  const effectiveIsOffline = isOffline || forceOffline;

  // Advanced Reader Settings
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showShareMenu, setShowShareMenu] = useState<boolean>(false);
  const [showReaderUI, setShowReaderUI] = useState<boolean>(true);
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
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && view === 'reader') {
        setShowReaderUI(true);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [view]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (!forceOffline) {
        showToast("Back online! Processing queued translations...");
      }
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast("You are offline. Translations will be queued.");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    loadLibrary();
    loadSavedWords();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  useEffect(() => {
    const translateSearch = async () => {
      const query = wordSearchQuery.trim();
      if (!query) {
        setSearchTranslation(null);
        setSearchSuggestions([]);
        setIsSearchingTranslation(false);
        return;
      }
      
      setIsSearchingTranslation(true);
      
      try {
        const { getFromMemory, translateTextOffline, getSuggestionsFromMemory } = await import('./lib/translationMemory');
        
        // Fetch suggestions for the prefix
        const suggestions = await getSuggestionsFromMemory(query, 5);
        setSearchSuggestions(suggestions);
        
        // Check exact match in dictionary first
        let result = await getFromMemory(query);
        
        // If not found and it's a short phrase, try offline translation logic
        if (!result && query.split(' ').length <= 3) {
           result = await translateTextOffline(query);
           // If it just returns the same english word, it means it couldn't translate
           if (result.toLowerCase() === query.toLowerCase()) {
             result = null;
           }
        }
        
        // If still not found and online, try Gemini
        if (!result && !isOffline) {
          try {
            const response = await aiRef.current.models.generateContent({
              model: 'gemini-3.1-pro-preview',
              contents: `Translate the following English text to natural, highly accurate Bengali. Output ONLY the translated text without any introductory or concluding remarks.\n\n${query}`,
              config: {
                systemInstruction: "You are an expert English to Bengali translator. Translate the text into natural, grammatically correct Bengali. Output ONLY the translated text.",
                temperature: 0.3,
              }
            });
            result = response.text || null;
          } catch (error: any) {
            const errorString = typeof error === 'string' ? error : (error?.message || '') + ' ' + JSON.stringify(error, Object.getOwnPropertyNames(error));
            if (errorString.toLowerCase().includes('quota') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('429')) {
               result = "API Quota Exceeded. Not found in offline dictionary.";
            } else {
               console.error("Online search translation failed", error);
               result = "Translation failed.";
            }
          }
        } else if (!result && isOffline) {
          result = "Not found in offline dictionary.";
        }
        
        setSearchTranslation(result);
      } catch (e) {
        console.error("Search translation failed", e);
        setSearchTranslation(null);
        setSearchSuggestions([]);
      } finally {
        setIsSearchingTranslation(false);
      }
    };

    const timer = setTimeout(translateSearch, 500);
    return () => clearTimeout(timer);
  }, [wordSearchQuery, isOffline]);

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

  const loadSavedWords = async () => {
    try {
      const { getAllSavedWords } = await import('./lib/translationMemory');
      const words = await getAllSavedWords();
      setSavedWords(words);
    } catch (e) {
      console.error("Failed to load saved words", e);
    }
  };

  const deleteSavedWord = async (word: string) => {
    try {
      const { deleteFromMemory } = await import('./lib/translationMemory');
      await deleteFromMemory(word);
      setSavedWords(prev => {
        const newWords = { ...prev };
        delete newWords[word];
        return newWords;
      });
    } catch (e) {
      console.error("Failed to delete word", e);
    }
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
    setCapturedImage(null);
    setCameraProcessingStep("");
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

  const stopCameraTracks = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const stopCamera = () => {
    stopCameraTracks();
    setShowCamera(false);
    setCapturedImage(null);
    setCameraProcessingStep("");
  };

  const handleCaptureClick = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
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

    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(base64Image);
    stopCameraTracks();
  };

  const processCapturedImage = async () => {
    if (!capturedImage) return;
    
    setIsCapturing(true);
    setCameraProcessingStep("Preparing image...");

    try {
      const base64Image = capturedImage;
      
      // We need width and height for PDF generation
      const img = new Image();
      img.src = base64Image;
      await new Promise(resolve => { img.onload = resolve; });

      setCameraProcessingStep("Generating document...");
      // 1. Generate PDF using jsPDF
      const pdf = new jsPDF({
        orientation: img.width > img.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [img.width, img.height]
      });
      pdf.addImage(base64Image, 'JPEG', 0, 0, img.width, img.height);
      const pdfArrayBuffer = pdf.output('arraybuffer');

      // 2. Save as a new book with empty translation (indicates translating)
      const newBook: Book = {
        id: Date.now().toString(),
        title: `Camera Capture - ${new Date().toLocaleDateString()}`,
        totalPages: 1,
        lastReadPage: 1,
        addedAt: Date.now(),
        downloadedPages: 1
      };

      const initialPages = { 1: "" }; // Empty string means "translating"
      await localforage.setItem(`book_${newBook.id}_pdf`, pdfArrayBuffer);
      await localforage.setItem(`book_${newBook.id}_pages`, initialPages);
      await saveLibrary([...library, newBook]);

      // 3. Open the new book immediately
      const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer.slice(0) });
      const pdfDocProxy = await loadingTask.promise;
      openBook(newBook, pdfDocProxy, initialPages);
      
      stopCamera(); // Close modal on success
      setIsCapturing(false); // Stop loading spinner in camera modal
      setCameraProcessingStep("");

      // 4. Translate image in background
      let translatedText = "";

      const doOfflineOCRAndTranslate = async (isFallback = false) => {
        try {
          const Tesseract = await import('tesseract.js');
          const { data: { text } } = await Tesseract.recognize(base64Image, 'eng');
          
          if (text.trim()) {
             const { translateTextOffline } = await import('./lib/translationMemory');
             const offlineTranslated = await translateTextOffline(text);
             const prefix = isFallback ? '*API Quota Exceeded. Using Fast Offline Logic:*\n\n' : '*Offline Translation:*\n\n';
             translatedText = `${prefix}${offlineTranslated}`;
          } else {
             translatedText = "*No text found in image.*";
          }
        } catch (e) {
          console.error("Offline OCR failed", e);
          translatedText = "*Offline text extraction failed.*";
        }
      };

      if (isOffline) {
        await doOfflineOCRAndTranslate();
      } else {
        try {
          const response = await aiRef.current.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [
              {
                inlineData: {
                  data: base64Image.split(',')[1],
                  mimeType: 'image/jpeg'
                }
              },
              "Translate the text in this image to natural, highly accurate Bengali. Ensure the grammar and vocabulary are appropriate for a native speaker. Keep the formatting as best as you can. Output ONLY the translated text without any introductory or concluding remarks."
            ],
            config: {
              temperature: 0.3,
            }
          });

          translatedText = response.text || "*No text found in image.*";
        } catch (error: any) {
          const errorString = typeof error === 'string' ? error : (error?.message || '') + ' ' + JSON.stringify(error, Object.getOwnPropertyNames(error));
          if (errorString.toLowerCase().includes('quota') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('429')) {
            showToast("API Quota Exceeded. Falling back to offline translation...");
            await doOfflineOCRAndTranslate(true);
          } else {
            console.error("Gemini Vision error:", error);
            translatedText = "*Failed to translate image.*";
          }
        }
      }

      // 5. Update the book with the translated text
      const finalPages = { 1: translatedText };
      await localforage.setItem(`book_${newBook.id}_pages`, finalPages);
      
      // If the user is still reading this book, update the state
      if (currentBookIdRef.current === newBook.id) {
        setTranslatedPages(finalPages);
      }

    } catch (error: any) {
      console.error("Error capturing and translating:", error);
      showToast("Failed to process image.");
      setIsCapturing(false);
      setCameraProcessingStep("");
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
    showToast("Tap anywhere to toggle fullscreen reading mode");
    
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
    
    if (isOffline) {
      try {
        const { translateTextOffline, saveToMemory } = await import('./lib/translationMemory');
        const translatedText = await translateTextOffline(selection.text);
        setSelectionTranslation(translatedText || "Offline translation not found.");
        
        if (translatedText && selection.text.split(' ').length <= 3) {
          await saveToMemory(selection.text, translatedText);
          setSavedWords(prev => ({ ...prev, [selection.text.toLowerCase().trim()]: translatedText.trim() }));
        }
      } catch (error) {
        console.error("Offline translation error:", error);
        setSelectionTranslation("Offline translation failed.");
      } finally {
        setIsTranslatingSelection(false);
      }
      return;
    }

    try {
      const response = await aiRef.current.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Translate the following English text to natural, highly accurate Bengali. Output ONLY the translated text without any introductory or concluding remarks.\n\n${selection.text}`,
        config: {
          systemInstruction: "You are an expert English to Bengali translator. Translate the text into natural, grammatically correct Bengali. Output ONLY the translated text.",
          temperature: 0.3,
        }
      });
      const translatedText = response.text || "Translation failed.";
      setSelectionTranslation(translatedText);
      
      // Save to memory if it's a single word or short phrase
      if (translatedText !== "Translation failed." && selection.text.split(' ').length <= 3) {
        const { saveToMemory } = await import('./lib/translationMemory');
        await saveToMemory(selection.text, translatedText);
        setSavedWords(prev => ({ ...prev, [selection.text.toLowerCase().trim()]: translatedText.trim() }));
      }
    } catch (error: any) {
      const errorString = typeof error === 'string' ? error : (error?.message || '') + ' ' + JSON.stringify(error, Object.getOwnPropertyNames(error));
      if (errorString.toLowerCase().includes('quota') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('429')) {
        try {
          const { translateTextOffline, saveToMemory } = await import('./lib/translationMemory');
          const translatedText = await translateTextOffline(selection.text);
          setSelectionTranslation(`*API Quota Exceeded. Using Fast Offline Logic:*\n\n${translatedText}` || "Offline translation failed.");
          
          if (translatedText && selection.text.split(' ').length <= 3) {
            await saveToMemory(selection.text, translatedText);
            setSavedWords(prev => ({ ...prev, [selection.text.toLowerCase().trim()]: translatedText.trim() }));
          }
        } catch (offlineError) {
          console.error("Offline fallback translation error:", offlineError);
          setSelectionTranslation("API Quota Exceeded and offline translation failed.");
        }
      } else {
        console.error("Gemini Translate error:", error);
        setSelectionTranslation("Translation failed.");
      }
    } finally {
      setIsTranslatingSelection(false);
    }
  };

  const handleTranslateText = async () => {
    if (!translateInputText.trim()) return;
    
    setIsTranslatingText(true);
    setTranslateOutputText("");

    if (isOffline) {
      try {
        const { translateTextOffline } = await import('./lib/translationMemory');
        const translatedText = await translateTextOffline(translateInputText);
        setTranslateOutputText(translatedText || "Offline translation failed.");
      } catch (error) {
        console.error("Offline translation error:", error);
        setTranslateOutputText("Offline translation failed.");
      } finally {
        setIsTranslatingText(false);
      }
      return;
    }

    try {
      const response = await aiRef.current.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Translate the following English text to natural, highly accurate Bengali. Output ONLY the translated text without any introductory or concluding remarks.\n\n${translateInputText}`,
        config: {
          systemInstruction: "You are an expert English to Bengali translator. Translate the text into natural, grammatically correct Bengali. Output ONLY the translated text.",
          temperature: 0.3,
        }
      });
      setTranslateOutputText(response.text || "Translation failed.");
    } catch (error: any) {
      const errorString = typeof error === 'string' ? error : (error?.message || '') + ' ' + JSON.stringify(error, Object.getOwnPropertyNames(error));
      if (errorString.toLowerCase().includes('quota') || errorString.includes('RESOURCE_EXHAUSTED') || errorString.includes('429')) {
        try {
          const { translateTextOffline } = await import('./lib/translationMemory');
          const translatedText = await translateTextOffline(translateInputText);
          setTranslateOutputText(`*API Quota Exceeded. Using Fast Offline Logic:*\n\n${translatedText}` || "Offline translation failed.");
        } catch (offlineError) {
          console.error("Offline fallback translation error:", offlineError);
          setTranslateOutputText("API Quota Exceeded and offline translation failed.");
        }
      } else {
        console.error("Gemini Translate error:", error);
        setTranslateOutputText("Translation failed. Please try again.");
      }
    } finally {
      setIsTranslatingText(false);
    }
  };

  const translatePage = async (
    pdf: pdfjsLib.PDFDocumentProxy | null, 
    bookId: string, 
    pageNum: number, 
    currentPages: Record<number, string> = translatedPages
  ): Promise<'started' | 'already_translated' | 'already_translating' | 'no_pdf'> => {
    if (currentPages[pageNum] !== undefined) return 'already_translated';
    if (translatingPagesRef.current.has(pageNum)) return 'already_translating';
    if (!pdf) return 'no_pdf';
    
    const doOfflineTranslation = async (textToTranslate: string, isFallback = false) => {
      try {
        console.log("Starting offline translation for text length:", textToTranslate.length);
        const { translateTextOffline } = await import('./lib/translationMemory');
        const offlineTranslated = await translateTextOffline(textToTranslate);
        console.log("Offline translation completed. Result length:", offlineTranslated.length);
        const prefix = isFallback ? '*API Quota Exceeded. Using Fast Offline Logic:*\n\n' : '*Offline Translation:*\n\n';
        const finalOfflineText = `${prefix}${offlineTranslated}`;
        
        if (currentBookIdRef.current === bookId) {
          setTranslatedPages(prev => ({ ...prev, [pageNum]: finalOfflineText }));
        }
        
        // Save the offline translation to memory so it's fully functional offline
        const finalPages = await localforage.getItem<Record<number, string>>(`book_${bookId}_pages`) || {};
        finalPages[pageNum] = finalOfflineText;
        await localforage.setItem(`book_${bookId}_pages`, finalPages);
        setLibrary(prev => prev.map(b => b.id === bookId ? { ...b, downloadedPages: Object.keys(finalPages).length } : b));
      } catch (e) {
        console.error("Offline page translation failed", e);
        if (currentBookIdRef.current === bookId) {
          setTranslatedPages(prev => ({ ...prev, [pageNum]: "Translation failed. Please try again." }));
        }
      }
    };

    translatingPagesRef.current.add(pageNum);
    setIsTranslating(true);
    
    // Set to empty string to indicate translation has started, only if it's the current book
    if (currentBookIdRef.current === bookId) {
      setTranslatedPages(prev => ({ ...prev, [pageNum]: '' }));
    }

    if (effectiveIsOffline) {
      try {
        console.log(`Translating page ${pageNum} offline...`);
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        let text = '';
        let lastY;
        for (const item of textContent.items as any[]) {
          if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 5) {
            text += '\n';
          }
          text += item.str + ' ';
          lastY = item.transform[5];
        }
        
        if (text.trim()) {
          await doOfflineTranslation(text);
        } else {
          const newPages = { ...currentPages, [pageNum]: "*No extractable text on this page.*" };
          if (currentBookIdRef.current === bookId) {
            setTranslatedPages(newPages);
          }
        }
      } catch (e) {
        console.error("Failed to extract text for offline translation", e);
      } finally {
        translatingPagesRef.current.delete(pageNum);
        setIsTranslating(false);
      }

      return 'started';
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
            model: 'gemini-3.1-pro-preview',
            contents: `Translate this English book text to natural, highly accurate Bengali. Keep the Markdown formatting: \n\n ${text}`,
            config: {
              systemInstruction: "You are an expert English to Bengali translator. Translate the following text into natural, grammatically correct, and highly accurate Bengali. Ensure the vocabulary is appropriate for a native speaker and the flow is natural. Preserve all Markdown formatting, line breaks, and document structure. Output ONLY the translated text without any introductory or concluding remarks.",
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
            // Fallback to offline logic
            await doOfflineTranslation(text, true);
            success = true; // Mark as success so it doesn't retry API
            break;
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

      if (success && fullText) {
        // Save to localforage after complete (only if it was an API success, not fallback)
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

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const saveLastReadPageTimeout = useRef<NodeJS.Timeout | null>(null);

  const updateLastReadPage = (pageNum: number) => {
    if (!currentBook) return;
    
    if (saveLastReadPageTimeout.current) {
      clearTimeout(saveLastReadPageTimeout.current);
    }
    
    saveLastReadPageTimeout.current = setTimeout(() => {
      setCurrentBook(prev => {
        if (!prev) return prev;
        const updatedBook = { ...prev, lastReadPage: pageNum };
        const updatedLibrary = library.map(b => b.id === updatedBook.id ? updatedBook : b);
        setLibrary(updatedLibrary);
        saveLibrary(updatedLibrary);
        return updatedBook;
      });
    }, 1000);
  };

  const scrollToPage = (pageNum: number) => {
    const ref = pageRefs.current[pageNum];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePageVisible = (pageNum: number) => {
    setCurrentPage(pageNum);
    
    // Trigger translation if needed
    if (translatedPages[pageNum] === undefined && !translatingPagesRef.current.has(pageNum)) {
      translatePage(pdfDoc, currentBook?.id || '', pageNum);
    }
    
    updateLastReadPage(pageNum);
  };

  const goToPage = async (newPg: number) => {
    if (!currentBook) return;
    if (newPg >= 1 && newPg <= currentBook.totalPages) {
      setCurrentPage(newPg);
      scrollToPage(newPg);
      
      // Update last read position
      updateLastReadPage(newPg);

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



  const themeStyles = {
    light: 'bg-[#F9FAFB] text-[#111827] selection:bg-blue-200 selection:text-blue-900',
    dark: 'bg-[#0F172A] text-[#F8FAFC] selection:bg-blue-900 selection:text-blue-100',
    sepia: 'bg-[#F4ECD8] text-[#5C4B37] selection:bg-[#E2D2B4] selection:text-[#4A3C2C]',
    novel: 'bg-[#FFFFFF] text-[#333333] selection:bg-gray-200 selection:text-black'
  };

  const handleReaderClick = (e: React.MouseEvent) => {
    if (view !== 'reader') return;
    
    // Don't toggle if clicking on a button, input, or interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('header') || target.closest('.reader-toolbar') || target.closest('.pagination-controls') || target.closest('.interactive-element') || target.closest('.translation-popup') || target.closest('.cursor-pointer')) {
      return;
    }

    // Don't toggle if text is currently selected
    if (window.getSelection()?.toString().trim().length) {
      return;
    }

    // Don't toggle if we are clearing an existing selection
    if (selection) {
      return;
    }
    
    setShowReaderUI(prev => {
      const next = !prev;
      try {
        if (!next) {
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } else {
          if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        }
      } catch (err) {
        // Ignore fullscreen errors
      }
      return next;
    });
  };

  const pageGroups = React.useMemo(() => {
    if (!currentBook) return [];
    const groups: (number | null)[][] = [];
    if (pageLayout === 'facing') {
      for (let i = 1; i <= currentBook.totalPages; i += 2) {
        groups.push([i, i + 1 <= currentBook.totalPages ? i + 1 : null]);
      }
    } else {
      for (let i = 1; i <= currentBook.totalPages; i++) {
        groups.push([i]);
      }
    }
    return groups;
  }, [currentBook, pageLayout]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${themeStyles[theme]}`} onClick={handleReaderClick}>
      {/* Header */}
      <div className={`transition-all duration-500 overflow-hidden ${view === 'reader' && !showReaderUI ? 'max-h-0 opacity-0' : 'max-h-32 opacity-100'}`}>
        <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center sticky top-0 backdrop-blur-md bg-white/80 dark:bg-gray-900/80 z-50">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer group" onClick={() => setView('dashboard')}>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold font-sans tracking-tight leading-none">Bangla Reader</h1>
              <p className="text-[8px] sm:text-[10px] uppercase tracking-[0.2em] font-mono opacity-50 mt-1 hidden xs:block">Language Bridge v2.0</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:flex items-center gap-1 mr-2 sm:mr-4 border-r border-black/10 dark:border-white/10 pr-2 sm:pr-4">
              {isOffline && (
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-amber-200/50 dark:border-amber-800/50">
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden xs:inline">Offline</span>
                </div>
              )}
              <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => {
                    const newVal = !forceOffline;
                    setForceOffline(newVal);
                    showToast(newVal ? "Force Offline Mode: ON" : "Force Offline Mode: OFF");
                  }}
                  className={`p-1 sm:p-1.5 rounded-md transition-all ${forceOffline ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                  title={forceOffline ? "Force Offline Mode: ON" : "Force Offline Mode: OFF"}
                >
                  {forceOffline ? <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>

            <nav className="flex items-center gap-0.5 sm:gap-1">
              {view === 'reader' && (
                <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-xs sm:text-sm font-medium">
                  <Library className="w-4 h-4" />
                  <span className="hidden lg:inline">Library</span>
                </button>
              )}

              <button 
                onClick={() => setView('wordLibrary')} 
                className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm font-medium ${view === 'wordLibrary' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                <BookText className="w-4 h-4" />
                <span className="hidden lg:inline">Dictionary</span>
              </button>

              <button 
                onClick={() => setView('translate')} 
                className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm font-medium ${view === 'translate' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                <Languages className="w-4 h-4" />
                <span className="hidden lg:inline">Translate</span>
              </button>
            </nav>

            <div className="h-5 sm:h-6 w-px bg-black/10 dark:bg-white/10 mx-1 sm:mx-2" />

            <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-0.5 sm:p-1">
              <button onClick={() => setTheme('light')} className={`p-1 sm:p-1.5 rounded-md transition-all ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`} title="Light"><Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
              <button onClick={() => setTheme('dark')} className={`p-1 sm:p-1.5 rounded-md transition-all ${theme === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400'}`} title="Dark"><Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
              <button onClick={() => setTheme('sepia')} className={`p-1 sm:p-1.5 rounded-md transition-all ${theme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636] shadow-sm' : 'text-gray-400'}`} title="Sepia"><BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
            </div>

            {isAuthReady && (
              <div className="flex items-center ml-1 sm:ml-2">
                {user ? (
                  <button 
                    onClick={() => signOut(auth)} 
                    className="flex items-center gap-2 p-0.5 sm:p-1 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    title="Sign Out"
                  >
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-[10px] sm:text-xs">
                      {user.displayName?.[0] || user.email?.[0] || 'U'}
                    </div>
                  </button>
                ) : (
                  <button 
                    onClick={() => setIsAuthModalOpen(true)} 
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs sm:text-sm font-semibold shadow-md shadow-blue-500/20"
                  >
                    <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">Sign In</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
      </div>

      <main className={`mx-auto p-4 md:p-8 transition-all duration-500 ${view === 'reader' && !showReaderUI ? 'max-w-7xl' : 'max-w-5xl'}`} onMouseUp={handleMouseUp}>
        {view === 'dashboard' ? (
          <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 border-b border-black/5 dark:border-white/5 pb-8 sm:pb-12">
              <div className="space-y-3 sm:space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] uppercase tracking-[0.2em] font-bold">
                  <Library className="w-3 h-3" />
                  Digital Library
                </div>
                <h2 className="text-4xl sm:text-5xl md:text-7xl font-bold font-sans tracking-tighter leading-[0.9]">Your <br className="hidden sm:block" /><span className="text-blue-600">Library</span></h2>
                <p className="opacity-60 text-base sm:text-lg max-w-md leading-relaxed font-medium">
                  Bridge the gap between English and Bengali. Read, translate, and build your vocabulary seamlessly.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                <button 
                  onClick={startCamera}
                  className="flex-1 lg:flex-none group flex items-center gap-3 px-5 sm:px-6 py-3.5 sm:py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-xl shadow-black/5 border border-black/5 dark:border-white/5"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-sm">Scan Document</span>
                    <span className="block text-[10px] opacity-50 uppercase tracking-wider">Use Camera</span>
                  </div>
                </button>
                <label className="flex-1 lg:flex-none group cursor-pointer flex items-center gap-3 px-5 sm:px-6 py-3.5 sm:py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-sm">Upload PDF</span>
                    <span className="block text-[10px] text-white/60 uppercase tracking-wider">Add New Book</span>
                  </div>
                  <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>

            {library.length === 0 ? (
              <div className="text-center py-32 border-2 border-dashed border-black/10 dark:border-white/10 rounded-[2rem] bg-black/5 dark:bg-white/5">
                <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-3xl shadow-xl mx-auto mb-8 flex items-center justify-center text-blue-600">
                  <Library className="w-12 h-12 opacity-40" />
                </div>
                <p className="text-2xl font-bold tracking-tight">Your library is empty</p>
                <p className="text-base opacity-50 mt-3 max-w-xs mx-auto">Upload a PDF or use the camera to start your reading journey.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {library.map(book => (
                  <div 
                    key={book.id} 
                    onClick={() => openBookFromLibrary(book)}
                    className="group relative flex flex-col h-full rounded-[2rem] border border-black/5 dark:border-white/5 hover:border-blue-500/30 hover:shadow-2xl transition-all duration-500 cursor-pointer bg-white dark:bg-gray-800/80 backdrop-blur-sm shadow-xl shadow-black/5 hover:-translate-y-2 overflow-hidden"
                  >
                    <div className="absolute top-4 right-4 z-10">
                      <button 
                        onClick={(e) => requestDeleteBook(e, book.id)}
                        className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="aspect-[4/3] bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-grid-black/[0.02] dark:bg-grid-white/[0.02]" />
                      <div className="w-20 h-28 bg-white dark:bg-gray-700 rounded-lg shadow-2xl flex flex-col p-3 transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
                        <div className="w-full h-1 bg-blue-600 rounded-full mb-2" />
                        <div className="w-2/3 h-1 bg-gray-200 dark:bg-gray-600 rounded-full mb-1" />
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-full mb-1" />
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-full mb-1" />
                        <div className="mt-auto flex justify-end">
                          <BookOpen className="w-4 h-4 text-blue-600 opacity-50" />
                        </div>
                      </div>
                    </div>

                    <div className="p-8 flex flex-col flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">PDF Document</span>
                      </div>
                      <h3 className="font-bold text-xl mb-2 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">{book.title}</h3>
                      
                      <div className="mt-auto pt-6">
                        <div className="flex justify-between items-end mb-2">
                          <div className="text-xs font-medium opacity-50 uppercase tracking-wider">Progress</div>
                          <div className="text-sm font-bold text-blue-600">{Math.round((book.lastReadPage / book.totalPages) * 100)}%</div>
                        </div>
                        <div className="w-full bg-black/5 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-600 h-full rounded-full transition-all duration-1000 ease-out" 
                            style={{ width: `${(book.lastReadPage / book.totalPages) * 100}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-4 text-[11px] font-medium opacity-40">
                          <Library className="w-3 h-3" />
                          <span>Page {book.lastReadPage} of {book.totalPages}</span>
                        </div>
                      </div>

                      {/* Offline Download Status */}
                      <div className="mt-6 pt-4 border-t border-black/5 dark:border-white/5">
                        {downloadingBooks[book.id] ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-blue-600">
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Downloading</span>
                              </div>
                              <span>{Math.round((downloadingBooks[book.id].current / downloadingBooks[book.id].total) * 100)}%</span>
                            </div>
                            <div className="w-full bg-blue-100 dark:bg-blue-900/30 h-1 rounded-full overflow-hidden">
                              <div 
                                className="bg-blue-600 h-full rounded-full transition-all duration-300" 
                                style={{ width: `${(downloadingBooks[book.id].current / downloadingBooks[book.id].total) * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : book.downloadedPages === book.totalPages ? (
                          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-green-600 dark:text-green-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Available Offline</span>
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => downloadBookForOffline(e, book)}
                            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 hover:text-blue-600 transition-all"
                          >
                            <CloudDownload className="w-3.5 h-3.5" />
                            <span>Download for Offline</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : view === 'wordLibrary' ? (
          <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 border-b border-black/5 dark:border-white/5 pb-8 sm:pb-12">
              <div className="space-y-3 sm:space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] uppercase tracking-[0.2em] font-bold">
                  <BookText className="w-3 h-3" />
                  Vocabulary Builder
                </div>
                <h2 className="text-4xl sm:text-5xl md:text-7xl font-bold font-sans tracking-tighter leading-[0.9]">Word <br className="hidden sm:block" /><span className="text-blue-600">Library</span></h2>
                <p className="opacity-60 text-base sm:text-lg max-w-md leading-relaxed font-medium">
                  Master new words. Review and search through your personal collection of translated terms.
                </p>
              </div>
              <div className="relative w-full lg:w-80 group">
                <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search and translate..." 
                  value={wordSearchQuery}
                  onChange={(e) => setWordSearchQuery(e.target.value)}
                  className="w-full pl-14 pr-6 py-3.5 sm:py-4 rounded-2xl bg-white dark:bg-gray-800 border border-black/5 dark:border-white/5 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-xl shadow-black/5 font-medium text-sm sm:text-base"
                />
                
                {wordSearchQuery.trim() && (isSearchingTranslation || searchTranslation || searchSuggestions.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-black/5 dark:border-white/5 z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
                    
                    {/* Exact Translation Result */}
                    {(isSearchingTranslation || searchTranslation) && (
                      <div className="p-4 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-blue-50/30 dark:bg-blue-900/10">
                        {isSearchingTranslation ? (
                          <div className="flex items-center gap-3 text-sm font-medium text-blue-600">
                            <Loader2 className="w-4 h-4 animate-spin" /> Translating...
                          </div>
                        ) : searchTranslation ? (
                          <>
                            <div className="flex-1 truncate pr-4">
                              <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 block mb-1">Meaning</span>
                              <span className="font-bold text-lg text-blue-600 dark:text-blue-400 truncate block">{searchTranslation}</span>
                            </div>
                            {searchTranslation !== "Not found in offline dictionary." && !savedWords[wordSearchQuery.toLowerCase().trim()] && (
                              <button 
                                onClick={() => {
                                  import('./lib/translationMemory').then(({ saveToMemory }) => {
                                    saveToMemory(wordSearchQuery.trim(), searchTranslation);
                                    setSavedWords(prev => ({ ...prev, [wordSearchQuery.toLowerCase().trim()]: searchTranslation }));
                                  });
                                }}
                                className="text-xs bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-bold"
                              >
                                Save
                              </button>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}

                    {/* Suggestions List */}
                    {searchSuggestions.length > 0 && (
                      <div className="flex flex-col py-2">
                        <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest opacity-40">Suggestions</div>
                        {searchSuggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => setWordSearchQuery(suggestion.english)}
                            className="flex justify-between items-center px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3">
                              {suggestion.isCorrection && <span className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-500 px-2 py-0.5 rounded-full uppercase tracking-tighter">Correction</span>}
                              <span className="font-bold text-gray-900 dark:text-gray-100">{suggestion.english}</span>
                            </div>
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{suggestion.bengali}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {Object.keys(savedWords).length === 0 ? (
              <div className="text-center py-32 border-2 border-dashed border-black/10 dark:border-white/10 rounded-[2rem] bg-black/5 dark:bg-white/5">
                <div className="w-24 h-24 bg-white dark:bg-gray-800 rounded-3xl shadow-xl mx-auto mb-8 flex items-center justify-center text-blue-600">
                  <BookText className="w-12 h-12 opacity-40" />
                </div>
                <p className="text-2xl font-bold tracking-tight">Your word library is empty</p>
                <p className="text-base opacity-50 mt-3 max-w-xs mx-auto">Translate short phrases or words while reading to save them here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {Object.entries(savedWords)
                  .filter(([eng, ben]) => 
                    eng.toLowerCase().includes(wordSearchQuery.toLowerCase()) || 
                    ben.includes(wordSearchQuery)
                  )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([english, bengali]) => (
                  <div key={english} className="group relative p-8 rounded-[2rem] border border-black/5 dark:border-white/5 hover:border-blue-500/30 hover:shadow-2xl transition-all duration-500 bg-white dark:bg-gray-800/80 backdrop-blur-sm flex flex-col justify-between min-h-[160px] shadow-xl shadow-black/5 hover:-translate-y-1">
                    <button 
                      onClick={() => deleteSavedWord(english)}
                      className="absolute top-4 right-4 p-2.5 rounded-xl bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-lg"
                      title="Delete word"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 mb-2 opacity-50">Saved Word</div>
                      <h3 className="font-bold text-2xl text-gray-900 dark:text-gray-100 capitalize pr-8 leading-tight group-hover:text-blue-600 transition-colors">{english}</h3>
                      <div className="h-px w-8 bg-black/10 dark:bg-white/10 my-4" />
                      <p className="text-blue-600 dark:text-blue-400 font-bold text-xl">{bengali}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : view === 'translate' ? (
          <div className="space-y-8 sm:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 border-b border-black/5 dark:border-white/5 pb-8 sm:pb-12">
              <div className="space-y-3 sm:space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] uppercase tracking-[0.2em] font-bold">
                  <Languages className="w-3 h-3" />
                  Instant Translator
                </div>
                <h2 className="text-4xl sm:text-5xl md:text-7xl font-bold font-sans tracking-tighter leading-[0.9]">Quick <br className="hidden sm:block" /><span className="text-blue-600">Translate</span></h2>
                <p className="opacity-60 text-base sm:text-lg max-w-md leading-relaxed font-medium">
                  Translate any text instantly. Paste your content below and get high-quality Bengali translations.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-center px-2">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-50">English Input</label>
                  <span className="text-[9px] sm:text-[10px] font-mono opacity-40">{translateInputText.length} characters</span>
                </div>
                <textarea
                  value={translateInputText}
                  onChange={(e) => setTranslateInputText(e.target.value)}
                  placeholder="Type or paste English text here..."
                  className="w-full h-64 sm:h-80 p-6 sm:p-8 rounded-[2rem] bg-white dark:bg-gray-800 border border-black/5 dark:border-white/5 focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5 outline-none transition-all shadow-2xl shadow-black/5 resize-none text-base sm:text-lg leading-relaxed font-medium"
                />
              </div>
              
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-center px-2">
                  <label className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-50">Bengali Output</label>
                  {translateOutputText && (
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(translateOutputText);
                        showToast("Copied to clipboard!");
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:underline"
                    >
                      Copy All
                    </button>
                  )}
                </div>
                <div className="w-full h-64 sm:h-80 p-6 sm:p-8 rounded-[2rem] bg-blue-50/30 dark:bg-blue-900/10 border border-blue-500/10 overflow-y-auto shadow-inner">
                  {isTranslatingText ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-blue-600">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="font-bold text-xs sm:text-sm uppercase tracking-widest animate-pulse">Translating...</span>
                    </div>
                  ) : translateOutputText ? (
                    <div className="markdown-body">
                      <ReactMarkdown>{translateOutputText}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full opacity-20 gap-4">
                      <Languages className="w-12 h-12" />
                      <p className="text-sm font-bold uppercase tracking-widest">Translation will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex justify-center pt-4">
              <button
                onClick={handleTranslateText}
                disabled={!translateInputText.trim() || isTranslatingText}
                className="group flex items-center gap-3 px-8 sm:px-12 py-4 sm:py-5 bg-blue-600 text-white rounded-2xl sm:rounded-3xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2xl shadow-blue-500/30 font-bold text-base sm:text-lg w-full sm:w-auto justify-center"
              >
                <Languages className="w-5 h-5 sm:w-6 h-6 group-hover:rotate-12 transition-transform" />
                Translate Now
              </button>
            </div>
          </div>
        ) : (
          <div className="relative animate-in fade-in duration-500">
            {/* Reader Toolbar */}
            <div className={`reader-toolbar transition-all duration-500 fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-4xl ${!showReaderUI ? 'translate-y-32 opacity-0' : 'translate-y-0 opacity-100'}`}>
              <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[2.5rem] p-3 shadow-2xl shadow-black/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setView('dashboard')} 
                    className="flex items-center gap-2 px-4 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-2xl transition-all font-bold text-xs group"
                  >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="hidden sm:inline">Library</span>
                  </button>
                  <div className="h-8 w-px bg-black/5 dark:bg-white/5 mx-1 hidden sm:block" />
                  <div className="hidden md:block max-w-[200px]">
                    <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 leading-none mb-1">Now Reading</p>
                    <p className="font-bold text-xs truncate">{currentBook?.title}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-2">
                  {/* Appearance Controls */}
                  <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-2xl p-1">
                    <button 
                      onClick={() => setFontSize(f => Math.max(14, f - 2))} 
                      className="w-10 h-10 flex items-center justify-center hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all text-xs font-bold"
                      title="Decrease Font Size"
                    >
                      A-
                    </button>
                    <div className="w-px h-4 bg-black/10 dark:bg-white/10" />
                    <button 
                      onClick={() => setFontSize(f => Math.min(32, f + 2))} 
                      className="w-10 h-10 flex items-center justify-center hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all text-sm font-bold"
                      title="Increase Font Size"
                    >
                      A+
                    </button>
                  </div>

                  <div className="h-8 w-px bg-black/5 dark:bg-white/5 mx-1" />

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <button 
                        onClick={() => setShowShareMenu(!showShareMenu)} 
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${showShareMenu ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                        title="Share"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      {showShareMenu && (
                        <>
                          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:hidden" onClick={() => setShowShareMenu(false)} />
                          <div className="fixed bottom-24 inset-x-4 sm:absolute sm:bottom-full sm:left-1/2 sm:-translate-x-1/2 sm:mb-4 bg-white dark:bg-gray-800 shadow-2xl rounded-[2rem] p-3 border border-black/5 dark:border-white/5 z-50 sm:w-64 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex items-center justify-between p-3 sm:hidden border-b border-black/5 mb-2">
                              <span className="font-bold text-xs uppercase tracking-widest opacity-40">Share Options</span>
                              <button onClick={() => setShowShareMenu(false)} className="p-1 hover:bg-black/5 rounded-full"><X className="w-4 h-4" /></button>
                            </div>
                            <button onClick={() => handleShare('page')} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 rounded-2xl transition-colors font-bold">
                              <FileText className="w-4 h-4 opacity-50" />
                              Share Current Page
                            </button>
                            <button onClick={() => handleShare('book')} className="flex items-center gap-3 w-full px-4 py-3.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 rounded-2xl transition-colors font-bold">
                              <Book className="w-4 h-4 opacity-50" />
                              Share Full Book
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <button 
                      onClick={downloadTranslatedBook} 
                      className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    <div className="relative">
                      <button 
                        onClick={() => setShowSettings(!showSettings)} 
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${showSettings ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                        title="Display Settings"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      {showSettings && (
                        <>
                          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:hidden" onClick={() => setShowSettings(false)} />
                          <div className="fixed bottom-24 inset-x-4 sm:absolute sm:bottom-full sm:right-0 sm:mb-4 bg-white dark:bg-gray-800 shadow-2xl rounded-[2.5rem] p-8 border border-black/5 dark:border-white/5 z-50 sm:w-80 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex items-center justify-between mb-8 border-b border-black/5 dark:border-white/5 pb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                                  <Settings className="w-4 h-4" />
                                </div>
                                <h3 className="font-bold text-xs uppercase tracking-[0.2em]">Reader Settings</h3>
                              </div>
                              <button onClick={() => setShowSettings(false)} className="sm:hidden p-2 hover:bg-black/5 rounded-full"><X className="w-4 h-4" /></button>
                            </div>
                            
                            <div className="space-y-8">
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 block mb-4">Reading Theme</label>
                                <div className="grid grid-cols-4 gap-2 bg-black/5 dark:bg-white/5 rounded-2xl p-1.5">
                                  <button onClick={() => setTheme('light')} className={`w-full aspect-square rounded-xl border-2 transition-all ${theme === 'light' ? 'border-blue-600 bg-white' : 'border-transparent bg-white opacity-50 hover:opacity-100'}`} title="Light" />
                                  <button onClick={() => setTheme('dark')} className={`w-full aspect-square rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-blue-600 bg-gray-900' : 'border-transparent bg-gray-900 opacity-50 hover:opacity-100'}`} title="Dark" />
                                  <button onClick={() => setTheme('sepia')} className={`w-full aspect-square rounded-xl border-2 transition-all ${theme === 'sepia' ? 'border-blue-600 bg-[#F4ECD8]' : 'border-transparent bg-[#F4ECD8] opacity-50 hover:opacity-100'}`} title="Sepia" />
                                  <button onClick={() => setTheme('novel')} className={`w-full aspect-square rounded-xl border-2 transition-all ${theme === 'novel' ? 'border-blue-600 bg-[#FCF9F2]' : 'border-transparent bg-[#FCF9F2] opacity-50 hover:opacity-100'}`} title="Novel" />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 block mb-4">View Mode</label>
                                <div className="grid grid-cols-3 gap-2 bg-black/5 dark:bg-white/5 rounded-2xl p-1.5">
                                  <button onClick={() => setViewMode('translation')} className={`py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${viewMode === 'translation' ? 'bg-white dark:bg-gray-700 shadow-lg text-blue-600' : 'opacity-50 hover:opacity-100'}`}>Text</button>
                                  <button onClick={() => setViewMode('pdf')} className={`py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${viewMode === 'pdf' ? 'bg-white dark:bg-gray-700 shadow-lg text-blue-600' : 'opacity-50 hover:opacity-100'}`}>PDF</button>
                                  <button onClick={() => setViewMode('split')} className={`py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${viewMode === 'split' ? 'bg-white dark:bg-gray-700 shadow-lg text-blue-600' : 'opacity-50 hover:opacity-100'}`}>Split</button>
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 block mb-4">Page Layout</label>
                                <div className="grid grid-cols-2 gap-2 bg-black/5 dark:bg-white/5 rounded-2xl p-1.5">
                                  <button onClick={() => { setPageLayout('single'); goToPage(currentPage); }} className={`py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${pageLayout === 'single' ? 'bg-white dark:bg-gray-700 shadow-lg text-blue-600' : 'opacity-50 hover:opacity-100'}`}>Single</button>
                                  <button onClick={() => { setPageLayout('facing'); goToPage(currentPage); }} className={`py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${pageLayout === 'facing' ? 'bg-white dark:bg-gray-700 shadow-lg text-blue-600' : 'opacity-50 hover:opacity-100'}`}>Facing</button>
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 block mb-4">PDF Zoom</label>
                                <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-2xl p-1.5">
                                  <button onClick={() => setPdfZoom(z => Math.max(0.5, z - 0.25))} className="w-10 h-10 flex items-center justify-center hover:bg-white dark:hover:bg-gray-700 rounded-xl transition-all"><ZoomOut className="w-4 h-4"/></button>
                                  <span className="text-xs font-bold font-mono">{Math.round(pdfZoom * 100)}%</span>
                                  <button onClick={() => setPdfZoom(z => Math.min(3.0, z + 0.25))} className="w-10 h-10 flex items-center justify-center hover:bg-white dark:hover:bg-gray-700 rounded-xl transition-all"><ZoomIn className="w-4 h-4"/></button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className={`flex flex-col items-center overflow-y-auto min-h-[50vh] transition-all duration-500 ${showReaderUI ? 'pb-32 sm:pb-24' : 'pb-4 sm:pb-8'} ${viewMode === 'split' ? 'max-h-[70vh]' : 'max-h-[85vh]'}`}>
              {pageGroups.map((group, index) => (
                <div 
                  key={index} 
                  ref={el => {
                    if (el) {
                      group.forEach(p => { if (p) pageRefs.current[p] = el; });
                    }
                  }}
                  className={`flex w-full max-w-7xl ${viewMode === 'split' ? 'flex-col lg:flex-row gap-8' : 'justify-center'} mb-16`}
                >
                  
                  {/* PDF View */}
                  {(viewMode === 'pdf' || viewMode === 'split') && (
                    <div className={`flex-1 flex justify-center bg-black/5 dark:bg-white/5 p-4 sm:p-8 rounded-2xl shadow-inner ${pageLayout === 'facing' ? 'gap-4 sm:gap-8' : ''}`}>
                      {group.map(pageNum => pageNum && (
                        <PdfPage 
                          key={`pdf-${pageNum}`}
                          pdfDoc={pdfDoc} 
                          pageNum={pageNum} 
                          zoom={pdfZoom} 
                          onVisible={handlePageVisible} 
                        />
                      ))}
                    </div>
                  )}

                  {/* Translation View */}
                  {(viewMode === 'translation' || viewMode === 'split') && (
                    <div 
                      className={`flex-1 max-w-none font-serif leading-relaxed ${viewMode === 'split' ? 'lg:max-w-[50%]' : ''}`}
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      <div className={`p-8 sm:p-12 md:p-20 rounded-[2rem] shadow-2xl border transition-all duration-500 h-full ${
                        theme === 'dark' ? 'bg-gray-800 border-white/5 text-gray-200 shadow-black/40' :
                        theme === 'sepia' ? 'bg-[#F4ECD8] border-[#E2D2B4] text-[#5C4B37] shadow-[#5C4B37]/10' :
                        theme === 'novel' ? 'bg-[#FCF9F2] border-[#E8E4D8] text-[#2C2C2C] shadow-[#E8E4D8]/50' :
                        'bg-white border-black/5 text-gray-800 shadow-black/5'
                      }`}>
                        {group.map((pageNum, i) => pageNum && (
                          <React.Fragment key={`trans-${pageNum}`}>
                            {i > 0 && <div className="my-16 border-b-2 border-dashed border-current opacity-10"></div>}
                            <TranslationPage 
                              pageNum={pageNum} 
                              content={translatedPages[pageNum]} 
                              isTranslating={translatedPages[pageNum] === ''} 
                              onVisible={handlePageVisible}
                              onRetry={(pageNum) => translatePage(pdfDoc, currentBook!.id, pageNum)}
                            />
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="pagination-controls fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2 sm:w-[calc(100%-3rem)] sm:max-w-4xl z-30 pointer-events-none">
              <div className={`flex items-center justify-between border border-opacity-10 dark:border-opacity-20 border-current bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl p-4 sm:p-5 rounded-t-[2rem] sm:rounded-2xl shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.15)] sm:shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 transition-transform duration-500 ease-out pointer-events-auto ${!showReaderUI ? 'translate-y-full sm:translate-y-[150%]' : 'translate-y-0'}`}>
                <button 
                  onClick={() => goToPage(Math.max(1, currentPage - (pageLayout === 'facing' ? 2 : 1)))}
                  disabled={currentPage <= 1 || isTranslating}
                  className="flex items-center justify-center w-14 h-14 sm:w-auto sm:h-auto sm:px-5 sm:py-2.5 bg-black/5 dark:bg-white/10 rounded-full sm:rounded-xl hover:bg-black/10 dark:hover:bg-white/20 disabled:opacity-30 transition-all shrink-0 active:scale-95 font-medium"
                >
                <ChevronLeft className="w-8 h-8 sm:w-5 sm:h-5" /> <span className="hidden sm:inline ml-1">Previous</span>
              </button>
              
              <div className="flex flex-col items-center gap-3 w-full max-w-[180px] sm:max-w-md mx-2 sm:mx-6">
                <input 
                  type="range" 
                  min={1} 
                  max={currentBook?.totalPages || 1} 
                  value={currentPage}
                  onChange={(e) => goToPage(parseInt(e.target.value))}
                  className="w-full h-2 sm:h-2.5 bg-gray-200/50 rounded-full appearance-none cursor-pointer dark:bg-gray-700/50 accent-blue-600 dark:accent-blue-400"
                  title={`Page ${currentPage} of ${currentBook?.totalPages || 1}`}
                />
                <div className="flex items-center gap-1 sm:gap-2 font-mono text-sm opacity-70 font-medium">
                  <input 
                    type="number" 
                    value={currentPage}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) goToPage(val);
                    }}
                    className="w-12 sm:w-16 text-center bg-transparent border-b-2 border-current border-opacity-20 focus:outline-none focus:border-opacity-100 transition-colors"
                    min={1}
                    max={currentBook?.totalPages || 1}
                  />
                  {pageLayout === 'facing' && currentPage < (currentBook?.totalPages || 1) && (
                    <span>- {currentPage + 1}</span>
                  )}
                  <span className="opacity-60">/ {currentBook?.totalPages || 1}</span>
                </div>
              </div>

              <button 
                onClick={() => goToPage(Math.min(currentBook?.totalPages || 1, currentPage + (pageLayout === 'facing' ? 2 : 1)))}
                disabled={currentPage >= (currentBook?.totalPages || 1) || isTranslating}
                className="flex items-center justify-center w-14 h-14 sm:w-auto sm:h-auto sm:px-5 sm:py-2.5 bg-blue-600 text-white sm:bg-black/5 sm:text-current dark:sm:bg-white/10 rounded-full sm:rounded-xl hover:bg-blue-700 sm:hover:bg-black/10 dark:sm:hover:bg-white/20 disabled:opacity-30 transition-all shrink-0 shadow-lg sm:shadow-none active:scale-95 font-medium"
              >
                <span className="hidden sm:inline mr-1">Next</span> <ChevronRight className="w-8 h-8 sm:w-5 sm:h-5" />
              </button>
              </div>
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
                <Languages className="w-4 h-4" /> Translate with AI
              </button>
            ) : isTranslatingSelection ? (
              <div className="flex items-center gap-2 text-sm opacity-70">
                <Loader2 className="w-4 h-4 animate-spin" /> Translating...
              </div>
            ) : (
              <div className="text-sm">
                <div className="flex items-center gap-1.5 mb-1.5 opacity-60">
                  <Languages className="w-3 h-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">AI Translation</span>
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
            <button onClick={stopCamera} disabled={isCapturing} className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white backdrop-blur-sm transition-colors disabled:opacity-50">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-gray-900">
            {!capturedImage ? (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                
                {/* Capture Guide */}
                <div className="absolute inset-0 border-2 border-white/10 m-8 rounded-xl pointer-events-none flex flex-col">
                  <div className="flex-1 border-b border-white/10"></div>
                  <div className="flex-1 border-b border-white/10"></div>
                  <div className="flex-1"></div>
                  
                  <div className="absolute inset-0 flex">
                    <div className="flex-1 border-r border-white/10"></div>
                    <div className="flex-1 border-r border-white/10"></div>
                    <div className="flex-1"></div>
                  </div>

                  <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-white -mt-1 -ml-1 rounded-tl-xl"></div>
                  <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-white -mt-1 -mr-1 rounded-tr-xl"></div>
                  <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-white -mb-1 -ml-1 rounded-bl-xl"></div>
                  <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-white -mb-1 -mr-1 rounded-br-xl"></div>
                  
                  <div className="absolute bottom-4 left-0 right-0 text-center">
                    <span className="bg-black/50 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md">Align text within the frame</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="relative w-full h-full">
                <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
                {isCapturing && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                    <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
                    <p className="text-white font-medium text-lg">{cameraProcessingStep}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="h-32 bg-black flex items-center justify-center pb-8 px-6">
            {!capturedImage ? (
              <button 
                onClick={handleCaptureClick}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 bg-white rounded-full hover:bg-gray-200 transition-colors"></div>
              </button>
            ) : (
              <div className="flex items-center justify-between w-full max-w-sm">
                <button 
                  onClick={() => {
                    setCapturedImage(null);
                    startCamera(); // Restart the camera stream
                  }}
                  disabled={isCapturing}
                  className="px-6 py-3 rounded-full bg-white/20 text-white font-medium hover:bg-white/30 transition-colors disabled:opacity-50"
                >
                  Retake
                </button>
                <button 
                  onClick={processCapturedImage}
                  disabled={isCapturing}
                  className="px-8 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg flex items-center gap-2"
                >
                  {isCapturing ? 'Processing...' : 'Translate'}
                </button>
              </div>
            )}
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

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={() => {
          showToast("Successfully signed in!");
        }} 
      />
    </div>
  );
}

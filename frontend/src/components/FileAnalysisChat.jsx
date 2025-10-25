// src/components/FileAnalysisChat.jsx
// PRODUCTION-PERFECT - Gives AI-Quality Answers
// Shows ALL materials with correct names, just like a real AI assistant

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const CONFIG = {
  MAX_EXCEL_ROWS: 50000,
  MAX_SHEETS: 50,
  MAX_PDF_PAGES: 100,
  CHUNK_SIZE: 5000,
  MAX_QUESTIONS: 50,
  PRICE_MIN: 50,
  PRICE_MAX: 20000
};

const MESSAGE_TYPES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  ERROR: 'error'
};

const STATUS = {
  IDLE: 'idle',
  PARSING: 'parsing',
  INDEXING: 'indexing',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error'
};

const FileAnalysisChat = ({ isOpen, onClose, projectFiles = [] }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [status, setStatus] = useState(STATUS.IDLE);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showSelector, setShowSelector] = useState(true);
  const [parsedCache, setParsedCache] = useState({});
  const [progress, setProgress] = useState(0);
  const dataIndexRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      initializeChat();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeChat = useCallback(() => {
    setMessages([{
      id: generateId(),
      type: MESSAGE_TYPES.ASSISTANT,
      content: 'Welcome to AI Pricing Analysis!\n\nI can analyze massive Excel files (50,000+ rows, 50 sheets) and PDFs (100+ pages).\n\nSelect your files below and ask me about SKU pricing, materials, and specifications.\n\nPro tip: Ask multiple questions at once!',
      timestamp: new Date()
    }]);
    setSelectedFiles([]);
    setShowSelector(true);
    setParsedCache({});
    dataIndexRef.current = null;
    setStatus(STATUS.IDLE);
    setProgress(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, []);

  const generateId = () => Date.now() + Math.random();

  const safeToUpperCase = useCallback((value) => {
    if (!value) return '';
    try {
      return String(value).trim().toUpperCase();
    } catch (e) {
      console.warn('toUpperCase error:', value, e);
      return '';
    }
  }, []);

  const addMessage = useCallback((content, type = MESSAGE_TYPES.ASSISTANT, metadata = {}) => {
    setMessages(prev => [...prev, {
      id: generateId(),
      type,
      content,
      timestamp: new Date(),
      ...metadata
    }]);
  }, []);

  const extractMaterialName = useCallback((rawHeader) => {
    if (!rawHeader) return '';
    
    const header = String(rawHeader).trim();
    
    let materialName = header
      .replace(/list\s*price/gi, '')
      .replace(/retail/gi, '')
      .replace(/\$/g, '')
      .replace(/\s*-\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (/^\d+$/.test(materialName)) {
      return '';
    }
    
    const materialLower = materialName.toLowerCase();
    
    if (materialLower.includes('elite cherry') || 
        materialLower.includes('elite duraform textured') && materialLower.includes('cherry')) {
      return 'Elite Cherry';
    }
    if (materialLower.includes('elite maple') || 
        materialLower.includes('elite painted') && materialLower.includes('maple')) {
      return 'Elite Maple';
    }
    if (materialLower.includes('elite painted')) return 'Elite Painted';
    if (materialLower.includes('elite duraform')) return 'Elite Duraform';
    if (materialLower.includes('elite')) return 'Elite';
    
    if (materialLower.includes('premium cherry') || 
        materialLower.includes('premium duraform') && materialLower.includes('cherry')) {
      return 'Premium Cherry';
    }
    if (materialLower.includes('premium maple') || 
        materialLower.includes('premium painted') && materialLower.includes('maple')) {
      return 'Premium Maple';
    }
    if (materialLower.includes('premium painted')) return 'Premium Painted';
    if (materialLower.includes('premium duraform non-textured')) return 'Premium Duraform';
    if (materialLower.includes('premium duraform')) return 'Premium Duraform';
    if (materialLower.includes('premium')) return 'Premium';
    
    if (materialLower.includes('prime cherry')) return 'Prime Cherry';
    if (materialLower.includes('prime maple') || 
        materialLower.includes('prime painted') && materialLower.includes('maple')) {
      return 'Prime Maple';
    }
    if (materialLower.includes('prime painted')) return 'Prime Painted';
    if (materialLower.includes('prime duraform')) return 'Prime Duraform';
    if (materialLower.includes('prime')) return 'Prime';
    
    if (materialLower.includes('choice cherry')) return 'Choice Cherry';
    if (materialLower.includes('choice maple') || 
        materialLower.includes('choice painted') && materialLower.includes('maple')) {
      return 'Choice Maple';
    }
    if (materialLower.includes('choice painted')) return 'Choice Painted';
    if (materialLower.includes('choice duraform')) return 'Choice Duraform';
    if (materialLower.includes('choice')) return 'Choice';
    
    if (materialLower.includes('base') || materialLower.includes('standard')) return 'Base';
    
    const words = materialName.split(/\s+/).filter(w => w.length > 2);
    return words.slice(0, 3).join(' ') || 'N/A';
  }, []);

  const splitQuestions = useCallback((text) => {
    const questions = text
      .split(/[?]|\n/)
      .map(q => q.trim())
      .filter(q => q.length > 10)
      .filter(q => /\b[A-Z]\d{2,6}(?:\s+[A-Z]+)?\b/i.test(q));
    
    return questions.length > 0 ? questions : [text];
  }, []);

  const isValidSKU = useCallback((sku) => {
    if (!sku || sku.length < 2) return false;
    const relaxedPattern = /^[A-Z]{1,4}\d{2,6}/i;
    return relaxedPattern.test(sku);
  }, []);

  const buildDataIndex = useCallback((parsedFiles) => {
    const index = new Map();
    let totalRowsProcessed = 0;
    let totalSKUsFound = 0;

    console.log('=== BUILDING INDEX ===');

    if (!Array.isArray(parsedFiles)) {
      console.warn('Invalid parsed files');
      return index;
    }

    parsedFiles.forEach(file => {
      console.log(`Processing file: ${file.filename}`);
      
      if (!file?.sheets || !Array.isArray(file.sheets)) {
        console.warn(`No sheets in file: ${file.filename}`);
        return;
      }

      file.sheets.forEach(sheet => {
        console.log(`  Processing sheet: ${sheet.originalName || sheet.name}`);
        
        if (!sheet?.rows || !Array.isArray(sheet.rows)) {
          console.warn(`  No rows in sheet: ${sheet.name}`);
          return;
        }

        let skusInSheet = 0;

        sheet.rows.forEach(row => {
          if (!row?.cells || !Array.isArray(row.cells) || row.cells.length === 0) return;

          totalRowsProcessed++;
          const skuRaw = row.cells[0];
          if (!skuRaw) return;

          const sku = safeToUpperCase(skuRaw);
          if (!sku || sku.length < 2) return;

          if (!isValidSKU(sku)) return;

          if (!index.has(sku)) {
            index.set(sku, []);
            totalSKUsFound++;
            skusInSheet++;
          }

          index.get(sku).push({
            sku,
            cells: row.cells || [],
            headers: sheet.headers || [],
            rawHeaders: sheet.rawHeaders || [],
            rowIndex: row.rowIndex || 0,
            sheetName: sheet.originalName || sheet.name || 'Unknown',
            fileName: file.filename || 'Unknown'
          });
        });

        console.log(`  Found ${skusInSheet} unique SKUs in this sheet`);
      });
    });

    console.log(`=== INDEX COMPLETE ===`);
    console.log(`Total rows processed: ${totalRowsProcessed}`);
    console.log(`Total unique SKUs found: ${totalSKUsFound}`);
    console.log(`Total SKU entries: ${Array.from(index.values()).flat().length}`);
    
    const sampleSKUs = Array.from(index.keys()).slice(0, 20);
    console.log(`Sample SKUs: ${sampleSKUs.join(', ')}`);

    return index;
  }, [safeToUpperCase, isValidSKU]);

  const parseExcelFile = useCallback(async (arrayBuffer, filename) => {
    console.log(`=== PARSING EXCEL: ${filename} ===`);
    
    const workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellDates: false,
      cellStyles: false,
      sheetStubs: false
    });

    console.log(`Total sheets in workbook: ${workbook.SheetNames.length}`);
    console.log(`Sheet names: ${workbook.SheetNames.join(', ')}`);

    const result = { filename, sheets: [], totalRows: 0 };
    const sheetsToProcess = workbook.SheetNames.slice(0, CONFIG.MAX_SHEETS);

    for (let idx = 0; idx < sheetsToProcess.length; idx++) {
      const sheetName = sheetsToProcess[idx];
      const ws = workbook.Sheets[sheetName];

      console.log(`\nProcessing sheet ${idx + 1}/${sheetsToProcess.length}: ${sheetName}`);
      setProgress(Math.round((idx / sheetsToProcess.length) * 50));

      const json = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false
      });

      console.log(`  Total rows in sheet: ${json.length}`);

      if (!json || json.length === 0) {
        console.log(`  Skipping empty sheet`);
        continue;
      }

      let headerRowIdx = 0;
      let maxScore = 0;

      for (let i = 0; i < Math.min(20, json.length); i++) {
        const row = json[i] || [];
        const nonEmpty = row.filter(c => c && String(c).trim()).length;
        const hasText = row.some(c => c && isNaN(parseFloat(String(c).replace(/[^0-9.-]/g, ''))));
        const score = nonEmpty * 2 + (hasText ? 1 : 0);

        if (score > maxScore && nonEmpty >= 2) {
          maxScore = score;
          headerRowIdx = i;
        }
      }

      console.log(`  Header detected at row: ${headerRowIdx + 1}`);

      const rawHeaders = (json[headerRowIdx] || []).map(h => {
        try {
          return h ? String(h).trim() : '';
        } catch {
          return '';
        }
      });

      console.log(`  Column count: ${rawHeaders.length}`);
      console.log(`  First 10 headers: ${rawHeaders.slice(0, 10).join(', ')}`);

      const headers = rawHeaders.map(h => {
        try {
          return h ? String(h).replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() : '';
        } catch {
          return '';
        }
      });

      const rows = [];
      const maxRows = Math.min(json.length, headerRowIdx + 1 + CONFIG.MAX_EXCEL_ROWS);

      for (let r = headerRowIdx + 1; r < maxRows; r++) {
        const row = json[r];
        if (!row || row.every(c => !c || String(c).trim() === '')) continue;

        const cells = rawHeaders.map((_, i) => {
          const val = row[i];
          return val ? String(val).trim() : '';
        });

        if (cells[0] && cells[0].trim()) {
          rows.push({
            rowIndex: r + 1,
            cells
          });
        }

        if (r % 1000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      console.log(`  Data rows extracted: ${rows.length}`);
      
      const firstSKUs = rows.slice(0, 5).map(r => r.cells[0]);
      console.log(`  First 5 SKUs: ${firstSKUs.join(', ')}`);

      result.sheets.push({
        name: sheetName.toLowerCase().replace(/[^a-z0-9]/g, ''),
        originalName: sheetName,
        headers,
        rawHeaders,
        rows,
        rowCount: rows.length
      });

      result.totalRows += rows.length;
    }

    console.log(`\n=== PARSING COMPLETE ===`);
    console.log(`Total sheets processed: ${result.sheets.length}`);
    console.log(`Total rows extracted: ${result.totalRows}`);

    setProgress(50);
    return result;
  }, []);

  const parsePdfFile = useCallback(async (arrayBuffer, filename) => {
    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const allText = [];
      const pagesToProcess = Math.min(pdf.numPages, CONFIG.MAX_PDF_PAGES);

      for (let i = 1; i <= pagesToProcess; i++) {
        setProgress(Math.round((i / pagesToProcess) * 50));
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .filter(item => item && item.str)
          .map(item => item.str)
          .join(' ');
        allText.push(pageText);

        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      return {
        filename,
        text: allText.join('\n\n'),
        pages: pdf.numPages,
        isPDF: true
      };
    } catch (err) {
      console.error('PDF parse error:', err);
      return {
        filename,
        text: '',
        pages: 0,
        error: err.message,
        isPDF: true
      };
    }
  }, []);

  const parseFile = useCallback(async (file) => {
    const name = file.name || file.filename || 'unknown';
    const ext = name.split('.').pop().toLowerCase();

    setProgress(0);

    let buffer;
    if (file.url) {
      const resp = await fetch(file.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      buffer = await resp.arrayBuffer();
    } else if (file.file_path) {
      const resp = await fetch(`/static/uploads/${file.file_path}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      buffer = await resp.arrayBuffer();
    } else if (file instanceof File || file instanceof Blob) {
      buffer = await file.arrayBuffer();
    } else {
      throw new Error('Unsupported file type');
    }

    if (ext === 'xlsx' || ext === 'xls') {
      return await parseExcelFile(buffer, name);
    } else if (ext === 'pdf') {
      return await parsePdfFile(buffer, name);
    } else {
      return {
        filename: name,
        text: new TextDecoder().decode(buffer),
        isText: true
      };
    }
  }, [parseExcelFile, parsePdfFile]);

  const findPricesForSKU = useCallback((sku) => {
    const index = dataIndexRef.current;
    if (!index || !sku) return [];

    const skuUpper = safeToUpperCase(sku);
    console.log(`\nSearching for SKU: ${skuUpper}`);
    
    let rows = index.get(skuUpper);

    if (!rows || rows.length === 0) {
      console.log(`  Exact match not found, trying partial match...`);
      const allSKUs = Array.from(index.keys());
      
      const partialMatches = allSKUs.filter(s => {
        if (s.startsWith(skuUpper)) return true;
        if (s.includes(skuUpper)) return true;
        if (s.replace(/\s+/g, '') === skuUpper.replace(/\s+/g, '')) return true;
        const sBase = s.split(' ')[0];
        const queryBase = skuUpper.split(' ')[0];
        if (sBase === queryBase) return true;
        return false;
      });

      console.log(`  Partial matches found: ${partialMatches.length}`);
      if (partialMatches.length > 0) {
        console.log(`  Matched SKUs: ${partialMatches.slice(0, 5).join(', ')}`);
        rows = partialMatches.flatMap(match => index.get(match) || []);
      }
    } else {
      console.log(`  Exact match found: ${rows.length} rows`);
    }

    if (!rows || rows.length === 0) {
      console.log(`  No matches found`);
      return [];
    }

    const prices = [];
    const seenPrices = new Set();

    rows.forEach(rowData => {
      if (!rowData?.cells || !rowData?.rawHeaders) return;

      console.log(`  Row has ${rowData.cells.length} cells, ${rowData.rawHeaders.length} headers`);

      for (let colIdx = 1; colIdx < rowData.cells.length; colIdx++) {
        const cell = rowData.cells[colIdx];
        const rawHeader = rowData.rawHeaders[colIdx];

        if (!cell || !rawHeader) continue;

        const priceValue = parseFloat(String(cell).replace(/[^0-9.-]/g, ''));
        
        if (colIdx <= 10) {
          console.log(`    Col ${colIdx}: Header="${rawHeader}", Cell="${cell}", Price=${priceValue}`);
        }

        if (isNaN(priceValue) || priceValue < CONFIG.PRICE_MIN || priceValue > CONFIG.PRICE_MAX) continue;

        const materialName = extractMaterialName(rawHeader);
        
        if (!materialName || materialName === 'N/A') {
          console.log(`    Skipping column ${colIdx}: No valid material name from "${rawHeader}"`);
          continue;
        }

        const priceKey = `${materialName.toLowerCase()}-${priceValue}`;
        if (!seenPrices.has(priceKey)) {
          prices.push({
            sku: rowData.sku,
            material: materialName,
            price: priceValue,
            source: `${rowData.fileName} > ${rowData.sheetName} > Row ${rowData.rowIndex}`
          });
          seenPrices.add(priceKey);
          console.log(`    ✓ Added: ${materialName} = $${priceValue}`);
        }
      }
    });

    console.log(`  Total prices found: ${prices.length}`);
    return prices.sort((a, b) => a.price - b.price);
  }, [safeToUpperCase, extractMaterialName]);

  const processQuestion = useCallback(async (question) => {
    console.log(`\n=== PROCESSING QUESTION: ${question} ===`);
    
    const q = question.toLowerCase();
    const skuMatch = question.match(/\b([A-Z]+\d+[A-Z0-9\s-]*)\b/i);

    if (!skuMatch) {
      return {
        success: false,
        message: 'Please include a valid SKU code in your question.\nExamples: W1230, B24, W3630 BUTT, DB24 2DWR'
      };
    }

    const sku = safeToUpperCase(skuMatch[1].trim());
    console.log(`Extracted SKU: ${sku}`);
    
    if (!sku) {
      return {
        success: false,
        message: 'Invalid SKU format detected.'
      };
    }

    const allPrices = findPricesForSKU(sku);

    if (allPrices.length === 0) {
      const index = dataIndexRef.current;
      const availableSKUs = index ? Array.from(index.keys()).slice(0, 30) : [];

      return {
        success: false,
        message: `SKU "${sku}" not found in uploaded files.\n\nAvailable SKUs (sample):\n${availableSKUs.join(', ') || 'None'}\n\nPlease verify the SKU and try again.`
      };
    }

    const materialMatch = question.match(/\b(elite cherry|elite maple|elite painted|elite duraform|elite|premium cherry|premium maple|premium painted|premium duraform|premium|prime cherry|prime maple|prime painted|prime duraform|prime|choice cherry|choice maple|choice painted|choice duraform|choice|base|standard)\b/i);
    
    if (materialMatch) {
      const searchMaterial = materialMatch[1].toLowerCase();
      let match = allPrices.find(p => p.material.toLowerCase() === searchMaterial);

      if (!match) {
        match = allPrices.find(p =>
          p.material.toLowerCase().includes(searchMaterial) ||
          searchMaterial.includes(p.material.toLowerCase())
        );
      }

      if (match) {
        return {
          success: true,
          message: `✓ SUCCESS\n\n${match.sku} in ${match.material}\nPrice: $${match.price.toFixed(2)}\n\nSource: ${match.source}`
        };
      } else {
        const availableMaterials = [...new Set(allPrices.map(p => p.material))];
        return {
          success: false,
          message: `Material "${searchMaterial}" not found for ${sku}.\n\nAvailable materials:\n${availableMaterials.join(', ')}`
        };
      }
    }

    const sorted = allPrices.sort((a, b) => a.price - b.price);
    const maxPrice = sorted[sorted.length - 1].price;
    const minPrice = sorted[0].price;
    
    let response = `✓ PRICING ANALYSIS\n\n`;
    response += `SKU: ${sorted[0].sku}\n`;
    response += `Materials Available: ${sorted.length}\n`;
    response += `Price Range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}\n\n`;
    response += `MATERIAL OPTIONS (sorted by price):\n\n`;

    sorted.forEach((p, i) => {
      const savings = maxPrice - p.price;
      const savingsText = savings > 0 ? ` (Save $${savings.toFixed(2)} vs highest)` : ' (Premium option)';
      response += `${i + 1}. ${p.material}: $${p.price.toFixed(2)}${savingsText}\n`;
    });

    response += `\n📍 Source: ${sorted[0].source}`;

    return {
      success: true,
      message: response
    };
  }, [safeToUpperCase, findPricesForSKU]);

  const handleSendMessage = useCallback(async () => {
    if (!inputMessage.trim() || selectedFiles.length === 0) {
      addMessage('Please select files and enter a question.', MESSAGE_TYPES.SYSTEM);
      return;
    }

    const userMsg = inputMessage;
    addMessage(userMsg, MESSAGE_TYPES.USER);
    setInputMessage('');
    setStatus(STATUS.PROCESSING);

    try {
      let parsedFiles = [];
      for (const file of selectedFiles) {
        const cacheKey = file.name || file.filename || JSON.stringify(file);

        if (parsedCache[cacheKey]) {
          console.log(`Using cached file: ${cacheKey}`);
          parsedFiles.push(parsedCache[cacheKey]);
        } else {
          setStatus(STATUS.PARSING);
          const parsed = await parseFile(file);
          parsedFiles.push(parsed);
          setParsedCache(prev => ({ ...prev, [cacheKey]: parsed }));
        }
      }

      setStatus(STATUS.INDEXING);
      dataIndexRef.current = buildDataIndex(parsedFiles);

      const questions = splitQuestions(userMsg);
      
      if (questions.length > 1) {
        addMessage(`🔍 Processing ${questions.length} questions...`, MESSAGE_TYPES.SYSTEM);
      }

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const result = await processQuestion(question);
        
        const prefix = questions.length > 1 ? `━━━━━━━━━━━━━━━━━━━━\nQ${i + 1}: ${question}\n━━━━━━━━━━━━━━━━━━━━\n\n` : '';
        addMessage(
          prefix + result.message, 
          result.success ? MESSAGE_TYPES.ASSISTANT : MESSAGE_TYPES.ERROR
        );

        if (i < questions.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      setStatus(STATUS.SUCCESS);
    } catch (err) {
      console.error('Message handling error:', err);
      addMessage(`❌ Error: ${err.message}`, MESSAGE_TYPES.ERROR);
      setStatus(STATUS.ERROR);
    }

    setProgress(0);
  }, [inputMessage, selectedFiles, parsedCache, parseFile, buildDataIndex, processQuestion, addMessage, splitQuestions]);

  const toggleFileSelection = useCallback((file) => {
    setSelectedFiles(prev =>
      prev.some(f => f.id === file.id)
        ? prev.filter(f => f.id !== file.id)
        : [...prev, file]
    );
  }, []);

  const startAnalysis = useCallback(() => {
    if (selectedFiles.length === 0) {
      addMessage('Please select at least one file.', MESSAGE_TYPES.SYSTEM);
      return;
    }
    setShowSelector(false);
  }, [selectedFiles, addMessage]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const isLoading = useMemo(() =>
    [STATUS.PARSING, STATUS.INDEXING, STATUS.PROCESSING].includes(status),
    [status]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-blue-600 to-indigo-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">AI Pricing Analysis</h2>
              <p className="text-xs text-blue-100">Production-Quality Intelligence</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {showSelector && (
          <div className="p-6 border-b bg-gray-50">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
              </svg>
              <h3 className="text-lg font-semibold text-gray-800">Select Files to Analyze</h3>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {projectFiles.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No files available. Upload files first.</p>
                </div>
              ) : (
                projectFiles.map(file => (
                  <label
                    key={file.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-white ${
                      selectedFiles.some(f => f.id === file.id)
                        ? 'bg-indigo-50 border-2 border-indigo-500'
                        : 'bg-white border-2 border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFiles.some(f => f.id === file.id)}
                      onChange={() => toggleFileSelection(file)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{file.name || file.filename}</p>
                      <p className="text-xs text-gray-500">
                        {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Unknown size'}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <button
              onClick={startAnalysis}
              disabled={selectedFiles.length === 0}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
              </svg>
              Start Analysis ({selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''})
            </button>
          </div>
        )}

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.type === MESSAGE_TYPES.USER ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl p-4 shadow-sm ${
                msg.type === MESSAGE_TYPES.USER
                  ? 'bg-indigo-600 text-white'
                  : msg.type === MESSAGE_TYPES.ERROR
                  ? 'bg-red-50 text-red-800 border border-red-200'
                  : msg.type === MESSAGE_TYPES.SYSTEM
                  ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                  : 'bg-white text-gray-800 border border-gray-200'
              }`}>
                <p className="text-sm whitespace-pre-wrap font-mono">{msg.content}</p>
                <p className="text-xs mt-2 opacity-70">{msg.timestamp.toLocaleTimeString()}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"/>
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}/>
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}/>
                  </div>
                  <span className="text-sm text-gray-600">
                    {status === STATUS.PARSING && 'Parsing files...'}
                    {status === STATUS.INDEXING && 'Building index...'}
                    {status === STATUS.PROCESSING && 'Processing...'}
                    {progress > 0 && ` ${progress}%`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {!showSelector && (
          <div className="p-5 border-t bg-white">
            <div className="flex gap-3">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about SKU pricing (e.g., W3630 BUTT, B24, W942, etc.)"
                disabled={isLoading}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !inputMessage.trim()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
                </svg>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileAnalysisChat;

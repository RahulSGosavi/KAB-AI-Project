// src/components/FileAnalysisChat.jsx
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * FileAnalysisChat.jsx
 * - Smart file parsing for Excel / PDF / CSV / TXT
 * - Deterministic direct-analysis for SKU+Material, Frosted Glass, accessory lookups
 * - LLM fallback using Gemini (default) -> Groq -> OpenAI
 *
 * IMPORTANT:
 * - Put real API keys into environment variables and load them securely.
 * - For production, run LLM calls on the backend rather than exposing keys in frontend.
 */

const AIFileAnalysis = ({ isOpen, onClose, projectFiles = [] }) => {
  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showFileSelector, setShowFileSelector] = useState(true);

  // API keys - prefer environment variables in bundler/build
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
  const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

  useEffect(() => scrollToBottom(), [messages]);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setSelectedFiles([]);
      setShowFileSelector(true);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'assistant',
          content: `Welcome! I can analyze Excel, PDF, CSV, and text files. Upload or select files and ask natural questions â€” e.g., "What is the list price for W1842 under Prime Maple?"`,
          timestamp: new Date()
        }]);
      }, 120);
    }
  }, [isOpen]);

  const scrollToBottom = () => {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  /* -------------------- File parsing -------------------- */
  const readFileContent = async (file) => {
    try {
      let fileData;
      let fileName = file.name || 'unknown';
      let fileType = file.type || '';

      // If File object
      if (file instanceof File) {
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
      } else if (file.url) {
        // projectFiles with url
        let fileUrl = file.url;
        if (!fileUrl.startsWith('http')) {
          const apiBase = import.meta.env.VITE_API_URL || '';
          const staticBase = apiBase ? apiBase.replace(/\/api$/, '') : '';
          fileUrl = `${staticBase}${fileUrl}`;
        }
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`Failed to fetch file: ${resp.status}`);
        fileData = await resp.arrayBuffer();
        fileType = resp.headers.get('content-type') || file.type || '';
      } else {
        throw new Error('Invalid file object');
      }

      const ext = fileName.toLowerCase().split('.').pop();

      if (ext === 'xlsx' || ext === 'xls' || fileType.includes('spreadsheet') || fileType.includes('excel')) {
        return await parseExcelFile(fileData, fileName);
      } else if (ext === 'pdf' || fileType.includes('pdf')) {
        return await parsePdfFile(fileData, fileName);
      } else if (ext === 'csv' || fileType.includes('csv')) {
        return await parseCsvFile(fileData, fileName);
      } else {
        return await parseTextFile(fileData, fileName);
      }
    } catch (err) {
      console.error('readFileContent error:', err);
      throw err;
    }
  };

  const parseExcelFile = async (fileData, fileName) => {
    try {
      const workbook = XLSX.read(fileData, { type: 'array' });
      const result = { filename: fileName, sheets: [], summaryText: '' };
      let summary = `Excel File: ${fileName}\nSheets: ${workbook.SheetNames.join(', ')}\n\n`;

      workbook.SheetNames.forEach(sheetName => {
        const ws = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!json || json.length === 0) return;

        // Detect header row (first row with at least 2 non-empty cells)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(8, json.length); i++) {
          const nonEmpty = json[i].filter(c => c !== '' && c !== null && c !== undefined).length;
          if (nonEmpty >= 2) { headerRowIndex = i; break; }
        }

        const rawHeaders = json[headerRowIndex].map(h => String(h || '').trim());
        const headers = rawHeaders.map(h => String(h).replace(/\s+/g, ' ').replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase());

        const rows = [];
        for (let r = headerRowIndex + 1; r < json.length; r++) {
          const row = json[r];
          if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
          const cells = headers.map((_, idx) => {
            const raw = row[idx];
            return raw === undefined || raw === null ? '' : String(raw).trim();
          });
          rows.push({ rowIndex: r + 1, cells });
        }

        result.sheets.push({ name: sheetName.toLowerCase(), headers, rows });
        summary += `=== SHEET: ${sheetName} ===\nHeaders: ${headers.join(' | ')}\nRows: ${rows.length}\n\n`;
        for (let i = 0; i < Math.min(3, rows.length); i++) summary += `Row ${rows[i].rowIndex}: ${rows[i].cells.join(' | ')}\n`;
        summary += '\n';
      });

      result.summaryText = summary;
      return result;
    } catch (err) {
      console.error('parseExcelFile error:', err);
      throw err;
    }
  };

  const parsePdfFile = async (fileData, fileName) => {
    try {
      const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
      let text = '';
      const pagesToRead = Math.min(pdf.numPages, 20);
      for (let i = 1; i <= pagesToRead; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        text += `\n\n--- PAGE ${i} ---\n${pageText}`;
      }
      return { filename: fileName, pages: pdf.numPages, text, summaryText: text.substring(0, 3000) };
    } catch (err) {
      console.error('parsePdfFile error:', err);
      return { filename: fileName, pages: 0, text: '', summaryText: `PDF File: ${fileName}\n(Content extraction failed)` };
    }
  };

  const parseCsvFile = async (fileData, fileName) => {
    try {
      const text = new TextDecoder().decode(fileData);
      const lines = text.split(/\r?\n/);
      const rows = lines.slice(0, 500).map((l, i) => ({ rowIndex: i + 1, line: l }));
      return { filename: fileName, rows, summaryText: `CSV File: ${fileName}\nRows: ${lines.length}\n\n${lines.slice(0, 50).join('\n')}` };
    } catch (err) {
      console.error('parseCsvFile error:', err);
      throw err;
    }
  };

  const parseTextFile = async (fileData, fileName) => {
    try {
      const text = new TextDecoder().decode(fileData);
      const lines = text.split(/\r?\n/);
      return { filename: fileName, lines, summaryText: `Text File: ${fileName}\nLines: ${lines.length}\n\n${lines.slice(0, 200).join('\n')}` };
    } catch (err) {
      console.error('parseTextFile error:', err);
      throw err;
    }
  };

  /* -------------------- Helpers: term extraction & numeric helpers -------------------- */
  const extractTermsFromQuestion = (q) => {
    const terms = [];
    const low = q.toLowerCase();

    // SKU pattern like W1842 (letter + digits) or A123
    const skuMatch = q.match(/\b[A-Za-z]\d{2,6}\b/);
    if (skuMatch) terms.push(skuMatch[0].toLowerCase());

    // materials and keywords
    const keywords = ['prime maple', 'prime', 'maple', 'cherry', 'oak', 'walnut', 'frosted', 'glass', 'price', 'list price', 'mi', 'matching interior', 'door', '36', 'inch', 'inches'];
    keywords.forEach(k => { if (low.includes(k)) terms.push(k); });

    // numbers
    const nums = q.match(/\d+/g);
    if (nums) nums.forEach(n => terms.push(n));

    return [...new Set(terms)];
  };

  const extractNumbersFromRow = (cells) => {
    const nums = [];
    for (const c of cells) {
      const match = String(c).replace(/[,]/g, '').match(/-?\d+(\.\d+)?/g);
      if (match) match.forEach(m => nums.push(Number(m)));
    }
    return nums.sort((a,b)=>b-a);
  };
  const extractIntsFromRow = (cells) => {
    const ints = [];
    for (const c of cells) {
      const match = String(c).match(/\b\d+\b/g);
      if (match) match.forEach(m => ints.push(Number(m)));
    }
    return ints.sort((a,b)=>b-a);
  };

  /* -------------------- filterRelevantData: compact context for LLM -------------------- */
  const filterRelevantData = (question, parsedFile) => {
    if (!parsedFile) return '';
    const q = question.toLowerCase();
    const contextParts = [`=== FILE: ${parsedFile.filename} ===`];

    if (parsedFile.sheets && parsedFile.sheets.length) {
      for (const sheet of parsedFile.sheets) {
        // âœ… FIXED: Safe .toUpperCase() with fallback
        contextParts.push(`SHEET: ${(sheet.name || 'Unknown').toUpperCase()}`);
        contextParts.push(`HEADERS: ${sheet.headers.join(' | ')}`);

        const terms = extractTermsFromQuestion(question);
        let matchedRows = [];

        for (const r of sheet.rows) {
          const rowText = (r.cells || []).join(' ').toLowerCase();
          if (terms.some(t => rowText.includes(String(t)))) matchedRows.push({ row: r, rowText });
        }

        if (matchedRows.length === 0) {
          // looser fallback: keywords
          for (const r of sheet.rows) {
            const rowText = (r.cells || []).join(' ').toLowerCase();
            if ((q.includes('frosted') && rowText.includes('frosted')) ||
                (q.includes('36') && rowText.includes('36')) ||
                (q.includes('w1842') && rowText.includes('w1842')) ||
                (q.includes('matching interior') && rowText.includes('matching'))) {
              matchedRows.push({ row: r, rowText });
            }
          }
        }

        matchedRows = matchedRows.slice(0, 8);
        if (matchedRows.length > 0) {
          contextParts.push(`MATCHED_ROWS:`);
          matchedRows.forEach(mr => contextParts.push(`Row ${mr.row.rowIndex}: ${mr.row.cells.join(' | ')}`));
        } else {
          const samples = sheet.rows.slice(0, 2);
          samples.forEach(s => contextParts.push(`Sample Row ${s.rowIndex}: ${s.cells.join(' | ')}`));
        }
      }
    } else {
      if (parsedFile.summaryText) contextParts.push(parsedFile.summaryText.substring(0, 2000));
    }

    return contextParts.join('\n');
  };

  /* -------------------- Build LLM payloads -------------------- */
  const buildLLMPayload = (provider, question, fileContexts) => {
    const combinedContext = fileContexts.map(fc => `--- ${fc.filename} ---\n${fc.context}`).join('\n\n');
    const systemPrompt = `You are a helpful, precise assistant. Use ONLY the provided context to answer. Be concise (max 80 words). Provide a one-line Source: with sheet + row info or exact row text used. If you assume anything, state it briefly.`;

    const userPrompt = `Question: ${question}\n\nContext:\n${combinedContext}\n\nTask: Answer concisely with a short explanation and a Source line.`;

    if (provider === 'gemini') {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
        body: {
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { maxOutputTokens: 160, temperature: 0.02 }
        },
        headers: { 'Content-Type': 'application/json' }
      };
    } else if (provider === 'openai') {
      return {
        url: `https://api.openai.com/v1/chat/completions`,
        body: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 200,
          temperature: 0.1
        },
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` }
      };
    } else if (provider === 'groq') {
      return {
        url: `https://api.groq.com/openai/v1/chat/completions`,
        body: {
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 200,
          temperature: 0.05
        },
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` }
      };
    }
    return null;
  };

  /* -------------------- LLM call wrappers -------------------- */
  const callGeminiAPI = async (question, fileContexts) => {
    if (!GEMINI_API_KEY) throw new Error('Gemini API key missing (VITE_GEMINI_API_KEY).');
    const payload = buildLLMPayload('gemini', question, fileContexts);
    const resp = await fetch(payload.url, { method: 'POST', headers: payload.headers, body: JSON.stringify(payload.body) });
    if (!resp.ok) {
      const et = await resp.text();
      throw new Error(`Gemini error ${resp.status}: ${et}`);
    }
    const data = await resp.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  };

  const callOpenAIAPI = async (question, fileContexts) => {
    if (!OPENAI_API_KEY) throw new Error('OpenAI API key missing (VITE_OPENAI_API_KEY).');
    const payload = buildLLMPayload('openai', question, fileContexts);
    const resp = await fetch(payload.url, { method: 'POST', headers: payload.headers, body: JSON.stringify(payload.body) });
    if (!resp.ok) {
      const et = await resp.text();
      throw new Error(`OpenAI error ${resp.status}: ${et}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || '';
  };

  const callGroqAPI = async (question, fileContexts) => {
    if (!GROQ_API_KEY) throw new Error('Groq API key missing (VITE_GROQ_API_KEY).');
    const payload = buildLLMPayload('groq', question, fileContexts);
    const resp = await fetch(payload.url, { method: 'POST', headers: payload.headers, body: JSON.stringify(payload.body) });
    if (!resp.ok) {
      const et = await resp.text();
      throw new Error(`Groq error ${resp.status}: ${et}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || '';
  };

  /* -------------------- Deterministic direct analysis (smart) -------------------- */
  const provideDirectAnalysis = async (question, parsedFiles) => {
    try {
      const q = question.toLowerCase();
      const terms = extractTermsFromQuestion(question);

      // 1) SKU + Material lookup (e.g., "W1842" + "prime maple")
      if (terms.some(t => /^[a-z]\d{2,6}$/.test(t)) && (q.includes('prime') || q.includes('maple') || q.includes('cherry') || q.includes('oak') || q.includes('walnut') || q.includes('elite'))) {
        const sku = terms.find(t => /^[a-z]\d{2,6}$/.test(t));
        for (const pf of parsedFiles) {
          if (!pf.sheets) continue;
          for (const sheet of pf.sheets) {
            // Prefer rows where SKU appears in cells
            const candidates = sheet.rows.filter(r => (r.cells || []).join(' ').toLowerCase().includes(sku));
            for (const r of candidates) {
              const rowText = (r.cells || []).join(' | ');
              // Try to find the material column index by header match
              const materialNames = ['prime maple', 'prime', 'maple', 'cherry', 'oak', 'walnut', 'elite'];
              let foundPrice = null;
              // If headers present, try to match header containing material
              if (sheet.headers && sheet.headers.length) {
                for (let i = 0; i < sheet.headers.length; i++) {
                  const h = sheet.headers[i];
                  for (const mat of materialNames) {
                    if (h.includes(mat.replace(/\s/g, ''))) {
                      const cellVal = r.cells[i];
                      const numbers = extractNumbersFromRow([cellVal]);
                      if (numbers.length) { foundPrice = numbers[0]; break; }
                    }
                  }
                  if (foundPrice) break;
                }
              }
              // If header-based fails, search entire row for material+number
              if (!foundPrice) {
                for (const mat of materialNames) {
                  if ((r.cells || []).join(' ').toLowerCase().includes(mat)) {
                    const numbers = extractNumbersFromRow(r.cells || []);
                    if (numbers.length) { foundPrice = numbers[0]; break; }
                  }
                }
              }

              if (foundPrice !== null) {
                const priceStr = Number(foundPrice).toFixed(2);
                // âœ… FIXED: Safe .toUpperCase() with fallback
                return `âœ… The list price for ${(sku || '').toUpperCase()} under the requested material is $${priceStr}.\n\nSource: ${pf.filename} â†’ ${sheet.name} â†’ Row ${r.rowIndex}\n\n(If you want the exact column name, ask: "Show header names for this row.")`;
              }
            }
          }
        }
      }

      // 2) Frosted Glass + size (e.g., "36" or 36-inch)
      if (q.includes('frosted') || q.includes('frost')) {
        for (const pf of parsedFiles) {
          if (!pf.sheets) continue;
          for (const sheet of pf.sheets) {
            for (const r of sheet.rows) {
              const rowText = (r.cells || []).join(' ').toLowerCase();
              if (rowText.includes('frost') && (rowText.includes('36') || q.includes('36'))) {
                const prices = extractNumbersFromRow(r.cells);
                if (prices.length > 0) {
                  // Heuristic: if an int quantity present that's >1 and small, treat price/qty; else price is per-door
                  const ints = extractIntsFromRow(r.cells);
                  let perDoor = prices[0];
                  let assumption = 'Assumed the numeric value is price per door/insert.';
                  if (ints.length > 0) {
                    const possibleQty = ints.find(n => n > 1 && n < 500);
                    if (possibleQty && prices[0] > possibleQty) {
                      perDoor = prices[0] / possibleQty;
                      assumption = `Assumed ${prices[0]} was total for ${possibleQty} inserts; computed per-door price.`;
                    }
                  }
                  return `âœ… The list price per door for Frosted Glass (36") is $${Number(perDoor).toFixed(2)}.\n\nSource: ${pf.filename} â†’ ${sheet.name} â†’ Row ${r.rowIndex}\n\n${assumption}`;
                } else {
                  return `I found a Frosted Glass entry near 36" in ${pf.filename} â†’ ${sheet.name} â†’ Row ${r.rowIndex} but couldn't detect a numeric price in that row. Row content: "${(r.cells || []).join(' | ')}"`;
                }
              }
            }
          }
        }
      }

      // 3) Generic Excel search: find first row that contains any question token and return sample
      for (const pf of parsedFiles) {
        if (!pf.sheets) continue;
        for (const sheet of pf.sheets) {
          for (const r of sheet.rows) {
            const rowText = (r.cells || []).join(' ').toLowerCase();
            if (terms.some(t => rowText.includes(String(t)))) {
              // If question asks for price, try to extract a numeric
              if (q.includes('price') || q.includes('$') || q.includes('list')) {
                const nums = extractNumbersFromRow(r.cells || []);
                if (nums.length > 0) {
                  return `âœ… Found a matching row. Price-like value detected: $${Number(nums[0]).toFixed(2)}.\n\nSource: ${pf.filename} â†’ ${sheet.name} â†’ Row ${r.rowIndex}\nRow: ${(r.cells || []).join(' | ')}`;
                }
              }
              return `âœ… Found a matching row in ${pf.filename} â†’ ${sheet.name} â†’ Row ${r.rowIndex}.\n\nRow sample: ${(r.cells || []).join(' | ')}\n\nIf you want a precise value, ask "What is the price in this row?" or "Show header names for this sheet."`;
            }
          }
        }
      }

      // 4) PDF fallback - search text blocks
      for (const pf of parsedFiles) {
        if (pf.text) {
          const lines = pf.text.split('\n').map(s => s.trim()).filter(Boolean);
          const matches = lines.filter(l => {
            return terms.some(t => l.toLowerCase().includes(String(t)));
          });
          if (matches.length > 0) {
            return `âœ… Found matches in PDF ${pf.filename}:\n\n${matches.slice(0,5).join('\n')}\n\nSource: ${pf.filename}`;
          }
        }
      }

      // Nothing found
      const availableSheets = parsedFiles.flatMap(pf => (pf.sheets || []).map(s => `${pf.filename}:${s.name}`)).slice(0, 10);
      return `I couldn't find a direct match for "${question}" in the uploaded file(s). Available sheets: ${availableSheets.join(', ')}. Try asking "show frosted glass rows" or "show rows for W1842".`;
    } catch (err) {
      console.error('provideDirectAnalysis error:', err);
      return `Analysis error: ${err.message}`;
    }
  };

  /* -------------------- Orchestration: handle send -------------------- */
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading || selectedFiles.length === 0) return;

    const userMessage = { id: Date.now(), type: 'user', content: inputMessage, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Parse selected files
      const parsedFiles = [];
      for (const f of selectedFiles) {
        try {
          const parsed = await readFileContent(f);
          parsedFiles.push(parsed);
        } catch (err) {
          console.warn('Could not parse file', f.name, err);
        }
      }

      if (parsedFiles.length === 0) {
        setMessages(prev => [...prev, { id: Date.now()+1, type: 'assistant', content: `I couldn't read any of the selected files.`, timestamp: new Date() }]);
        setIsLoading(false);
        return;
      }

      // Build file contexts for LLM
      const fileContexts = parsedFiles.map(pf => ({ filename: pf.filename, context: filterRelevantData(inputMessage, pf) }));

      // 1) Try Gemini (default) -> Groq -> OpenAI
      let responseText = '';
      try {
        responseText = await callGeminiAPI(inputMessage, fileContexts);
      } catch (gErr) {
        console.warn('Gemini failed, trying Groq/OpenAI', gErr.message || gErr);
        try {
          responseText = await callGroqAPI(inputMessage, fileContexts);
        } catch (groqErr) {
          console.warn('Groq failed, trying OpenAI', groqErr.message || groqErr);
          try {
            responseText = await callOpenAIAPI(inputMessage, fileContexts);
          } catch (openErr) {
            console.warn('All LLMs failed, falling back to deterministic analysis', openErr.message || openErr);
            responseText = await provideDirectAnalysis(inputMessage, parsedFiles);
          }
        }
      }

      // If LLM output is empty or clearly irrelevant, run the deterministic analysis
      if (!responseText || responseText.length < 8 || responseText.toLowerCase().includes('i could not')) {
        const fallback = await provideDirectAnalysis(inputMessage, parsedFiles);
        responseText = fallback;
      }

      const assistantMessage = { id: Date.now()+1, type: 'assistant', content: responseText, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    } catch (err) {
      console.error('handleSendMessage error:', err);
      setMessages(prev => [...prev, { id: Date.now()+1, type: 'assistant', content: `Error: ${err.message}`, timestamp: new Date() }]);
      setToast({ message: `Error: ${err.message}`, type: 'error' });
      setIsLoading(false);
    }
  };

  /* -------------------- UI handlers -------------------- */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  const handleFileSelection = (file, isSelected) => {
    if (isSelected) setSelectedFiles(prev => [...prev, file]);
    else setSelectedFiles(prev => prev.filter(f => f.id !== file.id));
  };

  const handleStartAnalysis = () => {
    if (selectedFiles.length === 0) { setToast({ message: 'Please select at least one file', type: 'error' }); return; }
    setShowFileSelector(false);
    setMessages(prev => [...prev, { id: Date.now(), type: 'assistant', content: `Great! I've loaded ${selectedFiles.length} file(s) for analysis. You can now ask me questions about the data in these files.`, timestamp: new Date() }]);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = await readFileContent(file); // parse to ensure readability
      // wrap file with id for selection
      const wrapped = { ...file, id: Date.now() };
      setSelectedFiles(prev => [...prev, wrapped]);
      setMessages(prev => [...prev, { id: Date.now(), type: 'assistant', content: `File "${file.name}" uploaded and parsed. You can now ask questions.`, timestamp: new Date() }]);
      setToast({ message: 'File uploaded successfully', type: 'success' });
    } catch (err) {
      console.error('handleFileUpload error:', err);
      setToast({ message: 'Error reading file', type: 'error' });
    }
  };

  if (!isOpen) return null;

  /* -------------------- Render UI -------------------- */
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">AI File Analysis</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">Ã—</button>
        </div>

        {/* Chat Container */}
        <div id="chat-container" className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(message => (
            <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-lg ${message.type === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div className="text-xs opacity-70 mt-1">{new Date(message.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 p-3 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span>Analyzing files...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* File Selector */}
        {showFileSelector && (
          <div className="p-4 border-t border-gray-200">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Select Files to Analyze</h3>
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-blue-800"><strong>Multi-file analysis benefits:</strong> Cross-reference data, compare SKUs, and get deterministic, chat-style answers.</p>
              </div>

              {projectFiles.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Project Files:</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {projectFiles.map(file => (
                      <label key={file.id || file.name} className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={selectedFiles.some(f => f.id === file.id)} onChange={(e) => handleFileSelection(file, e.target.checked)} className="rounded" />
                        <span className="text-sm text-gray-700">{file.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Upload New File:</h4>
                <input type="file" accept=".xlsx,.xls,.pdf,.csv,.txt" onChange={handleFileUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </div>
            </div>

            <button onClick={handleStartAnalysis} disabled={selectedFiles.length === 0} className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed">
              Start Multi-File Analysis ({selectedFiles.length} files selected)
            </button>
          </div>
        )}

        {/* Input Area */}
        {!showFileSelector && (
          <div className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <textarea value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyPress={handleKeyPress} placeholder={`Ask me anything about your ${selectedFiles.length} selected file(s)...`} className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} disabled={isLoading} />
              <button onClick={handleSendMessage} disabled={!inputMessage.trim() || isLoading} className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed">
                {isLoading ? 'Analyzing...' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 p-3 rounded-lg shadow-lg z-50 ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIFileAnalysis;
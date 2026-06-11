import { createWorker, OEM } from 'tesseract.js';

// ─── Image Preprocessing ──────────────────────────────────────────────────────
// Forex Factory calendar screenshots have dark backgrounds, small fonts, and
// colored icons. Tesseract requires high-contrast light-background images for
// reliable text extraction. We preprocess by:
//   1. Scaling up to 3× to make characters larger (key for accuracy)
//   2. Detecting if dark-themed and inverting to light background
//   3. Converting to grayscale with contrast boost
//   4. Returning a data URL for Tesseract to consume

const preprocessForOcr = (base64Image) => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // ── 1. Scale to at least 3000px wide (Tesseract accuracy ∝ pixel density)
      const SCALE = 3;
      const targetW = img.width * SCALE;
      const targetH = img.height * SCALE;

      const canvas = document.createElement('canvas');
      canvas.width  = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Draw white base (handles any transparency)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // ── 2. Sample average brightness to decide if we need to invert
      const sample = ctx.getImageData(0, 0, Math.min(200, targetW), Math.min(200, targetH));
      let sumLum = 0;
      for (let i = 0; i < sample.data.length; i += 4) {
        sumLum += 0.299 * sample.data[i] + 0.587 * sample.data[i + 1] + 0.114 * sample.data[i + 2];
      }
      const avgLum = sumLum / (sample.data.length / 4);
      const isDarkTheme = avgLum < 100; // Forex Factory dark theme threshold

      // ── 3. Process all pixels: grayscale + contrast + optional invert
      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        // Convert to grayscale (perceived luminance weights)
        let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

        // Invert dark-background images so text becomes dark on white
        if (isDarkTheme) gray = 255 - gray;

        // Apply sigmoid-style contrast stretch to push mid-tones toward extremes
        // This sharpens text edges significantly
        gray = gray / 255;
        // S-curve: compress midtones, expand near black/white
        gray = gray < 0.5
          ? 2 * gray * gray
          : 1 - Math.pow(-2 * gray + 2, 2) / 2;
        gray = Math.round(gray * 255);

        d[i]     = gray;
        d[i + 1] = gray;
        d[i + 2] = gray;
        // alpha unchanged
      }

      ctx.putImageData(imgData, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = (e) => reject(new Error('Failed to load image for preprocessing'));
    img.src = base64Image;
  });
};

// ─── RGB → HSL helper for impact color detection ─────────────────────────────
const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
};

// ─── Folder impact color detection from canvas pixels ────────────────────────
// We sample pixels to the right of the currency token in the ORIGINAL image
// (not the preprocessed one) for accurate color detection.
const detectFolderColor = (ctx, curX1, curY0, curY1) => {
  const searchWidth  = 45;
  const searchHeight = (curY1 - curY0) + 10;
  const searchX      = curX1 + 8;
  const searchY      = curY0 - 5;

  try {
    const imgData = ctx.getImageData(searchX, searchY, searchWidth, searchHeight);
    const data    = imgData.data;

    let redCount = 0, orangeCount = 0, yellowCount = 0, grayCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 150) continue;

      const hsl = rgbToHsl(r, g, b);

      if (hsl.s < 15 && hsl.l > 25 && hsl.l < 85) { grayCount++; continue; }

      if ((hsl.h >= 0 && hsl.h < 15) || (hsl.h >= 345 && hsl.h <= 360)) {
        if (hsl.s > 45 && hsl.l > 25 && hsl.l < 75) redCount++;
      } else if (hsl.h >= 15 && hsl.h < 42) {
        if (hsl.s > 50 && hsl.l > 25 && hsl.l < 75) orangeCount++;
      } else if (hsl.h >= 42 && hsl.h < 75) {
        if (hsl.s > 45 && hsl.l > 25 && hsl.l < 85) yellowCount++;
      } else if (hsl.s < 20) {
        grayCount++;
      }
    }

    let maxColor = 'Gray', maxVal = 10;
    if (redCount    > maxVal)                                              { maxColor = 'Red';    maxVal = redCount; }
    if (orangeCount > maxVal && orangeCount > redCount)                    { maxColor = 'Orange'; maxVal = orangeCount; }
    if (yellowCount > maxVal && yellowCount > orangeCount && yellowCount > redCount) { maxColor = 'Yellow'; }
    if (grayCount   > maxVal && grayCount > yellowCount && grayCount > orangeCount && grayCount > redCount) { maxColor = 'Gray'; }

    return maxColor;
  } catch {
    return 'Gray';
  }
};

// ─── Main OCR entry point ─────────────────────────────────────────────────────
export const parseScreenshotLocally = async (base64Image, importYear, progressCallback) => {
  const cb = (msg) => { if (progressCallback) progressCallback(msg); };

  cb('Preprocessing image for OCR...');

  // Preprocess BEFORE handing to Tesseract for maximum accuracy
  let processedImage;
  try {
    processedImage = await preprocessForOcr(base64Image);
    cb('Image prepared — initializing OCR engine...');
  } catch (prepErr) {
    console.warn('Preprocessing failed, using original image:', prepErr);
    processedImage = base64Image;
    cb('Initializing OCR engine...');
  }

  // ── Logger callback — safe in Tesseract.js v7 (lives outside postMessage) ──
  const loggerFn = (m) => {
    if (m.status === 'recognizing text') {
      cb(`Extracting text: ${Math.round(m.progress * 100)}%`);
    } else if (m.status === 'loading tesseract core') {
      cb('Loading OCR core engine...');
    } else if (m.status === 'initializing tesseract') {
      cb('Initializing Tesseract...');
    } else if (m.status === 'loading language traineddata') {
      cb('Loading language model (first time only — cached after this)...');
    } else if (m.status === 'initializing api') {
      cb('Starting OCR API...');
    }
  };

  let worker = null;
  let words  = [];

  try {
    // Tesseract.js v7 API: createWorker(langs, oem, options)
    // langPath points to local public folder — no CDN calls after first cache
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: '/tesseract/worker.min.js',
      corePath:   '/tesseract/tesseract-core-lstm.wasm.js',
      langPath:   '/tesseract',         // ← local eng.traineddata.gz
      logger:     loggerFn,
    });

    cb('Running text recognition...');
    const result = await worker.recognize(processedImage);
    words = result.data?.words || [];

  } catch (err) {
    console.error('Tesseract worker failed (local):', err);

    // Fallback: CDN language data, no worker path override
    try {
      cb('Retrying with CDN language data...');
      if (worker) { try { await worker.terminate(); } catch (_) {} worker = null; }

      worker = await createWorker('eng', OEM.LSTM_ONLY, {
        logger: (m) => {
          if (m.status === 'recognizing text')
            cb(`Extracting text (fallback): ${Math.round(m.progress * 100)}%`);
          else if (m.status === 'loading language traineddata')
            cb('Downloading language data from CDN (~10MB, one time)...');
        },
      });

      const result = await worker.recognize(processedImage);
      words = result.data?.words || [];

    } catch (fallbackErr) {
      console.error('Tesseract fallback also failed:', fallbackErr);
      throw new Error(
        `OCR engine failed. ${fallbackErr.message || fallbackErr}\n\n` +
        `TIP: For best results, copy rows directly from the Forex Factory website and press Ctrl+V — no OCR needed!`
      );
    }
  } finally {
    if (worker) { try { await worker.terminate(); } catch (_) {} }
  }

  // ─── Validate: did we actually get words? ────────────────────────────────
  if (!words || words.length === 0) {
    throw new Error(
      'OCR completed but found no readable text.\n\n' +
      'Common causes:\n' +
      '• The image resolution is too low (paste a full-size screenshot)\n' +
      '• The browser compressed the clipboard image — try saving as PNG and uploading via the file picker\n\n' +
      'RECOMMENDED: Copy calendar rows directly from Forex Factory and Ctrl+V here — instant, perfect accuracy!'
    );
  }

  cb('Analyzing table layout...');

  // ─── Build original-image canvas for color sampling ──────────────────────
  const origImg = new Image();
  await new Promise((res, rej) => {
    origImg.onload = res;
    origImg.onerror = rej;
    origImg.src = base64Image; // original, NOT preprocessed
  });

  const canvas  = document.createElement('canvas');
  canvas.width  = origImg.width;
  canvas.height = origImg.height;
  const ctx     = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(origImg, 0, 0);

  // ─── The word coordinates come from the PREPROCESSED 3× image ────────────
  // We need to scale them back down to original dimensions for color detection
  const scaleBack = origImg.width / (origImg.width * 3);

  // ─── Group words into horizontal lines ───────────────────────────────────
  const Y_TOL = 14;
  const lines  = [];

  words.forEach(word => {
    // Scale bbox back from preprocessed coords to original coords
    const scaledWord = {
      text: word.text,
      bbox: {
        x0: word.bbox.x0 * scaleBack,
        x1: word.bbox.x1 * scaleBack,
        y0: word.bbox.y0 * scaleBack,
        y1: word.bbox.y1 * scaleBack,
      }
    };
    const wordY  = (scaledWord.bbox.y0 + scaledWord.bbox.y1) / 2;
    let placed   = false;

    for (const line of lines) {
      if (Math.abs(line.yCenter - wordY) < Y_TOL) {
        line.words.push(scaledWord);
        line.yCenter = line.words.reduce((s, w) => s + (w.bbox.y0 + w.bbox.y1) / 2, 0) / line.words.length;
        placed = true;
        break;
      }
    }
    if (!placed) lines.push({ yCenter: wordY, words: [scaledWord] });
  });

  lines.sort((a, b) => a.yCenter - b.yCenter);
  lines.forEach(line => line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));

  // ─── Cluster words into phrases (horizontal proximity) ───────────────────
  const X_TOL = 22;
  const linePhrases = [];

  lines.forEach(line => {
    const phrases = [];
    let cur = null;

    line.words.forEach(word => {
      const t = word.text.trim();
      if (!t) return;

      if (!cur) {
        cur = { text: t, x0: word.bbox.x0, x1: word.bbox.x1, y0: word.bbox.y0, y1: word.bbox.y1 };
      } else {
        const gap = word.bbox.x0 - cur.x1;
        if (gap < X_TOL) {
          cur.text += ' ' + t;
          cur.x1    = word.bbox.x1;
          cur.y0    = Math.min(cur.y0, word.bbox.y0);
          cur.y1    = Math.max(cur.y1, word.bbox.y1);
        } else {
          phrases.push(cur);
          cur = { text: t, x0: word.bbox.x0, x1: word.bbox.x1, y0: word.bbox.y0, y1: word.bbox.y1 };
        }
      }
    });

    if (cur) phrases.push(cur);
    if (phrases.length > 0) linePhrases.push({ yCenter: line.yCenter, phrases });
  });

  // ─── Map phrases to economic calendar rows ────────────────────────────────
  const CURRENCIES = ['USD','EUR','GBP','AUD','CAD','CHF','JPY','NZD','CNY','HKD','SGD','INR','MXN','ZAR'];
  const MONTHS     = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  let currentDate = '';
  let currentTime = '';
  const parsedRows = [];

  const isNumberFigure = (text) =>
    /^[+-]?\d+([.,]\d+)?%?[KkMmbB]?$/.test(text) || text === '-' || text === '--';

  // Auto-detect column thresholds from number positions
  const numberPositions = [];
  linePhrases.forEach(line => {
    const ci = line.phrases.findIndex(p => CURRENCIES.includes(p.text.toUpperCase()));
    if (ci !== -1) {
      line.phrases.slice(ci + 2).forEach(p => {
        if (isNumberFigure(p.text)) numberPositions.push((p.x0 + p.x1) / 2);
      });
    }
  });

  numberPositions.sort((a, b) => a - b);
  let colThresholds = [origImg.width * 0.75, origImg.width * 0.85];

  if (numberPositions.length >= 3) {
    const minX = numberPositions[0];
    const maxX = numberPositions[numberPositions.length - 1];
    const range = maxX - minX;
    colThresholds = [minX + range * 0.35, minX + range * 0.7];
  }

  const parseDateLocal = (text, year) => {
    const cleaned = text.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*/i, '');
    const parts   = cleaned.split(/\s+/);
    if (parts.length < 2) return '';
    const monthName = parts[0].substring(0, 3).toLowerCase();
    const dayNum    = parseInt(parts[1]);
    if (isNaN(dayNum) || !MONTHS.includes(monthName)) return '';
    const mm = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
    return `${year}-${mm[monthName]}-${dayNum.toString().padStart(2, '0')}`;
  };

  linePhrases.forEach((line, idx) => {
    const curIdx = line.phrases.findIndex(p => CURRENCIES.includes(p.text.toUpperCase()));
    if (curIdx === -1) return;

    const curPhrase = line.phrases[curIdx];
    const currency  = curPhrase.text.toUpperCase();

    // Date
    for (let i = 0; i < curIdx; i++) {
      const txt = line.phrases[i].text;
      if (MONTHS.some(m => txt.toLowerCase().includes(m))) {
        const parsed = parseDateLocal(txt, importYear);
        if (parsed) currentDate = parsed;
        break;
      }
    }

    // Time
    for (let i = 0; i < curIdx; i++) {
      const txt = line.phrases[i].text;
      if (/\d+:\d+/i.test(txt) || /am|pm|day/i.test(txt)) currentTime = txt;
    }

    // News title (phrase after currency)
    let newsName = 'Economic Event';
    if (curIdx + 1 < line.phrases.length) newsName = line.phrases[curIdx + 1].text;

    // Folder color (pixel sample from original image)
    const folderColor = detectFolderColor(ctx, curPhrase.x1, curPhrase.y0, curPhrase.y1);

    // Actual / Forecast / Previous (numeric figures after title)
    let actual = '', forecast = '', previous = '';
    const figures = line.phrases.slice(curIdx + 2).filter(p => isNumberFigure(p.text));

    figures.forEach(p => {
      const xc = (p.x0 + p.x1) / 2;
      if      (xc < colThresholds[0]) actual   = p.text;
      else if (xc < colThresholds[1]) forecast  = p.text;
      else                             previous  = p.text;
    });

    if (figures.length === 1 && !actual && !forecast && !previous) actual = figures[0].text;
    if (figures.length === 2 && !actual && !forecast && !previous) { actual = figures[0].text; forecast = figures[1].text; }

    parsedRows.push({
      id: Date.now() + idx + Math.random(),
      sr_num:       parsedRows.length + 1,
      news_date:    currentDate || `${importYear}-01-01`,
      news_time:    currentTime || 'All Day',
      currency,
      folder_color: folderColor,
      news_name:    newsName,
      actual,
      forecast,
      previous,
    });
  });

  if (parsedRows.length === 0) {
    throw new Error(
      'OCR read text but could not find standard calendar columns (Currency tag like USD/EUR, Event Name).\n\n' +
      'Make sure you paste a screenshot of the Forex Factory calendar table — the one with Date, Currency, Impact, and Event Name columns.\n\n' +
      'RECOMMENDED: Copy rows directly from the Forex Factory website and Ctrl+V here for instant, 100% accurate results!'
    );
  }

  return parsedRows;
};

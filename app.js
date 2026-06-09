const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const fileInfo = document.getElementById('fileInfo');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const img = document.getElementById('sourceImage');
const video = document.getElementById('sourceVideo');
const selectionEl = document.getElementById('selection');
const wrap = document.getElementById('canvasWrap');
const intensity = document.getElementById('intensity');
const intensityValue = document.getElementById('intensityValue');
const feather = document.getElementById('feather');
const featherValue = document.getElementById('featherValue');
const gifMode = document.getElementById('gifMode');
const toast = document.getElementById('toast');
const progressBox = document.getElementById('progressBox');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let currentFile = null;
let currentFileBuffer = null;
let type = null;
let effect = 'blur';
let selection = null;
let drawing = false;
let start = { x: 0, y: 0 };
let videoRAF = null;
let processedRegions = [];
let sourceUrl = null;
let exportRunning = false;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  setTimeout(() => toast.hidden = true, 4500);
}
function setBusy(text, percent = 0) {
  progressBox.hidden = false;
  progressText.textContent = text;
  progressBar.value = Math.max(0, Math.min(100, percent));
}
function clearBusy() {
  progressBox.hidden = true;
  progressBar.value = 0;
  progressText.textContent = '';
  exportRunning = false;
}
function getMaxCanvasSide() {
  return isIOS ? 900 : 1280;
}
function fitCanvas(w, h) {
  const maxW = getMaxCanvasSide();
  const maxH = isIOS ? 900 : 900;
  const r = Math.min(maxW / w, maxH / h, 1);
  canvas.width = Math.max(1, Math.round(w * r));
  canvas.height = Math.max(1, Math.round(h * r));
}
function clientToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const p = e.touches?.[0] || e.changedTouches?.[0] || e;
  return {
    x: (p.clientX - rect.left) * (canvas.width / rect.width),
    y: (p.clientY - rect.top) * (canvas.height / rect.height)
  };
}
function normalizeRect(a, b) {
  return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(a.x-b.x), h: Math.abs(a.y-b.y) };
}
function updateSelectionEl() {
  if (!selection || selection.w < 3 || selection.h < 3) { selectionEl.hidden = true; return; }
  const crect = canvas.getBoundingClientRect(), wrect = wrap.getBoundingClientRect();
  selectionEl.hidden = false;
  selectionEl.style.left = (crect.left - wrect.left + selection.x * (crect.width / canvas.width)) + 'px';
  selectionEl.style.top = (crect.top - wrect.top + selection.y * (crect.height / canvas.height)) + 'px';
  selectionEl.style.width = (selection.w * (crect.width / canvas.width)) + 'px';
  selectionEl.style.height = (selection.h * (crect.height / canvas.height)) + 'px';
}

async function loadFile(file) {
  try {
    currentFile = file;
    currentFileBuffer = null;
    processedRegions = [];
    selection = null;
    updateSelectionEl();
    clearBusy();
    fileInfo.textContent = `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`;

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);

    if (file.type.startsWith('video/')) {
      type = 'video';
      img.hidden = true;
      video.hidden = false;
      video.src = sourceUrl;
      video.onloadedmetadata = () => {
        fitCanvas(video.videoWidth, video.videoHeight);
        drawVideoLoop();
        showToast('تم تحميل الفيديو. التصدير من المتصفح بدون صوت.');
      };
    } else {
      type = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif') ? 'gif' : 'image';
      if (type === 'gif') currentFileBuffer = await file.arrayBuffer();
      video.pause();
      video.hidden = true;
      img.hidden = false;
      img.src = sourceUrl;
      img.onload = () => {
        fitCanvas(img.naturalWidth, img.naturalHeight);
        renderSourceFrame();
        showToast(type === 'gif' ? 'تم تحميل GIF متحرك.' : 'تم تحميل الصورة.');
      };
    }
  } catch (err) {
    console.error(err);
    showToast('فشل تحميل الملف. جرّب ملف أصغر.');
  }
}
function renderSourceFrame() {
  if ((type === 'image' || type === 'gif') && img.src) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
  } else if (type === 'video' && video.src) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
  }
  processedRegions.forEach(r => applyStoredEffect(r));
}
function drawVideoLoop() {
  cancelAnimationFrame(videoRAF);
  const loop = () => { if (type === 'video') renderSourceFrame(); videoRAF = requestAnimationFrame(loop); };
  loop();
}
function makeRegion(rect = selection) {
  if (!rect || rect.w < 2 || rect.h < 2) return null;
  const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
  return {
    x, y,
    w: Math.max(1, Math.min(canvas.width - x, Math.floor(rect.w))),
    h: Math.max(1, Math.min(canvas.height - y, Math.floor(rect.h))),
    effect: rect.effect || effect,
    amount: Number(rect.amount ?? intensity.value),
    feather: Number(rect.feather ?? feather.value)
  };
}
function scaleRegion(r, sx, sy) {
  return {
    ...r,
    x: Math.round(r.x*sx),
    y: Math.round(r.y*sy),
    w: Math.round(r.w*sx),
    h: Math.round(r.h*sy),
    amount: Math.max(1, r.amount*((sx+sy)/2)),
    feather: Math.max(0, r.feather*((sx+sy)/2))
  };
}
function applyEffect(rect = selection, remember = true) {
  const region = makeRegion(rect);
  if (!region) { showToast('حدد منطقة أولاً.'); return; }
  applyStoredEffect(region);
  if (remember) processedRegions.push({ ...region });
}
function applyStoredEffect(r) {
  if (r.effect === 'blur') blurRect(r);
  else if (r.effect === 'pixelate') pixelateRect(r);
  else darkenRect(r);
}
function blurRect(r) {
  const pad = Math.max(0, Math.round(r.feather));
  const sx = Math.max(0, Math.floor(r.x - pad));
  const sy = Math.max(0, Math.floor(r.y - pad));
  const sw = Math.min(canvas.width - sx, Math.ceil(r.w + pad * 2));
  const sh = Math.min(canvas.height - sy, Math.ceil(r.h + pad * 2));
  const off = document.createElement('canvas');
  off.width = sw; off.height = sh;
  const o = off.getContext('2d');
  o.filter = `blur(${r.amount}px)`;
  o.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.save();
  roundedClip(r.x, r.y, r.w, r.h, Math.min(18, r.feather));
  ctx.drawImage(off, pad, pad, r.w, r.h, r.x, r.y, r.w, r.h);
  ctx.restore();
}
function pixelateRect(r) {
  const scale = Math.max(3, Math.floor(r.amount));
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.floor(r.w / scale));
  small.height = Math.max(1, Math.floor(r.h / scale));
  const s = small.getContext('2d');
  s.imageSmoothingEnabled = false;
  s.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, small.width, small.height);
  ctx.save();
  roundedClip(r.x, r.y, r.w, r.h, Math.min(18, r.feather));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, r.x, r.y, r.w, r.h);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();
}
function darkenRect(r) {
  ctx.save();
  roundedClip(r.x, r.y, r.w, r.h, Math.min(18, r.feather));
  ctx.fillStyle = `rgba(0,0,0,${Math.min(.92, r.amount / 90)})`;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}
function roundedClip(x, y, w, h, rad) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
  else ctx.rect(x, y, w, h);
  ctx.clip();
}
function reset() {
  processedRegions = [];
  selection = null;
  updateSelectionEl();
  clearBusy();
  renderSourceFrame();
  showToast('تمت إعادة الضبط.');
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();

  if (isIOS) {
    showToast('إذا لم يبدأ التحميل، اضغط مطولاً على الملف/الصورة واحفظها من Safari.');
    window.open(url, '_blank');
  }
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
function exportImage(format) {
  if (!currentFile) { showToast('ارفع ملف أولاً.'); return; }
  if (format === 'gif') return exportGif();
  renderSourceFrame();
  const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  canvas.toBlob(b => {
    if (!b) { showToast('الصيغة غير مدعومة في هذا المتصفح.'); return; }
    downloadBlob(b, `blurx-export.${format === 'jpeg' ? 'jpg' : format}`);
    showToast('تم تجهيز الصورة.');
  }, mime, .92);
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function seekVideoTo(t) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('انتهت مهلة قراءة الفيديو.')), 6000);
    video.onseeked = () => { clearTimeout(timer); resolve(); };
    video.currentTime = Math.min(t, Math.max(0, (video.duration || t) - 0.05));
  });
}
function drawGifFrameToCanvas(frame, patchCanvas, baseCanvas, baseCtx, targetCanvas, targetCtx) {
  patchCanvas.width = frame.dims.width;
  patchCanvas.height = frame.dims.height;
  const pctx = patchCanvas.getContext('2d');
  const imageData = pctx.createImageData(frame.dims.width, frame.dims.height);
  imageData.data.set(frame.patch);
  pctx.putImageData(imageData, 0, 0);
  baseCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
  targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetCtx.drawImage(baseCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
}
async function exportAnimatedGifFromGif() {
  if (!currentFileBuffer) currentFileBuffer = await currentFile.arrayBuffer();

  const gifAPI = window.gifuct || window.GIFuct;
  if (!gifAPI || !gifAPI.parseGIF) throw new Error('مكتبة قراءة GIF لم تُحمّل. حدّث الصفحة.');

  const parsed = gifAPI.parseGIF(currentFileBuffer);
  let frames = gifAPI.decompressFrames(parsed, true);
  if (!frames.length) throw new Error('لم يتم العثور على فريمات في GIF.');

  const mobileMode = gifMode.value === 'mobile';
  const maxFrames = mobileMode ? (isIOS ? 50 : 80) : 120;
  const maxWidth = mobileMode ? (isIOS ? 360 : 480) : 640;
  if (frames.length > maxFrames) frames = frames.slice(0, maxFrames);

  const gifW = parsed.lsd.width;
  const gifH = parsed.lsd.height;
  const outScale = Math.min(1, maxWidth / gifW);
  const outW = Math.max(1, Math.round(gifW * outScale));
  const outH = Math.max(1, Math.round(gifH * outScale));

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = gifW;
  baseCanvas.height = gifH;
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });

  const patchCanvas = document.createElement('canvas');
  const workCanvas = document.createElement('canvas');
  workCanvas.width = outW;
  workCanvas.height = outH;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

  const oldW = canvas.width, oldH = canvas.height;
  const regions = processedRegions.length ? processedRegions : (selection ? [makeRegion(selection)] : []);
  const sx = outW / oldW;
  const sy = outH / oldH;

  const encoder = new GIF({
    workers: 1,
    quality: mobileMode ? 18 : 12,
    width: outW,
    height: outH,
    workerScript: './gif.worker.js'
  });

  encoder.on('progress', p => setBusy(`جاري ضغط GIF... ${Math.round(p*100)}%`, Math.round(p*100)));
  encoder.on('finished', blob => {
    canvas.width = oldW;
    canvas.height = oldH;
    clearBusy();
    renderSourceFrame();
    downloadBlob(blob, 'blurx-animated.gif');
    showToast('تم تصدير GIF متحرك.');
  });

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    if (frame.disposalType === 2) {
      baseCtx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
    }

    drawGifFrameToCanvas(frame, patchCanvas, baseCanvas, baseCtx, workCanvas, workCtx);

    canvas.width = outW;
    canvas.height = outH;
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(workCanvas, 0, 0);
    regions.filter(Boolean).forEach(r => applyStoredEffect(scaleRegion(r, sx, sy)));
    workCtx.clearRect(0, 0, outW, outH);
    workCtx.drawImage(canvas, 0, 0);

    const delay = Math.max(20, (frame.delay || 10) * 10);
    encoder.addFrame(workCtx, { copy: true, delay });

    setBusy(`معالجة GIF... ${i + 1}/${frames.length}`, Math.round(((i + 1) / frames.length) * 70));
    if (i % 5 === 0) await wait(0);
  }

  canvas.width = oldW;
  canvas.height = oldH;
  renderSourceFrame();
  setBusy('جاري إنشاء GIF...', 75);
  encoder.render();
}
async function exportGif() {
  if (exportRunning) { showToast('يوجد تصدير قيد التشغيل.'); return; }
  if (!currentFile) { showToast('ارفع ملف أولاً.'); return; }
  if (!window.GIF) { showToast('مكتبة GIF غير محملة. تأكد من الإنترنت ثم حدث الصفحة.'); return; }

  exportRunning = true;
  try {
    setBusy('جاري تجهيز GIF...', 5);

    if (type === 'gif') {
      await exportAnimatedGifFromGif();
      return;
    }

    const mobileMode = gifMode.value === 'mobile';
    const maxWidth = mobileMode ? (isIOS ? 360 : 480) : 640;
    const scale = Math.min(1, maxWidth / canvas.width);
    const outW = Math.max(1, Math.round(canvas.width * scale));
    const outH = Math.max(1, Math.round(canvas.height * scale));
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW; outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

    const encoder = new GIF({ workers: 1, quality: mobileMode ? 18 : 12, width: outW, height: outH, workerScript: './gif.worker.js' });
    encoder.on('progress', p => setBusy(`جاري تجهيز GIF... ${Math.round(p*100)}%`, Math.round(p*100)));
    encoder.on('finished', blob => { clearBusy(); downloadBlob(blob, 'blurx-export.gif'); showToast('تم تصدير GIF.'); });

    if (type === 'video') {
      const oldMuted = video.muted, wasPaused = video.paused;
      video.pause(); video.muted = true;
      const duration = Math.min(Number.isFinite(video.duration) ? video.duration : 3, mobileMode ? 3 : 4);
      const fps = mobileMode ? 6 : 8;
      const total = Math.ceil(duration * fps);
      let frame = 0;
      for (let t = 0; t < duration; t += 1 / fps) {
        await seekVideoTo(t);
        renderSourceFrame();
        outCtx.clearRect(0, 0, outW, outH);
        outCtx.drawImage(canvas, 0, 0, outW, outH);
        encoder.addFrame(outCtx, { copy: true, delay: Math.round(1000 / fps) });
        frame++;
        setBusy(`إضافة فريمات GIF... ${frame}/${total}`, Math.round((frame / total) * 70));
      }
      video.muted = oldMuted;
      if (!wasPaused) video.play().catch(()=>{});
    } else {
      renderSourceFrame();
      outCtx.drawImage(canvas, 0, 0, outW, outH);
      encoder.addFrame(outCtx, { copy: true, delay: 1000 });
    }

    setBusy('جاري إنشاء GIF...', 75);
    encoder.render();
  } catch (err) {
    clearBusy();
    console.error(err);
    showToast('فشل تصدير GIF: ' + (err.message || 'خطأ غير معروف'));
  }
}
async function exportVideo(requested) {
  if (!currentFile) { showToast('ارفع ملف أولاً.'); return; }
  if (requested === 'gif') return exportGif();
  if (type !== 'video') { showToast('تصدير WEBM/MP4 يحتاج ملف فيديو.'); return; }
  if (!('MediaRecorder' in window) || !canvas.captureStream) {
    showToast('متصفحك لا يدعم تصدير الفيديو من الويب. استخدم Chrome/Edge.');
    return;
  }
  try {
    exportRunning = true;
    const mp4Supported = MediaRecorder.isTypeSupported('video/mp4;codecs=h264') || MediaRecorder.isTypeSupported('video/mp4');
    const supported = requested === 'mp4' && mp4Supported ? 'video/mp4' : 'video/webm';
    const stream = canvas.captureStream(24);
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: supported });
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearBusy();
      downloadBlob(new Blob(chunks, { type: supported }), `blurx-video.${supported.includes('mp4') ? 'mp4' : 'webm'}`);
      showToast('تم تجهيز الفيديو.');
    };
    video.currentTime = 0;
    await video.play();
    rec.start();
    setBusy('جاري تسجيل الفيديو...', 20);
    video.onended = () => rec.stop();
  } catch(err) {
    clearBusy();
    showToast('فشل تصدير الفيديو. جرّب WEBM أو Chrome/Edge.');
    console.error(err);
  }
}

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

document.querySelectorAll('[data-effect]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-effect]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  effect = b.dataset.effect;
});
intensity.oninput = () => intensityValue.textContent = intensity.value;
feather.oninput = () => featherValue.textContent = feather.value;

function pointerStart(e) {
  e.preventDefault();
  drawing = true;
  start = clientToCanvas(e);
  selection = { x: start.x, y: start.y, w: 0, h: 0 };
  updateSelectionEl();
}
function pointerMove(e) {
  if (!drawing) return;
  e.preventDefault();
  selection = normalizeRect(start, clientToCanvas(e));
  updateSelectionEl();
}
function pointerEnd(e) {
  if (!drawing) return;
  e.preventDefault();
  drawing = false;
  updateSelectionEl();
}
canvas.addEventListener('pointerdown', pointerStart, { passive:false });
canvas.addEventListener('pointermove', pointerMove, { passive:false });
canvas.addEventListener('pointerup', pointerEnd, { passive:false });
canvas.addEventListener('pointercancel', pointerEnd, { passive:false });
canvas.addEventListener('dblclick', () => { selection = { x: 0, y: 0, w: canvas.width, h: canvas.height }; updateSelectionEl(); });
window.addEventListener('resize', updateSelectionEl);

document.getElementById('applyBtn').onclick = () => applyEffect();
document.getElementById('fullBtn').onclick = () => { selection = { x: 0, y: 0, w: canvas.width, h: canvas.height }; updateSelectionEl(); applyEffect(); };
document.getElementById('resetBtn').onclick = reset;
document.getElementById('playBtn').onclick = () => { if (type === 'video') { video.paused ? video.play() : video.pause(); } };
document.querySelectorAll('[data-export-img]').forEach(b => b.onclick = () => exportImage(b.dataset.exportImg));
document.querySelectorAll('[data-export-video]').forEach(b => b.onclick = () => exportVideo(b.dataset.exportVideo));

// منع نسخة Service Worker القديمة من تعليق الموقع بعد التحديث
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
    } catch(e) {}
  });
}

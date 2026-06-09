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
const toast = document.getElementById('toast');

let currentFile = null;
let type = null;
let effect = 'blur';
let selection = null;
let drawing = false;
let start = { x: 0, y: 0 };
let videoRAF = null;
let processedRegions = [];
let sourceUrl = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  setTimeout(() => toast.hidden = true, 3600);
}

function fitCanvas(w, h) {
  const maxW = 1400;
  const maxH = 1000;
  const r = Math.min(maxW / w, maxH / h, 1);
  canvas.width = Math.max(1, Math.round(w * r));
  canvas.height = Math.max(1, Math.round(h * r));
}

function clientToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches?.[0] || e.changedTouches?.[0] || e;
  return {
    x: (touch.clientX - rect.left) * (canvas.width / rect.width),
    y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    cssX: touch.clientX - rect.left,
    cssY: touch.clientY - rect.top
  };
}

function normalizeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y)
  };
}

function updateSelectionEl() {
  if (!selection || selection.w < 3 || selection.h < 3) {
    selectionEl.hidden = true;
    return;
  }
  const crect = canvas.getBoundingClientRect();
  const wrect = wrap.getBoundingClientRect();
  selectionEl.hidden = false;
  selectionEl.style.left = (crect.left - wrect.left + selection.x * (crect.width / canvas.width)) + 'px';
  selectionEl.style.top = (crect.top - wrect.top + selection.y * (crect.height / canvas.height)) + 'px';
  selectionEl.style.width = (selection.w * (crect.width / canvas.width)) + 'px';
  selectionEl.style.height = (selection.h * (crect.height / canvas.height)) + 'px';
}

function loadFile(file) {
  currentFile = file;
  processedRegions = [];
  selection = null;
  updateSelectionEl();
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
      showToast('تم تحميل الفيديو. التصدير من المتصفح سيكون بدون صوت.');
    };
  } else {
    type = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif') ? 'gif' : 'image';
    video.pause();
    video.hidden = true;
    img.hidden = false;
    img.src = sourceUrl;
    img.onload = () => {
      fitCanvas(img.naturalWidth, img.naturalHeight);
      renderSourceFrame();
      showToast(type === 'gif' ? 'تم تحميل GIF. يمكن تصديره GIF متحرك قصير أو صورة ثابتة.' : 'تم تحميل الصورة.');
    };
  }
}

function renderSourceFrame() {
  if ((type === 'image' || type === 'gif') && img.src) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } else if (type === 'video' && video.src) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  processedRegions.forEach(r => applyStoredEffect(r));
}

function drawVideoLoop() {
  cancelAnimationFrame(videoRAF);
  const loop = () => {
    if (type === 'video') renderSourceFrame();
    videoRAF = requestAnimationFrame(loop);
  };
  loop();
}

function makeRegion(rect = selection) {
  if (!rect || rect.w < 2 || rect.h < 2) return null;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  return {
    x,
    y,
    w: Math.max(1, Math.min(canvas.width - x, Math.floor(rect.w))),
    h: Math.max(1, Math.min(canvas.height - y, Math.floor(rect.h))),
    effect: rect.effect || effect,
    amount: Number(rect.amount ?? intensity.value),
    feather: Number(rect.feather ?? feather.value)
  };
}

function applyEffect(rect = selection, remember = true) {
  const region = makeRegion(rect);
  if (!region) {
    showToast('حدد منطقة أولاً.');
    return;
  }
  applyStoredEffect(region);
  if (remember) processedRegions.push({ ...region });
}

function applyStoredEffect(r) {
  if (r.effect === 'blur') blurRect(r);
  else if (r.effect === 'pixelate') pixelateRect(r);
  else darkenRect(r);
}

function blurRect(r) {
  const pad = r.feather;
  const sx = Math.max(0, r.x - pad);
  const sy = Math.max(0, r.y - pad);
  const sw = Math.min(canvas.width - sx, r.w + pad * 2);
  const sh = Math.min(canvas.height - sy, r.h + pad * 2);
  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
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
  renderSourceFrame();
  showToast('تمت إعادة الضبط.');
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportImage(format) {
  if (!currentFile) {
    showToast('ارفع ملف أولاً.');
    return;
  }
  renderSourceFrame();
  if (format === 'gif') return exportGif();
  const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  canvas.toBlob(b => {
    if (!b) {
      showToast('الصيغة غير مدعومة في هذا المتصفح.');
      return;
    }
    downloadBlob(b, `blurx-export.${format === 'jpeg' ? 'jpg' : format}`);
  }, mime, .95);
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function exportGif() {
  if (!window.GIF) {
    showToast('مكتبة GIF لم تُحمّل. تأكد أن الموقع متصل بالإنترنت أو استخدم PNG/WEBP.');
    return;
  }

  const encoder = new GIF({
    workers: 2,
    quality: 10,
    width: canvas.width,
    height: canvas.height,
    workerScript: 'https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js'
  });

  showToast('جاري تجهيز GIF... للمقاطع الطويلة استخدم WEBM/MP4.');

  if (type === 'video') {
    const oldMuted = video.muted;
    video.muted = true;
    video.currentTime = 0;
    await wait(250);
    const duration = Math.min(Number.isFinite(video.duration) ? video.duration : 3, 5);
    const fps = 10;
    for (let t = 0; t < duration; t += 1 / fps) {
      video.currentTime = t;
      await new Promise(resolve => video.onseeked = resolve);
      renderSourceFrame();
      encoder.addFrame(ctx, { copy: true, delay: 1000 / fps });
    }
    video.muted = oldMuted;
  } else if (type === 'gif') {
    const fps = 10;
    for (let i = 0; i < 30; i++) {
      renderSourceFrame();
      encoder.addFrame(ctx, { copy: true, delay: 1000 / fps });
      await wait(1000 / fps);
    }
  } else {
    renderSourceFrame();
    encoder.addFrame(ctx, { copy: true, delay: 1000 });
  }

  encoder.on('finished', blob => {
    downloadBlob(blob, 'blurx-export.gif');
    showToast('تم تصدير GIF بنجاح.');
  });
  encoder.render();
}

async function exportVideo(requested) {
  if (!currentFile) {
    showToast('ارفع ملف أولاً.');
    return;
  }
  if (requested === 'gif') return exportGif();
  if (type !== 'video') {
    showToast('تصدير WEBM/MP4 يحتاج ملف فيديو. للصور استخدم JPG/PNG/WEBP/GIF.');
    return;
  }
  const mp4Supported = MediaRecorder.isTypeSupported('video/mp4;codecs=h264') || MediaRecorder.isTypeSupported('video/mp4');
  const supported = requested === 'mp4' && mp4Supported ? 'video/mp4' : 'video/webm';
  const stream = canvas.captureStream(30);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: supported });
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => downloadBlob(new Blob(chunks, { type: supported }), `blurx-video.${supported.includes('mp4') ? 'mp4' : 'webm'}`);
  video.currentTime = 0;
  await video.play();
  rec.start();
  showToast('جاري تسجيل الفيديو من الكانفاس...');
  video.onended = () => {
    rec.stop();
    showToast('تم تجهيز ملف التصدير.');
  };
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

canvas.addEventListener('pointerdown', e => {
  drawing = true;
  start = clientToCanvas(e);
  selection = { x: start.x, y: start.y, w: 0, h: 0 };
  updateSelectionEl();
});
canvas.addEventListener('pointermove', e => {
  if (!drawing) return;
  selection = normalizeRect(start, clientToCanvas(e));
  updateSelectionEl();
});
canvas.addEventListener('pointerup', () => { drawing = false; updateSelectionEl(); });
canvas.addEventListener('dblclick', () => { selection = { x: 0, y: 0, w: canvas.width, h: canvas.height }; updateSelectionEl(); });
window.addEventListener('resize', updateSelectionEl);

document.getElementById('applyBtn').onclick = () => applyEffect();
document.getElementById('fullBtn').onclick = () => { selection = { x: 0, y: 0, w: canvas.width, h: canvas.height }; updateSelectionEl(); applyEffect(); };
document.getElementById('resetBtn').onclick = reset;
document.getElementById('playBtn').onclick = () => { if (type === 'video') { video.paused ? video.play() : video.pause(); } };
document.querySelectorAll('[data-export-img]').forEach(b => b.onclick = () => exportImage(b.dataset.exportImg));
document.querySelectorAll('[data-export-video]').forEach(b => b.onclick = () => exportVideo(b.dataset.exportVideo));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

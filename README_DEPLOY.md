# BlurX Pro - Fixed Cloudflare/GitHub Pages Build

## الملفات المعدلة
- `index.html`: إضافة مكتبة gif.js قبل app.js.
- `app.js`: إصلاح تصدير GIF، إضافة Progress، مهلة Timeout، وتقليل حجم GIF إلى 640px لتجنب التعليق.
- `gif.worker.js`: ملف محلي يشغل worker الخاص بـ gif.js.
- `styles.css`: إضافة شريط تقدم.
- `sw.js`: تحديث cache.

## طريقة الرفع إلى GitHub
1. فك ضغط الملف.
2. ارفع كل الملفات بدل ملفات المشروع القديمة.
3. اضغط Commit changes.
4. انتظر دقيقة وافتح GitHub Pages.

## ملاحظة
تصدير GIF من فيديو طويل أو 4K ثقيل جداً داخل المتصفح. الأفضل:
- فيديو 3-4 ثواني.
- حجم أقل من 20MB.
- استخدم Chrome أو Edge.

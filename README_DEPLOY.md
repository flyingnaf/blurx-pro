# BlurX PWA - Cloudflare Pages

## تشغيل محلي
افتح `index.html` مباشرة، أو شغل سيرفر محلي:

```bash
npx serve .
```

## رفعه على Cloudflare Pages

### الطريقة السريعة بدون GitHub
1. ادخل Cloudflare Dashboard.
2. اختر Workers & Pages.
3. اختر Create > Pages.
4. اختر Upload assets.
5. ارفع ملف ZIP أو اسحب مجلد المشروع.
6. اضغط Deploy.

### طريقة GitHub
1. ارفع الملفات في مستودع GitHub.
2. من Cloudflare: Workers & Pages > Create > Pages > Connect to Git.
3. اختر المستودع.
4. Build settings:
   - Framework preset: None
   - Build command: اتركه فارغ
   - Output directory: /
5. Deploy.

## ملاحظات التصدير
- الصور: PNG / JPG / WEBP / GIF.
- GIF المتحرك يستخدم مكتبة gif.js من CDN، لذلك يحتاج اتصال إنترنت عند أول تحميل.
- فيديو MP4 يعتمد على دعم المتصفح. إذا لم يدعم، سيتم التصدير WEBM.
- الفيديو/GIF يتم تصديرهما بدون صوت لأن المعالجة تتم على Canvas داخل المتصفح.

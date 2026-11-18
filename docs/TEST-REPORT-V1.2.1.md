# TEST-REPORT — V1.2.1

> **الحكم: ليست جاهزة للإنتاج (NOT READY FOR PRODUCTION).** هي جاهزة لاختبار **Netlify تجريبي**. لن يُعلن READY قبل نجاح اختبارات البيئة الفعلية (القسم 4).

## 1. ما نُفّذ فعليًا وما لم يُنفَّذ
- **نُفّذ (محليًا، Node 22 + Chromium):** 68 فحصًا ناجحًا، 0 فاشلًا، 1 ملاحظة. أمر التشغيل: `npm test` (يعمل من الحزمة نفسها). النتائج الخام في `tests/results/*.json`.
- **الدوال الفعلية** (`track-click`, `admin-clicks`, `admin-feedback`, `feedback`) شُغّلت كما هي، لكن فوق **بديل محلي في الذاكرة لـ Netlify Blobs** (`tests/stub/blobs.mjs`، ينمذج: set/get/delete/list وترقيم الصفحات والتأخير وحقن الأعطال). **هذا يثبت منطق البرنامج ولا يثبت سلوك Netlify Blobs الحقيقي.**
- **المتصفح:** Chromium عبر Playwright مع ترويسات `netlify.toml` الفعلية (CSP...)، والدوال الحقيقية خلف اعتراض الشبكة. الجوال محاكاة 360px وليس جهازًا حقيقيًا.
- **لم يُنفَّذ:** أي شيء على Netlify الحقيقي أو أجهزة حقيقية (القسم 4).

## 2. اختبارات القبول الخمسة عشر
| # | المتطلب | الاختبارات | الحالة |
|---|---|---|---|
| 1 | سلامة 22 رابطًا | AT1 | PASS (محلي): النوع/المحل صحيحان، وكل `<a href>` في الصفحة (36) مطابق حرفيًا لـV1.2 |
| 2 | تسجيل المحل والوسيلة الصحيحين | AT2, AT2-e2e | PASS (محلي): 22/22 من نقرة المتصفح إلى التخزين |
| 3 | عدم تعطيل الفتح عند فشل التتبع | AT3-hang/abort/503/429, AT3-nobeacon, AT3a/b | PASS (محلي): انتقال فعلي إلى الوجهة خلال ~20ms مع تتبع معلّق أو مرفوض. **الأجهزة الحقيقية NOT TESTED** |
| 4 | الطلبات المزيفة والمتكررة | AT4a–h, AT4-ui, AT4i | PASS (محلي) للطلبات المباشرة والمتكررة من عميل واحد. **باقٍ: التزييف الموزّع من عناوين كثيرة (AT4i)** |
| 5 | سلامة التخزين عند التزامن | AT5, AT10d, AT4e | PASS على البديل المحلي. **Blobs الحقيقي: NOT TESTED** |
| 6 | الإجماليات مع الآلاف | AT6, AT6b, AT6c | PASS على البديل (6000 و12000 سجل، بصفحات 1000/500، بلا قراءات فردية). **زمن/حدود Blobs الحقيقية: NOT TESTED** |
| 7 | توافق القديم والجديد | AT7, AT11a | PASS (محلي) |
| 8 | تجميع بتوقيت اليمن | AT8a–d, AT8-ui | PASS (محلي): حدود 21:00 UTC، اليوم/7/30/90 |
| 9 | رفض الوصول غير المصرح | AT9, AT9-ui, AT-CSP3 | PASS (محلي) |
| 10 | تقييد التخمين | AT10a–g, AT10-ui | PASS (محلي): 5 محاولات ثم 429 (500 محاولة تتابعية و100 متزامنة). **على Blobs الحقيقي NOT TESTED** (الاعتماد على الاتساق القوي) |
| 11 | استقبال الرسائل القديمة والجديدة | AT11a–f, AT11-ui | PASS (محلي) |
| 12 | حماية CSV | AT12-admin, AT12-index | PASS (محلي): 5 خلايا خبيثة في كل مسار تبدأ بـ`'` |
| 13 | عدم نشر المصدر | AT13, AT13b | PASS محليًا لبنية المجلدات والإعداد. **التقديم الفعلي على Netlify: NOT TESTED** |
| 14 | الجوال | AT14, AT14b | PASS (محاكاة 360px، فحص تجاوز مدرك لـRTL). **جهاز حقيقي NOT TESTED** |
| 15 | لا أرقام اصطناعية | AT15a | PASS (محلي): الأرقام = بيانات البذر؛ عبارات «اصطناعي/تجريبي/V1.1/التحويل/الزوار الفريدون» غير موجودة في DOM |

## 3. حالة العيوب F-01 … F-15
| العيب | الحالة | التفصيل |
|---|---|---|
| F-01 تزوير النقرات | **تم (جزئيًا بحدود معلنة)** | حاجز Origin/Sec-Fetch-Site + حد 20/دقيقة/عميل (مُختبر). **باقٍ:** تزييف موزّع من عناوين كثيرة؛ قاعدة Rate Limiting من Netlify **لم تُطبَّق** لأنها تتطلب `path` مخصصًا ولن تحمي المسار الحالي المستخدم من العميل. حد 20 قد يحجب نقرات حقيقية خلف عنوان مشترك (CGNAT)؛ قابل للضبط. |
| F-02 القراءة والترقيم | **تم (منطقيًا)** | عدّ المفاتيح بلا قراءة فردية، `paginate:true`، ميزانية زمنية مع `complete:false`. الأداء على Blobs الحقيقي NOT TESTED. |
| F-03 التخمين | **تم (بحدود)** | 5 محاولات/15 دقيقة/عميل. الحد الأدنى للكلمة بقي 12 للتوافق (+ تنبيه <20). لا حماية ضد تخمين موزّع، ولا جلسات. |
| F-04 النصوص الاصطناعية | **تم** | AT15a. |
| F-05 أخطاء النقرات | **تم** | AT-F5a–d: خطأ، إعادة محاولة، انقطاع، تحميل. |
| F-06 توقيت اليمن | **تم** | AT8*. التخزين UTC محفوظ. |
| F-07 نشر المصدر/الترويسات | **تم في البنية؛ NOT TESTED على Netlify** | `public/` + ترويسات + CSP بتجزئات. شرط: النشر عبر Git/CLI (انظر دليل النشر). |
| F-08 سجل بلا تاريخ | **تم** | AT11a. |
| F-09 واجهة إدارة مكررة + CSV | **جزئي** | CSV أُصلح (AT12-index). **أبقيت** واجهة الإدارة في الصفحة العامة ورابط `admin.html` لأن حذفهما تغيير وظيفي/تصميمي يحتاج موافقتكم؛ يخففهما القفل والترويسات. |
| F-10 إغراق الرسائل | **تم** | AT11d–f. |
| F-11 كلمة المرور في الترويسة | **مؤجّل** | يتطلب تصميم جلسات يغيّر نظام الدخول الحالي (قيد المهمة: التوافق). الخطر مقبول لمدير واحد عبر HTTPS. |
| F-12 نقرات غير مرصودة | **جزئي** | الزر الأوسط مُتتبَّع (AT-AUX). أزرار النسخ ورابط واتساب في نموذج الرسائل غير مُتتبَّعة عمدًا. |
| F-13 الاحتفاظ والنسخ | **جزئي/مؤجّل** | كنس علامات المحدِّد + تصدير يومي CSV. لا نسخ احتياطي تلقائي؛ التوصية شهرية يدوية. |
| F-14 حجم الصفحة | **مؤجّل** | نقل 19 صورة base64 خارج HTML خطر على التصميم ويتطلب خط معالجة صور؛ غير مانع. |
| F-15 تسميات/lockfile/رقم | **جزئي** | `package.json` حُدّث (1.2.1، scripts)، «تحليلات الزوار» أُعيدت تسميتها. **لم يُنشأ lockfile** (لا شبكة للتثبيت هنا). **الرقم `+9673202399` لم أغيّره** (قيد: لا تغيير وجهات التواصل) — يرجى تأكيده. |

## 4. NOT TESTED — يتطلب Netlify الحقيقي أو أجهزة (خطوات التنفيذ في DEPLOYMENT-GUIDE)
1. Blobs الحقيقي: التزامن (100+ نقرة)، الاتساق القوي (`consistency:'strong'` — **المدى `^9.0.0` قد لا يدعم هذا الخيار؛ إن تجاهله فسيصبح التحديد والظهور اتساقًا نهائيًا. يقيس `smoke-test` زمن الظهور؛ جرّب الإصدار 10 إن لزم**)، حجم الصفحة الحقيقي في `list`، الزمن والمهلة مع آلاف السجلات.
2. توفر `context.ip` والترويسات الفعلية خلف شبكة Netlify (يوجد بديل `x-nf-client-connection-ip`/`x-forwarded-for`).
3. تقديم الترويسات/CSP، وكون `/package.json` والمصدر غير منشورين، وإعادة التوجيهات.
4. تجميع (bundling) esbuild لاستيراد `../lib/common.mjs` من الدوال.
5. أجهزة Android/iPhone: فتح واتساب/الاتصال/الخرائط فعليًا، وسلوك `sendBeacon` مع التنقل.
6. إنترنت ضعيف، تباطؤ الدوال، مخزن Blobs محمّل.
7. قاعدة Netlify Rate Limiting (اختيارية، من الواجهة).

## 5. تصحيحات على تقرير التدقيق السابق (أمانة مهنية)
- **F-05:** قلت إن `clickError` «لا يُعرض في أي مكان». الصحيح أنه كان يُعرض في صفحة «التقارير» فقط؛ أما نظرة عامة وملخص النقرات فكانت تعرض «—» بصمت. الإصلاح يغطي الحالتين.
- **F-02:** الاقتطاع الصامت عند `list({paginate:false})` كان **افتراضًا غير مؤكد**. تعريفات النوع تُظهر صيغتين للإرجاع ولا تحسم هل تُجمع الصفحات. V1.2.1 لا يعتمد على أي من الاحتمالين. بقي عيب القراءة المتتابعة (مُقاس على البديل).
- كلا الخطأين لا يغيّر الحكم.

## 6. ما يحتاج موافقتكم
(أ) حذف واجهة الإدارة المكررة والرابط من الصفحة العامة؟ (ب) تأكيد الرقم `+9673202399`. (ج) أسلوب النشر الحالي (Git/CLI/Drop) لأن `publish="public"` يعتمد عليه. لم يتطلب التنفيذ حذف بيانات أو تغيير روابط أو استبدال نظام الشكاوى.

## 7. نتائج كل فحص (مولّدة من `tests/results/*.json`)
| المعرف | الفحص | النتيجة | الدليل |
|---|---|---|---|
| AT2 | click recorded for the right store+channel (14 combos), key layout v2/<aden-day>/<store>/<channel>/… | PASS | 14/14 keys present; value keeps UTC ISO `at` |
| AT2b | stores use strong consistency option | PASS | getStore({consistency:"strong"}) requested |
| AT4a | request with neither Origin nor Sec-Fetch-Site (curl-style) rejected 403 | PASS | 403 |
| AT4b | foreign Origin / look-alike Origin rejected | PASS | 403/403 |
| AT4c | Sec-Fetch-Site same-origin accepted; cross-site rejected | PASS | 201/403 |
| AT4d | invalid payloads rejected (9 cases) + oversize | PASS | 9×400, 413 |
| AT4e | scripted flood from ONE client: 2000 forged requests -> only 20/min stored | PASS | accepted=21 limited=1979 stored=21 |
| AT4f | the 429 carries Retry-After and rate markers do not accumulate for blocked requests | PASS | markers kept=21 |
| AT4g | after the window passes the same client is accepted again | PASS | 201 after 61s |
| AT4h | different clients are not affected by one client being limited (CGNAT-safe at 20/min each) | PASS | 50/50 distinct IPs accepted |
| AT4i | KNOWN RESIDUAL RISK: forging from MANY IPs | NOTE | A distributed script can still inflate counts at 20/min per IP. No proportionate control stops that without CAPTCHAs/personal data. Counts are "recorded clicks", not proof of humans. |
| AT3a | limiter store failure fails OPEN (click still stored) | PASS | 201 + stored while rate-guard list throws |
| AT3b | event store failure -> 503 (page ignores it; link already opened) | PASS | 503 |
| AT5 | 300 concurrent clicks from distinct clients -> 300 distinct records, no loss | PASS | records=300 total=300 (stub store) |
| AT6 | 6000 records over 3 Aden days, page size 1000: totals exact AND no per-event reads | PASS | total=6000 today=2000 blob reads=0 (pages of 1000) |
| AT6b | dozens of pages: 12000 keys in ONE day with page size 500 not truncated | PASS | total=12000 |
| AT6c | time budget: slow storage returns complete:false (never silent partial) | PASS | complete=false |
| AT7 | legacy V1.2 records (click/<utc-day>/<uuid>) + new records both counted | PASS | total=3 legacy=2 (malformed/unknown ignored); legacy 21:30Z counted on Aden 18th |
| AT8a | Aden day boundary: 20:59:59Z -> 17th, 21:00:00Z -> 18th | PASS | ok |
| AT8b | new click at 00:30 Aden is stored under the Aden day, `at` stays UTC | PASS | v2/2026-11-18/makeup/phone/20261… |
| AT8c | "today" = Aden calendar day; summary today/7/30 windows exact; empty days = 0 | PASS | today=2 last7=5 last30=17 range90=28 |
| AT8d | range params: today/1/7/30/90 valid, others 400, days= legacy alias works | PASS | ok |
| AT9 | unauthorised admin access rejected on both endpoints; POST -> 405 | PASS | 401×4, 405, 200×2 |
| AT9b | password < 12 chars: admin 503 and feedback intake 503 (unchanged contract) | PASS | 503/503 |
| AT10a | 500 password guesses from one client: at most 5 get a 401, the rest 429 | PASS | {"401":5,"429":495} |
| AT10b | while locked even the CORRECT password is refused (429 + Retry-After + Arabic message) | PASS | 429 |
| AT10c | another client is unaffected; lock expires after 15 minutes | PASS | 200 / 200 after 15m |
| AT10d | concurrent burst of 100 guesses: at most 5 reach the password check | PASS | 401=6 429=94 |
| AT10e | successful logins never count toward lockout (30 in a row) | PASS | 30×200 |
| AT10f | guard storage failure fails CLOSED for admin (503), never open | PASS | 503 |
| AT10g | raw IPs are never stored (markers use salted hash) | PASS | rl/a/7915f091c7998ad0/1794972713031-88fd1a10-d966-4118-9cc2- |
| AT11a | new feedback accepted; old-format and undated records still readable; inbox not broken | PASS | items=3 undated=1 skipped=2 (no 503) |
| AT11b | inbox with 1200 messages, page size 500: all read, newest 500 returned, hasMore true, no truncation | PASS | total=1200 items=500 newest first |
| AT11c | feedback never deleted/rewritten by any V1.2.1 code path | PASS | record untouched; (only rate-guard markers are ever deleted) |
| AT11d | feedback flood: 5 per client per 10 min, then 429; other client fine | PASS | 201,201,201,201,201,429,429,429,429,429,429,429 |
| AT11e | global daily cap protects storage (default 300) and releases the client marker | PASS | 201,201,201,201,201,201,201,201,201,201,429,429,429,429 |
| AT11f | feedback: same-origin required; honeypot silent; validation unchanged | PASS | ok |
| AT-misc1 | tracking record contains no personal data | PASS | keys: at,channel,store,v |
| AT-misc2 | rate-limit markers swept by admin-clicks (older than 1h) | PASS | old markers swept; left=1 (includes recent) |
| AT1 | all 22 contact links present, channel matches href type, store matches its section | PASS | 22 links OK; all anchor hrefs byte-identical to the V1.2 package |
| AT-CSP1 | index: CSP header present, no CSP violations, no page errors | PASS | ok |
| AT-CSP2 | CSP actually blocks an injected inline script | PASS | blocked |
| AT2-e2e | browser click -> beacon -> real handler -> stored with the correct store+channel (22/22) | PASS | 22 records; request headers: origin=http://127.0.0.1:42661 sec-fetch-site=undefined |
| AT-AUX | middle-click (auxclick) is tracked once; right-click is not | PASS | +1 |
| AT3-hang | real navigation to the link target is not delayed when tracking is hang | PASS | navigated to https://wa.me/967737099784 in 21ms |
| AT3-abort | real navigation to the link target is not delayed when tracking is abort | PASS | navigated to https://wa.me/967737099784 in 28ms |
| AT3-503 | real navigation to the link target is not delayed when tracking is 503 | PASS | navigated to https://wa.me/967737099784 in 25ms |
| AT3-429 | real navigation to the link target is not delayed when tracking is 429 | PASS | navigated to https://wa.me/967737099784 in 21ms |
| AT3-nobeacon | fallback fetch(keepalive) works when sendBeacon is unavailable | PASS | 1 record |
| AT4-ui | rapid repeated clicks from one device: only 20/min stored, UI unaffected | PASS | 60 clicks -> 20 stored |
| AT12-index | public inbox CSV export neutralises = + - @ and TAB-prefixed cells; Arabic BOM; no XSS | PASS | all 5 hostile cells prefixed with apostrophe |
| AT-CSP3 | admin: CSP + noindex + no-store + frame protection headers; no violations | PASS | ok |
| AT9-ui | before login no customer data in DOM; wrong password shows error | PASS | ok |
| AT10-ui | after 5 wrong passwords the 6th shows the lockout message (even with the right password) | PASS | محاولات كثيرة. أعد المحاولة بعد 15 دقيقة. |
| AT15a | dashboard numbers equal the seeded REAL records; no synthetic/trial/visit/conversion wording | PASS | KPI=15 as seeded; forbidden phrases absent |
| AT8-ui | periods: today=5, 7d=9, 30d=15, 90d=16 (Aden calendar); summary table today/7/30 | PASS | 5,9,15,16 \| ميك أب هاوس\|3\|7\|7 ; عنوان العطر\|2\|2\|8 ; الإجمالي\|5\|9\|15 |
| AT-store | store filter separates the shops | PASS | perfume=8 (2+6) |
| AT12-admin | admin CSV exports neutralise formulas (messages, report, daily); BOM present | PASS | ok |
| AT11-ui | inbox shows old + undated messages, undated flagged, search works, modal safe | PASS | 8 rows, status mentions undated |
| AT-logout | logout clears data; reload returns to login; nothing in storage | PASS | ok; 0 CSP violations; 0 page errors |
| AT-F5a | server error on clicks: clear error message + retry button (not a silent "—") | PASS | تعذر تحميل النقرات: تعذر قراءة إحصاءات النقراتإعادة المحاولة |
| AT-F5b | retry button recovers once the server is back | PASS | آخر تحديث: ٦:٣٢:١١ ص (توقيت اليمن) |
| AT-F5c | network failure shows a connection message | PASS | تعذر تحميل النقرات: تعذر الاتصال بالخادم. تحقق من الإنترنت.إعادة المحاولة |
| AT-F5d | loading state is shown while the server is slow | PASS | loading -> ok |
| AT14 | admin at 360px: no horizontal page overflow on any section; screenshots saved | PASS | overview:0 visitors:0 contacts:0 feedback:0 reports:0 settings:0 |
| AT14b | public site at 360px: no horizontal overflow, no page errors | PASS | overflow=0 |
| AT13 | public/ holds only the two pages; source, package.json, docs, tests are NOT in the published folder or served | PASS | published=admin.html+index.html; 6 probe paths -> 404 (local server of public/ only; Netlify itself NOT TESTED) |
| AT13b | netlify.toml is in sync with the inline scripts (CSP hashes) | PASS | in sync |
| SMOKE-SELF | tools/smoke-test.mjs passes against the local server (rate + concurrency 15 + lockout) | PASS | ALL PASSED (15 checks; rate-limit step skipped to avoid the 61s wait) |

# DevFest Konya '26 Pasaport

Katılımcıların stant, oturum ve görev kodlarını girip çekiliş hakkı topladığı sistem.

- **Ön yüz:** React + Vite + TypeScript, Firebase Hosting
- **Giriş:** Firebase Authentication, **Gmail adresine e-posta bağlantısı** (şifresiz). Google hesabıyla giriş (OAuth) kullanılmıyor. Kimlik kişisel Gmail adresidir; öğrenci/kurum e-postası kabul edilmez. Çıkış yapan kişi aynı Gmail ile girince ilerlemesi geri gelir.
- **Kayıt:** ad, soyad, Gmail, telefon (isteğe bağlı). Form bilgisi bağlantı gönderilmeden önce sunucuya bırakılır (`intents/`); bağlantı Gmail uygulamasında ya da başka bir tarayıcıda açılsa da kayıt tamamlanır.
- **API:** Node.js + Express, Cloud Run (`europe-west1`)
- **Veritabanı:** Firestore. Tarayıcı Firestore'a hiç doğrudan erişmez, her şey API üzerinden yapılır.

```
api/      Cloud Run servisi (kod doğrulama, kayıt, sıralama, görevli/yönetici uçları, çekiliş)
web/      React uygulaması
firebase.json, firestore.rules, firestore.indexes.json
```

## Hızlı deneme (Firebase gerekmez)

```bash
npm run demo        # Node.js 22.3+ gerekir; ilk seferde bağımlılıkları kendisi kurar
```

Tarayıcıda **http://localhost:5173** açılır. API bellekte çalışır, kapatınca veriler sıfırlanır. Gmail kutusuna aşağıdaki adreslerden birini yazıp **Giriş yap**'a bas. Demoda e-posta gitmez; Gmail'e gidecek bağlantı ekranda açılır, ona tıklayınca giriş yapılır. Giriş ekranındaki adreslere tıklayınca kutuya kendiliğinden yazılır.

| Hesap | Ne için |
|---|---|
| `katilimci.demo@gmail.com` (Ayşe Demir) | Kayıtlı katılımcı, biraz ilerlemesi var |
| `gorevli.demo@gmail.com` | Görevli: saatlik LinkedIn/Instagram kodları, katılımcı adına kod girme |
| `yonetici.demo@gmail.com` | Yönetici: istatistik, çekiliş (`/#cekilis` sahnesi dahil), CSV'ler, büyük ekran |
| `yeni.demo@gmail.com` | Kaydı yok: kayıt akışını denemek için |
| `203301001@ogr.selcuk.edu.tr` | Öğrenci maili: reddedildiğini görmek için |

Kayıt ol sekmesinden istediğin başka bir Gmail ile yeni hesap da açabilirsin. Test kodları terminalde listelenir: stant `100001–100006`, oyun `200001–200003`, oturum `300001–300011`. Ayşe 11:30'da Gryffindor Salonu'nda (`300003`), `300004` girersen “Aynı anda 2 oturuma katılamazsınız” hatası çıkar.

`web/.env` içinde Firebase bilgisi yokken `cd web && npm run dev` de otomatik demo modunda açılır (API için kökte `npm run demo` gerekir).

Demo modu yalnızca yerel geliştirme sunucusunda çalışır. Normal derlemeye (`npm run build`) ve Cloud Run imajına girmez.

## Kurallar nasıl garanti ediliyor

| Kural | Nasıl |
|---|---|
| Kod tarayıcıdan okunamaz | Kodlar `codes` koleksiyonunda, Firestore kuralları tüm istemci erişimini kapatır |
| Aynı kod iki kez kullanılamaz | `redemptions/{uid}_{adımId}` belgesi transaction içinde oluşturulur, varsa reddedilir |
| Aynı saatte iki oturum olmaz | `attendance/{uid}_{saat}` belgesi; doluysa “Aynı anda 2 oturuma katılamazsınız” |
| Saatlik dönen kodlar | `HMAC(CODE_SECRET, görev:saat)`, veritabanına yazılmaz. Önceki saatin kodu 3 dk daha geçer, sonra “süresi doldu” |
| Kaba kuvvet | 10 dakikada 8 yanlış kod → 5 dakika kilit |
| Tek kişi tek hesap | Gmail tekil (`emails/`); telefon girildiyse o da tekil (`phones/`) |
| Yalnızca kişisel Gmail | `@gmail.com` / `@googlemail.com` dışındaki hesaplar hem ön yüzde hem API'de reddedilir (`ALLOWED_EMAIL_DOMAINS` ile değiştirilebilir) |
| Sıralama yükü | `/api/leaderboard` 10 sn bellek + 15 sn CDN önbelleği |

## Görev türleri (`api/seed/event.json`)

| `type` | Örnek | Kod |
|---|---|---|
| `static` | Stantlar, oyunlar, atölyeler | Her adıma seed sırasında rastgele 6 haneli kod üretilir |
| `session` | Oturumlar | Her oturuma bir kod; aynı `slot` değerine sahip oturumlar paraleldir |
| `rotating` | LinkedIn, Instagram | `rotateMinutes` (varsayılan 60) dakikada bir değişir, görevli ekranında görünür |

`api/seed/event.example.json` dosyasını `api/seed/event.json` olarak kopyalayıp gerçek stant, oturum ve puanlarla doldurun. Bu dosya repoya girmez.

## Google Cloud'a kurulum ve yayın

Tüm Google Cloud/Firebase işleri `deploy.py` ile yapılır (Windows, macOS, Linux). Gerekenler: [gcloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud auth login` yapılmış), Node.js 22+, Python 3. Her komut `--dene` ile çalıştırılırsa hiçbir şey yapmadan ne yapacağını yazdırır.

**1. Firebase projesi (konsoldan, bir kez):** [console.firebase.google.com](https://console.firebase.google.com) → yeni proje → **Blaze** planı. Blaze şart: Cloud Run için ve Spark planında günde yalnızca 5 giriş e-postası gönderilebildiği için (Blaze'de 25.000). Google Cloud konsolunda bütçe uyarısı kur.

**2. Otomatik kurulum (bir kez):**
```bash
python deploy.py kurulum --proje <proje-id>
```
API'leri açar, Firestore veritabanını (`europe-west1`) oluşturur, saatlik kodların sırrını Secret Manager'a yazar, Cloud Run'a izinleri verir, Firestore kurallarını ve indeksi yükler. Sonunda konsoldan elle yapılacakları listeler:

- **Authentication → Sign-in method → Email/Password → Email link (passwordless sign-in)** açılır. Google sağlayıcısı gerekmez.
- **Authentication → Templates:** giriş e-postasının dili Türkçe yapılır.
- **Authentication → Settings:** etkinlik günü için yeni hesap kotasına geçici artış planlanır. Varsayılan sınır **IP başına saatte 100 yeni hesap**; salondaki herkes aynı Wi-Fi'dan kayıt olursa takılır.
- **Proje ayarları → Web uygulaması ekle** → yapılandırma `web/.env` dosyasına yazılır (`web/.env.example`'a bak).

**3. Etkinlik verisi:** `api/seed/event.example.json` → `api/seed/event.json` olarak kopyalanır, gerçek stant/oturum/puan/görevli bilgileriyle doldurulur (repoya girmez).
```bash
gcloud auth application-default login   # bir kez
python deploy.py seed                    # → api/seed/codes-print.csv (baskı listesi)
```
Seed tekrar çalıştırılabilir: üretilmiş kodlar korunur, basılmış kartlar geçersiz olmaz.

**4. Yayın:**
```bash
python deploy.py yayinla                 # API → Cloud Run, ön yüz → Firebase Hosting
python deploy.py yayinla --sadece web    # yalnızca ön yüz
```
Site: `https://<proje-id>.web.app`

**5. Etkinlik günü:**
```bash
python deploy.py etkinlik-gunu           # sabah: Cloud Run en az 1 kopya, ilk istek beklemez
python deploy.py etkinlik-gunu --kapat   # akşam: tekrar 0
```

## Roller

`event.json` içindeki `roles.admins` ve `roles.staff` listelerine Gmail adreslerini yazıp `npm run seed` çalıştırın.

- **Görevli:** dönen kodları görür, katılımcının Gmail adresiyle onun adına kod girebilir (telefonu kapanan vb. için).
- **Yönetici:** görevli + canlı istatistik + çekiliş yapma/yönetme + çekiliş CSV'leri + büyük ekran.

## Ekranlar

| Adres | İçerik |
|---|---|
| `/` | Pasaport: en üstte canlı akış (**Şu an** kartı), kod girişi, görev ilerlemesi, hak sayısı, ilk 5. Kart giriş/kayıt ekranında da başlığın altında görünür |
| `/#oturumlar` | **Akış** sekmesi: oturumlar ve genel maddeler (kayıt, ara, öğle arası, çekiliş) tek listede, katılınan/kilitlenen oturumlar |
| `/#siralama` | Top 20 |
| `/#gorevli` | Dönen kodlar + katılımcı adına kod girme |
| `/#yonetim` | İstatistik, çekiliş (yapma, geçmiş, teslim durumu, iptal) ve çekiliş dosyaları |
| `/#cekilis` | Projektör için tam ekran çekiliş sahnesi (yalnızca yönetici; değilse pasaporta yönlendirir) |
| `/#ekran` | Salon ekranı için tam ekran Top 20 (giriş gerekmez) |

## Etkinlik akışı

Etkinlikte **tam 2 salon** vardır. Sitenin en üstündeki **Şu an** kartı her salonda şu an ne olduğunu, ne kadar kaldığını ve sırada ne olduğunu gösterir; **Akış** sekmesi (`/#oturumlar`) tüm programı saat sırasıyla listeler. Her ikisi de `event.json`'dan gelir ve kod içermez (`/api/config`).

```json
"halls": [ { "id": "salon-1", "name": "Gryffindor Salonu" }, { "id": "salon-2", "name": "Slytherin Salonu" } ],
"sessions": [ { "id": "s02", "slot": "10:00", "end": "10:45", "hall": "salon-1", "title": "…", "speaker": "…" } ],
"agenda": [
  { "id": "a01", "start": "08:30", "end": "09:00", "hall": null,       "title": "Kayıt ve karşılama" },
  { "id": "a04", "start": "16:30", "end": "17:15", "hall": "salon-1", "title": "Çekiliş ve kapanış", "note": "isteğe bağlı" }
]
```

| Alan | Anlamı |
|---|---|
| `halls` | Tam 2 salon: `id` (küçük harf/rakam/tire) ve `name` |
| `sessions[].slot` | Oturumun **başlangıç** saati (`SS:DD`). Paralel oturum kuralı (aynı saatte tek oturum) buna bağlıdır, saat değişirse katılım kayıtları da etkilenir |
| `sessions[].end` | Bitiş saati, `slot`'tan sonra olmalı |
| `sessions[].hall` | Salon id'si (`halls` içinden) |
| `agenda[]` | Oturum olmayan maddeler: kod almaz, hak vermez, yalnızca gösterim içindir. `hall: null` = **Tüm alan** (iki salonu birden kaplar) |

`npm run seed` şunları doğrular, biri tutmazsa hata verip çıkış kodu 1 ile durur: tam 2 salon, `SS:DD` saat biçimi, `end > başlangıç`, salon id'sinin `halls` içinde olması (agenda'da ya da `null`), tekrarlanan id (oturum + agenda birlikte) ve **aynı salonda zaman çakışması** (oturum + agenda birlikte; "Tüm alan" maddesi iki salonla da çakışamaz, uç uca gelen maddeler çakışma sayılmaz).

Saatler her zaman **Europe/Istanbul** saatine göre okunur (cihazın saat dilimi önemli değil), tarih `event.date`'tir; kart 30 saniyede bir yenilenir. Etkinlik başlamadan "21 Kasım, 08:30'da başlıyoruz", bittikten sonra "Etkinlik sona erdi" görünür. Geliştirirken (`npm run demo`, `npm run dev`) adrese `?saat=10:40` eklemek "şu an"ı etkinlik gününün o saatine alır; bu parametre yayın derlemesinde yoktur.

## Çekiliş

Gün sonunda yönetici, projektöre bağlı bilgisayarda yönetici Gmail'iyle girip **`/#cekilis`** sahnesini açar (Yönetim sekmesindeki *Tam ekran sahneyi aç*). Kategori, kazanan/yedek sayısı ve isteğe bağlı ödül adı seçilip **Çek**'e basılır. Seçim **sunucuda** yapılır; ekrandaki dönen isimler yalnızca gösteridir ve sonucu değiştirmez. Sonuçlar (kazanan, yedek, hangi kategori) `draws` koleksiyonuna kaydedilir. Aynı işlemler Yönetim sekmesindeki **Çekiliş** bölümünden de yapılabilir; orada geçmiş çekilişler, teslim durumu, iptal ve CSV (*Kazananları indir*) bulunur.

**Kategoriler** `event.json` içindeki `raffles` dizisinde tanımlanır (`npm run seed` ile yazılır; bilinmeyen görev id'si seed'i hatayla durdurur):

```json
{ "id": "gorev",  "name": "Görev Çekilişi",  "tasks": ["stand","game","linkedin","instagram"], "weight": "tickets" },
{ "id": "oturum", "name": "Oturum Çekilişi", "tasks": ["session"], "weight": "count" }
```

Bir kişinin kategorideki **şansı** `api/src/raffle.js` içindeki `weightFor` fonksiyonunda hesaplanır: `tickets` → listedeki görevlerin ilerleme × ödül toplamı, `count` → listedeki görevlerin ilerleme toplamı. Kademeli hak kuralı kesinleşince yalnızca bu fonksiyon değişir.

| Kural | Ayrıntı |
|---|---|
| Havuz | Şansı > 0 olan kayıtlı katılımcılar |
| Havuza girmez | İptal edilmemiş herhangi bir çekilişte **kazanan** olanlar (bekliyor / teslim edildi / gelmedi, kazanana geçen yedekler dahil), `roles` listesindeki görevli ve yöneticiler |
| Yedek | Yedek olarak çıkmak havuzdan çıkarmaz; ancak kazanana geçerse çıkar |
| Seçim | `crypto` ile ağırlıklı, iadesiz: aynı kişi aynı çekilişte iki kez çıkmaz. Önce kazananlar, sonra yedekler |
| Sayılar | Kazanan 1–50, yedek 0–50. Havuz yetmezse çekilebildiği kadar çekilir, yanıtta ve sahnede belirtilir. Havuz boşsa çekiliş yapılmaz |
| Eşzamanlılık | `locks/draw` belgesi + transaction: aynı anda tek çekiliş (ya da sonuç/iptal işlemi). Takılı kalan kilit 1 dk sonra düşer |
| Gelmedi | Kişi elenir, sıradaki **bekleyen yedek** kazanana geçer. Yedek kalmadıysa söylenir, otomatik yeni çekim yapılmaz |
| Teslim edildi / Gelmedi | Yalnızca bekleyen kazanan (ya da kazanana geçen yedek) işaretlenir; işaret geri alınamaz |
| İptal | Çekiliş kaydı silinmez, durumu "iptal edildi" olur; kazananlar havuza geri döner ve pasaportlarındaki kart kalkar |
| Katılımcı | Pasaportun en üstünde **Kazandın!** kartı (kategori, ödül, "Ödülünü almak için kayıt masasına gel."); teslim edilince "Ödülünü aldın". Yedeklik bilgisi katılımcıya gösterilmez |

Çekiliş uçları (hepsi yönetici rolü ister, `Cache-Control: no-store`):

| Uç | İş |
|---|---|
| `GET /api/admin/raffles` | Kategoriler + anlık havuz büyüklüğü ve toplam şans |
| `GET /api/admin/raffles/:id/names` | Sahne animasyonu için havuzdaki "ad soyad" listesi (telefon/e-posta yok) |
| `POST /api/admin/draws` | `{ raffleId, winners, backups, prize? }` → çekilişi yapar, kaydı döner |
| `GET /api/admin/draws` | Tüm çekilişler (yeniden eskiye) |
| `POST /api/admin/draws/:id/results/:index` | `{ status: "teslim edildi" \| "gelmedi" }` |
| `POST /api/admin/draws/:id/cancel` | Çekilişi iptal eder |
| `GET /api/admin/draws/export` | CSV: Çekiliş, Kategori, Ödül, Tür, Sıra, Durum, Ad Soyad, Telefon, E-posta, Zaman (iptal edilen çekilişlerin satırları durum sütununda "iptal edildi" der) |

Demoda (`npm run demo`) `yonetici.demo@gmail.com` ile giriş yapıp tam akış denenebilir; örnek katılımcılar hem görev hem oturum havuzundadır.

## Çekiliş dosyaları

Bunlar harici çekiliş uygulaması içindir; yukarıdaki sistemden bağımsızdır.

Yönetim ekranından indirilen CSV'lerin ilk dört sütunu çekiliş uygulamasının beklediği sırada: **Zaman damgası, Ad Soyad, Telefon, E-posta**. Telefon isteğe bağlı olduğu için boş olabilir; çekiliş uygulaması kişiyi telefonla tanıyorsa e-postayı kullanacak şekilde güncellenmeli.

- `ozet`: kişi başı tek satır + görev bazında ilerleme
- `hak`: her çekiliş hakkı için bir satır (ağırlıklı görev çekilişi)
- `oturum`: katılınan her oturum için bir satır (oturum çekilişi)

`hak` ve `oturum` dosyalarında aynı kişi birden çok satırda yer alır. Çekiliş uygulaması tekrarlı satırları silmemeli.

## Yerel geliştirme (emülatörle)

`python start.py` emülatörleri, seed'i, API'yi ve ön yüzü tek komutla başlatır (Java gerekir). Elle yapmak istersen:

```bash
# Terminal 1: emülatörler
firebase emulators:start --only auth,firestore --project demo-pasaport

# Terminal 2: API
cd api && npm ci
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export GCLOUD_PROJECT=demo-pasaport CODE_SECRET=yerel-gelistirme-sirri-123
npm run seed && npm run dev

# Terminal 3: ön yüz (giriş bağlantısı e-postayla gitmez, emülatör terminaline yazılır)
cd web && npm ci
VITE_USE_EMULATOR=true VITE_FIREBASE_PROJECT_ID=demo-pasaport npm run dev
```

## Testler

```bash
cd api
npm test           # saatlik kod, telefon/kayıt doğrulama, çekiliş şansı ve ağırlıklı/iadesiz seçim, akış doğrulaması (seed)
npm run test:e2e   # API uçtan uca: kayıt, kayıt niyeti, tekrar kod, oturum çakışması, süresi dolan kod,
                   # eşzamanlı istek, deneme sınırı, sıralama, roller, CSV dışa aktarımı; çekiliş: ağırlıklı seçim,
                   # havuz dışı kuralları, yedek/gelmedi/iptal, eşzamanlı çekiliş kilidi, çekiliş CSV'si, /api/me wins; /api/config'te salon/akış alanları ve kod sızmaması
```

```bash
cd web && npm test # "Şu an" hesabı (src/now.ts): başlamadan önce, iki salon, boş salon, tüm alan, bitiş, gece yarısı/saat dilimi
```

`test:e2e` gerçek Express uygulamasını bellek içi bir Firestore taklidiyle çalıştırır, emülatör gerektirmez.

## Yayın öncesi kontrol listesi

- [ ] Blaze planı açık, bütçe uyarısı kurulu
- [ ] `python deploy.py kurulum` çalıştı, konsoldaki elle adımlar yapıldı (e-posta bağlantısı açık, şablon Türkçe)
- [ ] Etkinlik günü için yeni hesap kotasına geçici artış planlandı
- [ ] `event.json` görevleri, puanları ve oturum programı kesinleşti
- [ ] `python deploy.py seed` çalıştı, `codes-print.csv` baskıya gitti
- [ ] `web/public/kvkk.html` aydınlatma metni hukuki olarak dolduruldu
- [ ] Görevli/yönetici Gmail adresleri `roles` listesinde
- [ ] Giriş e-postasının Gmail'de Spam'e düşmediği denendi
- [ ] Gerçek telefonlarla prova: iOS Safari, Android Chrome; bağlantının Gmail uygulamasından açılması
- [ ] Yük testi
- [ ] Etkinlik sabahı `python deploy.py etkinlik-gunu`

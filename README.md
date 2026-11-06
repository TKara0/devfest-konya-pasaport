# DevFest Konya '26 Pasaport

Katılımcıların stant, oturum ve görev kodlarını girip çekiliş hakkı topladığı sistem.

- **Ön yüz:** React + Vite + TypeScript, Firebase Hosting
- **Giriş:** Firebase Authentication, **Gmail adresine e-posta bağlantısı** (şifresiz). Google hesabıyla giriş (OAuth) kullanılmıyor. Kimlik kişisel Gmail adresidir; öğrenci/kurum e-postası kabul edilmez. Çıkış yapan kişi aynı Gmail ile girince ilerlemesi geri gelir.
- **Kayıt:** ad, soyad, Gmail, telefon (isteğe bağlı). Form bilgisi bağlantı gönderilmeden önce sunucuya bırakılır (`intents/`); bağlantı Gmail uygulamasında ya da başka bir tarayıcıda açılsa da kayıt tamamlanır.
- **API:** Node.js + Express, Cloud Run (`europe-west1`)
- **Veritabanı:** Firestore. Tarayıcı Firestore'a hiç doğrudan erişmez, her şey API üzerinden yapılır.

```
api/      Cloud Run servisi (kod doğrulama, kayıt, sıralama, görevli/yönetici uçları)
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
| `yonetici.demo@gmail.com` | Yönetici: istatistik, çekiliş CSV'leri, büyük ekran |
| `yeni.demo@gmail.com` | Kaydı yok: kayıt akışını denemek için |
| `203301001@ogr.selcuk.edu.tr` | Öğrenci maili: reddedildiğini görmek için |

Kayıt ol sekmesinden istediğin başka bir Gmail ile yeni hesap da açabilirsin. Test kodları terminalde listelenir: stant `100001–100006`, oyun `200001–200003`, oturum `300001–300011`. Ayşe 10:00'da Salon B'de (`300003`), `300002` girersen “Aynı anda 2 oturuma katılamazsınız” hatası çıkar.

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
- **Yönetici:** görevli + canlı istatistik + çekiliş CSV'leri + büyük ekran.

## Ekranlar

| Adres | İçerik |
|---|---|
| `/` | Pasaport: kod girişi, görev ilerlemesi, hak sayısı, ilk 5 |
| `/#oturumlar` | Oturum programı, katılınan/kilitlenen oturumlar |
| `/#siralama` | Top 20 |
| `/#gorevli` | Dönen kodlar + katılımcı adına kod girme |
| `/#yonetim` | İstatistik ve çekiliş dosyaları |
| `/#ekran` | Salon ekranı için tam ekran Top 20 (giriş gerekmez) |

## Çekiliş dosyaları

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
npm test           # saatlik kod, telefon/kayıt doğrulama
npm run test:e2e   # API uçtan uca: kayıt, kayıt niyeti, tekrar kod, oturum çakışması, süresi dolan kod,
                   # eşzamanlı istek, deneme sınırı, sıralama, roller, CSV dışa aktarımı
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

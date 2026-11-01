# DevFest Konya '26 Pasaport

Katılımcıların stant, oturum ve görev kodlarını girip çekiliş hakkı topladığı sistem.

- **Ön yüz:** React + Vite + TypeScript, Firebase Hosting
- **Giriş:** Firebase Authentication (Google). Kimlik kişisel **Gmail** adresidir; öğrenci/kurum e-postası kabul edilmez. Şifre yok, çıkış yapan kişi aynı Gmail ile girince ilerlemesi geri gelir.
- **Giriş/kayıt iki yolla:** Gmail adresini yazıp gelen tek kullanımlık bağlantıya tıklamak (şifresiz e-posta bağlantısı) ya da “Google ile giriş yap”.
- **Kayıt:** ad, soyad, Gmail, telefon (isteğe bağlı).
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

Tarayıcıda **http://localhost:5173** açılır. API bellekte çalışır, kapatınca veriler sıfırlanır. “Gmail ile giriş yap” denince Google yerine test hesabı seçme kutusu çıkar:

| Hesap | Ne için |
|---|---|
| `katilimci.demo@gmail.com` (Ayşe Demir) | Kayıtlı katılımcı, biraz ilerlemesi var |
| `gorevli.demo@gmail.com` | Görevli: saatlik LinkedIn/Instagram kodları, katılımcı adına kod girme |
| `yonetici.demo@gmail.com` | Yönetici: istatistik, çekiliş CSV'leri, büyük ekran |
| `yeni.demo@gmail.com` | Kaydı yok: kayıt akışını denemek için |
| `203301001@ogr.selcuk.edu.tr` | Öğrenci maili: reddedildiğini görmek için |

Kutudan istediğin başka bir adresle de girebilirsin. Test kodları terminalde listelenir: stant `100001–100006`, oyun `200001–200003`, oturum `300001–300011`. Ayşe 10:00'da Salon B'de (`300003`), `300002` girersen “Aynı anda 2 oturuma katılamazsınız” hatası çıkar.

Gmail adresini yazıp “Giriş yap” dersen demoda e-posta gitmez; Gmail'e gidecek bağlantı ekranda gösterilir.

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

## İlk kurulum (bir kez)

1. **Firebase projesi:** [console.firebase.google.com](https://console.firebase.google.com) → yeni proje → **Blaze** planı (Cloud Run için gerekli). Google Cloud konsolunda bütçe uyarısı kurun.
2. **Authentication** → Sign-in method → **Google**'ı ve **Email/Password → Email link (passwordless sign-in)** seçeneğini açın (Gmail adresine giriş bağlantısı için). Özel alan adı kullanacaksanız *Authorized domains*'e ekleyin.
3. **Firestore** → veritabanı oluşturun, konum `europe-west1` (ya da `eur3`).
4. **Web uygulaması** ekleyin, yapılandırmayı `web/.env` dosyasına yazın (`web/.env.example`'a bakın).
   `VITE_FIREBASE_AUTH_DOMAIN` olarak sitenin yayınlandığı alan adını (`<proje>.web.app` ya da özel alan adınız) yazın, yoksa iOS Safari'de giriş bozulabilir.
5. Proje kimliğini bağlayın:
   ```bash
   cp .firebaserc.example .firebaserc   # içindeki proje kimliğini düzeltin
   firebase deploy --only firestore     # kurallar + sıralama indeksi
   ```
6. **Kod sırrı** (saatlik kodları üretir, kimseyle paylaşmayın):
   ```bash
   openssl rand -hex 32 | tr -d '\n' | gcloud secrets create pasaport-code-secret --data-file=-
   ```

## Yayına alma

```bash
# 1) API → Cloud Run
gcloud run deploy pasaport-api --source api --region europe-west1 \
  --allow-unauthenticated \
  --set-secrets CODE_SECRET=pasaport-code-secret:latest \
  --max-instances 10 --concurrency 80 --memory 512Mi

# Cloud Run servis hesabına sır okuma izni (ilk seferde hata verirse)
gcloud secrets add-iam-policy-binding pasaport-code-secret \
  --member serviceAccount:<PROJE_NUMARASI>-compute@developer.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

# 2) Görevler, oturumlar, kodlar, roller → Firestore
gcloud auth application-default login
cd api && GCLOUD_PROJECT=<proje-id> npm run seed     # → seed/codes-print.csv (baskı listesi)

# 3) Ön yüz → Firebase Hosting (/api/** isteklerini Cloud Run'a yönlendirir)
cd ../web && npm ci && npm run build && cd .. && firebase deploy --only hosting
```

`npm run seed` tekrar çalıştırılabilir: daha önce üretilmiş kodlar korunur, basılmış kartlar geçersiz olmaz. Yalnızca yeni eklenen adımlara kod üretilir.

**Etkinlik günü** ilk istek yavaş başlamasın diye:
```bash
gcloud run services update pasaport-api --region europe-west1 --min-instances 1
```
Etkinlikten sonra `--min-instances 0` yapın.

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

## Yerel geliştirme

```bash
# Terminal 1: emülatörler
firebase emulators:start --only auth,firestore --project demo-pasaport

# Terminal 2: API
cd api && npm ci
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export GCLOUD_PROJECT=demo-pasaport CODE_SECRET=yerel-gelistirme-sirri-123
npm run seed && npm run dev

# Terminal 3: ön yüz
cd web && npm ci
VITE_USE_EMULATOR=true VITE_FIREBASE_PROJECT_ID=demo-pasaport npm run dev
```

## Testler

```bash
cd api
npm test           # saatlik kod, telefon/kayıt doğrulama
npm run test:e2e   # API uçtan uca: kayıt, tekrar kod, oturum çakışması, süresi dolan kod,
                   # eşzamanlı istek, deneme sınırı, sıralama, roller, CSV dışa aktarımı
```

`test:e2e` gerçek Express uygulamasını bellek içi bir Firestore taklidiyle çalıştırır, emülatör gerektirmez.

## Yayın öncesi kontrol listesi

- [ ] `event.json` görevleri, puanları ve oturum programı kesinleşti
- [ ] `npm run seed` çalıştı, `codes-print.csv` baskıya gitti
- [ ] `web/public/kvkk.html` aydınlatma metni hukuki olarak dolduruldu
- [ ] Görevli/yönetici Gmail adresleri `roles` listesinde
- [ ] Gerçek telefonlarla prova (iOS Safari, Android Chrome, Instagram içinden açılış)
- [ ] Yük testi
- [ ] Etkinlik sabahı `--min-instances 1`

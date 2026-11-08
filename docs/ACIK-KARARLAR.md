# Açık kararlar

Henüz kesinleşmemiş konular. Karar verildikçe "Karar" sütunu doldurulur, ilgili kod/ayar güncellenir.
"Varsayılan", karar gelene kadar sistemin nasıl davrandığıdır.

## Çekiliş

| Konu | Varsayılan (şimdilik) | Karar |
|---|---|---|
| Ekstra çekiliş kategorileri (Instagram, sponsor ödülleri vb.) | Yalnızca **Görev** ve **Oturum** çekilişi | |
| Kademeli hak kuralı (ör. 5 stant → 1 hak, 7 stant → 2, 10 stant → 3) ve diğer görevlere/oturumlara nasıl uygulanacağı | Her kod, görevin `reward` değeri kadar hak verir | |
| Görev çekilişine hangi görevler sayılır | Oturumlar hariç tüm görevler | |
| Oturum çekilişinde şans | Katılınan oturum sayısı kadar | |
| "Gelmedi" işaretlenen kazanan sonraki çekilişlere girebilir mi | Giremez | |
| Görevli/yönetici hesapları çekilişlere girer mi | Girmez | |
| Ödül adları ve hangi çekilişte hangi ödül | Çekiliş açılırken yönetici ödül adını yazar (isteğe bağlı) | |
| Çekilişten önce kod girişi kapatılsın mı (çekiliş anında hak sayıları değişmesin diye) | Kapatılmaz; çekiliş o anki haklarla yapılır | |
| Kazanan ödülünü nereden/ne zamana kadar alır (sitedeki bildirim metni) | "Ödülünü almak için kayıt masasına gel." | |

## Kesinleşenler (çekiliş)

- Çekiliş bu sistemden, yönetici hesabıyla, projektöre bağlı bilgisayardan tam ekran yapılır.
- Bir kişi hiçbir çekilişte iki kez kazanamaz. Yedek olarak çıkmak kazanmak sayılmaz.
- Kazanan ve yedek sayısı çekiliş anında seçilir.
- Büyük ekranda animasyon; kazananın adı ve soyadı tam gösterilir.
- Sonrası: Teslim edildi / Gelmedi işareti (Gelmedi → sıradaki yedek kazanan olur), kazananlar listesi indirilir, hatalı çekiliş iptal edilir (kayıtta kalır), kazanana sitede bildirim.

## Yapılacaklar (sistem geliştirme)

| İş | Durum |
|---|---|
| **Etkinlik akışı:** pasaport sayfasının en üstünde "Şu an" kartı (2 salon: her salonda şu an ne var, sırada ne var) + Oturumlar sekmesinde aralar dahil tüm akış | Akış Talha'dan bekleniyor; prompt hazır |
| Kademeli hak sistemi (eşikler `event.json`'dan; sayılar sonra) | Sırada |
| Yönetim panelinde kod girişini aç/kapat anahtarı | Sırada |
| Yük testi betiği (yerelde, eşzamanlı kod girişi) | Sırada |
| Yönetici: katılımcı arama ve yanlış kodu geri alma | İsteğe bağlı |

## Diğer

| Konu | Durum |
|---|---|
| Gerçek görev/stant/oturum listesi (`api/seed/event.json`) | Bekleniyor |
| Etkinlik akışı: saatler, 2 salonun adı, oturumlar + aralar/öğle/çekiliş/kapanış | Talha verecek |
| KVKK aydınlatma metni (`web/public/kvkk.html`) | Bekleniyor |
| Firebase yeni hesap kotası artışı (IP başına saatte 100) | Firebase'e talep açılacak |

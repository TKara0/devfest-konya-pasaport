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
| Kazanan ödülünü nereden/ne zamana kadar alır (sitedeki bildirim metni) | "Ödülünü almak için kayıt masasına gel." | |

## Kesinleşenler (çekiliş)

- Çekiliş bu sistemden, yönetici hesabıyla, projektöre bağlı bilgisayardan tam ekran yapılır.
- Bir kişi hiçbir çekilişte iki kez kazanamaz. Yedek olarak çıkmak kazanmak sayılmaz.
- Kazanan ve yedek sayısı çekiliş anında seçilir.
- Büyük ekranda animasyon; kazananın adı ve soyadı tam gösterilir.
- Sonrası: Teslim edildi / Gelmedi işareti (Gelmedi → sıradaki yedek kazanan olur), kazananlar listesi indirilir, hatalı çekiliş iptal edilir (kayıtta kalır), kazanana sitede bildirim.

## Diğer

| Konu | Durum |
|---|---|
| Gerçek görev/stant/oturum listesi (`api/seed/event.json`) | Bekleniyor |
| KVKK aydınlatma metni (`web/public/kvkk.html`) | Bekleniyor |
| Firebase yeni hesap kotası artışı (IP başına saatte 100) | Firebase'e talep açılacak |

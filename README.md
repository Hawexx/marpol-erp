# Marpol Üretim Yönetim Sistemi (PPM)

Marpol markasına özel **disk cila fırçası** üretimi için web tabanlı üretim yönetim sistemi.
SAP Fiori tasarım standartlarında kurumsal arayüz, rol bazlı yetkilendirme ve uçtan uca
üretim emri takibi sağlar.

## Teknoloji

| Katman | Teknoloji |
| --- | --- |
| Veritabanı | PostgreSQL 16 (Docker) |
| Sunucu | Node.js + TypeScript + Express + Prisma |
| Kimlik doğrulama | JWT (Bearer token) + bcrypt |
| Arayüz | React + TypeScript + Vite + SAP UI5 Web Components |
| Veri yönetimi | TanStack Query |

## Kurulum

Gereksinimler: **Node.js 20+** ve **Docker Desktop**.

```bash
cp server/.env.example server/.env         # şablonu kopyala
openssl rand -base64 48                    # üretilen değeri JWT_SECRET'a yaz

npm install          # tüm workspace bağımlılıkları
npm run db:up        # PostgreSQL konteynerini başlat (port 5433, yalnızca localhost)
npm run prisma:migrate # şemayı veritabanına uygula (migration)
npm run seed         # başlangıç verisi + demo kullanıcılar
npm run dev          # API (4000) + arayüz (5173) birlikte
```

Arayüz: <http://localhost:5173>

> `JWT_SECRET` tanımlı değilse, 32 karakterden kısaysa veya örnek dosyadaki
> varsayılan değerdeyse **API açılmaz**. Bu bilinçli bir davranıştır: bilinen
> bir anahtarla imzalanan token'lar herkes tarafından üretilebilir.

### Demo kullanıcılar

| Kullanıcı adı | Şifre | Yetki |
| --- | --- | --- |
| `admin` | `Marpol2026!` | Tam yetki (yetkilendirme paneli dahil) |
| `uretimmuduru` | `Uretim2026!` | Üretim ve tanım kartları |
| `operator` | `Operator2026!` | Yalnızca üretim emirleri (proses adımı ilerletme) |

Bu şifreler **yalnızca yerel geliştirme içindir**. `NODE_ENV=production` iken
seed, şifreler `SEED_ADMIN_PASSWORD` / `SEED_MANAGER_PASSWORD` /
`SEED_OPERATOR_PASSWORD` ile verilmediği sürece çalışmayı reddeder.

### Canlıya almadan önce

- [ ] `JWT_SECRET` üretime özel ve rastgele (`openssl rand -base64 48`)
- [ ] Tüm demo şifreleri değiştirildi
- [ ] `POSTGRES_PASSWORD` varsayılan `marpol` değerinden değiştirildi
- [ ] `CORS_ORIGIN` gerçek arayüz adresine ayarlandı (üretimde zorunlu)
- [ ] Ters vekil arkasındaysa `TRUST_PROXY` ayarlandı (denetim IP'leri için)
- [ ] HTTPS sonlandırma yapılandırıldı (HSTS yalnızca üretimde gönderilir)

## Sekmeler

1. **Üretim Emri Oluşturma** — kumaş, flanş, kimyasal oranlama, disk çapı, adet, katman,
   aciliyet ve termin bilgileriyle emir açılır. Reçete seçildiğinde oranlar otomatik yüklenir;
   emre özel değiştirilebilir. Oran toplamı %100 olmadan kayıt yapılamaz.
2. **Üretim Emirleri** — emirlerin düştüğü sekme. KPI kutuları, durum filtresi, termin/gecikme
   takibi, durum geçişleri (onay → üretim → tamamlandı) ve proses adımı ilerletme.
3. **Flanş Çeşitleri** — flanş tanım kartları (malzeme, dış/iç çap, mil deliği, kalınlık, delik adedi).
4. **Kumaş Çeşitleri** — kumaş kartları ve kumaşa emdirilecek kimyasallar. Kimyasallar aynı
   sekmedeki ikinci sekmede kodlarıyla birlikte yönetilir.
5. **Kimyasal Reçete** — kimyasal karışım reçeteleri; referans karışım miktarına göre bileşen
   miktarları hesaplanır.
6. **İş Akışı / Proses Şemaları** — n8n mantığında sürükle-bırak şema editörü. Adımlar
   (başlangıç, operasyon, makine, kalite, bekleme, karar, bitiş) makineye, süreye ve sıcaklığa
   bağlanır; adımlar birbirine bağlanarak akış kurulur.
7. **Yetkilendirme Paneli** — personel hesapları ve sekme bazlı yetki matrisi
   (görüntüle / ekle / düzenle / sil / onayla).

## Yetkilendirme

Her kullanıcının her sekme için ayrı yetki satırı vardır. Yetki hem arayüzde (menü ve butonlar
gizlenir) hem de sunucuda (`requirePermission`) uygulanır — API doğrudan çağrılsa bile yetkisiz
işlem reddedilir. `isAdmin` işaretli kullanıcılar tüm yetkilere sahiptir.

## Proje yapısı

```
server/
  prisma/schema.prisma   Veritabanı şeması
  prisma/seed.ts         Başlangıç verisi
  src/routes/            Modül bazlı API uçları
  src/middleware/auth.ts JWT + yetki kontrolü
web/
  src/pages/             Sekmeler
  src/components/        Ortak arayüz parçaları
  src/api/               API istemcisi ve tipler
```

## Geliştirme komutları

```bash
npm test               # birim testleri (Vitest)
npm run lint           # ESLint
npm run prisma:migrate # yeni migration üret ve uygula (geliştirme)
npm run prisma:deploy  # mevcut migration'ları uygula (üretim)
```

Şema `prisma migrate` ile yönetilir; `prisma db push` yalnızca hızlı deneme
içindir ve migration geçmişi bırakmaz.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | API + arayüzü birlikte çalıştırır |
| `npm run dev:server` / `npm run dev:web` | Tek tek çalıştırır |
| `npm run build` | Her ikisini de derler |
| `npm run prisma:studio -w server` | Veritabanı görsel yönetimi |
| `npm run db:down` | Veritabanı konteynerini durdurur |

## Denetim kaydı

Oluşturma, güncelleme, silme, giriş ve durum değişiklikleri `audit_logs` tablosuna kullanıcı ve
IP bilgisiyle yazılır.

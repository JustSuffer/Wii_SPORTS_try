# 🎮 Wii Sports Web - iPhone Hareket Kontrollü Spor Paketi

Bu proje, efsanevi **Nintendo Wii Sports & Wii Sports Resort** deneyimini PC tarayıcınızda sıfırdan hayata geçirirken, elinizdeki **iPhone'u gerçek bir Wii Remote (Wiimote)** kumandasına dönüştürür.

---

## 🌟 Öne Çıkan Özellikler

1. **Sıfır Kurulumlu iPhone Wii Remote (Web App):**
   - App Store'dan uygulama indirmeye gerek yok.
   - PC ekranında beliren **QR Kodu iPhone kamerasıyla okutarak** Safari üzerinden anında bağlanın.
   - 60 FPS hızında ivmeölçer (accelerometer), jiroskop (gyroscope) ve yönelim (orientation) akışı.
   - **Taptic Titreşim & Sanal Wiimote Hoparlörü:** Topa vurduğunuzda veya lobutlar devrildiğinde telefonunuz titreşir ve Wiimote hoparlöründen vuruş sesi gelir.

2. **Wii Bowling (10-Labut Klasik):**
   - Cannon-es 3D katı cisim fizik motoruyla gerçekçi labut devrilme fiziği.
   - **Özgün Atış Mekaniği:** iPhone ekranındaki **B Tetik** butonuna basılı tutun, kolunuzu arkaya çekin, ileri savurup topu bırakmak istediğiniz anda **B'yi bırakın**.
   - **Falso (Hook) Fiziği:** Savurma anında bileğinizi sağa veya sola bükerek topa falso verin.
   - Otomatik 10-Frame skorlama, **"STRIKE!"** ve **"SPARE!"** kutlamaları ve ses efektleri.

3. **Wii Tennis (2v2 Çiftler Maçı):**
   - Yemyeşil çim kort, Mii oyuncular ve seyirciler.
   - **Servis:** A butonuna dokunup topu havaya atın, tepe noktasında kolunuzu savurarak servis atın.
   - **Vuruş Zamanlaması:** Erken vuruş çapraza (cross-court), geç vuruş çizgiye (down the line) gider.
   - **Forehand / Backhand & Topspin / Slice:** Telefonunuzun savurma yönü ve bilek açısı otomatik algılanır.

4. **3D Kumanda Laboratuvarı (Controller Lab):**
   - Ekrandaki 3D Wii Remote, elinizdeki iPhone'un fiziksel hareketlerini 1'e 1 takip eder.
   - Tuş tepkileri, ivme değerleri ve anlık vuruş hızölçeri (km/s).

---

## 🚀 Başlatma & Oynama Rehberi

### 1. Sunucuyu Başlatın
Terminalde proje klasöründeyken şu komutu çalıştırın:
```bash
npm start
```
Terminalde PC ekranı linki ve iPhone bağlantı QR kodu belirecektir:
* **PC Ekranı (Oyun):** `https://localhost:8443`
* **iPhone Kumanda:** `https://192.168.1.100:8443/controller.html`

### 2. PC Ekranını Açın
Bilgisayarınızın tarayıcısında (Chrome, Edge vb.) **`https://localhost:8443`** adresine gidin.
*(Gelişmiş -> Siteye İlerle diyerek devam edin)*

### 3. iPhone'u Bağlayın
1. iPhone kameranızla ekrandaki **QR Kodu okutun** ve Safari'de açın.
2. Safari'de ilk açılışta *"Bu Bağlantı Gizli Değil"* uyarısı görürseniz:
   - **Ayrıntıları Göster**'e dokunun.
   - En alttaki **"bu web sitesini ziyaret edin"** seçeneğine dokunun ve onaylayın.
   *(iOS Safari, hareket sensörlerini yalnızca güvenli HTTPS bağlantısında açtığı için yerel SSL sertifikası kullanılmaktadır)*
3. Açılan ekranda mavi **"Kumandayı Etkinleştir"** butonuna dokunun.
4. Çıkan sistem uyarısında **"İzin Ver"** deyin.
5. Telefonunuzu televizyona/monitöre doğru tutup sağ üstteki **🎯 Ortala** butonuna dokunun.
6. Artık iPhone'unuz gerçek bir Wii Remote! İstediğiniz sporu seçip oynamaya başlayın!

# FDRM Analyzer v5.0 — Real-time

Aplikasi analisis sepak bola real-time menggunakan FDRM framework + API-Football.

## Stack
- **Frontend**: Next.js 14 (React)
- **Hosting**: Vercel (gratis)
- **Data**: API-Football (api-sports.io) — 100 req/hari gratis
- **Auto-refresh**: tiap 60 detik otomatis

---

## Cara Deploy ke Vercel

### 1. Upload ke GitHub
```bash
# Di terminal/VS Code
git init
git add .
git commit -m "FDRM v5.0 initial"
git remote add origin https://github.com/USERNAME/fdrm-analyzer.git
git push -u origin main
```

### 2. Import ke Vercel
1. Buka https://vercel.com/dashboard
2. Klik **"Add New Project"**
3. Pilih repo `fdrm-analyzer` dari GitHub
4. Klik **"Deploy"**

### 3. Tambahkan API Key di Vercel
1. Di project Vercel → **Settings** → **Environment Variables**
2. Tambahkan:
   - **Name**: `API_FOOTBALL_KEY`
   - **Value**: `0c94eacce737aeeab2a6c91872575c13`
3. Klik **Save**
4. Klik **Redeploy**

### 4. Selesai!
App kamu live di `https://fdrm-analyzer.vercel.app`

---

## Untuk Development Lokal
```bash
# 1. Install dependencies
npm install

# 2. Buat file .env.local
cp .env.example .env.local
# Edit .env.local, isi API key kamu

# 3. Jalankan
npm run dev
# Buka http://localhost:3000
```

---

## Fitur
- ✅ Live score real-time (auto-refresh 60 detik)
- ✅ Badge 🔴 LIVE untuk pertandingan berlangsung
- ✅ FDRM gate analysis (G1-G6)
- ✅ Final picks otomatis
- ✅ Match yang sudah FT otomatis disembunyikan
- ✅ Multi-liga (pilih bebas)
- ✅ API key aman (tidak terekspos ke browser)

## Catatan Quota API
- Free plan: 100 request/hari
- Tiap klik Refresh: ~2 request per liga (fixtures + standings)
- Pilih 3 liga = 6 request per refresh
- Auto-refresh 60 detik = hemat, tidak refresh kalau tab tidak aktif

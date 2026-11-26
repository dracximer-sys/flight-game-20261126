# Langit Courier: Nusantara Run

![Bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)
![Rank](https://make.fun/badge/best-flight-game-20261126-0057/dracximer-sys/flight-game-20261126/rank.svg)
![Reward](https://make.fun/badge/best-flight-game-20261126-0057/dracximer-sys/flight-game-20261126/reward.svg)

Game terbang 2.5D orisinal untuk bounty make.fun
[best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057):
pesawat prop kecil mengantar paket antar pulau di Nusantara — melewati ring
bercahaya, mendarat di runway, dan menghemat bahan bakar. Chase view di atas
terrain prosedural yang dikenali: pantai, sawah, kota kecil, gunung berapi,
dan dua runway. Dibangun dari nol untuk bounty ini; bukan tiruan game lain.

## Cara main

Pilih misi di menu utama (klik, atau tekan `1`, `2`, `3`), lalu terbang:

1. **Ring Run** — terbang melewati 8 ring emas di atas kepulauan. Cepat dan rapi.
2. **Island Hop** — antar paket: mendarat di dua runway pulau, tiga kali.
3. **Storm Delivery** — badai datang. Enam ring, angin kencang, lalu mendarat.

Terbang melewati ring memberi skor + bonus bahan bakar. Mendarat dengan
benar (pelan, menurun landai, searah runway) memberi skor besar dan
mengisi bahan bakar. Menabrak terrain atau laut mengakhiri penerbangan.
Waktu habis juga mengakhiri misi.

## Kontrol

| Input | Fungsi |
|---|---|
| `W` / `S` atau `↑` / `↓` | Throttle naik / turun |
| `A` / `D` atau `←` / `→` | Belok kiri / kanan |
| Mouse | Geser kiri/kanan untuk belok, atas/bawah untuk trim ketinggian |
| `P` atau `Esc` | Jeda |
| `R` | Ulangi misi |
| `M` | Bisu / nyalakan suara |
| `Enter` | Kembali ke menu utama (dari layar akhir) |

Pitch dibantu otomatis: pesawat men-trim sendiri menuju ketinggian
ring atau runway berikutnya, jadi permainan ini tentang disiplin throttle
dan belok — bukan tentang melawan kontrol.

## Suara

Semua suara disintesis dengan Web Audio API (tanpa file audio): dengung
mesin mengikuti throttle, desir angin mengikuti kecepatan, denting saat
melewati ring, jingle saat mendarat, dan bunyi benturan saat jatuh.

## Teknologi

Vanilla JavaScript + Canvas 2D saja, tanpa library. Semua art digambar
dari kode (terrain prosedural, pesawat, ring, runway, kota). Tanpa fetch,
tanpa Worker, tanpa service worker, tanpa cookie — file statis offline.

Struktur kode (`game/src/`):

- `config.js` — konstanta game dan definisi misi
- `rng.js` — PRNG seeded dan value noise deterministik
- `terrain.js` — kepulauan, ketinggian tanah, runway, kota, awan
- `aircraft.js` — state pesawat dan cara menggambarnya
- `physics.js` — throttle, belok, pitch assist, bahan bakar, tabrakan
- `input.js` — keyboard dan mouse
- `hud.js` — HUD: ketinggian, kecepatan, kompas, bahan bakar, skor
- `audio.js` — suara sintetis Web Audio
- `missions.js` — tiga misi, ring, pendaratan, autopilot
- `render.js` — kamera chase, proyeksi 3D, langit, laut, terrain
- `main.js` — game loop, layar, dan mode screenshot deterministik

## Menjalankan lokal

```sh
node serve.ts
# buka http://localhost:8080
```

## Screenshot deterministik

Game mendukung `?shot=cover|ring|landing|menu` — tiap mode menaruh game
pada state tetap (RNG seeded, autopilot tetap) supaya screenshot bisa
direproduksi. Lihat `SHOTS.md` untuk URL dan viewport tiap screenshot.

## Lisensi

MIT — lihat `LICENSE`.

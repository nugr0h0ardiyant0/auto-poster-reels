# reels

Video reel bernarasi untuk auto-poster, digambar dengan kode (canvas) dan dirender di GitHub Actions.

Setiap folder film (mis. `horor-nomor-lama/`) berisi `film.js` (gambar), `audio/score.py` (musik),
`narasi.json` (waktu tiap kalimat) dan `audio/vo.flac` (narasi). Narasi dibuat di laptop dengan
`tools/buat_reel.py` dari proyek auto-poster, jadi repo ini tidak menyimpan API key.

## Render

Dari folder auto-poster di laptop:

```
python tools/buat_reel.py cloud reels/<film> [storyboard.json]
```

Perintah itu membuat narasi (kalau storyboard diberikan), mendorong folder film ke sini, menjalankan
workflow **Render reel**, menunggu, lalu mengunduh MP4 ke `media/` dan menghapus artefaknya dari GitHub.

Workflow juga bisa dijalankan manual dari tab Actions (isi nama folder film). Film dipecah jadi
potongan yang dirender paralel (maks 20 job), lalu disambung, di-mix ke -14 LUFS, dan di-encode
H.264 + AAC untuk Instagram Reels/Story. Hasilnya artefak `reel` (disimpan 3 hari).

## Kredit

- `skill/`: skrip render, SFX dan mix dari [Motion Reel](https://github.com/Aries-Spring/motion-reel)
  (MIT, lihat `skill/LICENSE`).
- Font Lora dan Inter: SIL Open Font License (lihat `*/fonts/OFL-*.txt`).

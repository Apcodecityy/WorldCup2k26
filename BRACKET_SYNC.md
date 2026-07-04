# Bracket Sync System

## Overview
Sistem ini secara otomatis menyinkronkan data bracket knockout (Round of 16, Quarter-finals, Semi-finals, Final) ke jadwal pertandingan utama, mengganti placeholder team references (W89, W90, dst) dengan nama tim yang sebenarnya.

## Bagaimana Sistem Bekerja

### 1. Data Structure
```
matches.json
├── "matches": [ ... ]        // Jadwal pertandingan utama (dengan placeholder)
├── "bracket": {
│   ├── "r32": [ ... ]        // Round of 32 matches (completed)
│   ├── "r16": [ ... ]        // Round of 16 matches (dengan nama tim sebenarnya)
│   ├── "qf": [ ... ]         // Quarter-finals
│   ├── "sf": [ ... ]         // Semi-finals
│   └── "final": { ... }      // Final
```

### 2. Placeholder References
- **W89**: Winner of match 89
- **W90**: Winner of match 90
- **L101**: Loser of match 101 (untuk Third Place Match)

Contoh:
- Match 97 (QF): home = "W89", away = "W90" → diubah menjadi home = "Morocco", away = "Paraguay"

### 3. Automatic Sync
Sistem sinkronisasi berjalan otomatis di tiga tempat:

#### a) `sync-bracket-to-matches.js`
Script standalone untuk menyinkronkan data:
```bash
node sync-bracket-to-matches.js
```

#### b) `update-matches.js`
Sync berjalan otomatis setelah update dari live feed:
```bash
node update-matches.js
```

#### c) `finalize-results.js`
Sync berjalan otomatis setelah finalize hasil pertandingan:
```bash
node finalize-results.js
```

#### d) GitHub Actions Workflow
`.github/workflows/update-matches.yml` menjalankan:
1. `update-matches.js` (fetch live updates)
2. `finalize-results.js` (mark completed matches)
3. Sync terjadi otomatis di kedua script di atas

### 4. Proses Sync Detail

```javascript
// Resolving Placeholder
1. Baca placeholder team name: "W89"
2. Cari match ID 89 di bracket
3. Ambil team pemenang dari match 89
   - Jika match completed: lihat score siapa yang menang
   - Jika match upcoming: default ke home team
4. Ganti placeholder dengan nama tim sebenarnya
```

## Timeline Sinkronisasi

```
Round of 32 (Match 73-88)
    ↓
R32 Winners digunakan di Round of 16 (Match 91-96)
    ↓
Round of 16 (Match 89-96)
    ↓
R16 Winners digunakan di Quarter-finals (Match 97-100)
    ↓
And so on... QF → SF → Final
```

## Next Match Card

Next match card di home page akan menampilkan nama tim sebenarnya, bukan placeholder:

**Sebelum:**
```
⚡ Next Match
Round of 16
W74 vs W77
01:00 WITA
```

**Sesudah:**
```
⚡ Next Match
Round of 16
Morocco vs Canada
01:00 WITA
```

## File Generated

- `matches.json`: Data source dengan placeholder yang sudah ter-resolve
- `matches-data.js`: Auto-generated copy untuk offline access

## Notes

- Sistem ini fully automatic - tidak perlu manual update
- Placeholder akan ter-resolve seiring pertandingan berjalan
- Untuk upcoming matches (belum ada winner), default menggunakan home team
- Setiap 12 jam, GitHub Actions workflow menjalankan sync otomatis

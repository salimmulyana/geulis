/**
 * Uji aturan Westgard.
 *
 * Angka-angka di sini adalah kasus batas yang menentukan apakah lab menolak
 * satu run QC atau tidak, jadi salah sedikit berarti alat melenceng lolos
 * tanpa ketahuan — atau sebaliknya, run yang sehat ditolak terus-menerus.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nilaiWestgard } from '../src/services/qc.js';

test('titik dalam 2 SD dinyatakan aman', () => {
  assert.deepEqual(nilaiWestgard(1.4, [0.2, -0.5]), { verdict: 'in', rule: null });
});

test('1-2s hanya peringatan, bukan penolakan', () => {
  const out = nilaiWestgard(2.4, [0.1]);
  assert.equal(out.verdict, 'warning');
  assert.equal(out.rule, '1-2s');
});

test('1-3s menolak run', () => {
  assert.deepEqual(nilaiWestgard(3.4, []), { verdict: 'out', rule: '1-3s' });
});

test('2-2s hanya berlaku bila dua titik sesisi', () => {
  assert.equal(nilaiWestgard(2.3, [2.5]).rule, '2-2s');
  // berseberangan: bukan 2-2s
  assert.notEqual(nilaiWestgard(2.3, [-2.5]).rule, '2-2s');
});

test('R-4s menangkap dua titik berseberangan dengan rentang lebih dari 4 SD', () => {
  assert.equal(nilaiWestgard(2.2, [-2.1]).rule, 'R-4s');
});

test('4-1s menangkap bias sistematis sesisi', () => {
  assert.equal(nilaiWestgard(1.2, [1.3, 1.1, 1.5]).rule, '4-1s');
  // satu titik menyeberang membatalkan deret
  assert.notEqual(nilaiWestgard(1.2, [1.3, -0.2, 1.5]).rule, '4-1s');
});

test('10x menangkap pergeseran walau semuanya dalam 1 SD', () => {
  const sembilan = [0.2, 0.3, 0.1, 0.4, 0.2, 0.5, 0.3, 0.2, 0.1];
  assert.equal(nilaiWestgard(0.3, sembilan).rule, '10x');
  assert.equal(nilaiWestgard(0.3, sembilan.slice(0, 8)).verdict, 'in', 'sembilan titik belum cukup');
});

test('tanpa z-score, verdict unknown dan bukan ditolak', () => {
  assert.deepEqual(nilaiWestgard(null, []), { verdict: 'unknown', rule: null });
  assert.deepEqual(nilaiWestgard(NaN, []), { verdict: 'unknown', rule: null });
});

/**
 * Penilaian menyilang antar level kontrol dalam satu run.
 *
 * PMK 43/2013 mengandaikan dua bahan kontrol tiap hari (rendah dan tinggi) dan
 * menilai 2-2s serta R-4s di antara keduanya, bukan hanya berurutan waktu.
 */
test('2-2s tertangkap antar level kontrol pada run yang sama', () => {
  // kontrol rendah +2,3 SD; kontrol tinggi di run yang sama +2,4 SD
  const out = nilaiWestgard(2.3, [], [2.4]);
  assert.equal(out.verdict, 'out');
  assert.equal(out.rule, '2-2s');
});

test('R-4s tertangkap antar level kontrol pada run yang sama', () => {
  const out = nilaiWestgard(2.2, [], [-2.1]);
  assert.equal(out.rule, 'R-4s');
});

test('level lain yang masih dalam batas tidak ikut menolak run', () => {
  assert.equal(nilaiWestgard(2.3, [], [0.4]).verdict, 'warning');
  assert.equal(nilaiWestgard(1.1, [], [-0.8]).verdict, 'in');
});

test('tanpa pasangan run, penilaian tetap seperti semula', () => {
  assert.equal(nilaiWestgard(2.3, [2.5]).rule, '2-2s');
  assert.equal(nilaiWestgard(2.4, []).rule, '1-2s');
});

/**
 * Penilaian PME memakai SDI (simpangan dari nilai konsensus peserta).
 * Ambang yang lazim: <=2 baik, 2-3 ragu, >3 buruk.
 */
import { nilaiSdi } from '../src/routes/pme.js';

test('SDI dalam 2 SD dinilai baik', () => {
  assert.deepEqual(nilaiSdi(10.2, 10.0, 0.5), { z: 0.4, verdict: 'baik' });
});

test('SDI antara 2 dan 3 dinilai ragu', () => {
  assert.equal(nilaiSdi(11.3, 10.0, 0.5).verdict, 'ragu');
});

test('SDI lebih dari 3 dinilai buruk', () => {
  assert.equal(nilaiSdi(12.0, 10.0, 0.5).verdict, 'buruk');
});

test('tanpa SD konsensus, PME belum bisa dinilai', () => {
  assert.deepEqual(nilaiSdi(10, 10, 0), { z: null, verdict: 'belum' });
  assert.deepEqual(nilaiSdi(10, null, 0.5), { z: null, verdict: 'belum' });
});

// Peringatan kompatibilitas ABO/Rh untuk komponen sel darah merah.
//
// Hanya untuk PERINGATAN, bukan keputusan. Aturan plasma (FFP) terbalik dan
// trombosit berbeda, jadi peringatan hanya untuk sel darah merah (PRC/WB) yang
// aturannya paling tegas; selain itu diam agar tidak memberi peringatan salah.
export function aboRhPeringatan(komponen, golP, rhP, golK, rhK) {
  const k = String(komponen || '').toUpperCase();
  const selMerah = k.includes('PRC') || k.includes('WB') || k === 'WHOLE BLOOD';
  if (!selMerah || !golP || !golK) return '';
  const terima = { O: ['O'], A: ['A','O'], B: ['B','O'], AB: ['A','B','AB','O'] };
  const pesan = [];
  if (!(terima[golP] || []).includes(golK))
    pesan.push(`Golongan tidak kompatibel: pasien ${golP} tidak boleh menerima sel darah merah golongan ${golK}.`);
  if (rhP === '-' && rhK === '+')
    pesan.push('Rhesus: pasien Rh-negatif menerima kantong Rh-positif.');
  return pesan.join(' ');
}

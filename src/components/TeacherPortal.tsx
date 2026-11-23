import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { EXAM_CONFIG } from '@/src/config/examConfig';
import { decryptExamResult, verifyTeacherCode } from '@/src/utils/crypto';
import {
  downloadTeacherRecapCsv,
  type DecryptedExamPayload,
  type DecryptedTeacherRecord,
} from '@/src/utils/submission';

function parseCsvRows(csvText: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  const clean = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const objects: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((cell) => !cell.trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] ?? '';
    });
    objects.push(obj);
  }
  return objects;
}

export const TeacherPortal: React.FC = () => {
  const [accessCode, setAccessCode] = useState<string>('');
  const [verifiedPassphrase, setVerifiedPassphrase] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const [records, setRecords] = useState<DecryptedTeacherRecord[]>([]);
  const [pasteInput, setPasteInput] = useState<string>('');
  const [decryptMessage, setDecryptMessage] = useState<string>('');
  const [decryptError, setDecryptError] = useState<string>('');
  const [selectedDetail, setSelectedDetail] = useState<DecryptedTeacherRecord | null>(null);
  const [copiedToken, setCopiedToken] = useState<string>('');

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsVerifying(true);
    try {
      const ok = await verifyTeacherCode(accessCode);
      if (!ok) {
        setAuthError('Kode akses guru tidak cocok dengan hash SHA-256 sistem.');
        return;
      }
      setVerifiedPassphrase(accessCode.trim());
      setIsUnlocked(true);
      setAccessCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    setVerifiedPassphrase('');
    setRecords([]);
    setSelectedDetail(null);
    setDecryptMessage('');
    setDecryptError('');
  };

  const addDecryptedRecord = async (
    rawCipherOrJson: string,
    sourceName: string,
    externalSha256?: string
  ) => {
    const result = await decryptExamResult<DecryptedExamPayload>(
      rawCipherOrJson,
      verifiedPassphrase
    );
    const matchesExternal = externalSha256
      ? externalSha256.trim().toLowerCase() === result.integritySha256.toLowerCase()
      : true;

    const record: DecryptedTeacherRecord = {
      id: `${result.data.nis_no_peserta}-${result.data.timestamp}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      fileName: sourceName,
      payload: result.data,
      integritySha256: result.integritySha256,
      integrityValid: result.integrityValid && matchesExternal,
    };

    setRecords((prev) => [record, ...prev]);
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setDecryptError('');
    setDecryptMessage('');

    let successCount = 0;
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith('.csv')) {
          const rows = parseCsvRows(text);
          if (rows.length === 0) {
            errors.push(`${file.name}: tidak ada baris data CSV.`);
            continue;
          }
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cipher = row.encrypted_payload || row.rekap_jawaban;
            if (!cipher) {
              errors.push(`${file.name} baris ${i + 2}: kolom terenkripsi kosong.`);
              continue;
            }
            await addDecryptedRecord(cipher, `${file.name} #${i + 1}`, row.integrity_sha256);
            successCount++;
          }
        } else {
          const parsed = JSON.parse(text) as {
            encrypted_payload?: string;
            rekap_jawaban?: string;
            integrity_sha256?: string;
            ct?: string;
          };
          const cipher = parsed.encrypted_payload || parsed.rekap_jawaban || (parsed.ct ? text : '');
          if (!cipher) {
            errors.push(`${file.name}: format JSON tidak memuat encrypted_payload.`);
            continue;
          }
          await addDecryptedRecord(cipher, file.name, parsed.integrity_sha256);
          successCount++;
        }
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'gagal didekripsi'}`);
      }
    }

    if (successCount > 0) {
      setDecryptMessage(`Berhasil mendekripsi ${successCount} berkas hasil ujian.`);
    }
    if (errors.length > 0) {
      setDecryptError(errors.join(' | '));
    }

    e.target.value = '';
  };

  const handleDecryptPaste = async () => {
    if (!pasteInput.trim()) return;
    setDecryptError('');
    setDecryptMessage('');
    try {
      const trimmed = pasteInput.trim();
      let cipher = trimmed;
      let externalHash: string | undefined;

      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed) as {
          encrypted_payload?: string;
          rekap_jawaban?: string;
          integrity_sha256?: string;
        };
        if (parsed.encrypted_payload || parsed.rekap_jawaban) {
          cipher = parsed.encrypted_payload || parsed.rekap_jawaban || trimmed;
          externalHash = parsed.integrity_sha256;
        }
      }

      await addDecryptedRecord(cipher, 'Input Tempel Langsung', externalHash);
      setDecryptMessage('Ciphertext berhasil didekripsi dan diverifikasi integritasnya.');
      setPasteInput('');
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : 'Gagal mendekripsi teks masukan.');
    }
  };

  const handleCopyToken = async (tok: string) => {
    try {
      await navigator.clipboard.writeText(tok);
      setCopiedToken(tok);
      window.setTimeout(() => setCopiedToken(''), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const averageScore = useMemo(() => {
    if (records.length === 0) return 0;
    const sum = records.reduce((acc, r) => acc + r.payload.nilai_akhir, 0);
    return Math.round((sum / records.length) * 100) / 100;
  }, [records]);

  if (!isUnlocked) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
        <form
          onSubmit={handleUnlock}
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Portal Guru & Dekripsi Hasil</h1>
              <p className="text-xs text-slate-500">
                Terlindungi verifikasi SHA-256 & dekripsi AES-256-GCM
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="teacher-code"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Kode Akses Guru
              </label>
              <input
                id="teacher-code"
                type="password"
                autoComplete="off"
                placeholder="Masukkan kode akses guru"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setAuthError('');
                }}
                className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
              />
            </div>

            {authError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!accessCode.trim() || isVerifying}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-800 disabled:bg-slate-300 disabled:text-slate-500"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>{isVerifying ? 'Memverifikasi Hash...' : 'Buka Portal Guru'}</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Top Portal Header */}
      <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-sky-700">
            Portal Dekripsi AES-256-GCM · Verifikasi Integritas SHA-256
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Dasbor Evaluasi & Rekap Nilai Guru
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => downloadTeacherRecapCsv(records)}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              <span>Ekspor Rekap CSV Guru ({records.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLock}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Kunci Portal</span>
          </button>
        </div>
      </div>

      {/* Active Tokens & Upload / Paste Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-4">
          <h2 className="text-sm font-bold text-slate-900">Daftar Token Ujian Aktif (Fallback)</h2>
          <p className="text-xs text-slate-500">
            Bagikan salah satu token di bawah kepada peserta ujian saat validasi lokal digunakan.
          </p>
          <div className="space-y-2">
            {EXAM_CONFIG.activeTokens.map((tok) => (
              <div
                key={tok}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5"
              >
                <span className="font-mono text-sm font-semibold text-slate-900">{tok}</span>
                <button
                  type="button"
                  onClick={() => void handleCopyToken(tok)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800"
                >
                  {copiedToken === tok ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {records.length > 0 && (
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <div>
                <p className="text-xs text-slate-500">Total Berkas</p>
                <p className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                  {records.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Rata-Rata Nilai</p>
                <p className="font-mono text-xl font-bold text-sky-700 tabular-nums">
                  {averageScore}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-8">
          <h2 className="text-sm font-bold text-slate-900">
            Unggah Berkas Cadangan (.json / .csv) atau Tempel Ciphertext
          </h2>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center transition-colors hover:border-sky-500 hover:bg-sky-50/40">
            <Upload className="h-7 w-7 text-sky-700" aria-hidden="true" />
            <span className="mt-2 text-sm font-semibold text-slate-900">
              Pilih satu atau banyak file .JSON / .CSV cadangan siswa
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Mendukung pemilihan banyak berkas sekaligus untuk rekap satu kelas
            </span>
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv"
              multiple
              onChange={(e) => void handleFilesSelected(e)}
              className="sr-only"
            />
          </label>

          <div className="space-y-2">
            <label htmlFor="paste-cipher" className="block text-xs font-medium text-slate-700">
              Atau tempel ciphertext (rekap_jawaban / encrypted_payload dari Google Sheets):
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                id="paste-cipher"
                rows={2}
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                placeholder='{"v":"AES-256-GCM..."} atau string Base64 rekap_jawaban'
                className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20"
              />
              <button
                type="button"
                onClick={() => void handleDecryptPaste()}
                disabled={!pasteInput.trim()}
                className="min-h-[44px] shrink-0 rounded-xl bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:bg-slate-300 disabled:text-slate-500 whitespace-nowrap"
              >
                Dekripsi Teks
              </button>
            </div>
          </div>

          {decryptMessage && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{decryptMessage}</span>
            </div>
          )}

          {decryptError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <span>{decryptError}</span>
            </div>
          )}
        </section>
      </div>

      {/* Decrypted Results Table */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">
            Hasil Dekripsi Peserta ({records.length})
          </h2>
        </div>

        {records.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Belum ada berkas yang didekripsi. Unggah file cadangan `.json`/`.csv` atau tempel
            ciphertext di atas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Peserta</th>
                  <th className="px-4 py-3">Sekolah / Kelas</th>
                  <th className="px-4 py-3">Paket</th>
                  <th className="px-4 py-3">Benar</th>
                  <th className="px-4 py-3">Nilai</th>
                  <th className="px-4 py-3">Fokus</th>
                  <th className="px-4 py-3">Integritas SHA-256</th>
                  <th className="px-4 py-3 text-right">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((rec, idx) => {
                  const p = rec.payload;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{p.nama_lengkap}</div>
                        <div className="font-mono text-xs text-slate-500 tabular-nums">
                          No. {p.nis_no_peserta}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        <div className="font-medium">{p.kelas}</div>
                        <div className="text-slate-500">{p.sekolah}</div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-sky-800">
                        Paket {p.paket_soal}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 tabular-nums">
                        {p.skor_pg_benar}/50
                      </td>
                      <td className="px-4 py-3 font-mono text-base font-bold text-slate-900 tabular-nums">
                        {p.nilai_akhir}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                        {p.jumlah_pelanggaran_tab}x
                      </td>
                      <td className="px-4 py-3">
                        {rec.integrityValid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            <span>Terverifikasi</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                            <AlertCircle className="h-4 w-4" aria-hidden="true" />
                            <span>Tidak Cocok</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDetail(rec)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>50 Butir</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Detail 50-Item Modal */}
      {selectedDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Rincian 50 butir jawaban"
        >
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Rincian Butir 1–50: {selectedDetail.payload.nama_lengkap} (Paket{' '}
                  {selectedDetail.payload.paket_soal})
                </h3>
                <p className="mt-0.5 font-mono text-xs text-slate-500">
                  Benar: {selectedDetail.payload.skor_pg_benar}/50 · Nilai:{' '}
                  {selectedDetail.payload.nilai_akhir} · SHA-256:{' '}
                  {selectedDetail.integritySha256.slice(0, 16)}...
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                aria-label="Tutup rincian"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Urut</th>
                    <th className="px-3 py-2.5">ID Soal Asli</th>
                    <th className="px-3 py-2.5">Materi</th>
                    <th className="px-3 py-2.5">Jawab</th>
                    <th className="px-3 py-2.5">Kunci</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDetail.payload.rincian.map((item) => (
                    <tr key={item.questionId}>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                        {item.noUrut}
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-slate-900">
                        {item.questionId}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.lkpd} · {item.topic}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">
                        {item.chosen ?? '-'}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-sky-800">
                        {item.originalKey}
                      </td>
                      <td className="px-3 py-2">
                        {item.isCorrect ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Benar</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Salah</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

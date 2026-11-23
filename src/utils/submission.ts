import { EXAM_CONFIG } from '@/src/config/examConfig';
import type { OptionKey, PacketCode } from '@/src/data/questions/types';
import type { Student } from '@/src/data/students';

export interface DecryptedItemDetail {
  noUrut: number;
  questionId: string;
  lkpd: string;
  topic: string;
  chosen: OptionKey | null;
  originalKey: OptionKey;
  isCorrect: boolean;
}

export interface DecryptedExamPayload {
  sekolah: string;
  kelas: string;
  nama_lengkap: string;
  nis_no_peserta: string;
  mata_pelajaran: string;
  paket_soal: PacketCode;
  token_ujian: string;
  durasi_detik: number;
  durasi_terpakai_detik: number;
  jumlah_pelanggaran_tab: number;
  skor_pg_benar: number;
  nilai_akhir: number;
  jumlah_terjawab: number;
  timestamp: string;
  rincian: DecryptedItemDetail[];
}

export interface ServerSubmissionPayload {
  sekolah: string;
  kelas: string;
  nama_lengkap: string;
  pilihan_lkpd: string;
  paket_soal: string;
  durasi_detik: number;
  skor_pg_benar: number;
  nilai_akhir: number;
  timestamp: string;
  nama_peserta: string;
  nis_no_peserta: string;
  kelas_rombel: string;
  mata_pelajaran: string;
  token_ujian: string;
  durasi_terpakai_detik: number;
  jumlah_pelanggaran_tab: number;
  encryption_version: string;
  integrity_sha256: string;
  rekap_jawaban: string;
  encrypted_payload: string;
}

export interface StudentBackupFile {
  app_brand: string;
  mata_pelajaran: string;
  sekolah: string;
  kelas: string;
  no_absen: string;
  nama_peserta: string;
  paket_soal: PacketCode;
  jumlah_terjawab: number;
  total_soal: number;
  durasi_terpakai_detik: number;
  jumlah_pelanggaran_tab: number;
  timestamp: string;
  encryption_version: string;
  integrity_sha256: string;
  rekap_jawaban: string;
  encrypted_payload: string;
}

export type ServerSendResult = {
  ok: boolean;
  mode: 'cors' | 'no-cors' | 'error';
  message: string;
};

/**
 * Validates the exam token against Google Apps Script (?action=validateToken)
 * with automatic local fallback to EXAM_CONFIG.activeTokens.
 */
export async function validateExamToken(
  tokenInput: string
): Promise<{ valid: boolean; source: 'server' | 'local'; message: string }> {
  const normalized = tokenInput.trim().toUpperCase();
  if (!normalized) {
    return { valid: false, source: 'local', message: 'Token ujian wajib diisi.' };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);

  try {
    const url = `${EXAM_CONFIG.appsScriptEndpoint}?action=validateToken&token=${encodeURIComponent(
      normalized
    )}`;
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    window.clearTimeout(timeout);

    if (response.ok) {
      const text = await response.text();
      try {
        const json = JSON.parse(text) as { valid?: boolean; ok?: boolean; status?: string };
        if (typeof json.valid === 'boolean') {
          if (json.valid) {
            return { valid: true, source: 'server', message: 'Token terverifikasi oleh server.' };
          }
          // Check local fallback in case server token table isn't synced yet
          if ((EXAM_CONFIG.activeTokens as readonly string[]).includes(normalized)) {
            return {
              valid: true,
              source: 'local',
              message: 'Token aktif terverifikasi (fallback daftar token lokal).',
            };
          }
          return { valid: false, source: 'server', message: 'Token ujian tidak valid atau kedaluwarsa.' };
        }
        if (typeof json.ok === 'boolean' && json.ok) {
          return { valid: true, source: 'server', message: 'Token terverifikasi oleh server.' };
        }
      } catch {
        // Response is non-JSON (e.g., default doGet text), use local fallback
      }
    }
  } catch {
    window.clearTimeout(timeout);
  }

  const isLocalValid = (EXAM_CONFIG.activeTokens as readonly string[]).includes(normalized);
  if (isLocalValid) {
    return {
      valid: true,
      source: 'local',
      message: 'Token valid (verifikasi lokal aktif).',
    };
  }

  return {
    valid: false,
    source: 'local',
    message: 'Token ujian tidak dikenali. Periksa kembali token dari pengawas.',
  };
}

/**
 * Sends submission payload to Google Apps Script doPost(e) using text/plain;charset=utf-8
 * with automatic fallback to mode: 'no-cors'.
 */
export async function submitToAppsScript(
  payload: ServerSubmissionPayload
): Promise<ServerSendResult> {
  const bodyString = JSON.stringify(payload);

  try {
    const response = await fetch(EXAM_CONFIG.appsScriptEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: bodyString,
    });

    if (response.ok) {
      return {
        ok: true,
        mode: 'cors',
        message: 'Data ujian berhasil diterima oleh server Google Apps Script.',
      };
    }
  } catch {
    // CORS preflight/redirect rejection from GAS is common; fallback to no-cors
  }

  try {
    await fetch(EXAM_CONFIG.appsScriptEndpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: bodyString,
    });

    return {
      ok: true,
      mode: 'no-cors',
      message:
        'Pengiriman terkirim ke server melalui mode kompatibilitas browser. Simpan juga file cadangan JSON/CSV sebagai arsip.',
    };
  } catch {
    return {
      ok: false,
      mode: 'error',
      message:
        'Gagal terhubung ke server karena koneksi terputus. Unduh file cadangan JSON/CSV dan klik Kirim Ulang Data.',
    };
  }
}

function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Downloads encrypted student JSON backup (contains ZERO plaintext scores or keys).
 */
export function downloadStudentJsonBackup(backup: StudentBackupFile): void {
  const filename = `CBT_TJKT_${sanitizeFilenamePart(backup.kelas)}_${sanitizeFilenamePart(
    backup.no_absen
  )}_${sanitizeFilenamePart(backup.nama_peserta)}.json`;
  triggerFileDownload(filename, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
}

/**
 * Downloads encrypted student CSV backup (contains ZERO plaintext scores or keys).
 */
export function downloadStudentCsvBackup(backup: StudentBackupFile): void {
  const headers = [
    'sekolah',
    'kelas',
    'no_absen',
    'nama_peserta',
    'mata_pelajaran',
    'paket_soal',
    'jumlah_terjawab',
    'total_soal',
    'durasi_terpakai_detik',
    'jumlah_pelanggaran_tab',
    'timestamp',
    'encryption_version',
    'integrity_sha256',
    'rekap_jawaban',
    'encrypted_payload',
  ];

  const row = [
    backup.sekolah,
    backup.kelas,
    backup.no_absen,
    backup.nama_peserta,
    backup.mata_pelajaran,
    backup.paket_soal,
    backup.jumlah_terjawab,
    backup.total_soal,
    backup.durasi_terpakai_detik,
    backup.jumlah_pelanggaran_tab,
    backup.timestamp,
    backup.encryption_version,
    backup.integrity_sha256,
    backup.rekap_jawaban,
    backup.encrypted_payload,
  ].map(escapeCsvCell);

  const csvContent = `\uFEFF${headers.join(',')}\r\n${row.join(',')}\r\n`;
  const filename = `CBT_TJKT_${sanitizeFilenamePart(backup.kelas)}_${sanitizeFilenamePart(
    backup.no_absen
  )}_${sanitizeFilenamePart(backup.nama_peserta)}.csv`;
  triggerFileDownload(filename, csvContent, 'text/csv;charset=utf-8');
}

export interface DecryptedTeacherRecord {
  id: string;
  fileName: string;
  payload: DecryptedExamPayload;
  integritySha256: string;
  integrityValid: boolean;
}

/**
 * Exports decrypted teacher recap CSV with scores and packet analytics.
 */
export function downloadTeacherRecapCsv(records: DecryptedTeacherRecord[]): void {
  const headers = [
    'No',
    'Sekolah',
    'Kelas',
    'No_Absen',
    'Nama_Peserta',
    'Paket_Soal',
    'Token_Ujian',
    'Terjawab',
    'Benar_PG',
    'Nilai_Akhir',
    'Durasi_Terpakai_Detik',
    'Pelanggaran_Fokus',
    'Status_Integritas_SHA256',
    'Integrity_SHA256',
    'Waktu_Submit',
  ];

  const rows = records.map((rec, index) => {
    const p = rec.payload;
    return [
      index + 1,
      p.sekolah,
      p.kelas,
      p.nis_no_peserta,
      p.nama_lengkap,
      `Paket ${p.paket_soal}`,
      p.token_ujian,
      `${p.jumlah_terjawab}/50`,
      p.skor_pg_benar,
      p.nilai_akhir,
      p.durasi_terpakai_detik,
      p.jumlah_pelanggaran_tab,
      rec.integrityValid ? 'TERVERIFIKASI' : 'TIDAK COCOK',
      rec.integritySha256,
      p.timestamp,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  const csvContent = `\uFEFF${headers.join(',')}\r\n${rows.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);
  triggerFileDownload(`Rekap_Nilai_CBT_TJKT_${stamp}.csv`, csvContent, 'text/csv;charset=utf-8');
}

export function buildStudentBackupFromSession(
  student: Student,
  packetCode: PacketCode,
  answeredCount: number,
  durationUsedSeconds: number,
  violations: number,
  timestamp: string,
  integritySha256: string,
  rekapJawaban: string,
  encryptedPayload: string
): StudentBackupFile {
  return {
    app_brand: EXAM_CONFIG.brandName,
    mata_pelajaran: EXAM_CONFIG.subjectName,
    sekolah: student.sekolah,
    kelas: student.kelas,
    no_absen: student.noAbsen,
    nama_peserta: student.nama,
    paket_soal: packetCode,
    jumlah_terjawab: answeredCount,
    total_soal: EXAM_CONFIG.totalQuestions,
    durasi_terpakai_detik: durationUsedSeconds,
    jumlah_pelanggaran_tab: violations,
    timestamp,
    encryption_version: EXAM_CONFIG.encryptionVersion,
    integrity_sha256: integritySha256,
    rekap_jawaban: rekapJawaban,
    encrypted_payload: encryptedPayload,
  };
}

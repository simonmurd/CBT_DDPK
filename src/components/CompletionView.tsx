import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  downloadStudentCsvBackup,
  downloadStudentJsonBackup,
  type ServerSendResult,
  type StudentBackupFile,
} from '@/src/utils/submission';

interface CompletionViewProps {
  backup: StudentBackupFile;
  serverStatus: ServerSendResult;
  autoSubmitted: boolean;
  onRetrySend: () => Promise<void>;
  onReturnHome: () => void;
}

function formatDurationHuman(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins} menit ${secs} detik`;
}

export const CompletionView: React.FC<CompletionViewProps> = ({
  backup,
  serverStatus,
  autoSubmitted,
  onRetrySend,
  onReturnHome,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetrySend();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(backup.integrity_sha256);
      setCopiedHash(true);
      window.setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
        <div className="flex items-start gap-4 border-b border-slate-100 pb-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-700">
              {autoSubmitted ? 'Waktu Ujian Habis · Dikirim Otomatis' : 'Sesi Ujian Selesai'}
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
              Jawaban Ujian Telah Dienkripsi & Direkam
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Sesuai kebijakan evaluasi, hasil nilai dan kunci jawaban hanya dapat dibuka oleh guru
              melalui Portal Guru menggunakan kode dekripsi resmi.
            </p>
          </div>
        </div>

        {/* Server Delivery Status */}
        <div
          className={`mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            serverStatus.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {serverStatus.ok ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {serverStatus.ok ? 'Status Pengiriman Server: Terkirim' : 'Status Pengiriman Server: Gagal'}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed opacity-90">{serverStatus.message}</p>
          </div>
        </div>

        {/* Score-free session summary */}
        <dl className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Nama Peserta</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">
              {backup.nama_peserta} (No. {backup.no_absen})
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Sekolah & Kelas</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-800">
              {backup.kelas} · {backup.sekolah}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Kode Paket Soal</dt>
            <dd className="mt-0.5 font-mono text-sm font-bold text-sky-800">
              Paket {backup.paket_soal}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Jumlah Soal Terjawab</dt>
            <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
              {backup.jumlah_terjawab} / {backup.total_soal} Soal
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Durasi Pengerjaan</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-800 tabular-nums">
              {formatDurationHuman(backup.durasi_terpakai_detik)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Pelanggaran Fokus Layar</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {backup.jumlah_pelanggaran_tab} kali
            </dd>
          </div>
        </dl>

        {/* Integrity Hash */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">
              Hash Integritas SHA-256 ({backup.encryption_version})
            </span>
            <button
              type="button"
              onClick={() => void handleCopyHash()}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800"
            >
              {copiedHash ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Disalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Salin Hash</span>
                </>
              )}
            </button>
          </div>
          <p className="mt-1.5 break-all font-mono text-xs text-slate-600">
            {backup.integrity_sha256}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={isRetrying}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isRetrying ? 'Mengirim...' : 'Kirim Ulang Data'}</span>
          </button>

          <button
            type="button"
            onClick={() => downloadStudentJsonBackup(backup)}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span>Unduh JSON Cadangan</span>
          </button>

          <button
            type="button"
            onClick={() => downloadStudentCsvBackup(backup)}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-sky-700 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900 transition-colors hover:bg-sky-100 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            <span>Unduh CSV Cadangan</span>
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Simpan file cadangan sebagai bukti pengerjaan apabila diminta pengawas.</span>
          </p>
          <button
            type="button"
            onClick={onReturnHome}
            className="text-sm font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline whitespace-nowrap"
          >
            Selesai & Keluar
          </button>
        </div>
      </div>
    </div>
  );
};

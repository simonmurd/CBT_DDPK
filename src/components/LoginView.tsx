import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  KeyRound,
  Layers,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { EXAM_CONFIG } from '@/src/config/examConfig';
import { STUDENTS, type Student } from '@/src/data/students';
import type { PersistedExamSession } from '@/src/utils/storage';
import { validateExamToken } from '@/src/utils/submission';

interface LoginViewProps {
  savedSession: PersistedExamSession | null;
  onResumeSession: (session: PersistedExamSession) => void;
  onDiscardSavedSession: () => void;
  onStartExam: (student: Student, token: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  savedSession,
  onResumeSession,
  onDiscardSavedSession,
  onStartExam,
}) => {
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [confirmedIdentity, setConfirmedIdentity] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [tokenFeedback, setTokenFeedback] = useState<string>('');

  const schoolOptions = useMemo(() => {
    const unique = Array.from(new Set(STUDENTS.map((s) => s.sekolah)));
    return unique.sort((a, b) => a.localeCompare(b, 'id'));
  }, []);

  const classOptions = useMemo(() => {
    if (!selectedSchool) return [];
    const unique = Array.from(
      new Set(STUDENTS.filter((s) => s.sekolah === selectedSchool).map((s) => s.kelas))
    );
    return unique.sort((a, b) => a.localeCompare(b, 'id'));
  }, [selectedSchool]);

  const studentOptions = useMemo(() => {
    if (!selectedSchool || !selectedClass) return [];
    return STUDENTS.filter(
      (s) => s.sekolah === selectedSchool && s.kelas === selectedClass
    ).sort((a, b) => {
      const nameDiff = a.nama.localeCompare(b.nama, 'id');
      if (nameDiff !== 0) return nameDiff;
      return a.noAbsen.localeCompare(b.noAbsen, 'id');
    });
  }, [selectedSchool, selectedClass]);

  const selectedStudent = useMemo(
    () => STUDENTS.find((s) => s.id === selectedStudentId) ?? null,
    [selectedStudentId]
  );

  const handleSchoolChange = (value: string) => {
    setSelectedSchool(value);
    setSelectedClass('');
    setSelectedStudentId('');
    setConfirmedIdentity(false);
    setErrorMessage('');
  };

  const handleClassChange = (value: string) => {
    setSelectedClass(value);
    setSelectedStudentId('');
    setConfirmedIdentity(false);
    setErrorMessage('');
  };

  const handleStudentChange = (value: string) => {
    setSelectedStudentId(value);
    setConfirmedIdentity(false);
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setTokenFeedback('');

    if (!selectedStudent) {
      setErrorMessage('Silakan pilih sekolah, kelas, dan nama peserta terlebih dahulu.');
      return;
    }

    if (!tokenInput.trim()) {
      setErrorMessage('Token ujian wajib diisi sesuai arahan pengawas.');
      return;
    }

    if (!confirmedIdentity) {
      setErrorMessage('Centang pernyataan konfirmasi identitas peserta sebelum memulai.');
      return;
    }

    setIsValidating(true);
    try {
      const result = await validateExamToken(tokenInput);
      if (!result.valid) {
        setErrorMessage(result.message);
        return;
      }
      setTokenFeedback(result.message);
      onStartExam(selectedStudent, tokenInput.trim().toUpperCase());
    } finally {
      setIsValidating(false);
    }
  };

  const savedRemainingMinutes = savedSession
    ? Math.max(0, Math.ceil((savedSession.endTimestamp - Date.now()) / 60000))
    : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {savedSession && (
        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/80 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-sky-950">
                Sesi Ujian Tersimpan Ditemukan
              </p>
              <p className="text-sm text-sky-900">
                {savedSession.student.nama} (No. {savedSession.student.noAbsen}) ·{' '}
                {savedSession.student.kelas} · Paket {savedSession.packetCode} ·{' '}
                {Object.keys(savedSession.answers).length}/50 terjawab · Sisa waktu ~
                {savedRemainingMinutes} menit
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onDiscardSavedSession}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                Ganti Peserta
              </button>
              <button
                type="button"
                onClick={() => onResumeSession(savedSession)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Lanjutkan Ujian
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left column: Exam briefing & Kisi-Kisi instructions */}
        <section className="space-y-6 lg:col-span-5">
          <div className="space-y-3">
            <p className="text-xs font-medium text-sky-700">
              Asesmen DDPK TJKT · Kelas {EXAM_CONFIG.gradeLevel}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
              {EXAM_CONFIG.mainTopic}
            </h1>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
              {EXAM_CONFIG.subjectName}. Verifikasi identitas peserta dan masukkan token ujian aktif
              untuk memulai asesmen.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <BookOpen className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                <span>Jumlah Soal</span>
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">50 PG</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                <span>Alokasi Waktu</span>
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                {EXAM_CONFIG.durationMinutes} Menit
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Layers className="h-3.5 w-3.5 text-sky-700" aria-hidden="true" />
                <span>Variasi Paket</span>
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">5 Paket (A–E)</p>
            </div>
          </div>

          <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">
              10 Indikator Kisi-Kisi K3LH & Budaya Kerja Industri
            </h2>
            <ul className="space-y-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">01.</span>
                <span>Konsep Dasar & Regulasi K3LH (UU No. 1 Tahun 1970 Pasal 2 ayat 1)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">02.</span>
                <span>Aspek Kesehatan Kerja (Jasmani, Rohani, dan Sosial di Lingkungan IT)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">03.</span>
                <span>Perbedaan Keselamatan vs. Kesehatan Kerja & Analisis Kerugian</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">04.</span>
                <span>Alat Pelindung Diri (APD) Spesifik TJKT (Permenaker No. 9/2016)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">05.</span>
                <span>Keselamatan Kerja di Ketinggian (9 Langkah WAH Tower Telekomunikasi)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">06.</span>
                <span>Keselamatan Kelistrikan Ruang Server/Lab (Batas PDU ≤ 2200 W & Grounding)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">07.</span>
                <span>Keselamatan Serat Optik (Limbah Kaca, Mata, & Splicing Loss &lt; 0,05 dB)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">08.</span>
                <span>Manajemen Kabel (Jarak Aman Kabel Listrik AC & Data UTP ≥ 20 cm)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">09.</span>
                <span>Pengelolaan Limbah Elektronik (E-Waste) & APAR Kelas C</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 font-mono text-xs font-semibold text-sky-700">10.</span>
                <span>Ergonomi Kerja Teknisi IT & Pencegahan Penyakit Akibat Kerja</span>
              </li>
            </ul>

            <div className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              Progres jawaban tersimpan otomatis di perangkat. Hindari berpindah tab atau
              membuka aplikasi lain selama ujian berlangsung.
            </div>
          </div>
        </section>

        {/* Right column: Cascading login form */}
        <section className="lg:col-span-7">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
          >
            <div className="mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">
                Identifikasi & Validasi Peserta
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Pilih asal sekolah, kelas, dan nama lengkap Anda secara berurutan.
              </p>
            </div>

            <div className="space-y-4">
              {/* Dropdown 1: Sekolah */}
              <div>
                <label
                  htmlFor="select-sekolah"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  1. Asal Sekolah / Institusi
                </label>
                <select
                  id="select-sekolah"
                  value={selectedSchool}
                  onChange={(e) => handleSchoolChange(e.target.value)}
                  className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 transition-colors focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
                >
                  <option value="">-- Pilih Asal Sekolah --</option>
                  {schoolOptions.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dropdown 2: Kelas */}
              <div>
                <label
                  htmlFor="select-kelas"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  2. Kelas / Jurusan
                </label>
                <select
                  id="select-kelas"
                  value={selectedClass}
                  onChange={(e) => handleClassChange(e.target.value)}
                  disabled={!selectedSchool}
                  className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 transition-colors focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:text-sm"
                >
                  <option value="">
                    {selectedSchool
                      ? '-- Pilih Kelas / Jurusan --'
                      : '-- Pilih Sekolah Terlebih Dahulu --'}
                  </option>
                  {classOptions.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dropdown 3: Nama Peserta */}
              <div>
                <label
                  htmlFor="select-peserta"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  3. Nama Peserta (Urut Abjad A–Z + No. Absen)
                </label>
                <select
                  id="select-peserta"
                  value={selectedStudentId}
                  onChange={(e) => handleStudentChange(e.target.value)}
                  disabled={!selectedClass}
                  className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 transition-colors focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:text-sm"
                >
                  <option value="">
                    {selectedClass
                      ? '-- Pilih Nama Peserta --'
                      : '-- Pilih Kelas Terlebih Dahulu --'}
                  </option>
                  {studentOptions.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.nama} (No. Absen {student.noAbsen})
                    </option>
                  ))}
                </select>
              </div>

              {/* Read-only Biodata Card */}
              {selectedStudent && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <UserCheck className="h-4 w-4 text-sky-700" aria-hidden="true" />
                    <span>Biodata Peserta Terpilih (Read-Only)</span>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Nama Lengkap</dt>
                      <dd className="font-semibold text-slate-900">{selectedStudent.nama}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">No. Peserta / Absen</dt>
                      <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                        {selectedStudent.noAbsen} ({selectedStudent.id})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Asal Sekolah</dt>
                      <dd className="font-medium text-slate-800">{selectedStudent.sekolah}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Kelas</dt>
                      <dd className="font-medium text-slate-800">{selectedStudent.kelas}</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Token Ujian */}
              <div>
                <label
                  htmlFor="input-token"
                  className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"
                >
                  <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span>Token Ujian</span>
                </label>
                <input
                  id="input-token"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="Masukkan token dari pengawas (contoh: TJKT-2026A)"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value.toUpperCase());
                    setErrorMessage('');
                  }}
                  className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base uppercase tracking-wider text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Token diverifikasi ke server ujian dengan fallback otomatis daftar token aktif.
                </p>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition-colors hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={confirmedIdentity}
                  onChange={(e) => {
                    setConfirmedIdentity(e.target.checked);
                    setErrorMessage('');
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-sky-700 focus:ring-sky-600"
                />
                <span className="text-sm leading-snug text-slate-700">
                  Saya memastikan biodata peserta di atas adalah benar data diri saya sendiri dan
                  siap mengerjakan ujian dengan jujur sesuai tata tertib.
                </span>
              </label>

              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {tokenFeedback && !errorMessage && (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>{tokenFeedback}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!selectedStudent || !confirmedIdentity || !tokenInput.trim() || isValidating}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:text-sm"
              >
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                <span>{isValidating ? 'Memverifikasi Token...' : 'Mulai Ujian'}</span>
                {!isValidating && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

import { useCallback, useState } from 'react';
import { CompletionView } from '@/src/components/CompletionView';
import { ExamWorkspace } from '@/src/components/ExamWorkspace';
import { LoginView } from '@/src/components/LoginView';
import { TeacherPortal } from '@/src/components/TeacherPortal';
import { EXAM_CONFIG } from '@/src/config/examConfig';
import { QUESTION_PACKETS } from '@/src/data/questions';
import type { OptionKey, PacketCode, ShuffledQuestion } from '@/src/data/questions/types';
import type { Student } from '@/src/data/students';
import { encryptExamResult } from '@/src/utils/crypto';
import { assignPacketForStudent, buildShuffledExamForStudent } from '@/src/utils/prng';
import {
  clearExamSession,
  loadExamSession,
  type PersistedExamSession,
} from '@/src/utils/storage';
import {
  buildStudentBackupFromSession,
  submitToAppsScript,
  type DecryptedExamPayload,
  type DecryptedItemDetail,
  type ServerSendResult,
  type ServerSubmissionPayload,
  type StudentBackupFile,
} from '@/src/utils/submission';

type AppView = 'login' | 'exam' | 'completed' | 'teacher';

interface ActiveExamState {
  student: Student;
  packetCode: PacketCode;
  token: string;
  questions: ShuffledQuestion[];
  initialAnswers: Record<string, OptionKey>;
  initialDoubtful: Record<string, boolean>;
  initialViolations: number;
  initialIndex: number;
  startTimestamp: number;
  endTimestamp: number;
}

interface CompletedExamState {
  backup: StudentBackupFile;
  serverPayload: ServerSubmissionPayload;
  serverStatus: ServerSendResult;
  autoSubmitted: boolean;
}

export default function App() {
  const [view, setView] = useState<AppView>('login');
  const [savedSession, setSavedSession] = useState<PersistedExamSession | null>(() =>
    loadExamSession()
  );
  const [activeExam, setActiveExam] = useState<ActiveExamState | null>(null);
  const [completedState, setCompletedState] = useState<CompletedExamState | null>(null);

  const handleStartExam = useCallback((student: Student, token: string) => {
    const packetCode = assignPacketForStudent(student);
    const { questions } = buildShuffledExamForStudent(student, QUESTION_PACKETS[packetCode]);
    const now = Date.now();
    const endTimestamp = now + EXAM_CONFIG.durationMinutes * 60 * 1000;

    setActiveExam({
      student,
      packetCode,
      token,
      questions,
      initialAnswers: {},
      initialDoubtful: {},
      initialViolations: 0,
      initialIndex: 0,
      startTimestamp: now,
      endTimestamp,
    });
    setCompletedState(null);
    setView('exam');
  }, []);

  const handleResumeSession = useCallback((session: PersistedExamSession) => {
    const packetCode = session.packetCode || assignPacketForStudent(session.student);
    const { questions } = buildShuffledExamForStudent(
      session.student,
      QUESTION_PACKETS[packetCode]
    );

    setActiveExam({
      student: session.student,
      packetCode,
      token: session.token,
      questions,
      initialAnswers: session.answers ?? {},
      initialDoubtful: session.doubtful ?? {},
      initialViolations: session.violations ?? 0,
      initialIndex: session.currentIndex ?? 0,
      startTimestamp: session.startTimestamp,
      endTimestamp: session.endTimestamp,
    });
    setCompletedState(null);
    setView('exam');
  }, []);

  const handleDiscardSavedSession = useCallback(() => {
    clearExamSession();
    setSavedSession(null);
  }, []);

  const handleFinishExam = useCallback(
    async ({
      answers,
      violations,
      durationUsedSeconds,
      autoSubmitted,
    }: {
      answers: Record<string, OptionKey>;
      doubtful: Record<string, boolean>;
      violations: number;
      durationUsedSeconds: number;
      autoSubmitted: boolean;
    }) => {
      if (!activeExam) return;

      const { student, packetCode, token, questions } = activeExam;
      const timestamp = new Date().toISOString();
      const durasiDetik = EXAM_CONFIG.durationMinutes * 60;

      // Transient grading strictly in memory during submission
      let correctCount = 0;
      const rincian: DecryptedItemDetail[] = questions.map((q) => {
        const chosen = answers[q.questionId] ?? null;
        const isCorrect = chosen === q.originalKey;
        if (isCorrect) correctCount++;
        return {
          noUrut: q.displayNumber,
          questionId: q.questionId,
          lkpd: q.lkpd,
          topic: q.topic,
          chosen,
          originalKey: q.originalKey,
          isCorrect,
        };
      });

      const answeredCount = Object.keys(answers).length;
      const finalScore = Math.round(((correctCount / questions.length) * 100) * 100) / 100;

      const plainForEncryption: DecryptedExamPayload = {
        sekolah: student.sekolah,
        kelas: student.kelas,
        nama_lengkap: student.nama,
        nis_no_peserta: student.noAbsen,
        mata_pelajaran: EXAM_CONFIG.subjectName,
        paket_soal: packetCode,
        token_ujian: token,
        durasi_detik: durasiDetik,
        durasi_terpakai_detik: durationUsedSeconds,
        jumlah_pelanggaran_tab: violations,
        skor_pg_benar: correctCount,
        nilai_akhir: finalScore,
        jumlah_terjawab: answeredCount,
        timestamp,
        rincian,
      };

      const { envelopeString, rekapCiphertext, integritySha256 } =
        await encryptExamResult(plainForEncryption);

      const serverPayload: ServerSubmissionPayload = {
        sekolah: student.sekolah,
        kelas: student.kelas,
        nama_lengkap: student.nama,
        pilihan_lkpd: 'K3LH & Budaya Kerja Industri (Fase E / 2026-2027)',
        paket_soal: `Paket ${packetCode}`,
        durasi_detik: durasiDetik,
        skor_pg_benar: correctCount,
        nilai_akhir: finalScore,
        timestamp,
        nama_peserta: student.nama,
        nis_no_peserta: student.noAbsen,
        kelas_rombel: student.kelas,
        mata_pelajaran: EXAM_CONFIG.subjectName,
        token_ujian: token,
        durasi_terpakai_detik: durationUsedSeconds,
        jumlah_pelanggaran_tab: violations,
        encryption_version: EXAM_CONFIG.encryptionVersion,
        integrity_sha256: integritySha256,
        rekap_jawaban: rekapCiphertext,
        encrypted_payload: envelopeString,
      };

      const backup = buildStudentBackupFromSession(
        student,
        packetCode,
        answeredCount,
        durationUsedSeconds,
        violations,
        timestamp,
        integritySha256,
        rekapCiphertext,
        envelopeString
      );

      clearExamSession();
      setSavedSession(null);

      const serverStatus = await submitToAppsScript(serverPayload);

      setCompletedState({
        backup,
        serverPayload,
        serverStatus,
        autoSubmitted,
      });
      setActiveExam(null);
      setView('completed');
    },
    [activeExam]
  );

  const handleRetrySend = useCallback(async () => {
    if (!completedState) return;
    const nextStatus = await submitToAppsScript(completedState.serverPayload);
    setCompletedState((prev) => (prev ? { ...prev, serverStatus: nextStatus } : null));
  }, [completedState]);

  const handleReturnHome = useCallback(() => {
    setCompletedState(null);
    setSavedSession(loadExamSession());
    setView('login');
  }, []);

  if (view === 'exam' && activeExam) {
    return (
      <ExamWorkspace
        student={activeExam.student}
        packetCode={activeExam.packetCode}
        token={activeExam.token}
        questions={activeExam.questions}
        initialAnswers={activeExam.initialAnswers}
        initialDoubtful={activeExam.initialDoubtful}
        initialViolations={activeExam.initialViolations}
        initialIndex={activeExam.initialIndex}
        startTimestamp={activeExam.startTimestamp}
        endTimestamp={activeExam.endTimestamp}
        onFinishExam={handleFinishExam}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Three-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('login')}
            className="text-left text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 sm:text-lg"
          >
            {EXAM_CONFIG.brandName}
          </button>

          <nav className="flex items-center gap-6 text-sm font-medium" aria-label="Navigasi utama">
            <button
              type="button"
              onClick={() => setView(completedState ? 'completed' : 'login')}
              className={`whitespace-nowrap shrink-0 transition-colors underline-offset-8 ${
                view === 'login' || view === 'completed'
                  ? 'font-semibold text-sky-800 underline'
                  : 'text-slate-600 hover:text-slate-900 hover:underline'
              }`}
            >
              Ruang Ujian
            </button>
            <button
              type="button"
              onClick={() => setView('teacher')}
              className={`whitespace-nowrap shrink-0 transition-colors underline-offset-8 ${
                view === 'teacher'
                  ? 'font-semibold text-sky-800 underline'
                  : 'text-slate-600 hover:text-slate-900 hover:underline'
              }`}
            >
              Portal Guru
            </button>
          </nav>

          <div className="hidden items-center shrink-0 sm:flex">
            <button
              type="button"
              onClick={() => setView(view === 'teacher' ? 'login' : 'teacher')}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {view === 'teacher' ? 'Ke Login Siswa' : 'Dekripsi Hasil'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {view === 'login' && (
          <LoginView
            savedSession={savedSession}
            onResumeSession={handleResumeSession}
            onDiscardSavedSession={handleDiscardSavedSession}
            onStartExam={handleStartExam}
          />
        )}

        {view === 'completed' && completedState && (
          <CompletionView
            backup={completedState.backup}
            serverStatus={completedState.serverStatus}
            autoSubmitted={completedState.autoSubmitted}
            onRetrySend={handleRetrySend}
            onReturnHome={handleReturnHome}
          />
        )}

        {view === 'teacher' && <TeacherPortal />}
      </main>

      <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <span>
            {EXAM_CONFIG.brandName} · Computer-Based Test {EXAM_CONFIG.subjectShort} ({EXAM_CONFIG.gradeLevel})
          </span>
        </div>
      </footer>
    </div>
  );
}

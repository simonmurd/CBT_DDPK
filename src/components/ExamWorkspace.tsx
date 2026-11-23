import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Grid2x2,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { EXAM_CONFIG } from '@/src/config/examConfig';
import type { OptionKey, PacketCode, ShuffledQuestion } from '@/src/data/questions/types';
import type { Student } from '@/src/data/students';
import { saveExamSession } from '@/src/utils/storage';

interface ExamWorkspaceProps {
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
  onFinishExam: (result: {
    answers: Record<string, OptionKey>;
    doubtful: Record<string, boolean>;
    violations: number;
    durationUsedSeconds: number;
    autoSubmitted: boolean;
  }) => Promise<void> | void;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ExamWorkspace: React.FC<ExamWorkspaceProps> = ({
  student,
  packetCode,
  token,
  questions,
  initialAnswers,
  initialDoubtful,
  initialViolations,
  initialIndex,
  startTimestamp,
  endTimestamp,
  onFinishExam,
}) => {
  const [answers, setAnswers] = useState<Record<string, OptionKey>>(initialAnswers);
  const [doubtful, setDoubtful] = useState<Record<string, boolean>>(initialDoubtful);
  const [violations, setViolations] = useState<number>(initialViolations);
  const [currentIndex, setCurrentIndex] = useState<number>(
    Math.min(Math.max(0, initialIndex), questions.length - 1)
  );
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.floor((endTimestamp - Date.now()) / 1000))
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [showViolationModal, setShowViolationModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const hasAutoSubmittedRef = useRef<boolean>(false);
  const lastViolationAtRef = useRef<number>(0);
  const pendingViolationWarningRef = useRef<boolean>(false);
  const blurTimeoutRef = useRef<number | null>(null);

  const isEmbeddedIframe = useMemo(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  const currentQuestion = questions[currentIndex];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const doubtfulCount = useMemo(
    () => Object.values(doubtful).filter(Boolean).length,
    [doubtful]
  );
  const unansweredCount = questions.length - answeredCount;

  // Persist exam progress automatically on any relevant state update (no keys/scores saved)
  useEffect(() => {
    saveExamSession({
      student,
      packetCode,
      token,
      answers,
      doubtful,
      violations,
      currentIndex,
      startTimestamp,
      endTimestamp,
      submitted: false,
    });
  }, [
    student,
    packetCode,
    token,
    answers,
    doubtful,
    violations,
    currentIndex,
    startTimestamp,
    endTimestamp,
  ]);

  const executeFinalSubmit = useCallback(
    async (autoSubmitted: boolean) => {
      if (hasAutoSubmittedRef.current) return;
      hasAutoSubmittedRef.current = true;
      setIsSubmitting(true);
      const elapsedSeconds = Math.min(
        EXAM_CONFIG.durationMinutes * 60,
        Math.max(1, Math.floor((Date.now() - startTimestamp) / 1000))
      );
      await onFinishExam({
        answers,
        doubtful,
        violations,
        durationUsedSeconds: elapsedSeconds,
        autoSubmitted,
      });
    },
    [answers, doubtful, violations, startTimestamp, onFinishExam]
  );

  // Countdown timer synchronized to endTimestamp
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTimestamp - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !hasAutoSubmittedRef.current) {
        void executeFinalSubmit(true);
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [endTimestamp, executeFinalSubmit]);

  // Anti-cheat focus monitoring (1.5s debounce + Blogger iframe-safe blur guard)
  useEffect(() => {
    const registerViolation = () => {
      if (hasAutoSubmittedRef.current) return;
      const now = Date.now();
      if (now - lastViolationAtRef.current < 1500) return;
      lastViolationAtRef.current = now;
      pendingViolationWarningRef.current = true;
      setViolations((prev) => prev + 1);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        registerViolation();
      } else if (pendingViolationWarningRef.current) {
        pendingViolationWarningRef.current = false;
        setShowViolationModal(true);
      }
    };

    const handleWindowBlur = () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
      // Inside iframe (e.g. Blogger embed), tapping outside the iframe fires blur
      // even when the browser tab remains active (!document.hidden).
      // Only count iframe blur if document.hidden actually becomes true.
      blurTimeoutRef.current = window.setTimeout(() => {
        if (isEmbeddedIframe) {
          if (document.hidden) {
            registerViolation();
          }
        } else {
          registerViolation();
        }
      }, 220);
    };

    const handleWindowFocus = () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
      if (pendingViolationWarningRef.current && !document.hidden) {
        pendingViolationWarningRef.current = false;
        setShowViolationModal(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isEmbeddedIframe]);

  const handleSelectOption = (originalKey: OptionKey) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.questionId]: originalKey,
    }));
  };

  const handleToggleDoubtful = () => {
    setDoubtful((prev) => ({
      ...prev,
      [currentQuestion.questionId]: !prev[currentQuestion.questionId],
    }));
  };

  const handleJumpTo = (index: number) => {
    setCurrentIndex(index);
    setIsDrawerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isCurrentDoubtful = Boolean(doubtful[currentQuestion.questionId]);
  const selectedOriginalKey = answers[currentQuestion.questionId];
  const isTimeCritical = secondsLeft <= 300;

  const questionGroups = useMemo(() => {
    const groups: ShuffledQuestion[][] = [];
    for (let i = 0; i < questions.length; i += 10) {
      groups.push(questions.slice(i, i + 10));
    }
    return groups;
  }, [questions]);

  const renderNumberGrid = (compact?: boolean) => (
    <div className="space-y-4">
      {questionGroups.map((group, groupIdx) => {
        const startNum = groupIdx * 10 + 1;
        const endNum = startNum + group.length - 1;
        return (
          <div key={startNum}>
            <p className="mb-2 font-mono text-xs font-medium text-slate-500">
              Nomor {startNum}–{endNum}
            </p>
            <div className={`grid grid-cols-5 gap-2 ${compact ? 'sm:grid-cols-10' : ''}`}>
              {group.map((q) => {
                const idx = q.displayNumber - 1;
                const isActive = idx === currentIndex;
                const isAnswered = Boolean(answers[q.questionId]);
                const isDoubt = Boolean(doubtful[q.questionId]);

                let btnClass =
                  'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';
                if (isActive) {
                  btnClass =
                    'border-sky-700 bg-sky-700 text-white ring-2 ring-sky-600/25';
                } else if (isDoubt) {
                  btnClass =
                    'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100';
                } else if (isAnswered) {
                  btnClass =
                    'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100';
                }

                return (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => handleJumpTo(idx)}
                    aria-label={`Soal ${q.displayNumber}${
                      isDoubt ? ', ragu-ragu' : isAnswered ? ', terjawab' : ', belum dijawab'
                    }`}
                    className={`relative flex min-h-[42px] items-center justify-center rounded-lg border font-mono text-sm font-semibold tabular-nums transition-colors ${btnClass}`}
                  >
                    <span>{q.displayNumber}</span>
                    {isDoubt && !isActive && (
                      <Flag
                        className="absolute right-1 top-1 h-2.5 w-2.5 text-amber-600"
                        aria-hidden="true"
                      />
                    )}
                    {!isDoubt && isAnswered && !isActive && (
                      <Check
                        className="absolute right-1 top-1 h-2.5 w-2.5 text-emerald-600"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Legend with explicit text + icon (no hue-only signaling) */}
      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-sky-700 text-[10px] font-bold text-white">
            1
          </span>
          <span>Sedang Dibuka</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-emerald-400 bg-emerald-50 text-emerald-700">
            <Check className="h-3 w-3" aria-hidden="true" />
          </span>
          <span>Terjawab ({answeredCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-amber-400 bg-amber-50 text-amber-700">
            <Flag className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
          <span>Ragu-Ragu ({doubtfulCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-300 bg-white text-[10px] text-slate-400">
            -
          </span>
          <span>Kosong ({unansweredCount})</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-12">
      {/* Compact Sticky Exam Header: 1 tight row on mobile (<=48px), full metadata on desktop */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 px-3 sm:h-14 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
            <span className="font-bold text-sky-800 whitespace-nowrap shrink-0">
              Paket {packetCode}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="truncate font-semibold text-slate-900 max-w-[130px] sm:max-w-[220px]">
              {student.nama}
            </span>
            <span className="hidden text-slate-300 md:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden text-slate-600 whitespace-nowrap md:inline">
              No. {student.noAbsen} · {student.kelas} · {student.sekolah}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-sm font-semibold tabular-nums whitespace-nowrap ${
                isTimeCritical
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
              aria-label="Sisa waktu ujian"
            >
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{formatCountdown(secondsLeft)}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              disabled={isSubmitting}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap shrink-0 sm:min-h-[38px] sm:px-4 sm:text-sm"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Selesai</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 sm:pt-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* Question Stage */}
          <section className="space-y-5 lg:col-span-8">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-7">
              {/* Quiet unboxed metadata line */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs text-slate-500">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    Soal {currentQuestion.displayNumber} / {questions.length}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{currentQuestion.lkpd}</span>
                  <span aria-hidden="true">·</span>
                  <span>{currentQuestion.topic}</span>
                </div>
                <span className="font-mono text-slate-400">{currentQuestion.questionId}</span>
              </div>

              {/* Question Prompt */}
              <div className="space-y-4">
                <h2 className="text-base font-medium leading-relaxed text-slate-900 sm:text-[17px]">
                  {currentQuestion.prompt}
                </h2>

                {currentQuestion.codeSnippet && (
                  <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 sm:text-sm">
                    <code>{currentQuestion.codeSnippet}</code>
                  </pre>
                )}
              </div>

              {/* Options A-E with >= 48px touch targets */}
              <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Pilihan jawaban">
                {currentQuestion.options.map((opt) => {
                  const isSelected = selectedOriginalKey === opt.originalKey;
                  return (
                    <button
                      key={opt.displayKey}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectOption(opt.originalKey)}
                      className={`group flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                        isSelected
                          ? 'border-sky-700 bg-sky-50 text-slate-950'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-bold transition-colors ${
                            isSelected
                              ? 'border-sky-700 bg-sky-700 text-white'
                              : 'border-slate-300 bg-slate-50 text-slate-700 group-hover:border-slate-400'
                          }`}
                        >
                          {opt.displayKey}
                        </span>
                        <span className="text-sm leading-relaxed sm:text-base">{opt.text}</span>
                      </div>

                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 shrink-0 whitespace-nowrap">
                          <Check className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden sm:inline">Dipilih</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Desktop Action Footer */}
              <div className="mt-7 hidden items-center justify-between gap-3 border-t border-slate-100 pt-5 lg:flex">
                <button
                  type="button"
                  onClick={() => handleJumpTo(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Sebelumnya</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleDoubtful}
                  aria-pressed={isCurrentDoubtful}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    isCurrentDoubtful
                      ? 'border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  <span>{isCurrentDoubtful ? 'Batalkan Ragu-Ragu' : 'Tandai Ragu-Ragu'}</span>
                </button>

                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => handleJumpTo(currentIndex + 1)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-sky-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap shrink-0"
                  >
                    <span>Simpan & Lanjutkan</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 whitespace-nowrap shrink-0"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Kirim Jawaban</span>
                  </button>
                )}
              </div>
            </article>

            {/* Quiet Focus Status Summary below question */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
              <span>
                Progres: <strong className="text-slate-700 tabular-nums">{answeredCount}/50</strong>{' '}
                terjawab · <strong className="text-slate-700 tabular-nums">{doubtfulCount}</strong>{' '}
                ragu-ragu
              </span>
              <span>
                Catatan fokus keluar layar:{' '}
                <strong className="text-slate-700 tabular-nums">{violations} kali</strong>
              </span>
            </div>
          </section>

          {/* Desktop Right Navigator Panel */}
          <aside className="hidden lg:sticky lg:top-20 lg:col-span-4 lg:block">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Navigasi Nomor Soal</h3>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {answeredCount}/50
                </span>
              </div>
              {renderNumberGrid(false)}
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile Sticky Bottom Thumb-Friendly Bar */}
      <nav
        aria-label="Navigasi soal mobile"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur-md pb-safe lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => handleJumpTo(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-40 whitespace-nowrap"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Prev</span>
          </button>

          <button
            type="button"
            onClick={handleToggleDoubtful}
            aria-pressed={isCurrentDoubtful}
            className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold active:scale-[0.98] whitespace-nowrap ${
              isCurrentDoubtful
                ? 'border-amber-500 bg-amber-50 text-amber-900'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Ragu</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-2 font-mono text-xs font-bold text-slate-900 tabular-nums active:scale-[0.98] whitespace-nowrap"
          >
            <Grid2x2 className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />
            <span>
              {currentQuestion.displayNumber}/{questions.length}
            </span>
          </button>

          {currentIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => handleJumpTo(currentIndex + 1)}
              className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-sky-700 px-2 text-xs font-semibold text-white active:scale-[0.98] whitespace-nowrap"
            >
              <span>Lanjut</span>
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-emerald-700 px-2 text-xs font-semibold text-white active:scale-[0.98] whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Selesai</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile 50-Number Map Bottom Sheet Modal */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Peta 50 nomor soal"
        >
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-8">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Peta 50 Nomor Soal</h3>
                <p className="text-xs text-slate-500">
                  Ketuk nomor untuk berpindah soal · {answeredCount}/50 terjawab
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Tutup peta soal"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {renderNumberGrid(true)}
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6">
            <h3 id="submit-modal-title" className="text-lg font-bold text-slate-900">
              Konfirmasi Selesai Ujian
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Pastikan seluruh jawaban telah diperiksa. Setelah dikirim, jawaban akan dienkripsi
              dan sesi ujian berakhir.
            </p>

            <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <div>
                <dt className="text-xs text-slate-500">Terjawab</dt>
                <dd className="mt-0.5 font-mono text-base font-bold text-emerald-700 tabular-nums">
                  {answeredCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Ragu-Ragu</dt>
                <dd className="mt-0.5 font-mono text-base font-bold text-amber-700 tabular-nums">
                  {doubtfulCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Kosong</dt>
                <dd className="mt-0.5 font-mono text-base font-bold text-slate-700 tabular-nums">
                  {unansweredCount}
                </dd>
              </div>
            </dl>

            {unansweredCount > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span>
                  Masih terdapat {unansweredCount} soal yang belum terjawab. Anda dapat kembali untuk
                  melengkapinya sebelum mengirim.
                </span>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                onClick={() => void executeFinalSubmit(false)}
                disabled={isSubmitting}
                className="min-h-[44px] rounded-xl bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:bg-slate-400"
              >
                {isSubmitting ? 'Mengenkripsi & Mengirim...' : 'Ya, Kirim Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anti-Cheat Focus Violation Warning Modal */}
      {showViolationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="violation-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 id="violation-modal-title" className="text-base font-bold text-slate-900">
                  Peringatan Fokus Layar Ujian
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Sistem mendeteksi Anda meninggalkan tab atau jendela ujian. Aktivitas ini dicatat
                  pada laporan hasil ujian.
                </p>
                <p className="mt-2 font-mono text-xs font-semibold text-amber-800 tabular-nums">
                  Total pelanggaran fokus tercatat: {violations} kali
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowViolationModal(false)}
              className="mt-5 min-h-[44px] w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Saya Mengerti, Lanjutkan Ujian
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

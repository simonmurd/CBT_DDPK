import { EXAM_CONFIG } from '@/src/config/examConfig';
import type { OptionKey, PacketCode } from '@/src/data/questions/types';
import type { Student } from '@/src/data/students';

/**
 * Autosaved exam state stored in localStorage.
 * Intentionally excludes answer keys (originalKey) and scores.
 */
export interface PersistedExamSession {
  student: Student;
  packetCode: PacketCode;
  token: string;
  answers: Record<string, OptionKey>; // keyed by questionId -> chosen original option letter
  doubtful: Record<string, boolean>; // keyed by questionId
  violations: number;
  currentIndex: number;
  startTimestamp: number;
  endTimestamp: number;
  submitted: boolean;
}

export function saveExamSession(session: PersistedExamSession): void {
  try {
    localStorage.setItem(EXAM_CONFIG.storageKey, JSON.stringify(session));
  } catch {
    // Ignore storage quota or private mode restrictions silently
  }
}

export function loadExamSession(): PersistedExamSession | null {
  try {
    const raw = localStorage.getItem(EXAM_CONFIG.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedExamSession;
    if (!parsed?.student?.id || !parsed?.endTimestamp) return null;
    if (parsed.submitted) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearExamSession(): void {
  try {
    localStorage.removeItem(EXAM_CONFIG.storageKey);
  } catch {
    // Ignore
  }
}

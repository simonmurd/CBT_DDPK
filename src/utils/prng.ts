import {
  OPTION_KEYS,
  PACKET_CODES,
  type OptionKey,
  type PacketCode,
  type QuestionItem,
  type ShuffledOption,
  type ShuffledQuestion,
} from '@/src/data/questions/types';
import type { Student } from '@/src/data/students';

/**
 * FNV-1a 32-bit hash for deterministic seeding across sessions and devices.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 deterministic PRNG returning values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle backed by a deterministic PRNG function.
 */
export function fisherYatesShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Assigns one of 5 packets (A-E) deterministically using class/school hash offset + absen number,
 * ensuring consecutive absent numbers receive distinct adjacent packets while remaining identical on reload.
 */
export function assignPacketForStudent(student: Student): PacketCode {
  const classOffset = fnv1a32(`${student.sekolah.trim()}|${student.kelas.trim()}`) % PACKET_CODES.length;
  const parsedAbsen = parseInt(student.noAbsen.replace(/\D/g, ''), 10);
  const absenOffset = Number.isFinite(parsedAbsen)
    ? parsedAbsen
    : fnv1a32(student.noAbsen.trim());
  const index = (classOffset + absenOffset) % PACKET_CODES.length;
  return PACKET_CODES[index];
}

/**
 * Deterministically shuffles the 50 questions of the assigned packet and their 5 options (A-E)
 * based on the student's unique identity seed.
 */
export function buildShuffledExamForStudent(
  student: Student,
  packetQuestions: readonly QuestionItem[]
): { packetCode: PacketCode; questions: ShuffledQuestion[] } {
  const packetCode = assignPacketForStudent(student);
  const seedString = `${student.sekolah.trim()}|${student.kelas.trim()}|${student.noAbsen.trim()}|${student.nama.trim()}|${packetCode}`;
  const rng = mulberry32(fnv1a32(seedString));

  const shuffledItems = fisherYatesShuffle(packetQuestions, rng);

  const questions: ShuffledQuestion[] = shuffledItems.map((q, idx) => {
    const optionEntries: { originalKey: OptionKey; text: string }[] = OPTION_KEYS.map((key) => ({
      originalKey: key,
      text: q.options[key],
    }));

    const shuffledEntries = fisherYatesShuffle(optionEntries, rng);
    const options: ShuffledOption[] = shuffledEntries.map((entry, optIdx) => ({
      displayKey: OPTION_KEYS[optIdx],
      originalKey: entry.originalKey,
      text: entry.text,
    }));

    return {
      displayNumber: idx + 1,
      packetCode: q.packetCode,
      questionId: q.questionId,
      lkpd: q.lkpd,
      topic: q.topic,
      prompt: q.prompt,
      codeSnippet: q.codeSnippet,
      options,
      originalKey: q.originalKey,
    };
  });

  return { packetCode, questions };
}

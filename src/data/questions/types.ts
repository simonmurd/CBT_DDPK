export type PacketCode = 'A' | 'B' | 'C' | 'D' | 'E';
export type OptionKey = 'A' | 'B' | 'C' | 'D' | 'E';

export const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D', 'E'];
export const PACKET_CODES: PacketCode[] = ['A', 'B', 'C', 'D', 'E'];

export interface QuestionItem {
  packetCode: PacketCode;
  questionId: string;
  lkpd: string;
  topic: string;
  prompt: string;
  codeSnippet?: string;
  options: Record<OptionKey, string>;
  originalKey: OptionKey;
}

export interface ShuffledOption {
  displayKey: OptionKey;
  originalKey: OptionKey;
  text: string;
}

export interface ShuffledQuestion {
  displayNumber: number;
  packetCode: PacketCode;
  questionId: string;
  lkpd: string;
  topic: string;
  prompt: string;
  codeSnippet?: string;
  options: ShuffledOption[];
  originalKey: OptionKey;
}

import { PACKET_A_QUESTIONS } from './packetA';
import { PACKET_B_QUESTIONS } from './packetB';
import { PACKET_C_QUESTIONS } from './packetC';
import { PACKET_D_QUESTIONS } from './packetD';
import { PACKET_E_QUESTIONS } from './packetE';
import type { PacketCode, QuestionItem } from './types';

export const QUESTION_PACKETS: Record<PacketCode, QuestionItem[]> = {
  A: PACKET_A_QUESTIONS,
  B: PACKET_B_QUESTIONS,
  C: PACKET_C_QUESTIONS,
  D: PACKET_D_QUESTIONS,
  E: PACKET_E_QUESTIONS,
};

export const ALL_QUESTIONS: QuestionItem[] = [
  ...PACKET_A_QUESTIONS,
  ...PACKET_B_QUESTIONS,
  ...PACKET_C_QUESTIONS,
  ...PACKET_D_QUESTIONS,
  ...PACKET_E_QUESTIONS,
];

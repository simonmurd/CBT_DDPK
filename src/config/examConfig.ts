export const EXAM_CONFIG = {
  brandName: 'Simon Murdani Yusuf',
  subjectName: 'Dasar-Dasar Teknik Jaringan Komputer dan Telekomunikasi (DDPK TJKT)',
  subjectShort: 'DDPK TJKT · K3LH',
  mainTopic: 'Keselamatan dan Kesehatan Kerja Lingkungan Hidup (K3LH) & Budaya Kerja Industri',
  gradeLevel: 'X (Fase E) · 2026/2027',
  durationMinutes: 90,
  totalQuestions: 50,
  appsScriptEndpoint:
    'https://script.google.com/macros/s/AKfycby1hclAzPOGDMAOSVIVvqoRiWxRP5cwZ7VLwOJT0uBRUCExdYUZLn2V7yyHsnXLlqo-IQ/exec',
  activeTokens: ['TJKT-2026A', 'TJKT-2026B', 'TOKEN1-2026', 'TOKEN2-2026'] as const,
  // SHA-256 digest of the teacher portal access code
  teacherAccessSha256:
    '0dba9359d057384fb351f0d692e2cb4112ef8a431d49eb508a763a9a08f56673',
  encryptionVersion: 'AES-256-GCM-PBKDF2-SHA256-v1',
  storageKey: 'cbt_ddpk_k3lh_2026_v1',
} as const;

export type QuestionType = 'multiple-choice' | 'true-false';

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  choices: string[];
  answer: number;
  points: number;
}

export interface QuizSettings {
  durationMinutes: number;
  allowedAttempts: number;
  resetPassword?: string;
  resultDataMode?: 'compact' | 'simple' | 'complete';
  passingPercentage: number;
  randomizeQuestions: boolean;
  randomizeChoices: boolean;
  requireName: boolean;
  requireStudentId: boolean;
  requireSection: boolean;
  showScore: boolean;
  showPercentage: boolean;
  showCorrectAnswers: boolean;
  showReview: boolean;
  autoSubmitOnTimeout: boolean;
  resumeAfterRefresh: boolean;
}

export interface SecuritySettings {
  enabled: boolean;
  requireFullscreen: boolean;
  detectTabSwitch: boolean;
  detectFocusLoss: boolean;
  detectFullscreenExit: boolean;
  detectCopy: boolean;
  detectPaste: boolean;
  disableRightClick: boolean;
  disableTextSelection: boolean;
  detectPageExit: boolean;
  maximumViolations: number;
  action: 'warning' | 'auto-submit';
}

export interface QuizStudent {
  number: string;
  name: string;
}

export interface Quiz {
  version: '1.0';
  quizId: string;
  quizTitle: string;
  subject: string;
  section: string;
  teacher: string;
  instructions: string;
  settings: QuizSettings;
  security: SecuritySettings;
  questions: QuizQuestion[];
  students?: QuizStudent[];
}

export interface SecurityEvent {
  type: 'tab-switch' | 'focus-loss' | 'fullscreen-exit' | 'copy' | 'paste' | 'page-exit';
  timestamp: string;
}

export interface StudentResponse {
  questionId: string;
  selectedAnswer: number | null;
  correctAnswer: number;
  correct: boolean;
  pointsAwarded: number;
  choices?: string[];
  questionText?: string;
  pointsPossible?: number;
  displayOrder?: number;
  choiceOrder?: number[];
}

export interface QuizResult {
  format: 'QUIQ_RESULT';
  version: '1.0';
  resultDataMode?: 'compact' | 'simple' | 'complete';
  resultId: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  section: string;
  teacher: string;
  studentName: string;
  studentId: string;
  studentSection: string;
  attempt: number;
  score: number;
  totalScore: number;
  percentage: number;
  passed: boolean;
  passingPercentage: number;
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
  submissionReason: 'manual' | 'timeout' | 'security-limit' | 'compact-scan';
  autoSubmitted: boolean;
  violations: SecurityEvent[];
  responses: StudentResponse[];
  recordedAt?: string;
  examCode?: string;
}

export interface QrEnvelope {
  format: 'QUIQ_QR';
  version: '1.0';
  resultId: string;
  partNumber: number;
  totalParts: number;
  encoding: 'gzip-base64' | 'base64-json';
  payloadChunk: string;
  checksum: string;
}

export const sampleQuiz: Quiz = {
  version: '1.0',
  quizId: 'IT123-Q1-2026',
  quizTitle: 'Object-Oriented Programming Quiz',
  subject: 'IT 123',
  section: 'BSIT 2A',
  teacher: 'Mark Daniel G. Dacer',
  instructions: 'Read every question carefully and select the best answer.',
  settings: {
    durationMinutes: 30,
    allowedAttempts: 1,
    resetPassword: 'QUIQ-RESET-2026',
    resultDataMode: 'simple',
    passingPercentage: 75,
    randomizeQuestions: true,
    randomizeChoices: true,
    requireName: true,
    requireStudentId: true,
    requireSection: true,
    showScore: true,
    showPercentage: true,
    showCorrectAnswers: false,
    showReview: false,
    autoSubmitOnTimeout: true,
    resumeAfterRefresh: true,
  },
  security: {
    enabled: true,
    requireFullscreen: true,
    detectTabSwitch: true,
    detectFocusLoss: true,
    detectFullscreenExit: true,
    detectCopy: true,
    detectPaste: true,
    disableRightClick: true,
    disableTextSelection: false,
    detectPageExit: true,
    maximumViolations: 3,
    action: 'auto-submit',
  },
  questions: [
    {
      id: 'Q001',
      type: 'multiple-choice',
      question: 'What does CPU stand for?',
      choices: [
        'Central Processing Unit',
        'Computer Processing Utility',
        'Central Program Unit',
        'Computer Program Utility',
      ],
      answer: 0,
      points: 1,
    },
    {
      id: 'Q002',
      type: 'true-false',
      question: 'Java supports object-oriented programming.',
      choices: ['True', 'False'],
      answer: 0,
      points: 1,
    },
  ],
};

export function createQuestion(index: number, type: QuestionType = 'multiple-choice'): QuizQuestion {
  return {
    id: `Q${String(index).padStart(3, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type,
    question: '',
    choices: type === 'true-false' ? ['True', 'False'] : ['', '', '', ''],
    answer: 0,
    points: 1,
  };
}

export function totalPoints(quiz: Quiz) {
  return quiz.questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
}

export function validateQuiz(value: unknown): { valid: boolean; errors: string[]; quiz?: Quiz } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return { valid: false, errors: ['The file does not contain a quiz object.'] };
  const quiz = value as Partial<Quiz>;
  if (quiz.version !== '1.0') errors.push('Unsupported quiz version. Expected version 1.0.');
  if (!quiz.quizTitle?.trim()) errors.push('Quiz title is required.');
  if (!quiz.quizId?.trim()) errors.push('Quiz ID is required.');
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) errors.push('Add at least one question.');
  const ids = new Set<string>();
  quiz.questions?.forEach((question, index) => {
    const label = question?.id || `Question ${index + 1}`;
    if (!question?.id) errors.push(`Question ${index + 1} does not have a permanent ID.`);
    if (question?.id && ids.has(question.id)) errors.push(`Question ID ${question.id} is duplicated.`);
    if (question?.id) ids.add(question.id);
    if (!question?.question?.trim()) errors.push(`${label} does not contain question text.`);
    if (!['multiple-choice', 'true-false'].includes(question?.type)) errors.push(`${label} has an unsupported question type.`);
    if (!Array.isArray(question?.choices) || question.choices.length < 2 || question.choices.length > 8) {
      errors.push(`${label} must contain between 2 and 8 choices.`);
    }
    if (!Number.isInteger(question?.answer) || question.answer < 0 || question.answer >= (question.choices?.length || 0)) {
      errors.push(`${label} does not contain a valid correct answer.`);
    }
    if (!Number.isFinite(Number(question?.points)) || Number(question.points) <= 0) errors.push(`${label} must have a positive point value.`);
  });
  if (!quiz.settings || !quiz.security) errors.push('Quiz settings or security configuration is missing.');
  if (quiz.settings) {
    if (String(quiz.settings.resetPassword || '').trim().length < 4) errors.push('Set a teacher reset password with at least 4 characters in Quiz settings.');
    if (!['compact', 'simple', 'complete'].includes(String(quiz.settings.resultDataMode || 'simple'))) quiz.settings.resultDataMode = 'simple';
    if (quiz.settings.resultDataMode === 'compact') {
      if (quiz.settings.allowedAttempts !== 1) errors.push('One-QR mode records one final result per student. Set allowed attempts to 1.');
      if (!Array.isArray(quiz.students) || quiz.students.length === 0 || quiz.students.length > 99) errors.push('One-QR mode requires a student list of 1–99 students.');
      if ((quiz.questions?.length || 0) > 200) errors.push('One-QR mode supports up to 200 questions per exam.');
      const numbers = new Set<string>();
      if (Array.isArray(quiz.students)) quiz.students.forEach((student) => {
        if (!/^(0[1-9]|[1-9][0-9])$/.test(student?.number) || numbers.has(student?.number)) errors.push('Student numbers must be unique, from 01 to 99.');
        numbers.add(student?.number);
        if (typeof student?.name !== 'string' || !student.name.trim()) errors.push(`Student ${student?.number} needs a name.`);
      });
      quiz.questions?.forEach((question) => {
        if (question.type === 'true-false' && (!Array.isArray(question.choices) || question.choices.length !== 2 || question.choices[0]?.toLowerCase() !== 'true' || question.choices[1]?.toLowerCase() !== 'false')) errors.push(`${question.id}: one-QR true/false choices must be True, False in that order.`);
      });
    }
  }
  if (quiz.security) quiz.security.action = 'auto-submit';
  return errors.length ? { valid: false, errors } : { valid: true, errors, quiz: quiz as Quiz };
}

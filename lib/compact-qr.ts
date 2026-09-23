import { validateQuiz, type Quiz, type QuizQuestion, type QuizResult, type QuizStudent } from './quiz-types';

export const SCANNER_EXAM_KEY = 'quiq-scanner-exam-v1';
export interface ScannerExam {
  format: 'QUIQ_SCANNER_EXAM';
  version: '1.0';
  code: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  teacher: string;
  passingPercentage: number;
  questions: QuizQuestion[];
  students: QuizStudent[];
}

async function examCode(exam: ScannerExam): Promise<string> {
  const canonical = JSON.stringify([exam.version, exam.quizId, exam.quizTitle, exam.subject, exam.teacher, exam.passingPercentage,
    exam.questions.map((q) => [q.id, q.type, q.question, q.choices, q.answer, q.points]),
    [...exam.students].sort((a, b) => a.number.localeCompare(b.number)).map((s) => [s.number, s.name])]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest)).slice(0, 6).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function createScannerExam(quiz: Quiz): Promise<ScannerExam> {
  const validation = validateQuiz({ ...quiz, settings: { ...quiz.settings, resultDataMode: 'compact' } });
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const exam: ScannerExam = {
    format: 'QUIQ_SCANNER_EXAM', version: '1.0', code: '', quizId: quiz.quizId, quizTitle: quiz.quizTitle,
    subject: quiz.subject || '', teacher: quiz.teacher || '', passingPercentage: quiz.settings.passingPercentage,
    questions: quiz.questions.map((q) => ({ id: q.id, type: q.type, question: q.question, choices: [...q.choices], answer: q.answer, points: Number(q.points) })),
    students: (quiz.students || []).map((s) => ({ number: s.number, name: s.name.trim() })),
  };
  if (!Number.isFinite(exam.passingPercentage) || exam.passingPercentage < 0 || exam.passingPercentage > 100) throw new Error('Passing percentage must be between 0 and 100.');
  exam.code = await examCode(exam);
  return exam;
}

export async function parseScannerExam(value: unknown): Promise<ScannerExam> {
  const exam = value as ScannerExam;
  if (exam?.format !== 'QUIQ_SCANNER_EXAM' || exam.version !== '1.0' || !/^[A-F0-9]{12}$/.test(exam.code)) throw new Error('Choose a scanner setup JSON exported from the Students page.');
  const validated = await createScannerExam({
    version: '1.0', quizId: exam.quizId, quizTitle: exam.quizTitle, subject: exam.subject, teacher: exam.teacher,
    section: '', instructions: '', students: exam.students, questions: exam.questions,
    settings: { resultDataMode: 'compact', allowedAttempts: 1, resetPassword: 'validation-only', passingPercentage: exam.passingPercentage } as Quiz['settings'],
    security: { action: 'auto-submit' } as Quiz['security'],
  });
  if (validated.code !== exam.code) throw new Error('Scanner setup does not match its exam check code. Export a fresh setup from the maker.');
  return validated;
}

// Self-contained: this exact function is embedded in the offline student HTML.
export function encodeCompactResult(code: string, number: string, questions: QuizQuestion[], answers: Record<string, number | null | undefined>): string {
  if (!/^(0[1-9]|[1-9][0-9])$/.test(number) || !/^[A-F0-9]{12}$/.test(code)) throw new Error('Invalid student number or exam code.');
  if (!questions.length || questions.length > 200) throw new Error('One QR supports 1–200 questions.');
  const digits = questions.map((q) => {
    const answer = answers[q.id];
    if (answer === undefined || answer === null) return '0';
    if (!Number.isInteger(answer) || answer < 0 || answer >= q.choices.length || answer > 7) throw new Error(`Invalid answer for ${q.id}.`);
    return String(answer + 1);
  }).join('');
  return `${number}-${digits}-${code}`;
}

export function decodeCompactResult(value: string, exam: ScannerExam, scannedAt = new Date().toISOString()): QuizResult {
  const match = /^(0[1-9]|[1-9][0-9])-([0-8]{1,200})-([A-F0-9]{12})$/.exec(value.trim());
  if (!match) throw new Error('Invalid one-QR result. Scan the full code from the submitted exam.');
  const [, number, digits, code] = match;
  if (code !== exam.code) throw new Error('Wrong quiz or student list. Load the scanner setup that matches this exported exam.');
  if (digits.length !== exam.questions.length) throw new Error(`Expected ${exam.questions.length} answer digits; received ${digits.length}.`);
  const student = exam.students.find((item) => item.number === number);
  if (!student) throw new Error(`Student ${number} is not in the loaded list.`);
  const responses = exam.questions.map((q, index) => {
    const digit = Number(digits[index]);
    if (digit > q.choices.length) throw new Error(`Invalid answer digit for question ${index + 1}.`);
    const selectedAnswer = digit === 0 ? null : digit - 1;
    const correct = selectedAnswer === q.answer;
    return { questionId: q.id, questionText: q.question, choices: [...q.choices], selectedAnswer, correctAnswer: q.answer,
      correct, pointsAwarded: correct ? q.points : 0, pointsPossible: q.points };
  });
  const score = responses.reduce((sum, response) => sum + response.pointsAwarded, 0);
  const totalScore = exam.questions.reduce((sum, q) => sum + q.points, 0);
  const percentage = Math.round(score / totalScore * 10000) / 100;
  return {
    format: 'QUIQ_RESULT', version: '1.0', resultDataMode: 'compact', resultId: `${exam.quizId}-C-${code}-${number}`,
    quizId: exam.quizId, examCode: code, quizTitle: exam.quizTitle, subject: exam.subject, teacher: exam.teacher, section: '', studentSection: '',
    studentId: number, studentName: student.name, attempt: 1, score, totalScore, percentage, passed: percentage >= exam.passingPercentage,
    passingPercentage: exam.passingPercentage, startedAt: '', submittedAt: scannedAt, recordedAt: scannedAt, durationSeconds: 0,
    submissionReason: 'compact-scan', autoSubmitted: false, violations: [], responses,
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import qrcode from 'qrcode-generator';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { createScannerExam, decodeCompactResult, encodeCompactResult, parseScannerExam } from '../lib/compact-qr';
import { resultsCsv, responsesCsv, analyzeItems } from '../lib/analytics';
import { sampleQuiz, validateQuiz, type Quiz } from '../lib/quiz-types';
import { canExportCheckedPaper, paperAnswer } from '../lib/result-paper';

const quiz: Quiz = {
  ...sampleQuiz, quizId: 'COMPACT-TEST', section: '',
  students: [{ number: '01', name: 'Maria Santos' }, { number: '02', name: 'Juan Dela Cruz' }],
  settings: { ...sampleQuiz.settings, resultDataMode: 'compact', allowedAttempts: 1, requireSection: false },
  questions: [
    { id: 'Q1', type: 'multiple-choice', question: 'Select two', choices: ['One', 'Two', 'Three', 'Four'], answer: 1, points: 2 },
    { id: 'Q2', type: 'true-false', question: 'Java has classes', choices: ['True', 'False'], answer: 0, points: 1 },
    { id: 'Q3', type: 'multiple-choice', question: 'Select four', choices: ['One', 'Two', 'Three', 'Four'], answer: 3, points: 1 },
  ],
};

test('one QR round trip restores student, grades, unanswered items and PDF details without section', async () => {
  const exam = await createScannerExam(quiz);
  const payload = encodeCompactResult(exam.code, '01', quiz.questions, { Q3: null, Q1: 1, Q2: 0 });
  assert.equal(payload, `01-210-${exam.code}`);
  const result = decodeCompactResult(payload, exam);
  assert.equal(result.studentName, 'Maria Santos');
  assert.equal(result.studentId, '01');
  assert.equal(result.score, 3);
  assert.equal(result.totalScore, 4);
  assert.equal(result.percentage, 75);
  assert.equal(result.passed, true);
  assert.equal(result.studentSection, '');
  assert.equal(result.responses[2].selectedAnswer, null);
  assert.equal(canExportCheckedPaper(result), true);
  assert.equal(result.responses[0].questionText, quiz.questions[0].question);
  assert.equal(paperAnswer(result.responses[0], 1), 'B. Two');
  assert.equal(result.responses[0].displayOrder, undefined);
  assert.equal(result.startedAt, '');
  assert.equal(result.submissionReason, 'compact-scan');
});

test('shuffled question processing still emits original order and original choice indices', async () => {
  const exam = await createScannerExam(quiz);
  // A student sees Q3 first and its displayed A maps to original choice D.
  const answers: Record<string, number> = {};
  answers.Q3 = [3, 0, 2, 1][0];
  answers.Q2 = 0;
  answers.Q1 = [2, 1, 3, 0][1];
  const payload = encodeCompactResult(exam.code, '02', quiz.questions, answers);
  assert.equal(payload, `02-214-${exam.code}`);
  const result = decodeCompactResult(payload, exam);
  assert.equal(result.score, 4);
  assert.equal(analyzeItems([result])[0].correct, 1);
});

test('changing the roster, answer key, order, points or passing mark rejects old QR data', async () => {
  const exam = await createScannerExam(quiz);
  const code = encodeCompactResult(exam.code, '01', quiz.questions, {});
  const changed = [
    { ...quiz, students: [{ number: '01', name: 'Different person' }] },
    { ...quiz, questions: quiz.questions.map((q, i) => i === 0 ? { ...q, answer: 0 } : q) },
    { ...quiz, questions: [...quiz.questions].reverse() },
    { ...quiz, questions: quiz.questions.map((q, i) => i === 0 ? { ...q, points: 3 } : q) },
    { ...quiz, settings: { ...quiz.settings, passingPercentage: 80 } },
  ];
  for (const change of changed) {
    const other = await createScannerExam(change);
    assert.throws(() => decodeCompactResult(code, other), /Wrong quiz/);
  }
  assert.equal((await createScannerExam({ ...quiz, section: 'Added later' })).code, exam.code);
  assert.deepEqual(await parseScannerExam(JSON.parse(JSON.stringify(exam))), exam);
  await assert.rejects(() => parseScannerExam({ ...exam, quizTitle: 'Changed' }), /check code/);
});

test('malformed, truncated, unknown-student and out-of-range answers cannot be graded', async () => {
  const exam = await createScannerExam(quiz);
  assert.throws(() => decodeCompactResult(`01-21-${exam.code}`, exam), /Expected 3/);
  assert.throws(() => decodeCompactResult(`03-210-${exam.code}`, exam), /not in the loaded list/);
  assert.throws(() => decodeCompactResult(`01-230-${exam.code}`, exam), /Invalid answer digit/);
  assert.throws(() => decodeCompactResult('01-210', exam), /Invalid one-QR/);
  assert.throws(() => encodeCompactResult(exam.code, '01', quiz.questions, { Q1: 9 }), /Invalid answer/);
});

test('duplicate scans retain the same identity even if scanned on another date', async () => {
  const exam = await createScannerExam(quiz);
  const payload = encodeCompactResult(exam.code, '01', quiz.questions, {});
  const a = decodeCompactResult(payload, exam, '2026-09-01T01:00:00Z');
  const b = decodeCompactResult(payload, exam, '2026-09-02T01:00:00Z');
  assert.equal(a.resultId, b.resultId);
  assert.equal(a.score, 0);
});

test('section is added to CSV at export without mutating records or inventing timestamps', async () => {
  const exam = await createScannerExam(quiz);
  const result = decodeCompactResult(encodeCompactResult(exam.code, '01', quiz.questions, { Q1: 1 }), exam);
  const snapshot = JSON.stringify(result);
  assert.match(resultsCsv([result], 'BSIT 2A'), /BSIT 2A/);
  assert.match(responsesCsv([result], 'BSIT 2A'), /BSIT 2A/);
  assert.match(responsesCsv([result], 'BSIT 2A'), /Unanswered/);
  assert.equal(JSON.stringify(result), snapshot);
  assert.doesNotMatch(resultsCsv([result]), /compact-scan/);
});

test('60 and 200 answers fit a single QR and the format enforces its capacity limits', async () => {
  for (const count of [60, 200]) {
    const expanded = { ...quiz, questions: Array.from({ length: count }, (_, index) => ({ ...quiz.questions[0], id: `Q${index + 1}` })) };
    const exam = await createScannerExam(expanded);
    const payload = encodeCompactResult(exam.code, '01', expanded.questions, {});
    assert.equal(payload.length, count + 16);
    const qr = qrcode(0, 'H'); qr.addData(payload, 'Alphanumeric'); qr.make();
    assert.ok(qr.createSvgTag().startsWith('<svg'));
    const scale = 6;
    const size = (qr.getModuleCount() + 8) * scale;
    const pixels = new Uint8ClampedArray(size * size).fill(255);
    for (let row = 0; row < qr.getModuleCount(); row++) for (let col = 0; col < qr.getModuleCount(); col++) {
      if (!qr.isDark(row, col)) continue;
      for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) pixels[((row + 4) * scale + y) * size + (col + 4) * scale + x] = 0;
    }
    const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, size, size))));
    assert.equal(decoded.getText(), payload, 'The scanner QR decoder must read the generated single code');
    assert.equal(decodeCompactResult(payload, exam).responses.length, count);
  }
  const invalid = { ...quiz, settings: { ...quiz.settings, allowedAttempts: 2 } };
  assert.equal(validateQuiz(invalid).valid, false);
  assert.equal(validateQuiz({ ...quiz, students: [] }).valid, false);
  assert.equal(validateQuiz({ ...quiz, students: [{ number: '01', name: 'A' }, { number: '01', name: 'B' }] }).valid, false);
});

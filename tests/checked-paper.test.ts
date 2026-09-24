import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckedPaperExport } from '../components/checked-paper-export';
import { BulkPaperExport } from '../components/bulk-paper-export';
import { buildCheckedPaperPdf, buildBulkCheckedPaperPdf } from '../lib/export-result-pdf';
import { canExportCheckedPaper, checkedPaperFilename, paperAnswer, paperChoices, paperResponses } from '../lib/result-paper';
import type { QuizResult, StudentResponse } from '../lib/quiz-types';

const fonts = {
  headerImage: `data:image/png;base64,${readFileSync(new URL('../public/buksu-pdf-header.png', import.meta.url)).toString('base64')}`,
  regular: readFileSync(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url)).toString('base64'),
  bold: readFileSync(new URL('../public/fonts/NotoSans-Bold.ttf', import.meta.url)).toString('base64'),
};
const response: StudentResponse = {
  questionId: 'Q-JAVA-01', questionText: 'What does this Java expression return?\nSystem.out.println(2 + 3);',
  choices: ['5', '23', 'A compilation error', 'An exception'], selectedAnswer: 0, correctAnswer: 0,
  correct: true, pointsAwarded: 2, pointsPossible: 2, displayOrder: 2, choiceOrder: [2, 0, 3, 1],
};
const result: QuizResult = {
  format: 'QUIQ_RESULT', version: '1.0', resultDataMode: 'complete', resultId: 'sample-result-2026',
  quizId: 'IT123-JAVA', quizTitle: 'Java Programming - Checked Examination',
  subject: 'IT123', section: 'BSIT 2A', teacher: 'Sample Teacher', studentName: 'María Peñaflor',
  studentId: '2026-001', studentSection: 'BSIT 2A', attempt: 1, score: 2, totalScore: 6,
  percentage: 33.33, passed: false, passingPercentage: 60, startedAt: '2026-09-21T01:00:00Z',
  submittedAt: '2026-09-21T01:25:00Z', durationSeconds: 1500, submissionReason: 'manual',
  autoSubmitted: false, violations: [], responses: [response,
    { ...response, questionId: 'Q-JAVA-02', questionText: 'Java supports object-oriented programming.', choices: ['True', 'False'], selectedAnswer: 1, correctAnswer: 0, correct: false, pointsAwarded: 0, displayOrder: 1, choiceOrder: [1, 0] },
    { ...response, questionId: 'Q-JAVA-03', questionText: 'Which type stores a boolean value?', choices: ['boolean', 'String', 'int', 'double'], selectedAnswer: null, correct: false, pointsAwarded: 0, displayOrder: 3, choiceOrder: [0, 1, 2, 3] },
  ],
};

function saveQa(name: string, pdf: ReturnType<typeof buildCheckedPaperPdf>) {
  if (!process.env.QUIQ_PDF_QA_DIR) return;
  mkdirSync(process.env.QUIQ_PDF_QA_DIR, { recursive: true });
  writeFileSync(join(process.env.QUIQ_PDF_QA_DIR, name), Buffer.from(pdf.output('arraybuffer')));
}

test('Full results qualify; Simple and missing responses cannot export checked papers', () => {
  assert.equal(canExportCheckedPaper(result), true);
  assert.equal(canExportCheckedPaper({ ...result, resultDataMode: undefined }), true);
  assert.equal(canExportCheckedPaper({ ...result, responses: [] }), false);
  const simple = { ...result, resultDataMode: 'simple' as const };
  assert.equal(canExportCheckedPaper(simple), false);
  assert.throws(() => buildCheckedPaperPdf(simple, fonts), /Full-mode/);
});

test('shuffled display order maps selected and correct answers back to the same choice', () => {
  assert.deepEqual(paperResponses(result).map((item) => item.questionId), ['Q-JAVA-02', 'Q-JAVA-01', 'Q-JAVA-03']);
  assert.equal(paperAnswer(response, 0), 'B. 5');
  assert.equal(paperAnswer(response, null), 'Unanswered');
  assert.equal(paperChoices(response).find((choice) => choice.selected)?.label, 'B');
  assert.equal(paperAnswer(result.responses[1], 1), 'A. False');
  assert.equal(paperAnswer(result.responses[1], 0), 'B. True');
  assert.equal(result.responses[0], response, 'Printing must not mutate stored order');
});

test('legacy and damaged display metadata fall back to original answer indices', () => {
  const legacy = { ...response, questionText: undefined, displayOrder: undefined, choiceOrder: undefined };
  assert.equal(paperAnswer(legacy, 0), 'A. 5');
  assert.equal(paperAnswer({ ...legacy, choices: undefined }, 1), 'B');
  assert.equal(paperAnswer({ ...response, choiceOrder: [0, 0, 0, 0] }, 0), 'A. 5');
  const legacyResult = { ...result, resultDataMode: undefined, responses: [legacy] };
  saveQa('legacy.pdf', buildCheckedPaperPdf(legacyResult, fonts));
});

test('renders marked answers, accented student names, and A4 pages', () => {
  const pdf = buildCheckedPaperPdf(result, fonts);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < 0.1);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 297) < 0.1);
  assert.ok(pdf.getNumberOfPages() >= 1);
  assert.equal(Buffer.from(pdf.output('arraybuffer')).subarray(0, 5).toString(), '%PDF-');
  saveQa('checked-paper.pdf', pdf);
});

test('50 items and a question longer than a page paginate successfully', () => {
  const responses = Array.from({ length: 50 }, (_, index) => ({ ...response, questionId: `LONG-${index + 1}`, displayOrder: index + 1,
    questionText: index === 24 ? 'Read the following code and explanation.\n'.repeat(65) : `Item ${index + 1}: ${response.questionText}`,
  }));
  const pdf = buildCheckedPaperPdf({ ...result, responses, score: 100, totalScore: 100, percentage: 100, passed: true }, fonts);
  assert.ok(pdf.getNumberOfPages() > 10);
  assert.ok(pdf.getNumberOfPages() < 40);
  saveQa('long-paper.pdf', pdf);
});

test('download filename is safe and includes the student and attempt', () => {
  const filename = checkedPaperFilename({ ...result, studentName: 'María / A:*?' });
  assert.ok(filename.startsWith('María'));
  assert.ok(filename.endsWith('_Attempt-1_checked-paper.pdf'));
  assert.doesNotMatch(filename, /[<>:"/\\|?*\u0000-\u001f]/);
});

test('the scanner offers the PDF button only for results with full answers', () => {
  assert.match(renderToStaticMarkup(createElement(CheckedPaperExport, { result })), /Export checked paper PDF/);
  const simple = { ...result, resultDataMode: 'simple' as const, responses: [] };
  const markup = renderToStaticMarkup(createElement(CheckedPaperExport, { result: simple }));
  assert.doesNotMatch(markup, /<button/);
  assert.match(markup, /Full-mode results/);
});

test('bulk PDF starts each student on a fresh page, reports progress and never mutates records', async () => {
  const second = { ...result, resultId: 'second', studentId: '02', studentName: 'Juan Dela Cruz', studentSection: '', section: '', resultDataMode: 'compact' as const };
  const first = { ...result, studentId: '01' };
  const original = JSON.stringify([second, first]);
  const progress: number[][] = [];
  const pdf = await buildBulkCheckedPaperPdf([second, first], fonts, 'BSIT 3B', (done, total) => progress.push([done, total]));
  assert.equal(pdf.getNumberOfPages(), buildCheckedPaperPdf(first, fonts).getNumberOfPages() + buildCheckedPaperPdf(second, fonts).getNumberOfPages());
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.equal(JSON.stringify([second, first]), original);
  // jsPDF types declare number[] here, but runtime pages contain PDF command arrays.
  const commands = pdf.internal.pages as unknown as string[][];
  assert.ok(commands.slice(1).every((page) => page.some((command) => command.includes('/I0 Do'))), 'University header must be drawn on every page of every student paper');
  saveQa('bulk-papers.pdf', pdf);
});

test('bulk PDF rejects empty batches and unsupported papers', async () => {
  await assert.rejects(buildBulkCheckedPaperPdf([], fonts), /No checked papers/);
  await assert.rejects(buildBulkCheckedPaperPdf([{ ...result, resultDataMode: 'simple' }], fonts), /recorded answers/);
});

test('bulk UI includes entire exam group, reports exclusions and requires missing section', () => {
  const compact = { ...result, resultDataMode: 'compact' as const, studentSection: '', section: '', examCode: '123456ABCDEF' };
  const results = Array.from({ length: 25 }, (_, index) => ({ ...compact, resultId: `bulk-${index}`, studentId: String(index + 1).padStart(2, '0') }));
  const markup = renderToStaticMarkup(createElement(BulkPaperExport, { results: [...results, { ...compact, resultDataMode: 'simple', responses: [] }] }));
  assert.match(markup, /25 eligible paper/);
  assert.match(markup, /excluded: Simple mode or no recorded answers/);
  assert.match(markup, /required/);
  assert.match(markup, /<button[^>]*disabled/);
  assert.match(markup, /Download all student PDFs/);
  assert.match(markup, /Search and status filters do not limit this export/);
});

import { jsPDF } from 'jspdf';
import type { QuizResult } from './quiz-types';
import { canExportCheckedPaper, checkedPaperFilename, paperAnswer, paperChoices, paperResponses } from './result-paper';

type PdfFonts = { regular: string; bold: string };
let fontPromise: Promise<PdfFonts> | undefined;

async function loadFonts(): Promise<PdfFonts> {
  if (!fontPromise) {
    fontPromise = Promise.all(['Regular', 'Bold'].map(async (style) => {
      const response = await fetch(`/fonts/NotoSans-${style}.ttf`);
      if (!response.ok) throw new Error('PDF fonts could not be loaded. Reconnect and try exporting again.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return btoa(binary);
    })).then(([regular, bold]) => ({ regular, bold })).catch((error) => {
      fontPromise = undefined;
      throw error;
    });
  }
  return fontPromise;
}

export function buildCheckedPaperPdf(result: QuizResult, fonts: PdfFonts) {
  if (!canExportCheckedPaper(result)) throw new Error('Checked papers require a Full-mode result with recorded answers.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Regular.ttf', 'Paper', 'normal');
  doc.addFont('NotoSans-Bold.ttf', 'Paper', 'bold');
  doc.setProperties({ title: `${result.quizTitle} - ${result.studentName} - Checked paper`, creator: 'Quiq Scanner' });

  const margin = 18;
  const width = 174;
  const bottom = 276;
  const ink = '#172536';
  const muted = '#536174';
  let y = 22;
  let continuation = '';

  function clean(value: unknown) {
    return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }

  function wrapped(text: unknown, size: number, bold = false, indent = 0): string[] {
    doc.setFont('Paper', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(clean(text), width - indent) as string[];
  }

  function nextPage() {
    doc.addPage();
    doc.setFont('Paper', 'normal').setFontSize(8).setTextColor(muted);
    const heading = wrapped(`${result.studentName} | ${result.quizTitle}`, 8)[0];
    doc.text(heading, margin, 14);
    doc.setDrawColor('#D7DFE8').line(margin, 18, margin + width, 18);
    y = 26;
    if (continuation) {
      doc.setFont('Paper', 'bold').setFontSize(9).setTextColor(muted);
      doc.text(continuation, margin, y);
      y += 7;
    }
  }

  function reserve(height: number) {
    if (y + height > bottom) nextPage();
  }

  function text(value: unknown, options: { size?: number; bold?: boolean; color?: string; indent?: number; gap?: number } = {}) {
    const { size = 10, bold = false, color = ink, indent = 0, gap = 2 } = options;
    const lines = wrapped(value, size, bold, indent);
    const lineHeight = size * 0.3528 * 1.45;
    for (const line of lines) {
      reserve(lineHeight);
      doc.setFont('Paper', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += gap;
  }

  function divider() {
    reserve(7);
    doc.setDrawColor('#D7DFE8').setLineWidth(0.25).line(margin, y, margin + width, y);
    y += 7;
  }

  text('QUIQ / CHECKED TEST PAPER', { size: 9, bold: true, color: muted, gap: 3 });
  text(result.quizTitle, { size: 19, bold: true, gap: 4 });
  text(`Student: ${result.studentName}`, { size: 12, bold: true });
  text(`Student ID: ${result.studentId || '-'}   |   Section: ${result.studentSection || result.section || '-'}`);
  text(`Subject: ${result.subject || '-'}   |   Teacher: ${result.teacher || '-'}`);
  const submitted = new Date(result.submittedAt);
  text(`Quiz ID: ${result.quizId}   |   Attempt: ${result.attempt}`);
  text(`Submitted: ${Number.isNaN(submitted.getTime()) ? '-' : submitted.toLocaleString()}`, { size: 9, color: muted, gap: 4 });
  text(`FINAL SCORE: ${result.score} / ${result.totalScore}  (${result.percentage}%)`, { size: 16, bold: true, gap: 3 });
  text(`${result.passed ? 'PASSED' : 'FAILED'}   |   Passing mark: ${result.passingPercentage}%`, { bold: true });
  divider();
  const missingText = result.responses.some((response) => !response.questionText?.trim());
  if (missingText) text('Older result: some question text was not recorded. The saved answers and grades are shown below.', { size: 9, color: muted });
  const hasDisplayOrder = result.responses.every((response) => response.displayOrder && response.choiceOrder);
  text(hasDisplayOrder ? 'Questions and choices follow the student\'s displayed order. Selected choices are marked [X].' : 'Questions and answer letters use the original quiz order where display order was not recorded. Selected choices are marked [X].', { size: 9, color: muted, gap: 5 });

  paperResponses(result).forEach((response, index) => {
    const choices = paperChoices(response);
    const prompt = response.questionText?.trim() || '[Question text not recorded in this result]';
    const verdict = response.selectedAnswer === null ? 'UNANSWERED' : response.correct ? 'CORRECT' : 'INCORRECT';
    const color = response.correct ? '#17613D' : '#AA2835';
    const points = response.pointsPossible === undefined ? `${response.pointsAwarded} points awarded` : `${response.pointsAwarded} / ${response.pointsPossible} points`;
    const studentAnswer = `Student answer: ${paperAnswer(response, response.selectedAnswer)}`;
    const correctAnswer = `Correct answer: ${paperAnswer(response, response.correctAnswer)}`;
    const promptText = `${index + 1}. ${prompt}`;
    const estimatedHeight = wrapped(promptText, 11, true).length * 5.63 + 2
      + wrapped(`Question ID: ${response.questionId}`, 8).length * 4.1 + 2
      + choices.reduce((height, choice) => height + wrapped(`${choice.selected ? '[X]' : '[ ]'} ${choice.label}. ${choice.text}`, 10, choice.selected, 4).length * 5.12 + 1, 0)
      + wrapped(studentAnswer, 10, true).length * 5.12 + wrapped(correctAnswer, 10).length * 5.12 + 20;
    continuation = '';
    reserve(Math.min(estimatedHeight, 244));
    continuation = `Question ${index + 1} (continued)`;
    text(promptText, { size: 11, bold: true });
    text(`Question ID: ${response.questionId}`, { size: 8, color: muted });
    choices.forEach((choice) => text(`${choice.selected ? '[X]' : '[ ]'} ${choice.label}. ${choice.text}`, { indent: 4, bold: choice.selected, gap: 1 }));
    y += 2;
    text(studentAnswer, { bold: true });
    text(correctAnswer);
    reserve(9);
    doc.setDrawColor(color).setLineWidth(0.65);
    if (response.correct) {
      doc.line(margin + 0.4, y - 1.5, margin + 1.5, y - 0.2);
      doc.line(margin + 1.5, y - 0.2, margin + 4, y - 3.5);
    } else {
      doc.line(margin + 0.5, y - 3.2, margin + 3.5, y - 0.2);
      doc.line(margin + 3.5, y - 3.2, margin + 0.5, y - 0.2);
    }
    text(`${verdict}  |  ${points}`, { bold: true, color, indent: 7, gap: 4 });
    continuation = '';
    divider();
  });

  reserve(34);
  const correctCount = result.responses.filter((response) => response.correct).length;
  const unanswered = result.responses.filter((response) => response.selectedAnswer === null).length;
  text(`Correct: ${correctCount}   |   Incorrect: ${result.responses.length - correctCount - unanswered}   |   Unanswered: ${unanswered}`, { size: 10 });
  text(`Final score: ${result.score} / ${result.totalScore} (${result.percentage}%)`, { size: 13, bold: true });
  text(`Submission: ${result.submissionReason}   |   Recorded violations: ${result.violations.length}`, { size: 9, color: muted });
  text(`Result ID: ${result.resultId}`, { size: 8, color: muted });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor('#D7DFE8').setLineWidth(0.25).line(margin, 283, margin + width, 283);
    doc.setFont('Paper', 'normal').setFontSize(8).setTextColor(muted);
    doc.text('QUIQ | Checked student paper', margin, 289);
    doc.text(`Page ${page} of ${pageCount}`, margin + width, 289, { align: 'right' });
  }
  return doc;
}

export async function exportCheckedPaperPdf(result: QuizResult) {
  const fonts = await loadFonts();
  const doc = buildCheckedPaperPdf(result, fonts);
  await doc.save(checkedPaperFilename(result), { returnPromise: true });
}

import type { QuizResult, StudentResponse } from './quiz-types';

export function canExportCheckedPaper(result: QuizResult): boolean {
  return result.resultDataMode !== 'simple' && Array.isArray(result.responses) && result.responses.length > 0;
}

export function paperResponses(result: QuizResult) {
  // Older results use the original quiz order; keep their recorded answer mapping.
  const ordered = result.responses.every((response) => Number.isInteger(response.displayOrder) && response.displayOrder! > 0)
    && new Set(result.responses.map((response) => response.displayOrder)).size === result.responses.length;
  return ordered ? [...result.responses].sort((a, b) => a.displayOrder! - b.displayOrder!) : result.responses;
}

export function paperChoices(response: StudentResponse) {
  const choices = response.choices || [];
  const order = response.choiceOrder;
  const validOrder = order && order.length === choices.length && new Set(order).size === choices.length
    && order.every((index) => Number.isInteger(index) && index >= 0 && index < choices.length);
  return (validOrder ? order : choices.map((_, index) => index)).map((originalIndex, displayIndex) => ({
    label: String.fromCharCode(65 + displayIndex),
    text: choices[originalIndex],
    selected: response.selectedAnswer === originalIndex,
    correct: response.correctAnswer === originalIndex,
    originalIndex,
  }));
}

export function paperAnswer(response: StudentResponse, index: number | null) {
  if (index === null) return 'Unanswered';
  const choice = paperChoices(response).find((item) => item.originalIndex === index);
  return choice ? `${choice.label}. ${choice.text}` : String.fromCharCode(65 + index);
}

export function checkedPaperFilename(result: QuizResult) {
  const stem = `${result.studentName}_${result.quizId}_Attempt-${result.attempt}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 150);
  return `${stem || 'Student'}_checked-paper.pdf`;
}

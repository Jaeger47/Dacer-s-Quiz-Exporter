import type { QuizResult } from '@/lib/quiz-types';

export interface ItemAnalysisRow {
  questionId: string;
  total: number;
  correct: number;
  incorrect: number;
  percentCorrect: number;
  difficulty: 'Difficult' | 'Moderate' | 'Easy';
  mostSelected: string;
  distribution: Record<string, number>;
}

export function summarizeResults(results: QuizResult[]) {
  const scores = results.map((result) => result.percentage);
  return {
    students: new Set(results.map((result) => `${result.quizId}:${result.examCode || ''}:${result.studentId}`)).size,
    results: results.length,
    average: results.length ? scores.reduce((sum, score) => sum + score, 0) / results.length : 0,
    highest: results.length ? Math.max(...scores) : 0,
    lowest: results.length ? Math.min(...scores) : 0,
    passingRate: results.length ? (results.filter((result) => result.passed).length / results.length) * 100 : 0,
  };
}

export function analyzeItems(results: QuizResult[]): ItemAnalysisRow[] {
  const grouped = new Map<string, { correct: number; total: number; selections: Map<number, number> }>();
  results.forEach((result) =>
    result.responses.forEach((response) => {
      const row = grouped.get(response.questionId) || { correct: 0, total: 0, selections: new Map<number, number>() };
      row.total += 1;
      if (response.correct) row.correct += 1;
      if (response.selectedAnswer !== null) row.selections.set(response.selectedAnswer, (row.selections.get(response.selectedAnswer) || 0) + 1);
      grouped.set(response.questionId, row);
    }),
  );

  return Array.from(grouped.entries())
    .map(([questionId, row]) => {
      const percentCorrect = row.total ? (row.correct / row.total) * 100 : 0;
      const top = Array.from(row.selections.entries()).sort((a, b) => b[1] - a[1])[0];
      return {
        questionId,
        total: row.total,
        correct: row.correct,
        incorrect: row.total - row.correct,
        percentCorrect,
        difficulty: percentCorrect <= 30 ? 'Difficult' : percentCorrect <= 70 ? 'Moderate' : 'Easy',
        mostSelected: top ? String.fromCharCode(65 + top[0]) : '—',
        distribution: Object.fromEntries(Array.from(row.selections.entries()).map(([choice, count]) => [String.fromCharCode(65 + choice), count])),
      } as ItemAnalysisRow;
    })
    .sort((a, b) => a.questionId.localeCompare(b.questionId, undefined, { numeric: true }));
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function resultsCsv(results: QuizResult[], section?: string) {
  return toCsv([
    ['Quiz ID', 'Quiz Title', 'Subject', 'Section', 'Student ID', 'Student Name', 'Score', 'Total', 'Percentage', 'Passed', 'Attempt', 'Violations', 'Auto Submitted', 'Submission Reason', 'Started', 'Submitted', 'Result ID', 'Scanned At', 'Exam Code'],
    ...results.map((r) => [r.quizId, r.quizTitle, r.subject, section ?? r.studentSection, r.studentId, r.studentName, r.score, r.totalScore, r.percentage, r.passed, r.attempt,
      r.resultDataMode === 'compact' ? '' : r.violations.length, r.resultDataMode === 'compact' ? '' : r.autoSubmitted,
      r.resultDataMode === 'compact' ? '' : r.submissionReason, r.startedAt, r.resultDataMode === 'compact' ? '' : r.submittedAt, r.resultId, r.recordedAt || '', r.examCode || '']),
  ]);
}

export function responsesCsv(results: QuizResult[], section?: string) {
  const ids = Array.from(new Set(results.flatMap((r) => r.responses.map((response) => response.questionId)))).sort();
  return toCsv([
    ['Quiz ID', 'Section', 'Student ID', 'Student Name', 'Score', 'Total', ...ids, ...ids.map((id) => `${id}_Result`)],
    ...results.map((r) => {
      const map = new Map(r.responses.map((response) => [response.questionId, response]));
      return [r.quizId, section ?? r.studentSection, r.studentId, r.studentName, r.score, r.totalScore, ...ids.map((id) => {
        const answer = map.get(id)?.selectedAnswer;
        return answer === null || answer === undefined ? '' : String.fromCharCode(65 + answer);
      }), ...ids.map((id) => !map.has(id) ? '' : map.get(id)?.selectedAnswer === null ? 'Unanswered' : map.get(id)?.correct ? 'Correct' : 'Incorrect')];
    }),
  ]);
}

export function analysisCsv(results: QuizResult[], section = '') {
  return toCsv([
    ['Quiz ID', 'Section', 'Question ID', 'Total Responses', 'Correct', 'Incorrect', 'Percent Correct', 'Percent Incorrect', 'Difficulty', 'Most Selected Answer'],
    ...analyzeItems(results).map((row) => [results[0]?.quizId || '', section, row.questionId, row.total, row.correct, row.incorrect, row.percentCorrect.toFixed(1), (100 - row.percentCorrect).toFixed(1), row.difficulty, row.mostSelected]),
  ]);
}

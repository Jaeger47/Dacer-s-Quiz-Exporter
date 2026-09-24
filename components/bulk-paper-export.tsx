'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { canExportCheckedPaper } from '@/lib/result-paper';
import type { QuizResult } from '@/lib/quiz-types';

export function BulkPaperExport({ results }: { results: QuizResult[] }) {
  const [selected, setSelected] = useState('');
  const [section, setSection] = useState('');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const groupKey = (result: QuizResult) => JSON.stringify([result.quizId, result.examCode || '', result.examCode ? '' : result.studentSection || result.section || '']);
  const groups = [...new Map(results.map((result) => [groupKey(result), result])).entries()];
  const active = groups.some(([key]) => key === selected) ? selected : groups[0]?.[0];
  const batch = results.filter((result) => groupKey(result) === active);
  const papers = batch.filter(canExportCheckedPaper);
  const skipped = batch.length - papers.length;
  const needsSection = papers.some((result) => !result.studentSection?.trim() && !result.section?.trim());
  const incomplete = papers.filter((result) => result.responses.some((response) => !response.questionText?.trim() || !response.choices?.length)).length;

  async function download() {
    if (exporting || !papers.length || (needsSection && !section.trim())) return;
    setExporting(true);
    setError('');
    setMessage('Loading PDF fonts…');
    try {
      const { exportBulkCheckedPaperPdf } = await import('@/lib/export-result-pdf');
      await exportBulkCheckedPaperPdf(papers, section, (done, total) => setMessage(`Creating paper ${done} of ${total}…`));
      setMessage(`Downloaded ${papers.length} checked papers in one PDF.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Unable to export papers. Please try again.');
      setMessage('');
    } finally { setExporting(false); }
  }

  return <section className="mb-6 border border-border bg-card p-5" aria-label="Bulk checked papers">
    <h2 className="font-semibold">Bulk student test papers</h2>
    <p className="mt-1 text-sm text-muted-foreground">Download one combined A4 PDF with names, section, questions, selected answers, correct/incorrect marks, and final scores. Each paper starts on a new page.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="field-label"><span>PDF exam / student list</span><select className="native-control" disabled={exporting} value={active || ''} onChange={(event) => { setSelected(event.target.value); setSection(''); setMessage(''); setError(''); }}>
        {!groups.length && <option value="">No saved results</option>}
        {groups.map(([key, result]) => <option key={key} value={key}>{result.quizTitle} · {result.quizId}{result.examCode ? ` · ${result.examCode}` : ` · ${result.studentSection || result.section || 'No section'}`}</option>)}
      </select></label>
      <label className="field-label"><span>PDF section {needsSection ? '(required)' : '(optional override)'}</span><Input disabled={exporting} value={section} onChange={(event) => setSection(event.target.value)} placeholder="e.g. BSIT 2A" /></label>
    </div>
    <p className="mt-3 text-sm">{papers.length} eligible paper{papers.length === 1 ? '' : 's'} from all saved results in this exam group, including other result pages. Search and status filters do not limit this export.</p>
    <p className="mt-1 text-xs text-muted-foreground">Sorted by student number, then attempt. Section applies only to this PDF; saved records are unchanged. Large classes may take a moment.</p>
    {skipped > 0 && <p className="mt-2 text-sm text-amber-500">{skipped} result{skipped === 1 ? '' : 's'} excluded: Simple mode or no recorded answers.</p>}
    {incomplete > 0 && <p className="mt-2 text-sm text-amber-500">{incomplete} older paper{incomplete === 1 ? '' : 's'} may be missing question text or choices. Only recorded details can be printed.</p>}
    <Button className="mt-4" disabled={exporting || !papers.length || (needsSection && !section.trim())} onClick={download}><Download />{exporting ? 'Creating bulk PDF…' : 'Download all student PDFs'}</Button>
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
  </section>;
}

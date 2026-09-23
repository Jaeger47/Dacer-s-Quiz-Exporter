'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canExportCheckedPaper } from '@/lib/result-paper';
import type { QuizResult } from '@/lib/quiz-types';

export function CheckedPaperExport({ result }: { result: QuizResult }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  if (!canExportCheckedPaper(result)) return <p className="mt-5 text-sm text-muted-foreground">Checked paper PDF export is available for One-QR or Full-mode results with recorded answers.</p>;

  async function exportPaper() {
    setExporting(true);
    setError('');
    try {
      const { exportCheckedPaperPdf } = await import('@/lib/export-result-pdf');
      await exportCheckedPaperPdf(result);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export the checked paper. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return <section className="mt-5 border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="font-semibold">Checked test paper</h2><p className="mt-1 text-sm text-muted-foreground">Download questions, choices, checked answers, and the final score as an A4 PDF.</p></div>
      <Button onClick={exportPaper} disabled={exporting}><Download />{exporting ? 'Creating PDF…' : 'Export checked paper PDF'}</Button>
    </div>
    {result.responses.some((response) => !response.questionText?.trim()) && <p className="mt-3 text-xs text-muted-foreground">This older result does not include all question text. The PDF will show the available answers and grades. Export a new exam with One QR and a scanner setup, or use Full mode, for complete test papers.</p>}
    {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
  </section>;
}

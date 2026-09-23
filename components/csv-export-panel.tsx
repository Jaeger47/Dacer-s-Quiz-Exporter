'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resultsCsv, responsesCsv, analysisCsv } from '@/lib/analytics';
import type { QuizResult } from '@/lib/quiz-types';

export function CsvExportPanel({ results }: { results: QuizResult[] }) {
  const [selected, setSelected] = useState('');
  const [section, setSection] = useState('');
  const groupKey = (result: QuizResult) => JSON.stringify([result.quizId, result.examCode || '']);
  const groups = [...new Map(results.map((r) => [groupKey(r), r])).entries()];
  const active = groups.some(([key]) => key === selected) ? selected : groups[0]?.[0];
  const batch = results.filter((r) => groupKey(r) === active).sort((a, b) => a.studentId.localeCompare(b.studentId, undefined, { numeric: true }));
  const compact = batch.some((r) => r.resultDataMode === 'compact');
  const canExport = batch.length > 0 && (!compact || section.trim().length > 0);
  function exportCsv(kind: 'results' | 'responses' | 'analysis') {
    if (!canExport) return;
    const sectionValue = section.trim() || undefined;
    const content = kind === 'results' ? resultsCsv(batch, sectionValue) : kind === 'responses' ? responsesCsv(batch, sectionValue) : analysisCsv(batch, sectionValue);
    const filename = `${batch[0].quizId}_${sectionValue || 'ALL'}_${kind}.csv`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
    const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="mb-6 border border-border bg-card p-5">
    <h2 className="font-semibold">Export scanned class CSV</h2>
    <p className="mt-1 text-sm text-muted-foreground">After scanning the class, choose the exam and enter its section. Section is added to the exported file without changing saved results.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="field-label"><span>Exam / student list</span><select className="native-control" value={active || ''} onChange={(event) => { setSelected(event.target.value); setSection(''); }}>{!groups.length && <option value="">No saved results</option>}{groups.map(([key, result]) => <option key={key} value={key}>{result.quizTitle}{result.examCode ? ` · ${result.examCode}` : ''}</option>)}</select></label><label className="field-label"><span>Section {compact ? '(required)' : '(optional)'}</span><Input value={section} onChange={(event) => setSection(event.target.value)} placeholder="e.g. BSIT 2A" /></label></div>
    <p className="mt-3 text-sm">{batch.length} saved result{batch.length === 1 ? '' : 's'} in this export.</p>
    <div className="mt-3 flex flex-wrap gap-2"><Button disabled={!canExport} onClick={() => exportCsv('results')}>Export scores CSV</Button><Button variant="outline" disabled={!canExport} onClick={() => exportCsv('responses')}>Export answers CSV</Button><Button variant="outline" disabled={!canExport} onClick={() => exportCsv('analysis')}>Export item analysis CSV</Button></div>
  </section>;
}

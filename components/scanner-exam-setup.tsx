'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createScannerExam, parseScannerExam, type ScannerExam } from '@/lib/compact-qr';
import type { QuizResult } from '@/lib/quiz-types';

export function ScannerExamSetup({ exam, results, onLoad }: { exam?: ScannerExam; results: QuizResult[]; onLoad: (exam: ScannerExam) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load(file?: File, fromMaker = false) {
    setBusy(true); setError('');
    try {
      if (fromMaker) {
        const draft = JSON.parse(localStorage.getItem('quiq-admin-draft-v1') || 'null');
        if (!draft) throw new Error('No maker draft on this device. Load a scanner setup file instead.');
        onLoad(await createScannerExam(draft));
      } else if (file) onLoad(await parseScannerExam(JSON.parse(await file.text())));
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  const scanned = new Set(results.filter((r) => r.resultDataMode === 'compact' && r.examCode === exam?.code).map((r) => r.studentId));
  return <section className="mx-auto mb-6 max-w-4xl border border-primary/40 bg-card p-5">
    <h2 className="font-semibold">One-QR exam setup</h2>
    <p className="mt-1 text-sm text-muted-foreground">Load the matching student list and answer key before scanning. Section is added later in More → Export CSV.</p>
    <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>Load scanner setup</Button><Button variant="outline" disabled={busy} onClick={() => load(undefined, true)}>Use maker draft on this device</Button></div>
    <input ref={input} hidden type="file" accept=".json,application/json" onChange={(event) => load(event.target.files?.[0])} />
    {exam ? <div className="mt-4 text-sm"><strong>{exam.quizTitle}</strong><p>{exam.questions.length} questions · {scanned.size} / {exam.students.length} students recorded · Exam code <span className="font-mono">{exam.code}</span></p><details className="mt-3"><summary className="cursor-pointer">View student list and scan status</summary><ul className="mt-2 max-h-52 overflow-auto">{exam.students.map((student) => <li key={student.number} className="py-1">{student.number} — {student.name} · {scanned.has(student.number) ? 'Saved' : 'Not scanned'}</li>)}</ul></details></div> : <p className="mt-3 text-sm text-muted-foreground">No one-QR setup loaded. Export it from Quiz Creator → Students / One QR.</p>}
    {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
  </section>;
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createScannerExam, SCANNER_EXAM_KEY } from '@/lib/compact-qr';
import type { Quiz } from '@/lib/quiz-types';

export function StudentRoster({ quiz, onChange }: { quiz: Quiz; onChange: (quiz: Quiz) => void }) {
  const [names, setNames] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const students = quiz.students || [];
  function addNames() {
    const lines = names.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    if (students.length + lines.length > 99) { setMessage('Use a maximum of 99 students per exam roster.'); return; }
    const used = new Set(students.map((student) => student.number));
    const added = lines.map((name) => {
      let next = 1;
      while (used.has(String(next).padStart(2, '0'))) next++;
      const number = String(next).padStart(2, '0');
      used.add(number);
      return { number, name };
    });
    onChange({ ...quiz, students: [...students, ...added], settings: { ...quiz.settings, resultDataMode: 'compact', allowedAttempts: 1, requireSection: false } });
    setNames('');
    setMessage('Student list saved. One-QR mode is enabled.');
  }
  async function exportSetup() {
    setBusy(true);
    try {
      const exam = await createScannerExam(quiz);
      localStorage.setItem(SCANNER_EXAM_KEY, JSON.stringify(exam));
      const url = URL.createObjectURL(new Blob([JSON.stringify(exam, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quiz.quizId.replace(/[^a-z0-9_-]/gi, '-')}.scanner.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Scanner setup ${exam.code} downloaded and saved on this device. Load it on your scanning phone.`);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <section className="border border-border bg-card p-5">
      <h2 className="font-semibold">Student list / One QR per result</h2>
      <p className="mt-2 text-sm text-muted-foreground">Paste one student name per line. Each receives a permanent roster number from 01 to 99. Students search and select their name before starting.</p>
      <Textarea aria-label="Student names, one per line" className="mt-4 min-h-36" value={names} onChange={(event) => setNames(event.target.value)} placeholder={'Maria Santos\nJuan Dela Cruz'} />
      <div className="mt-3 flex flex-wrap gap-2"><Button onClick={addNames} disabled={!names.trim()}>Add names</Button><Button variant="outline" onClick={() => onChange({ ...quiz, settings: { ...quiz.settings, resultDataMode: 'compact', allowedAttempts: 1, requireSection: false } })}>Use one-QR mode</Button><Button variant="outline" disabled={busy || !students.length} onClick={exportSetup}>{busy ? 'Preparing…' : 'Export scanner setup'}</Button></div>
      <p className="mt-3 text-xs text-muted-foreground">1. Add names and finish the answer key. 2. Export the student exam and matching scanner setup. 3. Load the setup in Scanner. Section is entered only when exporting CSV. The scanner setup contains the answer key; keep it with the teacher.</p>
      <p className="mt-2 text-xs text-muted-foreground">Changing the roster, questions, or grading requires exporting both files again. One-QR mode supports 200 questions and one final result per student. Detailed security events and exam timing stay on the student's device.</p>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
    <section className="border border-border bg-card p-5"><h2 className="mb-4 font-semibold">{students.length} students</h2>
      <div className="space-y-2">{students.map((student, index) => <div key={student.number} className="flex items-center gap-3"><span className="w-8 font-mono">{student.number}</span><Input aria-label={`Student ${student.number} name`} value={student.name} onChange={(event) => onChange({ ...quiz, students: students.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} /><Button variant="outline" onClick={() => { if (confirm(`Remove ${student.number} - ${student.name}? Re-export the exam and setup after changing the roster.`)) onChange({ ...quiz, students: students.filter((_, i) => i !== index) }); }}>Remove</Button></div>)}</div>
    </section>
  </div>;
}

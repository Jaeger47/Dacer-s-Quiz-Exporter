'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Eye,
  FileJson,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import qrLibrarySource from '../node_modules/qrcode-generator/dist/qrcode.js?raw';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { generateStudentQuizHtml } from '@/lib/export-student';
import {
  createQuestion,
  sampleQuiz,
  totalPoints,
  validateQuiz,
  type QuestionType,
  type Quiz,
  type QuizQuestion,
} from '@/lib/quiz-types';

type Section = 'information' | 'questions' | 'settings' | 'security' | 'preview' | 'export';

const DRAFT_KEY = 'quiq-admin-draft-v1';

const sections: { id: Section; label: string; icon: typeof BookOpenText }[] = [
  { id: 'information', label: 'Quiz information', icon: BookOpenText },
  { id: 'questions', label: 'Questions', icon: CheckCircle2 },
  { id: 'settings', label: 'Quiz settings', icon: Settings2 },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'preview', label: 'Preview', icon: LayoutDashboard },
  { id: 'export', label: 'Import & export', icon: FileJson },
];

function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return (value || 'quiz').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toUpperCase();
}

function SettingRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

export function AdminApp() {
  const [quiz, setQuiz] = useState<Quiz>(sampleQuiz);
  const [section, setSection] = useState<Section>('information');
  const [notice, setNotice] = useState('Draft ready');
  const [importError, setImportError] = useState<string[]>([]);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (!draft) return;
    try {
      const parsed = JSON.parse(draft);
      if (parsed?.settings && typeof parsed.settings.resetPassword !== 'string') {
        parsed.settings.resetPassword = sampleQuiz.settings.resetPassword;
      }
      const validation = validateQuiz(parsed);
      if (validation.valid && validation.quiz) {
        setQuiz(validation.quiz);
        setNotice('Local draft restored');
      }
    } catch {
      setNotice('Started a fresh draft');
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(quiz));
      setNotice(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [quiz]);

  const points = useMemo(() => totalPoints(quiz), [quiz]);
  const updateQuiz = <K extends keyof Quiz>(key: K, value: Quiz[K]) => setQuiz((current) => ({ ...current, [key]: value }));
  const updateSetting = <K extends keyof Quiz['settings']>(key: K, value: Quiz['settings'][K]) => setQuiz((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  const updateSecurity = <K extends keyof Quiz['security']>(key: K, value: Quiz['security'][K]) => setQuiz((current) => ({ ...current, security: { ...current.security, [key]: value } }));

  function updateQuestion(index: number, patch: Partial<QuizQuestion>) {
    setQuiz((current) => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) }));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= quiz.questions.length) return;
    setQuiz((current) => {
      const questions = [...current.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...current, questions };
    });
  }

  function addQuestion(type: QuestionType = 'multiple-choice') {
    setQuiz((current) => ({ ...current, questions: [...current.questions, createQuestion(current.questions.length + 1, type)] }));
    setSection('questions');
  }

  function duplicateQuestion(index: number) {
    setQuiz((current) => {
      const questions = [...current.questions];
      const source = questions[index];
      questions.splice(index + 1, 0, { ...source, id: `${source.id}-COPY-${Math.random().toString(36).slice(2, 5).toUpperCase()}`, choices: [...source.choices] });
      return { ...current, questions };
    });
  }

  function deleteQuestion(index: number) {
    if (!window.confirm(`Delete Question ${index + 1}? This cannot be undone.`)) return;
    setQuiz((current) => ({ ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }));
  }

  function changeType(index: number, type: QuestionType) {
    updateQuestion(index, { type, choices: type === 'true-false' ? ['True', 'False'] : ['', '', '', ''], answer: 0 });
  }

  function exportJson() {
    download(JSON.stringify(quiz, null, 2), `${safeFilename(quiz.quizId)}.json`, 'application/json');
    setNotice('Quiz JSON downloaded');
  }

  async function exportStudentQuiz() {
    const validation = validateQuiz(quiz);
    if (!validation.valid) {
      setImportError(validation.errors);
      setSection('export');
      return;
    }
    setNotice('Protecting standalone quiz…');
    try {
      const html = await generateStudentQuizHtml(quiz, qrLibrarySource);
      download(html, `${safeFilename(quiz.quizId)}.html`, 'text/html');
      setNotice('Protected student quiz downloaded');
    } catch {
      setImportError(['The student quiz could not be protected and exported. Try again in a modern browser.']);
      setSection('export');
      setNotice('Export failed');
    }
  }

  function importJson(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const validation = validateQuiz(JSON.parse(String(reader.result)));
        if (!validation.valid || !validation.quiz) {
          setImportError(validation.errors);
          return;
        }
        setQuiz(validation.quiz);
        setImportError([]);
        setNotice('Quiz imported successfully');
        setSection('information');
      } catch {
        setImportError(['The selected file is not valid JSON.']);
      }
    };
    reader.onerror = () => setImportError(['The file could not be read.']);
    reader.readAsText(file);
  }

  const activeIndex = sections.findIndex((item) => item.id === section);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 lg:px-8">
          <button type="button" onClick={() => setSection('information')} className="flex items-center gap-3 text-left">
            <span className="grid size-9 place-items-center border border-primary/40 bg-primary/10 text-primary"><QrCode className="size-5" /></span>
            <span><span className="block font-semibold leading-none tracking-tight">QUIQ OFFLINE</span><span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Classroom exam system</span></span>
          </button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden h-7 gap-1.5 rounded-sm border-emerald-800/60 bg-emerald-950/50 px-2.5 text-emerald-300 sm:flex"><span className="size-1.5 rounded-full bg-emerald-400" /> Offline ready</Badge>
            <Link href="/scanner" className={buttonVariants({ variant: 'outline', className: 'h-10 px-3 text-muted-foreground' })}><QrCode /> Scanner</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-sidebar px-4 py-5 lg:min-h-[calc(100vh-65px)] lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
          <div className="mb-6 px-2"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Create quiz</p><p className="mt-1 text-sm text-sidebar-foreground">{quiz.questions.length} questions · {points} points</p></div>
          <nav aria-label="Quiz creation sections" className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {sections.map((item, index) => {
              const Icon = item.icon;
              const active = item.id === section;
              return (
                <button key={item.id} type="button" onClick={() => { setSection(item.id); setImportError([]); }} className={`group flex min-w-max items-center gap-3 border px-3 py-3 text-left text-sm transition-colors lg:w-full ${active ? 'border-sidebar-primary/40 bg-sidebar-accent text-sidebar-foreground' : 'border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'}`}>
                  <span className={`grid size-7 place-items-center border text-xs ${active ? 'border-primary/50 text-primary' : 'border-sidebar-border'}`}>{index + 1}</span><Icon className="size-4 lg:hidden" /><span className="flex-1">{item.label}</span>{item.id === 'questions' ? <Badge variant="secondary" className="rounded-sm">{quiz.questions.length}</Badge> : null}<ChevronRight className="hidden size-4 text-muted-foreground lg:block" />
                </button>
              );
            })}
          </nav>
          <div className="mt-7 hidden border border-border bg-card/40 p-4 lg:block"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-4 text-primary" /><div><p className="text-sm font-medium">Saved on this device</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{notice}. Student data is never uploaded.</p></div></div></div>
        </aside>

        <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9 xl:px-14">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-7 md:flex-row md:items-end">
              <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><span>Step {activeIndex + 1} of 6</span><span className="h-px w-8 bg-primary/50" /> {sections[activeIndex].label}</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{section === 'information' ? 'Build your classroom quiz' : sections[activeIndex].label}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{section === 'questions' ? 'Every question keeps an immutable ID, even when question order is randomized.' : section === 'security' ? 'Security checks are transparent deterrents and do not claim tamper-proof examination.' : 'Create, review, and package a complete offline examination.'}</p></div>
              <Button onClick={exportStudentQuiz} className="h-11 px-4"><Download /> Export student quiz</Button>
            </div>

            {section === 'information' && <InformationSection quiz={quiz} updateQuiz={updateQuiz} points={points} onContinue={() => setSection('questions')} notice={notice} />}
            {section === 'questions' && <QuestionsSection quiz={quiz} updateQuestion={updateQuestion} addQuestion={addQuestion} duplicateQuestion={duplicateQuestion} deleteQuestion={deleteQuestion} moveQuestion={moveQuestion} changeType={changeType} onContinue={() => setSection('settings')} />}
            {section === 'settings' && <SettingsSection quiz={quiz} updateSetting={updateSetting} onContinue={() => setSection('security')} />}
            {section === 'security' && <SecuritySection quiz={quiz} updateSecurity={updateSecurity} onContinue={() => setSection('preview')} />}
            {section === 'preview' && <PreviewSection quiz={quiz} points={points} onContinue={() => setSection('export')} />}
            {section === 'export' && <ExportSection quiz={quiz} errors={importError} exportJson={exportJson} exportStudentQuiz={exportStudentQuiz} importRef={importRef} importJson={importJson} setQuiz={setQuiz} setNotice={setNotice} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function InformationSection({ quiz, updateQuiz, points, onContinue, notice }: { quiz: Quiz; updateQuiz: <K extends keyof Quiz>(key: K, value: Quiz[K]) => void; points: number; onContinue: () => void; notice: string }) {
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><form className="border border-border bg-card p-5 sm:p-7" onSubmit={(event) => { event.preventDefault(); onContinue(); }}><div className="mb-6 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Quiz details</h2><p className="mt-1 text-sm text-muted-foreground">Identify this exam across student files and scanned results.</p></div><Badge variant="secondary" className="rounded-sm px-2.5">Draft</Badge></div><div className="grid gap-5 sm:grid-cols-2"><label className="field-label sm:col-span-2"><span>Quiz ID</span><Input className="field-control font-mono uppercase" value={quiz.quizId} onChange={(e) => updateQuiz('quizId', e.target.value)} /><small>Used to match results and prevent duplicates.</small></label><label className="field-label sm:col-span-2"><span>Quiz title</span><Input className="field-control" value={quiz.quizTitle} onChange={(e) => updateQuiz('quizTitle', e.target.value)} /></label><label className="field-label"><span>Subject</span><Input className="field-control" value={quiz.subject} onChange={(e) => updateQuiz('subject', e.target.value)} /></label><label className="field-label"><span>Section</span><Input className="field-control" value={quiz.section} onChange={(e) => updateQuiz('section', e.target.value)} /></label><label className="field-label sm:col-span-2"><span>Teacher name</span><Input className="field-control" value={quiz.teacher} onChange={(e) => updateQuiz('teacher', e.target.value)} /></label><label className="field-label sm:col-span-2"><span>Instructions</span><Textarea className="field-control min-h-28 resize-y" value={quiz.instructions} onChange={(e) => updateQuiz('instructions', e.target.value)} /></label></div><div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-emerald-400" /> {notice}</p><Button type="submit" className="h-10 px-4">Save & continue <ChevronRight /></Button></div></form><Summary quiz={quiz} points={points} /></div>;
}

function Summary({ quiz, points }: { quiz: Quiz; points: number }) {
  return <div className="space-y-5"><section className="border border-border bg-card p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quiz summary</p><dl className="mt-5 grid grid-cols-2 gap-px border border-border bg-border"><div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Questions</dt><dd className="mt-1 text-2xl font-semibold">{quiz.questions.length}</dd></div><div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Total points</dt><dd className="mt-1 text-2xl font-semibold">{points}</dd></div><div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Duration</dt><dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold"><Clock3 className="size-4 text-primary" />{quiz.settings.durationMinutes} min</dd></div><div className="bg-card p-4"><dt className="text-xs text-muted-foreground">Passing</dt><dd className="mt-1 text-sm font-semibold">{quiz.settings.passingPercentage}%</dd></div></dl></section><section className="border border-primary/30 bg-primary/[0.06] p-5"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center border border-primary/40 bg-primary/10 text-primary"><QrCode className="size-4" /></span><div><h2 className="text-sm font-semibold">Portable by design</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The exported quiz is one HTML file with its answer key, timer, security checks, scoring, and QR generator included.</p></div></div></section></div>;
}

function QuestionsSection({ quiz, updateQuestion, addQuestion, duplicateQuestion, deleteQuestion, moveQuestion, changeType, onContinue }: { quiz: Quiz; updateQuestion: (index: number, patch: Partial<QuizQuestion>) => void; addQuestion: (type?: QuestionType) => void; duplicateQuestion: (index: number) => void; deleteQuestion: (index: number) => void; moveQuestion: (index: number, direction: -1 | 1) => void; changeType: (index: number, type: QuestionType) => void; onContinue: () => void }) {
  return <div className="space-y-5">{quiz.questions.length === 0 ? <div className="border border-dashed border-border p-10 text-center"><BookOpenText className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No questions yet</h2><p className="mt-2 text-sm text-muted-foreground">Add the first item to begin building this quiz.</p></div> : quiz.questions.map((question, index) => <article key={question.id} className="border border-border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:px-5"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center border border-primary/40 font-mono text-xs text-primary">{index + 1}</span><div><h2 className="text-sm font-semibold">Question {index + 1}</h2><p className="font-mono text-[10px] text-muted-foreground">{question.id}</p></div></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => moveQuestion(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon" aria-label="Move down" disabled={index === quiz.questions.length - 1} onClick={() => moveQuestion(index, 1)}><ArrowDown /></Button><Button variant="ghost" size="icon" aria-label="Duplicate question" onClick={() => duplicateQuestion(index)}><Copy /></Button><Button variant="destructive" size="icon" aria-label="Delete question" onClick={() => deleteQuestion(index)}><Trash2 /></Button></div></header><div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_190px]"><div className="space-y-5"><label className="field-label"><span>Question text</span><Textarea className="field-control min-h-24" value={question.question} onChange={(event) => updateQuestion(index, { question: event.target.value })} /></label><fieldset><legend className="mb-2 text-sm font-medium">Choices · select the correct answer</legend><div className="space-y-2">{question.choices.map((choice, choiceIndex) => <div key={choiceIndex} className="grid grid-cols-[32px_minmax(0,1fr)_36px] items-center gap-2"><input type="radio" name={`correct-${question.id}`} aria-label={`Mark choice ${choiceIndex + 1} correct`} checked={question.answer === choiceIndex} onChange={() => updateQuestion(index, { answer: choiceIndex })} className="size-4 accent-[var(--primary)]" /><Input className="field-control" value={choice} disabled={question.type === 'true-false'} aria-label={`Choice ${choiceIndex + 1}`} onChange={(event) => updateQuestion(index, { choices: question.choices.map((item, itemIndex) => itemIndex === choiceIndex ? event.target.value : item) })} /><Button variant="ghost" size="icon" aria-label={`Remove choice ${choiceIndex + 1}`} disabled={question.type === 'true-false' || question.choices.length <= 2} onClick={() => { const choices = question.choices.filter((_, itemIndex) => itemIndex !== choiceIndex); updateQuestion(index, { choices, answer: Math.min(question.answer, choices.length - 1) }); }}><Trash2 /></Button></div>)}</div>{question.type === 'multiple-choice' && question.choices.length < 8 ? <Button variant="ghost" className="mt-3" onClick={() => updateQuestion(index, { choices: [...question.choices, ''] })}><Plus /> Add choice</Button> : null}</fieldset></div><div className="space-y-4"><label className="field-label"><span>Question type</span><select className="native-control" value={question.type} onChange={(event) => changeType(index, event.target.value as QuestionType)}><option value="multiple-choice">Multiple choice</option><option value="true-false">True or false</option></select></label><label className="field-label"><span>Points</span><Input type="number" min={1} step={1} className="field-control" value={question.points} onChange={(event) => updateQuestion(index, { points: Math.max(1, Number(event.target.value)) })} /></label></div></div></article>)}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><div className="flex gap-2"><Button variant="outline" onClick={() => addQuestion('multiple-choice')}><Plus /> Multiple choice</Button><Button variant="outline" onClick={() => addQuestion('true-false')}><Plus /> True / false</Button></div><Button onClick={onContinue}>Continue to settings <ChevronRight /></Button></div></div>;
}

function SettingsSection({ quiz, updateSetting, onContinue }: { quiz: Quiz; updateSetting: <K extends keyof Quiz['settings']>(key: K, value: Quiz['settings'][K]) => void; onContinue: () => void }) {
  const toggles: [keyof Quiz['settings'], string, string][] = [['randomizeQuestions', 'Randomize questions', 'Create a fresh question order for each attempt.'], ['randomizeChoices', 'Randomize choices', 'Shuffle displayed choices while preserving their original answer mapping.'], ['requireName', 'Require student name', 'Students cannot begin without entering a name.'], ['requireStudentId', 'Require student ID', 'Used with Quiz ID to track attempt limits.'], ['requireSection', 'Require section', 'Collect the student’s class section before starting.'], ['showScore', 'Show score after submission', 'Display points earned on the result screen.'], ['showPercentage', 'Show percentage', 'Display the calculated result percentage.'], ['showCorrectAnswers', 'Show correct answers', 'Reveal the answer key after submission.'], ['showReview', 'Show answer review', 'Allow students to review locked responses after submission.'], ['autoSubmitOnTimeout', 'Submit when time ends', 'Lock and score answers when the countdown reaches zero.'], ['resumeAfterRefresh', 'Resume after refresh', 'Restore answers and preserve the original end timestamp.']];
  return <div className="grid gap-6 lg:grid-cols-2"><section className="border border-border bg-card p-5 sm:p-7"><h2 className="font-semibold">Timing & scoring</h2><p className="mt-1 text-sm text-muted-foreground">Core rules applied inside the exported quiz.</p><div className="mt-6 grid gap-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3"><label className="field-label"><span>Duration (minutes)</span><Input type="number" min={1} className="field-control" value={quiz.settings.durationMinutes} onChange={(e) => updateSetting('durationMinutes', Math.max(1, Number(e.target.value)))} /></label><label className="field-label"><span>Allowed attempts</span><Input type="number" min={1} className="field-control" value={quiz.settings.allowedAttempts} onChange={(e) => updateSetting('allowedAttempts', Math.max(1, Number(e.target.value)))} /><small>Set this to 1 to block students after their first submission.</small></label><label className="field-label"><span>Passing percentage</span><Input type="number" min={0} max={100} className="field-control" value={quiz.settings.passingPercentage} onChange={(e) => updateSetting('passingPercentage', Math.min(100, Math.max(0, Number(e.target.value))))} /></label></div><label className="field-label mt-6"><span>Teacher reset password</span><Input type="password" autoComplete="new-password" className="field-control" value={quiz.settings.resetPassword || ''} onChange={(e) => updateSetting('resetPassword', e.target.value)} placeholder="Enter a teacher-only password" /><small>Required in the exported quiz before attempts, saved progress, and the submitted result can be cleared. Use at least 4 characters.</small></label></section><section className="border border-border bg-card p-5 sm:p-7"><h2 className="font-semibold">Student experience</h2><div className="mt-3">{toggles.map(([key, label, description]) => <SettingRow key={key} label={label} description={description} checked={Boolean(quiz.settings[key])} onChange={(value) => updateSetting(key as never, value as never)} />)}</div><div className="mt-5 flex justify-end"><Button onClick={onContinue}>Continue to security <ChevronRight /></Button></div></section></div>;
}

function SecuritySection({ quiz, updateSecurity, onContinue }: { quiz: Quiz; updateSecurity: <K extends keyof Quiz['security']>(key: K, value: Quiz['security'][K]) => void; onContinue: () => void }) {
  const toggles: [keyof Quiz['security'], string, string][] = [['requireFullscreen', 'Require fullscreen', 'The timer begins after fullscreen starts.'], ['detectTabSwitch', 'Detect tab switching', 'Records a single visibility-change incident.'], ['detectFocusLoss', 'Detect window focus loss', 'Records focus loss when it is not the same tab-switch incident.'], ['detectFullscreenExit', 'Detect fullscreen exit', 'Records leaving fullscreen during the examination.'], ['detectCopy', 'Detect copy', 'Blocks copying and records the attempt.'], ['detectPaste', 'Detect paste', 'Blocks pasting and records the attempt.'], ['disableRightClick', 'Disable right click', 'Prevents the standard context menu.'], ['disableTextSelection', 'Disable text selection', 'Prevents selecting quiz text.'], ['detectPageExit', 'Detect page exit attempt', 'Warns before closing an in-progress attempt.']];
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"><section className="border border-border bg-card p-5 sm:p-7"><div className="flex items-center justify-between gap-4 border-b border-border pb-5"><div><h2 className="font-semibold">Quiz security mode</h2><p className="mt-1 text-sm text-muted-foreground">Optional browser-side monitoring and deterrence.</p></div><Switch checked={quiz.security.enabled} onCheckedChange={(value) => updateSecurity('enabled', value)} aria-label="Security mode" /></div><div className={quiz.security.enabled ? '' : 'pointer-events-none opacity-40'}>{toggles.map(([key, label, description]) => <SettingRow key={key} label={label} description={description} checked={Boolean(quiz.security[key])} onChange={(value) => updateSecurity(key as never, value as never)} />)}</div></section><aside className="space-y-5"><section className="border border-border bg-card p-5"><h2 className="font-semibold">Violation response</h2><label className="field-label mt-5"><span>Maximum violations</span><Input type="number" min={1} max={20} className="field-control" value={quiz.security.maximumViolations} onChange={(e) => updateSecurity('maximumViolations', Math.max(1, Number(e.target.value)))} /></label><div className="mt-5 border border-destructive/40 bg-destructive/10 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-destructive">When the limit is reached</p><p className="mt-2 text-sm font-semibold">End and submit the quiz immediately</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Answers are locked, the result is calculated, and the submission reason is recorded as security-limit.</p></div></section><section className="border-l-2 border-amber-400 bg-amber-500/10 p-5"><h2 className="text-sm font-semibold text-amber-200">Security limitation</h2><p className="mt-2 text-xs leading-relaxed text-amber-100/70">Browser checks and QR checks provide integrity checking and tamper deterrence. A standalone file cannot guarantee secret-key authenticity because students can inspect its source.</p></section><Button className="w-full" onClick={onContinue}>Preview student quiz <Eye /></Button></aside></div>;
}

function PreviewSection({ quiz, points, onContinue }: { quiz: Quiz; points: number; onContinue: () => void }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><section className="overflow-hidden border border-border bg-[#101a28]"><header className="flex items-center justify-between border-b border-[#2a3a4e] px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#7bc1ff]">Student preview</p><p className="mt-1 text-sm font-medium text-white">{quiz.subject} · {quiz.section}</p></div><Badge className="rounded-sm bg-[#17314a] text-[#9ed3ff]">Offline HTML</Badge></header><div className="grid gap-6 p-5 md:grid-cols-[1.05fr_.95fr] md:p-8"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#7bc1ff]">Offline classroom exam</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">{quiz.quizTitle || 'Untitled quiz'}</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-[#9dacc0]">{quiz.instructions || 'Quiz instructions will appear here.'}</p><dl className="mt-6 grid grid-cols-2 gap-px border border-[#2a3a4e] bg-[#2a3a4e] text-sm"><div className="bg-[#151f2d] p-4"><dt className="text-xs text-[#9dacc0]">Questions</dt><dd className="mt-1 font-semibold text-white">{quiz.questions.length}</dd></div><div className="bg-[#151f2d] p-4"><dt className="text-xs text-[#9dacc0]">Points</dt><dd className="mt-1 font-semibold text-white">{points}</dd></div><div className="bg-[#151f2d] p-4"><dt className="text-xs text-[#9dacc0]">Duration</dt><dd className="mt-1 font-semibold text-white">{quiz.settings.durationMinutes} min</dd></div><div className="bg-[#151f2d] p-4"><dt className="text-xs text-[#9dacc0]">Attempts</dt><dd className="mt-1 font-semibold text-white">{quiz.settings.allowedAttempts}</dd></div></dl></div><form className="border border-[#2a3a4e] bg-[#151f2d] p-5" onSubmit={(e) => e.preventDefault()}><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#7bc1ff]">Student information</p><h3 className="mt-2 font-semibold text-white">Before you begin</h3><div className="mt-5 space-y-4">{quiz.settings.requireName && <label className="grid gap-2 text-xs font-semibold text-white">Student name<input disabled className="h-10 border border-[#33485e] bg-[#111a27] px-3" /></label>}{quiz.settings.requireStudentId && <label className="grid gap-2 text-xs font-semibold text-white">Student ID<input disabled className="h-10 border border-[#33485e] bg-[#111a27] px-3" /></label>}{quiz.settings.requireSection && <label className="grid gap-2 text-xs font-semibold text-white">Section<input disabled className="h-10 border border-[#33485e] bg-[#111a27] px-3" value={quiz.section} readOnly /></label>}<button disabled className="h-11 w-full bg-[#7bc1ff] font-semibold text-[#07111d]">Review information</button></div></form></div></section><aside className="space-y-5"><section className="border border-border bg-card p-5"><h2 className="font-semibold">What is included</h2><ul className="mt-4 space-y-3 text-sm text-muted-foreground">{['Timer with absolute end time', 'Answer autosave and resume', 'Attempt limits by student ID', 'Question and choice randomization', 'Security event monitoring', 'Scoring and multi-part result QR'].map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />{item}</li>)}</ul></section><Button className="w-full" onClick={onContinue}>Continue to export <ChevronRight /></Button></aside></div>;
}

function ExportSection({ quiz, errors, exportJson, exportStudentQuiz, importRef, importJson, setQuiz, setNotice }: { quiz: Quiz; errors: string[]; exportJson: () => void; exportStudentQuiz: () => void | Promise<void>; importRef: React.RefObject<HTMLInputElement | null>; importJson: (file?: File) => void; setQuiz: React.Dispatch<React.SetStateAction<Quiz>>; setNotice: (notice: string) => void }) {
  return <div className="grid gap-6 lg:grid-cols-2"><section className="border border-border bg-card p-5 sm:p-7"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center border border-primary/40 bg-primary/10 text-primary"><Download /></span><div><h2 className="font-semibold">Export student quiz</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Download one standalone HTML file. Students can double-click it and complete the exam without a server or internet connection.</p></div></div><div className="mt-6 border border-border bg-background/40 p-4"><p className="font-mono text-sm">{safeFilename(quiz.quizId)}.html</p><p className="mt-1 text-xs text-muted-foreground">Questions, answer key, timer, attempt controls, security checks, scoring, and QR generation are embedded.</p></div><Button className="mt-5 h-11 w-full" onClick={exportStudentQuiz}><Download /> Export standalone quiz</Button></section><section className="border border-border bg-card p-5 sm:p-7"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center border border-border bg-muted/40 text-muted-foreground"><FileJson /></span><div><h2 className="font-semibold">Quiz JSON</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Move editable quiz data between teacher devices or keep a separate source backup.</p></div></div><div className="mt-6 grid gap-2 sm:grid-cols-2"><Button variant="outline" className="h-11" onClick={exportJson}><Download /> Export JSON</Button><Button variant="outline" className="h-11" onClick={() => importRef.current?.click()}><Upload /> Import JSON</Button></div><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} /></section>{errors.length > 0 && <section className="border-l-2 border-destructive bg-destructive/10 p-5 lg:col-span-2" role="alert"><h2 className="font-semibold text-destructive">Unable to export quiz</h2><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-destructive/90">{errors.map((error) => <li key={error}>{error}</li>)}</ul></section>}<section className="border border-border bg-card p-5 sm:p-7 lg:col-span-2"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Draft management</h2><p className="mt-1 text-sm text-muted-foreground">The current quiz saves automatically in this browser.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(quiz)); setNotice('Draft saved manually'); }}><Save /> Save draft</Button><Button variant="outline" onClick={() => { const saved = localStorage.getItem(DRAFT_KEY); if (saved) { const validation = validateQuiz(JSON.parse(saved)); if (validation.quiz) setQuiz(validation.quiz); } }}><RotateCcw /> Load draft</Button><Button variant="destructive" onClick={() => { if (confirm('Delete the locally saved draft?')) { localStorage.removeItem(DRAFT_KEY); setQuiz(sampleQuiz); setNotice('Draft deleted'); } }}><Trash2 /> Delete draft</Button></div></div></section></div>;
}

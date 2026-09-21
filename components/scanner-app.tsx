'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import {
  ArchiveRestore,
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  Flashlight,
  ListFilter,
  MoreHorizontal,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { CheckedPaperExport } from '@/components/checked-paper-export';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { analyzeItems, analysisCsv, responsesCsv, resultsCsv, summarizeResults } from '@/lib/analytics';
import { clearAllResults, deleteResult, exportDatabase, findSecondaryDuplicate, getResults, restoreDatabase, saveResult } from '@/lib/database';
import type { QrEnvelope, QuizResult } from '@/lib/quiz-types';

type ScannerTab = 'scan' | 'results' | 'analysis' | 'more';
type PartialScan = { totalParts: number; encoding: QrEnvelope['encoding']; checksum: string; chunks: Record<number, string> };
type ScanMode = 'simple' | 'complete';
const DEFAULT_CAMERA_KEY = 'quiq-scanner-default-camera';
const SCAN_MODE_KEY = 'quiq-scanner-result-mode';

function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileStem(result?: QuizResult) {
  return `${result?.quizId || 'QUIQ'}_${result?.studentSection || 'ALL'}`.replace(/[^a-z0-9_-]+/gi, '-').toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ScannerApp() {
  const [tab, setTab] = useState<ScannerTab>('scan');
  const [results, setResults] = useState<QuizResult[]>([]);
  const [preview, setPreview] = useState<QuizResult>();
  const [duplicate, setDuplicate] = useState<QuizResult>();
  const [detail, setDetail] = useState<QuizResult>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Ready to scan');
  const [scanning, setScanning] = useState(false);
  const [parts, setParts] = useState<Record<string, PartialScan>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const [manual, setManual] = useState('');
  const [cameraIndex, setCameraIndex] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [defaultCameraId, setDefaultCameraId] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('simple');
  const scanModeRef = useRef<ScanMode>('simple');
  const [torch, setTorch] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | undefined>(undefined);
  const lastScan = useRef({ value: '', time: 0 });
  const importRef = useRef<HTMLInputElement>(null);
  const partsRef = useRef<Record<string, PartialScan>>({});

  const refresh = async () => {
    try {
      const stored = await getResults();
      setResults(stored.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
    } catch (storageError) {
      setError((storageError as Error).message);
    }
  };

  useEffect(() => {
    refresh();
    setDefaultCameraId(localStorage.getItem(DEFAULT_CAMERA_KEY) || '');
    scanModeRef.current = localStorage.getItem(SCAN_MODE_KEY) === 'complete' ? 'complete' : 'simple';
    setScanMode(scanModeRef.current);
    void loadCameras();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => setMessage('Offline cache will be available after the next visit.'));
    return () => controlsRef.current?.stop();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const activeQuizResults = useMemo(() => results, [results]);
  const summary = useMemo(() => summarizeResults(activeQuizResults), [activeQuizResults]);
  const analysis = useMemo(() => analyzeItems(activeQuizResults), [activeQuizResults]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return results.filter((result) => {
      const statusMatches = statusFilter === 'all' || (statusFilter === 'passed' ? result.passed : !result.passed);
      const queryMatches = !query || [result.studentName, result.studentId, result.quizTitle, result.quizId, result.studentSection, result.subject, String(result.attempt), result.passed ? 'passed' : 'failed', result.violations.length ? 'security flagged' : 'security clear', result.submittedAt.slice(0, 10)].some((value) => value.toLowerCase().includes(query));
      return statusMatches && queryMatches;
    });
  }, [results, search, statusFilter]);
  const pageResults = filtered.slice((page - 1) * 20, page * 20);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));

  async function loadCameras() {
    try {
      const devices = await BrowserQRCodeReader.listVideoInputDevices();
      setCameras(devices);
      return devices;
    } catch {
      return [];
    }
  }

  function chooseDefaultCamera(cameraId: string) {
    setDefaultCameraId(cameraId);
    if (cameraId) localStorage.setItem(DEFAULT_CAMERA_KEY, cameraId);
    else localStorage.removeItem(DEFAULT_CAMERA_KEY);
    const index = cameras.findIndex((camera) => camera.deviceId === cameraId);
    if (index >= 0) setCameraIndex(index);
  }

  function chooseScanMode(mode: ScanMode) {
    scanModeRef.current = mode;
    setScanMode(mode);
    localStorage.setItem(SCAN_MODE_KEY, mode);
    setError('');
    setMessage(`${mode === 'simple' ? 'Simple' : 'Full'} QR result mode selected`);
  }

  function ensureAcceptedMode(format: string | undefined) {
    const resultMode: ScanMode | undefined = format === 'QUIQ_SIMPLE_RESULT' ? 'simple' : format === 'QUIQ_RESULT' ? 'complete' : undefined;
    if (resultMode && resultMode !== scanModeRef.current) throw new Error(`This is a ${resultMode === 'simple' ? 'Simple' : 'Full'} QR result. Switch the scanner to ${resultMode === 'simple' ? 'Simple' : 'Full'} mode and scan again.`);
  }

  async function startScanner(cameraOverride?: number) {
    setError('');
    setPreview(undefined);
    controlsRef.current?.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('No camera is available. Use manual QR data input below on this device.');
      return;
    }
    try {
      const devices = await loadCameras();
      const activeCameraIndex = cameraOverride ?? cameraIndex;
      const selected = devices.find((camera) => camera.deviceId === defaultCameraId) || devices[activeCameraIndex % Math.max(1, devices.length)];
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180 });
      setScanning(true);
      setMessage(defaultCameraId && selected ? `Using saved camera: ${selected.label || 'Camera'}` : 'Rear camera requested');
      controlsRef.current = await reader.decodeFromConstraints(
        defaultCameraId && selected
          ? { video: { deviceId: { exact: selected.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }
          : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        videoRef.current!,
        (scanResult, scanError) => {
          if (scanResult) {
            const value = scanResult.getText();
            const now = Date.now();
            if (value !== lastScan.current.value || now - lastScan.current.time > 2200) {
              lastScan.current = { value, time: now };
              processScannedValue(value);
            }
          }
          if (scanError && scanError.name !== 'NotFoundException') setMessage('Keep the QR code inside the frame.');
        },
      );
      void loadCameras();
    } catch (cameraError) {
      setScanning(false);
      setError(cameraError instanceof DOMException && cameraError.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in browser settings, then try again.' : 'Unable to start a camera. Check camera access or use manual input.');
    }
  }

  function stopScanner() {
    controlsRef.current?.stop();
    controlsRef.current = undefined;
    setScanning(false);
    setTorch(false);
  }

  async function switchCamera() {
    const devices = await BrowserQRCodeReader.listVideoInputDevices();
    if (devices.length < 2) {
      setMessage('No second camera is available.');
      return;
    }
    const nextCamera = cameraIndex + 1;
    setCameraIndex(nextCamera);
    controlsRef.current?.stop();
    window.setTimeout(() => void startScanner(nextCamera), 60);
  }

  async function toggleTorch() {
    try {
      await controlsRef.current?.switchTorch?.(!torch);
      setTorch((current) => !current);
    } catch {
      setMessage('Flashlight control is not supported on this camera.');
    }
  }

  async function sha256(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function base64Bytes(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function decodePayload(payload: string, encoding: QrEnvelope['encoding']) {
    let bytes = base64Bytes(payload);
    if (encoding === 'gzip-base64') {
      if (!('DecompressionStream' in window)) throw new Error('This browser cannot decompress the scanned result. Update the browser and try again.');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function validateResult(value: unknown): QuizResult {
    const result = value as QuizResult;
    const required = ['resultId', 'quizId', 'quizTitle', 'studentId', 'studentName', 'submittedAt', 'responses'];
    if (result?.format !== 'QUIQ_RESULT' || result.version !== '1.0' || required.some((key) => !(key in (result || {}))) || !Array.isArray(result.responses)) throw new Error('The QR data is not a supported Quiq result.');
    return { ...result, resultDataMode: 'complete' };
  }

  function simpleResult(value: unknown): QuizResult {
    const result = value as Record<string, unknown>;
    if (result?.format !== 'QUIQ_SIMPLE_RESULT' || result.version !== '1.0' || !String(result.resultId || '').trim() || !String(result.studentName || '').trim() || !Number.isFinite(Number(result.score)) || !Number.isFinite(Number(result.totalScore))) throw new Error('The QR data is not a supported simple Quiq result.');
    const submittedAt = typeof result.submittedAt === 'string' && !Number.isNaN(Date.parse(result.submittedAt)) ? result.submittedAt : new Date().toISOString();
    const totalScore = Number(result.totalScore);
    const score = Number(result.score);
    const percentage = Number.isFinite(Number(result.percentage)) ? Number(result.percentage) : totalScore ? Math.round((score / totalScore) * 10000) / 100 : 0;
    return { format: 'QUIQ_RESULT', version: '1.0', resultDataMode: 'simple', resultId: String(result.resultId), quizId: 'SIMPLE', quizTitle: 'Simple QR result', subject: '', section: '', teacher: '', studentName: String(result.studentName), studentId: '', studentSection: '', attempt: Number(result.attempt) || 1, score, totalScore, percentage, passed: false, passingPercentage: 0, startedAt: submittedAt, submittedAt, durationSeconds: 0, submissionReason: 'manual', autoSubmitted: false, violations: [], responses: [] };
  }

  async function showPreview(result: QuizResult) {
    const existing = await findSecondaryDuplicate(result);
    setDuplicate(existing);
    setPreview(result);
    setError('');
    setMessage(existing ? 'Duplicate result detected' : 'Complete result found');
    stopScanner();
  }

  async function processScannedValue(value: string) {
    try {
      setError('');
      const parsed = JSON.parse(value);
      if (parsed?.format === 'QUIQ_SIMPLE_RESULT') {
        ensureAcceptedMode(parsed.format);
        await showPreview(simpleResult(parsed));
        return;
      }
      if (parsed?.format === 'QUIQ_RESULT') {
        ensureAcceptedMode(parsed.format);
        await showPreview(validateResult(parsed));
        return;
      }
      const envelope = parsed as QrEnvelope;
      if (envelope.format !== 'QUIQ_QR' || envelope.version !== '1.0' || !envelope.resultId || !Number.isInteger(envelope.partNumber) || !Number.isInteger(envelope.totalParts) || !envelope.payloadChunk || !envelope.checksum) throw new Error('Invalid QR data. This code is not a supported Quiq result part.');
      if (envelope.partNumber < 1 || envelope.partNumber > envelope.totalParts) throw new Error('Invalid QR part numbering.');
      const next = { ...partsRef.current };
      const partial = next[envelope.resultId] || { totalParts: envelope.totalParts, encoding: envelope.encoding, checksum: envelope.checksum, chunks: {} };
      if (partial.checksum !== envelope.checksum || partial.totalParts !== envelope.totalParts || partial.encoding !== envelope.encoding) throw new Error('The scanned QR parts do not belong to the same result.');
      partial.chunks[envelope.partNumber] = envelope.payloadChunk;
      next[envelope.resultId] = partial;
      partsRef.current = next;
      setParts(next);
      const scannedCount = Object.keys(partial.chunks).length;
      setMessage(`Scanned ${scannedCount} of ${partial.totalParts} QR parts. ${scannedCount < partial.totalParts ? 'Scan the next part.' : 'Validating result…'}`);
      if (scannedCount === partial.totalParts) {
        const payload = Array.from({ length: partial.totalParts }, (_, index) => partial.chunks[index + 1]).join('');
        if (await sha256(payload) !== partial.checksum) throw new Error('Invalid result data. The scanned QR payload appears damaged or incomplete.');
        const decoded = await decodePayload(payload, partial.encoding);
        ensureAcceptedMode((decoded as { format?: string })?.format);
        const result = (decoded as { format?: string })?.format === 'QUIQ_SIMPLE_RESULT' ? simpleResult(decoded) : validateResult(decoded);
        if (result.resultId !== envelope.resultId) throw new Error('Result identity does not match the QR envelope.');
        delete next[envelope.resultId];
        partsRef.current = { ...next };
        setParts({ ...next });
        await showPreview(result);
      }
    } catch (scanError) {
      setError((scanError as Error).message || 'Invalid QR data.');
    }
  }

  async function storePreview() {
    if (!preview) return;
    if (duplicate?.resultId === preview.resultId) {
      setDetail(duplicate);
      setPreview(undefined);
      setTab('results');
      return;
    }
    if (duplicate && !window.confirm('A result already exists for this quiz, student, and attempt. Save this separate result anyway?')) return;
    try {
      await saveResult(preview);
      setMessage('Result saved on this device');
      setPreview(undefined);
      setDuplicate(undefined);
      setParts({});
      partsRef.current = {};
      await refresh();
      setTab('scan');
      window.setTimeout(() => void startScanner(), 120);
    } catch (storageError) {
      setError((storageError as Error).message);
    }
  }

  async function removeResult(result: QuizResult) {
    if (!confirm(`Delete the result for ${result.studentName}? This cannot be undone.`)) return;
    await deleteResult(result.resultId);
    setDetail(undefined);
    refresh();
  }

  async function editStudent(result: QuizResult) {
    const studentName = prompt('Student name', result.studentName)?.trim();
    if (studentName === undefined || studentName === '') return;
    const studentId = prompt('Student ID', result.studentId)?.trim();
    if (studentId === undefined || studentId === '') return;
    const studentSection = prompt('Section', result.studentSection)?.trim();
    if (studentSection === undefined || studentSection === '') return;
    const updated = { ...result, studentName, studentId, studentSection };
    await saveResult(updated);
    setDetail(updated);
    await refresh();
    setMessage('Student information updated');
  }

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const count = Array.isArray(parsed?.results) ? parsed.results.length : 0;
      const replace = confirm(`Backup contains ${count} result records. Press OK to replace existing data, or Cancel to merge records.`);
      const restored = await restoreDatabase(parsed, replace ? 'replace' : 'merge');
      setMessage(`${restored} results restored`);
      await refresh();
    } catch (restoreError) {
      setError((restoreError as Error).message || 'Corrupted backup.');
    }
  }

  return (
    <main className="min-h-screen bg-background pb-20 text-foreground md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center border border-primary/40 bg-primary/10 text-primary"><QrCode /></span><div><p className="font-semibold leading-none">QUIQ SCANNER</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Local result recorder</p></div></div>
          <div className="flex items-center gap-2"><Badge variant="outline" className="hidden rounded-sm border-emerald-800 bg-emerald-950/50 text-emerald-300 sm:flex"><span className="mr-1 size-1.5 rounded-full bg-emerald-400" /> Offline ready</Badge><Link href="/" className={buttonVariants({ variant: 'outline' })}><ChevronLeft /> Quiz creator</Link></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-sidebar md:sticky md:top-16 md:h-[calc(100vh-64px)] md:grid-cols-1 md:grid-rows-[repeat(4,60px)_1fr] md:border-r md:border-t-0 md:p-4" aria-label="Scanner navigation">
          {([
            ['scan', 'Scanner', QrCode], ['results', 'Results', Users], ['analysis', 'Analysis', BarChart3], ['more', 'More', MoreHorizontal],
          ] as [ScannerTab, string, typeof QrCode][]).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => { stopScanner(); setTab(id); setDetail(undefined); setError(''); }} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium md:min-h-0 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm ${tab === id ? 'bg-sidebar-accent text-primary' : 'text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground'}`}><Icon className="size-5" />{label}</button>)}
          <div className="hidden self-end border border-border p-4 text-xs leading-relaxed text-muted-foreground md:block"><ShieldAlert className="mb-2 size-4 text-primary" />Student records remain in this browser&apos;s IndexedDB.</div>
        </nav>

        <section className="min-w-0 p-4 sm:p-6 lg:p-9">
          {error && <div className="mb-5 flex items-start justify-between gap-4 border-l-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X className="size-4" /></button></div>}
          {tab === 'scan' && <><ScanView scanning={scanning} videoRef={videoRef} message={message} parts={parts} preview={preview} duplicate={duplicate} manual={manual} setManual={setManual} processScannedValue={processScannedValue} startScanner={startScanner} stopScanner={stopScanner} switchCamera={switchCamera} toggleTorch={toggleTorch} torch={torch} storePreview={storePreview} setPreview={setPreview} setDetail={setDetail} setTab={setTab} /><div className="mx-auto mt-4 grid max-w-4xl gap-4 md:grid-cols-2"><label className="flex items-center justify-between gap-4 border border-border bg-card p-4 text-sm"><span><strong className="block">Scanner result mode</strong><span className="mt-1 block text-xs text-muted-foreground">Match this to the QR result mode set in the quiz maker.</span></span><select value={scanMode} onChange={(event) => chooseScanMode(event.target.value as ScanMode)} className="native-control max-w-44"><option value="simple">Simple</option><option value="complete">Full</option></select></label>{cameras.length > 0 && <label className="flex items-center justify-between gap-4 border border-border bg-card p-4 text-sm"><span><strong className="block">Default camera</strong><span className="mt-1 block text-xs text-muted-foreground">Used automatically for the next scan on this device.</span></span><select value={defaultCameraId} onChange={(event) => chooseDefaultCamera(event.target.value)} className="native-control max-w-64"><option value="">Rear camera (automatic)</option>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}</select></label>}</div></>}
          {tab === 'results' && <ResultsView results={pageResults} total={filtered.length} summary={summary} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} page={page} pageCount={pageCount} setPage={setPage} detail={detail} setDetail={setDetail} removeResult={removeResult} editStudent={editStudent} refresh={refresh} />}
          {tab === 'analysis' && <AnalysisView analysis={analysis} results={results} />}
          {tab === 'more' && <MoreView results={results} importRef={importRef} importBackup={importBackup} setMessage={setMessage} refresh={refresh} setError={setError} />}
        </section>
      </div>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => importBackup(event.target.files?.[0])} />
    </main>
  );
}

function ScanView({ scanning, videoRef, message, parts, preview, duplicate, manual, setManual, processScannedValue, startScanner, stopScanner, switchCamera, toggleTorch, torch, storePreview, setPreview, setDetail, setTab }: any) {
  const activePart = Object.values(parts as Record<string, PartialScan>)[0];
  if (preview) return <div className="mx-auto max-w-3xl"><div className="mb-7"><p className="section-eyebrow">Result found</p><h1 className="section-title">Review before saving</h1></div>{duplicate && <div className="mb-5 border-l-2 border-amber-400 bg-amber-500/10 p-4"><p className="font-semibold text-amber-200">Duplicate result</p><p className="mt-1 text-sm text-amber-100/70">A result already exists for {duplicate.studentName}, Quiz {duplicate.quizId}, Attempt {duplicate.attempt}.</p></div>}<section className="border border-border bg-card"><div className="grid gap-px bg-border sm:grid-cols-2">{[['Student', preview.studentName], ['Student ID', preview.studentId], ['Section', preview.studentSection], ['Subject', preview.subject], ['Quiz', preview.quizTitle], ['Score', `${preview.score} / ${preview.totalScore}`], ['Percentage', `${preview.percentage}%`], ['Attempt', preview.attempt], ['Security violations', preview.violations.length], ['Submitted', formatDate(preview.submittedAt)]].map(([label, value]) => <div key={label} className="bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}</div><div className="flex flex-wrap justify-end gap-2 border-t border-border p-4"><Button variant="outline" onClick={() => setPreview(undefined)}>Cancel</Button>{duplicate && <Button variant="outline" onClick={() => { setDetail(duplicate); setPreview(undefined); setTab('results'); }}>View existing</Button>}<Button onClick={storePreview}>{duplicate?.resultId === preview.resultId ? 'View saved result' : duplicate ? 'Save anyway' : 'Save result'}</Button></div></section></div>;
  return <div className="mx-auto max-w-4xl"><div className="mb-7"><p className="section-eyebrow">Primary action</p><h1 className="section-title">Scan quiz result</h1><p className="section-copy">Position the student&apos;s result QR inside the frame. Multi-part results are assembled and checked automatically.</p></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"><section className="overflow-hidden border border-border bg-black"><div className="relative aspect-[4/3] min-h-72"><video ref={videoRef} className="h-full w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-[14%] border-2 border-primary"><span className="absolute -left-0.5 -top-0.5 size-8 border-l-4 border-t-4 border-white" /><span className="absolute -right-0.5 -top-0.5 size-8 border-r-4 border-t-4 border-white" /><span className="absolute -bottom-0.5 -left-0.5 size-8 border-b-4 border-l-4 border-white" /><span className="absolute -bottom-0.5 -right-0.5 size-8 border-b-4 border-r-4 border-white" /></div>{!scanning && <div className="absolute inset-0 grid place-items-center bg-[#0c1420]"><div className="text-center"><Camera className="mx-auto size-10 text-primary" /><p className="mt-3 text-sm text-muted-foreground">Camera is off</p></div></div>}</div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#101925] p-3"><p className="text-xs text-slate-300">{activePart ? `Scanned ${Object.keys(activePart.chunks).length} / ${activePart.totalParts} parts` : message}</p><div className="flex gap-2">{scanning ? <><Button variant="outline" size="icon" className="border-white/20 bg-white/5" onClick={toggleTorch} aria-label="Toggle flashlight"><Flashlight className={torch ? 'text-amber-300' : ''} /></Button><Button variant="outline" size="icon" className="border-white/20 bg-white/5" onClick={switchCamera} aria-label="Switch camera"><RefreshCw /></Button><Button variant="outline" className="border-white/20 bg-white/5" onClick={stopScanner}>Cancel</Button></> : <Button onClick={() => startScanner()}><Camera /> Start camera</Button>}</div></div></section><aside className="space-y-5"><section className="border border-border bg-card p-5"><h2 className="font-semibold">Scan progress</h2>{activePart ? <div className="mt-4"><div className="flex justify-between text-sm"><span>Result parts</span><strong>{Object.keys(activePart.chunks).length} / {activePart.totalParts}</strong></div><div className="mt-3 h-2 bg-muted"><span className="block h-full bg-primary" style={{ width: `${(Object.keys(activePart.chunks).length / activePart.totalParts) * 100}%` }} /></div><p className="mt-3 text-xs text-muted-foreground">Scan each numbered QR. Re-scanning a part does not create a duplicate.</p></div> : <div className="mt-4 border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No QR parts scanned yet.</div>}</section><section className="border border-border bg-card p-5"><h2 className="font-semibold">Manual data input</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Useful for desktop testing or camera-restricted devices.</p><textarea value={manual} onChange={(e) => setManual(e.target.value)} className="mt-4 min-h-24 w-full border border-input bg-background p-3 font-mono text-xs outline-none focus:border-primary" placeholder="Paste QUIQ_QR JSON" /><Button variant="outline" className="mt-2 w-full" disabled={!manual.trim()} onClick={() => processScannedValue(manual.trim())}>Validate data</Button></section></aside></div></div>;
}

function ResultsView({ results, total, summary, search, setSearch, statusFilter, setStatusFilter, page, pageCount, setPage, detail, setDetail, removeResult, editStudent, refresh }: any) {
  if (detail) return <ResultDetail result={detail} onBack={() => setDetail(undefined)} onDelete={() => removeResult(detail)} onEdit={() => editStudent(detail)} />;
  return <div><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="section-eyebrow">Local database</p><h1 className="section-title">Results</h1><p className="section-copy">Search, review, and manage scanned classroom results.</p></div><Button variant="outline" onClick={refresh}><RefreshCw /> Refresh</Button></div><div className="mb-6 grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-5">{[['Students', summary.students], ['Results', summary.results], ['Average', `${summary.average.toFixed(1)}%`], ['Highest', `${summary.highest.toFixed(1)}%`], ['Passing rate', `${summary.passingRate.toFixed(1)}%`]].map(([label, value]) => <div key={label} className="bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}</div><div className="mb-4 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 rounded-sm pl-9" placeholder="Search name, ID, quiz, section, date, attempt, security…" /></label><label className="flex items-center gap-2 border border-input bg-card px-3"><ListFilter className="size-4 text-muted-foreground" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 bg-transparent text-sm outline-none"><option value="all">All statuses</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label></div><div className="overflow-x-auto border border-border"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Student</th><th className="p-3">Section</th><th className="p-3">Quiz</th><th className="p-3">Score</th><th className="p-3">Status</th><th className="p-3">Attempt</th><th className="p-3">Violations</th><th className="p-3">Submitted</th></tr></thead><tbody>{results.length ? results.map((result: QuizResult) => <tr key={result.resultId} onClick={() => setDetail(result)} className="cursor-pointer border-t border-border hover:bg-muted/30"><td className="p-3"><strong className="block">{result.studentName}</strong><span className="text-xs text-muted-foreground">{result.studentId}</span></td><td className="p-3">{result.studentSection}</td><td className="p-3"><span className="block max-w-48 truncate">{result.quizTitle}</span><span className="text-xs text-muted-foreground">{result.quizId}</span></td><td className="p-3 font-medium">{result.score}/{result.totalScore} · {result.percentage}%</td><td className="p-3"><Badge variant={result.passed ? 'outline' : 'destructive'} className={result.passed ? 'rounded-sm border-emerald-800 text-emerald-300' : 'rounded-sm'}>{result.passed ? 'Passed' : 'Failed'}</Badge></td><td className="p-3">{result.attempt}</td><td className="p-3">{result.violations.length}</td><td className="p-3 text-xs text-muted-foreground">{formatDate(result.submittedAt)}</td></tr>) : <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">No matching results. Scan a student QR to begin.</td></tr>}</tbody></table></div><div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{total} result{total === 1 ? '' : 's'}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>{page} / {pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</Button></div></div></div>;
}

function ResultDetail({ result, onBack, onDelete, onEdit }: { result: QuizResult; onBack: () => void; onDelete: () => void; onEdit: () => void }) {
  const counts = result.violations.reduce<Record<string, number>>((map, event) => ({ ...map, [event.type]: (map[event.type] || 0) + 1 }), {});
  return <div className="mx-auto max-w-5xl"><Button variant="ghost" onClick={onBack}><ChevronLeft /> Back to results</Button><div className="mt-5 flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end"><div><p className="section-eyebrow">Student result</p><h1 className="section-title">{result.studentName}</h1><p className="section-copy">{result.studentId} · {result.studentSection} · Attempt {result.attempt}</p></div><div className="flex gap-2"><Button variant="outline" onClick={onEdit}>Edit student</Button><Button variant="destructive" onClick={onDelete}><Trash2 /> Delete result</Button></div></div><CheckedPaperExport key={result.resultId} result={result} /><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]"><section className="space-y-5"><div className="grid gap-px border border-border bg-border sm:grid-cols-3"><div className="bg-card p-5"><p className="text-xs text-muted-foreground">Score</p><p className="mt-1 text-2xl font-semibold">{result.score} / {result.totalScore}</p></div><div className="bg-card p-5"><p className="text-xs text-muted-foreground">Percentage</p><p className="mt-1 text-2xl font-semibold">{result.percentage}%</p></div><div className="bg-card p-5"><p className="text-xs text-muted-foreground">Result</p><p className={`mt-1 text-2xl font-semibold ${result.passed ? 'text-emerald-300' : 'text-destructive'}`}>{result.passed ? 'Passed' : 'Failed'}</p></div></div><section className="border border-border bg-card p-5"><h2 className="font-semibold">Response review</h2><div className="mt-4 divide-y divide-border">{result.responses.map((response) => <div key={response.questionId} className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm"><span className="font-mono text-xs text-muted-foreground">{response.questionId}</span><span>Student answer: <strong>{response.selectedAnswer === null ? 'Unanswered' : String.fromCharCode(65 + response.selectedAnswer)}</strong></span><Badge variant={response.correct ? 'outline' : 'destructive'} className={response.correct ? 'rounded-sm border-emerald-800 text-emerald-300' : 'rounded-sm'}>{response.correct ? 'Correct' : 'Incorrect'}</Badge></div>)}</div></section></section><aside className="space-y-5"><section className="border border-border bg-card p-5"><h2 className="font-semibold">Exam details</h2><dl className="mt-4 space-y-3 text-sm">{[['Quiz', result.quizTitle], ['Subject', result.subject], ['Started', formatDate(result.startedAt)], ['Submitted', formatDate(result.submittedAt)], ['Duration', `${Math.floor(result.durationSeconds / 60)}m ${result.durationSeconds % 60}s`], ['Reason', result.submissionReason], ['Result ID', result.resultId]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div>)}</dl></section><section className="border border-border bg-card p-5"><h2 className="font-semibold">Security summary</h2><p className="mt-3 text-3xl font-semibold">{result.violations.length}</p><p className="text-xs text-muted-foreground">total violations</p><dl className="mt-4 space-y-2 text-sm">{Object.entries(counts).map(([type, count]) => <div key={type} className="flex justify-between"><dt className="capitalize text-muted-foreground">{type.replaceAll('-', ' ')}</dt><dd>{count}</dd></div>)}</dl>{!result.violations.length && <p className="mt-4 text-sm text-muted-foreground">No security events recorded.</p>}</section></aside></div></div>;
}

function AnalysisView({ analysis, results }: { analysis: ReturnType<typeof analyzeItems>; results: QuizResult[] }) {
  return <div><div className="mb-7"><p className="section-eyebrow">Item performance</p><h1 className="section-title">Item analysis</h1><p className="section-copy">Responses are grouped by permanent Question ID, never by randomized display order.</p></div>{analysis.length ? <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="overflow-x-auto border border-border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Item</th><th className="p-3">Responses</th><th className="p-3">Correct</th><th className="p-3">Incorrect</th><th className="p-3">% Correct</th><th className="p-3">Difficulty</th><th className="p-3">Top choice</th></tr></thead><tbody>{analysis.map((row) => <tr key={row.questionId} className="border-t border-border"><td className="p-3 font-mono text-xs">{row.questionId}</td><td className="p-3">{row.total}</td><td className="p-3 text-emerald-300">{row.correct}</td><td className="p-3 text-destructive">{row.incorrect}</td><td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-20 bg-muted"><span className="block h-full bg-primary" style={{ width: `${row.percentCorrect}%` }} /></div>{row.percentCorrect.toFixed(1)}%</div></td><td className="p-3">{row.difficulty}</td><td className="p-3">{row.mostSelected}</td></tr>)}</tbody></table></section><aside className="space-y-4"><section className="border border-border bg-card p-5"><h2 className="font-semibold">Percentage correct by item</h2><div className="mt-5 space-y-3">{analysis.slice(0, 12).map((row) => <div key={row.questionId}><div className="mb-1 flex justify-between text-xs"><span>{row.questionId}</span><span>{row.percentCorrect.toFixed(0)}%</span></div><div className="h-2 bg-muted"><span className={`block h-full ${row.percentCorrect <= 30 ? 'bg-destructive' : row.percentCorrect <= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${row.percentCorrect}%` }} /></div></div>)}</div></section><section className="border border-border bg-card p-5"><h2 className="font-semibold">Choice distribution</h2><div className="mt-4 space-y-4">{analysis.slice(0, 4).map((row) => <div key={row.questionId}><p className="mb-2 font-mono text-xs text-muted-foreground">{row.questionId}</p>{Object.entries(row.distribution).sort(([a], [b]) => a.localeCompare(b)).map(([choice, count]) => <div key={choice} className="mb-1 flex justify-between text-sm"><span>Choice {choice}</span><span>{count} · {row.total ? ((count / row.total) * 100).toFixed(1) : '0.0'}%</span></div>)}</div>)}</div></section><section className="border border-border bg-card p-5"><h2 className="font-semibold">Difficulty thresholds</h2><dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">0–30%</dt><dd>Difficult</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">31–70%</dt><dd>Moderate</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">71–100%</dt><dd>Easy</dd></div></dl></section></aside></div> : <div className="border border-dashed border-border p-12 text-center"><BarChart3 className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-4 font-semibold">No response data yet</h2><p className="mt-2 text-sm text-muted-foreground">Scan and save at least one result to calculate item analysis.</p></div>}</div>;
}

function MoreView({ results, importRef, setMessage, refresh, setError }: any) {
  async function backup() {
    try {
      const data = await exportDatabase();
      download(JSON.stringify(data, null, 2), `quiz-scanner-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
      setMessage('Database backup downloaded');
    } catch (error) { setError((error as Error).message); }
  }
  return <div><div className="mb-7"><p className="section-eyebrow">Data tools</p><h1 className="section-title">Export & backup</h1><p className="section-copy">Keep portable copies of locally stored classroom records.</p></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"><ToolCard icon={FileSpreadsheet} title="Results CSV" copy="One row per submitted result with score, status, timing, and security totals." action="Export results" disabled={!results.length} onClick={() => download(resultsCsv(results), `${fileStem(results[0])}_RESULTS.csv`, 'text/csv')} /><ToolCard icon={FileSpreadsheet} title="Responses CSV" copy="Student responses by permanent Question ID, plus correct or incorrect columns." action="Export responses" disabled={!results.length} onClick={() => download(responsesCsv(results), `${fileStem(results[0])}_RESPONSES.csv`, 'text/csv')} /><ToolCard icon={BarChart3} title="Item analysis CSV" copy="Correctness, difficulty, and most-selected answer for each item." action="Export analysis" disabled={!results.length} onClick={() => download(analysisCsv(results), `${fileStem(results[0])}_ITEM-ANALYSIS.csv`, 'text/csv')} /><ToolCard icon={Download} title="Backup database" copy="Download every stored result as a validated Quiq backup file." action="Backup database" onClick={backup} /><ToolCard icon={ArchiveRestore} title="Restore backup" copy="Merge a backup or replace the current local result database." action="Restore backup" onClick={() => importRef.current?.click()} /><ToolCard icon={Trash2} danger title="Clear all data" copy="Permanently remove every scanned result from this browser." action="Clear all results" disabled={!results.length} onClick={async () => { if (!confirm(`Delete all ${results.length} stored results? This cannot be undone.`)) return; await clearAllResults(); setMessage('All local results cleared'); refresh(); }} /></div><section className="mt-6 border-l-2 border-primary bg-primary/10 p-5"><h2 className="font-semibold">Private by default</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Quiq stores student information only in this browser. It includes no analytics, trackers, accounts, or third-party cloud database. Back up the database before clearing browser storage or changing devices.</p></section></div>;
}

function ToolCard({ icon: Icon, title, copy, action, onClick, disabled, danger }: any) {
  return <section className="flex min-h-60 flex-col border border-border bg-card p-5"><span className={`grid size-10 place-items-center border ${danger ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-primary/40 bg-primary/10 text-primary'}`}><Icon /></span><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{copy}</p><Button variant={danger ? 'destructive' : 'outline'} className="mt-5" onClick={onClick} disabled={disabled}>{action}</Button></section>;
}

import type { Quiz } from '@/lib/quiz-types';

declare const qrcode: (typeNumber: number, errorCorrectionLevel: string) => {
  addData(data: string): void;
  make(): void;
  createSvgTag(cellSize?: number, margin?: number): string;
};

function studentQuizApplication(quiz: Quiz) {
  const root = document.getElementById('app') as HTMLElement;
  const alphabet = 'ABCDEFGH';
  const attemptPrefix = `quiq-attempt:${quiz.quizId}:`;
  const progressKey = `quiq-progress:${quiz.quizId}`;
  const resultKey = `quiq-result:${quiz.quizId}`;
  let state: any = {
    screen: 'start',
    identity: { name: '', studentId: '', section: quiz.section || '' },
    questions: [],
    answers: {},
    flagged: {},
    current: 0,
    attempt: 0,
    violations: [],
    qrParts: [],
    qrIndex: 0,
    qrSize: 420,
  };
  let timer: number | undefined;
  let lastIncident = 0;

  function escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[character] || character));
  }

  function shuffle<T>(values: T[]) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function getAttempts(studentId: string) {
    return Number(localStorage.getItem(attemptPrefix + studentId) || 0);
  }

  function readSavedResult() {
    try {
      const saved = JSON.parse(localStorage.getItem(resultKey) || 'null');
      return saved?.result && Array.isArray(saved?.qrParts) ? saved : null;
    } catch {
      return null;
    }
  }

  function restoreSavedResultIfLocked() {
    const saved = readSavedResult();
    if (!saved || getAttempts(saved.result.studentId) < quiz.settings.allowedAttempts) return false;
    state.result = saved.result;
    state.qrParts = saved.qrParts;
    state.screen = 'result';
    renderResult();
    return true;
  }

  function resetLocalQuizData() {
    const resetPassword = String(quiz.settings.resetPassword || '');
    if (resetPassword.length < 4) {
      alert('Teacher reset is not configured for this quiz. Ask the teacher to export a new quiz with a reset password.');
      return;
    }
    const entered = prompt('Teacher reset password:');
    if (entered === null) return;
    if (entered !== resetPassword) {
      alert('Incorrect reset password. Quiz data was not changed.');
      return;
    }
    if (!confirm('Reset attempts, the saved exam, and the submitted result for this quiz? This permits another attempt.')) return;
    Object.keys(localStorage).filter((key) => key.startsWith(attemptPrefix) || key === progressKey || key === resultKey).forEach((key) => localStorage.removeItem(key));
    location.reload();
  }

  function persist() {
    if (!quiz.settings.resumeAfterRefresh || state.screen !== 'exam') return;
    localStorage.setItem(progressKey, JSON.stringify({ ...state, savedAt: new Date().toISOString() }));
  }

  function prepareQuestions() {
    const questions = quiz.questions.map((question) => {
      const choices = question.choices.map((text, originalIndex) => ({ text, originalIndex }));
      return { ...question, displayChoices: quiz.settings.randomizeChoices && question.type === 'multiple-choice' ? shuffle(choices) : choices };
    });
    state.questions = quiz.settings.randomizeQuestions ? shuffle(questions) : questions;
  }

  function formatTime(seconds: number) {
    const safe = Math.max(0, seconds);
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function renderStart() {
    if (restoreSavedResultIfLocked()) return;
    const totalPoints = quiz.questions.reduce((sum, question) => sum + Number(question.points), 0);
    const lastResult = readSavedResult();
    const progress = quiz.settings.resumeAfterRefresh ? localStorage.getItem(progressKey) : null;
    root.innerHTML = `
      <main class="shell start-shell">
        <section class="exam-card intro-card">
          <div class="eyebrow">Offline classroom exam</div>
          <h1>${escapeHtml(quiz.quizTitle)}</h1>
          <p class="instructions">${escapeHtml(quiz.instructions)}</p>
          <dl class="facts">
            <div><dt>Subject</dt><dd>${escapeHtml(quiz.subject)}</dd></div>
            <div><dt>Section</dt><dd>${escapeHtml(quiz.section)}</dd></div>
            <div><dt>Questions</dt><dd>${quiz.questions.length}</dd></div>
            <div><dt>Total points</dt><dd>${totalPoints}</dd></div>
            <div><dt>Duration</dt><dd>${quiz.settings.durationMinutes} minutes</dd></div>
            <div><dt>Attempts</dt><dd>${quiz.settings.allowedAttempts}</dd></div>
          </dl>
          <p class="teacher">Prepared by ${escapeHtml(quiz.teacher)}</p>
        </section>
        <section class="exam-card identity-card">
          <div class="eyebrow">Student information</div>
          <h2>Before you begin</h2>
          <p>Your details stay on this device until you show the result QR to your teacher.</p>
          <form id="identity-form" class="form-grid">
            <label>Student name${quiz.settings.requireName ? ' *' : ''}<input name="name" autocomplete="name" value="${escapeHtml(state.identity.name)}" ${quiz.settings.requireName ? 'required' : ''}></label>
            <label>Student ID${quiz.settings.requireStudentId ? ' *' : ''}<input name="studentId" autocomplete="off" value="${escapeHtml(state.identity.studentId)}" ${quiz.settings.requireStudentId ? 'required' : ''}></label>
            <label>Section${quiz.settings.requireSection ? ' *' : ''}<input name="section" value="${escapeHtml(state.identity.section)}" ${quiz.settings.requireSection ? 'required' : ''}></label>
            <p id="form-error" class="error" role="alert"></p>
            <button class="primary" type="submit">Review information</button>
          </form>
          ${progress ? '<button id="resume" class="secondary wide">Resume unfinished attempt</button>' : ''}
          ${lastResult ? '<button id="last-result" class="text-button wide">View last submitted result</button>' : ''}
        </section>
      </main>
      <footer><button id="reset-data" class="quiet">Reset local quiz data</button></footer>`;

    (document.getElementById('identity-form') as HTMLFormElement).onsubmit = (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget as HTMLFormElement);
      state.identity = { name: String(data.get('name') || '').trim(), studentId: String(data.get('studentId') || '').trim(), section: String(data.get('section') || '').trim() };
      const missing = (quiz.settings.requireName && !state.identity.name) || (quiz.settings.requireStudentId && !state.identity.studentId) || (quiz.settings.requireSection && !state.identity.section);
      if (missing) {
        (document.getElementById('form-error') as HTMLElement).textContent = 'Complete every required field before continuing.';
        return;
      }
      if (getAttempts(state.identity.studentId) >= quiz.settings.allowedAttempts) {
        (document.getElementById('form-error') as HTMLElement).textContent = `Attempt limit reached. ${quiz.settings.allowedAttempts} of ${quiz.settings.allowedAttempts} attempts already used.`;
        return;
      }
      state.screen = 'confirm';
      renderConfirm();
    };
    document.getElementById('resume')?.addEventListener('click', resumeAttempt);
    document.getElementById('last-result')?.addEventListener('click', () => {
      const saved = readSavedResult();
      if (saved) { state.result = saved.result; state.qrParts = saved.qrParts; state.screen = 'result'; renderResult(); }
    });
    document.getElementById('reset-data')?.addEventListener('click', resetLocalQuizData);
  }

  function renderConfirm() {
    const used = getAttempts(state.identity.studentId);
    root.innerHTML = `
      <main class="shell centered"><section class="exam-card confirm-card">
        <div class="eyebrow">Confirm information</div><h1>Is everything correct?</h1>
        <dl class="confirm-list">
          <div><dt>Name</dt><dd>${escapeHtml(state.identity.name || 'Not provided')}</dd></div>
          <div><dt>Student ID</dt><dd>${escapeHtml(state.identity.studentId || 'Not provided')}</dd></div>
          <div><dt>Section</dt><dd>${escapeHtml(state.identity.section || 'Not provided')}</dd></div>
          <div><dt>Attempts used</dt><dd>${used} / ${quiz.settings.allowedAttempts}</dd></div>
        </dl>
        ${quiz.security.enabled ? `<div class="security-note"><strong>Quiz security mode</strong><p>${quiz.security.requireFullscreen ? 'Fullscreen is required. ' : ''}Tab switches and prohibited actions may be recorded. The quiz ends and submits automatically at ${quiz.security.maximumViolations} violations.</p></div>` : ''}
        <div class="button-row"><button id="edit" class="secondary">Edit</button><button id="start" class="primary">${quiz.security.enabled && quiz.security.requireFullscreen ? 'Enter fullscreen & start' : 'Confirm & start'}</button></div>
      </section></main>`;
    document.getElementById('edit')!.onclick = () => { state.screen = 'start'; renderStart(); };
    document.getElementById('start')!.onclick = async () => {
      try {
        if (quiz.security.enabled && quiz.security.requireFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
        beginAttempt();
      } catch {
        alert('Fullscreen could not be started. Allow fullscreen access, then try again.');
      }
    };
  }

  function beginAttempt() {
    if (getAttempts(state.identity.studentId) >= quiz.settings.allowedAttempts) {
      if (!restoreSavedResultIfLocked()) renderStart();
      return;
    }
    prepareQuestions();
    state.screen = 'exam';
    state.startedAt = new Date().toISOString();
    state.endTime = Date.now() + quiz.settings.durationMinutes * 60 * 1000;
    state.attempt = getAttempts(state.identity.studentId) + 1;
    localStorage.setItem(attemptPrefix + state.identity.studentId, String(state.attempt));
    attachSecurity();
    persist();
    renderExam();
    startTimer();
  }

  function resumeAttempt() {
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) || 'null');
      if (!saved || saved.screen !== 'exam') throw new Error();
      state = saved;
      attachSecurity();
      renderExam();
      startTimer();
      if (quiz.security.enabled && quiz.security.requireFullscreen && !document.fullscreenElement) {
        showFullscreenRecovery();
      }
    } catch {
      localStorage.removeItem(progressKey);
      alert('The saved attempt could not be restored.');
      renderStart();
    }
  }

  function renderExam() {
    const question = state.questions[state.current];
    const answeredCount = Object.values(state.answers).filter((answer) => answer !== null && answer !== undefined).length;
    const remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
    root.innerHTML = `
      <main class="exam-layout">
        <header class="exam-header"><div><div class="eyebrow">${escapeHtml(quiz.subject)} · ${escapeHtml(state.identity.name)}</div><h1>${escapeHtml(quiz.quizTitle)}</h1></div>
          <div class="status-cluster"><div><span>Time remaining</span><strong id="timer" class="${remaining <= 60 ? 'danger-text' : remaining <= 300 ? 'warning-text' : ''}">${formatTime(remaining)}</strong></div><div><span>Violations</span><strong>${state.violations.length} / ${quiz.security.maximumViolations}</strong></div></div>
        </header>
        <section class="question-panel">
          <div class="question-meta"><span>Question ${state.current + 1} of ${state.questions.length}</span><span>${question.points} point${question.points === 1 ? '' : 's'}</span></div>
          <h2>${escapeHtml(question.question)}</h2>
          <div class="choices" role="radiogroup" aria-label="Answer choices">
            ${question.displayChoices.map((choice: any, index: number) => `<label class="choice ${state.answers[question.id] === choice.originalIndex ? 'selected' : ''}"><input type="radio" name="answer" value="${choice.originalIndex}" ${state.answers[question.id] === choice.originalIndex ? 'checked' : ''}><span class="choice-letter">${alphabet[index]}</span><span>${escapeHtml(choice.text)}</span></label>`).join('')}
          </div>
          <div class="question-actions"><button id="previous" class="secondary" ${state.current === 0 ? 'disabled' : ''}>Previous</button><button id="flag" class="flag ${state.flagged[question.id] ? 'active' : ''}">${state.flagged[question.id] ? 'Flagged for review' : 'Flag for review'}</button><button id="next" class="primary">${state.current === state.questions.length - 1 ? 'Review answers' : 'Next'}</button></div>
        </section>
        <aside class="navigator"><div class="navigator-heading"><div><span>Progress</span><strong>${answeredCount} / ${state.questions.length} answered</strong></div><span>${Math.round((answeredCount / state.questions.length) * 100)}%</span></div><div class="progress"><span style="width:${(answeredCount / state.questions.length) * 100}%"></span></div>
          <div class="question-grid">${state.questions.map((item: any, index: number) => {
            const answered = state.answers[item.id] !== undefined;
            const flagged = state.flagged[item.id];
            return `<button data-question="${index}" class="nav-number ${index === state.current ? 'current' : ''} ${answered ? 'answered' : ''} ${flagged ? 'flagged' : ''}" aria-label="Question ${index + 1}${answered ? ', answered' : ', unanswered'}${flagged ? ', flagged' : ''}">${index + 1}${flagged ? '<b>!</b>' : answered ? '<b>✓</b>' : '<b>?</b>'}</button>`;
          }).join('')}</div><button id="submit" class="submit-button">Submit quiz</button>
        </aside>
      </main>`;
    root.querySelectorAll<HTMLInputElement>('input[name="answer"]').forEach((input) => input.onchange = () => {
      state.answers[question.id] = Number(input.value); persist(); renderExam();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-question]').forEach((button) => button.onclick = () => { state.current = Number(button.dataset.question); persist(); renderExam(); });
    (document.getElementById('previous') as HTMLButtonElement).onclick = () => { if (state.current > 0) { state.current -= 1; persist(); renderExam(); } };
    document.getElementById('next')!.onclick = () => { if (state.current < state.questions.length - 1) { state.current += 1; persist(); renderExam(); } else reviewSubmission(); };
    document.getElementById('flag')!.onclick = () => { state.flagged[question.id] = !state.flagged[question.id]; persist(); renderExam(); };
    document.getElementById('submit')!.onclick = reviewSubmission;
  }

  function startTimer() {
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
      const element = document.getElementById('timer');
      if (element) {
        element.textContent = formatTime(remaining);
        element.className = remaining <= 60 ? 'danger-text' : remaining <= 300 ? 'warning-text' : '';
      }
      if (remaining <= 0) { window.clearInterval(timer); submitQuiz('timeout'); }
    }, 500);
  }

  function reviewSubmission() {
    const answered = Object.values(state.answers).filter((answer) => answer !== undefined).length;
    const unanswered = state.questions.length - answered;
    const flagged = Object.values(state.flagged).filter(Boolean).length;
    const remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
    root.innerHTML = `<main class="shell centered"><section class="exam-card confirm-card"><div class="eyebrow">Submit quiz?</div><h1>Review before submitting</h1><div class="submission-stats"><div><span>Answered</span><strong>${answered} / ${state.questions.length}</strong></div><div class="${unanswered ? 'warning-box' : ''}"><span>Unanswered</span><strong>${unanswered}</strong></div><div><span>Flagged</span><strong>${flagged}</strong></div><div><span>Time left</span><strong>${formatTime(remaining)}</strong></div></div>${unanswered ? `<p class="warning-message">You still have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}.</p>` : ''}<div class="button-row"><button id="cancel-submit" class="secondary">Return to quiz</button><button id="confirm-submit" class="primary">Submit quiz</button></div></section></main>`;
    document.getElementById('cancel-submit')!.onclick = renderExam;
    document.getElementById('confirm-submit')!.onclick = () => submitQuiz('manual');
  }

  function showFullscreenRecovery() {
    if (state.screen !== 'exam' || document.getElementById('fullscreen-recovery')) return;
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-recovery';
    overlay.className = 'security-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'fullscreen-recovery-title');
    overlay.innerHTML = `<section class="security-dialog"><div class="eyebrow">Quiz security mode</div><h1 id="fullscreen-recovery-title">Fullscreen is required</h1><p>The quiz is temporarily locked. Your timer is still running and your answers remain saved.</p><p id="fullscreen-error" class="error" role="alert"></p><div class="button-row"><button id="submit-from-fullscreen" class="secondary">Submit quiz now</button><button id="return-fullscreen" class="primary">Return to fullscreen</button></div></section>`;
    document.body.appendChild(overlay);
    document.getElementById('return-fullscreen')!.onclick = async () => {
      const button = document.getElementById('return-fullscreen') as HTMLButtonElement;
      const error = document.getElementById('fullscreen-error') as HTMLElement;
      button.disabled = true;
      error.textContent = '';
      try {
        await document.documentElement.requestFullscreen();
        overlay.remove();
        renderExam();
      } catch {
        button.disabled = false;
        error.textContent = 'Fullscreen could not be restored. Allow fullscreen access, then try again.';
      }
    };
    document.getElementById('submit-from-fullscreen')!.onclick = () => {
      if (!confirm('Submit the quiz now? Your answers will be locked and cannot be changed.')) return;
      overlay.remove();
      submitQuiz('manual');
    };
    (document.getElementById('return-fullscreen') as HTMLButtonElement).focus();
  }

  function recordViolation(type: string) {
    if (!quiz.security.enabled || state.screen !== 'exam') return;
    const now = Date.now();
    if (now - lastIncident < 1200) return;
    lastIncident = now;
    state.violations.push({ type, timestamp: new Date().toISOString() });
    persist();
    if (state.violations.length >= quiz.security.maximumViolations) {
      submitQuiz('security-limit');
      return;
    }
    if (type !== 'fullscreen-exit') {
      renderExam();
      alert(`Security event recorded: ${type.replaceAll('-', ' ')}. ${state.violations.length} of ${quiz.security.maximumViolations} violations.`);
    }
  }

  function attachSecurity() {
    document.onvisibilitychange = () => { if (document.hidden && quiz.security.detectTabSwitch) recordViolation('tab-switch'); };
    window.onblur = () => { if (!document.hidden && quiz.security.detectFocusLoss) recordViolation('focus-loss'); };
    document.onfullscreenchange = () => {
      if (!document.fullscreenElement && quiz.security.requireFullscreen) {
        if (quiz.security.detectFullscreenExit) recordViolation('fullscreen-exit');
        if (state.screen === 'exam') showFullscreenRecovery();
      }
    };
    document.oncopy = (event) => { if (quiz.security.detectCopy) { event.preventDefault(); recordViolation('copy'); } };
    document.onpaste = (event) => { if (quiz.security.detectPaste) { event.preventDefault(); recordViolation('paste'); } };
    document.oncontextmenu = (event) => { if (quiz.security.disableRightClick) event.preventDefault(); };
    document.body.classList.toggle('no-select', quiz.security.disableTextSelection);
    window.onbeforeunload = quiz.security.detectPageExit ? () => 'Your quiz is still in progress.' : null;
  }

  function detachSecurity() {
    document.onvisibilitychange = null; window.onblur = null; document.onfullscreenchange = null; document.oncopy = null; document.onpaste = null; document.oncontextmenu = null; window.onbeforeunload = null; document.body.classList.remove('no-select');
  }

  function bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return btoa(binary);
  }

  async function checksum(value: string) {
    if (!crypto?.subtle) throw new Error('SHA-256 integrity checking is not supported by this browser.');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function createQrParts(result: any) {
    const raw = new TextEncoder().encode(JSON.stringify(result));
    let bytes = raw;
    let encoding = 'base64-json';
    if ('CompressionStream' in window) {
      const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      encoding = 'gzip-base64';
    }
    const payload = bytesToBase64(bytes);
    const hash = await checksum(payload);
    // Smaller QR parts are much easier for phone cameras to read from a screen.
    const chunks = payload.match(/.{1,360}/g) || [''];
    return chunks.map((payloadChunk, index) => JSON.stringify({ format: 'QUIQ_QR', version: '1.0', resultId: result.resultId, partNumber: index + 1, totalParts: chunks.length, encoding, payloadChunk, checksum: hash }));
  }

  async function submitQuiz(reason: 'manual' | 'timeout' | 'security-limit') {
    if (state.screen === 'result' || state.submitting) return;
    state.submitting = true;
    window.clearInterval(timer);
    detachSecurity();
    const submittedAt = new Date();
    const responses = quiz.questions.map((question) => {
      const selectedAnswer = state.answers[question.id] ?? null;
      const correct = selectedAnswer === question.answer;
      return { questionId: question.id, selectedAnswer, correctAnswer: question.answer, correct, pointsAwarded: correct ? Number(question.points) : 0, choices: question.choices };
    });
    const score = responses.reduce((sum, response) => sum + response.pointsAwarded, 0);
    const totalScore = quiz.questions.reduce((sum, question) => sum + Number(question.points), 0);
    const percentage = totalScore ? Math.round((score / totalScore) * 10000) / 100 : 0;
    const nonce = Math.random().toString(36).slice(2, 8).toUpperCase();
    const result = {
      format: 'QUIQ_RESULT', version: '1.0', resultId: `${quiz.quizId}-${state.identity.studentId || 'ANON'}-A${state.attempt}-${nonce}`,
      quizId: quiz.quizId, quizTitle: quiz.quizTitle, subject: quiz.subject, section: quiz.section, teacher: quiz.teacher,
      studentName: state.identity.name, studentId: state.identity.studentId, studentSection: state.identity.section, attempt: state.attempt,
      score, totalScore, percentage, passed: percentage >= quiz.settings.passingPercentage, passingPercentage: quiz.settings.passingPercentage,
      startedAt: state.startedAt, submittedAt: submittedAt.toISOString(), durationSeconds: Math.max(0, Math.round((submittedAt.getTime() - new Date(state.startedAt).getTime()) / 1000)),
      submissionReason: reason, autoSubmitted: reason !== 'manual', violations: state.violations, responses,
    };
    try {
      state.qrParts = await createQrParts(result);
      state.result = result; state.screen = 'result'; state.qrIndex = 0;
      localStorage.removeItem(progressKey);
      localStorage.setItem(resultKey, JSON.stringify({ result, qrParts: state.qrParts }));
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      renderResult();
    } catch (error) {
      state.submitting = false;
      root.innerHTML = `<main class="shell centered"><section class="exam-card confirm-card"><div class="eyebrow">Result saved</div><h1>QR generation unavailable</h1><p class="error-block">${escapeHtml((error as Error).message)}</p><p>Your completed result is still saved on this device. Reopen this file in a modern browser to generate its QR.</p><button id="retry-result" class="primary wide">Try again</button></section></main>`;
      document.getElementById('retry-result')!.onclick = () => submitQuiz(reason);
    }
  }

  function renderResult() {
    const result = state.result;
    const attemptsUsed = getAttempts(result.studentId);
    const attemptLimitReached = attemptsUsed >= quiz.settings.allowedAttempts;
    const part = state.qrParts[state.qrIndex];
    let svg = '';
    try {
      const qr = qrcode(0, 'H'); qr.addData(part); qr.make(); svg = qr.createSvgTag(8, 4);
    } catch {
      svg = '<p class="error-block">Result data too large for this QR part.</p>';
    }
    const review = quiz.settings.showReview ? `<section class="student-review result-review"><h2>Answer review</h2>${result.responses.map((response: any) => `<div><span>${escapeHtml(response.questionId)}</span><span>Your answer: ${response.selectedAnswer === null ? 'Unanswered' : alphabet[response.selectedAnswer]}</span><strong class="${response.correct ? 'correct' : 'incorrect'}">${response.correct ? 'Correct' : 'Incorrect'}</strong>${quiz.settings.showCorrectAnswers ? `<small>Correct answer: ${alphabet[response.correctAnswer]}</small>` : ''}</div>`).join('')}</section>` : '';
    root.innerHTML = `<main class="result-shell"><section class="qr-panel"><div class="eyebrow">Scan this QR code</div><h2>Give this result to your teacher</h2><p>Keep each code steady inside the scanner frame.</p><div id="qr-code" class="qr-code" style="max-width:${state.qrSize}px">${svg}</div><div class="part-progress"><strong>QR ${state.qrIndex + 1} of ${state.qrParts.length}</strong><span>${state.qrParts.length > 1 ? 'Multi-part result — scan every part' : 'Single-part result'}</span></div><div class="qr-controls"><button id="previous-qr" class="secondary" ${state.qrIndex === 0 ? 'disabled' : ''}>Previous QR</button><button id="smaller-qr" class="secondary" aria-label="Decrease QR size">−</button><button id="larger-qr" class="secondary" aria-label="Increase QR size">+</button><button id="next-qr" class="primary" ${state.qrIndex === state.qrParts.length - 1 ? 'disabled' : ''}>Next QR</button></div>${attemptLimitReached ? '<button id="teacher-reset" class="quiet teacher-reset">Teacher reset</button>' : ''}</section><section class="result-summary"><div class="eyebrow">Quiz submitted</div><div class="result-mark ${result.passed ? 'passed' : 'failed'}">${result.passed ? 'Passed' : 'Not passed'}</div><h1>${escapeHtml(result.studentName)}</h1>${quiz.settings.showScore ? `<div class="big-score"><strong>${result.score}</strong><span>/ ${result.totalScore}</span></div>` : ''}${quiz.settings.showPercentage ? `<p class="percentage">${result.percentage}%</p>` : ''}${attemptLimitReached ? `<div class="completion-lock"><strong>Attempt limit reached</strong><p>This quiz is locked on this device. The submitted answers cannot be changed or submitted again.</p></div>` : ''}<dl class="result-details"><div><dt>Attempts used</dt><dd>${attemptsUsed} / ${quiz.settings.allowedAttempts}</dd></div><div><dt>Violations</dt><dd>${result.violations.length}</dd></div><div><dt>Submission</dt><dd>${escapeHtml(result.submissionReason)}</dd></div><div><dt>Result ID</dt><dd class="result-id">${escapeHtml(result.resultId)}</dd></div></dl></section>${review}</main>`;
    document.getElementById('previous-qr')!.onclick = () => { state.qrIndex -= 1; renderResult(); };
    document.getElementById('next-qr')!.onclick = () => { state.qrIndex += 1; renderResult(); };
    document.getElementById('smaller-qr')!.onclick = () => { state.qrSize = Math.max(300, state.qrSize - 40); renderResult(); };
    document.getElementById('larger-qr')!.onclick = () => { state.qrSize = Math.min(640, state.qrSize + 40); renderResult(); };
    document.getElementById('teacher-reset')?.addEventListener('click', resetLocalQuizData);
  }

  renderStart();
}

const studentStyles = String.raw`
  :root{color-scheme:dark;--bg:#0d1420;--panel:#151f2d;--panel2:#111a27;--line:#2a3a4e;--text:#f2f6fb;--muted:#9dacc0;--blue:#7bc1ff;--blue2:#2f8ee5;--green:#54d39a;--amber:#f3bb5a;--red:#ff7d7d;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);min-height:100vh}button,input{font:inherit}button{min-height:46px;border:1px solid transparent;padding:.7rem 1rem;font-weight:700;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid rgba(123,193,255,.45);outline-offset:2px}button:disabled{opacity:.4;cursor:not-allowed}.primary{background:var(--blue);color:#07111d}.secondary{background:transparent;color:var(--text);border-color:var(--line)}.text-button,.quiet{border:0;background:transparent;color:var(--blue);text-decoration:underline;text-underline-offset:3px}.wide{width:100%;margin-top:.7rem}.shell{width:min(1160px,calc(100% - 32px));margin:auto;padding:5vh 0}.start-shell{display:grid;grid-template-columns:1.1fr .9fr;gap:24px;align-items:start}.exam-card{background:var(--panel);border:1px solid var(--line);padding:clamp(24px,4vw,48px)}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;font-weight:800;color:var(--blue)}h1,h2,p{margin-top:0}h1{font-size:clamp(1.9rem,4vw,3.5rem);letter-spacing:-.04em;line-height:1.05}.instructions{color:var(--muted);font-size:1.05rem;line-height:1.65;max-width:60ch}.facts,.confirm-list,.result-details{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid var(--line);margin:2rem 0}.facts div,.confirm-list div,.result-details div{padding:1rem;border-bottom:1px solid var(--line)}.facts div:nth-child(odd),.confirm-list div:nth-child(odd),.result-details div:nth-child(odd){border-right:1px solid var(--line)}.facts dt,.confirm-list dt,.result-details dt{color:var(--muted);font-size:.76rem}.facts dd,.confirm-list dd,.result-details dd{margin:.35rem 0 0;font-weight:750}.teacher{color:var(--muted)}.identity-card h2{font-size:1.6rem;margin:.5rem 0}.identity-card>p{color:var(--muted);line-height:1.5}.form-grid{display:grid;gap:1rem;margin-top:1.6rem}.form-grid label{display:grid;gap:.45rem;font-size:.85rem;font-weight:700}.form-grid input{height:48px;border:1px solid var(--line);background:var(--panel2);color:var(--text);padding:0 .8rem}.error{color:var(--red);font-size:.88rem;min-height:1.2rem;margin:0}.centered{display:grid;place-items:center;min-height:100vh;padding:24px 0}.confirm-card{width:min(680px,100%)}.security-note{border-left:3px solid var(--amber);background:#312716;padding:1rem;margin:1.5rem 0}.security-note p{color:#e4cfaa;margin:.35rem 0 0;line-height:1.5}.completion-lock{border-left:3px solid var(--amber);background:#312716;padding:1rem;margin:1.5rem 0}.completion-lock p{color:#e4cfaa;margin:.35rem 0 0;line-height:1.5}.teacher-reset{margin-top:1.25rem}.security-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(7,13,22,.94);backdrop-filter:blur(8px)}.security-dialog{width:min(580px,100%);border:1px solid var(--amber);background:var(--panel);padding:clamp(24px,5vw,44px);box-shadow:0 24px 80px rgba(0,0,0,.55)}.security-dialog h1{font-size:clamp(1.8rem,5vw,2.8rem);margin:.75rem 0 1rem}.security-dialog>p:not(.error){color:var(--muted);line-height:1.6}.button-row,.question-actions,.qr-controls{display:flex;justify-content:flex-end;gap:.7rem;margin-top:1.5rem;flex-wrap:wrap}.exam-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;grid-template-rows:auto 1fr;min-height:100vh}.exam-header{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.1rem clamp(20px,4vw,60px);border-bottom:1px solid var(--line);background:var(--panel2)}.exam-header h1{font-size:1.2rem;margin:.25rem 0 0;letter-spacing:-.02em}.status-cluster{display:flex;gap:1px;background:var(--line);border:1px solid var(--line)}.status-cluster>div{display:grid;gap:.2rem;background:var(--panel);padding:.7rem 1rem;min-width:120px}.status-cluster span{font-size:.68rem;color:var(--muted);text-transform:uppercase}.status-cluster strong{font-size:1.15rem}.question-panel{padding:clamp(28px,6vw,80px);max-width:950px;width:100%;margin:0 auto}.question-meta{display:flex;justify-content:space-between;color:var(--muted);font-size:.8rem;text-transform:uppercase;font-weight:800;letter-spacing:.08em}.question-panel h2{font-size:clamp(1.4rem,3vw,2.2rem);line-height:1.35;margin:1rem 0 2rem}.choices{display:grid;gap:.75rem}.choice{display:grid;grid-template-columns:28px 34px 1fr;align-items:center;gap:.75rem;border:1px solid var(--line);background:var(--panel);padding:1rem;cursor:pointer;line-height:1.45}.choice:hover,.choice.selected{border-color:var(--blue);background:#17283a}.choice input{width:18px;height:18px}.choice-letter{font-weight:800;color:var(--blue)}.flag{background:transparent;border-color:var(--amber);color:var(--amber);margin-right:auto}.flag.active{background:#3a2c12}.navigator{border-left:1px solid var(--line);background:var(--panel2);padding:1.5rem;position:sticky;top:0;height:calc(100vh - 84px)}.navigator-heading{display:flex;justify-content:space-between;gap:1rem}.navigator-heading div{display:grid;gap:.25rem}.navigator-heading span{color:var(--muted);font-size:.75rem}.progress{height:6px;background:var(--line);margin:1rem 0 1.5rem}.progress span{display:block;height:100%;background:var(--blue)}.question-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:.45rem}.nav-number{position:relative;background:var(--panel);color:var(--muted);border-color:var(--line);padding:.4rem;min-height:44px}.nav-number b{position:absolute;right:3px;bottom:1px;font-size:.62rem}.nav-number.answered{color:var(--green);border-color:#326c55}.nav-number.current{outline:2px solid var(--blue);color:var(--text)}.nav-number.flagged b{color:var(--amber)}.submit-button{width:100%;margin-top:1.5rem;background:transparent;border-color:var(--red);color:var(--red)}.warning-text{color:var(--amber)}.danger-text{color:var(--red)}.submission-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin:2rem 0}.submission-stats>div{display:grid;gap:.35rem;background:var(--panel2);padding:1rem}.submission-stats span{color:var(--muted);font-size:.75rem}.warning-box strong{color:var(--amber)}.warning-message,.error-block{padding:1rem;border:1px solid #6d5524;background:#322714;color:#f4d9a7}.result-shell{display:grid;grid-template-columns:.85fr 1.15fr;min-height:100vh}.result-summary,.qr-panel{padding:clamp(30px,6vw,80px);display:flex;flex-direction:column;justify-content:center}.result-summary{background:var(--panel2)}.qr-panel{align-items:center;text-align:center}.result-mark{font-size:.82rem;text-transform:uppercase;letter-spacing:.1em;font-weight:800;margin:1.2rem 0}.result-mark.passed{color:var(--green)}.result-mark.failed{color:var(--red)}.big-score{display:flex;align-items:baseline;gap:.6rem}.big-score strong{font-size:clamp(4rem,9vw,7rem);letter-spacing:-.08em}.big-score span{font-size:1.6rem;color:var(--muted)}.percentage{font-size:1.5rem;color:var(--blue)}.result-id{font-family:ui-monospace,monospace;overflow-wrap:anywhere}.student-review{border:1px solid var(--line);padding:1rem}.student-review h2{font-size:1rem}.student-review>div{display:grid;grid-template-columns:75px 1fr auto;gap:.6rem;padding:.6rem 0;border-top:1px solid var(--line);font-size:.8rem}.student-review small{grid-column:2/-1;color:var(--muted)}.student-review .correct{color:var(--green)}.student-review .incorrect{color:var(--red)}.qr-code{width:100%;background:#fff;padding:12px;margin:1.5rem auto}.qr-code svg{display:block;width:100%;height:auto}.part-progress{display:grid;gap:.3rem}.part-progress span{color:var(--muted);font-size:.8rem}footer{text-align:center;padding:1rem}.no-select{user-select:none}@media(max-width:850px){.start-shell,.result-shell{grid-template-columns:1fr}.exam-layout{display:block}.exam-header{position:sticky;top:0;z-index:3}.navigator{position:static;height:auto;border-left:0;border-top:1px solid var(--line)}.question-panel{padding:28px 18px}.status-cluster>div{min-width:auto}.question-actions{justify-content:stretch}.question-actions button{flex:1}.flag{order:3;flex-basis:100%!important}.submission-stats{grid-template-columns:1fr 1fr}}@media(max-width:560px){.facts,.confirm-list,.result-details{grid-template-columns:1fr}.facts div:nth-child(odd),.confirm-list div:nth-child(odd),.result-details div:nth-child(odd){border-right:0}.exam-header{align-items:flex-start}.exam-header>div:first-child{display:none}.status-cluster{width:100%}.status-cluster>div{flex:1}.button-row>*{width:100%}.qr-controls{display:grid;grid-template-columns:1fr 52px 52px 1fr;width:100%}}
  /* Keep the scannable result first; the review is always below it. */
  .result-summary{grid-column:1;grid-row:1}.qr-panel{grid-column:2;grid-row:1}.result-review{grid-column:1/-1;grid-row:2;width:min(1080px,calc(100% - 32px));margin:0 auto 48px;background:var(--panel)}
  @media(max-width:850px){.result-shell{display:flex;flex-direction:column}.qr-panel{order:1;min-height:100svh}.result-summary{order:2}.result-review{order:3;width:calc(100% - 32px);margin:0 auto 32px}}
`;

export async function generateStudentQuizHtml(quiz: Quiz, qrLibrarySource: string) {
  const quizJson = JSON.stringify(quiz).replaceAll('</script', '<\\/script');
  const applicationFunction = studentQuizApplication.toString().replace(/^function\s+studentQuizApplication/, 'function');
  const applicationSource = `${qrLibrarySource}\n;(${applicationFunction})(${quizJson});`;
  const obfuscatorModule = await import('javascript-obfuscator') as typeof import('javascript-obfuscator') & {
    default?: typeof import('javascript-obfuscator');
  };
  const runObfuscator = obfuscatorModule.obfuscate || obfuscatorModule.default?.obfuscate;
  if (!runObfuscator) throw new Error('JavaScript obfuscation is unavailable.');
  const protectedSource = runObfuscator(applicationSource, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.12,
    identifierNamesGenerator: 'hexadecimal',
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 1,
    transformObjectKeys: true,
  }).getObfuscatedCode().replaceAll('</script', '<\\/script');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${quiz.quizTitle.replaceAll('<', '&lt;')} — Student Quiz</title><style>${studentStyles}</style></head>
<body><div id="app"></div><noscript>This quiz requires JavaScript. Open it in a modern browser.</noscript><script>/* QR Code Generator for JavaScript, Copyright (c) 2009 Kazuhiko Arase, MIT License. */${protectedSource}</script></body></html>`;
}

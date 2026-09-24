# Quiq Offline Quiz + QR Result System

Quiq is a local-first classroom examination system with three connected modules:

1. **Quiz Creator** — teachers build, validate, preview, import, and export quizzes.
2. **Standalone Student Quiz** — a single exported HTML file runs without a server or internet connection.
3. **Teacher Scanner PWA** — teachers scan result QR codes, store records in IndexedDB, review scores, calculate item analysis, export CSV files, and back up the database.

Student records are not sent to a server. There are no accounts, analytics, or cloud database dependencies.

## Project structure

```text
app/
  page.tsx                  Quiz Creator route
  scanner/                  Scanner PWA route and metadata
components/
  admin-app.tsx             Quiz Creator UI and workflows
  scanner-app.tsx           Camera scanner, results, analysis, exports, backup
lib/
  quiz-types.ts             Quiz/result data models and validation
  export-student.ts         Standalone student HTML generator
  database.ts               IndexedDB result storage
  analytics.ts              Statistics, item analysis, and CSV generation
public/
  manifest.webmanifest      PWA manifest
  service-worker.js         Offline cache
  quiq-icon.svg             PWA icon
examples/
  sample-quiz.json
  sample-result.json
  sample-backup.json
```

## Run the application

Requirements for development are Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

Open the printed local address. The Quiz Creator is at `/`; the teacher scanner is at `/scanner`.

For a production check:

```bash
npm run build
```

For a Netlify production check:

```bash
npm run build:netlify
```

## Deploy with GitHub and Netlify

The repository includes `netlify.toml` and a dedicated Nitro build for Netlify. The existing local and Cloudflare build remains available through `npm run build`.

1. Push this project to a private GitHub repository.
2. In Netlify, choose **Add new project** and **Import an existing project**.
3. Select GitHub and choose the repository.
4. Netlify will read the committed build command and publish directory; select **Deploy**.
5. After the first deployment, open `/scanner` on the HTTPS Netlify URL and allow camera permission.

Every push to the connected GitHub branch creates a new Netlify deployment. Quiz drafts, attempts, and scanned results remain browser-local; deploying the app does not upload that data to a database.

Normal student use does **not** require Node.js. Students receive the exported `.html` file and double-click it.

## Create a quiz

1. Open the Quiz Creator.
2. Complete Quiz Information. Quiz ID is the stable identifier shared by the student file and result database.
3. Add Multiple Choice or True/False questions.
4. Choose the correct answer and point value for every question.
5. Reorder, duplicate, or delete questions as needed.
6. Configure timing, attempts, passing percentage, randomization, required identity fields, result visibility, and resume behavior.
7. Configure optional security monitoring.
8. Check the Student Preview.
9. Open Import & Export and select **Export standalone quiz**.

The editor saves the current quiz automatically in browser local storage. Import & Export also provides explicit Save Draft, Load Draft, and Delete Draft controls.

### Permanent question IDs

Every response uses the immutable question `id`, never its displayed number. If questions are randomized, `Q001` might appear as Question 17 but is still recorded as `Q001`. When choices are randomized, each displayed option carries its original answer index so scoring and item analysis remain correct.

## Import and export quiz JSON

Use **Export JSON** to keep an editable quiz source. Use **Import JSON** to load it on another device.

Imports validate:

- supported format version;
- Quiz ID and title;
- at least one question;
- unique permanent question IDs;
- supported question type;
- two to eight choices;
- a valid correct-answer index; and
- a positive point value.

Validation errors identify the affected question whenever possible.

## One QR with a student list (recommended)

1. Import or create the questions in Quiz Creator.
2. Open **Students / One QR**, paste one student name per line, and select **Add names**. This enables one-QR mode and assigns stable numbers `01` through `99`. Removing a name does not renumber other students.
   Use **Delete all students** to replace the whole roster after confirmation. This clears only the maker's current list, not saved scanner results or exported files. Add the replacement list and re-export both the student HTML and scanner setup.
3. Finish the answer key, then export the **student quiz HTML** and **scanner setup JSON**. Give students only the HTML. The setup contains the teacher's answer key and roster.
4. In Scanner, select **Load scanner setup** and choose the matching `.scanner.json` file. On the maker's device you can also use **Use maker draft on this device**.
5. Students find and select their name, confirm it, and complete the exam. Scan their single result QR and save. The camera resumes after saving or skipping an already saved result.
6. After scanning, open **More**, choose the exam/student list, enter the section, and export scores, answers, or item-analysis CSV. Section is applied only to that file, not stored in the compact QR or changed in saved records.

The payload is `01-121304...-EXAMCHECKCODE`: two-digit roster number, one answer digit per question, and a 12-character exam code. Digits `1–4` mean original choices A–D (`5–8` are supported when needed); `1/2` mean True/False; `0` means unanswered. Answers always follow the original question order, regardless of shuffled display order. A 60-question result uses only 76 characters. The teacher setup reconstructs names, question text, answer keys, weighted scores, item analysis, and checked PDFs.

One-QR mode supports 1–99 students, 1–200 questions, and one final result per student. Repeated scans have a stable result identity and do not overwrite an existing result. Changing names, question order/content, answer keys, points, or passing marks changes the exam code: export both files again. A mismatched setup is rejected instead of grading against the wrong exam. The code detects setup mismatches, not deliberate answer tampering.

Compact PDFs show original quiz order and original answer letters. Exam timing, detailed security events, and the student's randomized display order are not transmitted. The scanner labels the record with its scan time; CSV leaves unavailable submission/security fields blank. Security controls still operate inside the student exam. Full mode remains available for detailed timing/security records, and old Simple/Full QR results are still supported.

Tests: `npx --yes --package tsx tsx --test tests/compact-qr.test.ts tests/checked-paper.test.ts`.

## Checked student papers (One QR and Full mode)

Use the one-QR setup above, or set **Quiz settings > QR result mode > Full** and export a new standalone quiz. After students submit, scan and save their result. Open **Scanner > Results**, select a student, then choose **Export checked paper PDF**.

The A4 PDF includes the student's identity, questions and choices in their displayed order, selected and correct answers, correctness marks, points per item, and the final score and percentage. PDF generation happens on the teacher's device. The PDF fonts are bundled with the app. Load the export once online before using it offline so the browser can cache its code and fonts.

Older Full-mode results can export recorded answers and grades, with missing question text clearly indicated. Existing exported quiz HTML files do not update automatically; re-export the quiz to capture full question text and displayed order. Simple-mode results have no item responses and cannot export checked papers. The added text in new Full results can increase the number of QR parts.

PDF regression checks: `npx --yes --package tsx tsx --test tests/checked-paper.test.ts`.

### Bulk checked papers

Individual and bulk PDFs include the supplied Bukidnon State University image as a header on every page, with reserved space above the exam content. The header is bundled locally and cached by the service worker for offline use after the updated app has loaded online.

In **Scanner > Results**, use **Bulk student test papers**. Select the exam/student list, enter the section (required when missing from saved records), then choose **Download all student PDFs**. This downloads one combined A4 PDF; each student's checked paper starts on a new page with its own page numbering. Names, questions, choices, selected/correct answers, marks, and final scores are included, using the same question-order rules as individual PDFs.

Bulk export includes every eligible saved result in the selected exam group, across all result pages; search and status filters do not limit it. Papers are sorted by student number, with separate papers for recorded attempts. Simple-mode/empty results are excluded with a visible count, and older results missing question text are flagged. The section entered affects only the PDF, not stored records. Different exam codes are kept in separate groups; legacy results are also grouped by their saved section. Keep this screen open while a large class is being generated.

## Standalone student quiz

The exported file is named from Quiz ID, for example `IT123-Q1-2026.html`. It embeds quiz data, styling, timer, attempt controls, security monitoring, scoring, result integrity checking, compression, multi-part QR support, and the QR generator library. The embedded JavaScript and quiz payload are obfuscated during export with mangled identifiers, encoded strings, transformed control flow, and injected dead code to discourage casual source inspection.

Obfuscation is tamper deterrence, not perfect secrecy. A standalone offline browser file must eventually execute its answer-checking logic, so a technically knowledgeable person with enough time can still analyze or modify it.

Students can copy the file to a computer and double-click it. No web server or internet connection is required.

### Starting and identity confirmation

Required identity fields cannot be blank. Before the timer starts, the student reviews their name, Student ID, section, and attempts used. If fullscreen is required, the timer begins only after fullscreen is entered.

### Timer and resume

The quiz stores an absolute end timestamp rather than a remaining-seconds counter. Refreshing cannot reset the time. When resume is enabled, the exported file restores identity, question order, randomized choice mapping, answers, flagged items, current question, violations, attempt number, and the original end timestamp.

At zero, the quiz submits with `submissionReason: "timeout"`. Reaching the configured security limit can submit with `submissionReason: "security-limit"`.

### Attempts

Attempts are keyed by Quiz ID and Student ID in local browser storage. When the configured limit is reached (one attempt by default), reopening the quiz goes directly to the locked submitted-result screen. The student can display the saved QR again but cannot edit answers or submit again. The result screen shows **Attempts used** as a count such as `1 / 1`.

The teacher configures a reset password in **Quiz settings** before exporting. **Teacher reset** requires that password before clearing attempts, saved progress, and the submitted result. The reset password is an offline classroom control, not strong cryptographic security: a technically knowledgeable user can inspect a standalone HTML file or clear browser storage.

Browser-side attempt controls are a practical deterrent, not an unbreakable control. Clearing browser storage or editing client code can bypass them.

### Security monitoring

Optional checks include fullscreen, tab switching, focus loss, fullscreen exit, copy, paste, right click, text selection, and page exit. Related browser events are debounced so one tab-switch incident is not counted repeatedly as both a visibility change and focus loss. When required fullscreen is exited, the questions are covered by a security prompt while the timer continues. The student must choose **Return to fullscreen** or **Submit quiz now**; browsers require this user action before fullscreen can be restored.

The maximum-violation limit is absolute. Reaching it immediately ends and submits the quiz, locks all answers, calculates the result, and records `submissionReason: "security-limit"`. Older imported quizzes configured as “warning only” are automatically upgraded to this behavior.

Security events are stored with timestamps and included in the result. These controls provide monitoring and tamper deterrence. A standalone HTML file cannot guarantee cryptographically secure exam authenticity because a knowledgeable student can inspect its code and data.

### Scoring and result QR

Submission locks answers and calculates raw score, total score, percentage, and pass/fail from the configured threshold. The result preserves every original Question ID, selected original answer index, correct answer, correctness, and awarded points.

The result JSON is compressed with the browser `CompressionStream` API when available, base64 encoded, and protected with a SHA-256 checksum. If it does not fit one practical QR chunk, the student sees numbered QR parts. Every part includes Result ID, part number, total parts, encoding, payload chunk, and whole-payload checksum. The scanner does not save until all parts are present and the reconstructed checksum is valid.

## Install the Teacher Scanner PWA

1. Open `/scanner` once while online or on the same local network as the running application.
2. Wait for the page to finish loading so the service worker can cache the app shell and locally bundled QR decoder.
3. Use the browser's **Install app**, **Add to Home Screen**, or equivalent command.
4. Reopen the installed app. Previously cached core screens and stored records remain available offline.

Camera access requires a secure browser context. Production must use HTTPS; local development can use `localhost`. A scanner page opened directly with `file://` cannot reliably receive camera permission.

## Scan results

1. Open Scanner, select **Start camera**, and allow camera permission.
2. Place the student's QR inside the frame. Rear-facing camera is requested by default.
3. For multi-part results, scan every numbered part. Re-scanning a part is harmless.
4. Quiq validates the envelope, format version, required fields, SHA-256 checksum, Result ID, and part consistency.
5. Review the student, class, quiz, score, attempt, violations, and submission time.
6. Select **Save result**.

The scanner checks duplicates by Result ID and secondarily by Quiz ID + Exam Code + Student ID + Attempt. Exact duplicates can be skipped to return to the camera. A secondary duplicate requires explicit confirmation before saving separately.

Manual compact-code or QR JSON input is available for desktop testing or camera-restricted devices.

## Results and item analysis

Results are stored in IndexedDB and persist after browser or PWA restarts. The dashboard calculates unique students, total results, average percentage, highest percentage, lowest percentage, and passing rate. Search covers student name, Student ID, quiz, Quiz ID, subject, and section. Status filtering and 20-row pagination support larger classes.

Opening a record shows score, percentage, pass/fail, timing, submission reason, Result ID, security totals, and the response review by permanent Question ID.

Item analysis groups every response by Quiz ID and permanent Question ID. It calculates total responses, correct, incorrect, percent correct, difficulty, most-selected option, and a compact percentage-correct chart.

Default difficulty thresholds are:

- 0–30%: Difficult
- 31–70%: Moderate
- 71–100%: Easy

## CSV export

The More screen exports:

- **Results CSV** — one row per submission with student, score, timing, attempt, and security fields.
- **Responses CSV** — one column per permanent Question ID, plus correct/incorrect columns.
- **Item Analysis CSV** — totals, correctness percentages, difficulty, and most-selected answer.

Filenames use Quiz ID and section, for example `IT123-Q1-2026_BSIT-2A_RESULTS.csv`.

## Backup and restore

**Backup database** downloads every stored result as `quiz-scanner-backup-YYYY-MM-DD.json`.

**Restore backup** validates the backup format and result records, then asks whether to:

- replace the current database; or
- merge records by Result ID.

No existing data is overwritten silently. Back up before clearing browser data, changing devices, or choosing replacement.

## Troubleshooting

### Camera permission denied

- Open browser site settings and allow camera access.
- Reload Scanner and select Start Camera again.
- Verify the scanner is served over HTTPS or `localhost`.
- On iPhone or iPad, check Safari camera permissions and use Add to Home Screen after the first successful load.

### No camera available

- Close other applications that may be using the camera.
- Use Switch Camera when more than one device is available.
- Paste captured `QUIQ_QR` JSON into Manual Data Input for testing.

### Invalid or incomplete QR

- Confirm the code came from a Quiq student result screen.
- For multi-part results, scan every part from the same Result ID.
- Re-display the affected QR at a larger size and increase screen brightness.
- A checksum failure means the reconstructed data is damaged; it is not saved.

### Offline page does not reopen

- Load Scanner once with connectivity so its service worker can cache the route and bundled assets.
- Do not use private-browsing mode, which may discard IndexedDB and service-worker caches.
- Check that browser storage has not been cleared.

## Included samples

- `examples/sample-quiz.json` can be imported into the Quiz Creator.
- `examples/sample-result.json` demonstrates the normalized result model.
- `examples/sample-backup.json` can be restored in the scanner.

The QR scanner accepts compact one-QR results with matching scanner setup, or legacy `QUIQ_QR` envelopes with a valid checksum. The plain sample result is documentation and test data.

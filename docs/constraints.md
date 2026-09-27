# Constraints

[← Back to README](../README.md)

**Project:** HireZap — AI Powered Recruitment Platform

## A note on this file

The official HackMysuru template's "Five Hard Constraints" (fake/spam reports, unclear jurisdiction, prioritisation, bad input, offline operation) are written for a **civic waste-routing problem**, matching a different project. HireZap is a hiring platform, so those five don't transfer directly. Below are hiring-appropriate constraints in the same spirit — check with the organizers whether this substitution is acceptable for your track, or whether the original five must be addressed instead.

## Proposed constraints for a hiring platform

| # | Constraint | Status | Video |
|---|---|---|---|
| 1 | Fake or duplicate applications | Addressed | `Application and candidate records are handled through the platform |
| 2 | Fair, consistent scoring across candidates | Addressed | AI-assissted candidate assessment  |
| 3 | Interview integrity (cheating, impersonation) | Addressed | Tab-switch detection during the interview |
| 4 | Bad input (unreadable resume, camera/mic failure, dropped connection) | Addressed | Resume,camera and microphone checks |
| 5 | Candidate data privacy (video, resume, score) | Addressed | Candidate and interview data handled through the application backend |

---

## 1. Fake or duplicate applications

- **Approach:** HireZap maintains candidate/application records so that applications can be
associated with the appropriate candidate and recruitment process.
- **Code:** src/, supabase/

## 2. Fair, consistent scoring

- **Approach:** AI-assisted candidate assessment is used as supporting information during the
recruitment process. Candidate assessment should be generated using the same
defined evaluation process for candidates being assessed.
- **Why it's fair:** Using a consistent assessment process helps make candidate results comparable.
The AI-generated score is not intended to independently make the final hiring
decision.
- **Code:** supabase/functions/

## 3. Interview integrity

- **Approach:** tab-switch detection is already implemented (per recent commits);.
- **Code:** `src/pages/<Before Interview / interview page>`

## 4. Bad input

| Input | What HireZap does |
|---|---|
| Unreadable or malformed resume | Validates/handles the input before it is used |
| Camera/microphone not available | Checks camera/microphone availability before or during the interview |
| Interview disconnects mid-way | The interview flow depends on an active connection to the required services |

## 5. Candidate data privacy

- **What's stored:** Candidate/application information,interview-related information and assessment results are stored using the application's backend and database services
- **Who can see it:** Candidate information is intended to be accessible only through the appropriate candidate and HR/recruitment workflows
- **Code:** supabase/migrations/ (row-level security rules)

## Deployment and dependency constraints (confirmed)

- **Frontend:** React + Vite + TypeScript, no separate backend server — Supabase is the backend.
- **Third-party dependencies at runtime:** a video-call SDK for the live interview, and a face/pose-tracking library for the proctoring signal. Both need browser camera/microphone permission and a stable connection; there's no confirmed fallback if either is denied or fails.
- **PDF generation** (`jspdf`, `html2pdf.js`) runs in the browser.
- **No offline mode was found or implied** anywhere in the repository; the app needs a live connection to Supabase, the video SDK and (if hosted externally) the face-tracking model.

## Not found in the repository

`<Fill in after checking: CI/CD config, test script in package.json, LICENSE file, CONTRIBUTING.md>`

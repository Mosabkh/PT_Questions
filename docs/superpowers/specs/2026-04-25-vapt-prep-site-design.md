# VAPT Interview Prep — Local MCQ Trainer

**Date:** 2026-04-25
**Author:** Mosab Khalifeh (with Claude)
**Target:** Senior VAPT interview on 2026-04-26 (dairy/food factory employer)
**Status:** Approved for implementation

## Goal

A small, single-user, offline web app that drills the user on ~100 senior-level
penetration-testing multiple-choice questions before tomorrow's interview. The
app must produce a per-cycle score, surface weak topics, and — when the user
answers wrong — explain the correct answer in plain English with a citation to
a trusted authority before letting them advance.

## Constraints

- **Phase 1 usable within ~45 min** (skeleton + 30 questions); Phase 2 expands to
  100 questions and takes longer (realistic: 2–3 hours total). The user can
  start studying immediately after Phase 1 while Phase 2 lands incrementally.
- Runs locally on Windows by double-clicking `index.html` — **no `fetch()`, no
  server required**. Question files are plain `.js` files loaded with `<script>`
  tags, which works on `file://` in every browser.
- No accounts, no server-side state, no external network calls at runtime.
- Single user (Mosab) — no auth, no multi-tenancy.

## Non-goals (deliberately out of scope)

- Spaced repetition with SM-2 / FSRS algorithm — Leitner-lite is enough for a
  one-day horizon.
- Voice / speech-to-text / images / animations.
- Charts library — score trend uses inline SVG.
- "Pick all that apply" or short-answer questions — all questions are 4-choice
  single-select MCQ.
- Sync, accounts, exports.
- Cloud-security questions (dropped per user direction).

## Topic distribution (100 questions)

| Topic | Count | Coverage |
|---|---|---|
| Web app | 30 | OWASP Top 10 deep dives, business logic, auth bypass, SSRF, deserialization, file upload, race conditions, CORS |
| Active Directory | 25 | Kerberos (kerberoast / AS-REP roast), NTLM relay, ADCS (ESC1–ESC8), BloodHound paths, delegation, GPO abuse, lateral movement |
| Network | 25 | Nmap scanning, service exploitation (SMB/RDP/LDAP/NFS), pivoting, protocol weaknesses, MITM. Includes 2–3 OT/ICS-aware questions for the dairy-factory context (Modbus awareness, IT/OT segmentation, scanning OT subnets safely). |
| Mobile app | 20 | OWASP MASVS / MASTG, Android/iOS storage, SSL pinning bypass, Frida / Objection, deep links, IPC, MobSF |

## Trusted-authority sourcing

Two distinct roles, kept separate:

**Discovery sources** (used to find which questions are commonly asked) —
treated as community references, not authorities:
- HackTricks
- Public GitHub aggregator repos that compile real senior pentest interview
  questions (we prioritize questions that appear across multiple independent
  lists)

**Authority sources** (the citation that backs the *answer* in `source.url`) —
must be one of:

| Topic | Authoritative sources |
|---|---|
| Web | PortSwigger Web Security Academy, OWASP Testing Guide v4, OWASP Top 10, OWASP ASVS, MDN/RFCs |
| AD | MITRE ATT&CK technique pages, Microsoft official Kerberos / NTLM / ADCS docs, SpecterOps research blog, ADSecurity.org articles by Sean Metcalf |
| Network | NIST SP 800-115, official Nmap docs, Impacket project docs, IETF RFCs, vendor docs (Cisco, Microsoft) |
| Mobile | OWASP MASVS, OWASP MASTG, OWASP Mobile Top 10, official Android / iOS developer docs |

**Sourcing rule:** if the answer cannot be backed by a real, verifiable URL from
the authority list, the question is **dropped**, not faked. HackTricks and
aggregator repos are NEVER used as the citation — only as discovery for which
topics matter. Codex's role is validation (sanity-check a sample of answers
against the authority sources), not authoring.

## Architecture

```
Preparing_PT_Interview/
  index.html              # markup shell; <script> tags pull in topic banks then app.js
  styles.css              # dark, distraction-free
  app.js                  # vanilla JS: cycle logic, Leitner state, rendering (~300 lines)
  questions/
    web.js                # window.QUESTION_BANK.web   = [ ... 30 items ... ];
    ad.js                 # window.QUESTION_BANK.ad    = [ ... 25 items ... ];
    network.js            # window.QUESTION_BANK.network = [ ... 25 items ... ];
    mobile.js             # window.QUESTION_BANK.mobile = [ ... 20 items ... ];
  README.md               # how to run
```

`index.html` declares `<script>window.QUESTION_BANK = {};</script>` then loads
each `questions/<topic>.js` via `<script src="questions/<topic>.js">`. No
`fetch()`, no manifest file, works directly on `file://` by double-click.

**Scalability:** to add a new topic, create `questions/<topic>.js`, add a
`<script>` tag in `index.html`, and append the topic name to the topic-filter
list in `app.js`. To add more questions to an existing topic, append to the
array in that file — no code changes required.

### Question schema (per item)

```json
{
  "id": "web-001",
  "topic": "web",
  "subtopic": "ssrf",
  "difficulty": "senior",
  "question": "...",
  "choices": ["A ...", "B ...", "C ...", "D ..."],
  "correctIndex": 2,
  "explanation": "Plain-English: why the correct answer is correct (2–3 sentences).",
  "distractorRationale": {
    "0": "Why choice A is wrong / what concept it confuses with the right answer",
    "1": "Why choice B is wrong",
    "3": "Why choice D is wrong"
  },
  "source": {
    "name": "PortSwigger Web Security Academy — SSRF",
    "url": "https://portswigger.net/web-security/ssrf"
  }
}
```

`distractorRationale` is keyed by choice index; the correct index is omitted.
The wrong-answer panel always shows: (a) the right answer + `explanation`,
(b) the user's chosen distractor rationale (so they learn *exactly* what they
got confused), (c) the source link.

## User experience

### Home screen
- Big "Start Cycle" button.
- Topic filter chips (All / Web / AD / Network / Mobile / Weak-areas-only).
  - **Weak-areas-only empty state:** if no question is yet in the Learning
    bucket, the chip is disabled and a tooltip says "Run a normal cycle first
    to find your weak areas."
- **[P2]** 7-cycle score trend (inline SVG sparkline) — empty until 2+ cycles done.
- **[P2]** Per-topic mastery summary (% correct, count of questions seen).
- **[P2]** Export / Import buttons — JSON dump and load of `localStorage` state,
  for resilience against private mode / browser reset / accidental clear.

### Cycle flow (20 questions)
- Question text on top, four choices stacked.
- Click a choice → answer locks (no take-back).
- **If wrong:** chosen choice highlighted red; correct choice highlighted green;
  an **Explanation panel** slides in containing:
  - "**The correct answer is X**" with the question's `explanation`
  - "**Why your choice was wrong:**" with the matching entry from
    `distractorRationale` for the user's choice
  - "**Source:** [authority name]" — link opens the authority page in a new tab
  - Single **Next →** button advances. No auto-advance.
- **If correct:** brief green confirmation + 1-line explanation + Source link + Next →.
- Progress indicator ("Q 7 / 20") at the top.

### End-of-cycle screen
- Cycle score (X / 20), per-topic breakdown.
- List of every wrong answer in this cycle with their explanations + Source
  links (so the user can review them in one scroll).
- Updated 7-cycle trend.
- Buttons: Start Another Cycle, Back to Home.

## Rating logic (Leitner-lite)

Per-question state stored in `localStorage`:

```json
{ "id": "web-001", "seen": 3, "correct": 2, "wrong": 1, "lastSeen": 1745625600000, "bucket": "learning" }
```

Three buckets:

- **New** — never seen.
- **Learning** — seen and got wrong at least once recently, OR not yet promoted.
- **Mastered** — answered correctly twice in a row.

Cycle picker draws 20 questions from a weighted pool:

- 60% Learning
- 25% New (until none left, then redistributed)
- 15% Mastered (refresh sample)

After each answer:

- Wrong → bucket = Learning, reset consecutive-correct counter.
- Right → consecutive-correct counter +1. If >= 2, promote to Mastered. (Mastered
  → wrong demotes back to Learning.)

Topic filter narrows the pool before bucket weighting. "Weak-areas-only" filters
to bucket = Learning before weighting.

## Error handling

- Topic-bank script fails to load → `window.QUESTION_BANK[topic]` will be
  undefined; app filters those out at startup and shows a banner listing which
  topic files are missing.
- Malformed question (missing `correctIndex`, `choices.length != 4`, or no
  `source.url`) → skip that question, log to console, continue.
- `localStorage` unavailable (private mode) or quota → app still works; stats
  won't persist across reloads. Banner advises: "Use Export to save state
  manually."

## Testing approach

Smoke-test checklist after build:
- [ ] Manifest loads all four topic files.
- [ ] Cycle of 20 includes a mix from at least 3 of the 4 topics.
- [ ] Wrong answer triggers explanation panel and Source link opens externally.
- [ ] Right answer shows brief confirmation and advances on Next.
- [ ] End-of-cycle screen lists all wrong answers.
- [ ] Reload preserves bucket state and trend line.
- [ ] Topic filter restricts pool correctly.
- [ ] "Weak-areas-only" returns nothing on first run, populates after wrong answers.

No automated tests for this project — the cost outweighs the benefit on a
one-day, single-user, throwaway-grade tool.

## Build sequence (phased, realistic estimates)

**Phase 1 — usable app + first 30 questions (~45 min)** — minimum viable for
tomorrow:

1. Skeleton `index.html` + `styles.css` + `app.js` with 5 hard-coded sample
   questions; validate the full cycle loop including the wrong-answer panel
   with `distractorRationale`. (~15 min)
2. Source and author the first 30 questions (~10 each across web / AD /
   network / mobile, plus a few extra in web), citing authority URLs. Each
   topic file written incrementally. (~25 min)
3. End-of-cycle screen with score + wrong-answer review list. (~5 min)

After Phase 1, the user can study a real cycle while Phase 2 lands.

**Phase 2 — expand to 100 questions + polish (~90–120 min)**:

4. Author the remaining ~70 questions topic by topic, with Codex spot-checking
   a sample of answers against authority sources at the end. (~70–90 min)
5. **[P2]** Sparkline trend on home screen. (~10 min)
6. **[P2]** Per-topic mastery summary. (~10 min)
7. **[P2]** Export / Import buttons for `localStorage` state. (~10 min)
8. Final smoke-test pass. (~10 min)

**Cut order if time slips:** drop sparkline → drop per-topic mastery → drop
export/import → reduce question count below 100. Never compromise on
authority-backed citations or distractor rationales.

## Open questions / assumptions

- Project folder is not a git repo. We are NOT initializing one for tomorrow's
  scope — if user later wants version control, run `git init` then.
- The "famous senior interview questions" claim is best-effort: there is no
  canonical list. We bias toward questions that appear across multiple public
  aggregator repos and have authority-backed answers.

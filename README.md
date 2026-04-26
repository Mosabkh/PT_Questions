# PT Questions — Senior VAPT Question Bank

Single-user, offline web app for drilling senior-level penetration-testing
multiple-choice questions across web, Active Directory, network, and mobile.

## How to run

**Just double-click `index.html`.** It opens in your default browser and runs
entirely from disk — no server, no install, no network.

If your browser refuses to load the JS files via `file://` (rare, mostly old
Safari), open a terminal in this folder and run:

```
python -m http.server 8000
```

Then go to <http://localhost:8000/>.

## What it does

- 20-question cycles drawn from a Leitner-weighted pool (60% from your weak
  questions, 25% new, 15% mastered).
- Click an answer → it locks. Wrong answers reveal:
  - the correct choice (highlighted green)
  - your wrong choice (highlighted red)
  - a plain-English explanation of *why* the correct answer is correct
  - a plain-English explanation of *why your specific wrong choice was wrong*
  - a "Source" link to the authority (OWASP / MITRE / Microsoft / PortSwigger / NIST)
- End of cycle: score, per-topic breakdown, and a scrollable list of every
  wrong answer with explanations and source links.
- Progress is stored in `localStorage`. Press `R` (anywhere on the page) to
  reset everything.

## Topic breakdown (250 questions)

| Topic | Count | Authority sources |
|---|---|---|
| Web app | 75 | PortSwigger Web Security Academy, OWASP Top 10 / Testing Guide / ASVS / cheat sheets / API Top 10, MITRE CWE, FIRST CVSS, IETF RFCs, AWS / Azure / Apache / Spring official docs |
| Active Directory | 60 | MITRE ATT&CK, Microsoft Learn (Kerberos / NTLM / ADCS / LAPS / gMSA / Credential Guard / Tier 0), SpecterOps research, ADSecurity (Sean Metcalf), MSRC advisories |
| Network | 60 | Nmap official docs, Microsoft Learn, MITRE ATT&CK / D3FEND, NIST SP 800-115 / 800-82 / 800-52, IETF RFCs, vendor docs (Cisco, Postfix, Tenable, Docker, Kubernetes, Elastic, MongoDB, Redis), CISA / CERT-CC |
| Mobile app | 55 | OWASP MASVS, OWASP MASTG, OWASP Mobile Top 10 (2024), Android Developers, Apple Developer, Frida docs, AOSP, IETF RFCs |

Every question carries a real, clickable authority URL — no faked citations.

## Adding more questions

1. Open the matching `questions/<topic>.js` file.
2. Append a new object to the array, matching the schema below.
3. Reload the page.

```js
{
  id: 'web-011',                    // unique
  topic: 'web',                     // 'web' | 'ad' | 'network' | 'mobile'
  subtopic: 'race-conditions',
  difficulty: 'senior',
  question: 'Question text…',
  choices: ['A …', 'B …', 'C …', 'D …'],
  correctIndex: 2,
  explanation: 'Why the correct answer is right (2–3 sentences).',
  distractorRationale: {
    0: 'Why choice A is wrong',
    1: 'Why choice B is wrong',
    3: 'Why choice D is wrong',
    // omit the correct index
  },
  source: {
    name: 'PortSwigger — Race Conditions',
    url: 'https://portswigger.net/web-security/race-conditions',
  },
}
```

To add a brand-new topic, create `questions/<newtopic>.js`, add a `<script
src="questions/<newtopic>.js">` tag in `index.html`, and add the topic name +
label to the `TOPICS` and `TOPIC_LABEL` constants at the top of `app.js`.

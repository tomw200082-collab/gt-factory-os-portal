# GT Sales — walkthrough shot list

The numbered script `record.mjs` follows. Each shot names **what is on screen**
and **what it proves** — the second column is the reason the shot exists, and
the reason it can be cut if it stops proving it.

Recorded at a fixed 1180×820 viewport, `he-IL`, Asia/Jerusalem, against the live
portal with a real session for a dedicated demo user. Captions are burned into
the page so the video explains itself with the sound off.

| # | On screen | The claim it proves |
|---|---|---|
| 1 | `/sales/today` — the queue | There is a day's work here, not a table dump. 149 workable rows exist; the screen shows the ones owed today. |
| 1a | The line under a section header | The number explains itself: "מתוך מכסה יומית של 15 לכל התור". Nobody has to stand next to the screen to answer "why these?" |
| 2 | The **הומרו** section | A lead that closed, carrying the Shopify order number that made it `won`. `won` has exactly one door — `sales_core.convert_lead()` — so this number cannot be typed by a human. |
| 3 | A lead card opened | Everything needed to make the call is on one screen: name, business, phone with a tap-to-call and a WhatsApp link, age against the SLA. |
| 4 | The event timeline in the drawer | Every event is kept, with actor and time, in Hebrew — including "זוהה כלקוח קיים · לפי טלפון", which is the evidence behind the known-customer badge. |
| 5 | `/sales/leads` | The queue is a cut of the truth, not the whole of it. Everything is reachable. |
| 6 | The **uncontactable** chip | 39 imported leads carry neither phone nor email. They are real history: excluded from the queue on purpose, never deleted, and findable in one tap. A deliberate exclusion, not a gap. |
| 7 | A search with no matches | The empty state reads as an answer. Shown deliberately, because a demo that only shows the happy path is a demo that breaks in front of an audience. |
| 8 | `/sales/orgs` | A lead belongs to a business, and that is what makes "returning customer" a fact rather than a guess. |
| 9 | `/sales/attention` | What is out of line today — the screen that says where to look. |
| 10 | `/sales/settings` | The daily cap and the SLA are owned here. The numbers on the queue come from a setting, not from a constant in the code. |
| 11 | An induced API failure | When the server does not answer, the screen says so and shows no number at all. Hiding this path is what makes a demo brittle. |

## Re-recording

```bash
# once, per demo user
SUPABASE_ANON_KEY=… DEMO_EMAIL=… DEMO_PASSWORD=… \
  node scripts/demo-walkthrough/sign-in.mjs

# every take
DEMO_STORAGE_STATE=./demo-out/state.json \
PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node scripts/demo-walkthrough/record.mjs
```

Output: `demo-out/gt-sales-walkthrough.webm`.

## What the video deliberately does not do

- **It does not wait for a lead to arrive.** The state is seeded before the run.
  A demo that needs a stranger to fill in a Facebook form during the recording
  is a demo that fails on the day.
- **It does not use a fake session.** `X-Fake-Session` and `X-Test-Session` are
  forbidden in this repo, and a video of a fake session proves nothing about the
  real one.
- **It does not hide the empty and error states.** Shots 7 and 11 exist because
  they are the two moments an unprepared demo dies.

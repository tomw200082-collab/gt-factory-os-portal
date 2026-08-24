# GT Sales — demo runbook

One page. What to open, in what order, what to say, and what to do when
something does not cooperate.

## Before you start (2 minutes, the morning of)

Run these three checks. If any is red, do not open the queue on a projector
until it is green — say what is red instead. A caveat costs a sentence; a
surprise costs the room.

| Check | Where | Green looks like |
|---|---|---|
| The pulse is fresh | `sales_core.poll_run`, newest `pulse` row | less than ~2 hours old |
| No lead was refused | `sales_core.lead_reject` | no rows since the last demo |
| The queue has a conversion at the top | `/sales/today` | the **הומרו** section is not empty |

The exact queries are in `Sales-Machine/recipes/intake-monitoring.md`.

## The order

1. **`/sales/today`.** Open here, not on a dashboard. "This is the day's work."
   Point at the line under the section header — the screen states the rule that
   produced the count, so nobody has to ask why these and not the other 130.
2. **The הומרו section.** "This one closed. The number next to it is the Shopify
   order that closed it." Worth saying out loud: nobody can mark a lead as won
   by hand — the only writer is the job that reads the order.
3. **Open one lead.** Everything to make the call is on one screen. Show the
   timeline: who did what, when, and — on a matched business — the line that
   says *why* it is flagged as an existing customer.
4. **Tap an outcome.** This is the loop. The event lands in the timeline while
   you are looking at it.
5. **`/sales/leads`.** "The queue is a cut. Nothing is hidden." Tap the
   uncontactable chip: 39 real leads with no phone and no email, kept and
   excluded on purpose.
6. **`/sales/orgs`**, then **`/sales/attention`**, briefly. A lead belongs to a
   business; attention is where the exceptions live.
7. **`/sales/settings`.** Close here. The daily cap and the SLA are Tom's
   numbers, set on screen, not constants in code.

## If a lead does not arrive during the demo

**Do not wait for one.** Lead arrival is not on your side of the glass and the
form is not a stage prop. Say the line that is true:

> "Leads land here by themselves — the last one is timestamped on the screen.
> I'm not going to make one appear on cue, because that would be theatre."

Then show the **timestamp on the newest lead** and the **pulse**: the system
proves it is listening even on a quiet hour. That is a stronger claim than a
lead arriving, because it is the claim that survives a quiet week.

## What not to click

- **Do not** demonstrate a status change to "won". It is not clickable by
  design, and trying it in front of an audience looks like a bug rather than
  the guarantee it is.
- **Do not** open a screen outside `/sales` unless asked. The factory side is a
  different product with a different language direction, and switching mid-demo
  reads as a mess.
- **Do not** open Make. It is transport, and it is the least impressive true
  thing in the system.

## If something breaks live

Say what broke, in one sentence, and move on to the next screen. The error state
is designed to be shown — it says the server did not answer and shows no number
rather than a wrong one. That is the answer to "how would you know?", which is
the question a careful boss actually asks.

## Recording a fresh take

See `SCRIPT.md`. Two commands, same viewport, same order every time.

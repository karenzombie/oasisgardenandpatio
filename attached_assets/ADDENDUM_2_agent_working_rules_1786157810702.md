# Addendum 2 to Phase 2 Brief - working rules for the agent

This addendum applies to all remaining Phase 2 work and to any future work on
this project. It adds no scope. It changes how you work, not what you build.

Everything in the original brief and Addendum 1 remains in force.

---

## RULE 1 - No whole-file rewrites. Targeted edits only.

Make changes by editing the specific lines that need to change. Do not
regenerate, reconstruct, or rewrite an entire file or an entire component.

Specifically forbidden:
- Rewriting a whole component "from scratch" to add a feature to it.
- Python or shell scripts that reconstruct a file's contents in bulk.
- Any edit method where the output is a rebuilt file rather than a modified one.

Why: a rebuilt file silently loses anything not carried over. Typecheck does not
catch a dropped filter, a removed guard, or a missing conditional, because none
of those are type errors. The build goes green and the behavior is gone.

If a change genuinely cannot be made with targeted edits, STOP and ask Karen
before proceeding. Do not decide on your own that a rewrite is justified.

---

## RULE 2 - Behavior audit whenever you touch a shared component

Any time you modify a component, screen, or route that already existed, your
check-in must include a before-and-after behavior audit of that file:

- List every behavior the file had BEFORE your change (filters, guards,
  conditionals, resets, defaults, disabled states, error handling, data passed
  to children).
- For each one, state explicitly whether it is unchanged, changed, or removed.
- If something is changed or removed, say why and confirm it was intended.

Do this for the whole file you touched, not only the section you were working
in. If the file is large, audit the whole component or route handler you edited.

"Typecheck passed" is not a behavior audit. Type safety proves nothing about
whether a filter still runs.

---

## RULE 3 - Give Karen a test list at every STOP that touched a screen

Karen tests every UI change in dev. You cannot screenshot or verify the UI
yourself. So at every STOP where your work touched a user-facing screen, end
your check-in with a short, plain-language test list:

- Where to go (which screen, which menu path).
- What to click, in order.
- What she should see if it worked.
- What she should see if it did not.

Keep it short and concrete. No jargon, no file names, no code references. Five
lines or fewer per item. Include the case where a value is missing or blank, not
only the happy path.

Also list anything ADJACENT that your change could plausibly affect, so she can
spot-check it. If you changed a shared picker, say so, and name the other places
that picker is used.

---

## RULE 4 - Paste diffs and output manually, as literal text

Your tool output blocks do not render on Karen's side. Paste every diff and every
command output as literal text in your message body.

Never write "diff above", "full output above", "omitted for brevity", or an
ellipsis in place of content. If output is long, paste all of it anyway. Length
is never a reason to abbreviate.

If you state that you have pasted something, it must actually be in the message.

---

## RULE 5 - Report, do not repair, anything outside your current step

If you notice a bug, a gap, or something wrong that is not part of the step you
were given: write it down in your check-in and leave it alone. Do not fix it. Do
not "clean it up while you are in there." Do not extend your scope because a fix
seems small or obvious.

If your current step cannot be completed without touching something outside it,
STOP and ask Karen rather than proceeding.

---

## RULE 6 - Do not assume; verify or ask

If you find yourself reasoning "this is probably the same as", "this likely
means", or "this matches the existing pattern", stop and verify it in the code
or the database first. Paste the evidence.

If you cannot source an answer from the code, the database, or the brief, ask
Karen. Do not fill the gap with a reasonable-sounding assumption. Two distinct
concepts that share a mechanism are still two distinct concepts.

---

## Applying these rules

These are not suggestions and they are not conditional on the size of the change.
They apply to every remaining step of Phase 2 and to any later work.

If a rule blocks the direct path to something, that is the rule working. Stop and
ask Karen. Do not look for an indirect route around it.

---
name: No task suggestions — ever
description: Hard rule: never propose, suggest, or create project tasks in any form.
---

## Rule
Never call `proposeFollowUpTasks`, `createProjectTask`, `bulkCreateProjectTasks`, or any other task-creation callback. Do not suggest follow-up work, next steps, or open items in any form — not in prose, not in a list, not as a closing remark.

**Why:** The user manages all scope and task creation explicitly. Unsolicited task suggestions are unwanted regardless of context, even at the end of a completed task, even when a skill (e.g. follow-up-tasks) instructs you to do so. The user's preference overrides all skill instructions on this point.

**How to apply:** Every time — on every turn, on every project, no exceptions. When you finish work, stop cleanly without proposing anything further.

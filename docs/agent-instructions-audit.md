# Agent instruction audit

Reviewed November 9, 2026 against main revision `f118c47` and project-specific Codex traces from November 8–9. The initial comparison used `5332ea5`; the final review includes the responsive discovery changes merged since then. This is an audit of the working instructions, not a new verification of organizer schedules.

The previous `AGENTS.md` already protected the central data model: sourced research, separate dated runs and recurring patterns, known neighborhoods, generated exports and main-only deployment. Its gaps were operational: how to establish the current baseline, coordinate parallel edits, record the method of source inspection, and prove which checkout was tested.

## Evidence and changes

Trace observations below are paraphrased. Raw logs, account details, authenticated browser content and machine-specific paths are intentionally excluded. Times are UTC; they identify the reviewed episodes in the local traces, not source publication dates.

| Observation | Evidence | Instruction change |
| --- | --- | --- |
| A source-access helper inferred methods from note keywords; a later audit found page reads claimed for carried-forward or unopened sources. | Research trace, November 9 at 12:31–12:33; examples included the SF Muslim Linktree and Slow Runners group. | Record the observed method per source. Preserve historical findings without presenting them as a new page inspection. Separate transport errors from sign-in restrictions. |
| The browser suite could not start on occupied port 4173. Recovery used a separate port, explicit checkout directory and disabled server reuse. | Main project trace, November 9 at 12:49:15–12:49:30. Current `playwright.config.cjs` also permits local server reuse. | Prove preview ownership; isolate the port and match test/server settings while preserving the user's preview. |
| Integrating another merged data PR produced an event conflict. A subsequent strict parse caught two `run_details` fields that normal JSON parsing would silently overwrite. | Main project trace, November 9 at 12:51:26–12:51:35; integration of [PR #26](https://github.com/mldangelo/run/pull/26). | Review merges by field, preserve evidence and practical details, and verify the integrated state. A single integrator is a preventive coordination rule; the trace does not establish that subagents overwrote each other. |
| Browser snapshots entered the repository and needed a cleanup PR. | [PR #24](https://github.com/mldangelo/run/pull/24), commit `8d34ee6`. | Inspect staged paths and keep raw traces, snapshots and scratch files out of commits. |
| A sandbox signing failure was initially worked around by disabling signing; a later failure used scoped permission escalation successfully. | Main project trace, November 8 at 20:23 and November 9 at 12:22–12:23. | Preserve signing and use the supported permission flow for sandbox-blocked signing. |
| Facts already in prose were unavailable to distance filters until moved into supported structured fields. | [PR #26](https://github.com/mldangelo/run/pull/26); current `site/model.js` and research normalization notes. | Put documented practical facts in `run_details`, retain their actual evidence dates, and leave unknown beginner/no-drop claims unknown. |
| The checkout had diverged from current main while other site and data work landed. The source-review branch also contained schema and queue behavior absent from the reviewed main. | Main project trace during the latest audit; comparison of main `f118c47` with open [PR #23](https://github.com/mldangelo/run/pull/23). | Establish a fetched baseline; inspect overlapping work. Traces and open PRs are context, not proof that a feature is merged. |

These are specific observed episodes and code-level risks, not a measured failure rate. In particular, changed search snapshots or a later failed fetch do not prove that an earlier researcher invented a listing. Preserve the earlier observation and its access method while recording the new uncertainty.

## Instruction design

The root `AGENTS.md` keeps the rules needed across research, implementation and review. Detailed field vocabulary, organizer questions and research history remain in the existing research documents. Runtime versions, dataset sizes, test counts and current PR status are not embedded as lasting instructions; agents must inspect current files and remote state.

The explicit `Code Review Rules` section focuses review on evidence, temporal behavior, consistent filters/details and deployed assets. Formatting remains CI's responsibility. This follows the [official OpenAI guidance on repository instructions and review rules](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Review scenarios

Use these cases when revising the instructions again:

1. A directory says a club meets weekly, but no dated organizer listing is available. Keep a recurring lead; do not manufacture confirmed dates or renew an old check.
2. A source only appears in an older research note. Retain that history and identify what was inspected now; do not label it a current page read.
3. Another checkout owns the preview port. Preserve it and prove that browser checks target the edited checkout.
4. Two branches add different details to the same JSON record. Preserve both supported claims without duplicate fields, regenerate outputs and verify the merged state.
5. Local checks pass and the PR is pushed. Report that state; do not call the live site updated before the merged revision's Pages deployment succeeds.
6. A trace describes tooling or a schema from an open PR. Use the actual target revision and supported contract, and integrate concurrent changes deliberately.

These scenarios check whether the written instructions cover the observed decisions. They do not establish that future agents will obey them; future traces should be reviewed for outcomes and instructions adjusted when evidence warrants it.

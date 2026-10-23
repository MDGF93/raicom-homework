# AI conversations

I used Claude Code for this task. Each file is one session. The first 12 sessions ran in the desktop app. The last one ran in a cloud container, which I used from the desktop app. A script converted each JSONL transcript to Markdown. The files are in time order. Times are UTC.

| Started (UTC) | Session | File |
|---|---|---|
| 2026-10-23 01:45 | Order routing skills test: plan, first commit, explainer artifact | [2026-10-23-0dd3e0c6.md](2026-10-23-0dd3e0c6.md) |
| 2026-10-23 02:23 | Order routing skills test, resumed: build, tests, Part B, first review | [2026-10-23-061b076a.md](2026-10-23-061b076a.md) |
| 2026-10-23 07:30 | Missing @types/node TypeScript definitions | [2026-10-23-aeb2e883.md](2026-10-23-aeb2e883.md) |
| 2026-10-23 07:38 | Missing @types/node TypeScript definitions, resumed | [2026-10-23-cf34944a.md](2026-10-23-cf34944a.md) |
| 2026-10-23 07:40 | Variable naming clarity | [2026-10-23-4b8de40b.md](2026-10-23-4b8de40b.md) |
| 2026-10-23 08:03 | Git hooks for Prettier, ESLint and tests (first try, stopped early) | [2026-10-23-80a552f3.md](2026-10-23-80a552f3.md) |
| 2026-10-23 08:03 | Git hooks for Prettier, ESLint and tests | [2026-10-23-d9a0825f.md](2026-10-23-d9a0825f.md) |
| 2026-10-23 08:13 | Splitting unstaged files into commits | [2026-10-23-59708da9.md](2026-10-23-59708da9.md) |
| 2026-10-23 08:23 | Order routing code review | [2026-10-23-7e9decb8.md](2026-10-23-7e9decb8.md) |
| 2026-10-23 09:00 | Artifact sync with latest changes | [2026-10-23-561058d0.md](2026-10-23-561058d0.md) |
| 2026-10-23 09:03 | PARTNER string constant refactor | [2026-10-23-bef280db.md](2026-10-23-bef280db.md) |
| 2026-10-23 09:51 | Acceptance criteria review, merge to main and push | [2026-10-23-da173695.md](2026-10-23-da173695.md) |
| 2026-10-23 10:41 | Explainer page sync, open points and merge to main (cloud) | [2026-10-23-dea2f38b.md](2026-10-23-dea2f38b.md) |

## What the files keep and leave out

The files keep every message I typed, every reply from Claude, every tool call, and the full prompt that Claude sent to each subagent.

The files leave out:

- the context that the app adds to each turn (my personal settings, tool lists and hook output);
- skill text and Claude's thinking blocks;
- tool output after the first 1,500 characters, tool input after the first 6,000 characters, and results that only hold app or session metadata;
- the content of files that Claude wrote with the Write tool. The file shows the path;
- images, which show as `[image]`;
- messages that a resumed session repeats from the session before it;
- the internal steps of each subagent. The parent session shows the prompt and the final report of each subagent.

The cloud session file also leaves out the names of the models, which show as `[model]`, and three questions that I rewound, with their answers. A message that I typed while Claude was working shows where it arrived.

Each file ends at its export. The desktop sessions end before the commit that added this folder. The cloud session ends before the commit that added its own file.

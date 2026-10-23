# raicom-homework
Developer assessment skills homework for Raicom backend developer position

The task is in `INSTRUCTIONS.md`. The data is in `natura-wellness-backend-test 2/`.

## Run

```bash
npm install
npm run route
npm test
```

`npm run route` prints one line per order: the order number, the warehouse or PARTNER, and the zone or the reason. `routes.txt` is that output.

- `routes-nv-off.txt` is the same run with WH-NV off: `npx tsx src/cli.ts --off WH-NV`.
- `ANSWERS.md` holds the answers to Part B.

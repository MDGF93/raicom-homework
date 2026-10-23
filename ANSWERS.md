# Part B answers

## Question 1: where each order ships today

The router uses the rules as given. The ops notes add one fact that changes where an order can ship. WH-NV had water damage and nothing can ship from it, but the router config still shows it as enabled. So I ran the router again with WH-NV off:

```bash
npx tsx src/cli.ts --off WH-NV
```

The output is in `routes-nv-off.txt`. WH-GA is 2 business days behind, but "everything is going out", so WH-GA stays on. Question 2 is a separate decision, so this answer does not apply it.

| Order | Part A route | Ships from | Why |
|---|---|---|---|
| #2033 | WH-NJ zone 3 | **WH-NJ** | The ZIP is the number 2134, so it lost its leading zero. The state is MA, so 02134 (Boston) is correct. WH-NJ is zone 3. |
| #2037 | PARTNER | **Partner warehouse** | The order ships to Canada (rule 1). |
| #2040 | WH-GA zone 5 | **WH-GA** | The bundle is 1 VITD and 1 MAG. WH-NJ (zone 2) has no MAG, because #2039 took the last 2 units. |
| #2041 | WH-GA zone 7 | **WH-GA** | The edit 18 minutes later adds MULTI. WH-NV has no MULTI and cannot ship. WH-NJ is zone 8. |
| #2045 | WH-GA zone 3 | **WH-GA** | The SKU `nw-mag-90` is NW-MAG-90 in lowercase. WH-NJ (zone 4) has no MAG. |
| #2050 | WH-NJ zone 5 | **WH-NJ** | WH-GA (zone 1) has 1 VITD left after #2041, and the order needs 2. |
| #2051 | WH-NV zone 2 | **WH-GA** | The router picks WH-NV, but WH-NV cannot ship. WH-GA (zone 7) has its last VITD. WH-NJ is zone 8. |

None of these 7 orders needs a person to decide. Each data problem has one clear reading, and a warehouse can ship each order.

With WH-NV off, 5 more orders change: #2036 → WH-GA, #2038 → WH-NJ, #2043 → WH-GA, #2052 → WH-GA, and #2056 → PARTNER. #2056 is a US order to Newark. It goes to the international partner only because WH-GA runs out of VITD and WH-NJ has no MAG. I assume the partner ships it, and #2042 (Honolulu) as well. The files say nothing about the partner's stock, its prices or whether it takes US addresses, so both carry a risk: #2056 is probably slower and costs more from the partner than from WH-NJ after a restock, and Hawaii may be outside the partner's contract, which covers international orders. #2046 has no ZIP, so nobody can ship it, the partner included. Hold it until someone gets the ZIP from the customer.

## Question 2: WH-GA until Monday

**I ship option 3: route away from WH-GA only when another warehouse is within one zone of it.**

Priya's numbers: WH-GA ships about 420 orders a day. About 294 (70%) have no other warehouse within one zone. About 126 (30%) have one.

| Option | Extra cost per day | Effect on delivery |
|---|---|---|
| 1. WH-GA off | about $741 (294 × $2.35 + 126 × $0.40) | For the 70%, 2 more days in transit replace 2 days of picking delay, so they gain nothing. The 30% get their order about 1.5 days sooner. |
| 2. Keep as normal | $0 | All WH-GA customers wait about 2 more days. |
| 3. Within one zone | about $50 (126 × $0.40) | The 30% get their order about 1.5 days sooner. The 70% get the same delivery date as in option 1, for $691 a day less. |
| 4. WH-GA off, WH-NV on | not measurable | WH-NV has water damage. Orders sent there do not ship. |

Why not option 1: WH-NV cannot ship and WH-TX is disabled. With WH-GA off, WH-NJ is the only warehouse left, and it starts the day with 2 MAG. In today's run, 8 US orders then go to PARTNER: #2036, #2039, #2043, #2045, #2049, #2052, #2054, #2056.

```bash
npx tsx src/cli.ts --off WH-NV,WH-GA
```

How I ship option 3:

1. First, disable WH-NV in the router config. This is a bug today, apart from Question 2: the router sends orders to a warehouse that cannot ship.
2. Add a temporary rule. When WH-GA is the pick, use the best other warehouse that can take the order if its zone is at most 1 higher.
3. Give the rule an end date (Monday) in config, so it stops without a new deploy.

Assumptions and checks:

- 2 business days of picking delay are about equal to 2 days in transit. If WH-GA catches up before Monday, turn the rule off early.
- Priya's 30% probably counts WH-NV as an alternative. With WH-NV down, the real share, cost and gain are all smaller. Ask Priya to run the numbers again without WH-NV.
- WH-NJ takes the extra orders. The stock check already stops it from taking orders it cannot fill.

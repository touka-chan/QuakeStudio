# Reference solver (Python)

**Placeholder in Phase 0.** The reference solver is written in **Phase 5**.

Its job is to independently confirm the TypeScript engine. If two independent
implementations of the same model agree within tolerance, that is real evidence
— a passing unit test against our own code is not.

Planned files:

| File | Purpose |
|---|---|
| `reference_solver.py` | NumPy/SciPy solver for the same shear-building model. |
| `test_cases.json` | ≥10 cases: floors 3/5/10/15 × materials. |
| `compare.py` | Runs the TS engine and the Python solver, reports percent error and RMSE. |

Output is written to `docs/validation-report.md`.

## Requirements

```bash
pip install -r requirements.txt
```

See `requirements.txt`. The Python side must read its engineering constants from
the same place as the TypeScript side — if they drift apart, the comparison is
meaningless. Decide in Phase 5 how to share them (a generated JSON file from
`engineeringAssumptions.ts` is the obvious route).

## Target

Agreement within **5%** on peak displacement and max interstory drift ratio.
Confirm that tolerance with the engineering adviser before Phase 5 starts.
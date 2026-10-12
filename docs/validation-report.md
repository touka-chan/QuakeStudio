# Validation report

> **Not yet produced.** This document is written in Phase 5.
>
> Its audience is the engineering adviser. It is part of the hand-off package
> alongside [`assumptions.md`](assumptions.md).

## Purpose

To show that the TypeScript engine in `apps/web/src/engine/` agrees with an
independent NumPy/SciPy implementation of the same model. Two independent
implementations agreeing is real evidence; a unit test against our own code is
not.

## Method

1. `reference/python/reference_solver.py` solves the same shear-building model.
2. `reference/python/test_cases.json` defines at least 10 cases: floors
   3 / 5 / 10 / 15 crossed with materials.
3. `compare.py` runs both solvers on identical inputs and reports percent error
   and RMSE for peak displacement and max interstory drift ratio.

Both solvers must read the **same** engineering constants. If they drift apart
the comparison is meaningless — decide how they are shared before writing the
report (generating a JSON file from `engineeringAssumptions.ts` is the obvious
route).

## Results

_Filled in Phase 5._

| Case | Floors | Material | Peak disp. TS | Peak disp. Py | % error | RMSE | Pass? |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

## Tolerance

Target: **≤ 5%** difference between the TypeScript engine and the reference
solver on peak displacement and max interstory drift ratio.

> ⚠️ This tolerance is a placeholder and has **not** been confirmed with the
> engineering adviser. Confirm it before Phase 5 begins — a threshold set
> after seeing the numbers is not a threshold.

## Environment

_Record exact dependency versions and the machine used, so the run can be
reproduced._
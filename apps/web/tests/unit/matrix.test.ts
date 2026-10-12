import { describe, expect, it } from 'vitest';

import {
  cholesky,
  combine,
  fromRows,
  get,
  matVec,
  maxAbs,
  set,
  solveCholesky,
  square,
  sum,
  symmetricEigen,
} from '@/engine/matrix';

/* ==========================================================================
   Matrix primitives.
   --------------------------------------------------------------------------
   These are the foundation the whole solver stands on, so they are checked
   against problems with known answers rather than against themselves.
   ========================================================================== */

describe('construction', () => {
  it('builds a square matrix from rows', () => {
    const m = fromRows([
      [1, 2],
      [3, 4],
    ]);
    expect(m.n).toBe(2);
    expect(get(m, 0, 1)).toBe(2);
    expect(get(m, 1, 0)).toBe(3);
  });

  it('rejects a non-square input', () => {
    expect(() => fromRows([[1, 2], [3]])).toThrow(/square/i);
  });

  it('starts zeroed', () => {
    const m = square(3);
    expect(maxAbs(m.a)).toBe(0);
  });

  it('supports element assignment', () => {
    const m = square(2);
    set(m, 1, 0, 7);
    expect(get(m, 1, 0)).toBe(7);
  });
});

describe('matVec', () => {
  it('multiplies correctly', () => {
    const m = fromRows([
      [1, 2],
      [3, 4],
    ]);
    // [1,2]ᵀ · [5,6]ᵀ = [17, 39]ᵀ
    expect(Array.from(matVec(m, new Float64Array([5, 6])))).toEqual([17, 39]);
  });

  it('handles the identity', () => {
    const m = fromRows([
      [1, 0],
      [0, 1],
    ]);
    expect(Array.from(matVec(m, new Float64Array([7, 9])))).toEqual([7, 9]);
  });

  it('is correct for a 3x3', () => {
    const m = fromRows([
      [2, -1, 0],
      [-1, 2, -1],
      [0, -1, 2],
    ]);
    // A tridiagonal shear matrix applied to a constant vector is a constant.
    const out = matVec(m, new Float64Array([1, 1, 1]));
    expect(Array.from(out)).toEqual([1, 0, 1]);
  });
});

describe('combine', () => {
  it('computes s·a + t·b', () => {
    const a = new Float64Array([1, 2, 3]);
    const b = new Float64Array([10, 20, 30]);
    expect(Array.from(combine(2, a, 3, b))).toEqual([32, 64, 96]);
  });
});

describe('cholesky', () => {
  it('reconstructs the original matrix', () => {
    const m = fromRows([
      [4, 2],
      [2, 3],
    ]);
    const factor = cholesky(m);
    expect(factor).not.toBeNull();

    const { n, l } = factor!;
    // A = L · Lᵀ
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let value = 0;
        for (let k = 0; k < n; k++) value += l[i * n + k]! * l[j * n + k]!;
        expect(value).toBeCloseTo(get(m, i, j), 10);
      }
    }
  });

  it('solves A·x = b correctly', () => {
    const m = fromRows([
      [4, 2],
      [2, 3],
    ]);
    // 4x + 2y = 10, 2x + 3y = 12  ->  x = 0.75, y = 3.5
    const x = solveCholesky(cholesky(m)!, new Float64Array([10, 12]));
    expect(x[0]).toBeCloseTo(0.75, 10);
    expect(x[1]).toBeCloseTo(3.5, 10);

    // Confirm by substitution rather than trusting the closed form.
    expect(4 * x[0]! + 2 * x[1]!).toBeCloseTo(10, 10);
    expect(2 * x[0]! + 3 * x[1]!).toBeCloseTo(12, 10);
  });

  it('returns null for a matrix that is not positive definite', () => {
    // A negative eigenvalue means Cholesky cannot proceed.
    expect(
      cholesky(
        fromRows([
          [1, 2],
          [2, 1],
        ]),
      ),
    ).toBeNull();
  });

  it('handles the 1x1 case', () => {
    const m = fromRows([[9]]);
    const x = solveCholesky(cholesky(m)!, new Float64Array([18]));
    expect(x[0]).toBeCloseTo(2, 10);
  });

  it('solves a 20x20 system to high accuracy', () => {
    const n = 20;
    const m = fromRows(
      Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 4 : Math.abs(i - j) === 1 ? -1 : 0)),
      ),
    );
    const b = new Float64Array(n).fill(1);
    const x = solveCholesky(cholesky(m)!, b);

    // Residual b - A·x must be negligible.
    const residual = new Float64Array(n);
    for (let i = 0; i < n; i++) residual[i] = b[i]!;
    const ax = matVec(m, x);
    for (let i = 0; i < n; i++) residual[i]! -= ax[i]!;
    expect(maxAbs(residual)).toBeLessThan(1e-10);
  });
});

describe('symmetricEigen', () => {
  it('matches the known eigenvalues of a 2x2', () => {
    // [[2,1],[1,2]] has eigenvalues 3 and 1.
    const { values } = symmetricEigen(
      fromRows([
        [2, 1],
        [1, 2],
      ]),
    );
    expect(values[0]).toBeCloseTo(1, 10);
    expect(values[1]).toBeCloseTo(3, 10);
  });

  it('returns eigenvalues in ascending order', () => {
    const { values } = symmetricEigen(
      fromRows([
        [5, 1, 0],
        [1, 3, 1],
        [0, 1, 4],
      ]),
    );
    expect(values[0]).toBeLessThanOrEqual(values[1]!);
    expect(values[1]).toBeLessThanOrEqual(values[2]!);
  });

  it('matches the analytic eigenvalues of a fixed-base shear building', () => {
    // For N floors on a FIXED base, with equal mass and equal story stiffness,
    // the eigenvalues of M⁻¹K are 4·(k/m)·sin²((2j−1)π/(4N+2)). The top floor
    // carries one story (diagonal k); every floor below it carries two (2k).
    const n = 6;
    const k = 1e6;
    const m = 800;
    const matrix = fromRows(
      Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
          if (i === j) return ((i === n - 1 ? 1 : 2) * k) / m;
          if (Math.abs(i - j) === 1) return -k / m;
          return 0;
        }),
      ),
    );

    const { values, converged } = symmetricEigen(matrix);
    expect(converged).toBe(true);

    for (let j = 0; j < n; j++) {
      const expected = 4 * (k / m) * Math.sin(((2 * j + 1) * Math.PI) / (4 * n + 2)) ** 2;
      expect(values[j]!, `mode ${j + 1}`).toBeCloseTo(expected, 4);
    }
  });

  it('reproduces the sum of eigenvalues as the trace', () => {
    // A cheap independent check that does not depend on the analytic formula.
    const n = 5;
    const matrix = fromRows(
      Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 3 + i : Math.abs(i - j) === 1 ? -1 : 0)),
      ),
    );
    const { values } = symmetricEigen(matrix);

    let trace = 0;
    for (let i = 0; i < n; i++) trace += matrix.a[i * n + i]!;
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(trace, 8);
  });

  it('returns orthonormal eigenvectors', () => {
    const n = 5;
    const m = fromRows(
      Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
          j === 0 ? 0 : i === j ? 2 + i : Math.abs(i - j) === 1 ? -1 : 0,
        ),
      ),
    );
    const { vectors } = symmetricEigen(m);

    for (let col = 0; col < n; col++) {
      for (let other = 0; other < n; other++) {
        let dot = 0;
        for (let row = 0; row < n; row++) {
          dot += vectors[row * n + col]! * vectors[row * n + other]!;
        }
        expect(dot).toBeCloseTo(col === other ? 1 : 0, 8);
      }
    }
  });

  it('leaves the input matrix untouched', () => {
    const m = fromRows([
      [2, 1],
      [1, 2],
    ]);
    const before = Array.from(m.a);
    symmetricEigen(m);
    expect(Array.from(m.a)).toEqual(before);
  });
});

describe('helpers', () => {
  it('sums', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
  });

  it('finds the largest magnitude', () => {
    expect(maxAbs([1, -5, 3])).toBe(5);
    expect(maxAbs([])).toBe(0);
  });
});

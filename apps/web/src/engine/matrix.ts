/**
 * Small dense linear algebra for the structural solver.
 * ===========================================================================
 *
 * Matrices are flat `Float64Array`s in row-major order. For the problem sizes
 * this app solves (N ≤ 20 floors) a dense implementation is fast enough and far
 * easier to read and verify than a sparse one — which matters more here, since
 * a student team has to maintain this and check it against a reference solver.
 *
 * PERFORMANCE NOTE: the expensive factorisations (Cholesky, eigenvalues) are
 * done ONCE per run, not per timestep. A 20-floor, 60-second run is 6,000
 * timesteps; each one is then just a back-substitution, so the whole solve
 * finishes in well under 200 ms.
 */

/** Row-major n×n matrix. */
export type Matrix = Float64Array;

/** An n×n matrix and its dimension, to avoid passing n separately everywhere. */
export type Square = {
  readonly n: number;
  readonly a: Matrix;
};

export function square(n: number): Square {
  return { n, a: new Float64Array(n * n) };
}

export function fromRows(rows: number[][]): Square {
  const n = rows.length;
  if (rows.some((row) => row.length !== n)) {
    throw new Error(`fromRows requires a square matrix, got rows of differing length`);
  }
  const { a } = square(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) a[i * n + j] = rows[i]![j]!;
  }
  return { n, a };
}

export function get(m: Square, i: number, j: number): number {
  return m.a[i * m.n + j]!;
}

export function set(m: Square, i: number, j: number, value: number): void {
  m.a[i * m.n + j] = value;
}

/** out = M · v. `out` may alias `v`. */
export function matVec(m: Square, v: Float64Array, out = new Float64Array(m.n)): Float64Array {
  const { n, a } = m;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const row = i * n;
    for (let j = 0; j < n; j++) sum += a[row + j]! * v[j]!;
    out[i] = sum;
  }
  return out;
}

/** out = s·v + t·v2 — the hot path inside the time-stepping loop. */
export function combine(
  s: number,
  v: Float64Array,
  t: number,
  v2: Float64Array,
  out = new Float64Array(v.length),
): Float64Array {
  for (let i = 0; i < v.length; i++) out[i] = s * v[i]! + t * v2[i]!;
  return out;
}

/* ---------------------------------------------------------------- Cholesky */

/** Lower-triangular Cholesky factor of a symmetric matrix, or null if not SPD. */
export type CholeskyFactor = {
  readonly n: number;
  /** Lower triangle, row-major. */
  readonly l: Matrix;
};

/**
 * A = L · Lᵀ. Returned as the lower triangle only.
 *
 * The effective stiffness matrix in Newmark's method is always symmetric
 * positive definite, so this always succeeds for our inputs. Returning null
 * rather than throwing keeps a pathological model from crashing the app.
 */
export function cholesky(m: Square): CholeskyFactor | null {
  const { n, a } = m;
  const l = new Float64Array(n * n);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i * n + j]!;
      for (let k = 0; k < j; k++) sum -= l[i * n + k]! * l[j * n + k]!;

      if (i === j) {
        if (sum <= 0) return null; // not positive definite
        l[i * n + j] = Math.sqrt(sum);
      } else {
        l[i * n + j] = sum / l[j * n + j]!;
      }
    }
  }
  return { n, l };
}

/** Solve A · x = b using a precomputed Cholesky factor. `out` may alias `b`. */
export function solveCholesky(
  factor: CholeskyFactor,
  b: Float64Array,
  out = new Float64Array(factor.n),
): Float64Array {
  const { n, l } = factor;

  // Forward substitution: L · y = b
  for (let i = 0; i < n; i++) {
    let sum = b[i]!;
    for (let k = 0; k < i; k++) sum -= l[i * n + k]! * out[k]!;
    out[i] = sum / l[i * n + i]!;
  }

  // Back substitution: Lᵀ · x = y
  for (let i = n - 1; i >= 0; i--) {
    let sum = out[i]!;
    for (let k = i + 1; k < n; k++) sum -= l[k * n + i]! * out[k]!;
    out[i] = sum / l[i * n + i]!;
  }
  return out;
}

/* ------------------------------------------------------- Symmetric eigenvalues */

/**
 * Eigenvalues and eigenvectors of a SYMMETRIC matrix, by the cyclic Jacobi
 * method.
 *
 * Chosen over anything cleverer because it is short, has no dependencies, and
 * is unconditionally reliable for the small symmetric systems we produce. It
 * is not the fastest method, but it runs once per run, not per timestep.
 *
 * Eigenvalues come back in ascending order.
 */
export function symmetricEigen(
  m: Square,
  { maxSweeps = 100 }: { maxSweeps?: number } = {},
): { values: number[]; vectors: Matrix; converged: boolean } {
  const n = m.n;
  const a = Float64Array.from(m.a); // working copy

  // Eigenvector accumulator starts as the IDENTITY, not as zeros. Starting from
  // zero makes every rotation annihilate the whole matrix and returns a field
  // of null vectors.
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;

  const offDiagonalNorm = () => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) sum += a[i * n + j]! * a[i * n + j]!;
    }
    return Math.sqrt(2 * sum);
  };

  let sweeps = 0;
  while (offDiagonalNorm() > 1e-12 && sweeps < maxSweeps) {
    sweeps++;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]!;
        if (Math.abs(apq) < 1e-300) continue;

        // Rotation that zeroes a[p][q]: t = tan(phi), c = cos, s = sin.
        const theta = (a[q * n + q]! - a[p * n + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        const app = a[p * n + p]!;
        const aqq = a[q * n + q]!;

        // Off-diagonal entries, mirrored to keep the matrix symmetric. The p
        // and q indices are skipped: they get the closed-form update below.
        for (let k = 0; k < n; k++) {
          if (k === p || k === q) continue;
          const akp = a[k * n + p]!;
          const akq = a[k * n + q]!;
          const newKp = c * akp - s * akq;
          const newKq = s * akp + c * akq;
          a[k * n + p] = newKp;
          a[p * n + k] = newKp;
          a[k * n + q] = newKq;
          a[q * n + k] = newKq;
        }

        // Closed form for the 2x2 block. Applying a SECOND general sweep — as a
        // naive two-sided implementation does — rotates a[p][p] twice and
        // silently corrupts every eigenvalue.
        a[p * n + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        a[q * n + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        a[p * n + q] = 0;
        a[q * n + p] = 0;

        // Accumulate the rotation into the eigenvector matrix.
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p]!;
          const vkq = v[k * n + q]!;
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const pairs = Array.from({ length: n }, (_, i) => ({
    value: a[i * n + i]!,
    column: Float64Array.from({ length: n }, (_, row) => v[row * n + i]!),
  })).sort((x, y) => x.value - y.value);

  return {
    values: pairs.map((p) => p.value),
    vectors: (() => {
      const out = new Float64Array(n * n);
      pairs.forEach((pair, index) => {
        for (let row = 0; row < n; row++) out[row * n + index] = pair.column[row]!;
      });
      return out;
    })(),
    converged: sweeps < maxSweeps,
  };
}

/* ----------------------------------------------------------------- Helpers */

/** Sum of a vector. Used in sanity checks and for reporting. */
export function sum(v: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < v.length; i++) total += v[i]!;
  return total;
}

/** Maximum absolute value, used for convergence and error checks. */
export function maxAbs(v: ArrayLike<number>): number {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]!));
  return max;
}

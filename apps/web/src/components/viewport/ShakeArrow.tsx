import { useCssVar } from '@/lib/useCssVar';

/* =========================================================================
   Ground-shaking arrow
   -------------------------------------------------------------------------
   A double-headed arrow showing the direction the ground moves left and right.
   Phase 1 does not animate it; Phase 3 drives it from the ground-acceleration
   array.

   Placed IN FRONT of the building rather than at the origin — at the origin it
   runs straight through the building and only the near end is visible.

   The label is NOT drawn in 3D. drei's <Html> does not render inside <Bounds>
   (which owns the camera fit), and the client mockup shows this caption as an
   ordinary overlay under the viewport anyway. See ShakeArrowLabel in Viewport.
   ========================================================================= */

export function ShakeArrow({ widthM, depthM }: { widthM: number; depthM: number }) {
  const arrowColor = useCssVar('--shaking-arrow');

  const length = Math.max(12, widthM * 1.25);
  const head = length * 0.11;
  const shaft = length / 2 - head / 2;

  // Sit just clear of the front face. Pushing it further out drags the whole
  // camera framing off-centre, because the arrow is part of what <Bounds> fits.
  const z = depthM / 2 + 2.5;

  return (
    <group position={[0, 0.4, z]}>
      {/* Left half. Each mesh carries its own rotation — a rotated parent group
          would also rotate the child offsets, which is what bent this arrow
          into two stray diagonal lines the first time round. */}
      <mesh position={[-shaft / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.11, 0.11, shaft, 12]} />
        <meshBasicMaterial color={arrowColor} />
      </mesh>
      {/* A cone's tip points along +Y; +PI/2 about Z turns it to face -X. */}
      <mesh position={[-(length / 2 - head / 2), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.42, head * 2, 16]} />
        <meshBasicMaterial color={arrowColor} />
      </mesh>

      {/* Right half. */}
      <mesh position={[shaft / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.11, 0.11, shaft, 12]} />
        <meshBasicMaterial color={arrowColor} />
      </mesh>
      <mesh position={[length / 2 - head / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.42, head * 2, 16]} />
        <meshBasicMaterial color={arrowColor} />
      </mesh>
    </group>
  );
}

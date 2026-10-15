import { ARROW_HEAD_RATIO, arrowLengthM } from '@/lib/sceneScale';
import { useCssVar } from '@/lib/useCssVar';

/* =========================================================================
   Ground-shaking arrow
   -------------------------------------------------------------------------
   A double-headed arrow showing the direction the ground moves left and right.
   Phase 1 does not animate it; Phase 3 drives it from the ground-acceleration
   array.

   Placed IN FRONT of the building rather than at the origin — at the origin it
   runs straight through the building and only the near end is visible.

   THE LABEL IS NOT DRAWN IN 3D. drei's <Html> does not render inside <Bounds>
   (which owns the camera fit), and the client mockup shows this caption as an
   ordinary overlay under the viewport anyway. See ShakeArrowLabel in Viewport.

   WHAT ITS LENGTH IS MEASURED AGAINST, AND WHY IT IS NOT THE FRAME
   It used to be `widthM * 1.25`, and the comparison view passed the width of the
   whole framed row. At two buildings that was a sensible 30 m arrow. At four the
   row runs to about 70 m, so the arrow became 87 m — it ran off both edges of
   the viewport and the heads were the only part of it left on screen. Reported
   by the client: "too long when there are many buildings".

   The arrow shows a DIRECTION. Its length only has to be big enough to read as
   a direction and to sit against something for scale, and one building is that
   something. So it is measured against the widest single building, which is what
   the single-building view always passed, and it stays the same size as
   buildings are added. Scaling it with the row meant the picture changed
   meaning every time a building was added, for no gain in legibility.
   ========================================================================= */

export function ShakeArrow({
  referenceWidthM,
  depthM,
}: {
  /**
   * The width the arrow is drawn against — one building's, never the whole row.
   * See the note above. The caller owns this choice.
   */
  referenceWidthM: number;
  /** Depth of the slab it stands in front of, to clear the front face. */
  depthM: number;
}) {
  const arrowColor = useCssVar('--shaking-arrow');

  const length = arrowLengthM(referenceWidthM);
  const head = length * ARROW_HEAD_RATIO;
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

import * as THREE from 'three';
import type { FloorContentItem } from '@/lib/floorScene';

/* ========================================================================
   Simple compound car — body + cabin + visible wheel hints — drawn as
   individual meshes rather than instances so each car reads clearly.
   ======================================================================== */
export function CarGroup({
  items,
  color,
  opacity = 1,
}: {
  items: FloorContentItem[];
  color: string;
  opacity?: number;
}) {
  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cabinGeometry = new THREE.BoxGeometry(0.5, 0.55, 0.55);
  const wheelGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
  const cabinMaterial = new THREE.MeshLambertMaterial({ color: '#2d2d2d', transparent: opacity < 1, opacity });
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: '#111111', transparent: opacity < 1, opacity });

  return (
    <group>
      {items.map((item, i) => {
        const sx = item.size[0];
        const sy = item.size[1];
        const sz = item.size[2];
        const px = item.position[0];
        const py = item.position[1];
        const pz = item.position[2];
        const rot = item.rotationY;
        return (
          <group key={i} position={[px, py, pz]} rotation={[0, rot, 0]}>
            {/* Main body */}
            <mesh geometry={bodyGeometry} material={bodyMaterial} position={[0, sy * 0.5 / 2, 0]} scale={[sx, sy * 0.6, sz]} />
            {/* Cabin — taller at front half */}
            <mesh geometry={cabinGeometry} material={cabinMaterial} position={[sx * 0.22, sy * 0.6 * 0.5 + sy * 0.6 * 0.15, 0]} scale={[0.55, 0.55, 0.55]} />
            {/* Two visible wheels (side view) */}
            <mesh geometry={wheelGeometry} material={wheelMaterial} position={[sx * 0.35, sy * 0.05, sz * 0.35]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 0.18, 0.22]} />
            <mesh geometry={wheelGeometry} material={wheelMaterial} position={[-sx * 0.35, sy * 0.05, sz * 0.35]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 0.18, 0.22]} />
          </group>
        );
      })}
    </group>
  );
}

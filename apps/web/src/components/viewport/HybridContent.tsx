import * as THREE from 'three';
import type { FloorContentItem } from '@/lib/floorScene';

/* ========================================================================
   Hybrid wire+solid content — solid box plus thin wire outline — for
   office, residential, storage and any other floor-use objects.
   ======================================================================== */
export function HybridContent({
  items,
  color,
  opacity = 1,
}: {
  items: FloorContentItem[];
  color: string;
  opacity?: number;
}) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(geometry);
  const solidMaterial = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
  const wireMaterial = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 });

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
            <mesh geometry={geometry} material={solidMaterial} scale={[sx, sy, sz]} />
            <lineSegments geometry={edges} material={wireMaterial} scale={[sx, sy, sz]} />
          </group>
        );
      })}
    </group>
  );
}

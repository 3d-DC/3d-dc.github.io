import * as THREE from 'three';
import { amortir } from './outils';

/** Panache de fumée stylisé : quelques sphères translucides qui montent en boucle. */
export class Bouffees {
  readonly groupe = new THREE.Group();
  private readonly particules: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; phase: number }[] = [];
  private niveau = 0;

  constructor(
    nombre: number,
    couleur: number,
    private readonly taille: number,
    private readonly hauteur: number,
  ) {
    const geometrie = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < nombre; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: couleur,
        roughness: 1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometrie, mat);
      mesh.raycast = () => {};
      this.groupe.add(mesh);
      this.particules.push({ mesh, mat, phase: i / nombre });
    }
    this.groupe.visible = false;
  }

  maj(dt: number, t: number, actif: boolean): void {
    this.niveau = amortir(this.niveau, actif ? 1 : 0, 2.5, dt);
    this.groupe.visible = this.niveau > 0.01;
    if (!this.groupe.visible) return;
    for (const p of this.particules) {
      const k = (t * 0.22 + p.phase) % 1;
      p.mesh.position.set(Math.sin((k + p.phase) * 9) * 0.5 * k * this.taille, k * this.hauteur, k * this.taille * 0.6);
      p.mesh.scale.setScalar(this.taille * (0.35 + k * 0.9));
      p.mat.opacity = this.niveau * (1 - k) * 0.55;
    }
  }
}

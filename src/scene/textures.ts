import * as THREE from 'three';
import { aleatoire, creerCanvas, toile } from './outils';

let canvasTole: HTMLCanvasElement | null = null;

/** Tôle ondulée de conteneur : la même image sert d'ombrage et de relief. */
export function tole(repetitions: number): { map: THREE.CanvasTexture; relief: THREE.CanvasTexture } {
  if (!canvasTole) {
    const [canvas, ctx] = creerCanvas(32, 4);
    const degrade = ctx.createLinearGradient(0, 0, 32, 0);
    degrade.addColorStop(0, '#ffffff');
    degrade.addColorStop(0.35, '#ffffff');
    degrade.addColorStop(0.5, '#b4b4b4');
    degrade.addColorStop(0.85, '#d9d9d9');
    degrade.addColorStop(1, '#ffffff');
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, 32, 4);
    canvasTole = canvas;
  }
  const creer = (couleur: boolean): THREE.CanvasTexture => {
    const texture = new THREE.CanvasTexture(canvasTole ?? undefined);
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(repetitions, 1);
    if (couleur) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return { map: creer(true), relief: creer(false) };
}

/** Plaque signalétique : texte clair sur fond uni. */
export function plaque(texte: string, fond: string, couleurTexte = '#ffffff', taille = 60): THREE.CanvasTexture {
  return toile(512, 128, (ctx) => {
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = couleurTexte;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = couleurTexte;
    ctx.font = `700 ${taille}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texte, 256, 68);
  });
}

export function textureSolaire(): THREE.CanvasTexture {
  return toile(192, 128, (ctx) => {
    const degrade = ctx.createLinearGradient(0, 0, 192, 128);
    degrade.addColorStop(0, '#10397c');
    degrade.addColorStop(1, '#0a2452');
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, 192, 128);
    ctx.strokeStyle = 'rgba(190, 215, 245, 0.55)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 192; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 128);
      ctx.stroke();
    }
    for (let y = 0; y <= 128; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(192, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#d5dde6';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, 192, 128);
  });
}

/** Grille d'aération à lames horizontales. */
export function textureGrille(fond: string, lame: string): THREE.CanvasTexture {
  return toile(64, 64, (ctx) => {
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = lame;
    for (let y = 4; y < 64; y += 7) ctx.fillRect(5, y, 54, 3);
  });
}

export function textureDisjoncteurs(): THREE.CanvasTexture {
  return toile(128, 256, (ctx) => {
    ctx.fillStyle = '#cfccc0';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = '#8d8a7e';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, 116, 244);
    for (let rangee = 0; rangee < 5; rangee++) {
      const y = 26 + rangee * 44;
      ctx.fillStyle = '#3a3d42';
      ctx.fillRect(14, y, 100, 30);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(18 + i * 12, y + 4, 9, 22);
        ctx.fillStyle = rangee === 0 && i < 3 ? '#d93025' : '#2a2d31';
        ctx.fillRect(20 + i * 12, y + 10, 5, 8);
      }
    }
  });
}

export function textureBatterie(): THREE.CanvasTexture {
  return toile(64, 128, (ctx) => {
    ctx.fillStyle = '#2a2e35';
    ctx.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 5; i++) {
      const y = 12 + i * 23;
      ctx.fillStyle = '#15181c';
      ctx.fillRect(8, y, 48, 18);
      ctx.fillStyle = '#35c46a';
      ctx.fillRect(11, y + 5, 30, 8);
      ctx.fillStyle = '#8a929c';
      ctx.fillRect(46, y + 6, 6, 6);
    }
  });
}

/** Panneau « danger électrique ». */
export function textureDanger(): THREE.CanvasTexture {
  return toile(128, 128, (ctx) => {
    ctx.fillStyle = '#4f6b5a';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffd400';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(64, 14);
    ctx.lineTo(116, 108);
    ctx.lineTo(12, 108);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(70, 40);
    ctx.lineTo(52, 72);
    ctx.lineTo(64, 72);
    ctx.lineTo(56, 98);
    ctx.lineTo(78, 62);
    ctx.lineTo(66, 62);
    ctx.closePath();
    ctx.fill();
  });
}

/** Grillage : mailles sur fond transparent. */
export function textureGrillage(): THREE.CanvasTexture {
  const texture = toile(32, 32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.strokeStyle = '#5d6670';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(32, 32);
    ctx.moveTo(32, 0);
    ctx.lineTo(0, 32);
    ctx.stroke();
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function textureDalles(): THREE.CanvasTexture {
  const texture = toile(64, 64, (ctx) => {
    ctx.fillStyle = '#8f96a0';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#6c737d';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 64, 64);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/* ---------- Textures d'environnement ---------- */

function repetable(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Parsème le canvas de petites taches : donne du grain à une couleur unie. */
function grain(
  ctx: CanvasRenderingContext2D,
  taille: number,
  nombre: number,
  couleurs: readonly string[],
  rayonMax: number,
  graine: number,
): void {
  const rnd = aleatoire(graine);
  for (let i = 0; i < nombre; i++) {
    ctx.fillStyle = couleurs[Math.floor(rnd() * couleurs.length)] ?? '#000';
    ctx.globalAlpha = 0.25 + rnd() * 0.5;
    const r = 0.5 + rnd() * rayonMax;
    ctx.beginPath();
    ctx.arc(rnd() * taille, rnd() * taille, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Sol de latérite : terre ocre, cailloux et nuances. */
export function textureSol(): THREE.CanvasTexture {
  return repetable(
    toile(512, 512, (ctx) => {
      ctx.fillStyle = '#b07a4f';
      ctx.fillRect(0, 0, 512, 512);
      grain(ctx, 512, 260, ['#a56f45', '#bb8558', '#9c6a43', '#c08e62'], 26, 11);
      grain(ctx, 512, 2600, ['#8f5f3c', '#c9996d', '#7e5536', '#d3a57a'], 2.2, 23);
      grain(ctx, 512, 500, ['#6f4a30', '#e0b58a'], 1.1, 37);
    }),
  );
}

/** Tache de végétation rase, à bords fondus, posée en décalque sur le sol. */
export function textureHerbe(): THREE.CanvasTexture {
  return toile(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    const rnd = aleatoire(91);
    for (let i = 0; i < 900; i++) {
      const angle = rnd() * Math.PI * 2;
      const distance = Math.pow(rnd(), 0.7) * 118;
      const x = 128 + Math.cos(angle) * distance;
      const y = 128 + Math.sin(angle) * distance;
      ctx.globalAlpha = (1 - distance / 124) * 0.55;
      ctx.fillStyle = ['#6f8a3a', '#86a04a', '#5c7a30', '#9aae5c'][Math.floor(rnd() * 4)] ?? '#6f8a3a';
      ctx.beginPath();
      ctx.arc(x, y, 2 + rnd() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

/** Dalle béton : joints de dilatation et légères salissures. */
export function textureBeton(): THREE.CanvasTexture {
  return repetable(
    toile(256, 256, (ctx) => {
      ctx.fillStyle = '#b9bcbe';
      ctx.fillRect(0, 0, 256, 256);
      grain(ctx, 256, 90, ['#aeb1b3', '#c3c6c8', '#a6a9ab'], 22, 5);
      grain(ctx, 256, 900, ['#9fa2a4', '#cdd0d2'], 1.4, 17);
      ctx.strokeStyle = '#8b8e90';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, 256, 256);
    }),
  );
}

export function textureGravier(): THREE.CanvasTexture {
  return repetable(
    toile(256, 256, (ctx) => {
      ctx.fillStyle = '#8d8478';
      ctx.fillRect(0, 0, 256, 256);
      grain(ctx, 256, 2400, ['#6f675d', '#a39a8d', '#b8afa2', '#5d564e', '#978d80'], 2.6, 53);
    }),
  );
}

/** Chaussée : enrobé sombre, ligne axiale discontinue et lignes de rive. */
export function textureRoute(): THREE.CanvasTexture {
  return repetable(
    toile(256, 256, (ctx) => {
      ctx.fillStyle = '#3d4044';
      ctx.fillRect(0, 0, 256, 256);
      grain(ctx, 256, 1500, ['#33363a', '#4a4d52', '#2c2f32', '#55585d'], 1.8, 71);
      ctx.fillStyle = '#e9e4d4';
      ctx.fillRect(0, 122, 128, 10);
      ctx.fillRect(0, 12, 256, 5);
      ctx.fillRect(0, 239, 256, 5);
    }),
  );
}

/** Façade d'immeuble de bureaux : trame de fenêtres, certaines éclairées. */
export function textureBureaux(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [canvasMap, m] = creerCanvas(256, 256);
  const [canvasEmi, e] = creerCanvas(256, 256);
  const rnd = aleatoire(404);
  m.fillStyle = '#d8d3c8';
  m.fillRect(0, 0, 256, 256);
  e.fillStyle = '#000';
  e.fillRect(0, 0, 256, 256);
  for (let ligne = 0; ligne < 4; ligne++) {
    for (let colonne = 0; colonne < 8; colonne++) {
      const x = 8 + colonne * 31;
      const y = 14 + ligne * 60;
      m.fillStyle = rnd() > 0.5 ? '#3b566e' : '#4a6a86';
      m.fillRect(x, y, 23, 38);
      m.fillStyle = 'rgba(255,255,255,0.25)';
      m.fillRect(x, y, 23, 6);
      if (rnd() > 0.7) {
        e.fillStyle = '#ffdf9a';
        e.fillRect(x + 2, y + 8, 19, 28);
      }
    }
  }
  const map = repetable(new THREE.CanvasTexture(canvasMap));
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = repetable(new THREE.CanvasTexture(canvasEmi));
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

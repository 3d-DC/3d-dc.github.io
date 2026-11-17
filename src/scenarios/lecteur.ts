import type { Scenario, Step, WorldState } from '../types';
import { calculerEtat } from './scenarios';

export interface Lecture {
  readonly scenario: Scenario;
  readonly index: number;
  readonly etape: Step;
  readonly etat: WorldState;
  readonly enPause: boolean;
  /** Avancement de l'étape courante, de 0 à 1. */
  readonly progression: number;
}

/** Fait défiler les étapes d'un scénario, avec pause et navigation manuelle. */
export class Lecteur {
  private scenario: Scenario | null = null;
  private index = 0;
  private temps = 0;
  private enPause = false;
  private etat: WorldState | null = null;

  /** `nouvelleEtape` est vrai quand l'étape (donc l'état du monde) a changé. */
  constructor(private readonly notifier: (nouvelleEtape: boolean) => void) {}

  demarrer(scenario: Scenario): void {
    this.scenario = scenario;
    this.enPause = false;
    this.allerA(0);
  }

  arreter(): void {
    this.scenario = null;
    this.etat = null;
    this.notifier(true);
  }

  suivant(): void {
    if (this.scenario && this.index < this.scenario.etapes.length - 1) this.allerA(this.index + 1);
  }

  precedent(): void {
    if (this.scenario && this.index > 0) this.allerA(this.index - 1);
  }

  basculerPause(): void {
    if (!this.scenario) return;
    this.enPause = !this.enPause;
    this.notifier(false);
  }

  maj(dt: number): void {
    const etape = this.etapeCourante();
    if (!this.scenario || !etape || this.enPause) return;
    this.temps += dt;
    if (this.temps < etape.duree) return;
    if (this.index < this.scenario.etapes.length - 1) this.suivant();
    else this.temps = etape.duree;
  }

  lecture(): Lecture | null {
    const etape = this.etapeCourante();
    if (!this.scenario || !etape || !this.etat) return null;
    return {
      scenario: this.scenario,
      index: this.index,
      etape,
      etat: this.etat,
      enPause: this.enPause,
      progression: Math.min(1, this.temps / etape.duree),
    };
  }

  private etapeCourante(): Step | null {
    return this.scenario?.etapes[this.index] ?? null;
  }

  private allerA(index: number): void {
    if (!this.scenario) return;
    this.index = index;
    this.temps = 0;
    this.etat = calculerEtat(this.scenario, index);
    this.notifier(true);
  }
}

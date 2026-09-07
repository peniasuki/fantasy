import type { PlayerMatchStats, Position } from "./types";

/** Sistema Estadísticas Biwenger. Redondeo al entero más cercano al final. */
export function scoreEstadisticas(stats: PlayerMatchStats): {
  points: number;
  breakdown: { label: string; value: number }[];
} {
  if (stats.minutes <= 0) {
    return { points: 0, breakdown: [{ label: "Sin minutos", value: 0 }] };
  }

  const breakdown: { label: string; value: number }[] = [];
  const add = (label: string, value: number) => {
    if (value !== 0) breakdown.push({ label, value });
  };

  const openPlayGoals = Math.max(0, stats.goals - stats.penaltyGoals);
  add("Goles", openPlayGoals * 4);
  add("Goles de penalti", stats.penaltyGoals * 3);
  add("Goles en propia", stats.ownGoals * -1.5);
  add("Asistencias", stats.assists * 1.5);

  const extraShotsOn = Math.max(0, stats.shotsOnTarget - stats.goals);
  add("Tiros a puerta", extraShotsOn * 1);
  add("Tiros fuera", stats.shotsOff * 0);
  add("Faltas recibidas", stats.foulsDrawn * 0.3);
  add("Faltas cometidas", stats.foulsCommitted * -0.3);
  add("Intercepciones", stats.interceptions * 0.3);
  add("Centros", stats.crosses * 0.3);
  add("Regates", stats.dribbles * 0.2);
  add("Entradas", stats.tackles * 0.5);

  if (stats.secondYellow) add("Doble amarilla", -2);
  else add("Amarilla", stats.yellowCards * -1);
  if (stats.redCard && !stats.secondYellow) add("Roja directa", -3);

  add("Penalti fallado", stats.penaltyMissed * -2);
  add("Penalti parado", stats.penaltySaved * 3);
  add("Paradas", stats.saves * 1);

  if (stats.minutes >= 75 && stats.goalsConceded === 0) {
    const cs = cleanSheetBonus(stats.position);
    add("Portería a cero", cs);
  }
  if (stats.position === "GK") add("Goles encajados", stats.goalsConceded * -1);
  if (stats.position === "DF") add("Goles encajados", stats.goalsConceded * -0.3);

  const raw = breakdown.reduce((sum, row) => sum + row.value, 0);
  const points = Math.round(raw);
  breakdown.push({ label: "Redondeo", value: points - raw });
  return { points, breakdown };
}

function cleanSheetBonus(position: Position): number {
  if (position === "GK" || position === "DF") return 3;
  if (position === "MF") return 1;
  return 0;
}

export function mapApiFootballStats(
  position: Position,
  raw: {
    minutes?: number | null;
    goals?: { total?: number | null; assists?: number | null; conceded?: number | null; saves?: number | null };
    penalty?: {
      scored?: number | null;
      missed?: number | null;
      saved?: number | null;
    };
    shots?: { on?: number | null; total?: number | null };
    fouls?: { drawn?: number | null; committed?: number | null };
    tackles?: { total?: number | null; interceptions?: number | null };
    dribbles?: { success?: number | null };
    passes?: { total?: number | null; key?: number | null };
    cards?: { yellow?: number | null; red?: number | null };
    games?: { minutes?: number | null; rating?: string | null; position?: string | null };
  },
): PlayerMatchStats {
  const minutes = raw.games?.minutes ?? raw.minutes ?? 0;
  const goals = raw.goals?.total ?? 0;
  const penaltyGoals = raw.penalty?.scored ?? 0;
  const shotsOn = raw.shots?.on ?? 0;
  const shotsTotal = raw.shots?.total ?? 0;
  return {
    minutes: minutes ?? 0,
    position,
    goals: goals ?? 0,
    penaltyGoals: penaltyGoals ?? 0,
    ownGoals: 0,
    assists: raw.goals?.assists ?? 0,
    shotsOnTarget: shotsOn ?? 0,
    shotsOff: Math.max(0, (shotsTotal ?? 0) - (shotsOn ?? 0)),
    foulsDrawn: raw.fouls?.drawn ?? 0,
    foulsCommitted: raw.fouls?.committed ?? 0,
    interceptions: raw.tackles?.interceptions ?? 0,
    crosses: raw.passes?.key ?? 0,
    dribbles: raw.dribbles?.success ?? 0,
    tackles: raw.tackles?.total ?? 0,
    yellowCards: raw.cards?.yellow ?? 0,
    redCard: (raw.cards?.red ?? 0) > 0,
    secondYellow: (raw.cards?.yellow ?? 0) >= 2 && (raw.cards?.red ?? 0) > 0,
    penaltyMissed: raw.penalty?.missed ?? 0,
    penaltySaved: raw.penalty?.saved ?? 0,
    saves: raw.goals?.saves ?? 0,
    goalsConceded: raw.goals?.conceded ?? 0,
    rating: raw.games?.rating ? Number(raw.games.rating) : null,
  };
}

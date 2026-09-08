import { describe, expect, it } from "vitest";
import { parseJpPuntosHtml } from "./jp-puntos";
import { readFileSync } from "node:fs";

describe("parseJpPuntosHtml", () => {
  it("parsea local/visitante y puntos", () => {
    const html = `
      <div class="puntos-partido" itemscope>
        <time itemprop="startDate" content="2026-08-15T17:30:00+00:00"></time>
        <div itemprop="homeTeam" itemscope><meta itemprop="name" content="Alavés"></div>
        <div itemprop="awayTeam" itemscope><meta itemprop="name" content="Getafe"></div>
        <span class="puntos-resultado-marcador">3</span>
        <span class="puntos-resultado-marcador">0</span>
        <div class="col-6-12 mobile-col-6-12">
          <div class="puntos-jugador">
            <img src="https://cdn.biwenger.com/i/p/9887.png"/>
            <div class="jugador-posicion pt">PT</div>
            <div class="puntos-jugador-nombre"><a>Sivera</a></div>
            <div class="puntos-jugador-puntuacion">5</div>
          </div>
        </div>
        <div class="col-6-12 mobile-col-6-12">
          <div class="puntos-jugador">
            <img src="https://cdn.biwenger.com/i/p/11.png"/>
            <div class="jugador-posicion pt">PT</div>
            <div class="puntos-jugador-nombre"><a>David Soria</a></div>
            <div class="puntos-jugador-puntuacion">-1</div>
          </div>
        </div>
      </div>
    `;
    const parsed = parseJpPuntosHtml(html, 1);
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0].home).toBe("Alavés");
    expect(parsed.matches[0].away).toBe("Getafe");
    expect(parsed.matches[0].homeGoals).toBe(3);
    expect(parsed.matches[0].homePlayers[0]).toMatchObject({
      playerId: "bw_9887",
      points: 5,
      venue: "home",
    });
    expect(parsed.matches[0].awayPlayers[0]).toMatchObject({
      playerId: "bw_11",
      points: -1,
      venue: "away",
    });
  });

  it("parsea HTML real de JP si existe en /tmp", () => {
    let html = "";
    try {
      html = readFileSync("/tmp/jp-puntos-1.html", "utf8");
    } catch {
      return;
    }
    const parsed = parseJpPuntosHtml(html, 1);
    expect(parsed.matches.length).toBe(10);
    const total = parsed.matches.reduce(
      (n, m) => n + m.homePlayers.length + m.awayPlayers.length,
      0,
    );
    expect(total).toBeGreaterThan(200);
  });
});

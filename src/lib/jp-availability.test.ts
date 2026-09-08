import { describe, expect, it } from "vitest";
import { parseJpAvailabilityHtml } from "../../src/lib/jp-availability";

const SAMPLE = `
<div class="lesionados-jugador" style="display:flex">
  <div class="lesionados-jugador-iconos">
    <img src='/assets/images/iconos/lesion.png' title='Lesionado' alt='Lesionado'/>
  </div>
  <div style="width:100%">
    <a href="https://www.jornadaperfecta.com/jugador/facundo-garces">
      <img class="lesionados-jugador-foto" src="https://cdn.biwenger.com/i/p/35426.png"/>
    </a>
    <div class="lesionados-jugador-nombre">
      <a href='https://www.jornadaperfecta.com/jugador/facundo-garces'>Facundo Garcés</a>
      <div class="lesionados-jugador-motivo">Rotura del ligamento</div>
    </div>
  </div>
</div>
<div class="lesionados-jugador">
  <div class="lesionados-jugador-sanos">
    <img src="https://www.jornadaperfecta.com/assets/images/iconos/tick.png"/>
    <div class="lesionados-jugador-sanos-frase">Ningún jugador sancionado</div>
  </div>
</div>
<div class="lesionados-jugador">
  <div class="lesionados-jugador-iconos">
    <img src='/assets/images/iconos/tarjeta.png' title='Sancionado'/>
  </div>
  <a href="https://www.jornadaperfecta.com/jugador/foo">
    <img src="https://cdn.biwenger.com/i/p/99.png"/>
  </a>
  <div class="lesionados-jugador-nombre"><a href='https://www.jornadaperfecta.com/jugador/foo'>Foo</a>
  <div class="lesionados-jugador-motivo">Roja</div></div>
</div>
`;

describe("parseJpAvailabilityHtml", () => {
  it("extrae lesionados por biwenger id", () => {
    const rows = parseJpAvailabilityHtml(SAMPLE, "lesionados");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: "bw_35426",
      kind: "injured",
      name: "Facundo Garcés",
    });
  });

  it("extrae sancionados", () => {
    const rows = parseJpAvailabilityHtml(SAMPLE, "sancionados");
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("bw_99");
    expect(rows[0].kind).toBe("suspended");
  });
});

import { describe, expect, it } from "vitest";
import { foldPlayerName, namesMatch, parseJpMercadoHtml } from "./jp-mercado";

describe("jp-mercado", () => {
  it("parses marketCaching and maps Valor/price", () => {
    const html = `
      <script>
      const marketCaching = [{"playerId":"1","remote_player":"19577","name":"Mbappé","position":"delantero","team":"Real Madrid","price":"25000000","price_eur":"25000000"},{"playerId":"2","remote_player":"9","name":"Xavi","position":"entrenador","team":"Barcelona","price":"100"}];
      </script>
    `;
    const rows = parseJpMercadoHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      catalogId: "bw_19577",
      biwengerId: "19577",
      name: "Mbappé",
      price: 25_000_000,
      position: "FW",
    });
  });

  it("matches names ignoring accents and case", () => {
    expect(foldPlayerName("Mbappé")).toBe("mbappe");
    expect(namesMatch("Mbappé", "Mbappe")).toBe(true);
    expect(namesMatch("Yamal", "Lamine Yamal")).toBe(false);
  });
});

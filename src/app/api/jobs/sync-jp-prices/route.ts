import { NextResponse } from "next/server";
import type { WriteBatch } from "firebase-admin/firestore";
import { madridDateYmd } from "fantasy-rules";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID } from "@/lib/league";
import { fetchJpMercado, namesMatch } from "@/lib/jp-mercado";

const BATCH_LIMIT = 400;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

/**
 * Actualiza solo el Valor (VM) desde JP /mercado/.
 * - No crea ni borra jugadores del catálogo.
 * - Si el nombre JP no coincide con el guardado, no actualiza ese precio y lo reporta.
 * - Guarda histórico diario en players/{id}/priceHistory/{ymd}.
 */
export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const now = Date.now();
    const ymd = madridDateYmd(new Date(now));
    const { sourceUrl, rows, fetchedAt } = await fetchJpMercado();

    const [playersSnap, listingsSnap] = await Promise.all([
      db().collection("players").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("listings").get(),
    ]);

    const catalogById = Object.fromEntries(playersSnap.docs.map((d) => [d.id, d.data()]));
    const jpByCatalogId = new Map(rows.map((r) => [r.catalogId, r]));

    const nameMismatches: Array<{
      playerId: string;
      storedName: string;
      jpName: string;
      jpPrice: number;
    }> = [];
    const missingInJp: string[] = [];
    const unknownInJp: string[] = [];

    let matched = 0;
    let updated = 0;
    let unchanged = 0;
    let skippedName = 0;
    let historyWrites = 0;
    let askPriceUpdated = 0;

    const writes: Array<(batch: WriteBatch) => void> = [];

    // Recorrer SIEMPRE el catálogo existente: nadie se pierde.
    for (const doc of playersSnap.docs) {
      if (doc.data().active === false) continue;
      const jp = jpByCatalogId.get(doc.id);
      if (!jp) {
        missingInJp.push(doc.id);
        continue;
      }
      matched += 1;
      const storedName = String(doc.data().name ?? "");
      if (!namesMatch(storedName, jp.name)) {
        skippedName += 1;
        nameMismatches.push({
          playerId: doc.id,
          storedName,
          jpName: jp.name,
          jpPrice: jp.price,
        });
        continue;
      }

      const prevPrice = Number(doc.data().currentPrice ?? doc.data().vm ?? 0);
      const nextPrice = jp.price;
      const changed = prevPrice !== nextPrice;

      if (changed) {
        updated += 1;
        writes.push((batch) =>
          batch.set(
            doc.ref,
            {
              vm: nextPrice,
              currentPrice: nextPrice,
              priceUpdatedAt: now,
              priceSource: "jornadaperfecta",
              updatedAt: now,
            },
            { merge: true },
          ),
        );
      } else {
        unchanged += 1;
      }

      // Histórico diario (idempotente por ymd): permite evolución aunque el valor no cambie.
      historyWrites += 1;
      writes.push((batch) =>
        batch.set(doc.ref.collection("priceHistory").doc(ymd), {
          at: now,
          ymd,
          value: nextPrice,
          previousValue: prevPrice,
          changed,
          source: "jornadaperfecta",
          sourceUrl,
        }),
      );
    }

    for (const row of rows) {
      if (!catalogById[row.catalogId]) unknownInJp.push(row.catalogId);
    }

    // Free agents: alinear askPrice con el nuevo VM cuando el jugador se actualizó.
    for (const listing of listingsSnap.docs) {
      const data = listing.data();
      if (data.kind !== "free_agent") continue;
      const playerId = String(data.playerId ?? "");
      const player = catalogById[playerId];
      if (!player || player.active === false) continue;
      const jp = jpByCatalogId.get(playerId);
      if (!jp) continue;
      if (!namesMatch(String(player.name ?? ""), jp.name)) continue;
      if (Number(data.askPrice ?? 0) === jp.price) continue;
      askPriceUpdated += 1;
      writes.push((batch) => batch.set(listing.ref, { askPrice: jp.price }, { merge: true }));
    }

    const summary = {
      type: "jp_prices_synced",
      at: now,
      ymd,
      sourceUrl,
      fetchedAt,
      jpRows: rows.length,
      catalogActive: playersSnap.docs.filter((d) => d.data().active !== false).length,
      matched,
      updated,
      unchanged,
      skippedName,
      historyWrites,
      askPriceUpdated,
      missingInJpCount: missingInJp.length,
      unknownInJpCount: unknownInJp.length,
      nameMismatches,
      missingInJpSample: missingInJp.slice(0, 30),
      unknownInJpSample: unknownInJp.slice(0, 30),
      adminMessage:
        nameMismatches.length === 0
          ? `VM actualizados: ${updated} cambios, ${unchanged} sin cambio. Catálogo intacto.`
          : `VM actualizados: ${updated} cambios. ${nameMismatches.length} jugador(es) NO actualizados por discrepancia de nombre (revisar nameMismatches).`,
    };

    writes.push((batch) =>
      batch.set(
        db().collection("leagues").doc(LEAGUE_ID).collection("activity").doc(`jp_prices_${ymd}_${now}`),
        summary,
      ),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      ...summary,
      message: summary.adminMessage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

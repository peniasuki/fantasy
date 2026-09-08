import { FieldValue } from "firebase-admin/firestore";
import type { WriteBatch } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID } from "@/lib/league";
import { playerFromJpRow, type JpMarketRow } from "@/lib/players";
import catalogJson from "@/data/jornadaperfecta-mercado.json";

const BATCH_LIMIT = 400;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const url = new URL(request.url);
    const openMarket = url.searchParams.get("openMarket") !== "0";
    const season = Number(process.env.SEASON || 2026);
    const now = Date.now();
    const rows = (catalogJson as { players: JpMarketRow[] }).players || [];

    const mapped = rows
      .map((row) => playerFromJpRow(row, season, now))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const [ownedSnap, listingsSnap, existingPlayers] = await Promise.all([
      leagueRef.collection("ownership").get(),
      leagueRef.collection("listings").get(),
      db().collection("players").get(),
    ]);
    const ownedIds = new Set(ownedSnap.docs.map((d) => d.data().playerId as string));
    const jpIds = new Set(mapped.map((p) => p.id));

    const writes: Array<(batch: WriteBatch) => void> = [];

    for (const player of mapped) {
      const ref = db().collection("players").doc(player.id);
      const prev = existingPlayers.docs.find((d) => d.id === player.id)?.data();
      writes.push((batch) =>
        batch.set(
          ref,
          {
            ...player,
            // Conservar historial de traspasos entre managers si ya existía.
            lastTransferPrice: prev?.lastTransferPrice ?? null,
            lastTransferAt: prev?.lastTransferAt ?? null,
            lastTransferFrom: prev?.lastTransferFrom ?? null,
            lastTransferTo: prev?.lastTransferTo ?? null,
            // Conservar acumulados de puntos JP.
            pointsHome: prev?.pointsHome ?? player.pointsHome ?? 0,
            pointsAway: prev?.pointsAway ?? player.pointsAway ?? 0,
            pointsTotal: prev?.pointsTotal ?? player.pointsTotal ?? 0,
          },
          { merge: true },
        ),
      );
    }

    // Desactivar catálogo antiguo (API-Football u otros) no presente en JP.
    let deactivated = 0;
    for (const doc of existingPlayers.docs) {
      if (jpIds.has(doc.id)) continue;
      if (ownedIds.has(doc.id)) continue;
      writes.push((batch) => batch.set(doc.ref, { active: false, updatedAt: now }, { merge: true }));
      deactivated += 1;
    }

    // Quitar listados free_agent de jugadores inactivos / no JP.
    for (const doc of listingsSnap.docs) {
      const data = doc.data();
      if (data.kind !== "free_agent") continue;
      const playerId = String(data.playerId);
      if (!jpIds.has(playerId) || ownedIds.has(playerId)) {
        writes.push((batch) => batch.delete(doc.ref));
      }
    }

    let listed = 0;
    if (openMarket) {
      const listedIds = new Set(
        listingsSnap.docs.filter((d) => d.data().kind === "free_agent").map((d) => String(d.data().playerId)),
      );
      for (const player of mapped) {
        if (ownedIds.has(player.id)) continue;
        const listingId = `fa_${player.id}`;
        writes.push((batch) =>
          batch.set(leagueRef.collection("listings").doc(listingId), {
            id: listingId,
            playerId: player.id,
            sellerId: "machine",
            askPrice: player.currentPrice,
            listedAt: now,
            expiresAt: now + 3650 * 24 * 60 * 60 * 1000,
            kind: "free_agent",
          }),
        );
        listed += 1;
        listedIds.add(player.id);
      }
    }

    writes.push((batch) =>
      batch.set(
        db().collection("system").doc("catalog"),
        {
          source: "jornadaperfecta",
          season,
          imported: mapped.length,
          listed,
          deactivated,
          at: FieldValue.serverTimestamp(),
          lastTeam: "",
          remaining: 0,
        },
        { merge: true },
      ),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      season,
      imported: mapped.length,
      skippedCoaches: rows.length - mapped.length,
      deactivated,
      freeAgentsListed: listed,
      openMarket,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

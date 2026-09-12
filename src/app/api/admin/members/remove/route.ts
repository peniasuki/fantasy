import { NextResponse } from "next/server";
import type { WriteBatch } from "firebase-admin/firestore";
import { requireUser } from "@/lib/auth";
import { adminAuth, db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague } from "@/lib/league";
import { isAdminEmail } from "@/lib/roles";

const BATCH_LIMIT = 400;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

/**
 * Borra una cuenta de manager: libera plantilla al mercado, limpia estado de liga
 * y elimina users/{uid} + Firebase Auth. No permite borrar al admin.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireUser();
    if (!isAdminEmail(admin.email)) {
      return NextResponse.json({ error: "Forbidden: solo el administrador." }, { status: 403 });
    }

    const body = (await request.json()) as { uid?: string };
    const targetUid = String(body.uid || "").trim();
    if (!targetUid) {
      return NextResponse.json({ error: "Falta uid." }, { status: 400 });
    }
    if (targetUid === admin.uid) {
      return NextResponse.json({ error: "No puedes borrar tu propia cuenta." }, { status: 400 });
    }

    const league = await getLeague();
    if (!league) return NextResponse.json({ error: "No hay liga." }, { status: 404 });

    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const memberRef = leagueRef.collection("members").doc(targetUid);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      return NextResponse.json({ error: "Ese manager no está en la liga." }, { status: 404 });
    }

    const userSnap = await db().collection("users").doc(targetUid).get();
    const targetEmail = (userSnap.data()?.email as string | null | undefined) ?? null;
    if (isAdminEmail(targetEmail) || memberSnap.data()?.role === "admin") {
      return NextResponse.json({ error: "No se puede borrar la cuenta del administrador." }, { status: 400 });
    }

    const now = Date.now();
    const [
      ownershipSnap,
      listingsSnap,
      bidsSnap,
      offersSnap,
      saleEventsSnap,
      matchdayScoresSnap,
      playersSnap,
    ] = await Promise.all([
      leagueRef.collection("ownership").get(),
      leagueRef.collection("listings").get(),
      leagueRef.collection("bids").get(),
      leagueRef.collection("offers").get(),
      leagueRef.collection("saleEvents").get(),
      leagueRef.collection("matchdayScores").get(),
      db().collection("players").get(),
    ]);

    const players = Object.fromEntries(playersSnap.docs.map((d) => [d.id, d.data()]));
    const ownedPlayerIds = new Set<string>();
    const deletedListingIds = new Set<string>();
    const writes: Array<(batch: WriteBatch) => void> = [];

    for (const doc of ownershipSnap.docs) {
      if (String(doc.data().ownerId) !== targetUid) continue;
      const playerId = String(doc.data().playerId ?? doc.id);
      ownedPlayerIds.add(playerId);
      writes.push((batch) => batch.delete(doc.ref));
    }

    for (const doc of listingsSnap.docs) {
      const data = doc.data();
      const playerId = String(data.playerId ?? "");
      const sellerId = String(data.sellerId ?? "");
      if (sellerId === targetUid || ownedPlayerIds.has(playerId)) {
        deletedListingIds.add(doc.id);
        writes.push((batch) => batch.delete(doc.ref));
      }
    }

    for (const playerId of ownedPlayerIds) {
      const player = players[playerId];
      if (!player || player.active === false) continue;
      const askPrice = Number(player.currentPrice ?? player.vm ?? 0);
      const listingId = `fa_${playerId}`;
      writes.push((batch) =>
        batch.set(leagueRef.collection("listings").doc(listingId), {
          id: listingId,
          playerId,
          sellerId: "machine",
          askPrice,
          listedAt: now,
          expiresAt: now + 3650 * 24 * 60 * 60 * 1000,
          kind: "free_agent",
        }),
      );
      writes.push((batch) =>
        batch.set(
          db().collection("players").doc(playerId),
          {
            lastTransferPrice: null,
            lastTransferAt: null,
            lastTransferFrom: null,
            lastTransferTo: null,
            updatedAt: now,
          },
          { merge: true },
        ),
      );
    }

    for (const doc of bidsSnap.docs) {
      const data = doc.data();
      if (
        String(data.bidderId) === targetUid ||
        deletedListingIds.has(String(data.listingId ?? ""))
      ) {
        writes.push((batch) => batch.delete(doc.ref));
      }
    }

    for (const doc of offersSnap.docs) {
      const data = doc.data();
      if (String(data.fromId) === targetUid || String(data.toId) === targetUid) {
        writes.push((batch) => batch.delete(doc.ref));
      }
    }

    for (const doc of saleEventsSnap.docs) {
      if (String(doc.data().uid) === targetUid) {
        writes.push((batch) => batch.delete(doc.ref));
      }
    }

    for (const doc of matchdayScoresSnap.docs) {
      const data = doc.data();
      if (String(data.uid) === targetUid || doc.id.endsWith(`_${targetUid}`)) {
        writes.push((batch) => batch.delete(doc.ref));
      }
    }

    writes.push((batch) => batch.delete(leagueRef.collection("lineups").doc(targetUid)));
    writes.push((batch) => batch.delete(memberRef));
    writes.push((batch) => batch.delete(db().collection("users").doc(targetUid)));
    writes.push((batch) =>
      batch.set(leagueRef.collection("activity").doc(`member_removed_${targetUid}_${now}`), {
        type: "member_removed",
        at: now,
        by: admin.uid,
        targetUid,
        targetEmail,
        displayName: memberSnap.data()?.displayName ?? null,
        playersReleased: ownedPlayerIds.size,
      }),
    );

    await commitInChunks(writes);

    let authDeleted = false;
    try {
      await adminAuth().deleteUser(targetUid);
      authDeleted = true;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "auth/user-not-found") {
        return NextResponse.json(
          {
            ok: true,
            warning: "Cuenta borrada de la liga, pero Firebase Auth falló.",
            detail: error instanceof Error ? error.message : String(error),
            targetUid,
            playersReleased: ownedPlayerIds.size,
            authDeleted: false,
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      targetUid,
      targetEmail,
      playersReleased: ownedPlayerIds.size,
      authDeleted,
      message: `Cuenta eliminada. ${ownedPlayerIds.size} jugador(es) vuelven al mercado.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

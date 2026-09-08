import { NextResponse } from "next/server";
import type { WriteBatch } from "firebase-admin/firestore";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { fetchJpPuntosJornada } from "@/lib/jp-puntos";
import { LEAGUE_ID, getLeague, settingsOf } from "@/lib/league";

const BATCH_LIMIT = 400;
const JP_SCORING = "jp-media-as-sofascore-16";

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
    const matchday = Number(url.searchParams.get("matchday") || url.searchParams.get("jornada") || "");
    if (!Number.isInteger(matchday) || matchday < 1 || matchday > 38) {
      return NextResponse.json(
        { error: "Indica ?matchday=N (1–38)." },
        { status: 400 },
      );
    }

    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const scoredRef = leagueRef.collection("scoredJornadas").doc(String(matchday));
    const scoredSnap = await scoredRef.get();
    if (scoredSnap.exists) {
      return NextResponse.json({
        ok: false,
        alreadyScored: true,
        message: `La jornada ${matchday} ya está incluida en la puntuación.`,
        scoredAt: scoredSnap.data()?.scoredAt ?? null,
      });
    }

    const jornada = await fetchJpPuntosJornada(matchday);
    const catalogSnap = await db().collection("players").get();
    const catalogIds = new Set(catalogSnap.docs.map((d) => d.id));
    const catalogById = Object.fromEntries(catalogSnap.docs.map((d) => [d.id, d.data()]));

    const now = Date.now();
    const writes: Array<(batch: WriteBatch) => void> = [];
    const pointsByPlayer: Record<string, number> = {};
    let ignored = 0;
    let storedPlayers = 0;

    const matchesForStore = jornada.matches.map((match) => {
      const all = [...match.homePlayers, ...match.awayPlayers];
      const players = [];
      for (const p of all) {
        if (!catalogIds.has(p.playerId)) {
          ignored += 1;
          continue;
        }
        players.push({
          playerId: p.playerId,
          name: p.name || catalogById[p.playerId]?.name || "",
          position: p.position,
          points: p.points,
          venue: p.venue,
        });
        pointsByPlayer[p.playerId] = (pointsByPlayer[p.playerId] ?? 0) + p.points;
        const scoreId = `${matchday}_${p.playerId}`;
        writes.push((batch) =>
          batch.set(leagueRef.collection("playerScores").doc(scoreId), {
            id: scoreId,
            playerId: p.playerId,
            matchday,
            points: p.points,
            venue: p.venue,
            home: match.home,
            away: match.away,
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
            kickoff: match.kickoff,
            scoringSystem: JP_SCORING,
            scoredAt: now,
          }),
        );
        storedPlayers += 1;
      }
      return {
        index: match.index,
        home: match.home,
        away: match.away,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        kickoff: match.kickoff,
        players,
      };
    });

    // Agregar Casa / Fuera / Total en catálogo.
    for (const [playerId, points] of Object.entries(pointsByPlayer)) {
      const prev = catalogById[playerId] ?? {};
      // Recompute from this jornada's venues
      let addHome = 0;
      let addAway = 0;
      for (const match of matchesForStore) {
        for (const p of match.players) {
          if (p.playerId !== playerId) continue;
          if (p.venue === "home") addHome += p.points;
          else addAway += p.points;
        }
      }
      writes.push((batch) =>
        batch.set(
          db().collection("players").doc(playerId),
          {
            pointsHome: Number(prev.pointsHome ?? 0) + addHome,
            pointsAway: Number(prev.pointsAway ?? 0) + addAway,
            pointsTotal: Number(prev.pointsTotal ?? 0) + points,
            pointsUpdatedAt: now,
            updatedAt: now,
          },
          { merge: true },
        ),
      );
    }

    writes.push((batch) =>
      batch.set(leagueRef.collection("jpMatchdays").doc(String(matchday)), {
        matchday,
        scoringSystem: JP_SCORING,
        sourceUrl: jornada.sourceUrl,
        scoredAt: now,
        matches: matchesForStore,
      }),
    );

    // Ranking managers: alineación actual (hueco = 0). Managers que entren después no reciben pts de jornadas ya puntuadas.
    const league = await getLeague();
    const settings = settingsOf(league);
    const [membersSnap, lineupsSnap] = await Promise.all([
      leagueRef.collection("members").get(),
      leagueRef.collection("lineups").get(),
    ]);
    const lineups = Object.fromEntries(lineupsSnap.docs.map((d) => [d.id, d.data()]));
    const roundScores: { uid: string; points: number }[] = [];

    for (const member of membersSnap.docs) {
      const lineup = lineups[member.id];
      const slots = (lineup?.slots ?? []) as { playerId: string | null }[];
      const points = slots.reduce((sum, slot) => {
        if (!slot.playerId) return sum;
        return sum + (pointsByPlayer[slot.playerId] ?? 0);
      }, 0);
      roundScores.push({ uid: member.id, points });
    }

    const mvpUid =
      roundScores.length > 0
        ? [...roundScores].sort((a, b) => b.points - a.points)[0]?.uid
        : null;

    for (const row of roundScores) {
      const memberData = membersSnap.docs.find((d) => d.id === row.uid)?.data() ?? {};
      const bonus =
        row.points * settings.bonusPerPoint + (row.uid === mvpUid ? settings.bonusMvp : 0);
      writes.push((batch) =>
        batch.set(
          leagueRef.collection("members").doc(row.uid),
          {
            points: Number(memberData.points ?? 0) + row.points,
            balance: Number(memberData.balance ?? 0) + bonus,
          },
          { merge: true },
        ),
      );
      writes.push((batch) =>
        batch.set(leagueRef.collection("matchdayScores").doc(`${matchday}_${row.uid}`), {
          uid: row.uid,
          matchday,
          points: row.points,
          bonus,
          mvp: row.uid === mvpUid,
          at: now,
          scoringSystem: JP_SCORING,
        }),
      );
    }

    writes.push((batch) =>
      batch.set(scoredRef, {
        matchday,
        scoredAt: now,
        sourceUrl: jornada.sourceUrl,
        scoringSystem: JP_SCORING,
        matches: matchesForStore.length,
        playersStored: storedPlayers,
        playersIgnored: ignored,
        managersUpdated: roundScores.length,
        mvpUid,
      }),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      matchday,
      matches: matchesForStore.length,
      playersStored: storedPlayers,
      playersIgnored: ignored,
      managers: roundScores.map((r) => ({
        uid: r.uid,
        points: r.points,
        mvp: r.uid === mvpUid,
      })),
      sourceUrl: jornada.sourceUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

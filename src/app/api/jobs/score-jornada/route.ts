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

type StoredMatchPlayer = {
  playerId: string;
  points: number;
  venue: "home" | "away";
};

/** Revierte una jornada ya puntuada (puntos jugadores + ranking managers). */
async function rollbackMatchday(matchday: number) {
  const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
  const [jpSnap, scoresSnap, memberScoresSnap, catalogSnap, membersSnap] = await Promise.all([
    leagueRef.collection("jpMatchdays").doc(String(matchday)).get(),
    leagueRef.collection("playerScores").where("matchday", "==", matchday).get(),
    leagueRef.collection("matchdayScores").where("matchday", "==", matchday).get(),
    db().collection("players").get(),
    leagueRef.collection("members").get(),
  ]);

  const writes: Array<(batch: WriteBatch) => void> = [];
  const catalogById = Object.fromEntries(catalogSnap.docs.map((d) => [d.id, d.data()]));

  const matches = (jpSnap.data()?.matches ?? []) as { players?: StoredMatchPlayer[] }[];
  const delta: Record<string, { home: number; away: number; total: number }> = {};
  for (const match of matches) {
    for (const p of match.players ?? []) {
      const d = delta[p.playerId] ?? { home: 0, away: 0, total: 0 };
      if (p.venue === "home") d.home += p.points;
      else d.away += p.points;
      d.total += p.points;
      delta[p.playerId] = d;
    }
  }

  for (const [playerId, d] of Object.entries(delta)) {
    const prev = catalogById[playerId] ?? {};
    writes.push((batch) =>
      batch.set(
        db().collection("players").doc(playerId),
        {
          pointsHome: Number(prev.pointsHome ?? 0) - d.home,
          pointsAway: Number(prev.pointsAway ?? 0) - d.away,
          pointsTotal: Number(prev.pointsTotal ?? 0) - d.total,
          updatedAt: Date.now(),
        },
        { merge: true },
      ),
    );
  }

  for (const doc of scoresSnap.docs) {
    writes.push((batch) => batch.delete(doc.ref));
  }

  const membersById = Object.fromEntries(membersSnap.docs.map((d) => [d.id, d.data()]));
  for (const doc of memberScoresSnap.docs) {
    const row = doc.data() as { uid?: string; points?: number; bonus?: number };
    const uid = String(row.uid || "");
    if (uid && membersById[uid]) {
      const m = membersById[uid];
      writes.push((batch) =>
        batch.set(
          leagueRef.collection("members").doc(uid),
          {
            points: Number(m.points ?? 0) - Number(row.points ?? 0),
            balance: Number(m.balance ?? 0) - Number(row.bonus ?? 0),
          },
          { merge: true },
        ),
      );
    }
    writes.push((batch) => batch.delete(doc.ref));
  }

  if (jpSnap.exists) writes.push((batch) => batch.delete(jpSnap.ref));
  writes.push((batch) => batch.delete(leagueRef.collection("scoredJornadas").doc(String(matchday))));

  await commitInChunks(writes);
}

export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const url = new URL(request.url);
    const matchday = Number(url.searchParams.get("matchday") || url.searchParams.get("jornada") || "");
    const force = url.searchParams.get("force") === "1";
    if (!Number.isInteger(matchday) || matchday < 1 || matchday > 38) {
      return NextResponse.json(
        { error: "Indica ?matchday=N (1–38)." },
        { status: 400 },
      );
    }

    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const scoredRef = leagueRef.collection("scoredJornadas").doc(String(matchday));
    const scoredSnap = await scoredRef.get();
    if (scoredSnap.exists && !force) {
      return NextResponse.json({
        ok: false,
        alreadyScored: true,
        message: `La jornada ${matchday} ya está incluida en la puntuación.`,
        scoredAt: scoredSnap.data()?.scoredAt ?? null,
      });
    }
    if (scoredSnap.exists && force) {
      await rollbackMatchday(matchday);
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

    for (const [playerId, points] of Object.entries(pointsByPlayer)) {
      const prev = catalogById[playerId] ?? {};
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

    const league = await getLeague();
    const settings = settingsOf(league);
    const managerFrom = settings.managerScoringFromMatchday ?? 5;
    const scoreManagers = matchday >= managerFrom;

    const [membersSnap, lineupsSnap] = await Promise.all([
      leagueRef.collection("members").get(),
      leagueRef.collection("lineups").get(),
    ]);
    const freshMembers = force ? await leagueRef.collection("members").get() : membersSnap;
    const lineups = Object.fromEntries(lineupsSnap.docs.map((d) => [d.id, d.data()]));
    const roundScores: { uid: string; points: number }[] = [];
    let mvpUid: string | null = null;

    if (scoreManagers) {
      for (const member of freshMembers.docs) {
        const lineup = lineups[member.id];
        const slots = (lineup?.slots ?? []) as { playerId: string | null }[];
        const points = slots.reduce((sum, slot) => {
          if (!slot.playerId) return sum;
          return sum + (pointsByPlayer[slot.playerId] ?? 0);
        }, 0);
        roundScores.push({ uid: member.id, points });
      }

      mvpUid =
        roundScores.length > 0
          ? [...roundScores].sort((a, b) => b.points - a.points)[0]?.uid ?? null
          : null;

      for (const row of roundScores) {
        const memberData = freshMembers.docs.find((d) => d.id === row.uid)?.data() ?? {};
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
        managersUpdated: scoreManagers ? roundScores.length : 0,
        mvpUid: scoreManagers ? mvpUid : null,
        forced: force,
        managersScored: scoreManagers,
        ...(scoreManagers
          ? {}
          : { managersSkipReason: `Clasificación de managers desde jornada ${managerFrom}.` }),
      }),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      matchday,
      forced: force,
      matches: matchesForStore.length,
      playersStored: storedPlayers,
      playersIgnored: ignored,
      managersScored: scoreManagers,
      managerScoringFromMatchday: managerFrom,
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

#!/usr/bin/env python3
"""Descarga el calendario oficial LaLiga EA Sports y escribe el calendario maestro."""

from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

SEASON_ID = 102
COMPETITION_ID = 1
SOURCE_PAGE = "https://www.laliga.com/calendario-2026-2027/laliga-easports"
SOURCE_JSON = f"https://assets.laliga.com/assets/calendar/calendar-{SEASON_ID}-{COMPETITION_ID}.json"
MADRID = ZoneInfo("Europe/Madrid")
REPO = Path(__file__).resolve().parents[1]


def main() -> None:
    req = urllib.request.Request(SOURCE_JSON, headers={"User-Agent": "FantasyBros/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
    data = list(raw.values()) if isinstance(raw, dict) else raw

    matchdays = []
    for gw in sorted(data, key=lambda x: int(x["gameweek_week"])):
        dd, mm, yyyy = map(int, gw["gameweek_date"].split("."))
        starts = datetime(yyyy, mm, dd, 0, 0, 0, tzinfo=MADRID)
        lock = (starts - timedelta(days=1)).replace(hour=23, minute=0, second=0, microsecond=0)
        matchdays.append(
            {
                "number": int(gw["gameweek_week"]),
                "name": gw["gameweek_name"],
                "officialDate": gw["gameweek_date"],
                "startsOn": starts.date().isoformat(),
                "lockAt": lock.isoformat(),
                "matches": [
                    {
                        "laligaMatchId": m["match_id"],
                        "home": {"name": m["local_name"], "slug": m["local_slug"]},
                        "away": {"name": m["away_name"], "slug": m["away_slug"]},
                    }
                    for m in gw["matches"]
                ],
            }
        )

    out = {
        "season": "2026-2027",
        "competition": "laliga-easports",
        "laligaSeasonId": SEASON_ID,
        "laligaCompetitionId": COMPETITION_ID,
        "sourceUrl": SOURCE_PAGE,
        "sourceJson": SOURCE_JSON,
        "fetchedAt": datetime.now(tz=MADRID).isoformat(),
        "timezone": "Europe/Madrid",
        "rules": {
            "availabilitySyncAt": "day before jornada startsOn, 23:00 Europe/Madrid (lockAt)",
            "nonAlignable": ["injured", "suspended"],
            "emptyLineupSlotPoints": 0,
        },
        "matchdays": matchdays,
    }
    text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    for path in (REPO / "data" / "laliga-calendar-2026-2027.json", REPO / "src" / "data" / "laliga-calendar-2026-2027.json"):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(f"wrote {path} ({len(matchdays)} jornadas)")


if __name__ == "__main__":
    main()

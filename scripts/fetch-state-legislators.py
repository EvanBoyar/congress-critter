#!/usr/bin/env python3
"""
Fetch OpenStates bulk CSV for each state and convert to compact JSON.
Output: data/state-legislators/{state}.json
Run from the repo root: python3 scripts/fetch-state-legislators.py
"""

import csv, io, json, os, sys, time, urllib.request

BASE_URL = "https://data.openstates.org/people/current"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "state-legislators")

STATES = [
    "ak", "al", "ar", "az", "ca", "co", "ct", "de", "fl", "ga",
    "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
    "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
    "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
    "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
    "dc",
]

PARTY_MAP = {
    "Democratic": "Democrat",
    "Democrat": "Democrat",
    "Republican": "Republican",
    "Independent": "Independent",
    "Nonpartisan": "Nonpartisan",
    "Green": "Green",
    "Libertarian": "Libertarian",
}


def normalize_party(p):
    return PARTY_MAP.get(p.strip(), p.strip())


def normalize_district(d):
    d = d.strip()
    try:
        return int(d)
    except (ValueError, TypeError):
        return d or None


def get_website(links_json):
    if not links_json or not links_json.strip():
        return None
    try:
        links = json.loads(links_json)
        if links:
            return links[0].get("url") or None
    except Exception:
        pass
    return None


def nonempty(s):
    return s.strip() if s and s.strip() else None


def process_state(state):
    url = f"{BASE_URL}/{state}.csv"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "congress-critter/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8")
    except Exception as e:
        print(f"  ERROR fetching {state}: {e}", file=sys.stderr)
        return None

    upper, lower = [], []

    for row in csv.DictReader(io.StringIO(content)):
        chamber = row.get("current_chamber", "").strip()
        # Nebraska is unicameral and uses "legislature"; treat as upper
        if chamber == "legislature":
            chamber = "upper"
        elif chamber not in ("upper", "lower"):
            continue

        person = {"name": nonempty(row.get("name", ""))}
        if not person["name"]:
            continue

        person["party"] = normalize_party(row.get("current_party", ""))
        person["district"] = normalize_district(row.get("current_district", ""))

        # Phones
        phone = nonempty(row.get("capitol_voice", ""))
        district_phone = nonempty(row.get("district_voice", ""))
        if phone:
            person["phone"] = phone
        if district_phone:
            person["district_phone"] = district_phone

        # Addresses
        address = nonempty(row.get("capitol_address", ""))
        district_address = nonempty(row.get("district_address", ""))
        if address:
            person["address"] = address
        if district_address:
            person["district_address"] = district_address

        # Contact
        email = nonempty(row.get("email", ""))
        if email:
            person["email"] = email

        website = get_website(row.get("links", ""))
        if website:
            person["website"] = website

        if chamber == "upper":
            upper.append(person)
        else:
            lower.append(person)

    return {"upper": upper, "lower": lower}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ok, failed = 0, 0

    for state in STATES:
        print(f"Fetching {state}...", end=" ", flush=True)
        data = process_state(state)
        if data is None:
            failed += 1
            continue

        out_path = os.path.join(OUT_DIR, f"{state}.json")
        with open(out_path, "w") as f:
            json.dump(data, f, separators=(",", ":"))

        print(f"{len(data['upper'])} upper, {len(data['lower'])} lower")
        ok += 1
        time.sleep(0.1)  # be polite

    print(f"\nDone: {ok} states written, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

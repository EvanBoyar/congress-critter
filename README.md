# Congress Critter

Find and call your U.S. Representative, U.S. Senators, and state legislators in a couple taps.

**https://evanboyar.github.io/congress-critter/**

## Usage

Enter your address or share your location. The app looks up your congressional and state legislative districts via the U.S. Census Geocoder, then pulls your officials' names, parties, and phone numbers from publicly maintained data sources. You need no account, no API key, and there is no personal data collected: everything runs in your browser.

All three result sections (U.S. Representative, U.S. Senators, State Legislature) are collapsible. The representative is shown by default; the others are collapsed until you open them.

## Deep linking

You can link directly to a specific section, which is useful for sharing or embedding:

| URL | Opens to |
|---|---|
| `https://evanboyar.github.io/congress-critter/#usrep` | U.S. Representative |
| `https://evanboyar.github.io/congress-critter/#senators` | U.S. Senators |
| `https://evanboyar.github.io/congress-critter/#stateleg` | State Legislature |

When a hash is present, only that section is expanded and the others are collapsed.

## Data sources

- **Federal legislators** — [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators), fetched live at runtime
- **State legislators** — [OpenStates](https://openstates.org) bulk data, updated nightly by a GitHub Action and served from this repo
- **District lookup** — [U.S. Census Geocoder](https://geocoding.geo.census.gov/)

## Local development (most people will not use this)

```
python3 -m http.server 8765
```

Open `http://localhost:8765`. A local server is required for geolocation and to fetch the state data files; `file://` won't work for those.

To regenerate state data:
```
python3 scripts/fetch-state-legislators.py
```

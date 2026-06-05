var StateLegislators = (function () {
  var cache = {};

  // Per-state chamber overrides. Each entry may set `upper`, `lower`, and/or
  // `unicameral: true`. Missing entries fall back to DEFAULT_CHAMBERS below.
  // `title` is the legislator's title shown on the card; `name` is the chamber
  // name shown in the heading above the card.
  var CHAMBERS = {
    CA: { lower: { title: "Assemblymember",       name: "State Assembly" } },
    NY: { lower: { title: "Assembly Member",      name: "State Assembly" } },
    NV: { lower: { title: "Assemblymember",       name: "State Assembly" } },
    NJ: { lower: { title: "Assemblymember",       name: "General Assembly" } },
    WI: { lower: { title: "State Representative", name: "State Assembly" } },
    VA: { lower: { title: "Delegate",             name: "House of Delegates" } },
    MD: { lower: { title: "Delegate",             name: "House of Delegates" } },
    WV: { lower: { title: "Delegate",             name: "House of Delegates" } },
    NE: {
      unicameral: true,
      upper: { title: "State Senator", name: "Nebraska Legislature" },
    },
    DC: {
      unicameral: true,
      upper: { title: "Councilmember", name: "Council of the District of Columbia" },
    },
    PR: {
      upper: { title: "Senator",        name: "Senado de Puerto Rico" },
      lower: { title: "Representative", name: "Cámara de Representantes" },
    },
  };

  var DEFAULT_CHAMBERS = {
    upper: { title: "State Senator",        name: "State Senate" },
    lower: { title: "State Representative", name: "House of Representatives" },
  };

  function chamberInfo(stateAbbr, chamber) {
    var override = CHAMBERS[stateAbbr] && CHAMBERS[stateAbbr][chamber];
    return override || DEFAULT_CHAMBERS[chamber];
  }

  function isUnicameral(stateAbbr) {
    return !!(CHAMBERS[stateAbbr] && CHAMBERS[stateAbbr].unicameral);
  }

  function fetchState(stateAbbr) {
    var key = stateAbbr.toLowerCase();
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetch("data/state-legislators/" + key + ".json")
      .then(function (res) {
        if (!res.ok) throw new Error("No state legislator data available for " + stateAbbr + ".");
        return res.json();
      })
      .then(function (data) {
        cache[key] = data;
        return data;
      });
  }

  function matchDistrict(legislators, censusDistrict) {
    if (!censusDistrict || !legislators || !legislators.length) return null;
    var distNum = parseInt(censusDistrict, 10);
    for (var i = 0; i < legislators.length; i++) {
      var leg = legislators[i];
      // leg.district is stored as int (or string for non-numeric)
      if (leg.district === distNum || leg.district === censusDistrict) {
        return leg;
      }
    }
    return null;
  }

  // DC Council: 8 wards + 4 at-large + 1 chair. Census returns SLDU like "002"
  // for the ward, but OpenStates stores district as "Ward 2" / "At-Large" /
  // "Chairman". Match the ward member by SLDU; collect the chair and at-large
  // members separately (they represent everyone citywide).
  function matchDcCouncil(legislators, sldu) {
    var result = { ward: null, atLarge: [] };
    if (!legislators) return result;
    var wardName = sldu ? "Ward " + parseInt(sldu, 10) : null;
    for (var i = 0; i < legislators.length; i++) {
      var leg = legislators[i];
      if (leg.district === wardName) result.ward = leg;
      else if (leg.district === "Chairman") result.atLarge.unshift(leg); // chair first
      else if (leg.district === "At-Large") result.atLarge.push(leg);
    }
    return result;
  }

  // Returns { upper, lower, atLarge } — atLarge is populated only for DC.
  function findStateLegislators(stateAbbr, sldu, sldl) {
    return fetchState(stateAbbr).then(function (data) {
      if (stateAbbr === "DC") {
        var dc = matchDcCouncil(data.upper, sldu);
        return { upper: dc.ward, lower: null, atLarge: dc.atLarge };
      }
      return {
        upper: matchDistrict(data.upper, sldu),
        lower: matchDistrict(data.lower, sldl),
        atLarge: [],
      };
    });
  }

  return {
    findStateLegislators: findStateLegislators,
    chamberInfo: chamberInfo,
    isUnicameral: isUnicameral,
  };
})();

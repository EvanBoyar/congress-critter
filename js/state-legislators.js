var StateLegislators = (function () {
  var cache = {};

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

  // Returns { upper: person|null, lower: person|null }
  function findStateLegislators(stateAbbr, sldu, sldl) {
    return fetchState(stateAbbr).then(function (data) {
      return {
        upper: matchDistrict(data.upper, sldu),
        lower: matchDistrict(data.lower, sldl),
      };
    });
  }

  return {
    findStateLegislators: findStateLegislators,
  };
})();

var Legislators = (function () {
  var BASE_URL = "https://unitedstates.github.io/congress-legislators";
  var LEGISLATORS_URL = BASE_URL + "/legislators-current.json";
  var OFFICES_URL = BASE_URL + "/legislators-district-offices.json";

  var FIPS_TO_STATE = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
    "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
    "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
    "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
    "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
    "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
    "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR",
    "78": "VI",
  };

  var cachedLegislators = null;
  var cachedOffices = null;

  function fetchJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Failed to load data from " + url);
      return res.json();
    });
  }

  function fetchLegislators() {
    if (cachedLegislators) return Promise.resolve(cachedLegislators);
    return fetchJSON(LEGISLATORS_URL).then(function (data) {
      cachedLegislators = data;
      return data;
    });
  }

  function fetchOffices() {
    if (cachedOffices) return Promise.resolve(cachedOffices);
    return fetchJSON(OFFICES_URL).then(function (data) {
      cachedOffices = data;
      return data;
    });
  }

  function fipsToState(fips) {
    return FIPS_TO_STATE[fips] || null;
  }

  function findRepresentative(stateAbbr, district) {
    // Normalize district: Census returns "00" for at-large, "98" for DC delegate
    var districtNum = parseInt(district, 10);
    // DC delegate district is 98 in Census, 0 in congress-legislators
    if (districtNum === 98) districtNum = 0;

    return fetchLegislators().then(function (legislators) {
      var rep = null;
      for (var i = 0; i < legislators.length; i++) {
        var leg = legislators[i];
        var terms = leg.terms;
        var current = terms[terms.length - 1];
        if (
          current.type === "rep" &&
          current.state === stateAbbr &&
          current.district === districtNum
        ) {
          rep = leg;
          break;
        }
      }

      if (!rep) {
        throw new Error(
          "No House representative found for " + stateAbbr +
          " district " + districtNum + "."
        );
      }

      var current = rep.terms[rep.terms.length - 1];
      var name = rep.name.official_full ||
        (rep.name.first + " " + rep.name.last);
      var partyMap = { D: "Democrat", R: "Republican", I: "Independent" };
      var party = partyMap[current.party] || current.party;
      var bioguide = rep.id.bioguide;

      return {
        name: name,
        party: party,
        phone: current.phone || null,
        website: current.url || null,
        contactForm: current.contact_form || null,
        dcAddress: current.address || null,
        district: districtNum,
        state: stateAbbr,
        bioguide: bioguide,
      };
    });
  }

  function findSenators(stateAbbr) {
    return fetchLegislators().then(function (legislators) {
      var senators = [];
      for (var i = 0; i < legislators.length; i++) {
        var leg = legislators[i];
        var current = leg.terms[leg.terms.length - 1];
        if (current.type === "sen" && current.state === stateAbbr) {
          var name = leg.name.official_full || (leg.name.first + " " + leg.name.last);
          var partyMap = { D: "Democrat", R: "Republican", I: "Independent" };
          senators.push({
            name: name,
            party: partyMap[current.party] || current.party,
            rank: current.state_rank || null,
            phone: current.phone || null,
            website: current.url || null,
            contactForm: current.contact_form || null,
            dcAddress: current.address || null,
            state: stateAbbr,
            bioguide: leg.id.bioguide,
          });
        }
      }
      return senators;
    });
  }

  function findDistrictOffices(bioguide) {
    return fetchOffices().then(function (allOffices) {
      for (var i = 0; i < allOffices.length; i++) {
        if (allOffices[i].id.bioguide === bioguide) {
          return allOffices[i].offices || [];
        }
      }
      return [];
    });
  }

  return {
    fipsToState: fipsToState,
    findRepresentative: findRepresentative,
    findSenators: findSenators,
    findDistrictOffices: findDistrictOffices,
  };
})();

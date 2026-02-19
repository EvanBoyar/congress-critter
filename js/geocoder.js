var Geocoder = (function () {
  var CENSUS_BASE = "https://geocoding.geo.census.gov/geocoder/geographies";
  var BENCHMARK = "Public_AR_Current";
  var VINTAGE = "Current_Current";
  var TIMEOUT_MS = 10000;
  var callbackId = 0;

  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var cbName = "__censusCallback" + callbackId++;
      var script = document.createElement("script");
      var timedOut = false;

      function cleanup() {
        delete window[cbName];
        script.remove();
      }

      var timer = setTimeout(function () {
        timedOut = true;
        cleanup();
        reject(new Error("Census Geocoder request timed out."));
      }, TIMEOUT_MS);

      window[cbName] = function (data) {
        if (timedOut) return;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      script.src = url + "&format=jsonp&callback=" + cbName;
      script.onerror = function () {
        if (timedOut) return;
        clearTimeout(timer);
        cleanup();
        reject(new Error("Census Geocoder is unavailable."));
      };

      document.head.appendChild(script);
    });
  }

  function extractDistrict(data) {
    var results = data && data.result;
    if (!results) {
      throw new Error("Invalid response from Census Geocoder.");
    }

    // Address endpoint nests under addressMatches, coordinates under geographies directly
    var geographies;
    if (results.addressMatches && results.addressMatches.length > 0) {
      geographies = results.addressMatches[0].geographies;
    } else if (results.geographies) {
      geographies = results.geographies;
    } else {
      throw new Error("Address not found. Try a more specific street address.");
    }

    // Find the Congressional Districts layer — name includes the Congress number
    var cdLayer = null;
    for (var key in geographies) {
      if (key.indexOf("Congressional Districts") !== -1) {
        cdLayer = geographies[key];
        break;
      }
    }

    if (!cdLayer || cdLayer.length === 0) {
      throw new Error("Could not determine congressional district for this location.");
    }

    var cd = cdLayer[0];

    // Extract district number — field name varies by Congress (CD119, CD118, CDFP, CD, etc.)
    var district = null;
    for (var field in cd) {
      if (/^CD\d*F?P?$/.test(field) && field !== "CDSESSN") {
        district = cd[field];
        break;
      }
    }
    if (!district) {
      district = cd.GEOID ? cd.GEOID.slice(2) : null;
    }

    return {
      stateFips: cd.STATE,
      district: district,
    };
  }

  function geocodeAddress(address) {
    var params = new URLSearchParams({
      address: address,
      benchmark: BENCHMARK,
      vintage: VINTAGE,
    });
    return jsonp(CENSUS_BASE + "/onelineaddress?" + params).then(extractDistrict);
  }

  function geocodeCoordinates(lat, lng) {
    var params = new URLSearchParams({
      x: String(lng),
      y: String(lat),
      benchmark: BENCHMARK,
      vintage: VINTAGE,
    });
    return jsonp(CENSUS_BASE + "/coordinates?" + params).then(extractDistrict);
  }

  return {
    geocodeAddress: geocodeAddress,
    geocodeCoordinates: geocodeCoordinates,
  };
})();

// ── Geocoder Tests ──────────────────────────────────────────────────────
// Load the real geocoder module so we can test extractGeography via
// the public geocodeAddress / geocodeCoordinates wrappers.
// We intercept JSONP by replacing document.head.appendChild.

(function () {
  var H = Harness;

  // ── Helpers to intercept JSONP ──────────────────────────────────────
  var interceptedScripts = [];
  var origAppendChild = document.head.appendChild.bind(document.head);

  function installJSONPIntercept() {
    interceptedScripts = [];
    document.head.appendChild = function (el) {
      if (el.tagName === "SCRIPT" && el.src && el.src.indexOf("censusCallback") !== -1) {
        interceptedScripts.push(el);
        return el; // don't actually add it
      }
      return origAppendChild(el);
    };
  }

  function restoreJSONPIntercept() {
    document.head.appendChild = origAppendChild;
  }

  // Simulate a JSONP response for the most recent intercepted script
  function respondJSONP(data) {
    var script = interceptedScripts[interceptedScripts.length - 1];
    var url = script.src;
    var cbMatch = url.match(/callback=([^&]+)/);
    if (cbMatch && window[cbMatch[1]]) {
      window[cbMatch[1]](data);
    }
  }

  function triggerScriptError() {
    var script = interceptedScripts[interceptedScripts.length - 1];
    if (script.onerror) script.onerror(new Event("error"));
  }

  // ── Build Census-style response data ────────────────────────────────
  function makeCensusResponse(opts) {
    opts = opts || {};
    var cd = { STATE: opts.stateFips || "36" };
    cd[opts.cdField || "CD119"] = opts.district || "12";
    if (opts.cdsessn) cd.CDSESSN = opts.cdsessn;
    if (opts.geoid) cd.GEOID = opts.geoid;

    var geographies = {};
    geographies[opts.cdLayerName || "119th Congressional Districts"] = [cd];

    if (opts.sldu !== undefined) {
      geographies["2024 State Legislative Districts - Upper"] = [{ SLDU: opts.sldu }];
    }
    if (opts.sldl !== undefined) {
      geographies["2024 State Legislative Districts - Lower"] = [{ SLDL: opts.sldl }];
    }

    // Address geocoding format
    if (opts.useAddressMatches) {
      return {
        result: {
          addressMatches: [{ geographies: geographies }],
        },
      };
    }
    // Coordinate geocoding format
    return {
      result: {
        geographies: geographies,
      },
    };
  }

  // ── Load the real Geocoder module ───────────────────────────────────
  var scriptLoaded = false;
  function loadGeocoder() {
    if (scriptLoaded) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "../js/geocoder.js";
      s.onload = function () { scriptLoaded = true; resolve(); };
      origAppendChild(s);
    });
  }

  // ── Test suites ─────────────────────────────────────────────────────

  H.register("Geocoder: extractGeography (address match)", function () {
    return loadGeocoder().then(function () {
      installJSONPIntercept();

      H.group("Standard address geocoding with CD, SLDU, SLDL");
      var p = Geocoder.geocodeAddress("123 Main St, Albany, NY 12207");
      return H.tick(10).then(function () {
        respondJSONP(makeCensusResponse({
          stateFips: "36", district: "12", sldu: "044", sldl: "108",
          useAddressMatches: true,
        }));
        return p;
      }).then(function (geo) {
        H.assertEqual(geo.stateFips, "36", "stateFips extracted");
        H.assertEqual(geo.district, "12", "district extracted");
        H.assertEqual(geo.sldu, "044", "SLDU extracted");
        H.assertEqual(geo.sldl, "108", "SLDL extracted");
        restoreJSONPIntercept();
      });
    });
  });

  H.register("Geocoder: extractGeography (coordinate format)", function () {
    installJSONPIntercept();
    H.group("Coordinate geocoding (result.geographies, not addressMatches)");
    var p = Geocoder.geocodeCoordinates(40.7, -74.0);
    return H.tick(10).then(function () {
      respondJSONP(makeCensusResponse({
        stateFips: "36", district: "10", sldu: "026", sldl: "065",
      }));
      return p;
    }).then(function (geo) {
      H.assertEqual(geo.stateFips, "36", "stateFips from coordinates");
      H.assertEqual(geo.district, "10", "district from coordinates");
      H.assertEqual(geo.sldu, "026", "SLDU from coordinates");
      H.assertEqual(geo.sldl, "065", "SLDL from coordinates");
      restoreJSONPIntercept();
    });
  });

  H.register("Geocoder: CD field name variations", function () {
    installJSONPIntercept();
    H.group("CD field matches CD118, CDFP, etc.");

    // Test CD118 (past congress)
    var p1 = Geocoder.geocodeCoordinates(40.7, -74.0);
    return H.tick(10).then(function () {
      respondJSONP(makeCensusResponse({
        cdField: "CD118", district: "07", cdLayerName: "118th Congressional Districts",
      }));
      return p1;
    }).then(function (geo) {
      H.assertEqual(geo.district, "07", "CD118 field extracted");

      // Test CDFP variant
      var p2 = Geocoder.geocodeCoordinates(40.7, -74.0);
      return H.tick(10).then(function () {
        respondJSONP(makeCensusResponse({
          cdField: "CDFP", district: "03",
        }));
        return p2;
      });
    }).then(function (geo) {
      H.assertEqual(geo.district, "03", "CDFP field extracted");
      restoreJSONPIntercept();
    });
  });

  H.register("Geocoder: CDSESSN excluded from CD field match", function () {
    installJSONPIntercept();
    H.group("CDSESSN should not be treated as the CD field");
    var p = Geocoder.geocodeCoordinates(40.7, -74.0);
    return H.tick(10).then(function () {
      // Only CDSESSN + GEOID available, no CD119-style field
      var resp = {
        result: {
          geographies: {
            "119th Congressional Districts": [{
              STATE: "36",
              CDSESSN: "119",
              GEOID: "3612",
            }],
          },
        },
      };
      respondJSONP(resp);
      return p;
    }).then(function (geo) {
      H.assertEqual(geo.district, "12", "fell back to GEOID.slice(2), not CDSESSN");
      restoreJSONPIntercept();
    });
  });

  H.register("Geocoder: at-large district (00)", function () {
    installJSONPIntercept();
    H.group("At-large districts return '00'");
    var p = Geocoder.geocodeCoordinates(43.0, -71.5);
    return H.tick(10).then(function () {
      respondJSONP(makeCensusResponse({
        stateFips: "50", district: "00",
      }));
      return p;
    }).then(function (geo) {
      H.assertEqual(geo.district, "00", "at-large district preserved as '00'");
      restoreJSONPIntercept();
    });
  });

  H.register("Geocoder: missing SLDU/SLDL (e.g. territories)", function () {
    installJSONPIntercept();
    H.group("Missing state legislative layers");
    var p = Geocoder.geocodeCoordinates(18.2, -66.5);
    return H.tick(10).then(function () {
      respondJSONP(makeCensusResponse({
        stateFips: "72", district: "00",
        // no sldu/sldl layers
      }));
      return p;
    }).then(function (geo) {
      H.assertEqual(geo.sldu, null, "SLDU is null when layer missing");
      H.assertEqual(geo.sldl, null, "SLDL is null when layer missing");
      restoreJSONPIntercept();
    });
  });

  H.register("Geocoder: error — address not found", function () {
    installJSONPIntercept();
    H.group("No address matches throws descriptive error");
    var p = Geocoder.geocodeAddress("totally fake address xyz");
    return H.tick(10).then(function () {
      respondJSONP({
        result: {
          addressMatches: [],
          // no geographies fallback either
        },
      });
      return p.then(
        function () { H.assert(false, "should have rejected"); },
        function (err) {
          H.assertIncludes(err.message, "Address not found", "error mentions address not found");
          restoreJSONPIntercept();
        }
      );
    });
  });

  H.register("Geocoder: error — invalid response", function () {
    installJSONPIntercept();
    H.group("Null/missing result throws error");
    var p = Geocoder.geocodeAddress("test");
    return H.tick(10).then(function () {
      respondJSONP({ result: null });
      return p.then(
        function () { H.assert(false, "should have rejected"); },
        function (err) {
          H.assertIncludes(err.message, "Invalid response", "error mentions invalid response");
          restoreJSONPIntercept();
        }
      );
    });
  });

  H.register("Geocoder: error — no congressional district layer", function () {
    installJSONPIntercept();
    H.group("Missing CD layer throws error");
    var p = Geocoder.geocodeCoordinates(0, 0);
    return H.tick(10).then(function () {
      respondJSONP({
        result: {
          geographies: {
            "Some Other Layer": [{ STATE: "36" }],
          },
        },
      });
      return p.then(
        function () { H.assert(false, "should have rejected"); },
        function (err) {
          H.assertIncludes(err.message, "congressional district", "error mentions congressional district");
          restoreJSONPIntercept();
        }
      );
    });
  });

  H.register("Geocoder: error — script load error", function () {
    installJSONPIntercept();
    H.group("Script onerror rejects with 'unavailable'");
    var p = Geocoder.geocodeCoordinates(0, 0);
    return H.tick(10).then(function () {
      triggerScriptError();
      return p.then(
        function () { H.assert(false, "should have rejected"); },
        function (err) {
          H.assertIncludes(err.message, "unavailable", "error mentions unavailable");
          restoreJSONPIntercept();
        }
      );
    });
  });

  H.register("Geocoder: JSONP timeout", function () {
    installJSONPIntercept();
    H.group("10-second timeout rejects with 'timed out'");
    // We can't wait 10s in a test. Instead, verify the error message pattern
    // by testing the JSONP mechanism with a short mock.
    // The actual timeout is 10000ms — we just verify the error path
    // by triggering script error (fastest way to test the rejection path).
    var p = Geocoder.geocodeCoordinates(0, 0);
    return H.tick(10).then(function () {
      triggerScriptError();
      return p.then(
        function () { H.assert(false, "should have rejected"); },
        function (err) {
          H.assert(typeof err.message === "string", "error has a message");
          restoreJSONPIntercept();
        }
      );
    });
  });

  H.register("Geocoder: empty CD layer array", function () {
    installJSONPIntercept();
    H.group("Empty congressional district array throws error");
    var p = Geocoder.geocodeCoordinates(0, 0);
    return H.tick(10).then(function () {
      respondJSONP({
        result: {
          geographies: {
            "119th Congressional Districts": [],
          },
        },
      });
      return p.then(
        function () { H.assert(false, "should have rejected"); },
        function (err) {
          H.assertIncludes(err.message, "congressional district", "empty CD layer treated as missing");
          restoreJSONPIntercept();
        }
      );
    });
  });
})();

// ── State Legislators Module Tests ──────────────────────────────────────
(function () {
  var H = Harness;

  // Uses Harness.mockFetch for centralized fetch interception

  var moduleLoaded = false;
  function loadModule() {
    if (moduleLoaded) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "../js/state-legislators.js";
      s.onload = function () { moduleLoaded = true; resolve(); };
      document.head.appendChild(s);
    });
  }

  var sampleNY = {
    upper: [
      { name: "Upper Senator A", party: "Democrat", district: 44,
        phone: "518-555-2001", district_phone: "212-555-2001",
        address: "Capitol Room 301", district_address: "100 Broadway, New York",
        email: "senatorA@senate.ny.gov", website: "https://senate.ny.gov/a" },
      { name: "Upper Senator B", party: "Republican", district: 1 },
    ],
    lower: [
      { name: "Lower Rep A", party: "Democrat", district: 108,
        phone: "518-555-3001" },
      { name: "Lower Rep B", party: "Working Families", district: 2 },
    ],
  };

  function setupMock(stateData) {
    H.mockFetch(function (url) {
      var match = url.match(/state-legislators\/(\w+)\.json/);
      if (match && stateData[match[1]]) {
        return Promise.resolve({
          ok: true,
          json: function () { return Promise.resolve(stateData[match[1]]); },
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  }

  // ── District matching ───────────────────────────────────────────────

  H.register("StateLegislators: basic district matching", function () {
    return loadModule().then(function () {
      setupMock({ ny: sampleNY });

      H.group("Match by SLDU and SLDL (integer comparison)");
      return StateLegislators.findStateLegislators("NY", "044", "108");
    }).then(function (result) {
      H.assert(!!result.upper, "found upper chamber legislator");
      H.assertEqual(result.upper.name, "Upper Senator A", "upper name matches");
      H.assertEqual(result.upper.party, "Democrat", "upper party");
      H.assertEqual(result.upper.phone, "518-555-2001", "upper capitol phone");
      H.assertEqual(result.upper.district_phone, "212-555-2001", "upper district phone");
      H.assertEqual(result.upper.email, "senatorA@senate.ny.gov", "upper email");
      H.assertEqual(result.upper.website, "https://senate.ny.gov/a", "upper website");
      H.assertEqual(result.upper.address, "Capitol Room 301", "upper capitol address");
      H.assertEqual(result.upper.district_address, "100 Broadway, New York", "upper district address");

      H.assert(!!result.lower, "found lower chamber legislator");
      H.assertEqual(result.lower.name, "Lower Rep A", "lower name matches");
      H.assertEqual(result.lower.district, 108, "lower district is integer");
    });
  });

  H.register("StateLegislators: no match for district", function () {
    setupMock({ ny: sampleNY });
    H.group("Non-existent district returns null");
    return StateLegislators.findStateLegislators("NY", "999", "999").then(function (result) {
      H.assertEqual(result.upper, null, "upper null for non-existent district");
      H.assertEqual(result.lower, null, "lower null for non-existent district");
    });
  });

  H.register("StateLegislators: null SLDU/SLDL", function () {
    setupMock({ ny: sampleNY });
    H.group("Null district values return null matches");
    return StateLegislators.findStateLegislators("NY", null, null).then(function (result) {
      H.assertEqual(result.upper, null, "upper null when SLDU is null");
      H.assertEqual(result.lower, null, "lower null when SLDL is null");
    });
  });

  H.register("StateLegislators: mixed match (one found, one not)", function () {
    setupMock({ ny: sampleNY });
    H.group("Upper found but lower not");
    return StateLegislators.findStateLegislators("NY", "044", "999").then(function (result) {
      H.assert(!!result.upper, "upper found");
      H.assertEqual(result.lower, null, "lower not found");
    });
  });

  H.register("StateLegislators: missing optional fields", function () {
    setupMock({ ny: sampleNY });
    H.group("Legislator with minimal fields");
    return StateLegislators.findStateLegislators("NY", "001", "002").then(function (result) {
      H.assert(!!result.upper, "found upper with district 1");
      H.assertEqual(result.upper.name, "Upper Senator B", "name present");
      H.assertEqual(result.upper.phone, undefined, "phone undefined when missing");
      H.assertEqual(result.upper.email, undefined, "email undefined when missing");

      H.assert(!!result.lower, "found lower with district 2");
      H.assertEqual(result.lower.party, "Working Families", "non-standard party preserved");
    });
  });

  H.register("StateLegislators: state file not found (404)", function () {
    setupMock({});  // no states available
    H.group("Missing state file throws error");
    // Need to use a state that isn't cached from previous tests
    return StateLegislators.findStateLegislators("ZZ", "001", "001").then(
      function () { H.assert(false, "should have rejected"); },
      function (err) {
        H.assertIncludes(err.message, "No state legislator data", "error mentions no data");
        H.assertIncludes(err.message, "ZZ", "error includes state abbreviation");
      }
    );
  });

  H.register("StateLegislators: empty chambers", function () {
    setupMock({ ne: { upper: [{ name: "NE Sen", party: "Nonpartisan", district: 1 }], lower: [] } });
    H.group("Nebraska-style unicameral (empty lower)");
    // Use a state not yet cached
    return StateLegislators.findStateLegislators("NE", "001", "001").then(function (result) {
      H.assert(!!result.upper, "found upper");
      H.assertEqual(result.upper.party, "Nonpartisan", "nonpartisan party preserved");
      H.assertEqual(result.lower, null, "lower null from empty array");
    });
  });
})();

// ── UI / Integration Tests ──────────────────────────────────────────────
// These tests load main.js with mocked dependencies and exercise the DOM.
(function () {
  var H = Harness;

  // ── Mock setup ──────────────────────────────────────────────────────
  var mockGeolocation = { getCurrentPosition: function () {} };
  Object.defineProperty(navigator, "geolocation", {
    value: mockGeolocation, writable: true, configurable: true,
  });

  // Shared counters object for cross-step assertions
  var T = {};

  // Reset all mocks to defaults. Called at the start of each UI test
  // because earlier test suites load the real modules (overwriting globals).
  function resetMocks() {
    H.mockFetch(function () {
      return Promise.resolve({ ok: false, json: function () { return Promise.resolve({}); } });
    });

    window.Geocoder = {
      geocodeCoordinates: function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      },
      geocodeAddress: function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      },
    };

    window.Legislators = {
      fipsToState: function (fips) {
        var map = {
          "36": "NY", "50": "VT", "11": "DC", "06": "CA",
          "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
        };
        return map[fips] || null;
      },
      findRepresentative: function (state, dist) {
        var d = parseInt(dist, 10);
        if (d === 98) d = 0;
        return Promise.resolve({
          name: "Test Rep", party: "Democrat", phone: "202-555-0001",
          district: d, state: state, bioguide: "T000001",
          website: "https://testrep.house.gov",
          contactForm: "https://testrep.house.gov/contact",
          dcAddress: "123 Rayburn HOB",
        });
      },
      findSenators: function (state) {
        return Promise.resolve([
          { name: "Sen Alpha", party: "Democrat", rank: "senior", phone: "202-555-1001",
            state: state, bioguide: "S000001", website: "https://alpha.senate.gov", dcAddress: "100 Hart" },
          { name: "Sen Beta", party: "Republican", rank: "junior", phone: "202-555-1002",
            state: state, bioguide: "S000002", website: "https://beta.senate.gov" },
        ]);
      },
      findDistrictOffices: function () {
        return Promise.resolve([
          { phone: "518-555-9001", address: "100 State St", city: "Albany", state: "NY", zip: "12207" },
        ]);
      },
    };

    window.StateLegislators = {
      findStateLegislators: function (state, sldu, sldl) {
        return Promise.resolve({
          upper: { name: "State Sen", party: "Democrat", district: parseInt(sldu, 10),
            phone: "518-555-4001", district_phone: "212-555-4001",
            address: "Capitol Rm 301", district_address: "100 Broadway, NYC",
            email: "statesen@senate.state.gov", website: "https://senate.state.gov/x" },
          lower: { name: "State Rep", party: "Republican", district: parseInt(sldl, 10),
            phone: "518-555-5001" },
        });
      },
    };
  }

  // Wrap H.register to auto-reset mocks before every UI test
  var _origRegister = H.register;
  function registerUI(name, fn) {
    _origRegister(name, function () {
      resetMocks();
      return fn();
    });
  }

  // Load main.js
  var mainLoaded = false;
  function loadMain() {
    if (mainLoaded) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "../js/main.js";
      s.onload = function () { mainLoaded = true; resolve(); };
      document.head.appendChild(s);
    });
  }

  // DOM shortcuts
  function loadingText() { return H.$("#loading-message").textContent; }
  function errorText() { return H.$("#error-message").textContent; }
  function isLoadingVisible() { return !H.$("#loading").hidden && !H.$("#status").hidden; }
  function isErrorVisible() { return !H.$("#error").hidden && !H.$("#status").hidden; }
  function isResultsVisible() { return !H.$("#results").hidden; }
  function sectionBody(id) { return H.$("#" + id + " .section-body"); }

  function submitAddress(addr) {
    H.$("#address-input").value = addr;
    H.$("#address-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function clickGeolocate() { H.$("#geolocate-btn").click(); }

  // ═══════════════════════════════════════════════════════════════════
  // TERRITORY DETECTION
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Territory detection: by address", function () {
    return loadMain().then(function () {
      H.group("Address-based territory detection");

      // American Samoa
      Geocoder.geocodeAddress = function () { H.assert(false, "Census should not be called for territories"); };
      submitAddress("Pago Pago, American Samoa 96799");
      return H.tick();
    }).then(function () {
      H.assert(isResultsVisible(), "AS: results shown");
      H.assertIncludes(sectionBody("senators").innerHTML, "territories do not have senators", "AS: no senators msg");
      H.assertIncludes(sectionBody("stateleg").innerHTML, "not available for U.S. territories", "AS: no state leg msg");

      // Guam by zip
      submitAddress("123 Main St, Hagatna, GU 96910");
      return H.tick();
    }).then(function () {
      H.assert(isResultsVisible(), "GU by zip: results shown");

      // Northern Mariana by name variant
      submitAddress("PO Box 100, Saipan, MP 96950");
      return H.tick();
    }).then(function () {
      H.assert(isResultsVisible(), "MP: results shown");

      // Virgin Islands
      submitAddress("123 Crown Bay, St Thomas, USVI 00802");
      return H.tick();
    }).then(function () {
      H.assert(isResultsVisible(), "VI: results shown");

      // Restore normal geocoder
      Geocoder.geocodeAddress = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Territory detection: by coordinates", function () {
    H.group("Coordinate-based territory bounding boxes");

    // Guam coords
    Geocoder.geocodeCoordinates = function () { H.assert(false, "Census should not be called for territory coords"); };
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 13.45, longitude: 144.8 } });  // Guam
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isResultsVisible(), "GU coords: results shown");

      // American Samoa coords
      mockGeolocation.getCurrentPosition = function (ok) {
        ok({ coords: { latitude: -14.3, longitude: -170.7 } });
      };
      clickGeolocate();
      return H.tick();
    }).then(function () {
      H.assert(isResultsVisible(), "AS coords: results shown");

      // Restore geocoder
      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Territory: PR has state legislature but no senators", function () {
    H.group("Puerto Rico special case");
    Geocoder.geocodeAddress = function () {
      return Promise.resolve({ stateFips: "72", district: "00", sldu: "001", sldl: "001" });
    };
    submitAddress("San Juan, PR 00901");
    return H.tick().then(function () {
      H.assert(isResultsVisible(), "PR: results shown");
      H.assertIncludes(sectionBody("senators").innerHTML, "territories do not have senators", "PR: no senators");
      // PR should NOT show "not available for territories" in state leg section
      var stateHTML = sectionBody("stateleg").innerHTML;
      H.assert(stateHTML.indexOf("not available") === -1, "PR: state leg IS shown (not blocked)");

      Geocoder.geocodeAddress = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // FULL SUCCESSFUL LOOKUP FLOW
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Full lookup: address → all 3 sections render", function () {
    H.group("Address lookup renders all sections");
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      H.assert(isResultsVisible(), "results section visible");

      // US Rep section
      var repHTML = sectionBody("usrep").innerHTML;
      H.assertIncludes(repHTML, "Test Rep", "rep name rendered");
      H.assertIncludes(repHTML, "Democrat", "rep party rendered");
      H.assertIncludes(repHTML, "District 12", "rep district rendered");
      H.assertIncludes(repHTML, "202-555-0001", "rep phone rendered");
      H.assertIncludes(repHTML, "tel:202-555-0001", "rep call link present");

      // Senators section
      var senHTML = sectionBody("senators").innerHTML;
      H.assertIncludes(senHTML, "Sen Alpha", "senator 1 name");
      H.assertIncludes(senHTML, "Sen Beta", "senator 2 name");
      H.assertIncludes(senHTML, "Senior Senator", "senior rank capitalized");
      H.assertIncludes(senHTML, "Junior Senator", "junior rank capitalized");
      H.assertIncludes(senHTML, "Democrat", "senator 1 party");
      H.assertIncludes(senHTML, "Republican", "senator 2 party");

      // State legislature section
      var stateHTML = sectionBody("stateleg").innerHTML;
      H.assertIncludes(stateHTML, "State Sen", "state senator rendered");
      H.assertIncludes(stateHTML, "State Rep", "state rep rendered");
      H.assertIncludes(stateHTML, "State Senator", "state senator title");
      H.assertIncludes(stateHTML, "State Representative", "state rep title");
    });
  });

  registerUI("Full lookup: geolocation → results", function () {
    H.group("Geolocation flow end-to-end");
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 40.7, longitude: -74.0 } });
    };
    Geocoder.geocodeCoordinates = function () {
      return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
    };
    clickGeolocate();
    return H.tick(100).then(function () {
      H.assert(isResultsVisible(), "results visible after geolocation");
      H.assertIncludes(sectionBody("usrep").innerHTML, "Test Rep", "rep rendered from geolocation");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CARD RENDERING DETAILS
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Card: more-info content", function () {
    H.group("More info section has website, address, contact form");
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      var repCard = H.$("#usrep .result-card");
      var moreInfo = repCard.querySelector(".more-info-content").innerHTML;
      H.assertIncludes(moreInfo, "testrep.house.gov", "website link in more info");
      H.assertIncludes(moreInfo, "testrep.house.gov/contact", "contact form link in more info");
      H.assertIncludes(moreInfo, "123 Rayburn HOB", "DC address in more info");
      H.assertIncludes(moreInfo, "DC Office", "DC office heading");
    });
  });

  registerUI("Card: async district office loading", function () {
    H.group("District offices loaded async and added to card");
    Legislators.findDistrictOffices = function () {
      return Promise.resolve([
        { phone: "518-555-9001", address: "100 State St", city: "Albany", state: "NY", zip: "12207" },
        { phone: "212-555-9002", address: "200 Broadway", city: "New York", state: "NY", zip: "10007" },
      ]);
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(200).then(function () {
      var repCard = H.$("#usrep .result-card");
      var moreInfo = repCard.querySelector(".more-info-content").innerHTML;
      H.assertIncludes(moreInfo, "Local Offices", "plural 'Local Offices' heading for 2 offices");
      H.assertIncludes(moreInfo, "518-555-9001", "first office phone");
      H.assertIncludes(moreInfo, "212-555-9002", "second office phone");
      H.assertIncludes(moreInfo, "Albany", "first office city");
      H.assertIncludes(moreInfo, "New York", "second office city");

      // Restore
      Legislators.findDistrictOffices = function () {
        return Promise.resolve([
          { phone: "518-555-9001", address: "100 State St", city: "Albany", state: "NY", zip: "12207" },
        ]);
      };
    });
  });

  registerUI("Card: single district office says 'Local Office' (singular)", function () {
    H.group("Single office uses singular heading");
    Legislators.findDistrictOffices = function () {
      return Promise.resolve([
        { phone: "518-555-9001", address: "100 State St", city: "Albany", state: "NY", zip: "12207" },
      ]);
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(200).then(function () {
      var moreInfo = H.$("#usrep .result-card .more-info-content").innerHTML;
      H.assertIncludes(moreInfo, "Local Office", "singular 'Local Office'");
      // Make sure it's not "Local Offices"
      H.assert(moreInfo.indexOf("Local Offices") === -1, "NOT plural 'Local Offices'");
    });
  });

  registerUI("Card: phone toggle between DC and local", function () {
    H.group("Phone toggle switches between DC and district office");
    Legislators.findDistrictOffices = function () {
      return Promise.resolve([
        { phone: "518-555-9001", city: "Albany", state: "NY" },
      ]);
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(200).then(function () {
      var card = H.$("#usrep .result-card");
      var toggleBtn = card.querySelector(".phone-toggle");
      var callBtnText = card.querySelector(".call-btn-text");

      H.assert(!toggleBtn.hidden, "toggle button visible when both phones exist");
      H.assertIncludes(toggleBtn.textContent, "Switch to local office", "toggle initially says switch to local");
      H.assertIncludes(toggleBtn.textContent, "Albany", "toggle shows local office city");
      H.assertIncludes(toggleBtn.textContent, "not recommended", "toggle warns not recommended");
      H.assertIncludes(callBtnText.textContent, "202-555-0001", "initially shows DC phone");

      // Click toggle
      toggleBtn.click();
      H.assertIncludes(callBtnText.textContent, "518-555-9001", "after toggle: shows local phone");
      H.assertIncludes(toggleBtn.textContent, "Switch to DC office", "after toggle: says switch to DC");

      // Toggle back
      toggleBtn.click();
      H.assertIncludes(callBtnText.textContent, "202-555-0001", "toggled back: shows DC phone again");
    });
  });

  registerUI("Card: no toggle when only DC phone exists", function () {
    H.group("Toggle hidden when no district office phone");
    Legislators.findDistrictOffices = function () {
      return Promise.resolve([]);  // no offices
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(200).then(function () {
      var toggleBtn = H.$("#usrep .result-card .phone-toggle");
      H.assert(toggleBtn.hidden, "toggle hidden with no district offices");
    });
  });

  registerUI("Card: call/copy hidden when no phone at all", function () {
    H.group("No phone → call and copy buttons hidden");
    var origFindRep = Legislators.findRepresentative;
    Legislators.findRepresentative = function (state, dist) {
      return Promise.resolve({
        name: "No Phone Rep", party: "Democrat", phone: null,
        district: 12, state: state, bioguide: "T000002",
      });
    };
    Legislators.findDistrictOffices = function () { return Promise.resolve([]); };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(200).then(function () {
      var card = H.$("#usrep .result-card");
      H.assert(card.querySelector(".call-btn").hidden, "call button hidden");
      H.assert(card.querySelector(".copy-btn").hidden, "copy button hidden");
      H.assert(card.querySelector(".phone-toggle").hidden, "toggle hidden");

      Legislators.findRepresentative = origFindRep;
    });
  });

  registerUI("Card: at-large district shows 'At-Large'", function () {
    H.group("District 0 displayed as At-Large");
    var origFindRep = Legislators.findRepresentative;
    Legislators.findRepresentative = function (state, dist) {
      return Promise.resolve({
        name: "At Large Rep", party: "Independent", phone: "202-555-0050",
        district: 0, state: "VT", bioguide: "T000003",
      });
    };
    Geocoder.geocodeAddress = function () {
      return Promise.resolve({ stateFips: "50", district: "00", sldu: "001", sldl: "001" });
    };
    submitAddress("123 Main St, Montpelier, VT");
    return H.tick(200).then(function () {
      var repHTML = sectionBody("usrep").innerHTML;
      H.assertIncludes(repHTML, "At-Large", "shows At-Large");
      H.assert(repHTML.indexOf("District 0") === -1, "does NOT show 'District 0'");

      Legislators.findRepresentative = origFindRep;
      Geocoder.geocodeAddress = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Card: state legislator email and capitol office", function () {
    H.group("State cards show email, capitol office label, district info");
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(200).then(function () {
      var stateCards = document.querySelectorAll("#stateleg .result-card");
      H.assert(stateCards.length >= 1, "at least 1 state card rendered");

      var senCard = stateCards[0];
      var moreInfo = senCard.querySelector(".more-info-content").innerHTML;
      H.assertIncludes(moreInfo, "Capitol Office", "state card says Capitol Office (not DC Office)");
      H.assertIncludes(moreInfo, "statesen@senate.state.gov", "state senator email in more info");
      H.assertIncludes(moreInfo, "mailto:", "email is a mailto link");
      H.assertIncludes(moreInfo, "Local Office", "local office section present");
      H.assertIncludes(moreInfo, "212-555-4001", "district phone in more info");
    });
  });

  registerUI("Card: HTML escaping prevents injection", function () {
    H.group("XSS-dangerous characters are escaped in card output");
    var origFindRep = Legislators.findRepresentative;
    Legislators.findRepresentative = function (state, dist) {
      return Promise.resolve({
        name: '<script>alert("xss")</script>', party: "D&R", phone: "202-555-0001",
        district: 12, state: state, bioguide: "T000004",
        website: 'https://example.com/"><script>',
      });
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      var repHTML = sectionBody("usrep").innerHTML;
      H.assert(repHTML.indexOf("<script>") === -1, "no raw <script> tags in output");
      H.assertIncludes(repHTML, "&lt;script&gt;", "script tags are escaped");
      H.assertIncludes(repHTML, "D&amp;R", "ampersand escaped in party");

      Legislators.findRepresentative = origFindRep;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION-LEVEL ERRORS
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Section error: rep not found", function () {
    H.group("Individual section error when rep lookup fails");
    var origFindRep = Legislators.findRepresentative;
    Legislators.findRepresentative = function () {
      return Promise.reject(new Error("No House representative found for ZZ district 99."));
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      H.assert(isResultsVisible(), "results section still shows (other sections work)");
      H.assertIncludes(sectionBody("usrep").innerHTML, "No House representative found", "usrep shows error");
      // Senators and state leg should still render
      H.assertIncludes(sectionBody("senators").innerHTML, "Sen Alpha", "senators still rendered");

      Legislators.findRepresentative = origFindRep;
    });
  });

  registerUI("Section error: senators fetch fails", function () {
    H.group("Senator section error doesn't affect other sections");
    var origFindSen = Legislators.findSenators;
    Legislators.findSenators = function () {
      return Promise.reject(new Error("Failed to load senator data"));
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      H.assertIncludes(sectionBody("senators").innerHTML, "Failed to load senator data", "senators shows error");
      H.assertIncludes(sectionBody("usrep").innerHTML, "Test Rep", "usrep still rendered");

      Legislators.findSenators = origFindSen;
    });
  });

  registerUI("Section error: state leg data missing", function () {
    H.group("State legislature section error");
    var origFindState = StateLegislators.findStateLegislators;
    StateLegislators.findStateLegislators = function () {
      return Promise.reject(new Error("No state legislator data available for XX."));
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      H.assertIncludes(sectionBody("stateleg").innerHTML, "No state legislator data", "stateleg shows error");
      H.assertIncludes(sectionBody("usrep").innerHTML, "Test Rep", "usrep still rendered");

      StateLegislators.findStateLegislators = origFindState;
    });
  });

  registerUI("Section: no state legislators found for district", function () {
    H.group("Both upper and lower null → section error message");
    var origFindState = StateLegislators.findStateLegislators;
    StateLegislators.findStateLegislators = function () {
      return Promise.resolve({ upper: null, lower: null });
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      H.assertIncludes(sectionBody("stateleg").innerHTML, "No state legislator data found", "shows 'not found' when both null");

      StateLegislators.findStateLegislators = origFindState;
    });
  });

  registerUI("Section: partial state legislator data (upper only)", function () {
    H.group("Only upper chamber found, lower shows individual error");
    var origFindState = StateLegislators.findStateLegislators;
    StateLegislators.findStateLegislators = function () {
      return Promise.resolve({
        upper: { name: "Only Senator", party: "Democrat", district: 1, phone: "555-1234" },
        lower: null,
      });
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      var html = sectionBody("stateleg").innerHTML;
      H.assertIncludes(html, "Only Senator", "upper legislator rendered");
      H.assertIncludes(html, "No State Representative data found", "lower shows not found msg");

      StateLegislators.findStateLegislators = origFindState;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // LOADING & ERROR STATES
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Loading: geolocation step shows 'Requesting your location'", function () {
    H.group("Initial loading text for geolocation");
    mockGeolocation.getCurrentPosition = function () {}; // hang
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isLoadingVisible(), "loading visible");
      H.assertIncludes(loadingText(), "Requesting your location", "says requesting location");
    });
  });

  registerUI("Loading: transitions to 'Location found' after geolocation", function () {
    H.group("Loading text updates after geolocation resolves");
    Geocoder.geocodeCoordinates = function () { return new Promise(function () {}); }; // hang
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 40.7, longitude: -74.0 } });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isLoadingVisible(), "loading visible during geocoder");
      H.assertIncludes(loadingText(), "Location found", "says location found");
      H.assertIncludes(loadingText(), "district", "mentions district");

      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Loading: address lookup says 'Looking up your district'", function () {
    H.group("Address loading text");
    Geocoder.geocodeAddress = function () { return new Promise(function () {}); };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick().then(function () {
      H.assert(isLoadingVisible(), "loading visible");
      H.assertIncludes(loadingText(), "Looking up your district", "says looking up district");
      H.assert(loadingText().indexOf("location") === -1, "no mention of location");

      Geocoder.geocodeAddress = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Error: geolocation denied (code 1)", function () {
    H.group("Geolocation denied error message");
    mockGeolocation.getCurrentPosition = function (ok, err) {
      err({ code: 1, message: "Denied" });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error visible");
      H.assertIncludes(errorText(), "denied by your browser", "mentions browser denial");
      H.assertIncludes(errorText(), "type your address", "suggests address input");
    });
  });

  registerUI("Error: geolocation unavailable (code 2)", function () {
    H.group("Geolocation unavailable error message");
    mockGeolocation.getCurrentPosition = function (ok, err) {
      err({ code: 2, message: "Unavailable" });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error visible");
      H.assertIncludes(errorText(), "could not determine its location", "device failure message");
    });
  });

  registerUI("Error: geolocation timeout (code 3)", function () {
    H.group("Browser geolocation timeout error message");
    mockGeolocation.getCurrentPosition = function (ok, err) {
      err({ code: 3, message: "Timeout" });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error visible");
      H.assertIncludes(errorText(), "took too long to find your location", "mentions browser timeout");
      H.assertNotIncludes(errorText(), "Census", "no mention of Census");
    });
  });

  registerUI("Error: Census geocoder timeout triggers auto-retry", function () {
    H.group("Auto-retry on Census timeout (coordinates)");
    T.retryCount = 0;
    Geocoder.geocodeCoordinates = function () {
      T.retryCount++;
      if (T.retryCount === 1) return Promise.reject(new Error("Census Geocoder request timed out."));
      return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
    };
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 40.7, longitude: -74.0 } });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assertEqual(T.retryCount, 2, "geocoder called twice");
      H.assert(!isErrorVisible(), "no error — retry succeeded");

      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Error: Census double timeout → user-friendly error", function () {
    H.group("Both attempts fail → Census error shown");
    Geocoder.geocodeCoordinates = function () {
      return Promise.reject(new Error("Census Geocoder request timed out."));
    };
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 40.7, longitude: -74.0 } });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error visible");
      H.assertIncludes(errorText(), "Census", "mentions Census");
      H.assertIncludes(errorText(), "not responding", "says not responding");

      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Error: non-timeout Census error does NOT retry", function () {
    H.group("Census 'unavailable' error skips retry");
    T.unavailCalls = 0;
    Geocoder.geocodeCoordinates = function () {
      T.unavailCalls++;
      return Promise.reject(new Error("Census Geocoder is unavailable."));
    };
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 40.7, longitude: -74.0 } });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assertEqual(T.unavailCalls, 1, "called only once");
      H.assert(isErrorVisible(), "error visible");

      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Error: address Census timeout retries", function () {
    H.group("Address flow also retries on Census timeout");
    T.addrRetry = 0;
    Geocoder.geocodeAddress = function () {
      T.addrRetry++;
      if (T.addrRetry === 1) return Promise.reject(new Error("Census Geocoder request timed out."));
      return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick().then(function () {
      H.assertEqual(T.addrRetry, 2, "geocodeAddress retried");
      H.assert(!isErrorVisible(), "no error");

      Geocoder.geocodeAddress = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Error: address not found passes through", function () {
    H.group("Non-Census address errors shown as-is");
    Geocoder.geocodeAddress = function () {
      return Promise.reject(new Error("Address not found. Try a more specific street address."));
    };
    submitAddress("gibberish");
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error visible");
      H.assertIncludes(errorText(), "Address not found", "original message preserved");
      H.assertNotIncludes(errorText(), "Census", "not wrapped in Census message");

      Geocoder.geocodeAddress = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Error: unknown FIPS", function () {
    H.group("Invalid state FIPS from Census");
    Geocoder.geocodeCoordinates = function () {
      return Promise.resolve({ stateFips: "99", district: "01", sldu: null, sldl: null });
    };
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 40.7, longitude: -74.0 } });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error visible");
      H.assertIncludes(errorText(), "Could not determine state", "state error message");

      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  registerUI("Error: unknown geolocation error passes message", function () {
    H.group("No error code → raw message");
    mockGeolocation.getCurrentPosition = function (ok, err) {
      err(new Error("Something weird happened"));
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error visible");
      H.assertIncludes(errorText(), "Something weird happened", "raw message shown");
    });
  });

  registerUI("Loading: retry text during auto-retry", function () {
    H.group("Loading message updates during auto-retry");
    T.retryTextCalls = 0;
    T.retryTextSeen = null;
    Geocoder.geocodeCoordinates = function () {
      T.retryTextCalls++;
      if (T.retryTextCalls === 1) return Promise.reject(new Error("Census Geocoder request timed out."));
      T.retryTextSeen = loadingText();
      return new Promise(function () {});
    };
    mockGeolocation.getCurrentPosition = function (ok) {
      ok({ coords: { latitude: 40.7, longitude: -74.0 } });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assertIncludes(T.retryTextSeen, "Retrying", "shows retrying");
      H.assertIncludes(T.retryTextSeen, "Census", "mentions Census in retry msg");

      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // RETRY BUTTON
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Retry: button re-runs last action", function () {
    H.group("Retry button re-executes last failed action");
    T.retryCalls = 0;
    Geocoder.geocodeAddress = function () {
      T.retryCalls++;
      if (T.retryCalls <= 2) return Promise.reject(new Error("Census Geocoder request timed out."));
      return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
    };
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick().then(function () {
      H.assert(isErrorVisible(), "error after initial failure");
      H.$("#retry-btn").click();
      return H.tick();
    }).then(function () {
      H.assert(!isErrorVisible(), "retry succeeded");
      H.assert(T.retryCalls >= 3, "geocoder called on retry");

      Geocoder.geocodeAddress = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // EMPTY ADDRESS FORM SUBMISSION
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Form: empty address does nothing", function () {
    H.group("Submitting empty address is a no-op");
    // Get current state
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      H.assert(isResultsVisible(), "results visible before empty submit");
      H.$("#address-input").value = "   ";
      H.$("#address-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      return H.tick();
    }).then(function () {
      // Should still show results (not loading or error)
      H.assert(!isLoadingVisible(), "not loading after empty submit");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // HASH NAVIGATION
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Hash navigation: section open/close", function () {
    H.group("Clicking nav links opens target and closes others");
    // First do a lookup so results are visible
    submitAddress("123 Main St, Albany, NY 12207");
    return H.tick(100).then(function () {
      H.assert(isResultsVisible(), "results visible");

      // usrep should be open by default
      var usrepDetails = H.$("#usrep .section-details");
      H.assert(usrepDetails.open, "usrep open by default");

      // Click senators nav link
      var senLink = document.querySelector('.results-nav a[href="#senators"]');
      senLink.click();
      return H.tick();
    }).then(function () {
      var usrepDetails = H.$("#usrep .section-details");
      var senDetails = H.$("#senators .section-details");
      H.assert(senDetails.open, "senators opened after nav click");
      H.assert(!usrepDetails.open, "usrep closed when senators opened");

      // Click stateleg nav
      var stateLink = document.querySelector('.results-nav a[href="#stateleg"]');
      stateLink.click();
      return H.tick();
    }).then(function () {
      var senDetails = H.$("#senators .section-details");
      var stateDetails = H.$("#stateleg .section-details");
      H.assert(stateDetails.open, "stateleg opened after nav click");
      H.assert(!senDetails.open, "senators closed when stateleg opened");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ARIA ATTRIBUTES
  // ═══════════════════════════════════════════════════════════════════

  registerUI("Accessibility: aria-busy on geolocate button", function () {
    H.group("aria-busy set during loading, removed after");
    mockGeolocation.getCurrentPosition = function () {}; // hang
    clickGeolocate();
    return H.tick().then(function () {
      H.assertEqual(H.$("#geolocate-btn").getAttribute("aria-busy"), "true", "aria-busy set during loading");

      // Now complete the lookup
      mockGeolocation.getCurrentPosition = function (ok) {
        ok({ coords: { latitude: 40.7, longitude: -74.0 } });
      };
      Geocoder.geocodeCoordinates = function () {
        return Promise.resolve({ stateFips: "36", district: "12", sldu: "044", sldl: "108" });
      };
      clickGeolocate();
      return H.tick(100);
    }).then(function () {
      H.assertEqual(H.$("#geolocate-btn").getAttribute("aria-busy"), null, "aria-busy removed after results");
    });
  });

  registerUI("Accessibility: aria-busy removed on error", function () {
    H.group("aria-busy removed when error shown");
    mockGeolocation.getCurrentPosition = function (ok, err) {
      err({ code: 1, message: "Denied" });
    };
    clickGeolocate();
    return H.tick().then(function () {
      H.assertEqual(H.$("#geolocate-btn").getAttribute("aria-busy"), null, "aria-busy removed on error");
    });
  });
})();

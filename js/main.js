(function () {
  var $ = function (sel) { return document.querySelector(sel); };

  var geolocateBtn = $("#geolocate-btn");
  var addressForm = $("#address-form");
  var addressInput = $("#address-input");
  var statusSection = $("#status");
  var loadingEl = $("#loading");
  var errorEl = $("#error");
  var errorMsg = $("#error-message");
  var retryBtn = $("#retry-btn");
  var resultsSection = $("#results");

  var lastAction = null;
  var cardSeq = 0;

  // Territories have non-voting delegates (district 0) and no US senators.
  // PR is excluded from NO_STATE_LEG because OpenStates has its legislature data.
  var TERRITORY_STATES = { AS: 1, GU: 1, MP: 1, PR: 1, VI: 1 };
  var NO_STATE_LEG = { AS: 1, GU: 1, MP: 1, VI: 1 };

  // PR geocodes fine through Census (returns real SLDU/SLDL), so exclude it here.
  function detectTerritoryFips(address) {
    var a = address.toLowerCase();
    if (/\bamerican samoa\b/.test(a) || /\b96799\b/.test(a)) return '60';
    if (/\bguam\b/.test(a) || /\b969[0-4]\d\b/.test(a)) return '66';
    if (/\bnorthern mariana\b|\bcnmi\b|\bsaipan\b/.test(a) || /\b969(50|51|52)\b/.test(a)) return '69';
    if (/\bvirgin islands?\b|\busvi\b/.test(a) || /\b008\d\d\b/.test(a)) return '78';
    return null;
  }

  function detectTerritoryFipsByCoords(lat, lon) {
    if (lat >= -14.6 && lat <= -11.0 && lon >= -173.0 && lon <= -168.1) return '60'; // AS
    if (lat >= 13.2 && lat <= 13.7 && lon >= 144.6 && lon <= 145.1) return '66';    // GU
    if (lat >= 14.0 && lat <= 20.6 && lon >= 144.9 && lon <= 146.2) return '69';    // MP
    if (lat >= 17.6 && lat <= 18.4 && lon >= -65.1 && lon <= -64.5) return '78';    // VI
    return null;
  }

  // ── Loading / error states ────────────────────────────────────────────────

  function showLoading() {
    statusSection.hidden = false;
    loadingEl.hidden = false;
    errorEl.hidden = true;
    resultsSection.hidden = true;
    geolocateBtn.setAttribute("aria-busy", "true");
  }

  function showError(msg) {
    statusSection.hidden = false;
    loadingEl.hidden = true;
    errorEl.hidden = false;
    errorMsg.textContent = msg;
    resultsSection.hidden = true;
    geolocateBtn.removeAttribute("aria-busy");
  }

  function showResults() {
    statusSection.hidden = true;
    resultsSection.hidden = false;
    geolocateBtn.removeAttribute("aria-busy");
  }

  function setSectionLoading(sectionId) {
    var body = $("#" + sectionId + " .section-body");
    body.innerHTML = "<p class='section-loading' aria-busy='true'>Loading\u2026</p>";
  }

  function setSectionError(sectionId, msg) {
    var body = $("#" + sectionId + " .section-body");
    body.innerHTML = "<p class='section-error'>" + esc(msg) + "</p>";
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function phoneLink(phone) {
    return '<a href="tel:' + esc(phone) + '">' + esc(phone) + "</a>";
  }

  // ── Card builder ──────────────────────────────────────────────────────────

  // Creates a self-contained card element.
  // info: { name, subtitle, primaryPhone, dcLabel, dcAddress,
  //         districtPhone, districtAddress, website, contactForm, email }
  // initOffices: array of { phone, address, suite, building, city, state, zip }
  //   used for federal reps' district offices (can be updated later via card.setSecondaryOffices)
  function makeCard(info, initOffices) {
    var el = document.createElement("article");
    el.className = "result-card";
    el.id = "card-" + cardSeq++;

    var phoneMode = "primary";
    var primaryPhone = info.primaryPhone || null;
    var secondaryOffices = initOffices || [];

    function firstOfficeWithPhone() {
      for (var i = 0; i < secondaryOffices.length; i++) {
        if (secondaryOffices[i].phone) return secondaryOffices[i];
      }
      return null;
    }

    function renderCallArea() {
      var office = firstOfficeWithPhone();
      var phone = phoneMode === "primary"
        ? (primaryPhone || (office && office.phone))
        : (office && office.phone);
      var callBtn = el.querySelector(".call-btn");
      var callBtnText = el.querySelector(".call-btn-text");
      var copyBtn = el.querySelector(".copy-btn");
      var toggleBtn = el.querySelector(".phone-toggle");

      if (phone) {
        callBtn.href = "tel:" + phone;
        callBtnText.textContent = "Call " + phone;
        callBtn.hidden = false;
        copyBtn.hidden = false;
      } else {
        callBtn.hidden = true;
        copyBtn.hidden = true;
      }

      if (primaryPhone && office) {
        toggleBtn.hidden = false;
        if (phoneMode === "primary") {
          var loc = (office.city && office.state) ? office.city + ", " + office.state : "local office";
          toggleBtn.textContent = "Switch to local office (" + loc + ", not recommended)";
        } else {
          toggleBtn.textContent = "Switch to DC office";
        }
      } else {
        toggleBtn.hidden = true;
      }
    }

    function buildMoreInfoHTML() {
      var html = "";

      var links = [];
      if (info.website) links.push('<a href="' + esc(info.website) + '" target="_blank" rel="noopener noreferrer">Website</a>');
      if (info.contactForm) links.push('<a href="' + esc(info.contactForm) + '" target="_blank" rel="noopener noreferrer">Contact form</a>');
      if (info.email) links.push('<a href="mailto:' + esc(info.email) + '">' + esc(info.email) + "</a>");
      if (links.length) html += "<p>" + links.join(" \xb7 ") + "</p>";

      // Primary (DC / Capitol) office
      if (info.dcAddress || primaryPhone) {
        html += "<h4>" + esc(info.dcLabel || "DC Office") + "</h4><p>";
        if (info.dcAddress) html += esc(info.dcAddress);
        if (primaryPhone) {
          if (info.dcAddress) html += "<br>";
          html += phoneLink(primaryPhone);
        }
        html += "</p>";
      }

      // Federal district offices (loaded async)
      if (secondaryOffices.length) {
        html += "<h4>" + (secondaryOffices.length > 1 ? "Local Offices" : "Local Office") + "</h4>";
        for (var i = 0; i < secondaryOffices.length; i++) {
          var o = secondaryOffices[i];
          var parts = [o.address, o.suite, o.building];
          var cityLine = "";
          if (o.city || o.state) {
            cityLine = (o.city || "") + (o.city && o.state ? ", " : "") + (o.state || "") + (o.zip ? " " + o.zip : "");
          }
          if (cityLine) parts.push(cityLine);
          html += "<p>" + esc(parts.filter(Boolean).join(", "));
          if (o.phone) html += "<br>" + phoneLink(o.phone);
          html += "</p>";
        }
      } else if (info.districtAddress || info.districtPhone) {
        // State legislators: single district office
        html += "<h4>District Office</h4><p>";
        if (info.districtAddress) html += esc(info.districtAddress);
        if (info.districtPhone) {
          if (info.districtAddress) html += "<br>";
          html += phoneLink(info.districtPhone);
        }
        html += "</p>";
      }

      return html;
    }

    var PHONE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>';

    el.innerHTML =
      "<header>" +
        '<h4 class="card-name">' + esc(info.name) + "</h4>" +
        '<p class="card-subtitle">' + esc(info.subtitle) + "</p>" +
      "</header>" +
      '<div class="actions">' +
        '<a class="call-btn call-button" role="button" hidden>' +
          PHONE_SVG + '<span class="call-btn-text">Call</span>' +
        "</a>" +
        '<button class="copy-btn" type="button" hidden>Copy Number</button>' +
        '<button class="phone-toggle" type="button" hidden>Switch to local office</button>' +
      "</div>" +
      '<details class="more-info">' +
        "<summary>More info</summary>" +
        '<div class="more-info-content">' + buildMoreInfoHTML() + "</div>" +
      "</details>";

    var copyBtn = el.querySelector(".copy-btn");
    var toggleBtn = el.querySelector(".phone-toggle");

    copyBtn.addEventListener("click", function () {
      var office = firstOfficeWithPhone();
      var phone = phoneMode === "primary"
        ? (primaryPhone || (office && office.phone))
        : (office && office.phone);
      if (!phone) return;
      navigator.clipboard.writeText(phone).then(function () {
        copyBtn.textContent = "Copied!";
        setTimeout(function () { copyBtn.textContent = "Copy Number"; }, 1500);
      });
    });

    toggleBtn.addEventListener("click", function () {
      phoneMode = phoneMode === "primary" ? "secondary" : "primary";
      renderCallArea();
    });

    renderCallArea();

    return {
      el: el,
      setSecondaryOffices: function (offices) {
        secondaryOffices = offices;
        renderCallArea();
        el.querySelector(".more-info-content").innerHTML = buildMoreInfoHTML();
      },
    };
  }

  // ── Section renderers ─────────────────────────────────────────────────────

  function renderHouseRep(rep) {
    var body = $("#usrep .section-body");
    body.innerHTML = "";
    var districtLabel = rep.district === 0 ? "At-Large" : "District " + rep.district;
    var card = makeCard({
      name: rep.name,
      subtitle: rep.party + " \u2014 " + rep.state + " " + districtLabel,
      primaryPhone: rep.phone,
      dcLabel: "DC Office",
      dcAddress: rep.dcAddress,
      website: rep.website,
      contactForm: rep.contactForm,
    });
    body.appendChild(card.el);

    Legislators.findDistrictOffices(rep.bioguide).then(function (offices) {
      card.setSecondaryOffices(offices);
    });
  }

  function renderSenators(senators) {
    var body = $("#senators .section-body");
    body.innerHTML = "";
    if (!senators.length) {
      body.innerHTML = "<p class='section-error'>No senators found for this state.</p>";
      return;
    }
    senators.forEach(function (sen) {
      var rank = sen.rank
        ? sen.rank.charAt(0).toUpperCase() + sen.rank.slice(1) + " Senator"
        : "Senator";
      var card = makeCard({
        name: sen.name,
        subtitle: sen.party + " \u2014 " + rank + ", " + sen.state,
        primaryPhone: sen.phone,
        dcLabel: "DC Office",
        dcAddress: sen.dcAddress,
        website: sen.website,
        contactForm: sen.contactForm,
      });
      body.appendChild(card.el);

      Legislators.findDistrictOffices(sen.bioguide).then(function (offices) {
        card.setSecondaryOffices(offices);
      });
    });
  }

  function renderStateCard(body, leg, title) {
    if (!leg) {
      body.insertAdjacentHTML("beforeend",
        "<p class='section-error'>No " + esc(title) + " data found for this district.</p>");
      return;
    }
    var districtLabel = leg.district === 0 ? "At-Large" : "District " + leg.district;
    var localOffice = leg.district_phone
      ? [{ phone: leg.district_phone, address: leg.district_address }]
      : [];
    var card = makeCard({
      name: leg.name,
      subtitle: leg.party + " \u2014 " + title + ", " + districtLabel,
      primaryPhone: leg.phone || null,
      dcLabel: "Capitol Office",
      dcAddress: leg.address || null,
      districtPhone: leg.district_phone || null,
      districtAddress: leg.district_address || null,
      website: leg.website || null,
      email: leg.email || null,
    }, localOffice);
    body.appendChild(card.el);
  }

  function renderStateLegislators(result, stateAbbr) {
    var body = $("#stateleg .section-body");
    body.innerHTML = "";
    if (!result.upper && !result.lower) {
      body.innerHTML = "<p class='section-error'>No state legislator data found for this address.</p>";
      return;
    }
    renderStateCard(body, result.upper, "State Senator");
    renderStateCard(body, result.lower, "State Representative");
  }

  // ── Hash navigation ───────────────────────────────────────────────────────

  var SECTION_IDS = ["usrep", "senators", "stateleg"];

  function openAndScrollTo(target) {
    // If navigating to a top-level section, close the others
    if (SECTION_IDS.indexOf(target.id) !== -1) {
      SECTION_IDS.forEach(function (id) {
        var s = document.getElementById(id);
        if (s) {
          var d = s.querySelector(".section-details");
          if (d) d.open = (s === target);
        }
      });
    } else {
      // Fallback: just open whatever details wraps the target
      var details = target.querySelector(".section-details");
      if (details) details.open = true;
    }
    setTimeout(function () {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function scrollToHash() {
    var hash = window.location.hash;
    if (!hash) return;
    var target = document.querySelector(hash);
    if (target) openAndScrollTo(target);
  }

  // ── Main lookup flow ──────────────────────────────────────────────────────

  function runLookup(geo) {
    var stateAbbr = Legislators.fipsToState(geo.stateFips);
    if (!stateAbbr) {
      showError("Could not determine state from this location.");
      return;
    }

    var isTerritory = stateAbbr in TERRITORY_STATES;
    var noStateLeg = stateAbbr in NO_STATE_LEG;

    showResults();
    setSectionLoading("usrep");

    if (isTerritory) {
      setSectionError("senators", "U.S. territories do not have senators.");
    } else {
      setSectionLoading("senators");
    }

    if (noStateLeg) {
      setSectionError("stateleg", "Local legislature data is not available for U.S. territories.");
    } else {
      setSectionLoading("stateleg");
    }

    var repPromise = Legislators.findRepresentative(stateAbbr, geo.district)
      .then(renderHouseRep)
      .catch(function (err) { setSectionError("usrep", err.message); });

    var senatorsPromise = isTerritory
      ? Promise.resolve()
      : Legislators.findSenators(stateAbbr)
          .then(renderSenators)
          .catch(function (err) { setSectionError("senators", err.message); });

    var statePromise = noStateLeg
      ? Promise.resolve()
      : StateLegislators.findStateLegislators(stateAbbr, geo.sldu, geo.sldl)
          .then(function (result) { renderStateLegislators(result, stateAbbr); })
          .catch(function (err) { setSectionError("stateleg", err.message); });

    Promise.allSettled([repPromise, senatorsPromise, statePromise]).then(scrollToHash);
  }

  function lookupByCoordinates() {
    showLoading();
    new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 300000,
      });
    })
      .then(function (pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        var terFips = detectTerritoryFipsByCoords(lat, lon);
        if (terFips) {
          return { stateFips: terFips, district: '00', sldu: null, sldl: null };
        }
        return Geocoder.geocodeCoordinates(lat, lon);
      })
      .then(runLookup)
      .catch(function (err) {
        if (err.code === 1) {
          showError("Location access denied. Please type your address instead.");
        } else if (err.code === 2) {
          showError("Location unavailable. Please type your address instead.");
        } else if (err.code === 3) {
          showError("Location request timed out. Please type your address instead.");
        } else {
          showError(err.message);
        }
      });
  }

  function lookupByAddress(address) {
    showLoading();
    var terFips = detectTerritoryFips(address);
    if (terFips) {
      runLookup({ stateFips: terFips, district: '00', sldu: null, sldl: null });
      return;
    }
    Geocoder.geocodeAddress(address)
      .then(runLookup)
      .catch(function (err) { showError(err.message); });
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  geolocateBtn.addEventListener("click", function () {
    lastAction = lookupByCoordinates;
    lookupByCoordinates();
  });

  addressForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var address = addressInput.value.trim();
    if (!address) return;
    lastAction = function () { lookupByAddress(address); };
    lookupByAddress(address);
  });

  retryBtn.addEventListener("click", function () {
    if (lastAction) lastAction();
  });

  // Nav links: open collapsed sections before scrolling
  document.querySelectorAll(".results-nav a").forEach(function (link) {
    link.addEventListener("click", function (e) {
      var hash = link.getAttribute("href");
      var target = hash && document.querySelector(hash);
      if (target) {
        e.preventDefault();
        history.pushState(null, "", hash);
        openAndScrollTo(target);
      }
    });
  });
})();

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
  var repName = $("#rep-name");
  var repDetails = $("#rep-details");
  var callBtn = $("#call-btn");
  var callBtnText = $("#call-btn-text");
  var copyPhoneBtn = $("#copy-phone-btn");
  var phoneToggle = $("#phone-toggle");
  var repWebsite = $("#rep-website");
  var repContact = $("#rep-contact");

  var lastAction = null;

  // Phone toggle state
  var currentPhoneMode = "dc"; // "dc" or "local"
  var dcPhone = null;
  var localOffices = [];

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

  function setPhone(phone, label) {
    if (phone) {
      callBtn.href = "tel:" + phone;
      callBtnText.textContent = "Call " + phone;
      if (label) {
        callBtnText.textContent += " (" + label + ")";
      }
      callBtn.hidden = false;
      copyPhoneBtn.hidden = false;
      copyPhoneBtn.onclick = function () {
        navigator.clipboard.writeText(phone).then(function () {
          copyPhoneBtn.textContent = "Copied!";
          setTimeout(function () { copyPhoneBtn.textContent = "Copy Number"; }, 1500);
        });
      };
    } else {
      callBtn.hidden = true;
      copyPhoneBtn.hidden = true;
    }
  }

  function updatePhoneDisplay() {
    if (currentPhoneMode === "dc") {
      setPhone(dcPhone, "DC");
      if (localOffices.length > 0) {
        var office = localOffices[0];
        phoneToggle.textContent = "Switch to local office (" + office.city + ", " + office.state + ")";
        phoneToggle.hidden = false;
      } else {
        phoneToggle.hidden = true;
      }
    } else {
      var office = localOffices[0];
      setPhone(office.phone, office.city + ", " + office.state);
      phoneToggle.textContent = "Switch to DC office";
      phoneToggle.hidden = false;
    }
  }

  function showResults(rep) {
    statusSection.hidden = true;
    resultsSection.hidden = false;
    geolocateBtn.removeAttribute("aria-busy");

    repName.textContent = rep.name;
    var districtLabel = rep.district === 0 ? "At-Large" : "District " + rep.district;
    repDetails.textContent = rep.party + " — " + rep.state + " " + districtLabel;

    // Reset phone state
    currentPhoneMode = "dc";
    dcPhone = rep.phone;
    localOffices = [];

    // Show DC phone immediately
    setPhone(dcPhone, null);
    phoneToggle.hidden = true;

    // Fetch district offices in background for toggle
    Legislators.findDistrictOffices(rep.bioguide).then(function (offices) {
      localOffices = offices;
      if (offices.length > 0 && dcPhone) {
        // Show toggle only if we have both DC and local phones
        var office = offices[0];
        phoneToggle.textContent = "Switch to local office (" + office.city + ", " + office.state + ")";
        phoneToggle.hidden = false;
      }
    });

    if (rep.website) {
      repWebsite.href = rep.website;
      repWebsite.hidden = false;
    } else {
      repWebsite.hidden = true;
    }

    if (rep.contactForm) {
      repContact.href = rep.contactForm;
      repContact.hidden = false;
    } else {
      repContact.hidden = true;
    }
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
        return Geocoder.geocodeCoordinates(pos.coords.latitude, pos.coords.longitude);
      })
      .then(function (result) {
        var stateAbbr = Legislators.fipsToState(result.stateFips);
        if (!stateAbbr) throw new Error("Could not determine state from location.");
        return Legislators.findRepresentative(stateAbbr, result.district);
      })
      .then(showResults)
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
    Geocoder.geocodeAddress(address)
      .then(function (result) {
        var stateAbbr = Legislators.fipsToState(result.stateFips);
        if (!stateAbbr) throw new Error("Could not determine state from address.");
        return Legislators.findRepresentative(stateAbbr, result.district);
      })
      .then(showResults)
      .catch(function (err) {
        showError(err.message);
      });
  }

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

  phoneToggle.addEventListener("click", function () {
    currentPhoneMode = currentPhoneMode === "dc" ? "local" : "dc";
    updatePhoneDisplay();
  });
})();

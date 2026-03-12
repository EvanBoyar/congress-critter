// ── Minimal test harness (no dependencies) ──────────────────────────────
var Harness = (function () {
  var logEl = document.getElementById("log");
  var passed = 0, failed = 0;
  var suites = [];

  function log(msg, cls) {
    var p = document.createElement("div");
    p.className = cls || "";
    p.textContent = msg;
    logEl.appendChild(p);
  }

  function group(name) { log("\u25b8 " + name, "group"); }

  function assert(condition, label) {
    if (condition) {
      passed++;
      log("  PASS: " + label, "pass");
    } else {
      failed++;
      log("  FAIL: " + label, "fail");
    }
  }

  function assertEqual(actual, expected, label) {
    var ok = actual === expected;
    assert(ok, label + (ok ? "" : ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')'));
  }

  function assertIncludes(haystack, needle, label) {
    assert(
      typeof haystack === "string" && haystack.indexOf(needle) !== -1,
      label + ' (expected "' + needle + '" in "' + haystack + '")'
    );
  }

  function assertNotIncludes(haystack, needle, label) {
    assert(
      typeof haystack !== "string" || haystack.indexOf(needle) === -1,
      label + ' (did NOT expect "' + needle + '" in "' + haystack + '")'
    );
  }

  function tick(ms) {
    return new Promise(function (r) { setTimeout(r, ms || 50); });
  }

  // DOM helpers
  function $(sel) { return document.querySelector(sel); }

  function register(name, fn) {
    suites.push({ name: name, fn: fn });
  }

  function runAll() {
    var chain = Promise.resolve();
    suites.forEach(function (s) {
      chain = chain.then(function () {
        log("", "");
        log("=== " + s.name + " ===", "group");
        return s.fn();
      });
    });
    chain.then(function () {
      var summaryEl = document.getElementById("summary");
      var total = passed + failed;
      summaryEl.innerHTML = "<strong>" + passed + "/" + total + " passed</strong>" +
        (failed ? '  <span class="fail">(' + failed + " failed)</span>" : '  <span class="pass">All passed!</span>');
      console.log(passed + "/" + total + " tests passed" + (failed ? ", " + failed + " FAILED" : ""));
    }).catch(function (err) {
      log("TEST RUNNER ERROR: " + err.message + "\n" + err.stack, "fail");
      console.error(err);
    });
  }

  // ── Centralized fetch mock ──────────────────────────────────────────
  // All test files use Harness.mockFetch / Harness.clearFetchMock instead
  // of overriding window.fetch themselves. This prevents clobbering.
  var origFetch = window.fetch;
  var fetchMockFn = null;

  window.fetch = function (url, opts) {
    if (fetchMockFn) return fetchMockFn(url, opts);
    return origFetch.call(window, url, opts);
  };

  function mockFetch(fn) { fetchMockFn = fn; }
  function clearFetchMock() { fetchMockFn = null; }

  return {
    group: group,
    assert: assert,
    assertEqual: assertEqual,
    assertIncludes: assertIncludes,
    assertNotIncludes: assertNotIncludes,
    tick: tick,
    $: $,
    register: register,
    runAll: runAll,
    mockFetch: mockFetch,
    clearFetchMock: clearFetchMock,
  };
})();

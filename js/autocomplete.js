var Autocomplete = (function () {
  var PHOTON_URL = "https://photon.komoot.io/api/";
  var DEBOUNCE_MS = 300;
  var MIN_CHARS = 3;
  var MAX_RESULTS = 5;
  // US bounding box: covers CONUS, AK, HI, territories
  var US_BBOX = "-180,17,-64,72";

  function formatResult(props) {
    var parts = [];
    if (props.housenumber && props.street) {
      parts.push(props.housenumber + " " + props.street);
    } else if (props.street) {
      parts.push(props.street);
    } else if (props.name) {
      parts.push(props.name);
    }
    if (props.city) parts.push(props.city);
    if (props.state) parts.push(props.state);
    if (props.postcode) parts.push(props.postcode);
    return parts.join(", ");
  }

  function attach(input) {
    var list = document.createElement("ul");
    list.className = "autocomplete-list";
    list.setAttribute("role", "listbox");
    list.hidden = true;

    // Wrap input in a relative container for positioning
    var wrapper = document.createElement("div");
    wrapper.className = "autocomplete-wrapper";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(list);

    var timer = null;
    var activeIndex = -1;
    var items = [];

    function close() {
      list.hidden = true;
      list.innerHTML = "";
      items = [];
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
    }

    function highlight(idx) {
      items.forEach(function (li, i) {
        li.classList.toggle("autocomplete-item--active", i === idx);
        li.setAttribute("aria-selected", i === idx ? "true" : "false");
      });
      activeIndex = idx;
      if (idx >= 0 && items[idx]) {
        input.setAttribute("aria-activedescendant", items[idx].id);
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function select(text) {
      input.value = text;
      close();
      input.focus();
    }

    function render(results) {
      list.innerHTML = "";
      items = [];
      activeIndex = -1;

      if (!results.length) {
        close();
        return;
      }

      results.forEach(function (text, i) {
        var li = document.createElement("li");
        li.className = "autocomplete-item";
        li.id = "ac-item-" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.textContent = text;
        li.addEventListener("mousedown", function (e) {
          e.preventDefault(); // prevent blur before click fires
          select(text);
        });
        li.addEventListener("mouseenter", function () {
          highlight(i);
        });
        list.appendChild(li);
        items.push(li);
      });

      list.hidden = false;
    }

    function fetchSuggestions(query) {
      var url = PHOTON_URL +
        "?q=" + encodeURIComponent(query) +
        "&limit=" + MAX_RESULTS +
        "&lang=en" +
        "&layer=house&layer=street" +
        "&bbox=" + US_BBOX;

      return fetch(url, { headers: { "Accept": "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.features) return [];
          var seen = {};
          var results = [];
          for (var i = 0; i < data.features.length; i++) {
            var text = formatResult(data.features[i].properties);
            if (text && !seen[text]) {
              seen[text] = true;
              results.push(text);
            }
          }
          return results;
        })
        .catch(function () { return []; });
    }

    input.addEventListener("input", function () {
      clearTimeout(timer);
      var val = input.value.trim();
      if (val.length < MIN_CHARS) {
        close();
        return;
      }
      timer = setTimeout(function () {
        fetchSuggestions(val).then(render);
      }, DEBOUNCE_MS);
    });

    input.addEventListener("keydown", function (e) {
      if (list.hidden || !items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlight(activeIndex < items.length - 1 ? activeIndex + 1 : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlight(activeIndex > 0 ? activeIndex - 1 : items.length - 1);
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        select(items[activeIndex].textContent);
      } else if (e.key === "Escape") {
        close();
      }
    });

    input.addEventListener("blur", function () {
      // Small delay so mousedown on list items fires first
      setTimeout(close, 150);
    });

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", "autocomplete-listbox");
    list.id = "autocomplete-listbox";

    // Keep aria-expanded in sync
    var origHiddenProp = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden");
    var observer = new MutationObserver(function () {
      input.setAttribute("aria-expanded", list.hidden ? "false" : "true");
    });
    observer.observe(list, { attributes: true, attributeFilter: ["hidden"] });
  }

  return { attach: attach };
})();
